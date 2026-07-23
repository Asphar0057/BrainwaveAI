"""Deterministic difficulty-mix allocation shared by question generators."""

from typing import Dict


DIFFICULTY_LEVELS = ("easy", "medium", "hard")


def allocate_difficulty_counts(
    question_count: int,
    difficulty_distribution: Dict[str, int],
) -> Dict[str, int]:
    """Allocate exact counts with largest-remainder rounding.

    Zero-weight difficulties stay at zero and the result always sums to the
    requested question count.
    """
    count = max(int(question_count or 0), 0)
    weights = {
        level: max(float((difficulty_distribution or {}).get(level, 0) or 0), 0.0)
        for level in DIFFICULTY_LEVELS
    }
    total_weight = sum(weights.values())
    if total_weight <= 0:
        weights = {"easy": 3.0, "medium": 5.0, "hard": 2.0}
        total_weight = 10.0

    raw = {
        level: count * weights[level] / total_weight
        for level in DIFFICULTY_LEVELS
    }
    allocated = {level: int(raw[level]) for level in DIFFICULTY_LEVELS}
    remaining = count - sum(allocated.values())
    priority = sorted(
        DIFFICULTY_LEVELS,
        key=lambda level: (
            raw[level] - allocated[level],
            weights[level],
            -DIFFICULTY_LEVELS.index(level),
        ),
        reverse=True,
    )
    for level in priority[:remaining]:
        allocated[level] += 1
    return allocated
