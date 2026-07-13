import json
import logging
import os
import re
import secrets
import socket
import smtplib
import threading
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, Form, HTTPException, Query, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy import and_, bindparam, func, inspect, text
from sqlalchemy.orm import Session

import models
from deps import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_IDS,
    authenticate_user,
    call_ai,
    create_access_token,
    enforce_request_user_scope,
    get_current_user,
    get_db,
    get_password_hash,
    get_user_by_email,
    get_user_by_username,
    unified_ai,
    verify_password,
    verify_google_token,
)
from services.subscription_catalog import (
    DEFAULT_PLAN_ID,
    estimate_usage_cost_usd,
    get_plan,
    list_plans,
    normalize_plan_id,
)
from services.token_limits import get_user_token_reset_at
from services.token_usage_filters import BILLABLE_AI_USAGE_WHERE
from middleware.rate_limiter import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api",
    tags=["auth"],
    dependencies=[Depends(enforce_request_user_scope)],
)

_auth_attempts: dict = defaultdict(list)
_auth_lock = threading.Lock()
_AUTH_DICT_MAX = 5000

def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def _format_away_duration(previous_login: datetime, now: datetime) -> tuple[int, str]:
    elapsed_seconds = max(0, (now - previous_login).total_seconds())
    if elapsed_seconds < 24 * 60 * 60:
        return 0, ""
    days = max(1, int(elapsed_seconds // (24 * 60 * 60)))
    label = "1 day" if days == 1 else f"{days} days"
    return days, label

def _record_login_and_welcome_notification(db: Session, user: models.User) -> None:
    now = datetime.now(timezone.utc)
    previous_login = _as_utc(user.last_login)

    if previous_login:
        away_days, away_label = _format_away_duration(previous_login, now)
        marker = f"[login_return:{now.date().isoformat()}]"

        if away_days >= 1:
            existing = db.query(models.Notification).filter(
                models.Notification.user_id == user.id,
                models.Notification.notification_type == "login_return",
                models.Notification.message.contains(marker),
            ).first()

            if not existing:
                db.add(models.Notification(
                    user_id=user.id,
                    title="Welcome Back!",
                    message=f"You were away for {away_label}. Ready to jump back in? {marker}",
                    notification_type="login_return",
                ))

    user.last_login = now

def _sync_google_profile_fields(user: models.User, *, first_name: Optional[str] = None, last_name: Optional[str] = None, picture_url: Optional[str] = None) -> bool:
    changed = False
    if first_name and not user.first_name:
        user.first_name = first_name
        changed = True
    if last_name and not user.last_name:
        user.last_name = last_name
        changed = True
    if picture_url and user.picture_url != picture_url:
        user.picture_url = picture_url
        changed = True
    if not user.google_user:
        user.google_user = True
        changed = True
    return changed

def _check_auth_rate_limit(request: Request, max_attempts: int = 5, window_seconds: int = 60) -> None:
    ip = get_client_ip(request)
    now = datetime.now(timezone.utc).timestamp()
    cutoff = now - window_seconds
    with _auth_lock:
        _auth_attempts[ip] = [t for t in _auth_attempts[ip] if t > cutoff]
        if len(_auth_attempts[ip]) >= max_attempts:
            retry_after = int(window_seconds - (now - _auth_attempts[ip][0]))
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Please wait before trying again.",
                headers={"Retry-After": str(max(1, retry_after))},
            )
        _auth_attempts[ip].append(now)
        if len(_auth_attempts) > _AUTH_DICT_MAX:
            oldest_keys = sorted(
                _auth_attempts.keys(),
                key=lambda k: _auth_attempts[k][-1] if _auth_attempts[k] else 0,
            )[:_AUTH_DICT_MAX // 4]
            for k in oldest_keys:
                del _auth_attempts[k]

class Token(BaseModel):
    access_token: str
    token_type: str

class RegisterPayload(BaseModel):
    first_name: str
    last_name: str
    email: str
    username: str
    password: str
    age: Optional[int] = None
    field_of_study: Optional[str] = None
    learning_style: Optional[str] = None
    school_university: Optional[str] = None

class RegisterVerifyPayload(BaseModel):
    email: EmailStr
    otp: str

class RegisterResendPayload(BaseModel):
    email: str

class UserCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    username: str
    password: str
    age: Optional[int] = None
    field_of_study: Optional[str] = None
    learning_style: Optional[str] = None
    school_university: Optional[str] = None

class GoogleAuth(BaseModel):
    token: str

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    email: EmailStr
    otp: str
    new_password: str

class AccountDeletionRequest(BaseModel):
    password: Optional[str] = None

class AccountDeletionConfirm(BaseModel):
    otp: str

class UserProfileUpdate(BaseModel):
    user_id: str
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    age: Optional[int] = None
    fieldOfStudy: Optional[str] = None
    learningStyle: Optional[str] = None
    schoolUniversity: Optional[str] = None
    preferredSubjects: Optional[List[str]] = []
    difficultyLevel: Optional[str] = "intermediate"
    studySchedule: Optional[str] = "flexible"
    learningPace: Optional[str] = "moderate"
    motivationFactors: Optional[List[str]] = []
    weakAreas: Optional[List[str]] = []
    strongAreas: Optional[List[str]] = []
    careerGoals: Optional[str] = None
    studyGoals: Optional[str] = None
    timeZone: Optional[str] = None
    studyEnvironment: Optional[str] = "quiet"
    preferredLanguage: Optional[str] = "english"
    preferredSessionLength: Optional[int] = None
    bestStudyTimes: Optional[List[str]] = []

_VALID_BILLING_CYCLES = {"monthly", "yearly"}
_VALID_SUBSCRIPTION_STATUSES = {"active", "trial", "grace", "paused", "cancelled"}
_USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{3,50}$")
_TRUE_ENV_VALUES = {"1", "true", "yes", "on"}

def _is_production() -> bool:
    environment = os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "development"
    return environment.strip().lower() == "production"

def _env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in _TRUE_ENV_VALUES

def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()

def _validate_deliverable_email(email: str) -> str:
    try:
        from email_validator import EmailNotValidError, validate_email
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Email validation is not available. Install backend email validation dependencies.",
        )

    try:
        result = validate_email(email, check_deliverability=True)
    except EmailNotValidError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Enter a real email address that can receive mail. {str(e)}",
        )
    return _normalize_email(result.normalized)

def _validate_mailbox_if_enabled(email: str) -> None:
    if not _env_flag("REGISTRATION_SMTP_MAILBOX_CHECK"):
        return

    try:
        import dns.resolver
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Mailbox verification is not available. Install backend email validation dependencies.",
        )

    domain = email.rsplit("@", 1)[-1]
    try:
        mx_records = sorted(
            dns.resolver.resolve(domain, "MX", lifetime=5),
            key=lambda record: record.preference,
        )
    except Exception as e:
        logger.info("Registration mailbox MX lookup failed for %s: %s", email, e)
        raise HTTPException(
            status_code=400,
            detail="Enter a real email address that can receive mail.",
        )

    smtp_from = (
        os.getenv("SMTP_FROM_EMAIL")
        or os.getenv("SMTP_FROM")
        or os.getenv("SMTP_USERNAME")
        or f"verify@{socket.getfqdn() or 'localhost'}"
    )
    helo_host = os.getenv("SMTP_HELO_HOST") or socket.getfqdn() or "localhost"
    timeout = int(os.getenv("REGISTRATION_SMTP_MAILBOX_TIMEOUT_SECONDS", "8"))
    last_error = None

    for record in mx_records:
        host = str(record.exchange).rstrip(".")
        try:
            with smtplib.SMTP(host, 25, timeout=timeout) as server:
                server.ehlo(helo_host)
                server.mail(smtp_from)
                code, message = server.rcpt(email)
                if code in {250, 251}:
                    return
                if code in {550, 551, 553}:
                    logger.info("Registration mailbox rejected for %s by %s: %s %s", email, host, code, message)
                    raise HTTPException(
                        status_code=400,
                        detail="Email address could not be reached. Use a real inbox you can access.",
                    )
                last_error = f"{host}: {code} {message!r}"
        except HTTPException:
            raise
        except Exception as e:
            last_error = f"{host}: {e}"

    logger.warning("Registration mailbox check inconclusive for %s: %s", email, last_error)
    raise HTTPException(
        status_code=503,
        detail="Could not verify that email inbox right now. Please try again later.",
    )

def _validate_username(username: str) -> str:
    normalized = (username or "").strip()
    if not _USERNAME_PATTERN.match(normalized):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-50 characters and can only use letters, numbers, dots, underscores, or hyphens.",
        )
    return normalized

def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if not any(c.isupper() for c in password) or not any(c.isdigit() or not c.isalpha() for c in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter and one number or special character")

def _send_otp_email(to_email: str, otp: str, *, subject: str, body_intro: str, log_label: str) -> bool:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_FROM") or smtp_user

    if not smtp_host or not smtp_from:
        logger.warning("%s OTP email not sent for %s because SMTP is not configured", log_label, to_email)
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = smtp_from
    message["To"] = to_email
    message.set_content(
        f"{body_intro} {otp}.\n\n"
        "It expires in 10 minutes. If you did not request this, ignore this email."
    )

    with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
        if os.getenv("SMTP_USE_TLS", "true").lower() not in ("0", "false", "no"):
            server.starttls()
        if smtp_user and smtp_password:
            server.login(smtp_user, smtp_password)
        server.send_message(message)
    return True

def _send_password_reset_email(to_email: str, otp: str) -> bool:
    return _send_otp_email(
        to_email,
        otp,
        subject="Your Cerbyl password reset OTP",
        body_intro="Your Cerbyl password reset OTP is",
        log_label="Password reset",
    )

def _send_registration_email(to_email: str, otp: str) -> bool:
    return _send_otp_email(
        to_email,
        otp,
        subject="Verify your Cerbyl email",
        body_intro="Your Cerbyl account verification OTP is",
        log_label="Registration verification",
    )

def _send_account_deletion_email(to_email: str, otp: str) -> bool:
    return _send_otp_email(
        to_email,
        otp,
        subject="Confirm your Cerbyl account deletion",
        body_intro="Your Cerbyl account deletion OTP is",
        log_label="Account deletion",
    )

def _password_reset_response(email_sent: bool) -> dict:
    response = {"message": "If an account exists for that email, an OTP has been sent."}
    if _is_production():
        return response
    response["email_sent"] = email_sent
    if not email_sent:
        response["message"] = "OTP generated. Configure SMTP_HOST and SMTP_FROM_EMAIL to send real email."
    return response

def _otp_response(email_sent: bool, message: str) -> dict:
    response = {"message": message, "email_sent": email_sent}
    if not email_sent and not _is_production():
        response["message"] = "OTP generated. Configure SMTP_HOST and SMTP_FROM_EMAIL to send real email."
    return response

def _send_registration_otp_or_raise(email: str, otp: str) -> bool:
    try:
        email_sent = _send_registration_email(email, otp)
    except smtplib.SMTPRecipientsRefused as e:
        logger.info("Registration OTP recipient refused for %s: %s", email, e)
        raise HTTPException(
            status_code=400,
            detail="Email address could not be reached. Use a real inbox you can access.",
        )
    except smtplib.SMTPResponseException as e:
        logger.warning("Registration OTP SMTP response for %s: %s %s", email, e.smtp_code, e.smtp_error)
        if e.smtp_code in {550, 551, 553, 554}:
            raise HTTPException(
                status_code=400,
                detail="Email address could not be reached. Use a real inbox you can access.",
            )
        email_sent = False
    except Exception as e:
        logger.error("Failed to send registration OTP to %s: %s", email, e)
        email_sent = False

    if not email_sent and _is_production():
        raise HTTPException(
            status_code=503,
            detail="Could not send verification email right now. Please try again later.",
        )
    return email_sent

def _quote_identifier(name: str) -> str:
    return f'"{name.replace(chr(34), chr(34) + chr(34))}"'

def _is_text_column_type(column_type) -> bool:
    type_name = column_type.__class__.__name__.lower()
    return any(token in type_name for token in ("char", "string", "text"))

def _delete_user_graph(db: Session, user: models.User) -> dict:
    user_id = user.id
    inspector = inspect(db.bind)
    tables = inspector.get_table_names()
    primary_keys = {}
    column_info = {}
    for table in tables:
        pk_columns = inspector.get_pk_constraint(table).get("constrained_columns") or []
        if len(pk_columns) == 1:
            primary_keys[table] = pk_columns[0]
        column_info[table] = {column["name"]: column for column in inspector.get_columns(table)}

    foreign_keys = []
    child_edges = defaultdict(set)
    for table in tables:
        for fk in inspector.get_foreign_keys(table):
            referred_table = fk.get("referred_table")
            constrained = fk.get("constrained_columns") or []
            referred = fk.get("referred_columns") or []
            if (
                referred_table
                and len(constrained) == 1
                and len(referred) == 1
                and table in primary_keys
                and referred_table in primary_keys
                and referred[0] == primary_keys[referred_table]
            ):
                foreign_keys.append({
                    "child_table": table,
                    "child_column": constrained[0],
                    "parent_table": referred_table,
                })
                child_edges[referred_table].add(table)

    selected_ids = defaultdict(set)
    selected_ids["users"].add(user_id)

    user_identifier_values = [str(user.id), user.username or "", user.email or ""]
    for table in tables:
        if table == "users" or table not in primary_keys or "user_id" not in column_info.get(table, {}):
            continue
        user_id_column = column_info[table]["user_id"]
        values = user_identifier_values if _is_text_column_type(user_id_column.get("type")) else [user.id]
        query = text(
            f"SELECT {_quote_identifier(primary_keys[table])} FROM {_quote_identifier(table)} "
            f"WHERE {_quote_identifier('user_id')} IN :values"
        ).bindparams(bindparam("values", expanding=True))
        try:
            rows = db.execute(query, {"values": values}).fetchall()
            selected_ids[table].update(row[0] for row in rows if row[0] is not None)
        except Exception as e:
            logger.warning("Skipping direct account cleanup seed for %s.user_id: %s", table, e)

    changed = True
    while changed:
        changed = False
        for fk in foreign_keys:
            parent_values = selected_ids.get(fk["parent_table"])
            if not parent_values:
                continue
            child_table = fk["child_table"]
            child_pk = primary_keys[child_table]
            query = text(
                f"SELECT {_quote_identifier(child_pk)} FROM {_quote_identifier(child_table)} "
                f"WHERE {_quote_identifier(fk['child_column'])} IN :values"
            ).bindparams(bindparam("values", expanding=True))
            rows = db.execute(query, {"values": list(parent_values)}).fetchall()
            before = len(selected_ids[child_table])
            selected_ids[child_table].update(row[0] for row in rows if row[0] is not None)
            if len(selected_ids[child_table]) > before:
                changed = True

    depths = {"users": 0}

    def assign_delete_depth(parent_table: str, depth: int, path: set) -> None:
        for child_table in child_edges.get(parent_table, set()):
            if child_table in path:
                logger.warning(
                    "Skipping cyclic account cleanup edge %s -> %s",
                    parent_table,
                    child_table,
                )
                continue
            child_depth = depth + 1
            if child_depth > depths.get(child_table, -1):
                depths[child_table] = child_depth
                assign_delete_depth(child_table, child_depth, path | {child_table})

    assign_delete_depth("users", 0, {"users"})

    deleted_counts = {}
    for table in sorted(selected_ids.keys(), key=lambda table: depths.get(table, 0), reverse=True):
        ids = selected_ids[table]
        if not ids:
            continue
        pk = primary_keys.get(table)
        if not pk:
            continue
        delete_stmt = text(
            f"DELETE FROM {_quote_identifier(table)} WHERE {_quote_identifier(pk)} IN :values"
        ).bindparams(bindparam("values", expanding=True))
        result = db.execute(delete_stmt, {"values": list(ids)})
        deleted_counts[table] = result.rowcount

    return deleted_counts

def _normalize_billing_cycle(raw: Optional[str]) -> str:
    candidate = (raw or "monthly").strip().lower()
    return candidate if candidate in _VALID_BILLING_CYCLES else "monthly"

def _normalize_subscription_status(raw: Optional[str]) -> str:
    candidate = (raw or "active").strip().lower()
    return candidate if candidate in _VALID_SUBSCRIPTION_STATUSES else "active"

def _is_admin_email(email: Optional[str]) -> bool:
    admin_emails = {
        item.strip().lower()
        for item in os.getenv("ADMIN_EMAILS", "").split(",")
        if item.strip()
    }
    return bool(email and email.strip().lower() in admin_emails)

def _seconds_until_iso(reset_at: Optional[str]) -> Optional[int]:
    if not reset_at:
        return None
    try:
        target = datetime.fromisoformat(str(reset_at).replace("Z", "+00:00"))
        if target.tzinfo is None:
            target = target.replace(tzinfo=timezone.utc)
        return max(0, int((target.astimezone(timezone.utc) - datetime.now(timezone.utc)).total_seconds()))
    except Exception:
        return None


def _oldest_usage_refresh_at(db: Session, user_pk: int, days: int) -> Optional[str]:
    try:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        row = db.execute(
            text(
                """
                SELECT timestamp
                FROM user_activity_log
                WHERE user_id = :uid AND timestamp >= :since
                {billable_filter}
                ORDER BY timestamp ASC
                LIMIT 1
                """
                .format(billable_filter=BILLABLE_AI_USAGE_WHERE)
            ),
            {"uid": user_pk, "since": since},
        ).mappings().first()
        timestamp = (row or {}).get("timestamp")
        if not timestamp:
            return None
        if isinstance(timestamp, str):
            ts = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        else:
            ts = timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (ts.astimezone(timezone.utc) + timedelta(days=days)).isoformat()
    except Exception:
        return None


def _subscription_usage_snapshot(db: Session, user_pk: int, days: int = 30, included_tokens: int = 0) -> dict:
    snapshot = {
        "window_days": days,
        "total_tokens": 0,
        "ai_requests": 0,
        "top_tools": [],
        "reset_at": None,
        "reset_after_seconds": None,
        "reset_after_hours": None,
    }
    try:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        totals = db.execute(
            text(
                """
                SELECT
                    COALESCE(SUM(tokens_used), 0) AS total_tokens,
                    COALESCE(SUM(CASE WHEN tokens_used > 0 THEN 1 ELSE 0 END), 0) AS ai_requests
                FROM user_activity_log
                WHERE user_id = :uid AND timestamp >= :since
                {billable_filter}
                """
                .format(billable_filter=BILLABLE_AI_USAGE_WHERE)
            ),
            {"uid": user_pk, "since": since},
        ).mappings().first()
        if totals:
            snapshot["total_tokens"] = int(totals.get("total_tokens") or 0)
            snapshot["ai_requests"] = int(totals.get("ai_requests") or 0)

        top_rows = db.execute(
            text(
                """
                SELECT
                    tool_name,
                    COUNT(*) AS usage_count,
                    COALESCE(SUM(tokens_used), 0) AS tokens_used
                FROM user_activity_log
                WHERE user_id = :uid AND timestamp >= :since
                {billable_filter}
                GROUP BY tool_name
                ORDER BY tokens_used DESC, usage_count DESC
                LIMIT 6
                """
                .format(billable_filter=BILLABLE_AI_USAGE_WHERE)
            ),
            {"uid": user_pk, "since": since},
        ).mappings().all()
        snapshot["top_tools"] = [
            {
                "tool_name": row.get("tool_name") or "unknown",
                "usage_count": int(row.get("usage_count") or 0),
                "tokens_used": int(row.get("tokens_used") or 0),
            }
            for row in top_rows
        ]

        if included_tokens > 0:
            reset_at = get_user_token_reset_at(db, user_pk, included_tokens, days)
            if not reset_at:
                reset_at = _oldest_usage_refresh_at(db, user_pk, days)
            reset_after_seconds = _seconds_until_iso(reset_at)
            snapshot["reset_at"] = reset_at
            snapshot["reset_after_seconds"] = reset_after_seconds
            snapshot["reset_after_hours"] = (
                round(reset_after_seconds / 3600, 1)
                if reset_after_seconds is not None
                else None
            )
    except Exception:
        pass
    return snapshot

@router.get("/get_daily_goal_progress")
def get_daily_goal_progress(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        today = datetime.now(timezone.utc).date()

        questions_today = db.query(models.Activity).filter(
            models.Activity.user_id == user.id,
            func.date(models.Activity.timestamp) == today
        ).count()

        daily_goal = 20

        activities = db.query(func.date(models.Activity.timestamp)).filter(
            models.Activity.user_id == user.id
        ).distinct().order_by(func.date(models.Activity.timestamp).desc()).all()

        streak = 0
        if activities:
            check_date = datetime.now(timezone.utc).date()
            for activity_date in [a[0] for a in activities]:
                if activity_date == check_date or activity_date == check_date - timedelta(days=1):
                    streak += 1
                    check_date = activity_date - timedelta(days=1)
                else:
                    break

        return {
            "questions_today": questions_today,
            "daily_goal": daily_goal,
            "percentage": min(int((questions_today / daily_goal) * 100), 100),
            "streak": streak
        }
    except Exception as e:
        logger.error(f"Error getting daily goal: {str(e)}")
        return {"questions_today": 0, "daily_goal": 20, "percentage": 0, "streak": 0}

@router.post("/register")
async def register(request: Request, payload: RegisterPayload, db: Session = Depends(get_db)):
    _check_auth_rate_limit(request, max_attempts=3, window_seconds=300)
    logger.info(f"Starting email verification for user registration: {payload.username}")

    _validate_password(payload.password)
    username = _validate_username(payload.username)
    email = _validate_deliverable_email(payload.email)
    _validate_mailbox_if_enabled(email)

    if get_user_by_username(db, username):
        raise HTTPException(status_code=400, detail="Username already registered")

    if get_user_by_email(db, email):
        raise HTTPException(status_code=400, detail="Email already registered")

    otp = f"{secrets.randbelow(1000000):06d}"
    registration_data = {
        "first_name": payload.first_name,
        "last_name": payload.last_name,
        "email": email,
        "username": username,
        "hashed_password": get_password_hash(payload.password),
        "age": payload.age,
        "field_of_study": payload.field_of_study,
        "learning_style": payload.learning_style,
        "school_university": payload.school_university,
    }

    db.query(models.RegistrationOTP).filter(
        models.RegistrationOTP.email == email,
        models.RegistrationOTP.consumed == False,
    ).update({"consumed": True})
    db.query(models.RegistrationOTP).filter(
        models.RegistrationOTP.username == username,
        models.RegistrationOTP.consumed == False,
    ).update({"consumed": True})
    db.add(models.RegistrationOTP(
        email=email,
        username=username,
        otp_hash=get_password_hash(otp),
        registration_data=json.dumps(registration_data),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    ))
    db.commit()

    pending = db.query(models.RegistrationOTP).filter(
        models.RegistrationOTP.email == email,
        models.RegistrationOTP.username == username,
        models.RegistrationOTP.consumed == False,
    ).order_by(models.RegistrationOTP.created_at.desc()).first()
    try:
        email_sent = _send_registration_otp_or_raise(email, otp)
    except HTTPException as e:
        if pending and e.status_code == 400:
            pending.consumed = True
            db.commit()
        raise

    response = _otp_response(
        email_sent=email_sent,
        message="Verification OTP sent. Enter it to finish creating your account.",
    )
    response["verification_required"] = True
    if not email_sent and not _is_production():
        response["dev_otp"] = otp
    return response

@router.post("/register/resend")
async def resend_registration_otp(request: Request, payload: RegisterResendPayload, db: Session = Depends(get_db)):
    _check_auth_rate_limit(request, max_attempts=3, window_seconds=300)
    email = _validate_deliverable_email(payload.email)

    pending = db.query(models.RegistrationOTP).filter(
        models.RegistrationOTP.email == email,
        models.RegistrationOTP.consumed == False,
    ).order_by(models.RegistrationOTP.created_at.desc()).first()

    now = datetime.now(timezone.utc)
    if not pending:
        raise HTTPException(
            status_code=400,
            detail="No pending verification found. Edit your registration details and create the account again.",
        )

    if pending.attempts >= 5:
        pending.consumed = True
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Too many incorrect verification attempts. Edit your registration details and create the account again.",
        )

    try:
        registration_data = json.loads(pending.registration_data)
    except Exception:
        pending.consumed = True
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Registration session expired. Edit your registration details and try again.",
        )

    username = _validate_username(registration_data.get("username"))
    if get_user_by_username(db, username):
        pending.consumed = True
        db.commit()
        raise HTTPException(status_code=400, detail="Username already registered")

    if get_user_by_email(db, email):
        pending.consumed = True
        db.commit()
        raise HTTPException(status_code=400, detail="Email already registered")

    otp = f"{secrets.randbelow(1000000):06d}"
    pending.otp_hash = get_password_hash(otp)
    pending.attempts = 0
    pending.expires_at = now + timedelta(minutes=10)
    pending.created_at = now
    db.commit()

    try:
        email_sent = _send_registration_otp_or_raise(email, otp)
    except HTTPException as e:
        if e.status_code == 400:
            pending.consumed = True
            db.commit()
        raise

    response = _otp_response(
        email_sent=email_sent,
        message="New verification OTP sent. Use the latest code to finish creating your account.",
    )
    if not email_sent and not _is_production():
        response["dev_otp"] = otp
    return response

@router.post("/register/verify")
async def verify_registration(request: Request, payload: RegisterVerifyPayload, db: Session = Depends(get_db)):
    _check_auth_rate_limit(request, max_attempts=5, window_seconds=300)
    email = _normalize_email(payload.email)
    otp = (payload.otp or "").strip()
    if not re.fullmatch(r"\d{6}", otp):
        raise HTTPException(status_code=400, detail="Enter the 6-digit OTP.")

    pending = db.query(models.RegistrationOTP).filter(
        models.RegistrationOTP.email == email,
        models.RegistrationOTP.consumed == False,
    ).order_by(models.RegistrationOTP.created_at.desc()).first()

    now = datetime.now(timezone.utc)
    expires_at = pending.expires_at if pending else None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if (
        not pending
        or expires_at < now
        or pending.attempts >= 5
        or not verify_password(otp, pending.otp_hash)
    ):
        if pending:
            pending.attempts = (pending.attempts or 0) + 1
            db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    try:
        registration_data = json.loads(pending.registration_data)
    except Exception:
        pending.consumed = True
        db.commit()
        raise HTTPException(status_code=400, detail="Registration session expired. Please try again.")

    username = _validate_username(registration_data.get("username"))
    email = _normalize_email(registration_data.get("email"))

    if get_user_by_username(db, username):
        raise HTTPException(status_code=400, detail="Username already registered")

    if get_user_by_email(db, email):
        raise HTTPException(status_code=400, detail="Email already registered")

    max_retries = 2
    for attempt in range(max_retries):
        try:
            db_user = models.User(
                first_name=registration_data.get("first_name"),
                last_name=registration_data.get("last_name"),
                email=email,
                username=username,
                hashed_password=registration_data.get("hashed_password"),
                age=registration_data.get("age"),
                field_of_study=registration_data.get("field_of_study"),
                learning_style=registration_data.get("learning_style"),
                school_university=registration_data.get("school_university"),
                google_user=False,
            )
            db.add(db_user)
            db.commit()
            db.refresh(db_user)

            user_stats = models.UserStats(user_id=db_user.id)
            db.add(user_stats)
            db.add(models.ComprehensiveUserProfile(user_id=db_user.id))
            pending.consumed = True
            db.commit()

            logger.info(f"User {username} registered successfully")
            return {"message": "User registered successfully"}

        except Exception as e:
            db.rollback()
            error_msg = str(e).lower()

            if "duplicate key" in error_msg and "pkey" in error_msg and attempt < max_retries - 1:
                logger.warning(f"Sequence error detected, fixing... (attempt {attempt + 1})")

                try:
                    max_id_query = text("SELECT COALESCE(MAX(id), 0) FROM users")
                    max_id = db.execute(max_id_query).scalar()

                    fix_query = text("SELECT setval('users_id_seq', :next_id)")
                    db.execute(fix_query, {"next_id": max_id + 1})
                    db.commit()

                    logger.info(f"Sequence fixed to {max_id + 1}, retrying registration...")
                    continue

                except Exception as fix_error:
                    logger.error(f"Failed to fix sequence: {str(fix_error)}")

            logger.error(f"Registration failed: {str(e)}")
            raise HTTPException(status_code=500, detail="Registration failed. Please try again.")

    raise HTTPException(status_code=500, detail="Registration failed after retries")

@router.post("/token", response_model=Token)
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    _check_auth_rate_limit(request)
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    _record_login_and_welcome_notification(db, user)
    db.commit()

    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/token_form")
async def login_form(request: Request, username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    _check_auth_rate_limit(request)
    user = authenticate_user(db, username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    _record_login_and_welcome_notification(db, user)
    db.commit()

    access_token = create_access_token(data={"sub": user.username, "user_id": user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/password-reset/request")
async def request_password_reset(
    request: Request,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
):
    _check_auth_rate_limit(request, max_attempts=3, window_seconds=300)
    email = _normalize_email(payload.email)
    user = get_user_by_email(db, email)

    if not user:
        return _password_reset_response(email_sent=True)

    otp = f"{secrets.randbelow(1000000):06d}"
    reset_otp = models.PasswordResetOTP(
        user_id=user.id,
        email=email,
        otp_hash=get_password_hash(otp),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )

    db.query(models.PasswordResetOTP).filter(
        models.PasswordResetOTP.user_id == user.id,
        models.PasswordResetOTP.consumed == False,
    ).update({"consumed": True})
    db.add(reset_otp)
    db.commit()

    try:
        email_sent = _send_password_reset_email(email, otp)
    except Exception as e:
        logger.error("Failed to send password reset OTP to %s: %s", email, e)
        email_sent = False

    response = _password_reset_response(email_sent=email_sent)
    if not email_sent and not _is_production():
        response["dev_otp"] = otp
    return response

@router.post("/password-reset/confirm")
async def confirm_password_reset(
    request: Request,
    payload: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    _check_auth_rate_limit(request, max_attempts=5, window_seconds=300)
    email = _normalize_email(payload.email)
    otp = (payload.otp or "").strip()
    if not re.fullmatch(r"\d{6}", otp):
        raise HTTPException(status_code=400, detail="Enter the 6-digit OTP.")
    _validate_password(payload.new_password)

    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    reset_otp = db.query(models.PasswordResetOTP).filter(
        models.PasswordResetOTP.user_id == user.id,
        models.PasswordResetOTP.email == email,
        models.PasswordResetOTP.consumed == False,
    ).order_by(models.PasswordResetOTP.created_at.desc()).first()

    now = datetime.now(timezone.utc)
    expires_at = reset_otp.expires_at if reset_otp else None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if (
        not reset_otp
        or expires_at < now
        or reset_otp.attempts >= 5
        or not verify_password(otp, reset_otp.otp_hash)
    ):
        if reset_otp:
            reset_otp.attempts = (reset_otp.attempts or 0) + 1
            db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    user.hashed_password = get_password_hash(payload.new_password)
    user.google_user = False if user.google_user is None else user.google_user
    reset_otp.consumed = True
    db.commit()

    return {"message": "Password updated successfully. You can sign in with your new password."}

@router.post("/account/delete/request")
async def request_account_deletion(
    request: Request,
    payload: AccountDeletionRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_auth_rate_limit(request, max_attempts=3, window_seconds=300)
    if not getattr(current_user, "google_user", False) and not verify_password(payload.password or "", current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password.")

    otp = f"{secrets.randbelow(1000000):06d}"
    email = _normalize_email(current_user.email)
    db.query(models.AccountDeletionOTP).filter(
        models.AccountDeletionOTP.user_id == current_user.id,
        models.AccountDeletionOTP.consumed == False,
    ).update({"consumed": True})
    db.add(models.AccountDeletionOTP(
        user_id=current_user.id,
        email=email,
        otp_hash=get_password_hash(otp),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    ))
    db.commit()

    try:
        email_sent = _send_account_deletion_email(email, otp)
    except Exception as e:
        logger.error("Failed to send account deletion OTP to %s: %s", email, e)
        email_sent = False

    response = _otp_response(
        email_sent=email_sent,
        message="Account deletion OTP sent to your email.",
    )
    if not email_sent and not _is_production():
        response["dev_otp"] = otp
    return response

@router.post("/account/delete/confirm")
async def confirm_account_deletion(
    request: Request,
    payload: AccountDeletionConfirm,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_auth_rate_limit(request, max_attempts=5, window_seconds=300)
    otp = (payload.otp or "").strip()
    if not re.fullmatch(r"\d{6}", otp):
        raise HTTPException(status_code=400, detail="Enter the 6-digit OTP.")

    deletion_otp = db.query(models.AccountDeletionOTP).filter(
        models.AccountDeletionOTP.user_id == current_user.id,
        models.AccountDeletionOTP.consumed == False,
    ).order_by(models.AccountDeletionOTP.created_at.desc()).first()

    now = datetime.now(timezone.utc)
    expires_at = deletion_otp.expires_at if deletion_otp else None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if (
        not deletion_otp
        or expires_at < now
        or deletion_otp.attempts >= 5
        or not verify_password(otp, deletion_otp.otp_hash)
    ):
        if deletion_otp:
            deletion_otp.attempts = (deletion_otp.attempts or 0) + 1
            db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    account_email = current_user.email
    account_id = current_user.id
    try:
        deleted_counts = _delete_user_graph(db, current_user)
        db.commit()
        logger.info("Deleted account %s (%s) with related rows: %s", account_email, account_id, deleted_counts)
        return {"message": "Account deleted successfully."}
    except Exception as e:
        logger.error("Failed to delete account %s (%s): %s", account_email, account_id, e, exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete account. Please try again.")

@router.post("/google-auth")
async def google_auth(request: Request, auth_data: GoogleAuth, db: Session = Depends(get_db)):
    _check_auth_rate_limit(request)
    import secrets as _secrets
    try:
        user_info = verify_google_token(auth_data.token)

        aud = user_info.get("aud")
        allowed_google_audiences = GOOGLE_CLIENT_IDS or ([GOOGLE_CLIENT_ID] if GOOGLE_CLIENT_ID else [])
        if allowed_google_audiences and aud not in allowed_google_audiences:
            raise HTTPException(status_code=400, detail="Token audience mismatch")

        email = user_info.get('email')
        if not email:
            raise HTTPException(status_code=400, detail="Email not found")

        user = get_user_by_email(db, email)

        if not user:
            user = models.User(
                first_name=user_info.get('given_name', ''),
                last_name=user_info.get('family_name', ''),
                email=email,
                username=email,
                hashed_password=get_password_hash(_secrets.token_hex(32)),
                picture_url=user_info.get('picture', ''),
                google_user=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            user_stats = models.UserStats(user_id=user.id)
            db.add(user_stats)
            db.commit()
        else:
            _sync_google_profile_fields(
                user,
                first_name=user_info.get('given_name', ''),
                last_name=user_info.get('family_name', ''),
                picture_url=user_info.get('picture', ''),
            )
            _record_login_and_welcome_notification(db, user)
            db.commit()

        access_token = create_access_token(data={"sub": user.username})

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_info": {
                "email": email,
                "given_name": user_info.get('given_name'),
                "family_name": user_info.get('family_name'),
                "picture": user_info.get('picture'),
                "google_user": True
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google auth error: {str(e)}")
        raise HTTPException(status_code=500, detail="Authentication failed. Please try again.")

@router.post("/firebase-auth")
async def firebase_authentication(request: Request, db: Session = Depends(get_db)):
    _check_auth_rate_limit(request)
    import secrets as _secrets
    from database import DATABASE_URL as db_url
    max_retries = 2
    for attempt in range(max_retries):
        try:
            data = await request.json()
            id_token = data.get('idToken')
            email = data.get('email')
            display_name = data.get('displayName')
            photo_url = data.get('photoURL')
            uid = data.get('uid')

            if not id_token or not email:
                raise HTTPException(status_code=400, detail="Missing required fields")

            try:
                import firebase_admin
                from firebase_admin import auth as firebase_auth, credentials as firebase_creds
                if not firebase_admin._apps:
                    firebase_project_id = os.getenv("FIREBASE_PROJECT_ID")
                    if not firebase_project_id:
                        raise RuntimeError("FIREBASE_PROJECT_ID env var not set")
                    cred = firebase_creds.ApplicationDefault()
                    firebase_admin.initialize_app(cred, {"projectId": firebase_project_id})
                decoded = firebase_auth.verify_id_token(id_token)
                token_email = _normalize_email(decoded.get("email") or "")
                if not token_email or token_email != _normalize_email(email):
                    raise HTTPException(status_code=400, detail="Token email mismatch")
                if decoded.get("email_verified") is not True:
                    raise HTTPException(status_code=401, detail="Firebase email is not verified")
                email = token_email
                uid = decoded.get("uid")
                display_name = decoded.get("name") or ""
                photo_url = decoded.get("picture") or None
            except ImportError:
                logger.error("firebase-admin SDK is required for Firebase authentication")
                raise HTTPException(status_code=503, detail="Firebase authentication is not configured")
            except firebase_admin.auth.InvalidIdTokenError:
                raise HTTPException(status_code=401, detail="Invalid Firebase token")
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Firebase token verification error: {e}")
                raise HTTPException(status_code=401, detail="Firebase token verification failed")

            user = get_user_by_email(db, email)
            is_new_user = False

            if not user:
                is_new_user = True
                names = display_name.split(' ') if display_name else ['', '']
                first_name = names[0] if len(names) > 0 else ''
                last_name = ' '.join(names[1:]) if len(names) > 1 else ''

                user = models.User(
                    first_name=first_name,
                    last_name=last_name,
                    email=email,
                    username=email,
                    hashed_password=get_password_hash(_secrets.token_hex(32)),
                    picture_url=photo_url,
                    google_user=True
                )
                db.add(user)
                db.commit()
                db.refresh(user)

                user_stats = models.UserStats(user_id=user.id)
                db.add(user_stats)

                gamif_stats = models.UserGamificationStats(
                    user_id=user.id,
                    week_start_date=datetime.now(timezone.utc)
                )
                db.add(gamif_stats)
                db.add(models.ComprehensiveUserProfile(user_id=user.id))

                db.commit()
                logger.info(f"New user created via Firebase: {email}")
            else:
                profile = db.query(models.ComprehensiveUserProfile).filter(
                    models.ComprehensiveUserProfile.user_id == user.id
                ).first()
                if not profile:
                    profile = models.ComprehensiveUserProfile(user_id=user.id)
                    db.add(profile)
                names = display_name.split(' ') if display_name else []
                _sync_google_profile_fields(
                    user,
                    first_name=names[0] if len(names) > 0 else None,
                    last_name=' '.join(names[1:]) if len(names) > 1 else None,
                    picture_url=photo_url,
                )
                _record_login_and_welcome_notification(db, user)
                db.commit()

            access_token = create_access_token(
                data={"sub": user.username, "user_id": user.id}
            )

            return {
                "access_token": access_token,
                "token_type": "bearer",
                "is_new_user": is_new_user,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "picture_url": user.picture_url,
                    "google_user": True,
                }
            }

        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            error_msg = str(e).lower()

            if "duplicate key" in error_msg and "pkey" in error_msg and attempt < max_retries - 1:
                logger.warning(f"Sequence error on Firebase auth, fixing... (attempt {attempt + 1})")
                try:
                    if db_url and "postgres" in db_url:
                        max_id_query = text("SELECT COALESCE(MAX(id), 0) FROM users")
                        max_id = db.execute(max_id_query).scalar()
                        fix_query = text("SELECT setval('users_id_seq', :next_id)")
                        db.execute(fix_query, {"next_id": max_id + 1})
                        db.commit()
                        logger.info("Sequence fixed, retrying...")
                        continue
                except Exception as fix_error:
                    logger.error(f"Failed to fix sequence: {str(fix_error)}")

            logger.error(f"Firebase auth error: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail="Authentication failed. Please try again.")

    raise HTTPException(status_code=500, detail="Authentication failed after retries")

@router.get("/me")
async def get_current_user_info(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "email": current_user.email,
        "username": current_user.username,
        "age": current_user.age,
        "field_of_study": current_user.field_of_study,
        "learning_style": current_user.learning_style,
        "school_university": current_user.school_university,
        "picture_url": current_user.picture_url,
        "google_user": current_user.google_user
    }

@router.get("/check_profile_quiz")
async def check_profile_quiz(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        has_completed_quiz = (
            comprehensive_profile is not None and
            comprehensive_profile.primary_archetype is not None and
            comprehensive_profile.primary_archetype != ""
        )

        has_skipped_quiz = (
            comprehensive_profile is not None and
            comprehensive_profile.quiz_skipped == True
        )

        quiz_flow_completed = has_completed_quiz or has_skipped_quiz

        logger.info(f"check_profile_quiz for {user_id}: completed={has_completed_quiz}, skipped={has_skipped_quiz}, flow_completed={quiz_flow_completed}")

        return {
            "completed": quiz_flow_completed,
            "quiz_completed": has_completed_quiz,
            "quiz_skipped": has_skipped_quiz,
            "user_id": user_id
        }

    except Exception as e:
        logger.error(f"Error checking quiz: {str(e)}")
        return {"completed": False}

@router.get("/is_first_time_user")
async def is_first_time_user(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        now = datetime.now(timezone.utc)

        user_created = user.created_at
        if user_created.tzinfo is None:
            user_created = user_created.replace(tzinfo=timezone.utc)

        user_last_login = user.last_login
        if user_last_login and user_last_login.tzinfo is None:
            user_last_login = user_last_login.replace(tzinfo=timezone.utc)

        if user_last_login:
            time_between_creation_and_login = abs((user_last_login - user_created).total_seconds())
            is_first_login = time_between_creation_and_login < 120
        else:
            is_first_login = True

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        has_completed_quiz = (
            comprehensive_profile is not None and
            comprehensive_profile.primary_archetype is not None and
            comprehensive_profile.primary_archetype != ""
        )

        has_skipped_quiz = (
            comprehensive_profile is not None and
            comprehensive_profile.quiz_skipped == True
        )

        quiz_flow_done = has_completed_quiz or has_skipped_quiz

        is_first_time = is_first_login and not quiz_flow_done

        time_since_creation = now - user_created

        logger.info(f"is_first_time_user for {user_id}: is_first_time={is_first_time}, is_first_login={is_first_login}, quiz_completed={has_completed_quiz}, quiz_skipped={has_skipped_quiz}, account_age_minutes={time_since_creation.total_seconds() / 60:.2f}")

        return {
            "is_first_time": is_first_time,
            "is_first_login": is_first_login,
            "account_age_minutes": time_since_creation.total_seconds() / 60,
            "quiz_completed": has_completed_quiz,
            "quiz_skipped": has_skipped_quiz,
            "user_id": user_id
        }

    except Exception as e:
        logger.error(f"Error checking first-time user: {str(e)}")
        return {"is_first_time": False}

@router.post("/start_session")
def start_session(
    user_id: str = Form(...),
    session_type: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        session_id = f"{user.id}_{session_type}_{int(datetime.now(timezone.utc).timestamp())}"

        return {
            "status": "success",
            "session_id": session_id,
            "start_time": datetime.now(timezone.utc).isoformat() + 'Z',
            "message": f"Started {session_type} session"
        }

    except Exception as e:
        logger.error(f"Error starting session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start session")

@router.post("/end_session")
def end_session(
    user_id: str = Form(...),
    session_id: str = Form(...),
    time_spent_minutes: float = Form(...),
    session_type: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        today = datetime.now(timezone.utc).date()
        daily_metric = db.query(models.DailyLearningMetrics).filter(
            and_(
                models.DailyLearningMetrics.user_id == user.id,
                models.DailyLearningMetrics.date == today
            )
        ).first()

        if not daily_metric:
            daily_metric = models.DailyLearningMetrics(
                user_id=user.id,
                date=today,
                sessions_completed=1,
                time_spent_minutes=time_spent_minutes,
                questions_answered=0,
                correct_answers=0,
                topics_studied="[]"
            )
            db.add(daily_metric)
        else:
            daily_metric.time_spent_minutes += time_spent_minutes
            daily_metric.sessions_completed = (daily_metric.sessions_completed or 0) + 1

        user_stats = db.query(models.UserStats).filter(
            models.UserStats.user_id == user.id
        ).first()

        if not user_stats:
            user_stats = models.UserStats(user_id=user.id)
            db.add(user_stats)

        user_stats.total_hours += (time_spent_minutes / 60)
        user_stats.last_activity = datetime.now(timezone.utc)

        db.commit()

        logger.info(f"Session ended: user={user.email}, sessions_today={daily_metric.sessions_completed}, time={daily_metric.time_spent_minutes}")

        return {
            "status": "success",
            "message": f"Ended {session_type} session",
            "time_recorded": time_spent_minutes,
            "total_time_today": daily_metric.time_spent_minutes,
            "sessions_today": daily_metric.sessions_completed
        }

    except Exception as e:
        logger.error(f"Error ending session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to end session")

@router.post("/save_archetype_profile")
async def save_archetype_profile(
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    try:
        user_id = payload.get("user_id")
        primary_archetype = payload.get("primary_archetype")
        secondary_archetype = payload.get("secondary_archetype")
        archetype_scores = payload.get("archetype_scores", {})
        archetype_description = payload.get("archetype_description", "")
        quiz_responses = payload.get("quiz_responses", {})

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        if not comprehensive_profile:
            comprehensive_profile = models.ComprehensiveUserProfile(
                user_id=user.id,
                primary_archetype=primary_archetype,
                secondary_archetype=secondary_archetype,
                archetype_scores=json.dumps(archetype_scores),
                archetype_description=archetype_description,
                quiz_responses=json.dumps(quiz_responses)
            )
            db.add(comprehensive_profile)
        else:
            comprehensive_profile.primary_archetype = primary_archetype
            comprehensive_profile.secondary_archetype = secondary_archetype
            comprehensive_profile.archetype_scores = json.dumps(archetype_scores)
            comprehensive_profile.archetype_description = archetype_description
            comprehensive_profile.quiz_responses = json.dumps(quiz_responses)

        db.commit()
        db.refresh(comprehensive_profile)

        return {
            "status": "success",
            "message": "Archetype profile saved successfully",
            "primary_archetype": primary_archetype,
            "secondary_archetype": secondary_archetype
        }

    except Exception as e:
        logger.error(f"Error saving archetype: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to save profile. Please try again.")

@router.get("/get_comprehensive_profile")
async def get_comprehensive_profile(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        result = {
            "username": user.username or "",
            "firstName": user.first_name or "",
            "lastName": user.last_name or "",
            "email": user.email or "",
            "googleUser": bool(user.google_user),
            "fieldOfStudy": user.field_of_study or "",
            "brainwaveGoal": "",
            "preferredSubjects": [],
            "difficultyLevel": "intermediate",
            "learningPace": "moderate",
            "primaryArchetype": "",
            "secondaryArchetype": "",
            "archetypeDescription": "",
            "subscriptionTier": DEFAULT_PLAN_ID,
            "billingCycle": "monthly",
            "subscriptionStatus": "active",
            "subscriptionStartedAt": None,
            "quizCompleted": False,
            "quizSkipped": False,
        }

        if comprehensive_profile:
            show_insights_value = comprehensive_profile.show_study_insights
            notifications_value = comprehensive_profile.notifications_enabled
            logger.info(f"Loading profile - show_study_insights from DB: {show_insights_value} (type: {type(show_insights_value)})")

            result.update({
                "difficultyLevel": comprehensive_profile.difficulty_level or "intermediate",
                "learningPace": comprehensive_profile.learning_pace or "moderate",
                "brainwaveGoal": comprehensive_profile.brainwave_goal or "",
                "primaryArchetype": comprehensive_profile.primary_archetype or "",
                "secondaryArchetype": comprehensive_profile.secondary_archetype or "",
                "archetypeDescription": comprehensive_profile.archetype_description or "",
                "showStudyInsights": show_insights_value if show_insights_value is not None else True,
                "notificationsEnabled": notifications_value if notifications_value is not None else True,
                "subscriptionTier": normalize_plan_id(comprehensive_profile.subscription_tier),
                "billingCycle": _normalize_billing_cycle(comprehensive_profile.billing_cycle),
                "subscriptionStatus": _normalize_subscription_status(comprehensive_profile.subscription_status),
                "subscriptionStartedAt": (
                    comprehensive_profile.subscription_started_at.isoformat()
                    if comprehensive_profile.subscription_started_at else None
                ),
                "quizCompleted": bool(comprehensive_profile.quiz_completed),
                "quizSkipped": bool(comprehensive_profile.quiz_skipped),
            })

            try:
                if comprehensive_profile.preferred_subjects:
                    result["preferredSubjects"] = json.loads(comprehensive_profile.preferred_subjects)
            except Exception:
                result["preferredSubjects"] = []
        else:
            result["showStudyInsights"] = True
            result["notificationsEnabled"] = True

        return result

    except Exception as e:
        logger.error(f"Error getting profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load profile. Please try again.")

@router.get("/subscription/overview")
async def get_subscription_overview(
    response: Response,
    user_id: str = Query(...),
    include_usage: bool = Query(True),
    db: Session = Depends(get_db),
):
    try:
        response.headers["Cache-Control"] = "no-store, max-age=0"
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        plan_id = normalize_plan_id(comprehensive_profile.subscription_tier if comprehensive_profile else None)
        billing_cycle = _normalize_billing_cycle(comprehensive_profile.billing_cycle if comprehensive_profile else None)
        subscription_status = _normalize_subscription_status(
            comprehensive_profile.subscription_status if comprehensive_profile else None
        )
        started_at = comprehensive_profile.subscription_started_at if comprehensive_profile else None

        current_plan = get_plan(plan_id)
        included_tokens = int(current_plan.get("included_tokens_monthly") or 0)
        usage = _subscription_usage_snapshot(db, user.id, days=30, included_tokens=included_tokens) if include_usage else {
            "window_days": 30,
            "total_tokens": 0,
            "ai_requests": 0,
            "top_tools": [],
            "reset_at": None,
            "reset_after_seconds": None,
            "reset_after_hours": None,
        }
        monthly_price = float(current_plan.get("monthly_price_usd") or 0.0)
        current_usage_cost = estimate_usage_cost_usd(plan_id, usage.get("total_tokens") or 0)
        usage_margin = round(monthly_price - current_usage_cost, 2)
        usage_margin_pct = round((usage_margin / monthly_price) * 100, 1) if monthly_price > 0 else None
        token_utilization_pct = round(
            ((usage.get("total_tokens") or 0) / included_tokens) * 100, 1
        ) if included_tokens > 0 else None

        return {
            "currentPlanId": plan_id,
            "billingCycle": billing_cycle,
            "subscriptionStatus": subscription_status,
            "subscriptionStartedAt": started_at.isoformat() if started_at else None,
            "currentPlan": current_plan,
            "isAdmin": _is_admin_email(user.email),
            "hasUnlimitedAccess": bool(current_plan.get("unlimited")),
            "plans": list_plans(),
            "usage": usage,
            "profitability": {
                "price_usd": monthly_price,
                "estimated_cost_for_current_usage_usd": current_usage_cost,
                "estimated_margin_for_current_usage_usd": usage_margin,
                "estimated_margin_for_current_usage_pct": usage_margin_pct,
                "included_token_utilization_pct": token_utilization_pct,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting subscription overview: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to load subscription overview")

@router.post("/subscription/select")
async def select_subscription_plan(payload: dict = Body(...), db: Session = Depends(get_db)):
    try:
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        requested_cycle = _normalize_billing_cycle(payload.get("billingCycle"))
        requested_status = _normalize_subscription_status(payload.get("subscriptionStatus"))

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()
        if not comprehensive_profile:
            comprehensive_profile = models.ComprehensiveUserProfile(user_id=user.id)
            db.add(comprehensive_profile)

        previous_tier = normalize_plan_id(comprehensive_profile.subscription_tier)
        requested_tier = normalize_plan_id(payload.get("tier") or payload.get("subscriptionTier"))
        if requested_tier != DEFAULT_PLAN_ID:
            raise HTTPException(
                status_code=400,
                detail="Paid plans must be activated through subscription checkout.",
            )
        comprehensive_profile.subscription_tier = requested_tier
        if requested_tier != "unlimited":
            comprehensive_profile.billing_cycle = requested_cycle
            comprehensive_profile.subscription_status = requested_status
            comprehensive_profile.stripe_subscription_id = None
            comprehensive_profile.stripe_price_id = None
            comprehensive_profile.current_period_end = None
            comprehensive_profile.cancel_at_period_end = False

        if previous_tier != requested_tier or not comprehensive_profile.subscription_started_at:
            comprehensive_profile.subscription_started_at = datetime.now(timezone.utc)
        comprehensive_profile.updated_at = datetime.now(timezone.utc)

        db.commit()

        try:
            from middleware.rate_limiter import invalidate_subscription_cache

            invalidate_subscription_cache(user.username, user.email)
        except Exception:
            pass

        return {
            "status": "success",
            "subscriptionTier": requested_tier,
            "billingCycle": requested_cycle,
            "subscriptionStatus": requested_status,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error selecting subscription plan: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update subscription plan")

@router.post("/update_comprehensive_profile")
async def update_comprehensive_profile(
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    try:
        logger.info("Received profile update request")

        user_id = payload.get("user_id")
        if not user_id:
            logger.error("No user_id in payload!")
            raise HTTPException(status_code=400, detail="user_id is required")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        new_username = None
        if "username" in payload:
            requested_username = _validate_username(payload.get("username"))
            if requested_username != user.username:
                existing_user = get_user_by_username(db, requested_username)
                if existing_user and existing_user.id != user.id:
                    raise HTTPException(status_code=400, detail="Username already registered")
                new_username = requested_username
                user.username = requested_username

        if payload.get("firstName"):
            user.first_name = payload["firstName"]
        if payload.get("lastName"):
            user.last_name = payload["lastName"]
        if payload.get("email"):
            next_email = _normalize_email(payload["email"])
            existing_email_user = get_user_by_email(db, next_email)
            if existing_email_user and existing_email_user.id != user.id:
                raise HTTPException(status_code=400, detail="Email already registered")
            user.email = next_email
        if payload.get("fieldOfStudy"):
            user.field_of_study = payload["fieldOfStudy"]

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        if not comprehensive_profile:
            comprehensive_profile = models.ComprehensiveUserProfile(user_id=user.id)
            db.add(comprehensive_profile)

        previous_subscription_tier = normalize_plan_id(comprehensive_profile.subscription_tier)

        if payload.get("difficultyLevel"):
            comprehensive_profile.difficulty_level = payload["difficultyLevel"]
        if payload.get("learningPace"):
            comprehensive_profile.learning_pace = payload["learningPace"]
        if payload.get("brainwaveGoal"):
            comprehensive_profile.brainwave_goal = payload["brainwaveGoal"]

        if "preferredSubjects" in payload:
            comprehensive_profile.preferred_subjects = json.dumps(payload["preferredSubjects"])

        if "showStudyInsights" in payload:
            value = payload["showStudyInsights"]
            if isinstance(value, str):
                value = value.lower() == 'true'
            comprehensive_profile.show_study_insights = bool(value)
            logger.info(f"Setting show_study_insights to: {comprehensive_profile.show_study_insights} (received: {payload['showStudyInsights']})")

        if "notificationsEnabled" in payload:
            value = payload["notificationsEnabled"]
            if isinstance(value, str):
                value = value.lower() == "true"
            comprehensive_profile.notifications_enabled = bool(value)

        if "subscriptionTier" in payload:
            next_tier = normalize_plan_id(payload.get("subscriptionTier"))
            comprehensive_profile.subscription_tier = next_tier
            if previous_subscription_tier != next_tier or not comprehensive_profile.subscription_started_at:
                comprehensive_profile.subscription_started_at = datetime.now(timezone.utc)
            if next_tier != "unlimited":
                comprehensive_profile.stripe_subscription_id = None
                comprehensive_profile.stripe_price_id = None
                comprehensive_profile.current_period_end = None
                comprehensive_profile.cancel_at_period_end = False

        if "billingCycle" in payload:
            current_tier = normalize_plan_id(comprehensive_profile.subscription_tier)
            if current_tier == "unlimited":
                pass
            else:
                comprehensive_profile.billing_cycle = _normalize_billing_cycle(payload.get("billingCycle"))

        if "subscriptionStatus" in payload:
            current_tier = normalize_plan_id(comprehensive_profile.subscription_tier)
            if current_tier == "unlimited":
                pass
            elif current_tier != DEFAULT_PLAN_ID:
                raise HTTPException(
                    status_code=409,
                    detail="Subscription status for paid plans is managed by provider webhooks.",
                )
            else:
                comprehensive_profile.subscription_status = _normalize_subscription_status(payload.get("subscriptionStatus"))

        comprehensive_profile.updated_at = datetime.now(timezone.utc)

        db.commit()

        if "subscriptionTier" in payload or "billingCycle" in payload or "subscriptionStatus" in payload:
            try:
                from middleware.rate_limiter import invalidate_subscription_cache

                invalidate_subscription_cache(user.username, user.email)
            except Exception:
                pass

        response = {
            "status": "success",
            "message": "Profile updated successfully"
        }
        if new_username:
            response["username"] = new_username
            response["access_token"] = create_access_token(data={"sub": user.username, "user_id": user.id})
            response["token_type"] = "bearer"
        return response

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        logger.error(f"Error updating profile: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update profile. Please try again.")

@router.post("/suggest_subjects")
async def suggest_subjects(
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    try:
        input_text = payload.get("input", "")
        college_level = payload.get("college_level", "")

        if len(input_text) < 2:
            return {"suggestions": []}

        prompt = f"""Based on the input "{input_text}" and college level "{college_level}", suggest 5 relevant academic subjects or courses.

Return ONLY a JSON array of subject names, nothing else. Format: ["Subject 1", "Subject 2", ...]

Examples:
- Input "calc" → ["Calculus I", "Calculus II", "Calculus III", "Multivariable Calculus", "Differential Calculus"]
- Input "bio" → ["Biology", "Molecular Biology", "Cell Biology", "Microbiology", "Biochemistry"]
- Input "comp" → ["Computer Science", "Computer Architecture", "Computational Theory", "Computer Networks", "Computer Graphics"]

Input: "{input_text}"
College Level: "{college_level}"
Suggestions:"""

        response = call_ai(prompt, max_tokens=200, temperature=0.7)

        try:
            json_match = re.search(r'\[.*\]', response, re.DOTALL)
            if json_match:
                suggestions = json.loads(json_match.group())
            else:
                suggestions = [s.strip().strip('"').strip("'").strip('-').strip()
                               for s in response.split('\n') if s.strip()]
                suggestions = [s for s in suggestions if len(s) > 2 and len(s) < 50][:5]
        except Exception:
            suggestions = []

        return {"suggestions": suggestions}

    except Exception as e:
        logger.error(f"Error generating subject suggestions: {str(e)}")
        return {"suggestions": []}

@router.post("/save_complete_profile")
async def save_complete_profile(
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    try:
        user_id = payload.get("user_id")
        logger.info(f"save_complete_profile called for {user_id}")
        logger.info(f"Payload: quiz_completed={payload.get('quiz_completed')}, quiz_skipped={payload.get('quiz_skipped')}")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            logger.error(f"User not found: {user_id}")
            raise HTTPException(status_code=404, detail="User not found")

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        if not comprehensive_profile:
            logger.info(f"Creating new comprehensive profile for user {user.id}")
            comprehensive_profile = models.ComprehensiveUserProfile(user_id=user.id)
            db.add(comprehensive_profile)
        else:
            logger.info(f"Updating existing comprehensive profile for user {user.id}")

        if "is_college_student" in payload:
            comprehensive_profile.is_college_student = payload["is_college_student"]

        if "college_level" in payload:
            comprehensive_profile.college_level = payload["college_level"]

        if "major" in payload:
            comprehensive_profile.major = payload["major"]

        if "preferred_subjects" in payload:
            comprehensive_profile.preferred_subjects = json.dumps(payload["preferred_subjects"])

        if "main_subject" in payload:
            user.field_of_study = payload["main_subject"]
            comprehensive_profile.main_subject = payload["main_subject"]

        if "brainwave_goal" in payload:
            comprehensive_profile.brainwave_goal = payload["brainwave_goal"]

        if payload.get("quiz_completed"):
            comprehensive_profile.primary_archetype = payload.get("primary_archetype", "")
            comprehensive_profile.secondary_archetype = payload.get("secondary_archetype", "")
            comprehensive_profile.archetype_scores = json.dumps(payload.get("archetype_scores", {}))
            comprehensive_profile.archetype_description = payload.get("archetype_description", "")

        comprehensive_profile.quiz_completed = payload.get("quiz_completed", False)
        comprehensive_profile.quiz_skipped = payload.get("quiz_skipped", False)
        comprehensive_profile.updated_at = datetime.now(timezone.utc)

        db.flush()
        db.commit()
        db.refresh(comprehensive_profile)

        logger.info(f"Saved profile for {user_id}: quiz_completed={comprehensive_profile.quiz_completed}, quiz_skipped={comprehensive_profile.quiz_skipped}, profile_id={comprehensive_profile.id}")

        verify_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()
        logger.info(f"Verification query: quiz_skipped={verify_profile.quiz_skipped if verify_profile else 'NOT FOUND'}")

        if payload.get("quiz_completed"):
            try:
                from proactive_ai_system import get_proactive_ai_engine
                proactive_engine = get_proactive_ai_engine(unified_ai)
                user_profile_data = {
                    "first_name": user.first_name or "there",
                    "field_of_study": user.field_of_study or "General Studies",
                    "is_college_student": payload.get("is_college_student", True),
                    "college_level": payload.get("college_level", ""),
                    "subjects": payload.get("preferred_subjects", []),
                    "main_subject": payload.get("main_subject", ""),
                    "goal": payload.get("brainwave_goal", "")
                }

                greeting_prompt = f"""You are an AI tutor greeting {user_profile_data['first_name']} for the first time after they completed their profile.

Profile:
- College Student: {user_profile_data['is_college_student']}
- Level: {user_profile_data['college_level']}
- Main Subject: {user_profile_data['main_subject']}
- Goal: {user_profile_data['goal']}

Generate a warm, personalized greeting message (2-3 sentences) that:
1. Welcomes them by name
2. Acknowledges their specific subject and goal
3. Expresses excitement to help them succeed
4. Sounds natural and encouraging

Keep it brief and friendly."""

                greeting_message = call_ai(greeting_prompt, max_tokens=150, temperature=0.8)

                new_session = models.ChatSession(
                    user_id=user.id,
                    title="Welcome to Cerbyl",
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc)
                )
                db.add(new_session)
                db.commit()
                db.refresh(new_session)

                greeting_chat = models.ChatMessage(
                    chat_session_id=new_session.id,
                    user_id=user.id,
                    user_message="PROFILE_COMPLETED",
                    ai_response=greeting_message,
                    timestamp=datetime.now(timezone.utc)
                )
                db.add(greeting_chat)
                db.commit()

            except Exception as e:
                logger.error(f"Error generating greeting: {str(e)}")

        return {
            "status": "success",
            "message": "Profile saved successfully",
            "quiz_completed": comprehensive_profile.quiz_completed,
            "quiz_skipped": comprehensive_profile.quiz_skipped
        }

    except Exception as e:
        logger.error(f"Error saving complete profile: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save profile. Please try again.")
