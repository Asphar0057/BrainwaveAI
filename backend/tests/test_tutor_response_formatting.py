from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from routes.chat import (
    _apply_attempt_evaluation,
    _ensure_quiz_question,
    _normalize_tutor_answer_markdown,
)


def test_double_escaped_markdown_newlines_are_restored_without_breaking_latex():
    raw = r"### Verdict\nThe answer is partly correct.\n### Next\nUse \neq and \nu as written."
    result = _normalize_tutor_answer_markdown(raw)

    assert result.startswith("### Verdict\nThe answer is partly correct.")
    assert "\n### Next\n" in result
    assert r"\neq" in result
    assert r"\nu" in result


def test_partly_correct_phrase_is_not_deleted_by_attempt_reconciliation():
    response = "### Verdict\nThe answer is partly correct because the constant is missing."
    evaluation = SimpleNamespace(
        verdict="partly_correct",
        confidence=0.9,
        rationale="The integrated term is right.",
        expected_answer="x^3 + C",
        next_action="Add the integration constant.",
        is_final_answer=False,
        final_answer_correct=None,
        misconception="",
    )

    answer, state = _apply_attempt_evaluation(response, {}, evaluation)

    assert "partly correct" in answer
    assert "partly ." not in answer
    assert state["verdict"] == "partly_correct"


def test_correct_graph_verdict_replaces_contradictory_generated_feedback():
    response = "## Verdict\n\nPartly correct. You forgot the coefficient.\n\n## Better answer\n\nTry again."
    evaluation = SimpleNamespace(
        verdict="correct",
        confidence=0.99,
        rationale="the coefficient cancels the power-rule denominator",
        expected_answer="x^3",
        next_action="Integrate the constant term 4",
        is_final_answer=False,
        final_answer_correct=None,
        misconception="",
    )

    answer, state = _apply_attempt_evaluation(response, {}, evaluation)

    assert answer.startswith("## Verdict\n\nCorrect")
    assert "forgot the coefficient" not in answer
    assert "Integrate the constant term 4" in answer
    assert state["verdict"] == "correct"


def test_attempt_reconciliation_decodes_late_double_escaped_markdown():
    response = r"### Verdict\nCorrect.\n### Next step\nIntegrate the constant."
    evaluation = SimpleNamespace(
        verdict="correct",
        confidence=0.99,
        rationale="the requested step is right",
        expected_answer="x^3",
        next_action="Integrate the constant",
        is_final_answer=False,
        final_answer_correct=None,
        misconception="",
    )

    answer, _ = _apply_attempt_evaluation(response, {}, evaluation)

    assert "### Verdict\nCorrect." in answer
    assert r"Verdict\nCorrect" not in answer


def test_quiz_choices_never_render_without_a_visible_question():
    answer = _ensure_quiz_question(
        "Consider the law and choose carefully.",
        [{"label": "A", "text": "It remains at rest"}],
        "quiz",
        "Give me one multiple-choice question about Newton's first law.",
    )

    assert answer.startswith("**Question:**")
    assert "Newton's first law" in answer
    assert "?" in answer


def test_existing_quiz_question_is_preserved():
    answer = _ensure_quiz_question(
        "What remains unchanged when no net force acts?",
        [{"label": "A", "text": "Velocity"}],
        "quiz",
        "Quiz me on physics.",
    )

    assert answer == "What remains unchanged when no net force acts?"
