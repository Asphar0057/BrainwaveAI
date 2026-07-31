import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

def _normalize_topic(topic: Optional[str]) -> str:
    if not topic:
        return ""
    return topic.strip().lower()

def _calc_accuracy(correct: int, total: int) -> Optional[float]:
    if total <= 0:
        return None
    return round((correct / total) * 100, 1)

def _classify_area(
    accuracy: Optional[float],
    weakness_score: Optional[float],
    priority: Optional[int],
    improvement_rate: Optional[float],
    status: Optional[str],
) -> str:
    acc = accuracy if accuracy is not None else 0.0
    score = weakness_score if weakness_score is not None else 0.0
    prio = priority if priority is not None else 0
    trend = improvement_rate if improvement_rate is not None else 0.0

    if status in ("critical", "urgent"):
        return "critical"
    if prio >= 8 or score >= 75 or acc < 50:
        return "critical"
    if status in ("needs_practice", "struggling"):
        return "needs_practice"
    if acc < 70 or score >= 45 or trend < -0.05:
        return "needs_practice"
    return "improving"

def _build_area_payload(
    *,
    topic: str,
    accuracy: Optional[float],
    total_attempts: int,
    total_wrong: int,
    weakness_score: Optional[float] = None,
    priority: Optional[int] = None,
    status: Optional[str] = None,
    improvement_rate: Optional[float] = None,
    last_practiced: Optional[datetime] = None,
    sources: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return {
        "topic": topic,
        "category": _classify_area(accuracy, weakness_score, priority, improvement_rate, status),
        "accuracy": round(accuracy, 1) if isinstance(accuracy, (int, float)) else 0.0,
        "total_attempts": total_attempts,
        "total_wrong": total_wrong,
        "weakness_score": round(weakness_score, 1) if isinstance(weakness_score, (int, float)) else 0.0,
        "priority": priority or 0,
        "status": status or "needs_practice",
        "improvement_rate": round(improvement_rate, 2) if isinstance(improvement_rate, (int, float)) else 0.0,
        "last_practiced": last_practiced.isoformat() if last_practiced else None,
        "sources": sources or [],
        "chat_analysis": {"is_doubtful": False, "mentions": 0},
        "flashcard_performance": {"is_weak": False, "struggling_cards": [], "total_cards": 0},
    }

def get_comprehensive_weakness_analysis(db: Session, user_id: int, models) -> Dict[str, Any]:
    areas_by_topic: Dict[str, Dict[str, Any]] = {}

    weak_areas = db.query(models.UserWeakArea).filter(
        models.UserWeakArea.user_id == user_id,
        models.UserWeakArea.status != "mastered",
    ).order_by(
        models.UserWeakArea.priority.desc(),
        models.UserWeakArea.weakness_score.desc(),
    ).all()

    for wa in weak_areas:
        topic = (wa.topic or "").strip()
        if not topic:
            continue

        total_attempts = wa.total_questions or (wa.correct_count or 0) + (wa.incorrect_count or 0)
        correct = wa.correct_count or max(total_attempts - (wa.incorrect_count or 0), 0)
        accuracy = wa.accuracy if wa.accuracy is not None else _calc_accuracy(correct, total_attempts)

        payload = _build_area_payload(
            topic=topic,
            accuracy=accuracy,
            total_attempts=total_attempts,
            total_wrong=wa.incorrect_count or 0,
            weakness_score=wa.weakness_score,
            priority=wa.priority,
            status=wa.status,
            improvement_rate=wa.improvement_rate,
            last_practiced=wa.last_practiced,
            sources=["quiz"],
        )
        areas_by_topic[topic] = payload

    mastery_records = db.query(models.TopicMastery).filter(
        models.TopicMastery.user_id == user_id
    ).all()

    for tm in mastery_records:
        topic = (tm.topic_name or "").strip()
        if not topic:
            continue

        attempts = tm.questions_asked or 0
        accuracy = _calc_accuracy(tm.correct_answers or 0, attempts) if attempts else None

        if topic in areas_by_topic:
            existing = areas_by_topic[topic]
            if attempts > existing.get("total_attempts", 0):
                existing["total_attempts"] = attempts
                existing["accuracy"] = round(accuracy, 1) if accuracy is not None else existing.get("accuracy", 0.0)
                existing["category"] = _classify_area(
                    existing.get("accuracy"),
                    existing.get("weakness_score"),
                    existing.get("priority"),
                    existing.get("improvement_rate"),
                    existing.get("status"),
                )
            if "quiz" not in existing["sources"]:
                existing["sources"].append("quiz")
            continue

        if attempts < 3:
            continue

        mastery_level = tm.mastery_level or 0.0
        if mastery_level >= 0.75 and (accuracy is None or accuracy >= 80):
            continue

        weakness_score = round((1 - mastery_level) * 100, 1)
        payload = _build_area_payload(
            topic=topic,
            accuracy=accuracy,
            total_attempts=attempts,
            total_wrong=max(attempts - (tm.correct_answers or 0), 0),
            weakness_score=weakness_score,
            priority=5,
            status="needs_practice",
            improvement_rate=0.0,
            last_practiced=tm.last_practiced,
            sources=["quiz"],
        )
        areas_by_topic[topic] = payload

    try:
        flashcards = db.query(models.Flashcard).join(
            models.FlashcardSet,
            models.Flashcard.set_id == models.FlashcardSet.id,
        ).filter(
            models.FlashcardSet.user_id == user_id
        ).all()
    except Exception:
        flashcards = []

    flashcards_by_topic: Dict[str, List[Any]] = {}
    for card in flashcards:
        topic_key = _normalize_topic(card.category)
        if not topic_key or topic_key in ("general", "misc", "default"):
            continue
        flashcards_by_topic.setdefault(topic_key, []).append(card)

    # Write struggling flashcard topics into UserWeakArea so they persist
    for topic_key, cards in flashcards_by_topic.items():
        reviewed = [c for c in cards if c.times_reviewed and c.times_reviewed >= 2]
        if not reviewed:
            continue
        total_reviews = sum(c.times_reviewed for c in reviewed)
        total_correct = sum(c.correct_count or 0 for c in reviewed)
        acc = round((total_correct / total_reviews) * 100, 1) if total_reviews else None
        if acc is None or acc >= 70:
            continue
        try:
            existing = db.query(models.UserWeakArea).filter(
                models.UserWeakArea.user_id == user_id,
                models.UserWeakArea.topic == topic_key,
            ).first()
            if existing:
                if (existing.accuracy or 100) > acc:
                    existing.accuracy = acc
                    existing.weakness_score = max(existing.weakness_score or 0, round((100 - acc) * 0.7, 1))
                    existing.status = "needs_practice"
                    db.commit()
            else:
                wa = models.UserWeakArea(
                    user_id=user_id,
                    topic=topic_key,
                    total_questions=total_reviews,
                    correct_count=total_correct,
                    incorrect_count=total_reviews - total_correct,
                    accuracy=acc,
                    weakness_score=round((100 - acc) * 0.7, 1),
                    status="needs_practice",
                    priority=4,
                )
                db.add(wa)
                db.commit()
            if topic_key not in areas_by_topic:
                areas_by_topic[topic_key] = _build_area_payload(
                    topic=topic_key,
                    accuracy=acc,
                    total_attempts=total_reviews,
                    total_wrong=total_reviews - total_correct,
                    weakness_score=round((100 - acc) * 0.7, 1),
                    priority=4,
                    status="needs_practice",
                    sources=["flashcard"],
                )
        except Exception:
            pass

    for topic, area in areas_by_topic.items():
        topic_key = _normalize_topic(topic)
        cards = flashcards_by_topic.get(topic_key, [])
        if not cards:
            continue

        struggling_cards = []
        for card in cards:
            if card.times_reviewed and card.times_reviewed >= 2:
                accuracy = (card.correct_count or 0) / card.times_reviewed
                if accuracy < 0.6:
                    struggling_cards.append({
                        "id": card.id,
                        "question": card.question,
                        "accuracy": round(accuracy * 100, 1),
                    })

        area["flashcard_performance"] = {
            "is_weak": len(struggling_cards) > 0,
            "struggling_cards": struggling_cards,
            "total_cards": len(cards),
        }
        if "flashcard" not in area["sources"]:
            area["sources"].append("flashcard")

    try:
        messages = db.query(models.ChatMessage).filter(
            models.ChatMessage.user_id == user_id
        ).order_by(models.ChatMessage.timestamp.desc()).limit(400).all()
    except Exception:
        messages = []

    if messages:
        message_texts = [m.user_message.lower() for m in messages if m.user_message]
        for topic, area in areas_by_topic.items():
            t = topic.lower()
            mentions = sum(1 for text in message_texts if t in text)
            if mentions > 0:
                area["chat_analysis"] = {
                    "is_doubtful": mentions >= 2 or area["category"] != "improving",
                    "mentions": mentions,
                }
                if "chat" not in area["sources"]:
                    area["sources"].append("chat")

    weak_areas_by_category = {"critical": [], "needs_practice": [], "improving": []}
    for area in areas_by_topic.values():
        category = area.get("category", "needs_practice")
        weak_areas_by_category.setdefault(category, []).append(area)

    def _sort_key(item: Dict[str, Any]):
        acc = item.get("accuracy")
        acc_val = acc if isinstance(acc, (int, float)) else 100
        return (acc_val, -item.get("weakness_score", 0))

    for category in weak_areas_by_category:
        weak_areas_by_category[category] = sorted(weak_areas_by_category[category], key=_sort_key)

    total_q = sum((tm.questions_asked or 0) for tm in mastery_records)
    total_c = sum((tm.correct_answers or 0) for tm in mastery_records)
    overall_accuracy = round((total_c / total_q) * 100, 1) if total_q > 0 else 0.0

    strengths = []
    for tm in mastery_records:
        attempts = tm.questions_asked or 0
        if attempts < 3:
            continue
        accuracy = _calc_accuracy(tm.correct_answers or 0, attempts) or 0.0
        if (tm.mastery_level or 0.0) >= 0.8 or accuracy >= 85:
            strengths.append({
                "topic": tm.topic_name,
                "mastery_level": round(tm.mastery_level or 0.0, 2),
                "accuracy": accuracy,
                "questions_asked": attempts,
                "last_practiced": tm.last_practiced.isoformat() if tm.last_practiced else None,
            })

    strengths = sorted(strengths, key=lambda s: (s["mastery_level"], s["accuracy"]), reverse=True)[:10]

    summary = {
        "critical_count": len(weak_areas_by_category.get("critical", [])),
        "needs_practice_count": len(weak_areas_by_category.get("needs_practice", [])),
        "improving_count": len(weak_areas_by_category.get("improving", [])),
        "total_topics": len(areas_by_topic),
        "overall_accuracy": overall_accuracy,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "status": "success",
        "user_id": user_id,
        "weak_areas": weak_areas_by_category,
        "strengths": strengths,
        "summary": summary,
    }

def _get_topic_performance(db: Session, user_id: int, topic: str, models) -> Dict[str, Any]:
    topic_normalized = _normalize_topic(topic)
    if not topic_normalized:
        return {"attempts": 0, "correct": 0, "wrong": 0, "accuracy": 0.0}

    weak_area = db.query(models.UserWeakArea).filter(
        models.UserWeakArea.user_id == user_id,
        func.lower(models.UserWeakArea.topic) == topic_normalized,
    ).first()
    if not weak_area:
        weak_area = db.query(models.UserWeakArea).filter(
            models.UserWeakArea.user_id == user_id,
            func.lower(models.UserWeakArea.topic).like(f"%{topic_normalized}%"),
        ).order_by(models.UserWeakArea.weakness_score.desc()).first()

    if weak_area:
        attempts = weak_area.total_questions or (weak_area.correct_count or 0) + (weak_area.incorrect_count or 0)
        correct = weak_area.correct_count or max(attempts - (weak_area.incorrect_count or 0), 0)
        accuracy = weak_area.accuracy if weak_area.accuracy is not None else _calc_accuracy(correct, attempts)
        return {
            "attempts": attempts,
            "correct": correct,
            "wrong": weak_area.incorrect_count or 0,
            "accuracy": round(accuracy, 1) if accuracy is not None else 0.0,
            "weakness_score": weak_area.weakness_score or 0.0,
            "improvement_rate": weak_area.improvement_rate or 0.0,
        }

    mastery = db.query(models.TopicMastery).filter(
        models.TopicMastery.user_id == user_id,
        func.lower(models.TopicMastery.topic_name) == topic_normalized,
    ).first()
    if not mastery:
        mastery = db.query(models.TopicMastery).filter(
            models.TopicMastery.user_id == user_id,
            func.lower(models.TopicMastery.topic_name).like(f"%{topic_normalized}%"),
        ).order_by(models.TopicMastery.mastery_level.asc()).first()

    if mastery:
        attempts = mastery.questions_asked or 0
        correct = mastery.correct_answers or 0
        accuracy = _calc_accuracy(correct, attempts) if attempts else 0.0
        return {
            "attempts": attempts,
            "correct": correct,
            "wrong": max(attempts - correct, 0),
            "accuracy": accuracy or 0.0,
            "weakness_score": round((1 - (mastery.mastery_level or 0.0)) * 100, 1),
            "improvement_rate": 0.0,
        }

    return {"attempts": 0, "correct": 0, "wrong": 0, "accuracy": 0.0, "weakness_score": 0.0, "improvement_rate": 0.0}

def generate_topic_suggestions(
    db: Session,
    user_id: int,
    topic: str,
    models,
    unified_ai=None,
) -> Dict[str, Any]:
    topic = topic.strip()
    perf = _get_topic_performance(db, user_id, topic, models)

    accuracy = perf.get("accuracy", 0.0)
    attempts = perf.get("attempts", 0)
    wrong = perf.get("wrong", 0)

    if attempts == 0:
        priority = "medium"
    elif accuracy < 55 or wrong >= max(3, int(attempts * 0.45)):
        priority = "high"
    elif accuracy < 75:
        priority = "medium"
    else:
        priority = "low"

    suggestions = [
        {
            "title": "Rebuild the fundamentals",
            "description": f"Review the core ideas in {topic} and summarize them in your own words before diving into more practice.",
            "priority": "high" if priority == "high" else "medium",
        },
        {
            "title": "Targeted practice set",
            "description": f"Complete 8–12 focused questions on {topic}. Rework every missed item and explain why the correct answer works.",
            "priority": "medium",
        },
        {
            "title": "Use spaced repetition",
            "description": f"Create quick flashcards for key terms and definitions in {topic} and review them across multiple days.",
            "priority": "low" if priority == "low" else "medium",
        },
    ]

    mistake_types = []
    try:
        mistake_rows = db.query(
            models.WrongAnswerLog.mistake_type,
            func.count(models.WrongAnswerLog.id).label("count"),
        ).filter(
            models.WrongAnswerLog.user_id == user_id,
            func.lower(models.WrongAnswerLog.topic) == _normalize_topic(topic),
            models.WrongAnswerLog.mistake_type.isnot(None),
        ).group_by(
            models.WrongAnswerLog.mistake_type
        ).order_by(
            func.count(models.WrongAnswerLog.id).desc()
        ).limit(3).all()
        mistake_types = [row[0] for row in mistake_rows if row[0]]
    except Exception:
        mistake_types = []

    study_tips = [
        "Break the topic into 3–5 subtopics and master one per session.",
        "Use active recall: answer questions without notes, then verify.",
        "Teach the concept out loud or write a 5-line explanation from memory.",
    ]

    if mistake_types:
        study_tips.append(f"Watch out for these mistake patterns: {', '.join(mistake_types)}.")

    return {
        "status": "success",
        "topic": topic,
        "suggestions": suggestions,
        "study_tips": study_tips,
        "stats": {
            "attempts": attempts,
            "accuracy": accuracy,
            "wrong": wrong,
        },
    }

def find_similar_questions(db: Session, user_id: int, topic: str, models, limit: int = 15) -> Dict[str, Any]:
    topic = topic.strip()
    if not topic:
        return {"status": "success", "topic": topic, "total_found": 0, "similar_questions": []}

    similar_questions: List[Dict[str, Any]] = []

    wrong_logs = db.query(models.WrongAnswerLog).filter(
        models.WrongAnswerLog.user_id == user_id,
        func.lower(models.WrongAnswerLog.topic).like(f"%{_normalize_topic(topic)}%"),
    ).order_by(models.WrongAnswerLog.answered_at.desc()).limit(limit).all()

    for log in wrong_logs:
        similar_questions.append({
            "question_text": log.question_text,
            "difficulty": log.difficulty or "medium",
            "user_answer": log.user_answer,
            "correct_answer": log.correct_answer,
            "is_new": False,
        })

    remaining = max(limit - len(similar_questions), 0)
    if remaining > 0:
        question_query = db.query(models.Question).join(
            models.QuestionSet, models.Question.question_set_id == models.QuestionSet.id
        ).filter(
            models.QuestionSet.user_id == user_id,
            func.lower(models.Question.topic).like(f"%{_normalize_topic(topic)}%"),
        )

        if wrong_logs:
            wrong_question_ids = [log.question_id for log in wrong_logs if log.question_id]
            if wrong_question_ids:
                question_query = question_query.filter(~models.Question.id.in_(wrong_question_ids))

        extra_questions = question_query.order_by(models.Question.id.desc()).limit(remaining).all()
        for q in extra_questions:
            similar_questions.append({
                "question_text": q.question_text,
                "difficulty": q.difficulty or "medium",
                "user_answer": None,
                "correct_answer": q.correct_answer,
                "is_new": True,
            })

    return {
        "status": "success",
        "topic": topic,
        "total_found": len(similar_questions),
        "similar_questions": similar_questions,
    }
