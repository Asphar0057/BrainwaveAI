
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from fsrs import FSRS, Card, Rating, State

if TYPE_CHECKING:
    import models as _models

logger = logging.getLogger(__name__)

_scheduler = FSRS()

GRADE_TO_RATING: dict[str, Rating] = {
    "again": Rating.Again,
    "hard":  Rating.Hard,
    "good":  Rating.Good,
    "easy":  Rating.Easy,
}

STATE_TO_STR = {
    State.New:        "new",
    State.Learning:   "learning",
    State.Review:     "review",
    State.Relearning: "relearning",
}

STR_TO_STATE = {v: k for k, v in STATE_TO_STR.items()}

def card_from_db(flashcard) -> Card:
    card = Card()
    card.state = STR_TO_STATE.get(flashcard.sr_state or "new", State.New)
    card.stability  = float(flashcard.fsrs_stability or 0.0)
    card.difficulty = float(flashcard.ease_factor or 5.0)
    card.reps       = int(flashcard.repetitions or 0)
    card.lapses     = int(flashcard.lapses or 0)
    if flashcard.last_reviewed:
        card.last_review = flashcard.last_reviewed
        if card.last_review.tzinfo is None:
            card.last_review = card.last_review.replace(tzinfo=timezone.utc)
    return card

def apply_fsrs_review(flashcard, grade_str: str) -> dict:
    rating = GRADE_TO_RATING.get(grade_str.lower())
    if rating is None:
        raise ValueError(f"Invalid grade: {grade_str!r}. Must be one of {list(GRADE_TO_RATING)}")

    card = card_from_db(flashcard)
    now  = datetime.now(timezone.utc)

    updated_card, _log = _scheduler.review_card(card, rating, now)

    retrievability = updated_card.get_retrievability(now)

    return {
        "new_state":        STATE_TO_STR[updated_card.state],
        "new_ease":         round(updated_card.difficulty, 4),
        "new_interval":     float(updated_card.scheduled_days),
        "new_repetitions":  updated_card.reps,
        "new_lapses":       updated_card.lapses,
        "new_learning_step": 0,
        "next_review_date": updated_card.due,
        "fsrs_stability":   round(updated_card.stability, 6),
        "retrievability":   round(retrievability, 4),
    }

def preview_intervals(flashcard) -> dict[str, str]:
    card = card_from_db(flashcard)
    now  = datetime.now(timezone.utc)
    result = {}
    for grade_str, rating in GRADE_TO_RATING.items():
        test_card, _ = _scheduler.review_card(card, rating, now)
        result[grade_str] = _format_interval(float(test_card.scheduled_days))
    return result

def _format_interval(interval_days: float) -> str:
    if interval_days <= 0:
        return "<1m"
    total_minutes = interval_days * 24 * 60
    if total_minutes < 60:
        return f"{max(1, round(total_minutes))}m"
    if total_minutes < 24 * 60:
        h = round(total_minutes / 60, 1)
        return f"{int(h)}h" if h == int(h) else f"{h}h"
    if interval_days < 30:
        d = round(interval_days, 1)
        return f"{int(d)}d" if d == int(d) else f"{d}d"
    if interval_days < 365:
        mo = round(interval_days / 30, 1)
        return f"{int(mo)}mo" if mo == int(mo) else f"{mo}mo"
    y = round(interval_days / 365, 1)
    return f"{int(y)}y" if y == int(y) else f"{y}y"
