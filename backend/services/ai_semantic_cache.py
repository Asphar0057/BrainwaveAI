from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

from services.ai_job_queue import get_redis_url

logger = logging.getLogger(__name__)

_semantic_cache: Any | None = None
_semantic_cache_ready = False
_semantic_cache_error: str | None = None


@dataclass(frozen=True)
class SemanticCacheHit:
    response: str
    metadata: dict[str, Any]


def semantic_cache_enabled() -> bool:
    return os.getenv("AI_SEMANTIC_CACHE_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}


def semantic_cache_scope() -> str:
    scope = os.getenv("AI_SEMANTIC_CACHE_SCOPE", "user").strip().lower()
    if scope not in {"user", "global"}:
        return "user"
    return scope


def semantic_cache_status() -> dict[str, Any]:
    return {
        "enabled": semantic_cache_enabled(),
        "ready": _semantic_cache_ready,
        "scope": semantic_cache_scope(),
        "error": _semantic_cache_error,
    }


def _init_semantic_cache() -> Any | None:
    global _semantic_cache, _semantic_cache_ready, _semantic_cache_error

    if _semantic_cache_ready:
        return _semantic_cache
    if not semantic_cache_enabled():
        return None

    try:
        from redisvl.extensions.llmcache import SemanticCache
        from redisvl.utils.vectorize import HFTextVectorizer

        vectorizer = HFTextVectorizer(
            model=os.getenv("AI_SEMANTIC_CACHE_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
        )
        _semantic_cache = SemanticCache(
            name=os.getenv("AI_SEMANTIC_CACHE_INDEX", "brainwave_ai_semantic_cache"),
            redis_url=get_redis_url(),
            distance_threshold=float(os.getenv("AI_SEMANTIC_CACHE_DISTANCE_THRESHOLD", "0.12")),
            ttl=int(os.getenv("AI_SEMANTIC_CACHE_TTL_SECONDS", "86400")),
            vectorizer=vectorizer,
        )
        _semantic_cache_ready = True
        _semantic_cache_error = None
        logger.info("RedisVL semantic AI cache enabled")
        return _semantic_cache
    except Exception as exc:
        _semantic_cache = None
        _semantic_cache_ready = False
        _semantic_cache_error = str(exc)
        logger.warning("RedisVL semantic AI cache disabled: %s", exc)
        return None


def _cache_metadata(user_id: int, job_type: str, cache_scope: str | None = None) -> dict[str, Any]:
    scope = "user" if job_type == "chat_completion" else (cache_scope or semantic_cache_scope())
    metadata: dict[str, Any] = {
        "job_type": job_type,
        "scope": scope,
    }
    if scope == "user":
        metadata["user_id"] = str(user_id)
    return metadata


def _metadata_matches(candidate: dict[str, Any], expected: dict[str, Any]) -> bool:
    metadata = candidate.get("metadata") or {}
    if isinstance(metadata, str):
        return False
    for key, value in expected.items():
        if str(metadata.get(key)) != str(value):
            return False
    return True


def get_semantic_cache(
    prompt: str,
    *,
    user_id: int,
    job_type: str,
    cache_scope: str | None = None,
) -> SemanticCacheHit | None:
    cache = _init_semantic_cache()
    if cache is None:
        return None

    expected_metadata = _cache_metadata(user_id, job_type, cache_scope)
    try:
        matches = cache.check(prompt=prompt, num_results=5)
    except TypeError:
        matches = cache.check(prompt, num_results=5)
    except Exception as exc:
        logger.debug("Semantic cache lookup failed: %s", exc)
        return None

    for match in matches or []:
        if not isinstance(match, dict):
            continue
        if not _metadata_matches(match, expected_metadata):
            continue
        response = match.get("response") or match.get("answer")
        if response:
            return SemanticCacheHit(response=str(response), metadata=match)
    return None


def set_semantic_cache(
    prompt: str,
    response: str,
    *,
    user_id: int,
    job_type: str,
    cache_scope: str | None = None,
) -> None:
    cache = _init_semantic_cache()
    if cache is None or not response:
        return

    metadata = _cache_metadata(user_id, job_type, cache_scope)
    try:
        cache.store(prompt=prompt, response=response, metadata=metadata)
    except TypeError:
        try:
            cache.store(prompt, response, metadata=metadata)
        except Exception as exc:
            logger.debug("Semantic cache store failed: %s", exc)
    except Exception as exc:
        logger.debug("Semantic cache store failed: %s", exc)
