import json
import re
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from jose import JWTError, jwt

import models
from database import get_db
from deps import (
    get_current_user,
    call_ai,
    get_user_by_username,
    get_user_by_email,
    verify_token,
    SECRET_KEY,
    ALGORITHM,
    JWT_AUDIENCE,
    JWT_ISSUER,
)
from services.ai_json_parser import parse_json_array_response
from services.websocket_manager import manager
from services.admin_analytics import check_admin
from services.content_bandit import get_content_bandit, is_auto_difficulty
from uid_utils import resolve_by_id_or_uid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["social"])

ws_router = APIRouter(tags=["websocket"])


@router.post("/create_solo_quiz")
async def create_solo_quiz(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        subject = payload.get("subject")
        difficulty = payload.get("difficulty", "intermediate")
        question_count = payload.get("question_count", 10)

        if is_auto_difficulty(difficulty) and subject:
            try:
                selection = get_content_bandit().select_difficulty(
                    db, str(current_user.id), "quiz", subject.strip()[:50],
                    arms=["beginner", "intermediate", "advanced"],
                )
                difficulty = selection.difficulty
                logger.info(
                    f"[SOLO_QUIZ] auto-difficulty resolved to '{difficulty}' "
                    f"(method={selection.selection_method}) for subject='{subject}'"
                )
            except Exception as e:
                logger.warning(f"[SOLO_QUIZ] content bandit selection failed, defaulting to intermediate: {e}")
                difficulty = "intermediate"

        quiz = models.SoloQuiz(
            user_id=current_user.id,
            subject=subject,
            difficulty=difficulty,
            question_count=question_count,
            time_limit_seconds=300
        )

        db.add(quiz)
        db.commit()
        db.refresh(quiz)

        questions = await _generate_quiz_questions(subject, difficulty, question_count)

        for q_data in questions:
            question = models.SoloQuizQuestion(
                quiz_id=quiz.id,
                question=q_data["question"],
                options=json.dumps(q_data["options"]),
                correct_answer=q_data["correct_answer"],
                explanation=q_data.get("explanation", "")
            )
            db.add(question)

        db.commit()

        try:
            from tutor import chroma_store
            if chroma_store.available():
                chroma_store.write_episode(
                    user_id=str(current_user.id),
                    summary=(
                        f"Quiz created: \"{subject}\" on {subject}. "
                        f"{question_count} questions, difficulty: {difficulty}."
                    ),
                    metadata={
                        "source": "quiz_created",
                        "topic": (subject or "")[:100],
                        "title": (subject or "")[:100],
                        "question_count": question_count,
                        "difficulty": difficulty,
                        "quiz_id": str(quiz.id),
                    },
                )
        except Exception as chroma_err:
            logger.warning(f"Chroma write failed on solo quiz create: {chroma_err}")

        return {
            "status": "success",
            "quiz_id": quiz.id,
            "uid": quiz.uid
        }

    except Exception as e:
        logger.error(f"Error creating solo quiz: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/solo_quiz/{quiz_id}")
async def get_solo_quiz(
    quiz_id: str,
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        quiz = resolve_by_id_or_uid(
            db.query(models.SoloQuiz).filter(models.SoloQuiz.user_id == current_user.id),
            models.SoloQuiz,
            quiz_id,
            uid_field="uid",
        ).first()

        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        questions = db.query(models.SoloQuizQuestion).filter(
            models.SoloQuizQuestion.quiz_id == quiz.id
        ).all()

        return {
            "quiz": {
                "id": quiz.id,
                "uid": quiz.uid,
                "subject": quiz.subject,
                "difficulty": quiz.difficulty,
                "question_count": quiz.question_count,
                "time_limit_seconds": quiz.time_limit_seconds
            },
            "questions": [{
                "id": q.id,
                "question": q.question,
                "options": json.loads(q.options),
                "correct_answer": q.correct_answer,
                "explanation": q.explanation
            } for q in questions]
        }

    except Exception as e:
        logger.error(f"Error getting solo quiz: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/complete_solo_quiz")
async def complete_solo_quiz(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        quiz_id = payload.get("quiz_id")
        score = payload.get("score")
        answers = payload.get("answers", [])

        quiz = resolve_by_id_or_uid(
            db.query(models.SoloQuiz).filter(models.SoloQuiz.user_id == current_user.id),
            models.SoloQuiz,
            quiz_id,
            uid_field="uid",
        ).first()

        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        logger.info(f"Quiz completion - User: {current_user.id}, Score: {score}%")

        quiz.score = score
        quiz.completed = True
        quiz.status = "completed"
        quiz.answers = json.dumps(answers)
        quiz.completed_at = datetime.now(timezone.utc)

        db.commit()
        logger.info("Quiz saved successfully")

        try:
            from activity_logger import log_activity
            log_activity(
                db=db,
                user_id=current_user.id,
                activity_type="solo_quiz",
                details={
                    "quiz_id": quiz_id,
                    "subject": quiz.subject,
                    "score": score,
                    "difficulty": quiz.difficulty,
                    "question_count": quiz.question_count
                }
            )
            logger.info(f"Logged solo_quiz activity for user {current_user.id}")
        except Exception as log_error:
            logger.warning(f"Failed to log activity: {log_error}")

        try:
            from tutor import chroma_store
            if chroma_store.available():
                correct_count = round((score / 100) * quiz.question_count) if score is not None else 0
                chroma_store.write_episode(
                    user_id=str(current_user.id),
                    summary=(
                        f"Quiz completed: \"{quiz.subject}\" — scored {score:.1f}% "
                        f"({correct_count}/{quiz.question_count} correct)."
                    ),
                    metadata={
                        "source": "quiz_completed",
                        "topic": (quiz.subject or "")[:100],
                        "title": (quiz.subject or "")[:100],
                        "score": str(round(score, 1)),
                        "correct": str(correct_count),
                        "total": str(quiz.question_count),
                        "difficulty": quiz.difficulty,
                        "quiz_id": str(quiz_id),
                    },
                )
                chroma_store.write_quiz_result(
                    user_id=str(current_user.id),
                    topic=quiz.subject or "",
                    score=score,
                    correct=correct_count,
                    total=quiz.question_count,
                    metadata={"quiz_id": str(quiz_id), "difficulty": quiz.difficulty},
                )
        except Exception as chroma_err:
            logger.warning(f"Chroma write failed on solo quiz complete: {chroma_err}")

        # ── Personalization loop: weak-area/mastery tracking + bandit reward ──
        # Solo quiz completion previously only touched SoloQuiz/gamification/chroma
        # -- never fed the same UserWeakArea/TopicMastery tables flashcards/chat/
        # notes all read from (routes/questions.py::submit_question_answers does
        # this for practice questions; this mirrors that pattern here), and never
        # closed the difficulty-bandit loop opened in create_solo_quiz.
        try:
            topic = (quiz.subject or "").strip()
            correct_count = round((score / 100) * quiz.question_count) if score is not None else 0
            incorrect_count = max(quiz.question_count - correct_count, 0)
            accuracy_frac = (score or 0) / 100.0

            if topic:
                now = datetime.now(timezone.utc)
                existing_wa = db.query(models.UserWeakArea).filter(
                    models.UserWeakArea.user_id == current_user.id,
                    models.UserWeakArea.topic == topic[:255],
                ).first()
                if existing_wa:
                    total = (existing_wa.total_questions or 0) + quiz.question_count
                    correct_total = (existing_wa.correct_count or 0) + correct_count
                    wrong_total = (existing_wa.incorrect_count or 0) + incorrect_count
                    acc = round(correct_total / total * 100, 1) if total else 0.0
                    existing_wa.total_questions = total
                    existing_wa.correct_count = correct_total
                    existing_wa.incorrect_count = wrong_total
                    existing_wa.accuracy = acc
                    existing_wa.weakness_score = max(existing_wa.weakness_score or 0.0, round((100 - acc) * 0.8, 1))
                    existing_wa.last_practiced = now
                    if score < 60:
                        existing_wa.consecutive_wrong = (existing_wa.consecutive_wrong or 0) + incorrect_count
                        existing_wa.status = "critical" if acc < 50 else "needs_practice"
                        existing_wa.priority = min(10, (existing_wa.priority or 5) + 1)
                    elif score >= 80:
                        existing_wa.status = "improving"
                        existing_wa.improvement_rate = min(1.0, (existing_wa.improvement_rate or 0.0) + 0.1)
                elif score < 75:
                    db.add(models.UserWeakArea(
                        user_id=current_user.id,
                        topic=topic[:255],
                        total_questions=quiz.question_count,
                        correct_count=correct_count,
                        incorrect_count=incorrect_count,
                        accuracy=round(score, 1),
                        weakness_score=round((100 - score) * 0.8, 1),
                        consecutive_wrong=incorrect_count,
                        practice_sessions=1,
                        last_practiced=now,
                        improvement_rate=0.0,
                        status="critical" if score < 50 else "needs_practice",
                        priority=8 if score < 50 else 5,
                    ))

                mastery = db.query(models.TopicMastery).filter(
                    models.TopicMastery.user_id == current_user.id,
                    models.TopicMastery.topic_name == topic,
                ).first()
                if mastery:
                    mastery.questions_asked = (mastery.questions_asked or 0) + quiz.question_count
                    mastery.correct_answers = (mastery.correct_answers or 0) + correct_count
                    mastery.last_practiced = now
                    mastery.mastery_level = min(1.0, (mastery.mastery_level or 0.0) * 0.9 + accuracy_frac * 0.1)
                    mastery.confidence_level = accuracy_frac
                else:
                    db.add(models.TopicMastery(
                        user_id=current_user.id,
                        topic_name=topic,
                        questions_asked=quiz.question_count,
                        correct_answers=correct_count,
                        mastery_level=0.1 * accuracy_frac,
                        confidence_level=accuracy_frac,
                        last_practiced=now,
                    ))

                db.commit()

                try:
                    get_content_bandit().resolve_reward(
                        db, str(current_user.id), "quiz", topic[:50], accuracy_frac,
                    )
                except Exception as e:
                    logger.warning(f"[SOLO_QUIZ] content bandit reward resolution failed: {e}")
        except Exception as _wa_err:
            logger.warning(f"[SOLO_QUIZ] weak-area/mastery update failed: {_wa_err}")
            try:
                db.rollback()
            except Exception:
                pass

        from services.gamification_system import award_points, calculate_solo_quiz_points

        points_result = award_points(db, current_user.id, "solo_quiz", {
            "difficulty": quiz.difficulty,
            "question_count": quiz.question_count,
            "score_percentage": score
        })

        quiz_points = calculate_solo_quiz_points(quiz.difficulty, quiz.question_count, score)

        db.commit()
        logger.info(f"Awarded {points_result['points_earned']} points for solo quiz")

        logger.info(f"Checking notification conditions - Score: {score}")
        notification = None

        if score < 50:
            logger.info(f"Creating poor performance notification (score {score} < 50)")
            notification = models.Notification(
                user_id=current_user.id,
                title="Quiz Performance Alert",
                message=f"Your recent quiz score was {score}%. Review the material and try again to improve!",
                notification_type="quiz_poor_performance"
            )
            db.add(notification)
            db.commit()
            logger.info(f"Created poor performance notification for user {current_user.id}")
        elif score >= 90:
            logger.info(f"Creating excellent performance notification (score {score} >= 90)")
            notification = models.Notification(
                user_id=current_user.id,
                title="Excellent Work!",
                message=f"Amazing! You scored {score}% on your quiz. You earned {points_result['points_earned']} points!",
                notification_type="quiz_excellent"
            )
            db.add(notification)
            db.commit()
            logger.info(f"Created excellent performance notification for user {current_user.id}")
        else:
            logger.info(f"No notification created - score {score} is between 50-89")

        response = {
            "status": "success",
            "message": "Quiz completed",
            "points_earned": points_result["points_earned"],
            "total_points": points_result["total_points"],
            "level": points_result["level"],
            "points_breakdown": quiz_points
        }

        if notification:
            response["notification"] = {
                "title": notification.title,
                "message": notification.message,
                "notification_type": notification.notification_type
            }

        return response

    except Exception as e:
        logger.error(f"Error completing solo quiz: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/debug/websocket-connections")
async def debug_websocket_connections(_: str = Depends(check_admin)):
    return {
        "active_connections": list(manager.active_connections.keys()),
        "total_connections": len(manager.active_connections),
    }


async def _generate_quiz_questions(subject: str, difficulty: str, count: int):
    prompt = f"""Generate {count} multiple choice questions about {subject} at {difficulty} level.

For each question provide:
- A clear question
- 4 answer options with FULL ANSWER TEXT (not just "A", "B", "C", "D")
- The index of the correct answer (0-3)
- A brief explanation of the correct answer

IMPORTANT: Return ONLY a valid JSON array, no markdown formatting, no code blocks, no extra text.
CRITICAL: Each option MUST contain the FULL ANSWER TEXT, not just letter labels.
Use this exact structure:
[{{"question": "...", "options": ["First option with full answer text", "Second option with full answer text", "Third option with full answer text", "Fourth option with full answer text"], "correct_answer": 0, "explanation": "..."}}]"""

    content = call_ai(prompt, max_tokens=3000, temperature=0.7)

    start = content.find("[")
    end = content.rfind("]")
    if start != -1 and end != -1 and end > start:
        content = content[start:end + 1]
    else:
        content = re.sub(r"^```(?:json)?\s*\n?", "", content.strip())
        content = re.sub(r"\n?```\s*$", "", content).strip()

    logger.info(f"Cleaned content: {content[:200]}...")
    questions = parse_json_array_response(content)

    if not isinstance(questions, list) or len(questions) == 0:
        raise ValueError("AI returned empty or invalid questions list")

    normalized_questions = []
    for index, item in enumerate(questions[:count]):
        question_text = str(item.get("question") or "").strip()
        options = item.get("options") if isinstance(item.get("options"), list) else []
        options = [str(option).strip() for option in options if str(option or "").strip()][:4]
        if len(options) < 4:
            raise ValueError(f"AI returned invalid options for question {index + 1}")

        raw_answer = item.get("correct_answer", 0)
        if isinstance(raw_answer, str) and raw_answer.strip().upper() in {"A", "B", "C", "D"}:
            correct_answer = ord(raw_answer.strip().upper()) - ord("A")
        else:
            try:
                correct_answer = int(raw_answer)
            except (TypeError, ValueError):
                correct_answer = 0
        correct_answer = max(0, min(3, correct_answer))

        if not question_text:
            raise ValueError(f"AI returned empty question text for question {index + 1}")

        normalized_questions.append({
            "question": question_text,
            "options": options,
            "correct_answer": correct_answer,
            "explanation": str(item.get("explanation") or "").strip(),
        })

    return normalized_questions


@ws_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    user_id = None
    db = None

    try:
        logger.info("WebSocket connection attempt")

        if not token:
            logger.error("No token provided")
            await websocket.close(code=1008, reason="No token")
            return

        db = next(get_db())

        try:
            payload = jwt.decode(
                token,
                SECRET_KEY,
                algorithms=[ALGORITHM],
                audience=JWT_AUDIENCE,
                issuer=JWT_ISSUER,
            )
            username = payload.get("sub")

            if not username:
                logger.error("No username in token")
                await websocket.close(code=1008, reason="Invalid token")
                return

            logger.info(f"Token verified for: {username}")

            user = get_user_by_username(db, username) or get_user_by_email(db, username)
            if not user:
                logger.error(f"User not found: {username}")
                await websocket.close(code=1008, reason="User not found")
                return

            user_id = user.id
            logger.info(f"User {user_id} authenticated successfully")

        except JWTError as e:
            logger.error(f"JWT Error: {str(e)}")
            await websocket.close(code=1008, reason="Invalid token")
            return
        except Exception as e:
            logger.error(f"Auth error: {str(e)}")
            await websocket.close(code=1011, reason="Auth error")
            return

        if db:
            db.close()
            db = None
            logger.info(f"Database connection closed for user {user_id}")

        await manager.connect(websocket, user_id)
        logger.info(f"WebSocket accepted for user {user_id}")
        logger.info(f"User {user_id} connected (Total: {len(manager.active_connections)})")

        await websocket.send_json({
            "type": "connected",
            "message": "Connected to battle system",
            "user_id": user_id
        })

        while True:
            try:
                data = await websocket.receive_json()

                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                    logger.debug(f"Ping from user {user_id}")

            except WebSocketDisconnect:
                logger.info(f"User {user_id} disconnected")
                break
            except Exception as e:
                logger.error(f"Error in WebSocket loop: {str(e)}")
                break

    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        try:
            await websocket.close(code=1011, reason="Error")
        except Exception:
            pass

    finally:
        if user_id and manager.active_connections.get(user_id) is websocket:
            del manager.active_connections[user_id]
            logger.info(f"User {user_id} cleaned up")

        if db:
            try:
                db.close()
                logger.info("Database connection closed in cleanup")
            except Exception:
                pass
