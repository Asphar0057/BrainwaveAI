from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from deps import get_current_user, get_db
from sqlalchemy import func

from services.ai_job_queue import (
    AIJobQueueUnavailable,
    dead_letter_depth,
    enqueue_ai_job,
    queue_depth,
    retry_queue_depth,
)
from services.ai_semantic_cache import semantic_cache_status
from services.storage_service import StorageService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai-jobs"])
AI_JOB_UPLOAD_DIR = Path(os.getenv("AI_JOB_UPLOAD_DIR", "uploads/ai_jobs"))
AI_JOB_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class AIJobCreateRequest(BaseModel):
    job_type: Literal["chat_completion"] = "chat_completion"
    prompt: str = Field(..., min_length=1, max_length=80_000)
    chat_session_id: Optional[int] = None
    user_message: Optional[str] = Field(default=None, max_length=80_000)
    use_hs_context: bool = True
    context_doc_ids: Optional[str] = Field(default=None, max_length=10_000)
    tutor_mode: bool = False
    tutor_reply_style: str = Field(default="guided", max_length=40)
    tutor_choice: Optional[str] = Field(default=None, max_length=4_000)
    max_tokens: int = Field(default=2000, ge=1, le=8000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    conversation_id: Optional[str] = Field(default=None, max_length=200)
    use_semantic_cache: bool = False
    cache_scope: Literal["user"] = "user"
    timeout_seconds: Optional[int] = Field(default=None, ge=5, le=1800)
    metadata: dict[str, Any] = Field(default_factory=dict)


class LegacyAIRouteJobRequest(BaseModel):
    method: Literal["GET", "POST"] = "POST"
    path: str = Field(..., min_length=1, max_length=300)
    body_type: Literal["json", "form"] = "json"
    json_body: Optional[dict[str, Any]] = None
    form_body: Optional[dict[str, Any]] = None


class AIJobResponse(BaseModel):
    id: int
    status: str
    job_type: str
    result: Optional[dict[str, Any]]
    error: Optional[str]
    last_error: Optional[str] = None
    cache_status: Optional[str]
    attempts: int = 0
    progress_percent: int = 0
    progress_message: Optional[str] = None
    timeout_seconds: Optional[int] = None
    retry_after: Optional[datetime] = None
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


def _active_job_limit() -> int:
    return int(os.getenv("AI_MAX_ACTIVE_JOBS_PER_USER", "4"))


ACTIVE_JOB_STATUSES = ("preparing", "queued", "running", "retrying")


def _serialize_job(job: models.AIJob) -> AIJobResponse:
    return AIJobResponse(
        id=job.id,
        status=job.status,
        job_type=job.job_type,
        result=job.result_json,
        error=job.error,
        last_error=job.last_error,
        cache_status=job.cache_status,
        attempts=job.attempts or 0,
        progress_percent=job.progress_percent or 0,
        progress_message=job.progress_message,
        timeout_seconds=job.timeout_seconds,
        retry_after=job.retry_after,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


def _as_aware_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _seconds_between(start: Optional[datetime], end: Optional[datetime]) -> Optional[float]:
    start_aware = _as_aware_utc(start)
    end_aware = _as_aware_utc(end)
    if not start_aware or not end_aware:
        return None
    return max(0.0, (end_aware - start_aware).total_seconds())


def _timeout_for_path(path: str) -> int:
    media_keywords = ("/media/", "/transcribe_audio/", "generate_notes_from_media")
    if any(keyword in path for keyword in media_keywords):
        return int(os.getenv("AI_JOB_MEDIA_TIMEOUT_SECONDS", "600"))
    if "/ask_with_files/" in path:
        return int(os.getenv("AI_JOB_FILE_TIMEOUT_SECONDS", "420"))
    return int(os.getenv("AI_JOB_ROUTE_TIMEOUT_SECONDS", "240"))


def _chat_timeout(payload: AIJobCreateRequest) -> int:
    if payload.timeout_seconds:
        return payload.timeout_seconds
    return int(os.getenv("AI_JOB_CHAT_TIMEOUT_SECONDS", "180"))


def _admin_emails() -> set[str]:
    raw = (
        os.getenv("AI_JOB_ADMIN_EMAILS")
        or os.getenv("API_USAGE_ADMIN_EMAILS")
        or os.getenv("ADMIN_EMAILS")
        or ""
    )
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def _require_ai_jobs_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    allowed = _admin_emails()
    if not allowed:
        raise HTTPException(status_code=403, detail="AI job admin emails are not configured")
    email = (current_user.email or "").lower()
    if email not in allowed:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _assert_chat_access(db: Session, current_user: models.User, chat_session_id: Optional[int]) -> None:
    if not chat_session_id:
        return
    exists = (
        db.query(models.ChatSession.id)
        .filter(
            models.ChatSession.id == chat_session_id,
            models.ChatSession.user_id == current_user.id,
        )
        .first()
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Chat session not found")


def _auth_subject(current_user: models.User) -> str:
    return current_user.username or current_user.email or str(current_user.id)


def _allowed_legacy_ai_paths() -> set[str]:
    raw_paths = os.getenv(
        "AI_JOB_ALLOWED_LEGACY_PATHS",
        ",".join(
            [
                "/api/ask_simple/",
                "/api/ask_with_files/",
                "/api/agents/searchhub",
                "/api/agents/searchhub/create-note",
                "/api/agents/searchhub/create-flashcards",
                "/api/agents/searchhub/create-questions",
                "/api/agents/searchhub/explain",
                "/api/agents/notes",
                "/api/qb/generate_from_pdf",
                "/api/qb/generate_from_multiple_pdfs",
                "/api/qb/generate_related_from_pdf",
                "/api/qb/smart_generate",
                "/api/qb/generate_from_sources",
                "/api/qb/enhance_prompt",
                "/api/qb/extract_topics",
                "/api/qb/score_questions",
                "/api/qb/tag_bloom_taxonomy",
                "/api/qb/check_duplicates",
                "/api/qb/analyze_weaknesses",
                "/api/qb/generate_adaptive",
                "/api/qb/enhance_explanations",
                "/api/qb/regenerate_question",
                "/api/qb/preview_generate",
                "/api/generate_flashcards",
                "/api/generate_questions",
                "/api/generate_practice_questions",
                "/api/generate_challenge_questions",
                "/api/generate_battle_questions",
                "/api/generate_notes_from_media",
                "/api/generate_chat_title",
                "/api/generate_chat_summary",
                "/api/generate_topic_description",
                "/api/create_knowledge_roadmap",
                "/api/create_roadmap_from_chat",
                "/api/create_roadmap_from_context_docs",
                "/api/expand_knowledge_node/{node_id}",
                "/api/explore_node/{node_id}",
                "/api/learning-paths/generate",
                "/api/learning-paths/{path_id}/nodes/{node_id}/generate-content",
                "/api/create_note",
                "/api/update_note",
                "/api/convert_chat_to_note_content/",
                "/api/ai_group_notes",
                "/api/create_note_from_context_docs",
                "/api/context/ask",
                "/api/media/process",
                "/api/media/generate-title",
                "/api/media/save-notes",
                "/api/transcribe_audio/",
                "/api/flashcards/ai_suggestions",
                "/api/study_insights/comprehensive",
                "/api/study_insights/topic_suggestions",
                "/api/study_insights/similar_questions",
                "/api/study_insights/strengths_weaknesses",
                "/api/intelligence/weakness/recommendations",
                "/api/qb/generate_similar_question",
            ]
        ),
    )
    return {item.strip() for item in raw_paths.split(",") if item.strip()}


def _path_allowed(path: str) -> bool:
    if not path.startswith("/api/") or path.startswith("/api/ai/"):
        return False
    allowed = _allowed_legacy_ai_paths()
    if path in allowed:
        return True
    for pattern in allowed:
        if "{" not in pattern:
            continue
        prefix = pattern.split("{", 1)[0]
        suffix = pattern.split("}", 1)[1]
        if path.startswith(prefix) and path.endswith(suffix):
            return True
    return False


@router.post("/jobs", response_model=AIJobResponse, status_code=202)
def create_ai_job(
    payload: AIJobCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _assert_chat_access(db, current_user, payload.chat_session_id)

    active_count = (
        db.query(models.AIJob)
        .filter(
            models.AIJob.user_id == current_user.id,
            models.AIJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .count()
    )
    if active_count >= _active_job_limit():
        raise HTTPException(
            status_code=429,
            detail="You already have an AI job running. Please wait for it to finish.",
        )

    job = models.AIJob(
        user_id=current_user.id,
        job_type=payload.job_type,
        status="queued",
        input_json=payload.model_dump(),
        progress_percent=0,
        progress_message="Queued",
        timeout_seconds=_chat_timeout(payload),
        queued_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        job.redis_job_id = enqueue_ai_job(job.id)
        db.commit()
        db.refresh(job)
    except AIJobQueueUnavailable as exc:
        job.status = "failed"
        job.error = str(exc)
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.warning("Failed to enqueue AI job %s: %s", job.id, exc)
        raise HTTPException(status_code=503, detail="AI queue unavailable") from exc

    return _serialize_job(job)


@router.post("/file-route-jobs", response_model=AIJobResponse, status_code=202)
async def create_legacy_file_route_job(
    path: str = Form(...),
    method: Literal["POST"] = Form("POST"),
    form_body: str = Form("{}"),
    files: list[UploadFile] = File(default=[]),
    file_field_names: list[str] = Form(default=[]),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    import json
    import re

    if not _path_allowed(path):
        raise HTTPException(status_code=400, detail="This AI endpoint is not allowed for queued file execution")

    active_count = (
        db.query(models.AIJob)
        .filter(
            models.AIJob.user_id == current_user.id,
            models.AIJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .count()
    )
    if active_count >= _active_job_limit():
        raise HTTPException(
            status_code=429,
            detail="You already have an AI job running. Please wait for it to finish.",
        )

    try:
        parsed_form = json.loads(form_body or "{}")
        if not isinstance(parsed_form, dict):
            raise ValueError("form_body must be a JSON object")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="form_body must be valid JSON") from exc

    job = models.AIJob(
        user_id=current_user.id,
        job_type="legacy_file_route",
        status="preparing",
        input_json={
            "method": method,
            "path": path,
            "body_type": "form",
            "form_body": parsed_form,
            "auth_subject": _auth_subject(current_user),
            "files": [],
        },
        progress_percent=0,
        progress_message="Queued",
        timeout_seconds=_timeout_for_path(path),
        queued_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    job_dir = AI_JOB_UPLOAD_DIR / str(job.id)
    saved_files: list[dict[str, Any]] = []
    storage = StorageService.get_storage()
    use_remote_storage = getattr(storage, "storage_type", "local") != "local"
    if not use_remote_storage:
        job_dir.mkdir(parents=True, exist_ok=True)

    for index, upload in enumerate(files):
        filename = upload.filename or "upload"
        safe_name = re.sub(r"[^\w.\-]", "_", filename)
        raw = await upload.read()
        if use_remote_storage:
            storage_key = f"ai_jobs/{job.id}/{index}_{safe_name}"
            storage.upload_bytes(raw, storage_key, upload.content_type or "application/octet-stream")
            file_path_value = (
                storage.uri_for_path(storage_key)
                if hasattr(storage, "uri_for_path")
                else storage_key
            )
        else:
            file_path = job_dir / safe_name
            counter = 1
            while file_path.exists():
                stem = Path(safe_name).stem
                suffix = Path(safe_name).suffix
                file_path = job_dir / f"{stem}_{counter}{suffix}"
                counter += 1
            file_path.write_bytes(raw)
            file_path_value = str(file_path)

        saved_files.append(
            {
                "field_name": file_field_names[index] if index < len(file_field_names) else "files",
                "filename": filename,
                "content_type": upload.content_type or "application/octet-stream",
                "path": file_path_value,
            }
        )

    job.input_json = {
        **(job.input_json or {}),
        "files": saved_files,
    }
    job.status = "queued"
    db.commit()
    db.refresh(job)

    try:
        job.redis_job_id = enqueue_ai_job(job.id)
        db.commit()
        db.refresh(job)
    except AIJobQueueUnavailable as exc:
        job.status = "failed"
        job.error = str(exc)
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.warning("Failed to enqueue legacy file AI route job %s: %s", job.id, exc)
        raise HTTPException(status_code=503, detail="AI queue unavailable") from exc

    return _serialize_job(job)


@router.post("/route-jobs", response_model=AIJobResponse, status_code=202)
def create_legacy_ai_route_job(
    payload: LegacyAIRouteJobRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not _path_allowed(payload.path):
        raise HTTPException(status_code=400, detail="This AI endpoint is not allowed for queued route execution")

    active_count = (
        db.query(models.AIJob)
        .filter(
            models.AIJob.user_id == current_user.id,
            models.AIJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .count()
    )
    if active_count >= _active_job_limit():
        raise HTTPException(
            status_code=429,
            detail="You already have an AI job running. Please wait for it to finish.",
        )

    job = models.AIJob(
        user_id=current_user.id,
        job_type="legacy_route",
        status="queued",
        input_json={
            **payload.model_dump(),
            "auth_subject": _auth_subject(current_user),
        },
        progress_percent=0,
        progress_message="Queued",
        timeout_seconds=_timeout_for_path(payload.path),
        queued_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        job.redis_job_id = enqueue_ai_job(job.id)
        db.commit()
        db.refresh(job)
    except AIJobQueueUnavailable as exc:
        job.status = "failed"
        job.error = str(exc)
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.warning("Failed to enqueue legacy AI route job %s: %s", job.id, exc)
        raise HTTPException(status_code=503, detail="AI queue unavailable") from exc

    return _serialize_job(job)


@router.get("/jobs", response_model=list[AIJobResponse])
def list_active_chat_jobs(
    chat_session_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _assert_chat_access(db, current_user, chat_session_id)
    jobs = db.query(models.AIJob).filter(
        models.AIJob.user_id == current_user.id,
        models.AIJob.status.in_(ACTIVE_JOB_STATUSES),
    ).all()
    matching = []
    for job in jobs:
        payload = job.input_json or {}
        body = payload.get("form_body") or payload.get("json_body") or {}
        job_chat_id = payload.get("chat_session_id") or body.get("chat_id")
        if str(job_chat_id) == str(chat_session_id):
            matching.append(_serialize_job(job))
    return matching


@router.get("/jobs/{job_id}", response_model=AIJobResponse)
def get_ai_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    job = (
        db.query(models.AIJob)
        .filter(models.AIJob.id == job_id, models.AIJob.user_id == current_user.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="AI job not found")
    return _serialize_job(job)


@router.post("/jobs/{job_id}/cancel", response_model=AIJobResponse)
def cancel_ai_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    job = (
        db.query(models.AIJob)
        .filter(models.AIJob.id == job_id, models.AIJob.user_id == current_user.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="AI job not found")
    if job.status not in {"queued", "retrying"}:
        raise HTTPException(status_code=409, detail="Only queued or retrying AI jobs can be cancelled")

    changed = db.query(models.AIJob).filter(
        models.AIJob.id == job_id,
        models.AIJob.user_id == current_user.id,
        models.AIJob.status.in_(("queued", "retrying")),
    ).update({models.AIJob.status: "cancelled", models.AIJob.completed_at: datetime.now(timezone.utc)}, synchronize_session=False)
    if not changed:
        db.rollback()
        raise HTTPException(status_code=409, detail="AI job has already started")
    db.commit()
    db.refresh(job)
    return _serialize_job(job)


@router.get("/health")
def ai_jobs_health(current_user: models.User = Depends(get_current_user)):
    try:
        depth = queue_depth()
        retry_depth = retry_queue_depth()
        dlq_depth = dead_letter_depth()
        redis_available = True
    except Exception:
        depth = None
        retry_depth = None
        dlq_depth = None
        redis_available = False
    return {
        "redis_available": redis_available,
        "queue_depth": depth,
        "retry_queue_depth": retry_depth,
        "dead_letter_queue_depth": dlq_depth,
        "active_job_limit_per_user": _active_job_limit(),
        "semantic_cache": semantic_cache_status(),
    }


@router.get("/admin/metrics")
def ai_jobs_admin_metrics(
    db: Session = Depends(get_db),
    _: models.User = Depends(_require_ai_jobs_admin),
):
    status_rows = (
        db.query(models.AIJob.status, func.count(models.AIJob.id))
        .group_by(models.AIJob.status)
        .all()
    )
    type_rows = (
        db.query(models.AIJob.job_type, func.count(models.AIJob.id))
        .group_by(models.AIJob.job_type)
        .all()
    )
    completed_jobs = (
        db.query(models.AIJob)
        .filter(models.AIJob.status == "completed", models.AIJob.started_at.isnot(None), models.AIJob.completed_at.isnot(None))
        .all()
    )
    queued_jobs = (
        db.query(models.AIJob)
        .filter(models.AIJob.status.in_(("queued", "retrying")))
        .all()
    )
    failed_recent = (
        db.query(models.AIJob)
        .filter(models.AIJob.status == "failed")
        .order_by(models.AIJob.completed_at.desc().nullslast(), models.AIJob.updated_at.desc())
        .limit(10)
        .all()
    )

    now = datetime.now(timezone.utc)
    runtimes = [
        seconds
        for job in completed_jobs
        if (seconds := _seconds_between(job.started_at, job.completed_at)) is not None
    ]
    waits = [
        seconds
        for job in queued_jobs
        if (seconds := _seconds_between(job.queued_at, now)) is not None
    ]

    try:
        redis_metrics = {
            "available": True,
            "queue_depth": queue_depth(),
            "retry_queue_depth": retry_queue_depth(),
            "dead_letter_queue_depth": dead_letter_depth(),
        }
    except Exception as exc:
        redis_metrics = {
            "available": False,
            "error": str(exc),
            "queue_depth": None,
            "retry_queue_depth": None,
            "dead_letter_queue_depth": None,
        }

    return {
        "redis": redis_metrics,
        "statuses": {status: count for status, count in status_rows},
        "job_types": {job_type: count for job_type, count in type_rows},
        "avg_runtime_seconds": round(sum(runtimes) / len(runtimes), 2) if runtimes else None,
        "avg_wait_seconds": round(sum(waits) / len(waits), 2) if waits else None,
        "max_wait_seconds": round(max(waits), 2) if waits else None,
        "failed_recent": [
            {
                "id": job.id,
                "job_type": job.job_type,
                "attempts": job.attempts,
                "error": job.error or job.last_error,
                "completed_at": job.completed_at,
            }
            for job in failed_recent
        ],
    }
