from __future__ import annotations

import sys
import types
import importlib
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

tutor_pkg = types.ModuleType("tutor")
tutor_pkg.__path__ = [str(BACKEND_DIR / "tutor")]
sys.modules["tutor"] = tutor_pkg

prompt_stub = types.ModuleType("tutor.prompt")
prompt_stub.build_tutor_prompt = lambda state: ""
sys.modules["tutor.prompt"] = prompt_stub

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
    assert "Every visible line must start with '- '" in task
    assert "**Better answer**" in task
    assert "Do not write a paragraph" in task
    assert "generic hint" not in task


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
