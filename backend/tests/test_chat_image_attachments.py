from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


class FakeUpload:
    def __init__(self, filename: str, content_type: str, data: bytes):
        self.filename = filename
        self.content_type = content_type
        self._data = data

    async def read(self) -> bytes:
        return self._data


def _load_chat_module(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-that-is-long-enough-for-jwt")
    monkeypatch.setenv("GROQ_API_KEY", "dummy")
    backend_root = str(Path(__file__).resolve().parents[1])
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)
    return importlib.import_module("routes.chat")


def test_image_is_analyzed_even_when_context_documents_are_selected(monkeypatch):
    chat = _load_chat_module(monkeypatch)
    import deps

    class FakeVisionClient:
        def __init__(self):
            self.calls = []

        def generate_with_images(self, prompt, images, max_tokens, temperature):
            self.calls.append((prompt, images, max_tokens, temperature))
            return "The image contains a neural-network architecture diagram."

    vision = FakeVisionClient()
    monkeypatch.setattr(deps, "unified_ai", vision)
    monkeypatch.setattr(
        chat.StorageService,
        "get_storage",
        staticmethod(lambda: SimpleNamespace(storage_type="local")),
    )
    monkeypatch.setattr(chat, "_store_chat_upload", lambda *args: "uploads/chat_images/test.png")

    result = asyncio.run(
        chat.ask_with_files(
            user_id="tester",
            question="Explain this image.",
            original_question="Explain this image.",
            chat_id=None,
            use_hs_context=True,
            context_doc_ids="selected-vault-document",
            tutor_mode=False,
            tutor_reply_style="guided",
            tutor_choice=None,
            files=[FakeUpload("diagram.png", "application/octet-stream", b"fake-png-data")],
            db=SimpleNamespace(),
            current_user=SimpleNamespace(id=1, username="tester", email=None),
        )
    )

    assert result["answer"].startswith("The image contains")
    assert result["images_analyzed"] == 1
    assert result["has_file_context"] is True
    assert len(vision.calls) == 1
    assert vision.calls[0][1][0]["mime_type"] == "image/png"


def test_missing_file_is_rejected_instead_of_using_chat_history(monkeypatch):
    chat = _load_chat_module(monkeypatch)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            chat.ask_with_files(
                user_id="tester",
                question="Explain this image.",
                original_question="Explain this image.",
                chat_id=None,
                use_hs_context=True,
                context_doc_ids=None,
                tutor_mode=False,
                tutor_reply_style="guided",
                tutor_choice=None,
                files=[],
                db=SimpleNamespace(),
                current_user=SimpleNamespace(id=1, username="tester", email=None),
            )
        )

    assert exc_info.value.status_code == 422
    assert "No attachment reached the server" in exc_info.value.detail


def test_vision_failure_does_not_fall_back_to_previous_chat_topic(monkeypatch):
    chat = _load_chat_module(monkeypatch)
    import deps

    class FailingVisionClient:
        def generate_with_images(self, prompt, images, max_tokens, temperature):
            raise RuntimeError("temporary provider failure")

    monkeypatch.setattr(deps, "unified_ai", FailingVisionClient())
    monkeypatch.setattr(
        chat.StorageService,
        "get_storage",
        staticmethod(lambda: SimpleNamespace(storage_type="local")),
    )
    monkeypatch.setattr(chat, "_store_chat_upload", lambda *args: "uploads/chat_images/test.png")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            chat.ask_with_files(
                user_id="tester",
                question="Explain this image.",
                original_question="Explain this image.",
                chat_id=None,
                use_hs_context=True,
                context_doc_ids="selected-vault-document",
                tutor_mode=False,
                tutor_reply_style="guided",
                tutor_choice=None,
                files=[FakeUpload("diagram.png", "image/png", b"fake-png-data")],
                db=SimpleNamespace(),
                current_user=SimpleNamespace(id=1, username="tester", email=None),
            )
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["code"] == "ai_attachment_failed"


def test_person_identity_request_returns_privacy_safe_response(monkeypatch):
    chat = _load_chat_module(monkeypatch)
    import deps

    class VisionMustNotRun:
        def generate_with_images(self, prompt, images, max_tokens, temperature):
            raise AssertionError("Vision provider should not be called for identity requests")

    monkeypatch.setattr(deps, "unified_ai", VisionMustNotRun())
    monkeypatch.setattr(
        chat.StorageService,
        "get_storage",
        staticmethod(lambda: SimpleNamespace(storage_type="local")),
    )
    monkeypatch.setattr(chat, "_store_chat_upload", lambda *args: "uploads/chat_images/test.jpg")

    result = asyncio.run(
        chat.ask_with_files(
            user_id="tester",
            question="Who is this?",
            original_question="Who is this?",
            chat_id=None,
            use_hs_context=True,
            context_doc_ids=None,
            tutor_mode=False,
            tutor_reply_style="guided",
            tutor_choice=None,
            files=[FakeUpload("person.jpg", "image/jpeg", b"fake-jpeg-data")],
            db=SimpleNamespace(),
            current_user=SimpleNamespace(id=1, username="tester", email=None),
        )
    )

    assert result["ai_provider"] == "privacy_guard"
    assert "can’t identify" in result["answer"]
