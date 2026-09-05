from __future__ import annotations

import logging
import json
import os
import signal
import time
import asyncio
import threading
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException

from activity_context import clear_activity_context, set_activity_context
from database import SessionLocal
import models
from services.ai_job_queue import (
    AIJobQueueUnavailable,
    acknowledge_ai_job,
    recover_queue_deliveries,
    dead_letter_ai_job,
    dequeue_ai_job,
    enqueue_ai_job,
    get_queue_name,
    promote_due_retry_jobs,
    schedule_retry_ai_job,
)
from services.storage_service import StorageService
from services.ai_result import require_ai_success
from services.ai_job_lifecycle import claim_job, heartbeat_job, recover_jobs
from services.token_limits import get_token_limit_state, token_limit_error_payload

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(levelname)s: %(message)s")
logger = logging.getLogger("ai_worker")

_running = True


def _shutdown(signum, frame) -> None:
    global _running
    _running = False
    logger.info("Stopping AI worker after signal %s", signum)


signal.signal(signal.SIGINT, _shutdown)
signal.signal(signal.SIGTERM, _shutdown)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _max_attempts() -> int:
    return int(os.getenv("AI_JOB_MAX_ATTEMPTS", "3"))


def _base_retry_delay_seconds() -> int:
    return int(os.getenv("AI_JOB_RETRY_BASE_DELAY_SECONDS", "10"))


def _max_retry_delay_seconds() -> int:
    return int(os.getenv("AI_JOB_RETRY_MAX_DELAY_SECONDS", "300"))


def _retry_delay_seconds(attempts: int, error: Exception) -> int:
    message = str(error).lower()
    base = _base_retry_delay_seconds()
    if any(token in message for token in ("429", "rate limit", "quota", "too many requests")):
        base = max(base, int(os.getenv("AI_JOB_RATE_LIMIT_RETRY_DELAY_SECONDS", "60")))
    return min(_max_retry_delay_seconds(), base * max(1, 2 ** max(0, attempts - 1)))


def _is_retryable_error(error: Exception) -> bool:
    if isinstance(error, HTTPException) and error.status_code in {429, 502, 503, 504}:
        return True
    message = str(error).lower()
    retryable_tokens = (
        "429",
        "503",
        "502",
        "504",
        "rate limit",
        "too many requests",
        "quota",
        "timeout",
        "timed out",
        "temporarily unavailable",
        "connection reset",
        "connection aborted",
        "service unavailable",
        "bad gateway",
        "gateway timeout",
    )
    return any(token in message for token in retryable_tokens)


@contextmanager
def _job_timeout(seconds: int | None):
    if not seconds or seconds <= 0 or not hasattr(signal, "SIGALRM"):
        yield
        return

    def _raise_timeout(signum, frame):
        raise TimeoutError(f"AI job exceeded timeout of {seconds}s")

    previous_handler = signal.getsignal(signal.SIGALRM)
    signal.signal(signal.SIGALRM, _raise_timeout)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous_handler)


def _process_chat_completion(job: models.AIJob, payload: dict[str, Any], db) -> dict[str, Any]:
    prompt = (payload.get("prompt") or payload.get("question") or "").strip()
    if not prompt:
        raise ValueError("AI job prompt is required")

    # All tutor requests may use private, mutable memories, including requests
    # without a chat ID. Do not read old global entries or cache these answers.
    user = db.query(models.User).filter(models.User.id == job.user_id).first()
    if not user:
        raise ValueError(f"User {job.user_id} not found")

    token_state = get_token_limit_state(db, user)
    if not token_state.get("allowed", True):
        raise ValueError(json.dumps(token_limit_error_payload(token_state)))

    from routes.chat import ask_simple
    from tutor.graph import create_tutor, get_tutor
    if get_tutor() is None:
        from deps import unified_ai, hs_context_ai
        create_tutor(unified_ai, SessionLocal, hs_ai_client=hs_context_ai)

    job.progress_percent = 35
    job.progress_message = "Calling AI provider"
    db.commit()

    activity_token = set_activity_context({
        "user_id": str(job.user_id),
        "tool_name": "ai_chat",
        "action": "create",
        "endpoint": "/api/ask_simple/",
        "method": "WORKER",
        "job_id": job.id,
        "job_type": job.job_type,
    })
    try:
        chat_result = asyncio.run(
            ask_simple(
                user_id=user.username or user.email or str(user.id),
                question=prompt,
                original_question=payload.get("user_message") or prompt,
                chat_id=str(payload["chat_session_id"]) if payload.get("chat_session_id") else None,
                use_hs_context=bool(payload.get("use_hs_context", True)),
                context_doc_ids=payload.get("context_doc_ids"),
                tutor_mode=bool(payload.get("tutor_mode", False)),
                tutor_reply_style=payload.get("tutor_reply_style") or "guided",
                tutor_choice=payload.get("tutor_choice"),
                db=db,
                current_user=user,
            )
        )
    finally:
        clear_activity_context(activity_token)
    require_ai_success(chat_result, answer_key="answer")
    response = chat_result["answer"]

    return {
        **chat_result,
        "answer": response,
        "cache_status": "disabled",
        "cached": False,
    }


def _persist_chat_message(db, job: models.AIJob, payload: dict[str, Any], result: dict[str, Any]) -> None:
    chat_session_id = payload.get("chat_session_id")
    if not chat_session_id:
        return

    session = (
        db.query(models.ChatSession)
        .filter(
            models.ChatSession.id == int(chat_session_id),
            models.ChatSession.user_id == job.user_id,
        )
        .first()
    )
    if not session:
        logger.warning("AI job %s skipped chat persistence; session not found", job.id)
        return

    db.add(
        models.ChatMessage(
            chat_session_id=session.id,
            user_id=job.user_id,
            user_message=payload.get("user_message") or payload.get("prompt") or "",
            ai_response=result.get("answer") or "",
            timestamp=_now(),
        )
    )
    session.updated_at = _now()


def _process_legacy_route(payload: dict[str, Any]) -> dict[str, Any]:
    from fastapi.testclient import TestClient
    from deps import create_access_token
    from main import app

    method = (payload.get("method") or "POST").upper()
    path = payload.get("path") or ""
    body_type = payload.get("body_type") or "json"
    auth_subject = payload.get("auth_subject")
    if not auth_subject:
        raise ValueError("Legacy AI route job auth_subject is required")

    token = create_access_token({"sub": auth_subject})
    headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)

    if method == "GET":
        response = client.get(path, headers=headers)
    elif body_type == "form":
        response = client.post(path, data=payload.get("form_body") or {}, headers=headers)
    else:
        response = client.post(path, json=payload.get("json_body") or {}, headers=headers)

    if response.status_code >= 400:
        if response.status_code == 429:
            try:
                raise RuntimeError(json.dumps(response.json()))
            except ValueError:
                pass
        raise RuntimeError(f"Legacy AI route failed: {response.status_code} {response.text[:500]}")

    try:
        result = response.json()
    except Exception:
        result = {"text": response.text}
    require_ai_success(result)
    return {
        "route_status_code": response.status_code,
        "route_result": result,
        "answer": result.get("answer") if isinstance(result, dict) else None,
    }


def _process_legacy_file_route(payload: dict[str, Any]) -> dict[str, Any]:
    from fastapi.testclient import TestClient
    from deps import create_access_token
    from main import app

    path = payload.get("path") or ""
    auth_subject = payload.get("auth_subject")
    if not auth_subject:
        raise ValueError("Legacy file AI route job auth_subject is required")

    token = create_access_token({"sub": auth_subject})
    headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)
    opened_files = []
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            files = []
            for file_info in payload.get("files") or []:
                source_path = file_info["path"]
                parsed = urlparse(source_path or "")
                if parsed.scheme in {"s3", "r2"}:
                    local_path = Path(temp_dir) / (file_info.get("filename") or Path(parsed.path).name or "upload")
                    StorageService.get_storage().download_file(parsed.path.lstrip("/"), local_path)
                    source_path = str(local_path)
                handle = open(source_path, "rb")
                opened_files.append(handle)
                files.append(
                    (
                        file_info.get("field_name") or "files",
                        (
                            file_info.get("filename") or "upload",
                            handle,
                            file_info.get("content_type") or "application/octet-stream",
                        ),
                    )
                )

            response = client.post(
                path,
                data=payload.get("form_body") or {},
                files=files,
                headers=headers,
            )
    finally:
        for handle in opened_files:
            handle.close()

    if response.status_code >= 400:
        if response.status_code == 429:
            try:
                raise RuntimeError(json.dumps(response.json()))
            except ValueError:
                pass
        raise RuntimeError(f"Legacy file AI route failed: {response.status_code} {response.text[:500]}")

    try:
        result = response.json()
    except Exception:
        result = {"text": response.text}
    require_ai_success(result)
    return {
        "route_status_code": response.status_code,
        "route_result": result,
        "answer": result.get("answer") if isinstance(result, dict) else None,
    }


def _serialize_job_error(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        detail = exc.detail
        if isinstance(detail, dict):
            return json.dumps(detail)
        return str(detail)
    return str(exc)


def _heartbeat(stop, job_id, attempt):
    while not stop.wait(20):
        try:
            with SessionLocal() as db:
                if not heartbeat_job(db, job_id, attempt):
                    return
        except Exception:
            logger.exception("Could not renew worker lease for job %s", job_id)


def process_job(job_id: int) -> bool:
    db = SessionLocal()
    heartbeat_stop = threading.Event()
    heartbeat_thread = None
    attempt = None
    try:
        job = claim_job(db, job_id)
        if job is None:
            # Another worker owns it, it is terminal, or a retry is not due.
            return True
        attempt = job.attempts
        heartbeat_thread = threading.Thread(
            target=_heartbeat, args=(heartbeat_stop, job_id, attempt), daemon=True,
        )
        heartbeat_thread.start()
        job.progress_percent = max(job.progress_percent or 0, 10)
        job.progress_message = f"Running attempt {attempt} of {_max_attempts()}"
        db.commit()

        payload = job.input_json or {}
        with _job_timeout(job.timeout_seconds):
            if job.job_type == "chat_completion":
                result = _process_chat_completion(job, payload, db)
                if result.get("cached"):
                    _persist_chat_message(db, job, payload, result)
            elif job.job_type == "legacy_route":
                job.progress_percent = 35
                job.progress_message = "Executing queued AI route"
                db.commit()
                result = _process_legacy_route(payload)
            elif job.job_type == "legacy_file_route":
                job.progress_percent = 35
                job.progress_message = "Executing queued AI file route"
                db.commit()
                result = _process_legacy_file_route(payload)
            else:
                raise ValueError(f"Unsupported AI job type: {job.job_type}")

        require_ai_success(result)
        if "route_result" in result:
            require_ai_success(result["route_result"])
        # Fence completion: an expired attempt cannot overwrite its successor.
        updated = db.query(models.AIJob).filter(
            models.AIJob.id == job_id, models.AIJob.status == "running",
            models.AIJob.attempts == attempt,
        ).update({
            "status": "completed", "result_json": result,
            "cache_status": result.get("cache_status"), "error": None,
            "progress_percent": 100, "progress_message": "Completed",
            "retry_after": None, "completed_at": _now(), "updated_at": _now(),
        }, synchronize_session=False)
        db.commit()
        logger.info("AI job %s completed (owned=%s)", job_id, bool(updated))
        return True

    except Exception as exc:
        logger.exception("AI job %s failed", job_id)
        db.rollback()
        try:
            job = db.query(models.AIJob).filter(
                models.AIJob.id == job_id, models.AIJob.status == "running",
                models.AIJob.attempts == attempt,
            ).first()
            if job:
                error_message = _serialize_job_error(exc)
                retryable = attempt < _max_attempts() and _is_retryable_error(exc)
                delay = _retry_delay_seconds(attempt, exc) if retryable else 0
                retry_at = _now().timestamp() + delay
                job.last_error = error_message
                job.error = error_message
                job.status = "retrying" if retryable else "failed"
                job.retry_after = datetime.fromtimestamp(retry_at, tz=timezone.utc) if retryable else None
                job.progress_message = f"Retrying in {delay}s" if retryable else "Failed"
                job.progress_percent = min(job.progress_percent or 0, 25) if retryable else 100
                job.completed_at = None if retryable else _now()
                job.updated_at = _now()
                # The durable state is committed before best-effort delivery.
                db.commit()
                try:
                    if retryable:
                        schedule_retry_ai_job(job.id, run_at=retry_at)
                    else:
                        dead_letter_ai_job(job.id, error=error_message, attempts=attempt)
                except Exception:
                    logger.exception("Queue publication failed; DB recovery will reconcile job %s", job_id)
            return attempt is not None
        except Exception:
            db.rollback()
            logger.exception("Failed to record AI job %s failure", job_id)
            return False
    finally:
        heartbeat_stop.set()
        if heartbeat_thread:
            heartbeat_thread.join(timeout=2)
        db.close()


def main() -> None:
    logger.info("AI worker started; queue=%s", get_queue_name())
    while _running:
        try:
            recover_queue_deliveries()
            with SessionLocal() as recovery_db:
                recover_jobs(recovery_db, max_attempts=_max_attempts())
            promote_due_retry_jobs()
            message = dequeue_ai_job(timeout=5)
        except AIJobQueueUnavailable as exc:
            logger.warning("%s; retrying in 5s", exc)
            time.sleep(5)
            continue
        except Exception as exc:
            logger.exception("AI worker dequeue failed: %s", exc)
            time.sleep(2)
            continue

        if not message:
            continue
        if process_job(message.job_id):
            try:
                acknowledge_ai_job(message)
            except Exception:
                logger.exception("Queue acknowledgement failed for job %s", message.job_id)

    logger.info("AI worker stopped")


if __name__ == "__main__":
    main()
