"""One difficulty decision for prompts, API labels, and saved tutor sessions."""
import re

LEVELS = ("beginner", "intermediate", "advanced")


def requested_level(text: str):
    requests = []
    patterns = {
        "beginner": r"\b(?:beginner|new to|just starting|explain simply|keep it simple|make it easier|not (?:an? )?advanced)\b",
        "intermediate": r"\bintermediate\b",
        "advanced": r"\b(?:advanced|rigorous|more challenging|make it harder|(?:i )?(?:already )?(?:understand|know) (?:the )?basics?)\b",
    }
    for level, pattern in patterns.items():
        for match in re.finditer(pattern, text or "", re.I):
            prefix = (text or "")[max(0, match.start() - 10):match.start()]
            if re.search(r"\bnot (?:an? )?$", prefix, re.I):
                continue
            requests.append((match.end(), level))
    return max(requests)[1] if requests else None


def resolve_level(state: dict) -> str:
    explicit = requested_level(state.get("user_input", ""))
    if explicit:
        return explicit
    session = state.get("tutor_session_state") or {}
    student = state.get("student_state")
    level = session.get("level") or getattr(student, "difficulty_level", "intermediate")
    level = level if level in LEVELS else "intermediate"
    # Adapt on the NEXT response, after two verified attempts; never relabel
    # an already-generated explanation during persistence.
    index = LEVELS.index(level)
    if session.get("correct_streak") == 2:
        index = min(2, index + 1)
    elif session.get("wrong_streak") == 2:
        index = max(0, index - 1)
    return LEVELS[index]
