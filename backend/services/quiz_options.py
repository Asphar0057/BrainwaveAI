import random
from typing import Optional


def shuffle_question_options(question: dict) -> Optional[dict]:
    """Randomize answer placement without ever inventing option A as the key."""
    options = list(question.get("options") or [])
    if len(options) < 2:
        return None

    raw_answer = question.get("correct_answer")
    correct_index = None
    if isinstance(raw_answer, int) and not isinstance(raw_answer, bool):
        correct_index = raw_answer
    elif isinstance(raw_answer, str):
        normalized = raw_answer.strip()
        if normalized.upper() in {"A", "B", "C", "D"}:
            correct_index = ord(normalized.upper()) - ord("A")
        elif normalized.isdigit():
            correct_index = int(normalized)
        else:
            correct_index = next(
                (index for index, option in enumerate(options) if str(option).strip().casefold() == normalized.casefold()),
                None,
            )

    if correct_index is None or correct_index < 0 or correct_index >= len(options):
        return None

    indexed_options = list(enumerate(options))
    random.shuffle(indexed_options)
    shuffled = dict(question)
    shuffled["options"] = [option for _, option in indexed_options]
    shuffled["correct_answer"] = next(
        new_index for new_index, (old_index, _) in enumerate(indexed_options) if old_index == correct_index
    )
    return shuffled
