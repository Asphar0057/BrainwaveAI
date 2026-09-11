"""Regression coverage for difficulty, pending-question state, and AI call count."""
import asyncio
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from tutor import nodes
from tutor.difficulty import requested_level, resolve_level
from tutor.state import AttemptEvaluation, StudentState, TutorPlan


@pytest.mark.parametrize("student_request,level", [
    ("I'm new to probability", "beginner"),
    ("Is my reasoning correct? Explain simply.", "beginner"),
    ("I understand basic probability. Give a counterexample.", "advanced"),
    ("Use intermediate difficulty", "intermediate"),
    ("I am not advanced. Help me.", "beginner"),
    ("I tried advanced questions; now make it easier", "beginner"),
    ("What is probability?", None),
])
def test_requested_difficulty(student_request, level):
    assert requested_level(student_request) == level


def test_explicit_level_overrides_profile_session_and_streak():
    assert resolve_level({
        "user_input": "Explain simply",
        "student_state": StudentState(difficulty_level="advanced"),
        "tutor_session_state": {"level": "advanced", "correct_streak": 2},
    }) == "beginner"
    assert resolve_level({"tutor_session_state": {"level": "beginner", "correct_streak": 2}}) == "intermediate"
    assert resolve_level({"tutor_session_state": {"level": "intermediate", "correct_streak": 3}}) == "intermediate"


def test_grading_does_not_replace_the_new_question_with_the_old_answer():
    from routes.chat import _apply_attempt_evaluation
    pending = {"next_action": "What is the chance of blue?", "expected_step_answer": "3/4"}
    _, result = _apply_attempt_evaluation("Correct: gold has probability 1/4. What is the chance of blue?", pending,
        AttemptEvaluation(verdict="correct", confidence=.99, expected_answer="1/4", next_action="Count all counters"))
    assert result["expected_step_answer"] == "3/4"
    assert result["next_action"] == pending["next_action"]
    assert result["_attempt_verified"] is True


def test_new_tutor_turn_needs_only_one_generation_call():
    class AI:
        calls = []
        def generate(self, prompt, max_tokens, temperature):
            self.calls.append(prompt)
            return json.dumps({"answer": "Count every counter. How many are there?", "options": [],
                "tutor_state": {"level": "advanced", "next_action": "How many are there?",
                    "expected_step_answer": "4", "current_step": 1, "total_steps": 3}})
    ai = AI()
    state = {"tutor_mode": True, "user_input": "I'm new to probability", "intent": "question", "_ai_client": ai}
    state.update(asyncio.run(nodes.plan_tutor_steps(state)))
    state.update(asyncio.run(nodes.evaluate_tutor_attempt(state)))
    result = asyncio.run(nodes.build_prompt_and_respond(state))
    state.update(result)
    asyncio.run(nodes.evaluate_response(state))
    assert len(ai.calls) == 1
    assert result["tutor_level"] == "beginner"
    assert json.loads(result["response"])["tutor_state"]["level"] == "beginner"
    assert result["tutor_plan"].expected_step_answer == "4"


def test_verified_attempt_does_not_trigger_speculative_outcome_evaluation():
    class AI:
        def generate(self, *args, **kwargs):
            pytest.fail("Must reuse the verified attempt rather than grade the tutor's own explanation")
    result = asyncio.run(nodes.evaluate_response({"tutor_mode": True, "_ai_client": AI(),
        "attempt_evaluation": AttemptEvaluation(verdict="correct", confidence=.99, rationale="Correct substep")}))
    assert result["evaluation"].mastery_confirmed is None
    assert result["evaluation"].strategy_worked is None


def test_generated_pending_step_and_citations_survive_reconciliation():
    from routes.chat import _apply_tutor_plan
    state = {"tutor_mode": True, "user_input": "Keep it simple", "tutor_plan": TutorPlan(
        steps=[{"id": 1, "title": "Count", "expected": "4"}], current_step=2, total_steps=3),
        "rag_sources": [{"index": 1, "book_title": "Probability", "page": 2}]}
    result = nodes._completed_tutor_response(state, json.dumps({"answer": "Use all outcomes [1]. What is P(blue)?",
        "options": [], "tutor_state": {"current_step": 2, "total_steps": 3, "next_action": "What is P(blue)?",
        "expected_step_answer": "3/4", "level": "advanced"}}), "Teach")
    payload = json.loads(result["response"])
    reconciled = _apply_tutor_plan(payload["tutor_state"], result["tutor_plan"])
    assert reconciled["lesson_plan"]["current_step"] == 2
    assert reconciled["expected_step_answer"] == "3/4"
    assert "Probability" in payload["answer"]


def test_quality_review_repairs_arithmetic_and_repeated_question_together():
    class Reviewer:
        def generate(self, prompt, max_tokens, temperature):
            assert "Recompute any numerical example" in prompt
            return json.dumps({"ok": False,
                "answer": "Four sectors of weight 1 and one of weight 2 total 6. P(E)=2/6. What is P(A)?",
                "next_action": "What is P(A)?", "expected_step_answer": "1/6", "options": []})
    candidate = json.dumps({"answer": "Total is 5, P(E)=2/5. What is P(E)?", "options": [],
        "tutor_state": {"next_action": "What is P(E)?", "expected_step_answer": "2/5"}})
    result = asyncio.run(nodes.review_tutor_response({"tutor_mode": True, "intent": "question",
        "response": candidate, "user_input": "Give a counterexample", "_ai_client": Reviewer()}))
    payload = json.loads(result["response"])
    assert "total 6" in payload["answer"]
    assert payload["tutor_state"]["expected_step_answer"] == "1/6"
    assert result["tutor_plan"].expected_step_answer == "1/6"


def test_failed_quality_review_does_not_pass_unchecked_content():
    class Reviewer:
        def generate(self, *args):
            return "temporary provider error"
    with pytest.raises(RuntimeError, match="quality check"):
        asyncio.run(nodes.review_tutor_response({"tutor_mode": True, "intent": "question",
            "response": '{"answer":"Example","tutor_state":{}}', "_ai_client": Reviewer()}))


def test_requested_short_counterexample_is_not_forced_into_an_analogy():
    from tutor.prompt import build_tutor_prompt
    prompt = build_tutor_prompt({"tutor_mode": True, "intent": "question", "selected_style": "Bridge",
        "user_input": "Give one short numerical counterexample."})
    assert "ANALOGY FIRST" not in prompt


def test_only_the_saved_pending_action_is_rendered():
    text = "There are 4 counters, 1 gold.\n\n**Step 2 – Your turn:** How many are gold? What is P(gold)?"
    rendered = nodes._render_pending_action(text, "What is P(gold)?")
    assert "How many are gold?" not in rendered
    assert rendered.count("?") == 1
    assert "There are 4 counters" in rendered


def test_new_question_setup_is_never_stripped():
    text = "Unequal outcomes need weights.\n\n**Check:** A spinner has P(A)=0.7 and P(B)=0.3. What is P(B)?"
    assert "P(A)=0.7" in nodes._render_pending_action(text, "What is P(B)?")


def test_transient_provider_limit_does_not_exhaust_a_daily_key_or_retry(monkeypatch):
    from types import SimpleNamespace
    from services.ai_utils import UnifiedAIClient
    from services.ai_result import AIProviderBusyError
    class RateLimit(Exception):
        status_code = 429
    calls = []
    def create(**kwargs):
        calls.append(kwargs)
        raise RateLimit("tokens per minute exceeded")
    client = UnifiedAIClient(groq_client=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    monkeypatch.setattr(client, "_mark_key_exhausted", lambda *args: pytest.fail("Temporary throttle is not a daily limit"))
    monkeypatch.setattr(client, "_fallback", lambda *args: pytest.fail("Do not hide interactive capacity limits in retries"))
    with pytest.raises(AIProviderBusyError):
        client.generate_json("Return JSON")
    assert len(calls) == 1


def test_provider_busy_error_has_a_clear_retry_instruction():
    from fastapi import HTTPException
    from services.ai_result import AIProviderBusyError, AIWorkflowError
    from routes.chat import _raise_if_usage_limit_error
    error = AIWorkflowError("graph failed")
    error.__cause__ = AIProviderBusyError(10)
    with pytest.raises(HTTPException) as result:
        _raise_if_usage_limit_error(error)
    assert result.value.status_code == 503
    assert result.value.headers["Retry-After"] == "10"
    assert "retry in 10 seconds" in result.value.detail["message"]


def test_groq_structured_tutor_calls_keep_json_mode_and_usage_accounting(monkeypatch):
    from types import SimpleNamespace
    from services.ai_utils import UnifiedAIClient
    calls, usage = [], []
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok":true}'))], usage=None)
    client = UnifiedAIClient(groq_client=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    monkeypatch.setattr(client, "_log_usage", lambda *args, **kwargs: usage.append(kwargs))
    assert json.loads(client.generate_json("Return JSON", 500, 0))["ok"] is True
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert usage[0]["provider"] == "groq"
    client.generate("ordinary chat", 500, .2)
    assert "response_format" not in calls[1]
