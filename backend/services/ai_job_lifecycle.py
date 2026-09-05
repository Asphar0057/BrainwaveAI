"""Database-backed job claims and recovery. Redis is delivery, not the job ledger."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from sqlalchemy import or_
import models
from services.ai_job_queue import enqueue_ai_job

LEASE_SECONDS = 90
REDISPATCH_SECONDS = 30


def utcnow():
    return datetime.now(timezone.utc)


def claim_job(db, job_id: int):
    now = utcnow()
    changed = db.query(models.AIJob).filter(
        models.AIJob.id == job_id,
        models.AIJob.status.in_(("queued", "retrying")),
        or_(models.AIJob.retry_after.is_(None), models.AIJob.retry_after <= now),
    ).update({
        models.AIJob.status: "running",
        models.AIJob.started_at: now,
        models.AIJob.updated_at: now,
        models.AIJob.attempts: models.AIJob.attempts + 1,
        models.AIJob.error: None,
    }, synchronize_session=False)
    db.commit()
    db.expire_all()
    return db.get(models.AIJob, job_id) if changed else None


def heartbeat_job(db, job_id: int, attempt: int) -> bool:
    changed = db.query(models.AIJob).filter(
        models.AIJob.id == job_id, models.AIJob.status == "running",
        models.AIJob.attempts == attempt,
    ).update({models.AIJob.updated_at: utcnow()}, synchronize_session=False)
    db.commit()
    return bool(changed)


def recover_jobs(db, *, max_attempts: int = 3) -> int:
    """Recover expired workers and DB commits whose queue publication was lost."""
    now = utcnow()
    # Never dispatch a file job until all attachments have been persisted.
    db.query(models.AIJob).filter(
        models.AIJob.status == "preparing",
        models.AIJob.updated_at < now - timedelta(minutes=30),
    ).update({
        models.AIJob.status: "failed",
        models.AIJob.error: "File upload was interrupted; please upload the files again",
        models.AIJob.completed_at: now,
    }, synchronize_session=False)
    expired = db.query(models.AIJob).filter(
        models.AIJob.status == "running",
        models.AIJob.updated_at < now - timedelta(seconds=LEASE_SECONDS),
    ).all()
    for job in expired:
        exhausted = job.attempts >= max_attempts
        db.query(models.AIJob).filter(
            models.AIJob.id == job.id, models.AIJob.status == "running",
            models.AIJob.updated_at < now - timedelta(seconds=LEASE_SECONDS),
        ).update({
            models.AIJob.status: "failed" if exhausted else "queued",
            models.AIJob.error: "AI worker stopped before completing the job",
            models.AIJob.last_error: "AI worker lease expired",
            models.AIJob.progress_message: "Failed after worker interruption" if exhausted else "Recovering interrupted job",
            models.AIJob.completed_at: now if exhausted else None,
            models.AIJob.retry_after: None,
        }, synchronize_session=False)
    db.commit()
    db.expire_all()
    pending = db.query(models.AIJob).filter(
        models.AIJob.status.in_(("queued", "retrying")),
        or_(models.AIJob.retry_after.is_(None), models.AIJob.retry_after <= now),
        models.AIJob.updated_at < now - timedelta(seconds=REDISPATCH_SECONDS),
    ).order_by(models.AIJob.updated_at).limit(100).all()
    dispatched = 0
    for job in pending:
        enqueue_ai_job(job.id)
        # Do not overwrite a concurrent worker claim or cancellation.
        db.query(models.AIJob).filter(
            models.AIJob.id == job.id, models.AIJob.status.in_(("queued", "retrying")),
        ).update({models.AIJob.updated_at: now}, synchronize_session=False)
        db.commit()
        dispatched += 1
    return dispatched
