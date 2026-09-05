"""Run independently: isolates provider dependencies, uses real ASGI/SQLAlchemy/LangGraph."""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import timedelta
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
_scratch = tempfile.TemporaryDirectory(prefix="cerbyl-ai-safety-")
os.environ["DATABASE_URL"] = f"sqlite:///{_scratch.name}/test.db"
os.environ["SECRET_KEY"] = "test-only-secret-not-used-to-contact-any-service"

import database
import models
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# No production env loader or paid provider initialization is involved.
deps = ModuleType("deps")
deps.get_db = database.get_db
deps.get_current_user = lambda: None
deps.call_ai = Mock(return_value="A source-grounded answer")
deps.call_ai_async = AsyncMock(return_value="answer")
deps.unified_ai = None
deps.hs_context_ai = None
sys.modules["deps"] = deps
style_model = ModuleType("dkt.style_bandit")
style_model.STYLE_INSTRUCTIONS = {}
sys.modules["dkt.style_bandit"] = style_model

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from services.ai_result import AIWorkflowError, require_ai_success
from services import ai_job_lifecycle as lifecycle, ai_semantic_cache
from routes import chat, ai_jobs
from tutor import graph, nodes
import worker


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    engine.dispose()


def user_and_chat(db):
    user = models.User(username="learner", email="learner@example.invalid", hashed_password="test")
    db.add(user)
    db.flush()
    conversation = models.ChatSession(user_id=user.id, title="Test")
    db.add(conversation)
    db.commit()
    return user, conversation


def new_job(db, **kwargs):
    user = db.query(models.User).first()
    if user is None:
        user, _ = user_and_chat(db)
    job = models.AIJob(user_id=user.id, input_json={"prompt": "Explain"}, **kwargs)
    db.add(job)
    db.commit()
    return job


@pytest.mark.parametrize("payload", [
    {"answer": "Sorry", "query_type": "error"},
    {"response": "Sorry", "error": "timeout"},
    {"attachment_error": "image failed"},
    {"success": False}, {"status": "failed"},
])
def test_failure_payloads_are_never_success(payload):
    with pytest.raises(AIWorkflowError):
        require_ai_success(payload)


def test_graph_failure_skips_evaluation_and_persistence(monkeypatch):
    for name in ("detect_intent", "analyze_message", "fetch_student_state", "gate_and_retrieve",
                 "plan_tutor_steps", "evaluate_tutor_attempt", "update_tutor_plan_progress", "select_teaching_style"):
        monkeypatch.setattr(nodes, name, lambda state: {})
    monkeypatch.setattr(nodes, "build_prompt_and_respond", lambda state: {"response": "Sorry", "error": "provider timeout"})
    evaluate = Mock(side_effect=AssertionError("must not evaluate failure"))
    persist = Mock(side_effect=AssertionError("must not persist failure"))
    monkeypatch.setattr(nodes, "evaluate_response", evaluate)
    monkeypatch.setattr(nodes, "persist_updates", persist)
    with pytest.raises(AIWorkflowError):
        asyncio.run(graph.TutorGraph(None).invoke("1", "question"))
    evaluate.assert_not_called()
    persist.assert_not_called()


@pytest.mark.parametrize("hs", [False, True])
def test_selected_document_grounding_independent_of_hs(hs):
    captured = {}
    async def run(state):
        captured.update(state)
        return {"response": "answer"}
    tutor = object.__new__(graph.TutorGraph)
    tutor._graph = SimpleNamespace(ainvoke=run)
    tutor.ai_client = tutor.hs_ai_client = tutor.db_factory = None
    asyncio.run(tutor.invoke("1", "question", use_hs_context=hs, context_doc_ids=["private-doc"]))
    assert captured["context_only"] is True


def test_selected_document_fallback_never_uses_model_only(monkeypatch):
    from services import context_store
    monkeypatch.setattr(context_store, "available", lambda: False)
    generate = Mock()
    monkeypatch.setattr(chat, "call_ai", generate)
    with pytest.raises(RuntimeError):
        chat._context_only_fallback_answer("1", "question", ["private-doc"], False)
    generate.assert_not_called()


def test_global_personalized_cache_is_rejected_and_old_keys_do_not_match():
    with pytest.raises(ValueError):
        ai_jobs.AIJobCreateRequest(prompt="Summarize my notes", cache_scope="global")
    a = ai_semantic_cache._cache_metadata(1, "chat_completion", "global")
    b = ai_semantic_cache._cache_metadata(2, "chat_completion", "global")
    assert a["scope"] == "user"
    assert not ai_semantic_cache._metadata_matches({"metadata": a}, b)
    assert not ai_semantic_cache._metadata_matches({"metadata": {"scope": "global", "job_type": "chat_completion"}}, b)


@pytest.mark.parametrize("path", ["/api/ask_simple/", "/api/ask/"])
def test_failed_chat_http_has_no_saved_message_or_rewards(db, monkeypatch, path):
    user, conversation = user_and_chat(db)
    monkeypatch.setattr(chat, "_run_chat_ml_pipeline", AsyncMock(return_value=(None, "")))
    monkeypatch.setattr(graph, "get_tutor", lambda: SimpleNamespace(invoke=AsyncMock(side_effect=AIWorkflowError("failed"))))
    rewards = Mock()
    reward_module = ModuleType("services.gamification_system")
    reward_module.award_points = rewards
    monkeypatch.setitem(sys.modules, "services.gamification_system", reward_module)
    app = FastAPI()
    app.include_router(chat.router)
    app.dependency_overrides[chat.get_db] = lambda: db
    app.dependency_overrides[chat.get_current_user] = lambda: user
    response = TestClient(app).post(path, data={"user_id": user.username, "question": "Explain", "chat_id": conversation.id})
    assert response.status_code == 503
    assert db.query(models.ChatMessage).count() == 0
    assert db.query(models.ChatTutorState).count() == 0
    rewards.assert_not_called()


def test_unverified_tutor_state_does_not_change_mastery_or_counts(db):
    user, conversation = user_and_chat(db)
    row = models.ChatTutorState(chat_session_id=conversation.id, user_id=user.id,
                               mastery_score=0.8, attempts=5, correct_count=4,
                               correct_streak=0, wrong_streak=0)
    db.add(row)
    db.commit()
    chat._persist_tutor_session_state(db, conversation.id, user.id, {
        "verdict": "correct", "mastery_score": 1.0, "correct_streak": 20,
        "_attempt_verified": False,
    }, "guided", tutor_choice="I understand")
    db.commit()
    db.refresh(row)
    assert row.mastery_score == 0.8
    assert row.attempts == 5 and row.correct_count == 4
    assert row.correct_streak == 0


def test_job_claim_is_atomic_and_duplicate_claim_does_not_run(db):
    job = new_job(db)
    claimed = lifecycle.claim_job(db, job.id)
    assert claimed.status == "running" and claimed.attempts == 1
    assert lifecycle.claim_job(db, job.id) is None


def test_recovery_handles_lost_publish_dead_worker_and_live_worker(db, monkeypatch):
    old = lifecycle.utcnow() - timedelta(seconds=300)
    queued = new_job(db, updated_at=old)
    dead = new_job(db, status="running", updated_at=old, attempts=1)
    live = new_job(db, status="running", updated_at=lifecycle.utcnow(), attempts=1)
    exhausted = new_job(db, status="running", updated_at=old, attempts=3)
    enqueue = Mock()
    monkeypatch.setattr(lifecycle, "enqueue_ai_job", enqueue)
    lifecycle.recover_jobs(db)
    db.expire_all()
    assert db.get(models.AIJob, dead.id).status == "queued"
    assert db.get(models.AIJob, live.id).status == "running"
    assert db.get(models.AIJob, exhausted.id).status == "failed"
    assert queued.id in [call.args[0] for call in enqueue.call_args_list]


def test_heartbeat_cannot_renew_a_different_attempt(db):
    job = new_job(db, status="running", attempts=2)
    assert not lifecycle.heartbeat_job(db, job.id, 1)
    assert lifecycle.heartbeat_job(db, job.id, 2)


def test_worker_failure_never_completes_or_saves_a_result(db, monkeypatch):
    job = new_job(db)
    job_id = job.id
    factory = sessionmaker(bind=db.get_bind())
    monkeypatch.setattr(worker, "SessionLocal", factory)
    monkeypatch.setattr(worker, "_process_chat_completion", Mock(return_value={"error": "bad response", "answer": "Sorry"}))
    monkeypatch.setattr(worker, "dead_letter_ai_job", Mock())
    assert worker.process_job(job_id)
    db.expire_all()
    row = db.get(models.AIJob, job_id)
    assert row.status == "failed"
    assert row.result_json is None


def test_worker_retry_survives_redis_publication_failure(db, monkeypatch):
    job_id = new_job(db).id
    monkeypatch.setattr(worker, "SessionLocal", sessionmaker(bind=db.get_bind()))
    monkeypatch.setattr(worker, "_process_chat_completion", Mock(side_effect=HTTPException(status_code=503, detail="unavailable")))
    monkeypatch.setattr(worker, "schedule_retry_ai_job", Mock(side_effect=RuntimeError("Redis down")))
    assert worker.process_job(job_id)
    db.expire_all()
    row = db.get(models.AIJob, job_id)
    assert row.status == "retrying"
    assert row.retry_after is not None and row.result_json is None


def test_provider_quota_survives_wrapping_as_http_429(db, monkeypatch):
    from services.api_key_pool import ApiKeyPoolExhausted
    user, conversation = user_and_chat(db)
    async def fail(**kwargs):
        try:
            raise ApiKeyPoolExhausted("quota", provider="test", reset_after_seconds=30)
        except Exception as exc:
            raise AIWorkflowError("Tutor generation failed") from exc
    monkeypatch.setattr(chat, "_run_chat_ml_pipeline", AsyncMock(return_value=(None, "")))
    monkeypatch.setattr(graph, "get_tutor", lambda: SimpleNamespace(invoke=fail))
    app = FastAPI()
    app.include_router(chat.router)
    app.dependency_overrides[chat.get_db] = lambda: db
    app.dependency_overrides[chat.get_current_user] = lambda: user
    response = TestClient(app).post("/api/ask_simple/", data={
        "user_id": user.username, "question": "Explain", "chat_id": conversation.id,
    })
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "30"
    assert "load-test" not in response.text
    assert db.query(models.ChatMessage).count() == 0


def test_selected_document_empty_retrieval_is_a_no_match_with_hs_off(monkeypatch):
    from services import context_store
    monkeypatch.setattr(context_store, "available", lambda: True)
    monkeypatch.setattr(context_store, "search_context", Mock(return_value=[]))
    monkeypatch.setattr(nodes.chroma_store, "available", lambda: False)
    result = nodes.gate_and_retrieve({
        "user_id": "1", "user_input": "Explain this", "intent": "question",
        "context_only": True, "context_doc_ids": ["private-doc"], "use_hs_context": False,
    })
    assert result["context_only_no_match"] is True
    assert context_store.search_context.call_args.kwargs["doc_ids"] == ["private-doc"]


def test_successful_worker_completion_is_not_reexecuted(db, monkeypatch):
    job_id = new_job(db).id
    monkeypatch.setattr(worker, "SessionLocal", sessionmaker(bind=db.get_bind()))
    generate = Mock(return_value={"answer": "Done"})
    monkeypatch.setattr(worker, "_process_chat_completion", generate)
    assert worker.process_job(job_id)
    assert worker.process_job(job_id)
    generate.assert_called_once()
    db.expire_all()
    assert db.get(models.AIJob, job_id).result_json == {"answer": "Done"}


def test_incomplete_upload_cannot_be_claimed_and_eventually_fails(db, monkeypatch):
    job = new_job(db, status="preparing", updated_at=lifecycle.utcnow() - timedelta(minutes=31))
    assert lifecycle.claim_job(db, job.id) is None
    enqueue = Mock()
    monkeypatch.setattr(lifecycle, "enqueue_ai_job", enqueue)
    lifecycle.recover_jobs(db)
    db.expire_all()
    assert db.get(models.AIJob, job.id).status == "failed"
    enqueue.assert_not_called()


def test_chat_job_discovery_is_scoped_to_owner_and_conversation(db):
    user, conversation = user_and_chat(db)
    job = new_job(db, status="running")
    job.input_json = {"form_body": {"chat_id": str(conversation.id)}}
    unrelated = new_job(db, status="queued")
    db.commit()
    found = ai_jobs.list_active_chat_jobs(conversation.id, db, user)
    assert [item.id for item in found] == [job.id]
    outsider = models.User(username="outsider", email="outside@example.invalid", hashed_password="test")
    db.add(outsider)
    db.commit()
    with pytest.raises(HTTPException) as error:
        ai_jobs.list_active_chat_jobs(conversation.id, db, outsider)
    assert error.value.status_code == 404


def test_cancelled_delivery_cannot_be_claimed(db):
    job = new_job(db)
    user = db.get(models.User, job.user_id)
    assert ai_jobs.cancel_ai_job(job.id, db, user).status == "cancelled"
    assert lifecycle.claim_job(db, job.id) is None
