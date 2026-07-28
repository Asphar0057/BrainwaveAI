import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import models
from database import get_db
from deps import (
    call_ai,
    enforce_request_user_scope,
    get_current_user,
    get_user_by_email,
    get_user_by_username,
    verify_token,
)

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api",
    tags=["weakness"],
    dependencies=[Depends(enforce_request_user_scope)],
)

def _resolve_user_id(db: Session, user_id: str) -> int | None:
    """Accepts either a numeric id or a username/email, matching the
    convention routes/analytics.py already uses for study_insights -- the
    web frontend only ever has a username in localStorage (no numeric id
    is ever stored there), so a strict `int` param would 404/500 on every
    call from the web app."""
    try:
        return int(user_id)
    except (TypeError, ValueError):
        pass
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    return user.id if user else None

def _get_topic_mastery(db: Session, user_id: int) -> list[dict]:
    records = db.query(models.TopicMastery).filter(
        models.TopicMastery.user_id == user_id
    ).all()
    result = []
    for r in records:
        accuracy = (r.correct_answers / r.questions_asked * 100) if r.questions_asked > 0 else 0.0
        result.append({
            "topic": r.topic_name,
            "mastery_level": r.mastery_level,
            "confidence_level": r.confidence_level,
            "times_studied": r.times_studied,
            "questions_asked": r.questions_asked,
            "correct_answers": r.correct_answers,
            "accuracy": round(accuracy, 2),
            "last_practiced": r.last_practiced.isoformat() if r.last_practiced else None,
            "struggles_with": r.struggles_with or [],
            "excels_at": r.excels_at or [],
        })
    return result

def _identify_weaknesses(topic_records: list[dict]) -> list[dict]:
    weaknesses = [t for t in topic_records if t["mastery_level"] < 0.5 or t["accuracy"] < 60]
    return sorted(weaknesses, key=lambda x: x["mastery_level"])

def _generate_question_for_topic(topic: str, difficulty: str, db: Session) -> dict:
    existing = db.query(models.GeneratedQuestion).filter(
        models.GeneratedQuestion.topic == topic,
        models.GeneratedQuestion.difficulty == difficulty,
    ).order_by(models.GeneratedQuestion.times_used.asc()).first()

    if existing:
        existing.times_used += 1
        db.commit()
        options = json.loads(existing.options) if existing.options else []
        hints = json.loads(existing.hints) if existing.hints else []
        return {
            "question_id": str(existing.id),
            "topic": existing.topic,
            "subtopic": existing.subtopic,
            "question_text": existing.question_text,
            "question_type": existing.question_type,
            "options": options,
            "correct_answer": existing.correct_answer,
            "explanation": existing.explanation,
            "hints": hints,
            "difficulty": existing.difficulty,
        }

    prompt = (
        f"Generate a {difficulty} difficulty practice question for the topic: '{topic}'.\n"
        "Respond ONLY with a JSON object in this exact format:\n"
        "{\n"
        '  "question_text": "...",\n'
        '  "question_type": "multiple_choice",\n'
        '  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],\n'
        '  "correct_answer": "A) ...",\n'
        '  "explanation": "...",\n'
        '  "hints": ["hint1", "hint2"],\n'
        '  "subtopic": "..."\n'
        "}"
    )
    raw = call_ai(prompt, max_tokens=600, temperature=0.7)
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        data = json.loads(raw[start:end])
        from services.math_processor import process_math_in_json
        data = process_math_in_json(data)
    except (json.JSONDecodeError, ValueError):
        data = {
            "question_text": f"Explain a key concept in {topic}.",
            "question_type": "short_answer",
            "options": [],
            "correct_answer": "Varies",
            "explanation": "Review your study materials for this topic.",
            "hints": [],
            "subtopic": topic,
        }

    new_q = models.GeneratedQuestion(
        topic=topic,
        subtopic=data.get("subtopic", ""),
        question_text=data["question_text"],
        question_type=data.get("question_type", "short_answer"),
        options=json.dumps(data.get("options", [])),
        correct_answer=data.get("correct_answer", ""),
        explanation=data.get("explanation", ""),
        hints=json.dumps(data.get("hints", [])),
        difficulty=difficulty,
        times_used=1,
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)

    return {
        "question_id": str(new_q.id),
        "topic": new_q.topic,
        "subtopic": new_q.subtopic,
        "question_text": new_q.question_text,
        "question_type": new_q.question_type,
        "options": data.get("options", []),
        "correct_answer": new_q.correct_answer,
        "explanation": new_q.explanation,
        "hints": data.get("hints", []),
        "difficulty": new_q.difficulty,
    }

def _evaluate_answer(question: dict, user_answer: str) -> tuple[bool, str]:
    correct_answer = question.get("correct_answer", "")
    question_type = question.get("question_type", "short_answer")

    if question_type in ("multiple_choice", "true_false"):
        is_correct = user_answer.strip().lower() == correct_answer.strip().lower()
        feedback = (
            f"Correct! {question.get('explanation', '')}"
            if is_correct
            else f"Incorrect. The correct answer is: {correct_answer}. {question.get('explanation', '')}"
        )
        return is_correct, feedback

    prompt = (
        f"Question: {question.get('question_text', '')}\n"
        f"Correct answer: {correct_answer}\n"
        f"User answer: {user_answer}\n\n"
        "Is the user's answer correct or substantially correct? "
        "Respond with JSON: {\"is_correct\": true/false, \"feedback\": \"brief explanation\"}"
    )
    raw = call_ai(prompt, max_tokens=200, temperature=0.3)
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        data = json.loads(raw[start:end])
        from services.math_processor import process_math_in_response
        return bool(data.get("is_correct", False)), process_math_in_response(data.get("feedback", ""))
    except (json.JSONDecodeError, ValueError):
        is_correct = user_answer.strip().lower() in correct_answer.strip().lower()
        return is_correct, f"Expected: {correct_answer}"

@router.get("/weakness-practice/analysis")
async def get_weakness_analysis(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        uid = int(user_id)
        topic_records = _get_topic_mastery(db, uid)
        weaknesses = _identify_weaknesses(topic_records)

        sessions = db.query(models.PracticeSession).filter(
            models.PracticeSession.user_id == uid
        ).order_by(models.PracticeSession.started_at.desc()).limit(20).all()

        recent_sessions = [
            {
                "session_id": s.id,
                "topic": s.topic,
                "difficulty": s.difficulty,
                "questions_answered": s.questions_answered,
                "correct_answers": s.correct_answers,
                "accuracy": round(s.accuracy * 100, 2),
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "status": s.status,
            }
            for s in sessions
        ]

        overall_accuracy = 0.0
        if topic_records:
            total_q = sum(t["questions_asked"] for t in topic_records)
            total_c = sum(t["correct_answers"] for t in topic_records)
            overall_accuracy = round((total_c / total_q * 100) if total_q > 0 else 0.0, 2)

        return JSONResponse(content={
            "status": "success",
            "user_id": uid,
            "topic_mastery": topic_records,
            "weaknesses": weaknesses,
            "recent_sessions": recent_sessions,
            "overall_accuracy": overall_accuracy,
            "total_topics_studied": len(topic_records),
            "topics_needing_practice": len(weaknesses),
        })
    except Exception as e:
        logger.error(f"Error in weakness analysis: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": str(e)})

@router.post("/weakness-practice/start-session")
async def start_weakness_practice_session(
    user_id: int = Body(...),
    topic: str = Body(...),
    difficulty: str = Body(default="intermediate"),
    question_count: int = Body(default=10),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        session = models.PracticeSession(
            user_id=user_id,
            topic=topic,
            difficulty=difficulty,
            target_question_count=question_count,
            started_at=datetime.now(timezone.utc),
            status="active",
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        first_question = _generate_question_for_topic(topic, difficulty, db)

        return JSONResponse(content={
            "status": "success",
            "session_id": str(session.id),
            "topic": topic,
            "difficulty": difficulty,
            "target_question_count": question_count,
            "first_question": first_question,
            "started_at": session.started_at.isoformat(),
        })
    except Exception as e:
        logger.error(f"Error starting practice session: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": str(e)})

@router.get("/weakness-practice/next-question")
async def get_next_practice_question(
    session_id: str = Query(...),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        session = db.query(models.PracticeSession).filter(
            models.PracticeSession.id == int(session_id)
        ).first()

        if not session:
            return JSONResponse(status_code=404, content={"status": "error", "error": "Session not found"})

        if session.status != "active":
            return JSONResponse(content={
                "status": "session_complete",
                "message": "Session has already ended",
                "questions_answered": session.questions_answered,
                "correct_answers": session.correct_answers,
            })

        if session.questions_answered >= session.target_question_count:
            return JSONResponse(content={
                "status": "session_complete",
                "message": "All questions answered",
                "questions_answered": session.questions_answered,
                "correct_answers": session.correct_answers,
            })

        question = _generate_question_for_topic(session.topic, session.difficulty, db)
        questions_remaining = session.target_question_count - session.questions_answered

        return JSONResponse(content={
            "status": "success",
            "question": question,
            "question_number": session.questions_answered + 1,
            "questions_remaining": questions_remaining,
            "total_questions": session.target_question_count,
        })
    except Exception as e:
        logger.error(f"Error getting next question: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": str(e)})

@router.post("/weakness-practice/submit-answer")
async def submit_practice_answer(
    session_id: str = Body(...),
    question_id: str = Body(...),
    user_answer: str = Body(...),
    time_taken: int = Body(...),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        session = db.query(models.PracticeSession).filter(
            models.PracticeSession.id == int(session_id)
        ).first()

        if not session:
            return JSONResponse(status_code=404, content={"status": "error", "error": "Session not found"})

        generated_q = db.query(models.GeneratedQuestion).filter(
            models.GeneratedQuestion.id == int(question_id)
        ).first()

        if not generated_q:
            return JSONResponse(status_code=404, content={"status": "error", "error": "Question not found"})

        question_dict = {
            "question_text": generated_q.question_text,
            "question_type": generated_q.question_type,
            "correct_answer": generated_q.correct_answer,
            "explanation": generated_q.explanation,
            "options": json.loads(generated_q.options) if generated_q.options else [],
        }

        is_correct, feedback = _evaluate_answer(question_dict, user_answer)

        answer = models.PracticeAnswer(
            session_id=session.id,
            question_text=generated_q.question_text,
            user_answer=user_answer,
            correct_answer=generated_q.correct_answer,
            is_correct=is_correct,
            time_taken=time_taken,
            answered_at=datetime.now(timezone.utc),
        )
        db.add(answer)

        session.questions_answered += 1
        if is_correct:
            session.correct_answers += 1
        session.accuracy = session.correct_answers / session.questions_answered

        total_time = session.avg_response_time * (session.questions_answered - 1) + time_taken
        session.avg_response_time = total_time / session.questions_answered

        mastery = db.query(models.TopicMastery).filter(
            models.TopicMastery.user_id == session.user_id,
            models.TopicMastery.topic_name == session.topic,
        ).first()

        if mastery:
            mastery.questions_asked += 1
            if is_correct:
                mastery.correct_answers += 1
            mastery.last_practiced = datetime.now(timezone.utc)
            accuracy = mastery.correct_answers / mastery.questions_asked
            mastery.mastery_level = min(1.0, mastery.mastery_level * 0.9 + accuracy * 0.1)
            mastery.confidence_level = accuracy
        else:
            mastery = models.TopicMastery(
                user_id=session.user_id,
                topic_name=session.topic,
                questions_asked=1,
                correct_answers=1 if is_correct else 0,
                mastery_level=0.1 if is_correct else 0.0,
                confidence_level=1.0 if is_correct else 0.0,
                last_practiced=datetime.now(timezone.utc),
            )
            db.add(mastery)

        db.commit()

        session_complete = session.questions_answered >= session.target_question_count

        return JSONResponse(content={
            "status": "success",
            "is_correct": is_correct,
            "feedback": feedback,
            "correct_answer": generated_q.correct_answer,
            "explanation": generated_q.explanation,
            "questions_answered": session.questions_answered,
            "correct_answers": session.correct_answers,
            "session_accuracy": round(session.accuracy * 100, 2),
            "session_complete": session_complete,
        })
    except Exception as e:
        logger.error(f"Error submitting answer: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": str(e)})

@router.post("/weakness-practice/end-session")
async def end_weakness_practice_session(
    session_id: str = Body(...),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        session = db.query(models.PracticeSession).filter(
            models.PracticeSession.id == int(session_id)
        ).first()

        if not session:
            return JSONResponse(status_code=404, content={"status": "error", "error": "Session not found"})

        session.status = "completed"
        session.completed_at = datetime.now(timezone.utc)

        answers = db.query(models.PracticeAnswer).filter(
            models.PracticeAnswer.session_id == session.id
        ).all()

        streak = 0
        max_streak = 0
        for ans in answers:
            if ans.is_correct:
                streak += 1
                max_streak = max(max_streak, streak)
            else:
                streak = 0

        session.max_streak = max_streak

        duration_seconds = (
            (session.completed_at - session.started_at).total_seconds()
            if session.started_at
            else 0
        )

        db.commit()

        performance_label = "excellent" if session.accuracy >= 0.8 else (
            "good" if session.accuracy >= 0.6 else "needs_improvement"
        )

        return JSONResponse(content={
            "status": "success",
            "session_id": session_id,
            "topic": session.topic,
            "difficulty": session.difficulty,
            "questions_answered": session.questions_answered,
            "correct_answers": session.correct_answers,
            "accuracy": round(session.accuracy * 100, 2),
            "max_streak": max_streak,
            "avg_response_time": round(session.avg_response_time, 2),
            "duration_seconds": int(duration_seconds),
            "performance": performance_label,
            "completed_at": session.completed_at.isoformat(),
        })
    except Exception as e:
        logger.error(f"Error ending practice session: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": str(e)})

@router.get("/weakness-practice/mastery-overview")
async def get_mastery_overview(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        uid = _resolve_user_id(db, user_id)
        if uid is None:
            raise HTTPException(status_code=404, detail="User not found")

        topic_records = _get_topic_mastery(db, uid)

        mastered = [t for t in topic_records if t["mastery_level"] >= 0.8]
        progressing = [t for t in topic_records if 0.5 <= t["mastery_level"] < 0.8]
        needs_work = [t for t in topic_records if t["mastery_level"] < 0.5]

        overall_mastery = (
            sum(t["mastery_level"] for t in topic_records) / len(topic_records)
            if topic_records
            else 0.0
        )

        total_sessions = db.query(models.PracticeSession).filter(
            models.PracticeSession.user_id == uid,
            models.PracticeSession.status == "completed",
        ).count()

        return JSONResponse(content={
            "status": "success",
            "user_id": uid,
            "overall_mastery": round(overall_mastery * 100, 2),
            "total_topics": len(topic_records),
            "mastered_topics": len(mastered),
            "progressing_topics": len(progressing),
            "needs_work_topics": len(needs_work),
            "total_completed_sessions": total_sessions,
            "topic_breakdown": {
                "mastered": mastered,
                "progressing": progressing,
                "needs_work": needs_work,
            },
        })
    except Exception as e:
        logger.error(f"Error getting mastery overview: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": str(e)})

@router.get("/weakness-practice/weekly-progress")
async def get_weekly_progress(
    user_id: int = Query(...),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        today = datetime.now(timezone.utc).date()
        week_start = today - timedelta(days=6)

        daily_metrics = db.query(models.DailyLearningMetrics).filter(
            models.DailyLearningMetrics.user_id == user_id,
            models.DailyLearningMetrics.date >= week_start,
            models.DailyLearningMetrics.date <= today,
        ).order_by(models.DailyLearningMetrics.date.asc()).all()

        daily_data = {}
        for m in daily_metrics:
            day_str = m.date.isoformat()
            daily_data[day_str] = {
                "date": day_str,
                "sessions_completed": m.sessions_completed,
                "questions_answered": m.questions_answered,
                "correct_answers": m.correct_answers,
                "accuracy_rate": round(m.accuracy_rate * 100, 2),
                "time_spent_minutes": m.time_spent_minutes,
            }

        week_days = []
        for i in range(7):
            day = (week_start + timedelta(days=i)).isoformat()
            week_days.append(daily_data.get(day, {
                "date": day,
                "sessions_completed": 0,
                "questions_answered": 0,
                "correct_answers": 0,
                "accuracy_rate": 0.0,
                "time_spent_minutes": 0.0,
            }))

        total_questions = sum(d["questions_answered"] for d in week_days)
        total_correct = sum(d["correct_answers"] for d in week_days)
        total_sessions = sum(d["sessions_completed"] for d in week_days)
        total_time = sum(d["time_spent_minutes"] for d in week_days)
        weekly_accuracy = round((total_correct / total_questions * 100) if total_questions > 0 else 0.0, 2)
        active_days = sum(1 for d in week_days if d["questions_answered"] > 0)

        return JSONResponse(content={
            "status": "success",
            "user_id": user_id,
            "week_start": week_start.isoformat(),
            "week_end": today.isoformat(),
            "daily_breakdown": week_days,
            "totals": {
                "sessions_completed": total_sessions,
                "questions_answered": total_questions,
                "correct_answers": total_correct,
                "accuracy": weekly_accuracy,
                "time_spent_minutes": round(total_time, 2),
                "active_days": active_days,
            },
        })
    except Exception as e:
        logger.error(f"Error getting weekly progress: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": str(e)})

@router.post("/weakness-practice/generate-study-plan")
async def generate_study_plan(
    user_id: int = Body(...),
    goal: str = Body(default="improve_weaknesses"),
    duration_weeks: int = Body(default=4),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        topic_records = _get_topic_mastery(db, user_id)
        weaknesses = _identify_weaknesses(topic_records)
        weak_topics = [w["topic"] for w in weaknesses[:5]]

        prompt = (
            f"Create a {duration_weeks}-week personalized study plan for a student.\n"
            f"Goal: {goal}\n"
            f"Topics needing improvement: {', '.join(weak_topics) if weak_topics else 'general review'}\n\n"
            "Respond ONLY with a JSON object:\n"
            "{\n"
            '  "plan_title": "...",\n'
            '  "weekly_schedule": [\n'
            '    {"week": 1, "focus_topics": [...], "daily_tasks": [...], "milestones": [...]},\n'
            "    ...\n"
            "  ],\n"
            '  "success_metrics": [...],\n'
            '  "recommended_resources": [...]\n'
            "}"
        )
        raw = call_ai(prompt, max_tokens=1200, temperature=0.7)

        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            plan_data = json.loads(raw[start:end])
            from services.math_processor import process_math_in_json
            plan_data = process_math_in_json(plan_data)
        except (json.JSONDecodeError, ValueError):
            plan_data = {
                "plan_title": f"{duration_weeks}-Week Study Plan",
                "weekly_schedule": [],
                "success_metrics": [],
                "recommended_resources": [],
            }

        study_plan = models.StudyPlan(
            user_id=user_id,
            goal=goal,
            duration_weeks=duration_weeks,
            plan_data=json.dumps(plan_data),
            status="active",
        )
        db.add(study_plan)
        db.commit()
        db.refresh(study_plan)

        return JSONResponse(content={
            "status": "success",
            "plan_id": study_plan.id,
            "user_id": user_id,
            "goal": goal,
            "duration_weeks": duration_weeks,
            "weak_topics_addressed": weak_topics,
            "plan": plan_data,
            "created_at": study_plan.created_at.isoformat(),
        })
    except Exception as e:
        logger.error(f"Error generating study plan: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": str(e)})

@router.get("/weakness-practice/daily-recommendations")
async def get_daily_recommendations(
    user_id: int = Query(...),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        topic_records = _get_topic_mastery(db, user_id)
        weaknesses = _identify_weaknesses(topic_records)

        today = datetime.now(timezone.utc).date()
        today_metrics = db.query(models.DailyLearningMetrics).filter(
            models.DailyLearningMetrics.user_id == user_id,
            models.DailyLearningMetrics.date == today,
        ).first()

        sessions_today = today_metrics.sessions_completed if today_metrics else 0
        time_today = today_metrics.time_spent_minutes if today_metrics else 0.0

        priority_topics = [w["topic"] for w in weaknesses[:3]]
        review_topics = [
            t["topic"] for t in topic_records
            if t["mastery_level"] >= 0.5 and t["last_practiced"]
            and (datetime.now(timezone.utc) - datetime.fromisoformat(t["last_practiced"])).days > 3
        ][:2]

        active_plan = db.query(models.StudyPlan).filter(
            models.StudyPlan.user_id == user_id,
            models.StudyPlan.status == "active",
        ).order_by(models.StudyPlan.created_at.desc()).first()

        plan_hint = None
        if active_plan:
            try:
                plan_data = json.loads(active_plan.plan_data)
                schedule = plan_data.get("weekly_schedule", [])
                if schedule:
                    plan_hint = schedule[0].get("focus_topics", [])
            except (json.JSONDecodeError, KeyError):
                pass

        recommendations = []
        for topic in priority_topics:
            recommendations.append({
                "type": "weakness_practice",
                "topic": topic,
                "reason": "Below mastery threshold — targeted practice recommended",
                "suggested_difficulty": "beginner" if weaknesses[priority_topics.index(topic)]["mastery_level"] < 0.2 else "intermediate",
                "estimated_minutes": 15,
            })

        for topic in review_topics:
            recommendations.append({
                "type": "review",
                "topic": topic,
                "reason": "Not practiced in over 3 days — spaced repetition review",
                "suggested_difficulty": "intermediate",
                "estimated_minutes": 10,
            })

        return JSONResponse(content={
            "status": "success",
            "user_id": user_id,
            "date": today.isoformat(),
            "sessions_completed_today": sessions_today,
            "time_spent_today_minutes": round(time_today, 2),
            "recommendations": recommendations,
            "priority_topics": priority_topics,
            "review_topics": review_topics,
            "active_study_plan": bool(active_plan),
            "plan_focus_topics": plan_hint or [],
            "daily_goal_met": sessions_today >= 2,
        })
    except Exception as e:
        logger.error(f"Error getting daily recommendations: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": str(e)})
