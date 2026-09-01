"""Adaptive solo-quiz generation: subject-specific weak-area targeting,
repeat-avoidance against prior questions, and per-question mistake capture.

`graphs/quiz_graph.py`'s `fetch_context` already pulls a GLOBAL (not
subject-specific) list of the student's weak topics via
`services/personalization_context.py` and threads it into `build_prompt`'s
`generation_type == "weak_areas"` branch -- but `create_solo_quiz` never sets
`generation_type`, so that branch is unreachable from solo quiz today, and
even when reached the weak-area list isn't filtered to the quiz's own
subject. This module fills both gaps via `additional_specs` (no changes to
the shared graph internals) and gives `complete_solo_quiz` a per-question
mistake writer mirroring `question_bank/utils.py::_update_weak_areas` (the
existing per-question UserWeakArea + WrongAnswerLog pattern), so solo quizzes
finally feed the same weakness signal every other surface does.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def get_subject_focus(db: Session, user_id: int, subject: str, limit: int = 5) -> str:
    """Short prompt-ready summary of this user's weak subtopics for `subject`,
    or "" if there's no weak-area history for it yet (brand-new topic)."""
    import models

    subject = (subject or "").strip()
    if not subject:
        return ""

    like = f"%{subject}%"
    rows = (
        db.query(models.UserWeakArea)
        .filter(
            models.UserWeakArea.user_id == user_id,
            or_(
                models.UserWeakArea.topic.ilike(like),
                models.UserWeakArea.subtopic.ilike(like),
            ),
        )
        .order_by(
            models.UserWeakArea.priority.desc(),
            models.UserWeakArea.weakness_score.desc(),
            models.UserWeakArea.consecutive_wrong.desc(),
        )
        .limit(limit)
        .all()
    )
    if not rows:
        return ""

    parts = []
    for wa in rows:
        label = wa.subtopic or wa.topic
        acc = f"{round(wa.accuracy)}% accuracy" if wa.accuracy is not None else None
        streak = f"{wa.consecutive_wrong}-wrong streak" if (wa.consecutive_wrong or 0) >= 2 else None
        detail = ", ".join(d for d in (acc, streak) if d)
        parts.append(f"{label} ({detail})" if detail else label)
    return ", ".join(parts)


def get_recent_question_texts(db: Session, user_id: int, subject: str, limit: int = 40) -> list[str]:
    """Most recent solo-quiz question texts this user has already been asked
    on `subject`, most-recent-first, for repeat-avoidance."""
    import models

    subject = (subject or "").strip()
    if not subject:
        return []

    rows = (
        db.query(models.SoloQuizQuestion.question)
        .join(models.SoloQuiz, models.SoloQuizQuestion.quiz_id == models.SoloQuiz.id)
        .filter(
            models.SoloQuiz.user_id == user_id,
            models.SoloQuiz.subject.ilike(subject),
        )
        .order_by(models.SoloQuiz.created_at.desc())
        .limit(limit)
        .all()
    )
    return [r[0] for r in rows if r[0]]


def build_avoid_list_spec(recent_texts: list[str], max_items: int = 40) -> str:
    if not recent_texts:
        return ""
    bounded = recent_texts[:max_items]
    lines = "\n".join(f"- {t}" for t in bounded)
    return (
        "Do NOT repeat or closely paraphrase any of these previously-asked questions "
        f"for this student:\n{lines}"
    )


def build_additional_specs(
    db: Session,
    user_id: int,
    subject: str,
    base_specs: str = "",
    default_generation_type: str = "topic",
) -> tuple[str, str]:
    """Returns (generation_type, additional_specs) for a `quiz_graph.invoke(...)`
    call. Subject-specific weak areas upgrade `generation_type` to
    "weak_areas" (only when the caller hasn't already picked something more
    specific than the default); the avoid-list is always appended regardless
    of generation_type, since repeat-avoidance is orthogonal to what the quiz
    is about.
    """
    focus_text = get_subject_focus(db, user_id, subject)
    recent_texts = get_recent_question_texts(db, user_id, subject)
    avoid_spec = build_avoid_list_spec(recent_texts)

    generation_type = default_generation_type
    if focus_text and default_generation_type == "topic":
        generation_type = "weak_areas"

    parts = [p for p in (base_specs or "").strip().splitlines() if p.strip()]
    if focus_text:
        parts.append(f"Student's known weak spots in this subject: {focus_text}.")
    if avoid_spec:
        parts.append(avoid_spec)

    return generation_type, "\n".join(parts).strip()


def is_duplicate_question(question_text: str, recent_texts: list[str]) -> bool:
    """Exact-match (normalized) dedup check -- defense-in-depth backstop in
    case the model ignores the avoid-list prompt instruction."""
    normalized = (question_text or "").strip().lower()
    if not normalized:
        return False
    return normalized in {(t or "").strip().lower() for t in recent_texts}


def _get_or_create_weak_area(db: Session, user_id: int, topic: str):
    import models

    now = datetime.now(timezone.utc)
    weak_area = (
        db.query(models.UserWeakArea)
        .filter(models.UserWeakArea.user_id == user_id, models.UserWeakArea.topic == topic)
        .first()
    )
    if not weak_area:
        weak_area = models.UserWeakArea(
            user_id=user_id,
            topic=topic,
            total_questions=0,
            correct_count=0,
            incorrect_count=0,
            first_identified=now,
        )
        db.add(weak_area)
        db.flush()
    return weak_area


def _apply_answer_to_weak_area(weak_area, is_correct: bool) -> None:
    """One question/review's worth of bookkeeping on a UserWeakArea row --
    the exact formula question_bank/utils.py::_update_weak_areas uses, so
    solo-quiz and flashcard mistakes score consistently with question-bank
    ones."""
    now = datetime.now(timezone.utc)

    weak_area.total_questions = (weak_area.total_questions or 0) + 1
    if is_correct:
        weak_area.correct_count = (weak_area.correct_count or 0) + 1
        weak_area.consecutive_wrong = 0
    else:
        weak_area.incorrect_count = (weak_area.incorrect_count or 0) + 1
        weak_area.consecutive_wrong = (weak_area.consecutive_wrong or 0) + 1
        weak_area.last_wrong_streak = max(weak_area.last_wrong_streak or 0, weak_area.consecutive_wrong)

    if weak_area.total_questions:
        weak_area.accuracy = round((weak_area.correct_count or 0) / weak_area.total_questions * 100, 1)

    accuracy_factor = 100 - (weak_area.accuracy or 0)
    streak_factor = min((weak_area.consecutive_wrong or 0) * 10, 30)
    volume_factor = min((weak_area.incorrect_count or 0) * 2, 20)
    weak_area.weakness_score = min(100, accuracy_factor * 0.5 + streak_factor + volume_factor)

    if weak_area.accuracy < 30:
        weak_area.priority = 10
    elif weak_area.accuracy < 50:
        weak_area.priority = 8
    elif weak_area.accuracy < 70:
        weak_area.priority = 6
    elif weak_area.accuracy < 85:
        weak_area.priority = 4
    else:
        weak_area.priority = 2
    if (weak_area.consecutive_wrong or 0) >= 3:
        weak_area.priority = min(10, weak_area.priority + 2)

    if weak_area.accuracy >= 90 and weak_area.total_questions >= 5:
        weak_area.status = "mastered"
    elif weak_area.accuracy >= 70:
        weak_area.status = "improving"
    else:
        weak_area.status = "needs_practice"

    weak_area.practice_sessions = (weak_area.practice_sessions or 0) + 1
    weak_area.last_practiced = now
    weak_area.last_updated = now


async def record_solo_quiz_mistakes(
    db: Session,
    user_id: int,
    quiz: "models.SoloQuiz",  # noqa: F821
    per_question_answers: list[dict],
) -> None:
    """Per-question UserWeakArea update + WrongAnswerLog insert for a
    completed solo quiz, mirroring question_bank/utils.py::_update_weak_areas
    (the existing per-question weakness-tracking pattern in this codebase)
    instead of `complete_solo_quiz`'s previous whole-quiz-score aggregate.
    """
    import models

    topic = (quiz.subject or "").strip() or "General"
    now = datetime.now(timezone.utc)

    text_to_id = {
        q.question: q.id
        for q in db.query(models.SoloQuizQuestion).filter(models.SoloQuizQuestion.quiz_id == quiz.id).all()
    }

    weak_area = _get_or_create_weak_area(db, user_id, topic)

    for answer in per_question_answers:
        is_correct = bool(answer.get("is_correct"))
        question_text = answer.get("question_text", "")
        _apply_answer_to_weak_area(weak_area, is_correct)

        if not is_correct:
            db.add(models.WrongAnswerLog(
                user_id=user_id,
                source="solo_quiz",
                question_id=None,
                question_set_id=None,
                solo_quiz_question_id=text_to_id.get(question_text),
                question_text=question_text,
                topic=topic,
                difficulty=quiz.difficulty,
                correct_answer=answer.get("correct_answer", ""),
                user_answer=answer.get("user_answer", ""),
                answered_at=now,
            ))


def record_flashcard_review(
    db: Session,
    user_id: int,
    topic: str,
    is_correct: bool,
    question_text: str,
    correct_answer: str,
    flashcard_id: int,
    difficulty: Optional[str] = None,
) -> None:
    """UserWeakArea update for one flashcard review, + a WrongAnswerLog row
    when it was a miss. Flashcards previously wrote no per-review weakness
    signal at all (only read-time aggregation via
    comprehensive_weakness_analyzer.py) -- this closes that gap using the
    same per-question formula as solo quiz / question-bank practice."""
    import models

    topic = (topic or "").strip() or "General"
    weak_area = _get_or_create_weak_area(db, user_id, topic)
    _apply_answer_to_weak_area(weak_area, is_correct)

    if not is_correct:
        db.add(models.WrongAnswerLog(
            user_id=user_id,
            source="flashcard",
            question_id=None,
            question_set_id=None,
            flashcard_id=flashcard_id,
            question_text=question_text,
            topic=topic,
            difficulty=difficulty,
            correct_answer=correct_answer,
            user_answer="",
            answered_at=datetime.now(timezone.utc),
        ))
