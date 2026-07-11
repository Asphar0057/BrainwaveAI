from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

import models
from activity_context import begin_provider_usage_delta, clear_provider_usage_delta, get_provider_usage_delta
from database import SessionLocal
from deps import ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, SECRET_KEY
from middleware.rate_limiter import _classify
from services.token_limits import get_token_limit_state, token_limit_error_payload

logger = logging.getLogger(__name__)

TOKEN_LIMIT_TIERS = {"ai_heavy", "ai_light"}


def _identifiers_from_csv(raw: str | None) -> set[str]:
    return {
        item.strip().lower()
        for item in (raw or "").split(",")
        if item.strip()
    }


def _subject_bypasses_token_limit(subject: str) -> bool:
    normalized = (subject or "").strip().lower()
    if not normalized:
        return False
    bypass_identifiers = (
        _identifiers_from_csv(os.getenv("AI_LOAD_TEST_FALLBACK_USERS"))
        | _identifiers_from_csv(os.getenv("RATE_LIMIT_UNLIMITED_EMAILS"))
        | _identifiers_from_csv(os.getenv("ADMIN_EMAILS"))
        | _identifiers_from_csv(os.getenv("API_USAGE_ADMIN_EMAILS"))
    )
    return normalized in bypass_identifiers


def _jwt_subject(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
        )
        return payload.get("sub")
    except JWTError:
        return None


def _request_subject(request: Request) -> Optional[str]:
    return (
        _jwt_subject(request)
        or request.headers.get("X-User-Id")
        or request.query_params.get("user_id")
        or request.query_params.get("username")
    )


def _find_user(db: Session, subject: str) -> Optional[models.User]:
    normalized = (subject or "").strip().lower()
    if not normalized or normalized == "null":
        return None
    return (
        db.query(models.User)
        .filter(
            (models.User.username.ilike(normalized))
            | (models.User.email.ilike(normalized))
        )
        .first()
    )


class TokenLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        tier = _classify(request.method, request.url.path)
        if tier not in TOKEN_LIMIT_TIERS:
            return await call_next(request)

        subject = _request_subject(request)
        if not subject:
            return await call_next(request)
        if _subject_bypasses_token_limit(subject):
            return await call_next(request)

        state = None
        user_id = None
        try:
            with SessionLocal() as db:
                user = _find_user(db, subject)
                if user:
                    user_id = user.id
                    state = get_token_limit_state(db, user)

            if state is None:
                return await call_next(request)

            if not state.get("allowed", True):
                logger.warning(
                    "AI token limit exceeded | user_id=%s plan=%s used=%s limit=%s path=%s",
                    user_id,
                    state.get("plan_id"),
                    state.get("used_tokens"),
                    state.get("included_tokens"),
                    request.url.path,
                )
                payload = token_limit_error_payload(state)
                return JSONResponse(
                    status_code=429,
                    content=payload,
                    headers={
                        "X-TokenLimit-Limit": str(state.get("included_tokens", 0)),
                        "X-TokenLimit-Used": str(state.get("used_tokens", 0)),
                        "X-TokenLimit-Remaining": str(state.get("remaining_tokens", 0)),
                        "X-TokenLimit-Plan": str(state.get("plan_id", "")),
                        "X-TokenLimit-Reset": str(state.get("reset_at") or ""),
                        "X-TokenLimit-Reset-After": str(state.get("reset_after_seconds") or ""),
                    },
                )

            provider_delta_token = begin_provider_usage_delta()
            try:
                response = await call_next(request)
                provider_usage_delta = get_provider_usage_delta()
            finally:
                clear_provider_usage_delta(provider_delta_token)

            # The AI call may have recorded usage in a separate session while the
            # request was running. Use a fresh short-lived session for headers so
            # long-running generations do not pin a DB connection in middleware.
            if not state.get("unlimited"):
                try:
                    with SessionLocal() as db:
                        refreshed_user = _find_user(db, subject)
                        if refreshed_user:
                            state = get_token_limit_state(db, refreshed_user)
                except Exception as refresh_exc:
                    logger.warning(
                        "Could not refresh token usage headers for %s: %s",
                        request.url.path,
                        refresh_exc,
                    )

            if not state.get("unlimited"):
                response.headers["X-TokenLimit-Limit"] = str(state.get("included_tokens", 0))
                response.headers["X-TokenLimit-Used"] = str(state.get("used_tokens", 0))
                response.headers["X-TokenLimit-Remaining"] = str(state.get("remaining_tokens", 0))
                response.headers["X-TokenLimit-Plan"] = str(state.get("plan_id", ""))
                if state.get("reset_at"):
                    response.headers["X-TokenLimit-Reset"] = str(state.get("reset_at"))
                if state.get("reset_after_seconds") is not None:
                    response.headers["X-TokenLimit-Reset-After"] = str(state.get("reset_after_seconds"))
            else:
                response.headers["X-TokenLimit-Limit"] = "unlimited"
                response.headers["X-TokenLimit-Remaining"] = "unlimited"
                response.headers["X-TokenLimit-Plan"] = str(state.get("plan_id", "unlimited"))
            response.headers["X-TokenUsage-Delta"] = str(provider_usage_delta)
            return response
        except Exception as exc:
            logger.exception("Token limit check failed for %s: %s", request.url.path, exc)
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "AI token limit check is temporarily unavailable. Please try again shortly.",
                    "code": "ai_token_limit_check_unavailable",
                },
            )
