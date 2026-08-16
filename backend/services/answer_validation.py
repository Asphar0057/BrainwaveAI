import re
import unicodedata
from typing import Iterable, Optional


_OPTION_LABEL_RE = re.compile(r"^(?:option\s*)?([A-Da-d])(?:[).:\-])?$", re.IGNORECASE)


def canonical_answer(value) -> str:
    """Normalize display-equivalent answers without changing their meaning."""
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("−", "-").replace("–", "-").replace("—", "-")
    text = re.sub(r"^\s*[A-Da-d][).:\-]\s+", "", text)
    text = re.sub(r"\\(?:text|mathrm|mathbf|mathit)\s*\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}", r"\1/\2", text)
    text = text.replace("\\(", "").replace("\\)", "")
    text = text.replace("\\[", "").replace("\\]", "")
    text = text.replace("$", "").replace("^", "")
    text = re.sub(r"\\,|\\;|\\!", " ", text)
    text = re.sub(r"[^\w.+\-/]+", " ", text.lower(), flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def resolve_option_answer(answer, options: Optional[Iterable] = None) -> str:
    raw = str(answer or "").strip()
    option_list = [str(option or "").strip() for option in (options or [])]
    match = _OPTION_LABEL_RE.fullmatch(raw)
    if match:
        index = ord(match.group(1).upper()) - ord("A")
        if 0 <= index < len(option_list):
            return option_list[index]

    normalized = canonical_answer(raw)
    for option in option_list:
        if normalized and canonical_answer(option) == normalized:
            return option
    return raw


def answers_equivalent(user_answer, correct_answer, options: Optional[Iterable] = None) -> bool:
    user_resolved = resolve_option_answer(user_answer, options)
    correct_resolved = resolve_option_answer(correct_answer, options)
    return bool(canonical_answer(user_resolved)) and canonical_answer(user_resolved) == canonical_answer(correct_resolved)


def sanitize_generated_questions(questions, *, question_count: int, difficulty: str = "mixed") -> list[dict]:
    """Reject malformed questions and persist the exact option used for grading."""
    sanitized: list[dict] = []
    requested_difficulty = difficulty if difficulty in {"easy", "medium", "hard"} else None

    for raw_question in questions or []:
        if not isinstance(raw_question, dict):
            continue
        question = dict(raw_question)
        question_text = str(question.get("question_text") or question.get("question") or "").strip()
        if not question_text:
            continue

        question_type = str(question.get("question_type") or "multiple_choice").strip().lower().strip("$")
        options = [str(option or "").strip() for option in (question.get("options") or [])]
        options = list(dict.fromkeys(option for option in options if option))
        correct_answer = resolve_option_answer(question.get("correct_answer"), options)

        # Math rendering must never turn schema enum values into display math. Repair
        # both legacy "$multiple_choice$" rows and malformed model output here.
        if question_type not in {"multiple_choice", "true_false", "short_answer", "fill_blank"}:
            question_type = "multiple_choice" if options else "short_answer"

        if question_type == "multiple_choice":
            if len(options) != 4:
                continue
            matching_option = next(
                (option for option in options if answers_equivalent(option, correct_answer, options)),
                None,
            )
            if not matching_option:
                continue
            correct_answer = matching_option
        elif question_type == "true_false":
            options = ["True", "False"]
            correct_answer = resolve_option_answer(correct_answer, options)
            if canonical_answer(correct_answer) not in {"true", "false"}:
                continue
        elif not canonical_answer(correct_answer):
            continue

        question.update({
            "question_text": question_text,
            "question_type": question_type,
            "options": options,
            "correct_answer": correct_answer,
            "difficulty": requested_difficulty or (
                question.get("difficulty") if question.get("difficulty") in {"easy", "medium", "hard"} else "medium"
            ),
        })
        sanitized.append(question)
        if len(sanitized) >= question_count:
            break

    return sanitized
