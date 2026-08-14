from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from services.memory_service import CerbylMemoryService, MemoryEvent, _build_content, _is_preference


@pytest.mark.parametrize(
    "message",
    [
        "I prefer answers with concise bullet points.",
        "From now on, use a friendly tone.",
        "Please keep your responses shorter.",
        "I learn better with concrete examples.",
        "Always explain equations step by step.",
        "Don't suggest practice quizzes unless I ask.",
    ],
)
def test_explicit_response_preferences_are_durable(message):
    assert _is_preference(message)
    content, memory_type = _build_content(MemoryEvent(source="chat", message=message))
    assert memory_type == "user_preference"
    assert content.startswith("User preference instruction:")


@pytest.mark.parametrize(
    "message",
    [
        "Write a concise JavaScript function binarySearch(arr, target) that returns the index or -1.",
        "Remember the causes of World War I for my exam.",
        "Explain formal charge in chemistry.",
        "Give me a longer example of mitosis.",
        "Be serious: is this chest pain dangerous?",
    ],
)
def test_one_off_tasks_are_not_saved_as_preferences(message):
    assert not _is_preference(message)
    content, memory_type = _build_content(MemoryEvent(source="chat", message=message))
    assert memory_type != "user_preference"
    assert "User preference instruction:" not in content


def test_memory_upsert_uses_packaged_vector_store(monkeypatch):
    from services import vector_store

    calls = []
    monkeypatch.setattr(vector_store, "available", lambda: True)
    monkeypatch.setattr(vector_store, "upsert", lambda *args, **kwargs: calls.append((args, kwargs)))
    service = CerbylMemoryService(lambda _text: [0.1, 0.2])
    row = SimpleNamespace(
        memory_hash="memory-1",
        concept_id="dns",
        source="chat",
        memory_type="question",
        importance_score=0.5,
        created_at=datetime(2026, 8, 15),
    )

    service._upsert_chroma("7", row, "Student asked about DNS")

    assert len(calls) == 1
    assert calls[0][0][0] == "memories"
    assert calls[0][1]["user_id"] == "7"
