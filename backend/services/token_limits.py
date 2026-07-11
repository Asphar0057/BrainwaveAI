from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

import models
from services.subscription_catalog import get_plan, normalize_plan_id
from services.token_usage_filters import BILLABLE_AI_USAGE_WHERE


DEFAULT_UNLIMITED_IDENTIFIERS = "aditya.s.lanka@gmail.com,rithvikkumar35@gmail.com,AL04"
TOKEN_LIMIT_WINDOW_DAYS = max(1, int(os.getenv("AI_TOKEN_LIMIT_WINDOW_DAYS", "30")))


def _identifiers_from_csv(raw: str | None) -> set[str]:
    return {
        item.strip().lower()
        for item in (raw or "").split(",")
        if item.strip()
    }


def _unlimited_identifiers() -> set[str]:
    return (
        _identifiers_from_csv(DEFAULT_UNLIMITED_IDENTIFIERS)
        | _identifiers_from_csv(os.getenv("RATE_LIMIT_UNLIMITED_EMAILS"))
        | _identifiers_from_csv(os.getenv("ADMIN_EMAILS"))
        | _identifiers_from_csv(os.getenv("API_USAGE_ADMIN_EMAILS"))
    )


def is_unlimited_user(user: models.User | None) -> bool:
    if not user:
        return False
    identifiers = _unlimited_identifiers()
    return any(
        value and value.strip().lower() in identifiers
        for value in (getattr(user, "username", None), getattr(user, "email", None))
    )


def get_user_token_usage(db: Session, user_id: int, days: int = TOKEN_LIMIT_WINDOW_DAYS) -> int:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    row = db.execute(
        text(
            """
            SELECT COALESCE(SUM(tokens_used), 0) AS total_tokens
            FROM user_activity_log
            WHERE user_id = :uid AND timestamp >= :since
            {billable_filter}
            """.format(billable_filter=BILLABLE_AI_USAGE_WHERE)
        ),
        {"uid": user_id, "since": since},
    ).mappings().first()
    return int((row or {}).get("total_tokens") or 0)


def get_user_token_reset_at(
    db: Session,
    user_id: int,
    included_tokens: int,
    days: int = TOKEN_LIMIT_WINDOW_DAYS,
) -> str | None:
    if included_tokens <= 0:
        return None

    since_dt = datetime.now(timezone.utc) - timedelta(days=days)
    since = since_dt.strftime("%Y-%m-%d %H:%M:%S")
    rows = db.execute(
        text(
            """
            SELECT timestamp, tokens_used
            FROM user_activity_log
            WHERE user_id = :uid AND timestamp >= :since
            {billable_filter}
            ORDER BY timestamp ASC
            """.format(billable_filter=BILLABLE_AI_USAGE_WHERE)
        ),
        {"uid": user_id, "since": since},
    ).mappings().all()

    total = sum(int((row or {}).get("tokens_used") or 0) for row in rows)
    if total < included_tokens:
        return None

    for row in rows:
        total -= int((row or {}).get("tokens_used") or 0)
        timestamp = (row or {}).get("timestamp")
        if total < included_tokens and timestamp:
            if isinstance(timestamp, str):
                ts = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            else:
                ts = timestamp
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            return (ts.astimezone(timezone.utc) + timedelta(days=days)).isoformat()

    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def _seconds_until(reset_at: str | None) -> int | None:
    if not reset_at:
        return None
    try:
        target = datetime.fromisoformat(str(reset_at).replace("Z", "+00:00"))
        if target.tzinfo is None:
            target = target.replace(tzinfo=timezone.utc)
        return max(0, int((target.astimezone(timezone.utc) - datetime.now(timezone.utc)).total_seconds()))
    except Exception:
        return None


def get_user_plan_id(db: Session, user: models.User) -> str:
    if is_unlimited_user(user):
        return "unlimited"
    profile = (
        db.query(models.ComprehensiveUserProfile.subscription_tier)
        .filter(models.ComprehensiveUserProfile.user_id == user.id)
        .first()
    )
    plan_id = profile[0] if profile and profile[0] else None
    return normalize_plan_id(plan_id)


def get_token_limit_state(db: Session, user: models.User) -> dict[str, Any]:
    plan_id = get_user_plan_id(db, user)
    plan = get_plan(plan_id)
    included_tokens = int(plan.get("included_tokens_monthly") or 0)
    unlimited = bool(plan.get("unlimited")) or included_tokens <= 0
    if unlimited:
        return {
            "allowed": True,
            "plan_id": plan_id,
            "plan_name": plan.get("name") or plan_id.title(),
            "included_tokens": included_tokens,
            "used_tokens": 0,
            "remaining_tokens": None,
            "unlimited": True,
            "window_days": TOKEN_LIMIT_WINDOW_DAYS,
            "reset_at": None,
            "reset_after_seconds": None,
            "reset_after_hours": None,
        }

    used_tokens = get_user_token_usage(db, user.id)
    remaining_tokens = None if unlimited else max(0, included_tokens - used_tokens)
    allowed = unlimited or used_tokens < included_tokens
    reset_at = None if unlimited else get_user_token_reset_at(
        db,
        user.id,
        included_tokens,
        TOKEN_LIMIT_WINDOW_DAYS,
    )
    reset_after_seconds = _seconds_until(reset_at)

    return {
        "allowed": allowed,
        "plan_id": plan_id,
        "plan_name": plan.get("name") or plan_id.title(),
        "included_tokens": included_tokens,
        "used_tokens": used_tokens,
        "remaining_tokens": remaining_tokens,
        "unlimited": unlimited,
        "window_days": TOKEN_LIMIT_WINDOW_DAYS,
        "reset_at": reset_at,
        "reset_after_seconds": reset_after_seconds,
        "reset_after_hours": (
            round(reset_after_seconds / 3600, 1)
            if reset_after_seconds is not None
            else None
        ),
    }


def token_limit_error_payload(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "detail": (
            f"You have reached the {state.get('plan_name', 'current plan')} AI token limit "
            f"for the current {state.get('window_days', TOKEN_LIMIT_WINDOW_DAYS)} day usage window."
        ),
        "code": "ai_token_limit_exceeded",
        "current_plan_id": state.get("plan_id"),
        "current_plan_name": state.get("plan_name"),
        "used_tokens": state.get("used_tokens", 0),
        "included_tokens": state.get("included_tokens", 0),
        "remaining_tokens": state.get("remaining_tokens", 0),
        "window_days": state.get("window_days", TOKEN_LIMIT_WINDOW_DAYS),
        "reset_at": state.get("reset_at"),
        "reset_after_seconds": state.get("reset_after_seconds"),
        "reset_after_hours": state.get("reset_after_hours"),
    }
