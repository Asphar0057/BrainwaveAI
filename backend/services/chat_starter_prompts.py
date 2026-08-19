"""Recommends starter prompts for the empty AI Chat screen.

Nothing here is a fixed copy list -- every prompt is derived from the
signed-in user's own data (weak areas, topic mastery, recent notes/flashcards,
their subject profile). The only static strings are the small set of
cold-start templates used when a brand-new account has no data yet to
analyze, and even those are parameterized by the user's profile where
possible.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

import models
from services.topic_utils import clean_topic, is_valid_topic

RECENT_ACTIVITY_WINDOW_DAYS = 14


class _Candidate:
    __slots__ = ("text", "topic", "rank")

    def __init__(self, text: str, topic: str, rank: float):
        self.text = text
        self.topic = topic.lower()
        self.rank = rank


def _weak_area_candidates(db: Session, user_id: int) -> List[_Candidate]:
    rows = (
        db.query(models.UserWeakArea)
        .filter(
            models.UserWeakArea.user_id == user_id,
            models.UserWeakArea.total_questions >= 3,
        )
        .order_by(models.UserWeakArea.weakness_score.desc())
        .limit(5)
        .all()
    )

    candidates: List[_Candidate] = []
    for row in rows:
        topic = clean_topic(row.subtopic or row.topic or "")
        if not topic or not is_valid_topic(topic):
            continue
        if row.weakness_score >= 0.55 or row.accuracy < 55:
            text = f"Quiz me on {topic}"
        else:
            text = f"Explain {topic} simply"
        candidates.append(_Candidate(text, topic, row.weakness_score))
    return candidates


def _low_mastery_candidates(db: Session, user_id: int) -> List[_Candidate]:
    rows = (
        db.query(models.TopicMastery)
        .filter(
            models.TopicMastery.user_id == user_id,
            models.TopicMastery.times_studied >= 1,
        )
        .order_by(models.TopicMastery.mastery_level.asc())
        .limit(5)
        .all()
    )

    candidates: List[_Candidate] = []
    for row in rows:
        topic = clean_topic(row.topic_name or "")
        if not topic or not is_valid_topic(topic):
            continue
        # Invert mastery (0..1, lower = weaker) into the same rank scale as weakness_score.
        rank = max(0.0, 1.0 - float(row.mastery_level or 0.0))
        text = f"Help me practice {topic}"
        candidates.append(_Candidate(text, topic, rank))
    return candidates


def _recent_activity_candidates(db: Session, user_id: int) -> List[_Candidate]:
    since = datetime.now(timezone.utc) - timedelta(days=RECENT_ACTIVITY_WINDOW_DAYS)
    candidates: List[_Candidate] = []

    recent_notes = (
        db.query(models.Note)
        .filter(
            models.Note.user_id == user_id,
            models.Note.is_deleted.is_(False),
            models.Note.created_at >= since,
        )
        .order_by(models.Note.created_at.desc())
        .limit(5)
        .all()
    )
    for i, note in enumerate(recent_notes):
        topic = clean_topic(note.title or "")
        if not topic or not is_valid_topic(topic):
            continue
        # Most recent note ranks highest within this group; decays slightly per position.
        candidates.append(_Candidate(f"Create flashcards for {topic}", topic, 0.5 - i * 0.05))

    recent_sets = (
        db.query(models.FlashcardSet)
        .filter(
            models.FlashcardSet.user_id == user_id,
            models.FlashcardSet.created_at >= since,
        )
        .order_by(models.FlashcardSet.created_at.desc())
        .limit(5)
        .all()
    )
    for i, fset in enumerate(recent_sets):
        topic = clean_topic(fset.title or "")
        if not topic or not is_valid_topic(topic):
            continue
        candidates.append(_Candidate(f"Quiz me on {topic}", topic, 0.45 - i * 0.05))

    return candidates


def _profile_subjects(profile: Optional["models.ComprehensiveUserProfile"]) -> List[str]:
    if not profile:
        return []
    subjects: List[str] = []
    if profile.main_subject:
        subjects.append(profile.main_subject)
    if profile.preferred_subjects:
        try:
            parsed = json.loads(profile.preferred_subjects)
            if isinstance(parsed, list):
                subjects.extend(str(s) for s in parsed if s)
        except (TypeError, ValueError):
            subjects.extend(
                s.strip() for s in profile.preferred_subjects.split(",") if s.strip()
            )
    seen = set()
    cleaned: List[str] = []
    for s in subjects:
        topic = clean_topic(s)
        if topic and topic.lower() not in seen:
            seen.add(topic.lower())
            cleaned.append(topic)
    return cleaned


def _cold_start_candidates(db: Session, user: "models.User") -> List[str]:
    """Used only when a user has no weak-area, mastery, note, or flashcard
    signal yet (typically a brand-new account). Prefers their onboarding
    subject profile; falls back to generic bootstrap prompts only if even
    that is missing."""
    profile = (
        db.query(models.ComprehensiveUserProfile)
        .filter(models.ComprehensiveUserProfile.user_id == user.id)
        .first()
    )
    subjects = _profile_subjects(profile)
    if subjects:
        primary = subjects[0]
        prompts = [f"Explain a hard topic in {primary} simply", f"Quiz me on {primary} basics"]
        if len(subjects) > 1:
            prompts.append(f"Help me plan a study session for {subjects[1]}")
        else:
            prompts.append("Help me plan a study session")
        return prompts

    bootstrap_pool = [
        "Explain a hard topic simply",
        "Help me plan a study session",
        "Quiz me on my weak areas",
        "Turn my notes into flashcards",
        "Help me start studying",
    ]
    rng = random.Random(user.id)
    rng.shuffle(bootstrap_pool)
    return bootstrap_pool[:3]


def generate_chat_starter_prompts(db: Session, user: "models.User", limit: int = 3) -> List[str]:
    """Analyzes this user's weak areas, topic mastery, and recent study
    activity to recommend `limit` starter prompts for a fresh AI chat."""
    candidates = (
        _weak_area_candidates(db, user.id)
        + _low_mastery_candidates(db, user.id)
        + _recent_activity_candidates(db, user.id)
    )
    candidates.sort(key=lambda c: c.rank, reverse=True)

    seen_topics = set()
    prompts: List[str] = []
    for candidate in candidates:
        if candidate.topic in seen_topics:
            continue
        seen_topics.add(candidate.topic)
        prompts.append(candidate.text)
        if len(prompts) >= limit:
            break

    if len(prompts) < limit:
        for fallback in _cold_start_candidates(db, user):
            if fallback.lower() in {p.lower() for p in prompts}:
                continue
            prompts.append(fallback)
            if len(prompts) >= limit:
                break

    return prompts[:limit]
