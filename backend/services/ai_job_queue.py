from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_QUEUE_NAME = "bw:ai_jobs:default"
DEFAULT_RETRY_QUEUE_SUFFIX = ":retry"
DEFAULT_DEAD_LETTER_SUFFIX = ":dead"


class AIJobQueueUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class QueueMessage:
    job_id: int
    queued_at: float
    receipt: str = ""
    queue_name: str = ""


def get_redis_url() -> str:
    url = os.getenv("REDIS_URL")
    if url:
        return url

    host = os.getenv("REDIS_HOST", "localhost")
    port = int(os.getenv("REDIS_PORT", "6379"))
    db = int(os.getenv("REDIS_DB", "0"))
    password = os.getenv("REDIS_PASSWORD")
    auth = f":{password}@" if password else ""
    return f"redis://{auth}{host}:{port}/{db}"


def get_queue_name() -> str:
    return os.getenv("AI_JOB_QUEUE_NAME", DEFAULT_QUEUE_NAME)


def get_retry_queue_name() -> str:
    return os.getenv("AI_JOB_RETRY_QUEUE_NAME", f"{get_queue_name()}{DEFAULT_RETRY_QUEUE_SUFFIX}")


def get_dead_letter_queue_name() -> str:
    return os.getenv("AI_JOB_DEAD_LETTER_QUEUE_NAME", f"{get_queue_name()}{DEFAULT_DEAD_LETTER_SUFFIX}")


def get_redis_client():
    try:
        import redis

        socket_timeout = int(os.getenv("AI_JOB_REDIS_SOCKET_TIMEOUT_SECONDS", "30"))
        client = redis.Redis.from_url(
            get_redis_url(),
            socket_connect_timeout=2,
            socket_timeout=socket_timeout,
            decode_responses=True,
        )
        client.ping()
        return client
    except Exception as exc:
        raise AIJobQueueUnavailable(f"Redis queue unavailable: {exc}") from exc


def enqueue_ai_job(job_id: int, *, queue_name: str | None = None) -> str:
    client = get_redis_client()
    redis_job_id = f"ai-job:{job_id}"
    payload = {
        "job_id": job_id,
        "redis_job_id": redis_job_id,
        "queued_at": time.time(),
    }
    client.rpush(queue_name or get_queue_name(), json.dumps(payload))
    return redis_job_id


def schedule_retry_ai_job(
    job_id: int,
    *,
    run_at: float,
    retry_queue_name: str | None = None,
) -> str:
    client = get_redis_client()
    redis_job_id = f"ai-job:{job_id}"
    payload = {
        "job_id": job_id,
        "redis_job_id": redis_job_id,
        "queued_at": time.time(),
        "run_at": run_at,
    }
    client.zadd(retry_queue_name or get_retry_queue_name(), {json.dumps(payload): run_at})
    return redis_job_id


def promote_due_retry_jobs(
    *,
    retry_queue_name: str | None = None,
    queue_name: str | None = None,
    limit: int = 100,
) -> int:
    client = get_redis_client()
    retry_queue = retry_queue_name or get_retry_queue_name()
    return int(client.eval(_PROMOTE_DUE, 2, retry_queue, queue_name or get_queue_name(), time.time(), limit))


_PROMOTE_DUE = """
local items = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, ARGV[2])
for _, item in ipairs(items) do
    redis.call('RPUSH', KEYS[2], item)
    redis.call('ZREM', KEYS[1], item)
end
return #items
"""

_CLAIM = """
local item = redis.call('LPOP', KEYS[1])
if item then redis.call('ZADD', KEYS[2], ARGV[1], item) end
return item
"""


def acknowledge_ai_job(message: QueueMessage) -> None:
    if message.receipt:
        get_redis_client().zrem(f"{message.queue_name or get_queue_name()}:processing", message.receipt)


def recover_queue_deliveries(*, queue_name: str | None = None) -> int:
    queue = queue_name or get_queue_name()
    return int(get_redis_client().eval(_PROMOTE_DUE, 2, f"{queue}:processing", queue, time.time(), 100))


def dead_letter_ai_job(
    job_id: int,
    *,
    error: str,
    attempts: int,
    queue_name: str | None = None,
) -> str:
    client = get_redis_client()
    redis_job_id = f"ai-job:{job_id}"
    payload = {
        "job_id": job_id,
        "redis_job_id": redis_job_id,
        "error": error,
        "attempts": attempts,
        "failed_at": time.time(),
    }
    client.rpush(queue_name or get_dead_letter_queue_name(), json.dumps(payload))
    return redis_job_id


def dequeue_ai_job(
    *,
    queue_name: str | None = None,
    timeout: int = 5,
) -> QueueMessage | None:
    client = get_redis_client()
    queue = queue_name or get_queue_name()
    deadline = time.monotonic() + timeout
    raw_payload = None
    while raw_payload is None:
        raw_payload = client.eval(_CLAIM, 2, queue, f"{queue}:processing", time.time() + 120)
        if raw_payload is not None or time.monotonic() >= deadline:
            break
        time.sleep(0.2)
    if raw_payload is None:
        return None
    try:
        payload: dict[str, Any] = json.loads(raw_payload)
        return QueueMessage(
            job_id=int(payload["job_id"]),
            queued_at=float(payload.get("queued_at") or time.time()),
            receipt=raw_payload,
            queue_name=queue,
        )
    except Exception:
        logger.warning("Discarding malformed AI job queue payload: %s", raw_payload)
        client.zrem(f"{queue}:processing", raw_payload)
        return None


def queue_depth(*, queue_name: str | None = None) -> int:
    client = get_redis_client()
    return int(client.llen(queue_name or get_queue_name()))


def retry_queue_depth(*, queue_name: str | None = None) -> int:
    client = get_redis_client()
    return int(client.zcard(queue_name or get_retry_queue_name()))


def dead_letter_depth(*, queue_name: str | None = None) -> int:
    client = get_redis_client()
    return int(client.llen(queue_name or get_dead_letter_queue_name()))
