"""Learning activation, accountable feedback, and first-party pilot measurement."""
import json
import uuid
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import models
from deps import get_current_user, get_db
from services.admin_analytics import check_admin
from services.product_events import record_event
from services.access_control import normalize_account_role

router = APIRouter(prefix="/api/product", tags=["product"])


@router.get("/practice-next")
def practice_next(db: Session = Depends(get_db), user=Depends(get_current_user)):
    due = db.query(models.FlashcardSet.id, models.FlashcardSet.title, func.count(models.Flashcard.id)).join(
        models.Flashcard, models.Flashcard.set_id == models.FlashcardSet.id).filter(
        models.FlashcardSet.user_id == user.id,
        models.Flashcard.next_review_date <= datetime.now(timezone.utc)
    ).group_by(models.FlashcardSet.id, models.FlashcardSet.title).order_by(func.min(models.Flashcard.next_review_date)).first()
    if due:
        return {"kind": "review", "title": "Your review queue", "reason": f"{due[2]} cards are due in {due[1]}. Review them to schedule your next recall.",
                "href": "/flashcards?review=due", "user_id": user.id}
    marked = db.query(models.FlashcardSet).join(models.Flashcard).filter(models.FlashcardSet.user_id == user.id, models.Flashcard.marked_for_review.is_(True)).first()
    if marked:
        return {"kind": "review", "title": marked.title, "reason": "You marked cards in this set for another look.", "href": f"/flashcards?set_id={marked.id}&mode=study", "user_id": user.id}
    weak = db.query(models.UserWeakArea).filter(models.UserWeakArea.user_id == user.id,
        models.UserWeakArea.status == "needs_practice", models.UserWeakArea.incorrect_count > 0).order_by(
        models.UserWeakArea.weakness_score.desc()).first()
    if weak:
        return {"kind": "practice", "topic": weak.topic, "title": weak.topic,
                "reason": f"{weak.incorrect_count} incorrect answers in {weak.total_questions} recorded attempts.", "user_id": user.id}
    mastery = db.query(models.TopicMastery).filter(models.TopicMastery.user_id == user.id,
        models.TopicMastery.questions_asked > models.TopicMastery.correct_answers).order_by(models.TopicMastery.mastery_level).first()
    if mastery:
        return {"kind": "practice", "topic": mastery.topic_name, "title": mastery.topic_name,
                "reason": "Revisit a topic with a recorded incorrect answer.", "user_id": user.id}
    return {"kind": "sample", "title": "Start with a three-minute sample", "reason": "Learn a concept, check your answer, then try a fresh question.", "href": "/sample-course", "user_id": user.id}


class SampleEvent(BaseModel):
    visitor_id: uuid.UUID
    name: str = Field(pattern="^sample_(opened|answered|completed)$")


@router.post("/sample-events", status_code=202)
def sample_event(payload: SampleEvent, db: Session = Depends(get_db)):
    visitor = str(payload.visitor_id)
    record_event(db, payload.name, visitor_id=visitor, key=f"{visitor}:{payload.name}", origin="client")
    db.commit()
    return {"recorded": True}


class Activation(BaseModel):
    visitor_id: uuid.UUID | None = None


@router.post("/activation")
def activation(payload: Activation = Body(default=Activation()), db: Session = Depends(get_db), user=Depends(get_current_user)):
    record_event(db, "account_activated", user.id, key=f"activated:{user.id}", visitor_id=str(payload.visitor_id) if payload.visitor_id else None)
    db.commit()
    return {"recorded": True}


class ReportInput(BaseModel):
    resource_type: str = Field(pattern="^(chat_message|practice_answer|flashcard|question_result|solo_question|checkpoint_attempt)$")
    resource_id: int = Field(gt=0)
    reason: str = Field(pattern="^(incorrect_answer|unclear_explanation|missing_source|other)$")
    detail: str = Field(default="", max_length=3000)


def owned_snapshot(db, user, kind, resource_id):
    row = None
    if kind == "chat_message":
        row = db.query(models.ChatMessage).join(models.ChatSession).filter(models.ChatMessage.id == resource_id, models.ChatSession.user_id == user.id).first()
        if row:
            return {"question": row.user_message, "answer": row.ai_response, "sources": row.source_metadata or []}
    elif kind == "practice_answer":
        row = db.query(models.PracticeAnswer).join(models.PracticeSession).filter(models.PracticeAnswer.id == resource_id, models.PracticeSession.user_id == user.id).first()
        if row:
            return {"question": row.question_text, "answer": row.correct_answer, "student_answer": row.user_answer, "is_correct": row.is_correct}
    elif kind == "flashcard":
        row = db.query(models.Flashcard).join(models.FlashcardSet).filter(models.Flashcard.id == resource_id, models.FlashcardSet.user_id == user.id).first()
        if row:
            return {"question": row.question, "answer": row.answer}
    elif kind == "solo_question":
        row = db.query(models.SoloQuizQuestion).join(models.SoloQuiz).filter(models.SoloQuizQuestion.id == resource_id, models.SoloQuiz.user_id == user.id).first()
        if row:
            options = json.loads(row.options)
            return {"question": row.question, "answer": options[row.correct_answer], "explanation": row.explanation}
    elif kind == "checkpoint_attempt":
        row = db.query(models.CheckpointAttempt).filter_by(id=resource_id, student_id=user.id).first()
        if row:
            checkpoint = db.get(models.LearningCheckpoint, row.checkpoint_id)
            from routes.institution.helpers import _accessible_section
            _accessible_section(db, checkpoint.section_id, user)
            return {"question": checkpoint.title, "answer": row.results, "section_id": checkpoint.section_id, "checkpoint_id": checkpoint.id, "score_percent": row.score_percent}
    elif kind == "question_result":
        row = db.query(models.QuestionResult).join(models.QuestionAttempt).filter(models.QuestionResult.id == resource_id, models.QuestionAttempt.user_id == user.id).first()
        if row:
            question = db.get(models.Question, row.question_id)
            return {"question": question.question_text, "answer": question.correct_answer, "student_answer": row.user_answer, "is_correct": row.is_correct}
    raise HTTPException(status_code=404, detail="Answer not found")


def report_row(row, include_snapshot=False):
    result = {"id": row.id, "resource_type": row.resource_type, "resource_id": row.resource_id,
              "reason": row.reason, "detail": row.detail, "status": row.status, "resolution": row.resolution,
              "created_at": row.created_at, "resolved_at": row.resolved_at}
    if include_snapshot:
        result["snapshot"] = row.snapshot
    return result


@router.post("/answer-reports")
def create_report(payload: ReportInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    snapshot = owned_snapshot(db, user, payload.resource_type, payload.resource_id)
    row = db.query(models.AnswerReport).filter_by(user_id=user.id, resource_type=payload.resource_type, resource_id=payload.resource_id).first()
    if not row:
        row = models.AnswerReport(user_id=user.id, **payload.model_dump(), snapshot=snapshot)
        db.add(row)
        try:
            db.flush()
            record_event(db, "answer_reported", user.id, key=f"report:{row.id}")
            db.commit()
        except IntegrityError:
            db.rollback()
            row = db.query(models.AnswerReport).filter_by(user_id=user.id, resource_type=payload.resource_type, resource_id=payload.resource_id).one()
    return report_row(row)


@router.get("/answer-reports")
def my_reports(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return [report_row(r, True) for r in db.query(models.AnswerReport).filter_by(user_id=user.id).order_by(models.AnswerReport.id.desc()).limit(200)]


@router.get("/admin/answer-reports", dependencies=[Depends(check_admin)])
def report_queue(db: Session = Depends(get_db)):
    return [report_row(r, True) for r in db.query(models.AnswerReport).filter_by(status="open").order_by(models.AnswerReport.id).limit(200)]


class Resolution(BaseModel):
    resolution: str = Field(min_length=10, max_length=5000)


@router.post("/admin/answer-reports/{report_id}/resolve", dependencies=[Depends(check_admin)])
def resolve_report(report_id: int, payload: Resolution, db: Session = Depends(get_db), user=Depends(get_current_user)):
    row = db.get(models.AnswerReport, report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    row.status = "resolved"
    row.resolution = payload.resolution
    row.resolved_by = user.id
    row.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return report_row(row)


@router.get("/sections/{section_id}/learning-evidence")
def learning_evidence(section_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from routes.institution.helpers import _accessible_section, _display_name
    if normalize_account_role(user.account_role) != "educator":
        raise HTTPException(status_code=403, detail="Educator access required")
    section = _accessible_section(db, section_id, user)
    groups = []
    for assignment in section.assignments:
        if not assignment.points_possible or assignment.points_possible <= 0:
            continue
        graded = [s for s in assignment.submissions if s.score is not None and s.status == "graded"]
        attempts = []
        for sub in graded:
            if sub.score / assignment.points_possible >= .7:
                continue
            student = db.get(models.User, sub.student_id)
            attempts.append({"submission_id": sub.id, "student": _display_name(student), "attempt_number": sub.attempt_number,
                "answer": sub.content_text, "feedback": sub.feedback, "score": sub.score,
                "points_possible": assignment.points_possible, "submitted_at": sub.submitted_at})
        if attempts:
            groups.append({"assignment_id": assignment.id, "title": assignment.title, "graded_count": len(graded), "attempts": attempts})
    return {"section_id": section.id, "groups": groups,
            "interpretation": "Possible learning gaps: graded submissions below 70%. Read the attempts and teacher feedback before naming a misconception. This view shows the latest submission; the assignment history retains new submission and grading revisions."}


@router.get("/admin/metrics", dependencies=[Depends(check_admin)])
def metrics(days: int = Query(30, ge=7, le=90), db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    counts = db.query(models.ProductEvent.name, models.ProductEvent.origin, func.count(models.ProductEvent.id),
        func.count(func.distinct(models.ProductEvent.user_id)), func.count(func.distinct(models.ProductEvent.visitor_id))).filter(
        models.ProductEvent.created_at >= since).group_by(models.ProductEvent.name, models.ProductEvent.origin).all()
    revenue = db.query(models.BillingEvent.currency, func.sum(models.BillingEvent.amount_minor)).filter(
        models.BillingEvent.processed_at >= since).group_by(models.BillingEvent.currency).all()
    activity = defaultdict(set)
    for uid, dt in db.query(models.ProductEvent.user_id, models.ProductEvent.created_at).filter(
        models.ProductEvent.name == "practice_answered", models.ProductEvent.created_at >= since).all():
        activity[uid].add(dt.date())
    eligible = [dates for dates in activity.values() if min(dates) <= (datetime.now(timezone.utc) - timedelta(days=7)).date()]
    retained = sum(any(1 <= (d-min(dates)).days <= 7 for d in dates) for dates in eligible)
    costs = {"estimated_usd": 0, "priced_calls": 0, "unpriced_calls": 0, "available": True}
    try:
        rows = db.execute(text("SELECT metadata FROM user_activity_log WHERE action = 'ai_generate' AND timestamp >= :since"), {"since": since}).all()
        for (raw,) in rows:
            meta = raw if isinstance(raw, dict) else json.loads(raw or "{}")
            value = meta.get("estimated_cost_usd")
            if isinstance(value, (int, float)) and value >= 0:
                costs["estimated_usd"] += value
                costs["priced_calls"] += 1
            else:
                costs["unpriced_calls"] += 1
    except Exception:
        db.rollback()
        costs["available"] = False
    sampled = {v for (v,) in db.query(models.ProductEvent.visitor_id).filter(models.ProductEvent.name == "sample_opened", models.ProductEvent.created_at >= since).all() if v}
    linked = {u for u,v in db.query(models.ProductEvent.user_id, models.ProductEvent.visitor_id).filter(models.ProductEvent.name == "account_activated").all() if v in sampled}
    payers = {u for (u,) in db.query(models.BillingEvent.user_id).filter(models.BillingEvent.amount_minor > 0, models.BillingEvent.processed_at >= since).all()}
    funnel = {"sample_browsers": len(sampled), "linked_activated_accounts": len(linked),
              "linked_practising_accounts": len(linked & set(activity)), "linked_paying_accounts": len(linked & payers)}
    return {"days": days, "sample_funnel": funnel, "events": [dict(name=n, origin=o, events=c, users=u, visitors=v) for n,o,c,u,v in counts],
        "receipts": [dict(currency=c, amount_minor=a) for c,a in revenue if c], "ai_costs": costs,
        "practice_return_7d": {"eligible_users": len(eligible), "returned_users": retained},
        "notes": "Sample counts are client-reported browsers, not verified people. Sample attribution uses browser IDs supplied at first authenticated activation; it is incomplete across devices and is not causal attribution. Practice return means another day within 7 days of the first practice event in this window. Receipts exclude refunds, taxes, fees and pre-launch history. AI costs are estimates; unpriced calls and hosting, media, support and acquisition costs are excluded."}
