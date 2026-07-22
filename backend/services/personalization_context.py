"""Shared BKT-aware personalization context for flashcard/quiz generation.

Ties chat's per-concept BKT mastery (StudentKnowledgeState, updated live by
services/ml_pipeline.py) into flashcard/quiz prompts, on top of the existing
topic-level UserWeakArea/TopicMastery signal. Before this, "personalization"
only ever reached the AI as a bare topic name (e.g. "Photosynthesis") -- the
real p_mastery numbers already being computed by chat's BKT loop never made
it into the prompt at all, so the AI had no actual signal to act on.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

WEAK_MASTERY_THRESHOLD = 0.45
STRONG_MASTERY_THRESHOLD = 0.75
MIN_INTERACTIONS_FOR_SIGNAL = 2


@dataclass
class PersonalizationContext:
    weaknesses: list[str] = field(default_factory=list)
    strengths: list[str] = field(default_factory=list)


def _fmt(name: str, mastery: Optional[float]) -> str:
    if mastery is None:
        return name
    return f"{name} ({mastery:.0%} mastery)"


def get_personalization_context(db, user_id: str) -> PersonalizationContext:
    """Merges two independent mastery signals for the same student:
    - UserWeakArea / TopicMastery: topic-level, written on quiz/flashcard completion
    - StudentKnowledgeState: concept-level BKT estimate, updated live during chat

    Both get surfaced with real percentages where available so generation
    prompts can target the student's actual weak concepts, not a generic
    topic label with no numbers attached.
    """
    from models import UserWeakArea, TopicMastery, StudentKnowledgeState

    weak: list[str] = []
    strong: list[str] = []

    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return PersonalizationContext()

    try:
        weak_areas = (
            db.query(UserWeakArea)
            .filter(UserWeakArea.user_id == uid)
            .order_by(UserWeakArea.weakness_score.desc())
            .limit(5)
            .all()
        )
        for wa in weak_areas:
            if wa.topic and wa.topic not in weak:
                weak.append(wa.topic)

        mastery = (
            db.query(TopicMastery)
            .filter(TopicMastery.user_id == uid, TopicMastery.mastery_level >= STRONG_MASTERY_THRESHOLD)
            .limit(5)
            .all()
        )
        for tm in mastery:
            label = _fmt(tm.topic_name, tm.mastery_level)
            if tm.topic_name and label not in strong:
                strong.append(label)

        base_query = db.query(StudentKnowledgeState).filter(
            StudentKnowledgeState.user_id == uid,
            StudentKnowledgeState.interaction_count >= MIN_INTERACTIONS_FOR_SIGNAL,
        )

        weak_concepts = (
            base_query
            .filter(StudentKnowledgeState.p_mastery <= WEAK_MASTERY_THRESHOLD)
            .order_by(StudentKnowledgeState.p_mastery.asc())
            .limit(5)
            .all()
        )
        for cs in weak_concepts:
            label = _fmt(cs.concept_name, cs.p_mastery)
            if label not in weak:
                weak.append(label)

        strong_concepts = (
            base_query
            .filter(StudentKnowledgeState.p_mastery >= STRONG_MASTERY_THRESHOLD)
            .order_by(StudentKnowledgeState.p_mastery.desc())
            .limit(5)
            .all()
        )
        for cs in strong_concepts:
            label = _fmt(cs.concept_name, cs.p_mastery)
            if label not in strong:
                strong.append(label)
    except Exception as e:
        logger.warning(f"[Personalization] context fetch failed: {e}")

    return PersonalizationContext(weaknesses=weak[:8], strengths=strong[:8])
