from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from tutor.prompt import build_tutor_prompt


def _state(**overrides):
    state = {
        "student_state": None,
        "episodic_memories": [],
        "structured_context": [],
        "chat_history": [],
        "instructional_task": "Answer directly.",
        "user_input": "What did I ask you to explain?",
        "rag_context": [],
        "rag_sources": [],
        "language_analysis": {},
        "selected_style": "Bridge",
        "intent": "followup",
        "context_only": False,
        "tutor_mode": False,
    }
    state.update(overrides)
    return state


def test_current_chat_history_is_authoritative_and_not_overridden_by_normal_mode_style():
    prompt = build_tutor_prompt(
        _state(
            chat_history=[
                {
                    "user": "Explain how DNS works for a beginner.",
                    "ai": "DNS translates a domain name into an IP address.",
                }
            ]
        )
    )

    assert "authoritative conversation record" in prompt
    assert "Explain how DNS works for a beginner" in prompt
    assert "DNS translates a domain name" in prompt
    assert "TEACHING FORMAT — ANALOGY FIRST" not in prompt


def test_adaptive_teaching_style_is_reserved_for_tutor_mode():
    prompt = build_tutor_prompt(_state(tutor_mode=True, intent="question"))
    assert "TEACHING FORMAT — ANALOGY FIRST" in prompt
    assert "[TUTOR MODE ACTIVE]" in prompt


def test_nudge_check_and_drill_are_not_overridden_by_adaptive_style():
    for reply_style in ("hint", "check", "quiz"):
        prompt = build_tutor_prompt(
            _state(tutor_mode=True, intent="question", tutor_reply_style=reply_style)
        )
        assert "[TUTOR MODE ACTIVE]" in prompt
        assert "TEACHING FORMAT — ANALOGY FIRST" not in prompt


def test_drill_prompt_requires_clickable_options_for_explicit_mcq_request():
    prompt = build_tutor_prompt(
        _state(
            tutor_mode=True,
            intent="question",
            tutor_reply_style="quiz",
            user_input="Give me one multiple-choice question about Newton's first law.",
        )
    )

    assert "provide exactly one question and 3-4 choices in the options array" in prompt
    assert "do not repeat choices in the answer text" in prompt
