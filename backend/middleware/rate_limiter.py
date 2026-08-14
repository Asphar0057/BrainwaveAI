from __future__ import annotations

import logging
import os
import threading
import time
import uuid
import ipaddress
from collections import defaultdict, deque
from typing import Optional, Tuple

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import jwt, JWTError
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from database import engine
from services.subscription_catalog import DEFAULT_PLAN_ID, get_effective_rate_limit, normalize_plan_id

logger = logging.getLogger(__name__)

TIERS: dict[str, tuple[int, int]] = {
    "auth_login":    (5,    60),
    "auth_register": (3,    3600),
    "auth_social":   (10,   60),
    "ai_heavy":      (30,   14400),   # 4-hour rolling window (like ChatGPT)
    "ai_light":      (100,  3600),
    "file_upload":   (20,   3600),
    "write":         (300,  3600),
    "read":          (1000, 3600),
}

_AUTH_TIERS = {"auth_login", "auth_register", "auth_social"}

_RULES: list[tuple[Optional[frozenset], Optional[str], Optional[str]]] = [
    (None,                          "/api/health",                      None),
    (frozenset(["GET"]),            "/api/get_notifications",           None),

    (frozenset(["POST"]),           "/api/token",                       "auth_login"),
    (frozenset(["POST"]),           "/api/token_form",                  "auth_login"),
    (frozenset(["POST"]),           "/api/register",                    "auth_register"),
    (frozenset(["POST"]),           "/api/google-auth",                 "auth_social"),
    (frozenset(["POST"]),           "/api/firebase-auth",               "auth_social"),
    (frozenset(["POST"]),           "/api/forgot-password",             "auth_login"),
    (frozenset(["POST"]),           "/api/reset-password",              "auth_login"),

    (frozenset(["POST"]),           "/api/ask_simple",                  "ai_heavy"),
    (frozenset(["POST"]),           "/api/ask_with_files",              "ai_heavy"),
    (frozenset(["POST"]),           "/api/ask",                         "ai_heavy"),
    (frozenset(["POST"]),           "/api/ai/jobs",                     "ai_heavy"),
    (frozenset(["POST"]),           "/api/ai/file-route-jobs",          "ai_heavy"),
    (frozenset(["POST"]),           "/api/ai/route-jobs",               "ai_heavy"),
    (frozenset(["POST"]),           "/api/save_chat_message",           "ai_heavy"),
    (frozenset(["POST"]),           "/api/generate_flashcards",         "ai_heavy"),
    (frozenset(["POST"]),           "/api/generate_notes",              "ai_heavy"),
    (frozenset(["POST"]),           "/api/generate_practice_questions", "ai_heavy"),
    (frozenset(["POST"]),           "/api/generate_quiz",               "ai_heavy"),
    (frozenset(["POST"]),           "/api/generate_questions",          "ai_heavy"),
    (frozenset(["POST"]),           "/api/convert_to_flashcards",       "ai_heavy"),
    (frozenset(["POST"]),           "/api/convert_to_notes",            "ai_heavy"),
    (None,                          "/api/agents/",                     "ai_heavy"),
    (None,                          "/api/learning-paths/generate",     "ai_heavy"),
    (None,                          "/api/learning-paths/ai",           "ai_heavy"),
    (frozenset(["POST"]),           "/api/summarize_notes",             "ai_heavy"),
    (frozenset(["POST"]),           "/api/create_study_plan",           "ai_heavy"),
    (frozenset(["POST"]),           "/api/roadmaps",                    "ai_heavy"),
    (None,                          "/api/media/process",               "ai_heavy"),
    (None,                          "/api/media/podcast",               "ai_heavy"),
    (None,                          "/api/media/regenerate",            "ai_heavy"),
    (None,                          "/api/media/generate-title",        "ai_heavy"),
    (None,                          "/api/analyze_slide",               "ai_heavy"),
    (None,                          "/api/context/ask",                 "ai_heavy"),
    (None,                          "/api/generate_chat_title",         "ai_heavy"),
    (None,                          "/api/generate_chat_summary",       "ai_heavy"),
    (None,                          "/api/intelligence/",               "ai_heavy"),
    (None,                          "/api/kt/predict",                  "ai_heavy"),

    (frozenset(["POST"]),           "/api/search_content",              "ai_light"),
    (frozenset(["POST"]),           "/api/natural_language_search",     "ai_light"),
    (frozenset(["POST"]),           "/api/detect_search_intent",        "ai_light"),
    (frozenset(["POST"]),           "/api/generate_topic_description",  "ai_light"),
    (frozenset(["POST"]),           "/api/suggest_subjects",            "ai_light"),
    (frozenset(["POST"]),           "/api/autocomplete",                "ai_light"),
    (frozenset(["POST"]),           "/api/get_personalized_prompts",    "ai_light"),
    (frozenset(["POST"]),           "/api/get_search_suggestion",       "ai_light"),

    (frozenset(["POST"]),           "/api/context",                     "file_upload"),
    (frozenset(["POST"]),           "/api/import",                      "file_upload"),
    (frozenset(["POST"]),           "/api/upload",                      "file_upload"),
    (frozenset(["POST"]),           "/api/upload_media",                "file_upload"),
    (frozenset(["POST"]),           "/api/upload_slide",                "file_upload"),
    (frozenset(["POST"]),           "/api/transcribe_audio",            "file_upload"),

    (frozenset(["POST", "PUT", "PATCH", "DELETE"]), None, "write"),

    (frozenset(["GET"]),            None,                               "read"),
]

_LUA_SCRIPT = """
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
local uid    = ARGV[4]

local win_start = now - window

redis.call('ZREMRANGEBYSCORE', key, 0, win_start)
local count = redis.call('ZCARD', key)

if count < limit then
    redis.call('ZADD', key, now, uid)
    redis.call('EXPIRE', key, window * 2)
    local oldest_list = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local oldest = (oldest_list and oldest_list[2]) and tonumber(oldest_list[2]) or now
    return {1, count + 1, oldest}
else
    local oldest_list = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local oldest = (oldest_list and oldest_list[2]) and tonumber(oldest_list[2]) or now
    return {0, count, oldest}
end
"""

_redis_client = None
_lua_sha: Optional[str] = None
_mem_lock = threading.Lock()
_mem_store: dict[str, deque] = defaultdict(deque)

def _is_production() -> bool:
    environment = os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "development"
    return environment.strip().lower() == "production"

_SECRET_KEY: str = os.getenv("SECRET_KEY", "")
_ALGORITHM = "HS256"
_JWT_AUDIENCE = "brainwave-client"
_JWT_ISSUER = "brainwave-backend"

_TRUSTED_PROXY_CIDRS_RAW = os.getenv("RATE_LIMIT_TRUSTED_PROXY_CIDRS", "127.0.0.1/32,::1/128")
_DEFAULT_UNLIMITED_IDENTIFIERS = ""

# Optional override to force every user's effective rate limit tier (e.g. "power"),
# regardless of their actual stored subscription. Off by default so per-user tiers
# (starter/pro/power), set via /api/subscription/select, take effect normally.
_FORCE_TIER_RAW = os.getenv("RATE_LIMIT_FORCE_TIER", "").strip().lower()
FORCE_TIER: Optional[str] = (
    normalize_plan_id(_FORCE_TIER_RAW) if _FORCE_TIER_RAW not in ("", "off", "none", "false") else None
)

def _identifiers_from_csv(raw: str | None) -> set[str]:
    return {
        email.strip().lower()
        for email in (raw or "").split(",")
        if email.strip()
    }

_UNLIMITED_IDENTIFIERS = (
    _identifiers_from_csv(_DEFAULT_UNLIMITED_IDENTIFIERS)
    | _identifiers_from_csv(os.getenv("RATE_LIMIT_UNLIMITED_EMAILS"))
    | _identifiers_from_csv(os.getenv("ADMIN_EMAILS"))
    | _identifiers_from_csv(os.getenv("API_USAGE_ADMIN_EMAILS"))
)

_MEM_MAX_KEYS = max(1000, int(os.getenv("RATE_LIMIT_MEMORY_MAX_KEYS", "20000")))
_MEM_EVICT_BATCH = max(100, _MEM_MAX_KEYS // 4)
_SUBSCRIPTION_CACHE_TTL = max(30, int(os.getenv("RATE_LIMIT_SUBSCRIPTION_CACHE_TTL", "120")))

_subscription_lock = threading.Lock()
_subscription_cache: dict[str, tuple[str, float]] = {}

_EXACT_MATCH_PATHS = {
    "/api/health",
    "/api/ai/jobs",
    "/api/ai/file-route-jobs",
    "/api/ai/route-jobs",
}

def _parse_cidrs(raw: str) -> list[ipaddress._BaseNetwork]:
    networks: list[ipaddress._BaseNetwork] = []
    for token in (raw or "").split(","):
        token = token.strip()
        if not token:
            continue
        try:
            networks.append(ipaddress.ip_network(token, strict=False))
        except ValueError:
            logger.warning("Rate limiter: ignoring invalid proxy CIDR '%s'", token)
    return networks

_TRUSTED_PROXY_NETWORKS = _parse_cidrs(_TRUSTED_PROXY_CIDRS_RAW)

def init_redis_for_rate_limiter(redis_client) -> None:
    global _redis_client, _lua_sha
    _redis_client = redis_client
    if _redis_client is not None:
        try:
            _lua_sha = _redis_client.script_load(_LUA_SCRIPT)
            logger.info("Rate limiter: Redis backend ready (Lua script loaded)")
        except Exception as e:
            logger.warning(f"Rate limiter: Redis Lua load failed ({e}), using in-memory fallback")
            _redis_client = None

def _is_from_trusted_proxy(request: Request) -> bool:
    if not _TRUSTED_PROXY_NETWORKS:
        return False
    if not request.client or not request.client.host:
        return False
    try:
        peer_ip = ipaddress.ip_address(request.client.host)
    except ValueError:
        return False
    return any(peer_ip in net for net in _TRUSTED_PROXY_NETWORKS)

def _extract_leftmost_ip(xff: str) -> Optional[str]:
    if not xff:
        return None
    candidate = xff.split(",")[0].strip()
    if not candidate:
        return None
    try:
        ipaddress.ip_address(candidate)
        return candidate
    except ValueError:
        return None

def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if _is_from_trusted_proxy(request):
        client_ip = _extract_leftmost_ip(xff)
        if client_ip:
            return client_ip
    if request.client:
        return request.client.host or "unknown"
    return "unknown"

_get_client_ip = get_client_ip

def _get_jwt_sub(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token or not _SECRET_KEY:
        return None
    try:
        payload = jwt.decode(
            token,
            _SECRET_KEY,
            algorithms=[_ALGORITHM],
            audience=_JWT_AUDIENCE,
            issuer=_JWT_ISSUER,
        )
        return payload.get("sub")
    except JWTError:
        return None

def _get_identity(request: Request, use_ip: bool) -> str:
    if use_ip:
        return get_client_ip(request)
    sub = _get_jwt_sub(request)
    if sub:
        return sub
    return get_client_ip(request)

def _prune_subscription_cache_locked(now: float) -> None:
    if len(_subscription_cache) < 2000:
        return
    expired = [k for k, (_, expires_at) in _subscription_cache.items() if expires_at <= now]
    for key in expired:
        _subscription_cache.pop(key, None)
    if len(_subscription_cache) < 2500:
        return
    oldest = sorted(_subscription_cache.keys(), key=lambda k: _subscription_cache[k][1])[:1000]
    for key in oldest:
        _subscription_cache.pop(key, None)

def invalidate_subscription_cache(*subjects: str) -> None:
    with _subscription_lock:
        for subject in subjects:
            if subject:
                _subscription_cache.pop(subject, None)
                _subscription_cache.pop(subject.strip().lower(), None)

def get_subscription_tier(subject: Optional[str]) -> str:
    tier = _resolve_subscription_tier(subject)
    if tier != "unlimited" and FORCE_TIER:
        return FORCE_TIER
    return tier

def _resolve_subscription_tier(subject: Optional[str]) -> str:
    normalized_subject = (subject or "").strip().lower()
    if not normalized_subject:
        return DEFAULT_PLAN_ID
    if normalized_subject in _UNLIMITED_IDENTIFIERS:
        return "unlimited"

    now = time.time()
    with _subscription_lock:
        cached = _subscription_cache.get(normalized_subject)
        if cached and cached[1] > now:
            return cached[0]

    tier = DEFAULT_PLAN_ID
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT cp.subscription_tier, u.email
                    FROM users u
                    LEFT JOIN comprehensive_user_profiles cp ON cp.user_id = u.id
                    WHERE lower(u.username) = :subject OR lower(u.email) = :subject
                    LIMIT 1
                    """
                ),
                {"subject": normalized_subject},
            ).first()
        if row:
            email = (row[1] or "").strip().lower()
            if email in _UNLIMITED_IDENTIFIERS:
                tier = "unlimited"
            elif row[0]:
                tier = normalize_plan_id(str(row[0]))
    except Exception as e:
        logger.debug("Rate limiter subscription lookup failed for %s: %s", normalized_subject, e)

    with _subscription_lock:
        _subscription_cache[normalized_subject] = (tier, now + _SUBSCRIPTION_CACHE_TTL)
        _prune_subscription_cache_locked(now)
    return tier

def _classify(method: str, path: str) -> Optional[str]:
    for rule_methods, rule_path, tier in _RULES:
        if rule_methods is not None and method not in rule_methods:
            continue
        if rule_path is not None:
            if rule_path in _EXACT_MATCH_PATHS:
                if path != rule_path:
                    continue
            elif len(rule_path) > 1:
                if not path.startswith(rule_path):
                    continue
            else:
                if path != rule_path:
                    continue
        return tier
    return None

def _check_redis(key: str, limit: int, window: int) -> Tuple[bool, int, float]:
    now = time.time()
    uid = str(uuid.uuid4())
    result = _redis_client.evalsha(_lua_sha, 1, key, now, window, limit, uid)
    allowed = bool(int(result[0]))
    current = int(result[1])
    oldest = float(result[2])
    return allowed, current, oldest

def _check_memory(key: str, limit: int, window: int) -> Tuple[bool, int, float]:
    now = time.time()
    cutoff = now - window
    with _mem_lock:
        dq = _mem_store.get(key)
        if dq is None:
            dq = deque()
            _mem_store[key] = dq

        while dq and dq[0] < cutoff:
            dq.popleft()

        if not dq:
            _mem_store.pop(key, None)
            dq = deque()
            _mem_store[key] = dq

        count = len(dq)
        if count < limit:
            dq.append(now)
            _evict_memory_if_needed_locked()
            oldest = dq[0]
            return True, count + 1, oldest

        _evict_memory_if_needed_locked()
        oldest = dq[0] if dq else now
        return False, count, oldest

def _evict_memory_if_needed_locked() -> None:
    if len(_mem_store) <= _MEM_MAX_KEYS:
        return

    empty_keys = [k for k, v in _mem_store.items() if not v]
    for k in empty_keys:
        _mem_store.pop(k, None)
    if len(_mem_store) <= _MEM_MAX_KEYS:
        return

    overage = len(_mem_store) - _MEM_MAX_KEYS
    to_remove = min(len(_mem_store), max(_MEM_EVICT_BATCH, overage))

    oldest_keys = sorted(
        _mem_store.keys(),
        key=lambda k: _mem_store[k][-1] if _mem_store[k] else 0.0,
    )[:to_remove]
    for k in oldest_keys:
        _mem_store.pop(k, None)

def _check(key: str, limit: int, window: int) -> Tuple[bool, int, float]:
    if _redis_client is not None and _lua_sha is not None:
        try:
            return _check_redis(key, limit, window)
        except Exception as e:
            logger.warning(f"Rate limiter Redis error ({e}); falling back to in-memory")
    return _check_memory(key, limit, window)

def _track(
    path: str,
    method: str,
    user_id: Optional[str],
    ip: str,
    tier: Optional[str],
    limit: int,
    used: int,
    allowed: bool,
    status_code: int,
    duration_ms: float,
    plan: str,
) -> None:
    try:
        from middleware.request_tracker import record
        record(
            path=path, method=method, user_id=user_id, ip=ip,
            tier=tier, limit=limit, used=used, allowed=allowed,
            status_code=status_code, duration_ms=duration_ms, plan=plan,
        )
    except Exception:
        pass


class RateLimitMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)

        if not _is_production():
            return await call_next(request)

        path = request.url.path
        method = request.method
        tier_name = _classify(method, path)
        _t0 = time.time()

        if tier_name is None:
            return await call_next(request)

        base_limit, window = TIERS[tier_name]
        use_ip = tier_name in _AUTH_TIERS
        identity = _get_identity(request, use_ip=use_ip)
        jwt_sub = _get_jwt_sub(request)
        ip = _get_client_ip(request)
        plan_id = DEFAULT_PLAN_ID
        if not use_ip:
            plan_id = get_subscription_tier(jwt_sub)
        limit = get_effective_rate_limit(plan_id, tier_name, base_limit)
        if limit <= 0:
            response = await call_next(request)
            dur = (time.time() - _t0) * 1000
            response.headers["X-RateLimit-Limit"] = "unlimited"
            response.headers["X-RateLimit-Remaining"] = "unlimited"
            response.headers["X-RateLimit-Reset"] = "0"
            response.headers["X-RateLimit-Window"] = str(window)
            response.headers["X-RateLimit-Tier"] = tier_name
            response.headers["X-RateLimit-Plan"] = plan_id
            _track(path, method, jwt_sub, ip, tier_name, 0, 0, True,
                   response.status_code, dur, plan_id)
            return response

        rl_key = f"rl:{tier_name}:{identity}"
        allowed, current, oldest = _check(rl_key, limit, window)

        reset_at = oldest + window
        remaining = max(0, limit - current)

        if not allowed:
            dur = (time.time() - _t0) * 1000
            retry_after = max(1, int(reset_at - time.time()))
            logger.warning(
                "Rate limit exceeded | tier=%s identity=%s path=%s method=%s",
                tier_name, identity, path, method,
            )
            _track(path, method, jwt_sub, ip, tier_name, limit, current,
                   False, 429, dur, plan_id)
            return JSONResponse(
                status_code=429,
                content={
                    "detail": (
                        f"Too many requests. You have reached the {tier_name} limit "
                        f"({limit} per {window}s). Please wait {retry_after} second(s)."
                    ),
                    "retry_after": retry_after,
                    "limit": limit,
                    "window_seconds": window,
                    "tier": tier_name,
                },
                headers={
                    "Retry-After":          str(retry_after),
                    "X-RateLimit-Limit":    str(limit),
                    "X-RateLimit-Remaining":"0",
                    "X-RateLimit-Reset":    str(int(reset_at)),
                    "X-RateLimit-Window":   str(window),
                    "X-RateLimit-Tier":     tier_name,
                    "X-RateLimit-Plan":     plan_id,
                },
            )

        response = await call_next(request)
        dur = (time.time() - _t0) * 1000
        _track(path, method, jwt_sub, ip, tier_name, limit, current,
               True, response.status_code, dur, plan_id)
        response.headers["X-RateLimit-Limit"]     = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"]     = str(int(reset_at))
        response.headers["X-RateLimit-Window"]    = str(window)
        response.headers["X-RateLimit-Tier"]      = tier_name
        response.headers["X-RateLimit-Plan"]      = plan_id
        return response
