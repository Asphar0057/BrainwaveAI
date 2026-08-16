from __future__ import annotations

import sys
import types
import importlib
import asyncio
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

try:
    import starlette.concurrency  # noqa: F401
except ImportError:
    starlette_pkg = types.ModuleType("starlette")
    starlette_concurrency_stub = types.ModuleType("starlette.concurrency")

    async def _run_in_threadpool_stub(func, *args, **kwargs):
        return func(*args, **kwargs)

    starlette_concurrency_stub.run_in_threadpool = _run_in_threadpool_stub
    starlette_pkg.concurrency = starlette_concurrency_stub
    sys.modules.setdefault("starlette", starlette_pkg)
    sys.modules.setdefault("starlette.concurrency", starlette_concurrency_stub)

tutor_pkg = types.ModuleType("tutor")
tutor_pkg.__path__ = [str(BACKEND_DIR / "tutor")]
sys.modules["tutor"] = tutor_pkg

evaluator_stub = types.ModuleType("tutor.evaluator")
evaluator_stub.evaluate = lambda **kwargs: None
sys.modules["tutor.evaluator"] = evaluator_stub

chroma_stub = types.ModuleType("tutor.chroma_store")
chroma_stub.available = lambda: False
chroma_stub.retrieve_important = lambda *args, **kwargs: []
chroma_stub.retrieve_episodes = lambda *args, **kwargs: []
sys.modules["tutor.chroma_store"] = chroma_stub

nodes = importlib.import_module("tutor.nodes")


def test_detects_answer_to_previous_comprehension_check():
    state = {
        "user_input": (
            "Wave-particle duality means quantum objects can show wave-like behavior "
            "such as interference, but are detected in discrete particle-like events."
        ),
        "chat_history": [
            {
                "user": "Explain wave-particle duality.",
                "ai": (
                    "## Comprehension Check\n"
                    "To ensure you're following along, Aditya, can you briefly describe "
                    "what you understand by wave-particle duality and how it relates to quantum mechanics?"
                ),
            }
        ],
    }

    result = nodes.detect_intent(state)

    assert result["intent"] == "comprehension_answer"
    assert "wave-particle duality" in result["comprehension_check"]


def test_does_not_treat_new_question_as_check_answer():
    state = {
        "user_input": "Can you explain wave-particle duality again with an example?",
        "chat_history": [
            {
                "user": "Explain wave-particle duality.",
                "ai": (
                    "Comprehension Check: can you briefly describe how wave-particle "
                    "duality relates to quantum mechanics?"
                ),
            }
        ],
    }

    result = nodes.detect_intent(state)

    assert result["intent"] != "comprehension_answer"


@pytest.mark.parametrize("student_answer", ["crypto", "A", "yes", "mitosis", "3x^2/2", "I don't know"])
def test_detects_short_student_answers_to_your_turn(student_answer):
    result = nodes.detect_intent(
        {
            "user_input": student_answer,
            "tutor_mode": True,
            "chat_history": [
                {
                    "user": "Explain quantum computing.",
                    "ai": "Your turn: Can you think of a scenario where processing many possibilities is useful?",
                }
            ],
        }
    )

    assert result["intent"] == "comprehension_answer"
    assert "scenario" in result["comprehension_check"]


@pytest.mark.parametrize(
    "new_request",
    ["Can you explain cryptography?", "Teach me calculus instead", "new topic: biology", "thanks"],
)
def test_does_not_force_new_requests_or_acknowledgements_into_grading(new_request):
    result = nodes.detect_intent(
        {
            "user_input": new_request,
            "tutor_mode": True,
            "chat_history": [{"user": "Explain quantum computing.", "ai": "Your turn: name one useful scenario?"}],
        }
    )

    assert result["intent"] != "comprehension_answer"


@pytest.mark.parametrize(
    "help_request",
    [
        "I'm stuck on the coefficient. Give me the smallest hint.",
        "Help me with this step.",
        "Explain that again.",
    ],
)
def test_explicit_help_request_is_not_graded_as_an_attempt(help_request):
    result = nodes.detect_intent(
        {
            "user_input": help_request,
            "tutor_mode": True,
            "tutor_reply_style": "hint",
            "tutor_choice": None,
            "chat_history": [
                {"user": "Integrate 3x^2", "ai": "Your turn: integrate the first term."}
            ],
        }
    )

    assert result["intent"] == "confusion"


def test_short_answer_reaches_semantic_grader_with_previous_turn_context():
    prompts = []
    chat_history = [
        {
            "user": "Explain quantum computing.",
            "ai": "Your turn: Can you think of a scenario where processing many possibilities is useful?",
        }
    ]

    class FakeAiClient:
        def generate(self, prompt, max_tokens, temperature):
            prompts.append(prompt)
            return (
                '{"verdict":"correct","confidence":0.96,'
                '"rationale":"Cryptography is a valid application of quantum search and security research",'
                '"expected_answer":"a useful scenario such as cryptography or optimization",'
                '"next_action":"Explain why many possibilities help",'
                '"is_final_answer":false,"final_answer_correct":null,"misconception":""}'
            )

    detected = nodes.detect_intent(
        {
            "user_input": "crypto",
            "tutor_mode": True,
            "chat_history": chat_history,
        }
    )
    plan = nodes.TutorPlan(
        goal="Apply quantum computing",
        current_step=1,
        total_steps=2,
        steps=[
            {"id": 1, "title": "Name an application", "expected": "cryptography or optimization"},
            {"id": 2, "title": "Explain the benefit", "expected": "search many possibilities efficiently"},
        ],
        expected_step_answer="cryptography or optimization",
    )

    result = asyncio.run(
        nodes.evaluate_tutor_attempt(
            {
                "intent": detected["intent"],
                "comprehension_check": detected["comprehension_check"],
                "user_input": "crypto",
                "tutor_mode": True,
                "chat_history": chat_history,
                "tutor_session_state": {"next_action": "Name one useful scenario"},
                "tutor_plan": plan,
                "_ai_client": FakeAiClient(),
            }
        )
    )

    assert result["attempt_evaluation"].verdict == "correct"
    assert result["attempt_evaluation"].confidence == 0.96
    assert "Student attempt:\ncrypto" in prompts[0]
    assert "Previous tutor step to grade:" in prompts[0]

    progressed = nodes.update_tutor_plan_progress(
        {"tutor_plan": plan, "attempt_evaluation": result["attempt_evaluation"]}
    )["tutor_plan"]
    assert progressed.current_step == 2
    assert progressed.expected_step_answer == "search many possibilities efficiently"


def test_power_rule_intermediate_equivalence_cannot_be_misgraded_by_model():
    class IncorrectGrader:
        def generate(self, prompt, max_tokens, temperature):
            raise AssertionError("deterministic equivalence should bypass the model grader")

    result = asyncio.run(
        nodes.evaluate_tutor_attempt(
            {
                "intent": "comprehension_answer",
                "user_input": "For the first term, I get x^3 because 3 cancels the denominator 3.",
                "tutor_mode": True,
                "chat_history": [
                    {
                        "user": "Help me solve the integral of 3x^2 + 4.",
                        "ai": "Can you integrate just the 3x^2 term using the power rule?",
                    }
                ],
                "tutor_session_state": {},
                "tutor_plan": nodes.TutorPlan(),
                "_ai_client": IncorrectGrader(),
            }
        )
    )

    evaluation = result["attempt_evaluation"]
    assert evaluation.verdict == "correct"
    assert evaluation.confidence == 0.99
    assert evaluation.next_action == "Integrate the constant term 4"


def test_comprehension_answer_task_uses_tutor_feedback_rubric():
    task = nodes._build_instructional_task(
        {
            "intent": "comprehension_answer",
            "user_input": "It is when particles behave like waves too.",
            "comprehension_check": "How does wave-particle duality relate to quantum mechanics?",
            "chat_history": [],
            "language_analysis": {"instructional_hint": "generic hint that should not win"},
        }
    )

    assert "answering your previous comprehension check" in task
    assert "direct verdict" in task
    assert "**Better answer**" in task
    assert "compact labels" in task
    assert "Omit empty labels" in task
    assert "generic hint" not in task


def test_normal_answer_format_is_editorial_not_forced_bullets():
    task = nodes._build_instructional_task(
        {
            "intent": "question",
            "user_input": "Explain DNS for a beginner.",
            "chat_history": [],
            "language_analysis": {},
        }
    )

    assert "Lead with the direct answer" in task
    assert "bullets for lists" in task
    assert "LaTeX only for actual mathematics" in task
    assert "every visible line" not in task.lower()


def test_nudge_mode_overrides_generic_confusion_strategy():
    task = nodes._build_instructional_task(
        {
            "intent": "confusion",
            "user_input": "I'm stuck. Give me one tiny hint.",
            "tutor_mode": True,
            "tutor_reply_style": "hint",
            "chat_history": [],
            "language_analysis": {
                "signal_type": "confusion",
                "instructional_hint": "Re-explain from scratch with a long analogy.",
            },
        }
    )

    assert "smallest useful hint only" in task
    assert "Do not solve the step" in task
    assert "long analogy" not in task


def test_valid_tutor_json_is_not_mistaken_for_contract_leak():
    response = (
        '{"answer":"**Hint:** Keep the coefficient outside the integral.",'
        '"tutor_state":{"verdict":"needs_attempt"},"options":[]}'
    )

    assert nodes._has_tutor_contract_leak(response) is False


def test_visible_schema_instructions_are_still_detected_as_contract_leak():
    assert nodes._has_tutor_contract_leak(
        "JSON schema: visible markdown answer with numbered step sections and LaTeX"
    ) is True


def test_general_memory_retrieval_is_scoped_to_current_chat(monkeypatch):
    calls = []
    monkeypatch.setattr(nodes.chroma_store, "available", lambda: True)
    monkeypatch.setattr(nodes.chroma_store, "retrieve_important", lambda *args, **kwargs: [])
    monkeypatch.setattr(
        nodes.chroma_store,
        "retrieve_episodes",
        lambda *args, **kwargs: calls.append((args, kwargs)) or ["same-chat memory"],
    )

    result = nodes.gate_and_retrieve(
        {
            "intent": "question",
            "user_input": "give me more",
            "user_id": "7",
            "chat_id": 42,
            "student_state": None,
            "context_doc_ids": [],
            "context_only": False,
            "use_hs_context": False,
        }
    )

    assert result["episodic_memories"] == ["same-chat memory"]
    assert calls[0][1]["chat_session_id"] == 42


def test_general_memory_is_not_retrieved_without_a_chat(monkeypatch):
    calls = []
    monkeypatch.setattr(nodes.chroma_store, "available", lambda: True)
    monkeypatch.setattr(nodes.chroma_store, "retrieve_important", lambda *args, **kwargs: [])
    monkeypatch.setattr(
        nodes.chroma_store,
        "retrieve_episodes",
        lambda *args, **kwargs: calls.append((args, kwargs)) or ["wrong-chat memory"],
    )

    result = nodes.gate_and_retrieve(
        {
            "intent": "question",
            "user_input": "tell me more",
            "user_id": "7",
            "chat_id": None,
            "student_state": None,
            "context_doc_ids": [],
            "context_only": False,
            "use_hs_context": False,
        }
    )

    assert result["episodic_memories"] == []
    assert calls == []


def test_detects_project_build_request():
    result = nodes.detect_intent(
        {
            "user_input": "Build me an AI study planner web app with login and progress tracking.",
            "chat_history": [],
        }
    )

    assert result["intent"] == "project_build"


def test_project_build_task_is_autonomous_and_result_oriented():
    task = nodes._build_instructional_task(
        {
            "intent": "project_build",
            "user_input": "Create a customer support chatbot project.",
            "student_state": None,
            "language_analysis": {},
        }
    )

    assert "choose one coherent default stack" in task
    assert "Do not make the student choose every framework" in task
    assert "project/file tree" in task
    assert "exact commands to run" in task
    assert "working end-to-end vertical slice" in task
    assert "acceptance criteria" in task
    assert "not an open-ended request for more parameters" in task


def test_conceptual_build_wording_is_not_mistaken_for_project_request():
    result = nodes.detect_intent(
        {
            "user_input": "Explain how birds build nests.",
            "chat_history": [],
        }
    )

    assert result["intent"] == "question"


def test_system_design_explanation_is_not_mistaken_for_project_request():
    result = nodes.detect_intent(
        {
            "user_input": "Explain the main principles of system design.",
            "chat_history": [],
        }
    )

    assert result["intent"] == "question"


def test_project_build_followup_stays_in_delivery_mode():
    result = nodes.detect_intent(
        {
            "user_input": "Can you also build the backend API for this app?",
            "chat_history": [{"user": "Plan a dashboard", "ai": "Here is the plan."}],
        }
    )

    assert result["intent"] == "project_build"


def test_greeting_plus_project_request_stays_in_delivery_mode():
    result = nodes.detect_intent(
        {
            "user_input": "Hey, build me a React dashboard for tracking study progress.",
            "chat_history": [],
        }
    )

    assert result["intent"] == "project_build"


def test_slide_explorer_study_context_cannot_be_misrouted_as_project_build():
    result = nodes.detect_intent(
        {
            "user_input": (
                "[[PRESENTATION_STUDY_CONTEXT]] Teach me this deck. "
                "One slide mentions an app, a tool, and how to create a chart."
            ),
            "chat_history": [],
        }
    )

    assert result["intent"] == "question"


def test_searchhub_handoff_cannot_be_misrouted_as_project_build():
    result = nodes.detect_intent(
        {
            "user_input": (
                "[[SEARCHHUB_HANDOFF_CONTEXT]] Continue helping me compare TCP and UDP. "
                "The retrieved context mentions an application, system, and workflow."
            ),
            "chat_history": [],
        }
    )

    assert result["intent"] == "question"


def test_vague_project_response_is_marked_for_repair():
    response = (
        "You could consider React or Vue for the frontend and perhaps use a backend framework. "
        "Think about authentication and deployment. What framework would you prefer?"
    )

    assert nodes._project_response_needs_repair(response) is True


def test_concrete_project_response_does_not_need_repair():
    response = """
## Outcome and assumptions
Build a runnable task API. Defaults: Python and PostgreSQL.

## Stack and architecture
FastAPI handles HTTP, PostgreSQL stores tasks, and Docker Compose runs both services.

## Project structure
app/
  main.py
  models.py
tests/
  test_tasks.py

## Implementation
Run `pip install fastapi uvicorn sqlalchemy psycopg2-binary`.
Create `app/main.py`, add `POST /tasks`, and return the persisted task.

## Verification and acceptance criteria
Run `python -m pytest` and `uvicorn app.main:app --reload`.
Verify that creating a task returns HTTP 201 and that the task remains after restart.
"""

    assert nodes._project_response_needs_repair(response) is False
