import os
import logging
import time
from contextlib import contextmanager
from threading import Lock
from contextvars import copy_context
from datetime import datetime, timezone, timedelta
import json
from typing import Any, Iterable

from env_loader import load_backend_env

load_backend_env()

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

import models
from database import SessionLocal, get_db
from services.ai_utils import UnifiedAIClient
from services.api_key_pool import build_key_pool

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set. Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\"")
ALGORITHM = "HS256"
JWT_ISSUER = "brainwave-backend"
JWT_AUDIENCE = "brainwave-client"
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_IDS = [
    client_id.strip()
    for client_id in (os.getenv("GOOGLE_CLIENT_IDS") or GOOGLE_CLIENT_ID or "").split(",")
    if client_id.strip()
]

ph = PasswordHasher()
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)
_AUTH_USER_CACHE_TTL_SECONDS = max(0, int(os.getenv("AUTH_USER_CACHE_TTL_SECONDS", "30")))
_auth_user_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_auth_user_cache_lock = Lock()
class _RefCountedLock:
    __slots__ = ("lock", "refcount")

    def __init__(self):
        self.lock = Lock()
        self.refcount = 0


_auth_user_lookup_locks: dict[str, _RefCountedLock] = {}
_auth_user_lookup_locks_guard = Lock()

GEMINI_API_KEY = os.getenv("GOOGLE_GENERATIVE_AI_KEY") or os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
# "gemini-2.0-flash" was retired by Google (404s on every call as of 2026-09) --
# "gemini-flash-latest" is Google's rolling alias to the current stable Flash
# model, which avoids re-breaking every time a pinned snapshot is retired.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
GROQ_MODEL = "openai/gpt-oss-120b"
# Use a currently available multimodal model; allow deployment overrides.
GROQ_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.8-27b")

HS_CONTEXT_API_KEY  = os.getenv("HS_CONTEXT_API_KEY")
HS_AI_BASE_URL      = os.getenv("HS_AI_BASE_URL", "https://api.groq.com/openai/v1")
HS_AI_MODEL         = os.getenv("HS_AI_MODEL", "openai/gpt-oss-120b")

def _init_ai_client() -> UnifiedAIClient:
    from groq import Groq
    gemini_key_pool = build_key_pool(
        "gemini",
        ("GEMINI_API_KEYS", "GOOGLE_GENERATIVE_AI_KEYS", "GOOGLE_GENERATIVE_AI_KEY", "GEMINI_API_KEY"),
    )
    groq_key_pool = build_key_pool("groq", ("GROQ_API_KEYS", "GROQ_API_KEY"))
    effective_groq_key = GROQ_API_KEY or (groq_key_pool.entries[0].token if groq_key_pool.enabled else None)
    effective_gemini_key = GEMINI_API_KEY or (gemini_key_pool.entries[0].token if gemini_key_pool.enabled else None)
    groq_client = Groq(api_key=effective_groq_key) if effective_groq_key and not groq_key_pool.enabled else None
    gemini_client = None
    try:
        from google import genai
        if effective_gemini_key:
            gemini_client = genai.Client(api_key=effective_gemini_key)
    except ImportError:
        pass
    return UnifiedAIClient(
        gemini_client,
        groq_client,
        GEMINI_MODEL,
        GROQ_MODEL,
        effective_gemini_key,
        gemini_key_pool=gemini_key_pool,
        groq_key_pool=groq_key_pool,
        groq_vision_model=GROQ_VISION_MODEL,
    )

def _init_hs_context_ai(fallback_client: UnifiedAIClient | None = None) -> UnifiedAIClient:
    hs_key_pool = build_key_pool("hs_context", ("HS_CONTEXT_API_KEYS", "HS_CONTEXT_API_KEY"))
    effective_hs_key = HS_CONTEXT_API_KEY or (hs_key_pool.entries[0].token if hs_key_pool.enabled else None)
    if not effective_hs_key:
        logger.warning("HS_CONTEXT_API_KEY not set — HS context AI will use main client")
        return fallback_client or _init_ai_client()
    logger.info(f"HS context AI initialised: model={HS_AI_MODEL} base_url={HS_AI_BASE_URL}")
    return UnifiedAIClient(
        openai_compat_api_key=effective_hs_key,
        openai_compat_key_pool=hs_key_pool,
        openai_compat_base_url=HS_AI_BASE_URL,
        openai_compat_model=HS_AI_MODEL,
        fallback_ai_client=fallback_client,
    )

class _LazyAIClient:
    """Classroom/auth endpoints can start without provisioning an AI provider."""
    def __init__(self, factory):
        self._factory = factory
        self._client = None
        self._lock = Lock()

    def __getattr__(self, name):
        if self._client is None:
            with self._lock:
                if self._client is None:
                    self._client = self._factory()
        return getattr(self._client, name)


unified_ai = _LazyAIClient(_init_ai_client)
hs_context_ai = _LazyAIClient(lambda: _init_hs_context_ai(unified_ai))

def call_ai(prompt: str, max_tokens: int = 2000, temperature: float = 0.7,
            use_cache: bool = False, conversation_id: str = None) -> str:
    response = unified_ai.generate(prompt, max_tokens, temperature, use_cache, conversation_id)
    try:
        from services.math_processor import process_math_in_response, enhance_display_math
        response = process_math_in_response(response)
        response = enhance_display_math(response)
    except ImportError:
        pass
    return response

async def call_ai_async(prompt: str, max_tokens: int = 2000, temperature: float = 0.7,
                        use_cache: bool = False, conversation_id: str = None) -> str:
    context = copy_context()
    return await run_in_threadpool(
        context.run,
        call_ai,
        prompt,
        max_tokens,
        temperature,
        use_cache,
        conversation_id,
    )

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        ph.verify(hashed_password, plain_password)
        return True
    except VerifyMismatchError:
        return False

def get_password_hash(password: str) -> str:
    return ph.hash(password)

from services.auth_tokens import AuthSubject, create_user_access_token, resolve_access_token


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> str:
    return AuthSubject(resolve_access_token(credentials.credentials, db))


def invalidate_cached_auth_user(user, extra_subjects=()):
    # Authentication now reads session-bound ORM instances, never detached cached users.
    with _auth_user_cache_lock:
        _auth_user_cache.clear()


def _find_user_for_subject(db, subject):
    if isinstance(subject, AuthSubject):
        return db.query(models.User).filter(models.User.id == subject.user_id).first()
    user = db.query(models.User).filter(models.User.username == subject).first()
    if not user:
        user = db.query(models.User).filter(models.User.email == subject).first()
    return user


def _get_or_query_user_for_subject(db, subject):
    return _find_user_for_subject(db, subject)


def get_current_user(db: Session = Depends(get_db), token: str = Depends(verify_token)):
    user = _find_user_for_subject(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_current_user_optional(db: Session = Depends(get_db), credentials=Depends(optional_security)):
    return resolve_access_token(credentials.credentials, db) if credentials else None

def _iter_user_scope_values(payload: Any, keys: set[str], depth: int = 0) -> Iterable[str]:
    if payload is None or depth > 4:
        return
    if isinstance(payload, dict):
        for k, v in payload.items():
            if k in keys and v is not None:
                if isinstance(v, (list, tuple, set)):
                    for item in v:
                        if item is not None:
                            yield str(item)
                else:
                    yield str(v)
            if isinstance(v, (dict, list, tuple)):
                yield from _iter_user_scope_values(v, keys, depth + 1)
    elif isinstance(payload, (list, tuple)):
        for item in payload[:200]:
            if isinstance(item, (dict, list, tuple)):
                yield from _iter_user_scope_values(item, keys, depth + 1)

async def enforce_request_user_scope(
    request: Request,
    current_user: models.User = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    keys = {"user_id", "userId", "user_id_param", "student_id"}
    candidates: list[str] = []

    for key in keys:
        path_val = request.path_params.get(key)
        if path_val is not None:
            candidates.append(str(path_val))
        query_vals = request.query_params.getlist(key)
        candidates.extend([str(v) for v in query_vals if v is not None])

    content_type = (request.headers.get("content-type") or "").lower()

    if "application/json" in content_type:
        try:
            body = await request.json()
            candidates.extend(list(_iter_user_scope_values(body, keys)))
        except (json.JSONDecodeError, ValueError, RuntimeError):
            pass
    elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        try:
            form_data = await request.form()
            for key in keys:
                for value in form_data.getlist(key):
                    if value is not None:
                        candidates.append(str(value))
        except Exception:
            pass

    normalized_candidates = [c.strip() for c in candidates if isinstance(c, str) and c.strip()]
    if not normalized_candidates:
        return None

    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    allowed = {str(current_user.id), current_user.username, current_user.email}
    for requested in normalized_candidates:
        if requested not in allowed:
            raise HTTPException(status_code=403, detail="Access denied")
        # A numeric username must not let an ID-shaped reference select another account.
        other = db.query(models.User.id).filter(models.User.username == requested, models.User.id != current_user.id).first()
        if other:
            raise HTTPException(status_code=403, detail="Ambiguous account reference")
    return current_user

def get_user_by_username(db: Session, username: str):
    return _get_or_query_user_for_subject(db, username)

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_user_by_phone(db: Session, phone: str):
    if not phone:
        return None
    return db.query(models.User).filter(models.User.phone_number == phone).first()

def authenticate_user(db: Session, username: str, password: str):
    user = get_user_by_username(db, username)
    if not user:
        user = get_user_by_email(db, username)
    if not user:
        return False
    if getattr(user, "google_user", False):
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def verify_google_token(token: str):
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    audiences = GOOGLE_CLIENT_IDS or [GOOGLE_CLIENT_ID]
    last_error = None
    for audience in audiences:
        try:
            idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), audience)
            if idinfo["iss"] not in ["accounts.google.com", "https://accounts.google.com"]:
                raise ValueError("Wrong issuer.")
            return idinfo
        except ValueError as e:
            last_error = e
    logger.warning("Google token verification failed: %s", last_error)
    raise HTTPException(status_code=400, detail="Invalid token")

def get_comprehensive_profile_safe(db: Session, user_id: int):
    try:
        return db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user_id
        ).first()
    except Exception:
        return None

def calculate_day_streak(db: Session, user_id: int) -> int:
    today = datetime.now(timezone.utc).date()
    recent_days = db.query(models.DailyLearningMetrics.date).filter(
        models.DailyLearningMetrics.user_id == user_id,
        models.DailyLearningMetrics.questions_answered > 0,
    ).order_by(models.DailyLearningMetrics.date.desc()).all()
    if not recent_days:
        return 0
    recent_dates = [day[0] for day in recent_days]
    if today not in recent_dates and (today - timedelta(days=1)) not in recent_dates:
        return 0
    streak = 0
    check_date = today if today in recent_dates else today - timedelta(days=1)
    while check_date in recent_dates:
        streak += 1
        check_date -= timedelta(days=1)
    return streak
