import ast
import json
import logging
import os
import traceback
from datetime import datetime, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Body, Depends, Form, HTTPException, Query
from starlette.concurrency import run_in_threadpool

try:
    from services.redis_cache import get_analytics as _cache_get, set_analytics as _cache_set
except Exception:
    def _cache_get(key): return None
    def _cache_set(key, val, ttl=300): pass
from sqlalchemy import and_, func
from sqlalchemy.orm import Session
from services.admin_analytics import check_admin

import models
from database import get_db
from deps import (
    call_ai,
    calculate_day_streak,
    enforce_request_user_scope,
    get_current_user,
    get_user_by_email,
    get_user_by_username,
    unified_ai,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api",
    tags=["analytics"],
    dependencies=[Depends(enforce_request_user_scope)],
)

DEFAULT_ANALYTICS_TZ = "Asia/Kolkata"
DEFAULT_ANALYTICS_OFFSET = timezone(timedelta(hours=5, minutes=30), DEFAULT_ANALYTICS_TZ)


def _solo_quiz_display_title(quiz):
    return getattr(quiz, "title", None) or getattr(quiz, "subject", None) or "Quiz"


def _analytics_timezone(tz_name=None):
    try:
        return ZoneInfo(tz_name or DEFAULT_ANALYTICS_TZ)
    except (ZoneInfoNotFoundError, ValueError):
        try:
            return ZoneInfo(DEFAULT_ANALYTICS_TZ)
        except (ZoneInfoNotFoundError, ValueError):
            return DEFAULT_ANALYTICS_OFFSET


def _safe_zone(tz_name=None):
    """Like _analytics_timezone but defaults to UTC, not the app's original
    dev-timezone default — for "what date is it for this user right now"
    checks (today's study minutes, daily session bucketing) where UTC is the
    more neutral fallback when the client hasn't reported its real zone."""
    try:
        return ZoneInfo(tz_name) if tz_name else ZoneInfo("UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _local_today(tz_name=None):
    return datetime.now(_safe_zone(tz_name)).date()


def _as_utc_datetime(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _coerce_date_value(value):
    if value is None:
        return None
    if hasattr(value, "date") and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            return None
    return None


def _group_daily_counts(
    db: Session,
    model,
    timestamp_attr: str,
    *,
    user_id: int,
    start_datetime,
    user_attr: str = "user_id",
    extra_filters=None,
):
    if not hasattr(model, timestamp_attr) or not hasattr(model, user_attr):
        return {}
    timestamp_col = getattr(model, timestamp_attr)
    user_col = getattr(model, user_attr)
    query = db.query(
        func.date(timestamp_col).label("activity_date"),
        func.count().label("activity_count"),
    ).filter(
        user_col == user_id,
        timestamp_col.isnot(None),
        timestamp_col >= start_datetime,
    )
    if extra_filters:
        query = query.filter(*extra_filters)
    rows = query.group_by(func.date(timestamp_col)).all()
    grouped = {}
    for date_value, count_value in rows:
        date_obj = _coerce_date_value(date_value)
        if date_obj is None:
            continue
        grouped[date_obj.isoformat()] = int(count_value or 0)
    return grouped


def check_api_usage_admin(current_user: models.User = Depends(get_current_user)) -> str:
    allowed = {
        email.strip()
        for email in os.getenv("API_USAGE_ADMIN_EMAILS", "").split(",")
        if email.strip()
    }
    user_email = (current_user.email or "").strip()
    if user_email not in allowed:
        raise HTTPException(status_code=403, detail="API usage access required")
    return user_email

@router.get("/get_enhanced_user_stats")
def get_enhanced_user_stats(user_id: str = Query(...), tz: str = Query(None), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        from services.gamification_system import get_user_stats as get_gamification_stats
        gamification_stats = get_gamification_stats(db, user.id)

        total_questions = gamification_stats.get("total_questions_answered", 0)
        total_notes = gamification_stats.get("total_notes_created", 0)
        total_flashcards = gamification_stats.get("total_flashcards_created", 0)
        total_quizzes = gamification_stats.get("total_quizzes_completed", 0)
        total_study_minutes = gamification_stats.get("total_study_minutes", 0)
        weekly_study_minutes = gamification_stats.get("weekly_study_minutes", 0)

        today_local = _local_today(tz)
        today_metric = db.query(models.DailyLearningMetrics).filter(
            models.DailyLearningMetrics.user_id == user.id,
            models.DailyLearningMetrics.date == today_local,
        ).first()
        today_minutes = today_metric.time_spent_minutes if today_metric else 0

        total_chat_sessions = db.query(func.count(func.distinct(models.ChatSession.id))).join(
            models.ChatMessage, models.ChatMessage.chat_session_id == models.ChatSession.id
        ).filter(
            models.ChatSession.user_id == user.id
        ).scalar() or 0

        streak = gamification_stats.get("current_streak", 0)

        user_stats = db.query(models.UserStats).filter(
            models.UserStats.user_id == user.id
        ).first()

        if user_stats:
            user_stats.day_streak = streak
            user_stats.total_hours = total_study_minutes / 60
            db.commit()

        return {
            "streak": streak,
            "lessons": total_quizzes,
            "hours": round(total_study_minutes / 60, 1),
            "minutes": total_study_minutes,
            "weeklyHours": round(weekly_study_minutes / 60, 1),
            "weeklyMinutes": weekly_study_minutes,
            "todayMinutes": today_minutes,
            "accuracy": user_stats.accuracy_percentage if user_stats else 0,
            "totalQuestions": total_questions,
            "totalFlashcards": total_flashcards,
            "totalNotes": total_notes,
            "totalChatSessions": total_chat_sessions,
            "total_time_today": today_minutes
        }

    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}")
        return {
            "streak": 0, "lessons": 0, "hours": 0, "minutes": 0,
            "weeklyHours": 0, "weeklyMinutes": 0, "todayMinutes": 0, "accuracy": 0,
            "totalQuestions": 0, "totalFlashcards": 0, "totalNotes": 0, "totalChatSessions": 0
        }

XP_SOURCE_LABELS = {
    "ai_chat": "AI Chat",
    "note_created": "Notes",
    "flashcard_set": "Flashcards Created",
    "flashcard_created": "Flashcards Created",
    "flashcard_reviewed": "Flashcard Review",
    "flashcard_mastered": "Flashcard Mastery",
    "quiz_completed": "Quizzes",
    "quiz_high_score": "Quizzes",
    "question_answered": "Practice Questions",
    "study_time": "Study Time",
    "battle_win": "Battles",
    "battle_draw": "Battles",
    "battle_loss": "Battles",
    "solo_quiz": "Solo Quizzes",
    "learning_path_node": "Learning Paths",
}


def _xp_source_label(activity_type: str) -> str:
    return XP_SOURCE_LABELS.get(activity_type, (activity_type or "other").replace("_", " ").title())


def _tz_aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


@router.get("/analytics/xp_history")
def get_xp_history(
    user_id: str = Query(...),
    period: str = Query("week"),
    week_offset: int = Query(0, ge=0, le=51),
    db: Session = Depends(get_db),
):
    """
    XP gained over time, bucketed for the given period, plus a breakdown of which
    activity types earned it. Backs both the home screen's mini XP graph (period=week)
    and the full XP analytics screen (week/month/year, switchable).

    week_offset lets the caller page into past calendar weeks (0 = this week,
    1 = last week, ...); it's ignored outside period="week".
    """
    if period not in ("week", "month", "year"):
        period = "week"
    if period != "week":
        week_offset = 0

    empty = {
        "period": period, "total_xp": 0, "delta_percent": 0.0, "points": [], "by_source": [],
        "week_offset": week_offset, "week_start": None, "week_end": None, "is_current_week": week_offset == 0,
    }

    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        now = datetime.now(timezone.utc)

        if period == "week" and week_offset > 0:
            # Calendar-aligned Monday-Sunday week, `week_offset` weeks back.
            this_monday = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=now.weekday())
            days = 7
            start = this_monday - timedelta(days=7 * week_offset)
            end = start + timedelta(days=7)
            prev_start = start - timedelta(days=7)
        else:
            days = {"week": 7, "month": 30, "year": 365}[period]
            end = now
            start = now - timedelta(days=days)
            prev_start = start - timedelta(days=days)

        rows = db.query(models.PointTransaction).filter(
            models.PointTransaction.user_id == user.id,
            models.PointTransaction.created_at >= prev_start,
            models.PointTransaction.created_at < end,
        ).order_by(models.PointTransaction.created_at.asc()).all()

        current_rows = [t for t in rows if end > _tz_aware(t.created_at) >= start]
        previous_rows = [t for t in rows if start > _tz_aware(t.created_at) >= prev_start]

        buckets: dict = {}
        if period == "year":
            cursor = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
            months = []
            for _ in range(12):
                months.append(cursor)
                cursor = (
                    cursor.replace(year=cursor.year - 1, month=12)
                    if cursor.month == 1
                    else cursor.replace(month=cursor.month - 1)
                )
            months.reverse()
            for m in months:
                buckets[m.strftime("%Y-%m")] = 0
            for t in current_rows:
                key = _tz_aware(t.created_at).strftime("%Y-%m")
                if key in buckets:
                    buckets[key] += t.points_earned
            points = [
                {"date": k, "label": datetime.strptime(k, "%Y-%m").strftime("%b"), "xp": v}
                for k, v in buckets.items()
            ]
        else:
            for i in range(days):
                d = (start + timedelta(days=i)).date()
                buckets[d.isoformat()] = 0
            for t in current_rows:
                key = _tz_aware(t.created_at).date().isoformat()
                if key in buckets:
                    buckets[key] += t.points_earned
            # First letter of the weekday collides for Tue/Thu ("T") and
            # Sat/Sun ("S") -- two-letter abbreviation keeps every day
            # distinguishable on the chart's x-axis.
            points = [
                {"date": k, "label": datetime.fromisoformat(k).strftime("%a")[:2], "xp": v}
                for k, v in buckets.items()
            ]

        total_xp = sum(t.points_earned for t in current_rows)
        previous_xp = sum(t.points_earned for t in previous_rows)
        if previous_xp > 0:
            delta_percent = round(((total_xp - previous_xp) / previous_xp) * 100, 1)
        else:
            delta_percent = 100.0 if total_xp > 0 else 0.0

        by_source_map: dict = {}
        for t in current_rows:
            label = _xp_source_label(t.activity_type)
            entry = by_source_map.setdefault(label, {"label": label, "xp": 0, "count": 0})
            entry["xp"] += t.points_earned
            entry["count"] += 1

        by_source = sorted(by_source_map.values(), key=lambda e: e["xp"], reverse=True)
        for entry in by_source:
            entry["percent"] = round((entry["xp"] / total_xp) * 100, 1) if total_xp > 0 else 0.0

        return {
            "period": period,
            "total_xp": total_xp,
            "delta_percent": delta_percent,
            "points": points,
            "by_source": by_source,
            "week_offset": week_offset,
            "week_start": start.date().isoformat() if period == "week" else None,
            "week_end": (end - timedelta(days=1)).date().isoformat() if period == "week" else None,
            "is_current_week": period == "week" and week_offset == 0,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting xp history: {str(e)}")
        return empty


@router.get("/get_activity_heatmap")
def get_activity_heatmap(user_id: str = Query(...), db: Session = Depends(get_db)):
    cache_key = f"heatmap:v2:{user_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        end_date = datetime.now(timezone.utc).date()
        start_date = end_date - timedelta(days=365)
        start_datetime = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)

        activity_dict = {}

        def merge_grouped_counts(grouped_counts):
            for date_str, count in grouped_counts.items():
                if count <= 0:
                    continue
                activity_dict[date_str] = activity_dict.get(date_str, 0) + count

        def collect_from(model, timestamp_attr, user_attr="user_id", extra_filters=None):
            try:
                grouped_counts = _group_daily_counts(
                    db,
                    model,
                    timestamp_attr,
                    user_id=user.id,
                    start_datetime=start_datetime,
                    user_attr=user_attr,
                    extra_filters=extra_filters,
                )
                merge_grouped_counts(grouped_counts)
                return sum(grouped_counts.values())
            except Exception as exc:
                logger.warning(
                    "Skipping heatmap source %s.%s for user %s: %s",
                    getattr(model, "__name__", str(model)),
                    timestamp_attr,
                    user.id,
                    exc,
                )
                return 0

        source_counts = {
            "point_transactions": collect_from(models.PointTransaction, "created_at"),
            "chat_messages": collect_from(models.ChatMessage, "timestamp"),
            "legacy_activities": collect_from(models.Activity, "timestamp"),
            "notes": collect_from(models.Note, "created_at"),
            "note_activities": collect_from(models.NoteActivity, "created_at"),
            "flashcard_sets": collect_from(models.FlashcardSet, "created_at"),
            "flashcard_study_sessions": collect_from(models.FlashcardStudySession, "session_date"),
            "question_sets": collect_from(models.QuestionSet, "created_at"),
            "question_sessions_started": collect_from(models.QuestionSession, "started_at"),
            "question_sessions_completed": collect_from(models.QuestionSession, "completed_at"),
            "learning_paths": collect_from(models.LearningPath, "created_at"),
            "learning_node_progress": collect_from(models.LearningNodeProgress, "created_at"),
            "completed_learning_nodes": collect_from(models.LearningNodeProgress, "completed_at"),
            "media_files": collect_from(models.MediaFile, "created_at"),
            "podcast_sessions": collect_from(models.PodcastSessionMemory, "created_at"),
        }

        logger.info(
            "Heatmap activity sources for user %s: %s",
            user.id,
            {name: count for name, count in source_counts.items() if count},
        )

        current_date = start_date
        heatmap_data = []

        while current_date <= end_date:
            date_str = current_date.isoformat()
            count = activity_dict.get(date_str, 0)

            if count == 0:
                level = 0
            elif count == 1:
                level = 1
            elif count <= 3:
                level = 2
            elif count <= 5:
                level = 3
            elif count <= 8:
                level = 4
            else:
                level = 5

            heatmap_data.append({
                "date": date_str,
                "count": count,
                "level": level
            })
            current_date += timedelta(days=1)

        total_count = sum(activity_dict.values())

        result = {
            "heatmap_data": heatmap_data,
            "total_count": total_count,
            "date_range": {
                "start": start_date.isoformat() + 'Z',
                "end": end_date.isoformat() + 'Z'
            }
        }
        _cache_set(cache_key, result, 300)
        return result
    except Exception as e:
        logger.error(f"Error getting heatmap: {str(e)}")
        return {"heatmap_data": [], "total_count": 0, "date_range": {"start": "", "end": ""}}

@router.get("/get_recent_activities")
def get_recent_activities(user_id: str = Query(...), limit: int = Query(5), db: Session = Depends(get_db)):
    return []

@router.get("/get_weekly_progress")
def get_weekly_progress(user_id: str = Query(...), db: Session = Depends(get_db)):
    cache_key = f"weekly:{user_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        end_date = datetime.now(timezone.utc).date()
        start_date = end_date - timedelta(days=6)

        daily_data = {}
        for i in range(7):
            current_date = start_date + timedelta(days=i)
            daily_data[current_date] = {
                "date": current_date.isoformat(),
                "day": ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][current_date.weekday()],
                "points": 0,
                "ai_chats": 0,
                "notes": 0,
                "flashcards": 0,
                "quizzes": 0,
                "solo_quizzes": 0,
                "battles": 0,
                "study_minutes": 0
            }

        transactions = db.query(models.PointTransaction).filter(
            models.PointTransaction.user_id == user.id,
            models.PointTransaction.created_at >= datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
        ).all()

        for t in transactions:
            date_key = t.created_at.date()
            if date_key in daily_data:
                daily_data[date_key]["points"] += t.points_earned

                if t.activity_type == "ai_chat":
                    daily_data[date_key]["ai_chats"] += 1
                elif t.activity_type == "note_created":
                    daily_data[date_key]["notes"] += 1
                elif t.activity_type in ["flashcard_set", "flashcard_reviewed", "flashcard_mastered"]:
                    daily_data[date_key]["flashcards"] += 1
                elif t.activity_type == "quiz_completed":
                    daily_data[date_key]["quizzes"] += 1
                elif t.activity_type == "solo_quiz":
                    daily_data[date_key]["solo_quizzes"] += 1
                elif t.activity_type in ["battle_win", "battle_draw", "battle_loss"]:
                    daily_data[date_key]["battles"] += 1
                elif t.activity_type == "study_time":
                    try:
                        if t.activity_metadata:
                            meta = ast.literal_eval(t.activity_metadata)
                            daily_data[date_key]["study_minutes"] += meta.get("minutes", 0)
                    except Exception:
                        pass

        weekly_data = []
        daily_breakdown = []
        total_points = 0

        for i in range(7):
            current_date = start_date + timedelta(days=i)
            day_data = daily_data[current_date]
            weekly_data.append(day_data["points"])
            daily_breakdown.append(day_data)
            total_points += day_data["points"]

        average_per_day = total_points / 7 if total_points > 0 else 0

        stats = db.query(models.UserGamificationStats).filter(
            models.UserGamificationStats.user_id == user.id
        ).first()

        result = {
            "weekly_data": weekly_data,
            "daily_breakdown": daily_breakdown,
            "total_points": total_points,
            "average_per_day": round(average_per_day, 1),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "weekly_stats": {
                "ai_chats": stats.weekly_ai_chats if stats else 0,
                "notes_created": stats.weekly_notes_created if stats else 0,
                "flashcards_created": stats.weekly_flashcards_created if stats else 0,
                "quizzes_completed": stats.weekly_quizzes_completed if stats else 0,
                "solo_quizzes": getattr(stats, 'weekly_solo_quizzes', 0) if stats else 0,
                "battles_won": stats.weekly_battles_won if stats else 0,
                "study_minutes": stats.weekly_study_minutes if stats else 0
            }
        }
        _cache_set(cache_key, result, 300)
        return result

    except Exception as e:
        logger.error(f"Error getting weekly progress: {str(e)}")
        return {
            "weekly_data": [0, 0, 0, 0, 0, 0, 0],
            "total_sessions": 0,
            "average_per_day": 0
        }

@router.get("/get_analytics_history")
def get_analytics_history(
    user_id: str = Query(...),
    period: str = Query("week"),
    tz: str = Query(DEFAULT_ANALYTICS_TZ),
    reconcile_sources: bool = Query(True),
    db: Session = Depends(get_db)
):
    client_tz = _analytics_timezone(tz)
    cache_key = f"history:v4:{user_id}:{period}:{getattr(client_tz, 'key', DEFAULT_ANALYTICS_TZ)}:{int(reconcile_sources)}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        now_local = datetime.now(client_tz)
        end_date = now_local.date()
        if period == "week":
            start_date = end_date - timedelta(days=6)
            group_by = "day"
        elif period == "month":
            start_date = end_date - timedelta(days=29)
            group_by = "day"
        elif period == "year":
            start_date = end_date - timedelta(days=364)
            group_by = "week"
        else:
            earliest = db.query(func.min(models.PointTransaction.created_at)).filter(
                models.PointTransaction.user_id == user.id
            ).scalar()
            earliest_utc = _as_utc_datetime(earliest)
            start_date = earliest_utc.astimezone(client_tz).date() if earliest_utc else end_date - timedelta(days=364)
            group_by = "month"

        start_datetime = (
            datetime.combine(start_date, datetime.min.time())
            .replace(tzinfo=client_tz)
            .astimezone(timezone.utc)
        )

        transactions = db.query(models.PointTransaction).filter(
            models.PointTransaction.user_id == user.id,
            models.PointTransaction.created_at >= start_datetime
        ).order_by(models.PointTransaction.created_at.asc()).all()

        data_points = {}

        if group_by == "day":
            current = start_date
            while current <= end_date:
                key = current.isoformat()
                day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                data_points[key] = {
                    "date": key,
                    "day": day_names[current.weekday()],
                    "label": current.strftime("%b %d") if period == "month" else day_names[current.weekday()],
                    "points": 0,
                    "ai_chats": 0,
                    "notes": 0,
                    "flashcards": 0,
                    "quizzes": 0,
                    "solo_quizzes": 0,
                    "battles": 0,
                    "study_minutes": 0
                }
                current += timedelta(days=1)
        elif group_by == "week":
            current = start_date
            week_num = 0
            while current <= end_date:
                week_start = current
                week_end = min(current + timedelta(days=6), end_date)
                key = f"W{week_num}"
                data_points[key] = {
                    "date": week_start.isoformat(),
                    "day": key,
                    "label": week_start.strftime("%b %d"),
                    "points": 0,
                    "ai_chats": 0,
                    "notes": 0,
                    "flashcards": 0,
                    "quizzes": 0,
                    "solo_quizzes": 0,
                    "battles": 0,
                    "study_minutes": 0,
                    "_start": week_start,
                    "_end": week_end
                }
                current += timedelta(days=7)
                week_num += 1
        else:
            current = start_date.replace(day=1)
            while current <= end_date:
                key = current.strftime("%Y-%m")
                data_points[key] = {
                    "date": current.isoformat(),
                    "day": current.strftime("%b"),
                    "label": current.strftime("%b %Y"),
                    "points": 0,
                    "ai_chats": 0,
                    "notes": 0,
                    "flashcards": 0,
                    "quizzes": 0,
                    "solo_quizzes": 0,
                    "battles": 0,
                    "study_minutes": 0,
                    "_month": current.month,
                    "_year": current.year
                }
                if current.month == 12:
                    current = current.replace(year=current.year + 1, month=1)
                else:
                    current = current.replace(month=current.month + 1)

        def key_for_date(date_value):
            if group_by == "day":
                return date_value.isoformat()
            elif group_by == "week":
                for k, v in data_points.items():
                    if "_start" in v and v["_start"] <= date_value <= v["_end"]:
                        return k
                return None
            else:
                return date_value.strftime("%Y-%m")

        for t in transactions:
            created_at = _as_utc_datetime(t.created_at)
            if not created_at:
                continue
            t_date = created_at.astimezone(client_tz).date()
            key = key_for_date(t_date)

            if key not in data_points:
                continue

            data_points[key]["points"] += t.points_earned

            if t.activity_type == "ai_chat":
                data_points[key]["ai_chats"] += 1
            elif t.activity_type == "note_created":
                data_points[key]["notes"] += 1
            elif t.activity_type in ["flashcard_set", "flashcard_reviewed", "flashcard_mastered"]:
                data_points[key]["flashcards"] += 1
            elif t.activity_type == "quiz_completed":
                data_points[key]["quizzes"] += 1
            elif t.activity_type == "solo_quiz":
                data_points[key]["solo_quizzes"] += 1
            elif t.activity_type in ["battle_win", "battle_draw", "battle_loss"]:
                data_points[key]["battles"] += 1
            elif t.activity_type == "study_time":
                try:
                    if t.activity_metadata:
                        meta = ast.literal_eval(t.activity_metadata)
                        data_points[key]["study_minutes"] += meta.get("minutes", 0)
                except Exception:
                    pass

        if reconcile_sources:
            def collect_source_counts(model, timestamp_attr, category, point_estimate=0, user_attr="user_id"):
                try:
                    grouped_counts = _group_daily_counts(
                        db,
                        model,
                        timestamp_attr,
                        user_id=user.id,
                        start_datetime=start_datetime,
                        user_attr=user_attr,
                    )
                except Exception as exc:
                    logger.warning(
                        "Skipping analytics history source %s.%s for user %s: %s",
                        getattr(model, "__name__", str(model)),
                        timestamp_attr,
                        user.id,
                        exc,
                    )
                    return

                for date_str, source_count in grouped_counts.items():
                    try:
                        timestamp_utc = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
                    except ValueError:
                        continue
                    key = key_for_date(timestamp_utc.astimezone(client_tz).date())
                    if key not in data_points:
                        continue
                    existing_count = data_points[key].get(category, 0)
                    missing_count = max(0, source_count - existing_count)
                    if missing_count <= 0:
                        continue
                    data_points[key][category] = existing_count + missing_count
                    data_points[key]["points"] += missing_count * point_estimate

            collect_source_counts(models.ChatMessage, "timestamp", "ai_chats", 1)
            collect_source_counts(models.Activity, "timestamp", "quizzes", 0)
            collect_source_counts(models.Note, "created_at", "notes", 20)
            collect_source_counts(models.NoteActivity, "created_at", "notes", 0)
            collect_source_counts(models.FlashcardSet, "created_at", "flashcards", 10)
            collect_source_counts(models.FlashcardStudySession, "session_date", "flashcards", 0)
            collect_source_counts(models.QuestionSet, "created_at", "quizzes", 0)
            collect_source_counts(models.QuestionSession, "completed_at", "quizzes", 15)
            collect_source_counts(models.LearningPath, "created_at", "quizzes", 0)
            collect_source_counts(models.LearningNodeProgress, "completed_at", "quizzes", 0)
            collect_source_counts(models.MediaFile, "created_at", "notes", 0)
            collect_source_counts(models.PodcastSessionMemory, "created_at", "ai_chats", 0)

        history = []
        for key in sorted(data_points.keys()):
            item = {k: v for k, v in data_points[key].items() if not k.startswith("_")}
            history.append(item)

        total_points = sum(h["points"] for h in history)
        total_activities = sum(
            h["ai_chats"] + h["notes"] + h["flashcards"] + h["quizzes"] + h["solo_quizzes"] + h["battles"]
            for h in history
        )

        result = {
            "history": history,
            "period": period,
            "timezone": getattr(client_tz, "key", DEFAULT_ANALYTICS_TZ),
            "group_by": group_by,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "total_points": total_points,
            "total_activities": total_activities,
            "data_points_count": len(history)
        }
        _cache_set(cache_key, result, 300 if not reconcile_sources else 60)
        return result

    except Exception as e:
        logger.error(f"Error getting analytics history: {str(e)}")
        traceback.print_exc()
        return {"history": [], "period": period, "error": str(e)}

@router.get("/get_global_leaderboard")
def get_global_leaderboard(limit: int = Query(10), db: Session = Depends(get_db)):
    try:
        rows = db.query(models.UserGamificationStats, models.User).join(
            models.User, models.User.id == models.UserGamificationStats.user_id
        ).order_by(
            models.UserGamificationStats.total_points.desc(),
            models.UserGamificationStats.user_id.asc(),
        ).limit(limit).all()

        leaderboard = [
            {
                "user_id": user.id,
                "username": user.username,
                "total_points": stats.total_points,
                "level": stats.level
            }
            for stats, user in rows
        ]

        return {"leaderboard": leaderboard}
    except Exception as e:
        logger.error(f"Error getting leaderboard: {str(e)}")
        return {"leaderboard": []}

@router.get("/get_learning_analytics")
def get_learning_analytics(user_id: str = Query(...), period: str = Query("week"), db: Session = Depends(get_db)):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    period_days = {"week": 7, "month": 30, "year": 365}.get(period, 7)
    end_date = datetime.now(timezone.utc).date()
    start_date = end_date - timedelta(days=period_days)

    daily_metrics = db.query(models.DailyLearningMetrics).filter(
        models.DailyLearningMetrics.user_id == user.id,
        models.DailyLearningMetrics.date >= start_date,
        models.DailyLearningMetrics.date <= end_date
    ).all()

    total_sessions = len([m for m in daily_metrics if m.questions_answered > 0 or m.time_spent_minutes > 0])
    total_time_minutes = sum(m.time_spent_minutes for m in daily_metrics)
    total_questions = sum(m.questions_answered for m in daily_metrics)

    return {
        "period": period if period in {"week", "month", "year"} else "week",
        "start_date": start_date.isoformat() + 'Z',
        "end_date": end_date.isoformat() + 'Z',
        "total_sessions": total_sessions,
        "total_time_minutes": total_time_minutes,
        "total_questions": total_questions,
        "accuracy_percentage": 100,
        "average_per_day": 0,
        "days_active": total_sessions,
        "daily_data": []
    }

@router.get("/analytics/check_profile_quiz")
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

@router.get("/analytics/is_first_time_user")
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

@router.get("/get_quiz_performance")
def get_quiz_performance(user_id: str = Query(...), limit: int = Query(30), db: Session = Depends(get_db)):
    cache_key = f"quiz_perf:{user_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        quiz_txns = db.query(models.PointTransaction).filter(
            models.PointTransaction.user_id == user.id,
            models.PointTransaction.activity_type.in_(["quiz_completed", "solo_quiz"])
        ).order_by(models.PointTransaction.created_at.desc()).limit(limit).all()

        results = []
        for t in quiz_txns:
            meta = {}
            try:
                if t.activity_metadata:
                    meta = ast.literal_eval(t.activity_metadata)
            except Exception:
                pass
            score = meta.get("score", meta.get("percentage", meta.get("correct", 0)))
            total = meta.get("total", meta.get("num_questions", meta.get("total_questions", 0)))
            results.append({
                "date": t.created_at.date().isoformat(),
                "score": float(score) if score else 0,
                "total": int(total) if total else 0,
                "topic": str(meta.get("topic", meta.get("subject", "General")))[:40],
                "points": t.points_earned,
                "type": t.activity_type
            })

        avg_score = sum(r["score"] for r in results) / len(results) if results else 0
        result = {
            "quiz_history": list(reversed(results)),
            "total_quizzes": len(results),
            "avg_score": round(avg_score, 1)
        }
        _cache_set(cache_key, result, 300)
        return result
    except Exception as e:
        logger.error(f"Error getting quiz performance: {str(e)}")
        return {"quiz_history": [], "total_quizzes": 0, "avg_score": 0}

@router.get("/get_activity_breakdown")
def get_activity_breakdown(user_id: str = Query(...), period: str = Query("all"), db: Session = Depends(get_db)):
    cache_key = f"breakdown:{user_id}:{period}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        query = db.query(models.PointTransaction).filter(models.PointTransaction.user_id == user.id)

        end_dt = datetime.now(timezone.utc)
        if period == "week":
            query = query.filter(models.PointTransaction.created_at >= end_dt - timedelta(days=7))
        elif period == "month":
            query = query.filter(models.PointTransaction.created_at >= end_dt - timedelta(days=30))
        elif period == "year":
            query = query.filter(models.PointTransaction.created_at >= end_dt - timedelta(days=365))

        txns = query.all()

        cats = {
            "ai_chats":   {"label": "AI Chats",   "count": 0, "points": 0},
            "notes":      {"label": "Notes",       "count": 0, "points": 0},
            "flashcards": {"label": "Flashcards",  "count": 0, "points": 0},
            "quizzes":    {"label": "Quizzes",     "count": 0, "points": 0},
            "battles":    {"label": "Battles",     "count": 0, "points": 0},
            "other":      {"label": "Other",       "count": 0, "points": 0},
        }

        total_points = 0
        for t in txns:
            total_points += t.points_earned
            at = t.activity_type or "other"
            if at == "ai_chat":
                cats["ai_chats"]["count"] += 1
                cats["ai_chats"]["points"] += t.points_earned
            elif at in ["note_created", "note_updated"]:
                cats["notes"]["count"] += 1
                cats["notes"]["points"] += t.points_earned
            elif at in ["flashcard_set", "flashcard_reviewed", "flashcard_mastered"]:
                cats["flashcards"]["count"] += 1
                cats["flashcards"]["points"] += t.points_earned
            elif at in ["quiz_completed", "solo_quiz"]:
                cats["quizzes"]["count"] += 1
                cats["quizzes"]["points"] += t.points_earned
            elif at in ["battle_win", "battle_draw", "battle_loss"]:
                cats["battles"]["count"] += 1
                cats["battles"]["points"] += t.points_earned
            else:
                cats["other"]["count"] += 1
                cats["other"]["points"] += t.points_earned

        result = {
            "breakdown": cats,
            "total_activities": sum(c["count"] for c in cats.values()),
            "total_points": total_points,
            "period": period
        }
        _cache_set(cache_key, result, 300)
        return result
    except Exception as e:
        logger.error(f"Error getting activity breakdown: {str(e)}")
        return {"breakdown": {}, "total_activities": 0, "total_points": 0}

@router.post("/analytics/start_session")
def start_session(
    user_id: str = Form(...),
    session_type: str = Form(...),
    tz: str = Form(None),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Opening the app counts toward today's streak on its own — it shouldn't take a
        # graded action to keep a streak alive. tz is the client's IANA zone (e.g.
        # "America/Los_Angeles") so "today" is the user's local day, not the server's UTC day.
        try:
            from services.gamification_system import record_daily_check_in
            record_daily_check_in(db, user.id, tz)
        except Exception:
            logger.exception("Failed to record daily streak check-in for user %s", user.id)

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

@router.post("/analytics/end_session")
def end_session(
    user_id: str = Form(...),
    session_id: str = Form(...),
    time_spent_minutes: float = Form(...),
    session_type: str = Form(...),
    tz: str = Form(None),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        today = _local_today(tz)
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
            db.query(models.DailyLearningMetrics).filter(
                models.DailyLearningMetrics.id == daily_metric.id
            ).update({
                models.DailyLearningMetrics.time_spent_minutes: models.DailyLearningMetrics.time_spent_minutes + time_spent_minutes,
                models.DailyLearningMetrics.sessions_completed: func.coalesce(models.DailyLearningMetrics.sessions_completed, 0) + 1,
            })

        user_stats = db.query(models.UserStats).filter(
            models.UserStats.user_id == user.id
        ).first()

        if not user_stats:
            user_stats = models.UserStats(user_id=user.id, total_hours=time_spent_minutes / 60, last_activity=datetime.now(timezone.utc))
            db.add(user_stats)
        else:
            db.query(models.UserStats).filter(
                models.UserStats.id == user_stats.id
            ).update({
                models.UserStats.total_hours: models.UserStats.total_hours + (time_spent_minutes / 60),
                models.UserStats.last_activity: datetime.now(timezone.utc),
            })

        db.commit()
        db.refresh(daily_metric)

        if time_spent_minutes > 0:
            from services.gamification_system import award_points
            award_points(db, user.id, "study_time", {"minutes": time_spent_minutes})

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

@router.get("/analytics/get_daily_goal_progress")
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

@router.get("/admin/analytics/overview")
async def admin_analytics_overview(
    days: int = Query(30, ge=1, le=365),
    _: str = Depends(check_admin),
):
    from services.admin_analytics import get_analytics_overview
    return await run_in_threadpool(get_analytics_overview, days)

@router.get("/admin/analytics/users")
async def admin_analytics_users(
    days: int = Query(30, ge=1, le=365),
    _: str = Depends(check_admin),
):
    from services.admin_analytics import get_user_analytics
    return await run_in_threadpool(get_user_analytics, days)

@router.get("/admin/analytics/user/{target_user_id}")
async def admin_analytics_user_detail(
    target_user_id: int,
    _: str = Depends(check_admin),
):
    from services.admin_analytics import get_user_detail
    return await run_in_threadpool(get_user_detail, target_user_id)

@router.get("/admin/analytics/export/csv")
async def admin_analytics_export_csv(
    days: int = Query(30, ge=1, le=365),
    _: str = Depends(check_admin),
):
    from services.admin_analytics import export_analytics_csv
    return await run_in_threadpool(export_analytics_csv, days)

@router.get("/admin/analytics/export/user/{target_user_id}/csv")
async def admin_analytics_export_user_csv(
    target_user_id: int,
    _: str = Depends(check_admin),
):
    from services.admin_analytics import export_user_csv
    return await run_in_threadpool(export_user_csv, target_user_id)

@router.get("/admin/api-key-usage")
@router.get("/admin/api_key_usage")
async def admin_api_key_usage(
    _: str = Depends(check_api_usage_admin),
):
    from services.api_key_pool import get_usage_snapshot
    return get_usage_snapshot()


@router.get("/admin/rate-limits/stats")
async def admin_rl_stats(
    window: int = Query(300, ge=60, le=86400),
    _: str = Depends(check_admin),
):
    from middleware.request_tracker import get_stats
    return get_stats(window_seconds=window)


@router.get("/admin/rate-limits/recent")
async def admin_rl_recent(
    limit: int = Query(250, ge=1, le=1000),
    tier: Optional[str] = Query(None),
    user: Optional[str] = Query(None),
    blocked_only: bool = Query(False),
    method: Optional[str] = Query(None),
    _: str = Depends(check_admin),
):
    from middleware.request_tracker import get_recent
    return {"requests": get_recent(
        limit=limit,
        tier_filter=tier,
        user_filter=user,
        blocked_only=blocked_only,
        method_filter=method,
    )}


@router.get("/admin/rate-limits/live")
async def admin_rl_live(
    _: str = Depends(check_admin),
):
    from middleware.request_tracker import get_live_quotas, BACKEND_ID
    from middleware.rate_limiter import TIERS
    from services.subscription_catalog import SUBSCRIPTION_PLANS
    quotas = get_live_quotas()
    tier_windows = {t: w for t, (_, w) in TIERS.items()}
    plan_limits = {
        plan_id: {
            tier: plan.get("rate_limits", {}).get(tier, limit)
            for tier, (limit, _) in TIERS.items()
        }
        for plan_id, plan in SUBSCRIPTION_PLANS.items()
        if not plan.get("hidden")
    }
    return {
        "quotas": quotas,
        "backend_id": BACKEND_ID,
        "tier_windows": tier_windows,
        "plan_limits": plan_limits,
    }

@router.get("/study_insights/comprehensive")
async def get_comprehensive_insights(
    user_id: str = Query(...),
    time_range: str = Query("overall", pattern="^(session|overall)$"),
    db: Session = Depends(get_db)
):
    try:
        from study_session_analyzer import get_study_session_analyzer

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)

        if time_range == "session":
            max_session_window = now - timedelta(hours=4)
            if user.last_login:
                login_time = user.last_login
                if hasattr(login_time, 'tzinfo') and login_time.tzinfo is None:
                    login_time = login_time.replace(tzinfo=timezone.utc)
                if hasattr(max_session_window, 'tzinfo') and max_session_window.tzinfo is None:
                    max_session_window = max_session_window.replace(tzinfo=timezone.utc)
                time_filter = max(login_time, max_session_window)
            else:
                time_filter = max_session_window
        else:
            time_filter = None

        analyzer = get_study_session_analyzer(db, user.id, unified_ai)
        session_summary = analyzer.generate_session_summary()
        ai_summary = await analyzer.generate_ai_summary()

        flashcard_sets = db.query(models.FlashcardSet).filter(
            models.FlashcardSet.user_id == user.id
        ).all()

        total_flashcards = 0
        reviewed_flashcards = 0
        mastered_flashcards = 0
        struggling_flashcards = []

        set_ids = [fset.id for fset in flashcard_sets]
        cards_by_set = {}
        if set_ids:
            all_cards = db.query(models.Flashcard).filter(
                models.Flashcard.set_id.in_(set_ids)
            ).all()
            for card in all_cards:
                cards_by_set.setdefault(card.set_id, []).append(card)

        for fset in flashcard_sets:
            cards = cards_by_set.get(fset.id, [])
            total_flashcards += len(cards)

            for card in cards:
                if card.times_reviewed and card.times_reviewed > 0:
                    reviewed_flashcards += 1
                    accuracy = (card.correct_count / card.times_reviewed * 100) if card.times_reviewed > 0 else 0

                    if accuracy >= 80 and card.times_reviewed >= 3:
                        mastered_flashcards += 1
                    elif accuracy < 50 and card.times_reviewed >= 2:
                        struggling_flashcards.append({
                            "question": card.question[:100],
                            "set_name": fset.title,
                            "accuracy": round(accuracy, 1),
                            "times_reviewed": card.times_reviewed
                        })

        quiz_query = db.query(models.SoloQuiz).filter(
            models.SoloQuiz.user_id == user.id,
            models.SoloQuiz.completed == True
        )

        if time_filter:
            quiz_query = quiz_query.filter(models.SoloQuiz.completed_at >= time_filter)

        solo_quizzes = quiz_query.order_by(models.SoloQuiz.completed_at.desc()).limit(20).all()

        quiz_stats = {
            "total_quizzes": len(solo_quizzes),
            "average_score": 0,
            "recent_quizzes": [],
            "by_difficulty": {"easy": [], "intermediate": [], "hard": []}
        }

        if solo_quizzes:
            scores = [q.score for q in solo_quizzes if q.score is not None]
            quiz_stats["average_score"] = round(sum(scores) / len(scores), 1) if scores else 0

            for quiz in solo_quizzes[:10]:
                quiz_data = {
                    "title": _solo_quiz_display_title(quiz),
                    "score": quiz.score,
                    "difficulty": quiz.difficulty,
                    "question_count": quiz.question_count,
                    "completed_at": quiz.completed_at.isoformat() if quiz.completed_at else None
                }
                quiz_stats["recent_quizzes"].append(quiz_data)

                if quiz.difficulty in quiz_stats["by_difficulty"]:
                    quiz_stats["by_difficulty"][quiz.difficulty].append(quiz.score)

        for diff in quiz_stats["by_difficulty"]:
            scores = quiz_stats["by_difficulty"][diff]
            quiz_stats["by_difficulty"][diff] = {
                "count": len(scores),
                "average": round(sum(scores) / len(scores), 1) if scores else 0
            }

        weak_areas = db.query(models.UserWeakArea).filter(
            models.UserWeakArea.user_id == user.id,
            models.UserWeakArea.status != "mastered"
        ).order_by(
            models.UserWeakArea.priority.desc(),
            models.UserWeakArea.weakness_score.desc()
        ).limit(10).all()

        weak_areas_data = [{
            "topic": wa.topic,
            "subtopic": wa.subtopic,
            "accuracy": round(wa.accuracy, 1),
            "weakness_score": round(wa.weakness_score, 1),
            "total_questions": wa.total_questions,
            "incorrect_count": wa.incorrect_count,
            "priority": wa.priority,
            "status": wa.status,
            "last_practiced": wa.last_practiced.isoformat() if wa.last_practiced else None
        } for wa in weak_areas]

        question_sets = db.query(models.QuestionSet).filter(
            models.QuestionSet.user_id == user.id
        ).all()

        question_bank_stats = {
            "total_sets": len(question_sets),
            "total_questions": 0,
            "completed_questions": 0,
            "average_accuracy": 0
        }

        qset_ids = [qset.id for qset in question_sets]
        questions_by_set = {}
        if qset_ids:
            all_questions = db.query(models.Question).filter(
                models.Question.question_set_id.in_(qset_ids)
            ).all()
            for q in all_questions:
                questions_by_set.setdefault(q.question_set_id, []).append(q)

        all_accuracies = []
        for qset in question_sets:
            questions = questions_by_set.get(qset.id, [])
            question_bank_stats["total_questions"] += len(questions)

            for q in questions:
                if hasattr(q, 'times_attempted') and q.times_attempted and q.times_attempted > 0:
                    question_bank_stats["completed_questions"] += 1
                    if hasattr(q, 'times_correct'):
                        accuracy = (q.times_correct / q.times_attempted * 100) if q.times_attempted > 0 else 0
                        all_accuracies.append(accuracy)

        if all_accuracies:
            question_bank_stats["average_accuracy"] = round(sum(all_accuracies) / len(all_accuracies), 1)

        notes_count = db.query(func.count(models.Note.id)).filter(
            models.Note.user_id == user.id
        ).scalar() or 0

        recent_notes = db.query(models.Note).filter(
            models.Note.user_id == user.id
        ).order_by(models.Note.updated_at.desc()).limit(5).all()

        notes_data = {
            "total_notes": notes_count,
            "recent_notes": [{
                "id": note.id,
                "title": note.title,
                "updated_at": note.updated_at.isoformat() if note.updated_at else None
            } for note in recent_notes]
        }

        stats = db.query(models.UserGamificationStats).filter(
            models.UserGamificationStats.user_id == user.id
        ).first()

        time_stats = {
            "total_study_minutes": getattr(stats, 'total_study_minutes', 0) if stats else 0,
            "weekly_study_minutes": getattr(stats, 'weekly_study_minutes', 0) if stats else 0,
            "day_streak": calculate_day_streak(db, user.id),
            "total_points": getattr(stats, 'total_points', 0) if stats else 0
        }

        activity_query = db.query(models.PointTransaction).filter(
            models.PointTransaction.user_id == user.id
        )

        if time_filter:
            activity_query = activity_query.filter(models.PointTransaction.created_at >= time_filter)
        else:
            activity_query = activity_query.filter(models.PointTransaction.created_at >= week_ago)

        recent_activities = activity_query.order_by(
            models.PointTransaction.created_at.desc()
        ).limit(100).all()

        activity_breakdown = {
            "ai_chats": 0,
            "flashcards_reviewed": 0,
            "quizzes_completed": 0,
            "notes_created": 0,
            "questions_answered": 0
        }

        for activity in recent_activities:
            if activity.activity_type == "ai_chat":
                activity_breakdown["ai_chats"] += 1
            elif activity.activity_type in ["flashcard_reviewed", "flashcard_mastered"]:
                activity_breakdown["flashcards_reviewed"] += 1
            elif activity.activity_type in ["quiz_completed", "solo_quiz"]:
                activity_breakdown["quizzes_completed"] += 1
            elif activity.activity_type == "note_created":
                activity_breakdown["notes_created"] += 1
            elif activity.activity_type == "question_answered":
                activity_breakdown["questions_answered"] += 1

        return {
            "status": "success",
            "time_range": time_range,
            "time_filter_start": time_filter.isoformat() if time_filter else None,
            "user_name": user.first_name or user.username,
            "ai_summary": ai_summary,
            "session_data": session_summary,
            "flashcards": {
                "total": total_flashcards,
                "reviewed": reviewed_flashcards,
                "mastered": mastered_flashcards,
                "mastery_rate": round((mastered_flashcards / total_flashcards * 100), 1) if total_flashcards > 0 else 0,
                "struggling": struggling_flashcards[:5]
            },
            "quizzes": quiz_stats,
            "weak_areas": weak_areas_data,
            "question_bank": question_bank_stats,
            "notes": notes_data,
            "time_stats": time_stats,
            "activity_breakdown": activity_breakdown
        }

    except Exception as e:
        logger.error(f"Comprehensive insights error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/study_insights/session_summary")
async def get_study_session_summary(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        from study_session_analyzer import get_study_session_analyzer

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        analyzer = get_study_session_analyzer(db, user.id, unified_ai)
        summary = analyzer.generate_session_summary()

        return {
            "status": "success",
            "summary": summary
        }
    except Exception as e:
        logger.error(f"Error getting study session summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/study_insights/ai_summary")
async def get_ai_study_summary(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        from study_session_analyzer import get_study_session_analyzer

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        analyzer = get_study_session_analyzer(db, user.id, unified_ai)
        ai_summary = await analyzer.generate_ai_summary()

        return {
            "status": "success",
            "summary": ai_summary
        }
    except Exception as e:
        logger.error(f"Error getting AI study summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/study_insights/strengths_weaknesses")
async def get_strengths_weaknesses(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        from services.comprehensive_weakness_analyzer import get_comprehensive_weakness_analysis

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        result = get_comprehensive_weakness_analysis(db, user.id, models)
        return result

    except Exception as e:
        logger.error(f"Error getting comprehensive strengths/weaknesses: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/study_insights/activity_feed")
async def get_activity_feed(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        activities = []

        chats = db.query(models.ChatSession).filter(
            models.ChatSession.user_id == user.id
        ).order_by(models.ChatSession.updated_at.desc()).limit(30).all()
        for s in chats:
            activities.append({
                "type": "chat",
                "topic": s.title or "Chat Session",
                "ts": s.updated_at.isoformat() if s.updated_at else None,
                "detail": f"{len(s.messages)} messages" if hasattr(s, 'messages') else "",
            })

        notes = db.query(models.Note).filter(
            models.Note.user_id == user.id,
            models.Note.is_deleted == False,
        ).order_by(models.Note.updated_at.desc()).limit(30).all()
        for n in notes:
            activities.append({
                "type": "note",
                "topic": n.title or "Untitled Note",
                "ts": n.updated_at.isoformat() if n.updated_at else None,
                "detail": "",
            })

        sets = db.query(models.FlashcardSet).filter(
            models.FlashcardSet.user_id == user.id,
        ).order_by(models.FlashcardSet.updated_at.desc()).limit(30).all()
        for fs in sets:
            card_count = len(fs.flashcards) if hasattr(fs, 'flashcards') else 0
            activities.append({
                "type": "flashcard",
                "topic": fs.title or "Flashcard Set",
                "ts": fs.updated_at.isoformat() if fs.updated_at else None,
                "detail": f"{card_count} cards",
            })

        weak_areas = db.query(models.UserWeakArea).filter(
            models.UserWeakArea.user_id == user.id,
        ).order_by(models.UserWeakArea.last_updated.desc()).limit(30).all()
        for wa in weak_areas:
            activities.append({
                "type": "quiz",
                "topic": wa.topic,
                "ts": (wa.last_updated or wa.first_identified).isoformat() if (wa.last_updated or wa.first_identified) else None,
                "detail": f"{round(wa.accuracy or 0)}% accuracy · score {round(wa.weakness_score or 0)}",
                "weakness_score": wa.weakness_score or 0,
                "status": wa.status or "needs_practice",
            })

        activities.sort(key=lambda x: x.get("ts") or "", reverse=True)

        return {"status": "success", "activities": activities[:60]}

    except Exception as e:
        logger.error(f"Error getting activity feed: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/study_insights/topic_suggestions")
async def get_topic_suggestions(
    user_id: str = Query(...),
    topic: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        from services.comprehensive_weakness_analyzer import generate_topic_suggestions
        import json as _json

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        result = generate_topic_suggestions(db, user.id, topic, models, unified_ai)

        # Replace generic tips with AI-generated topic-specific ones
        try:
            stats = result.get("stats", {})
            accuracy = stats.get("accuracy", 0)
            attempts = stats.get("attempts", 0)
            wrong = stats.get("wrong", 0)
            ai_prompt = f"""You are an expert study coach. A student is struggling specifically with: "{topic}".

Their performance data:
- Accuracy: {accuracy:.0f}%
- Total attempts: {attempts}
- Wrong answers: {wrong}

Generate 3 highly specific study recommendations and 3 concise study tips for mastering "{topic}" specifically.
Do NOT give generic advice like "use spaced repetition" or "break into subtopics."
Instead, focus on the actual content, common pitfalls, and mental models specific to "{topic}".

Return ONLY valid JSON, no markdown:
{{"suggestions":[{{"title":"...","description":"...","priority":"high"}},{{"title":"...","description":"...","priority":"medium"}},{{"title":"...","description":"...","priority":"low"}}],"study_tips":["...","...","..."]}}"""

            raw = await run_in_threadpool(unified_ai.generate, ai_prompt, 800, 0.7)
            text = raw.strip()
            start = text.find("{")
            end = text.rfind("}") + 1
            if start != -1 and end > start:
                parsed = _json.loads(text[start:end])
                if parsed.get("suggestions"):
                    result["suggestions"] = parsed["suggestions"]
                if parsed.get("study_tips"):
                    result["study_tips"] = parsed["study_tips"]
        except Exception as _ai_err:
            logger.warning(f"AI tips generation failed, using fallback: {_ai_err}")

        return result

    except Exception as e:
        logger.error(f"Error generating topic suggestions: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/study_insights/similar_questions")
async def get_similar_questions(
    user_id: str = Query(...),
    topic: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        from services.comprehensive_weakness_analyzer import find_similar_questions

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        result = find_similar_questions(db, user.id, topic, models)
        return result

    except Exception as e:
        logger.error(f"Error finding similar questions: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/study_insights/recommendations")
async def get_study_recommendations(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        from study_session_analyzer import get_study_session_analyzer

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        analyzer = get_study_session_analyzer(db, user.id, unified_ai)
        summary = analyzer.generate_session_summary()

        return {
            "status": "success",
            "recommendations": summary.get("recommendations", [])
        }
    except Exception as e:
        logger.error(f"Error getting study recommendations: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/study_insights/debug_session")
async def debug_session_tracking(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        now = datetime.now(timezone.utc)

        last_login = user.last_login
        session_start = last_login if last_login else (now - timedelta(hours=4))

        messages_count = db.query(models.ChatMessage).join(
            models.ChatSession
        ).filter(
            models.ChatSession.user_id == user.id,
            models.ChatMessage.timestamp >= session_start
        ).count()

        total_messages = db.query(models.ChatMessage).join(
            models.ChatSession
        ).filter(
            models.ChatSession.user_id == user.id
        ).count()

        recent_messages = db.query(models.ChatMessage).join(
            models.ChatSession
        ).filter(
            models.ChatSession.user_id == user.id
        ).order_by(models.ChatMessage.timestamp.desc()).limit(5).all()

        recent_list = []
        for msg in recent_messages:
            recent_list.append({
                "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
                "user_message": msg.user_message[:100] if msg.user_message else None,
                "in_session": msg.timestamp >= session_start if msg.timestamp else False
            })

        return {
            "status": "success",
            "debug_info": {
                "user_id": user.id,
                "username": user.username,
                "last_login": last_login.isoformat() if last_login else None,
                "session_start": session_start.isoformat(),
                "current_time": now.isoformat(),
                "messages_in_session": messages_count,
                "total_messages": total_messages,
                "recent_messages": recent_list
            }
        }
    except Exception as e:
        logger.error(f"Error in debug session: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/study_insights/reset_stats")
async def reset_user_stats(
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    try:
        user_id = payload.get("user_id")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        sessions = db.query(models.ChatSession).filter(models.ChatSession.user_id == user.id).all()
        for session in sessions:
            db.query(models.ChatMessage).filter(models.ChatMessage.chat_session_id == session.id).delete()
        db.query(models.ChatSession).filter(models.ChatSession.user_id == user.id).delete()

        db.query(models.TopicMastery).filter(models.TopicMastery.user_id == user.id).delete()

        db.query(models.FlashcardStudySession).filter(models.FlashcardStudySession.user_id == user.id).delete()

        user.last_login = None

        db.commit()

        return {
            "status": "success",
            "message": "All stats reset. Please log out and log back in."
        }
    except Exception as e:
        logger.error(f"Error resetting stats: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/study_insights/generate_content")
async def generate_study_content(
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    try:
        user_id = payload.get("user_id")
        content_type = payload.get("content_type")
        topic = payload.get("topic")
        count = payload.get("count", 5)
        context = payload.get("context", "")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        context_str = ""
        if context:
            context_str = f"\n\nThe student was working on problems like: {context}\nGenerate similar problems at the same level."

        if content_type == "flashcards":
            prompt = f"""Generate {count} flashcards for studying "{topic}".{context_str}

Return as JSON array with this format:
[
  {{"question": "...", "answer": "...", "difficulty": "easy|medium|hard"}},
  ...
]

Make the flashcards:
- SPECIFIC to {topic} (not generic)
- Include actual formulas, equations, or specific examples
- Progressive in difficulty
- Test understanding, not just memorization
Return ONLY the JSON array, no other text."""

            response = call_ai(prompt, max_tokens=1500, temperature=0.7)

            try:
                response = response.strip()
                if response.startswith("```"):
                    response = response.split("```")[1]
                    if response.startswith("json"):
                        response = response[4:]
                flashcards = json.loads(response)
            except Exception:
                flashcards = []

            return {
                "status": "success",
                "content_type": "flashcards",
                "topic": topic,
                "content": flashcards
            }

        elif content_type == "quiz":
            prompt = f"""Generate {count} multiple choice quiz questions about "{topic}".{context_str}

Return as JSON array with this format:
[
  {{
    "question": "...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct_answer": "A",
    "explanation": "..."
  }},
  ...
]

Make questions:
- SPECIFIC to {topic} (include actual problems/calculations if math-related)
- Test understanding, not just memorization
- Include step-by-step explanations
Return ONLY the JSON array, no other text."""

            response = call_ai(prompt, max_tokens=2000, temperature=0.7)

            try:
                response = response.strip()
                if response.startswith("```"):
                    response = response.split("```")[1]
                    if response.startswith("json"):
                        response = response[4:]
                questions = json.loads(response)
            except Exception:
                questions = []

            return {
                "status": "success",
                "content_type": "quiz",
                "topic": topic,
                "content": questions
            }

        elif content_type == "notes":
            prompt = f"""Create comprehensive study notes about "{topic}".

Include:
1. Key concepts and definitions
2. Important formulas or rules (if applicable)
3. Examples
4. Common mistakes to avoid
5. Summary points

Format with clear headings and bullet points.
Make it suitable for exam preparation."""

            response = call_ai(prompt, max_tokens=2000, temperature=0.7)

            return {
                "status": "success",
                "content_type": "notes",
                "topic": topic,
                "content": response
            }

        else:
            raise HTTPException(status_code=400, detail="Invalid content_type")

    except Exception as e:
        logger.error(f"Error generating study content: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/study_insights/welcome_notification")
async def get_welcome_notification(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        from study_session_analyzer import get_study_session_analyzer

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        analyzer = get_study_session_analyzer(db, user.id, unified_ai)

        ai_summary = await analyzer.generate_ai_summary()

        summary = analyzer.generate_session_summary()

        has_recent_activity = summary.get("summary", {}).get("total_activities", 0) > 0

        user_name = user.first_name or user.username.split('@')[0]

        return {
            "status": "success",
            "notification": {
                "title": "Welcome Back!" if has_recent_activity else "Welcome!",
                "message": ai_summary,
                "has_insights": has_recent_activity,
                "user_name": user_name,
                "quick_stats": {
                    "chat_messages": summary.get("summary", {}).get("chat_messages", 0),
                    "flashcards_studied": summary.get("summary", {}).get("flashcards_studied", 0),
                    "quiz_questions": summary.get("summary", {}).get("quiz_questions", 0),
                    "overall_accuracy": summary.get("summary", {}).get("overall_accuracy", 0)
                },
                "top_weakness": summary.get("weaknesses", [{}])[0] if summary.get("weaknesses") else None,
                "top_recommendation": summary.get("recommendations", [{}])[0] if summary.get("recommendations") else None
            }
        }
    except Exception as e:
        logger.error(f"Error getting welcome notification: {str(e)}")
        return {
            "status": "success",
            "notification": {
                "title": "Welcome Back!",
                "message": "Ready to continue learning?",
                "has_insights": False
            }
        }

@router.get("/get_ml_analytics")
def get_ml_analytics(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        bkt_states = db.query(models.StudentKnowledgeState).filter_by(user_id=user.id).all()
        bkt_concepts_tracked = len(bkt_states)
        bkt_total_updates = sum(state.interaction_count for state in bkt_states)
        bkt_avg_mastery = sum(state.p_mastery for state in bkt_states) / len(bkt_states) if bkt_states else 0
        
        top_mastery_concepts = sorted(
            [
                {
                    "name": state.concept_name or state.concept_id,
                    "mastery": state.p_mastery,
                    "interaction_count": state.interaction_count,
                    "last_updated": state.last_updated.isoformat() if state.last_updated else None
                }
                for state in bkt_states
            ],
            key=lambda x: x["mastery"],
            reverse=True
        )[:10]

        profile = db.query(models.ComprehensiveUserProfile).filter_by(user_id=user.id).first()
        archetype = profile.primary_archetype if profile else "default"
        
        archetype_p_learn = {"Logicor": 0.12, "Kinetiq": 0.08, "Flowist": 0.10}
        bkt_p_learn = archetype_p_learn.get(archetype, 0.09)

        rl_episodes = db.query(models.BanditEpisodeLog).filter_by(student_id=str(user.id)).all()
        rl_total_episodes = len(rl_episodes)
        
        exploration_count = sum(1 for ep in rl_episodes if ep.exploration_flag)
        rl_exploration_rate = f"{(exploration_count / rl_total_episodes * 100):.1f}%" if rl_total_episodes > 0 else "0%"
        
        strategy_stats = {}
        for episode in rl_episodes:
            strategy_id = episode.strategy_selected
            if strategy_id not in strategy_stats:
                strategy_stats[strategy_id] = {
                    "name": strategy_id,
                    "use_count": 0,
                    "total_reward": 0,
                    "rewards": []
                }
            strategy_stats[strategy_id]["use_count"] += 1
            if episode.reward_received is not None:
                strategy_stats[strategy_id]["total_reward"] += episode.reward_received
                strategy_stats[strategy_id]["rewards"].append(episode.reward_received)
        
        strategy_performance = []
        for strategy_id, stats in strategy_stats.items():
            avg_reward = stats["total_reward"] / stats["use_count"] if stats["use_count"] > 0 else 0
            success_rate = sum(1 for r in stats["rewards"] if r > 0) / len(stats["rewards"]) * 100 if stats["rewards"] else 0
            confidence = len(stats["rewards"]) / max(rl_total_episodes, 1)
            
            strategy_performance.append({
                "name": strategy_id,
                "use_count": stats["use_count"],
                "avg_reward": avg_reward,
                "success_rate": round(success_rate, 1),
                "confidence": confidence
            })
        
        strategy_performance.sort(key=lambda x: x["avg_reward"], reverse=True)
        rl_best_strategy = strategy_performance[0]["name"] if strategy_performance else "N/A"

        ml_logs = db.query(models.MessageMLLog).filter_by(user_id=user.id).order_by(
            models.MessageMLLog.timestamp.desc()
        ).limit(100).all()
        
        total_ml_logs = len(ml_logs)
        frustration_trend = [log.frustration_score for log in ml_logs[:10]]
        engagement_trend = [log.engagement_score for log in ml_logs[:10]]
        
        cognitive_state_distribution = {}
        for log in ml_logs:
            state = log.cognitive_state or "unknown"
            cognitive_state_distribution[state] = cognitive_state_distribution.get(state, 0) + 1

        recent_updates = []
        for log in ml_logs[:20]:
            if log.kt_delta:
                for concept_id, delta_info in log.kt_delta.items():
                    if isinstance(delta_info, dict):
                        before = delta_info.get("before", 0)
                        after = delta_info.get("after", 0)
                        impact = after - before
                    else:
                        impact = 0
                    
                    recent_updates.append({
                        "timestamp": log.timestamp.isoformat(),
                        "update_type": "BKT Update",
                        "description": f"Concept: {concept_id[:30]}",
                        "impact": impact
                    })
        
        recent_updates = recent_updates[:15]

        return {
            "bkt_concepts_tracked": bkt_concepts_tracked,
            "bkt_total_updates": bkt_total_updates,
            "bkt_avg_mastery": f"{bkt_avg_mastery * 100:.0f}%",
            "bkt_p_learn": bkt_p_learn,
            "bkt_p_slip": 0.10,
            "bkt_p_guess": 0.20,
            "top_mastery_concepts": top_mastery_concepts,
            "rl_total_episodes": rl_total_episodes,
            "rl_exploration_rate": rl_exploration_rate,
            "rl_best_strategy": rl_best_strategy,
            "strategy_performance": strategy_performance,
            "total_ml_logs": total_ml_logs,
            "frustration_trend": frustration_trend,
            "engagement_trend": engagement_trend,
            "cognitive_state_distribution": cognitive_state_distribution,
            "recent_updates": recent_updates
        }

    except Exception as e:
        logger.error(f"Error getting ML analytics: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_chat_details")
def get_chat_details(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        total_chats = db.query(func.count(models.ChatSession.id)).filter_by(user_id=user.id).scalar() or 0

        sessions = db.query(models.ChatSession).filter_by(user_id=user.id).all()
        session_ids = [session.id for session in sessions]

        per_session_stats = {}
        if session_ids:
            per_session_stats = {
                row.chat_session_id: row
                for row in db.query(
                    models.ChatMessage.chat_session_id.label("chat_session_id"),
                    func.count(models.ChatMessage.id).label("message_count"),
                    func.min(models.ChatMessage.timestamp).label("first_ts"),
                    func.max(models.ChatMessage.timestamp).label("last_ts"),
                ).filter(
                    models.ChatMessage.chat_session_id.in_(session_ids)
                ).group_by(models.ChatMessage.chat_session_id).all()
            }

        total_messages = sum(row.message_count for row in per_session_stats.values())
        avg_messages_per_chat = round(total_messages / total_chats, 1) if total_chats > 0 else 0

        chat_days = {}
        for session in sessions:
            if session.created_at:
                day = session.created_at.strftime("%A")
                chat_days[day] = chat_days.get(day, 0) + 1

        most_active_day = max(chat_days.items(), key=lambda x: x[1])[0] if chat_days else "N/A"

        ml_logs = db.query(models.MessageMLLog).filter_by(user_id=user.id).all()
        intent_breakdown = {}
        for log in ml_logs:
            intent = log.intent_class or "unknown"
            intent_breakdown[intent] = intent_breakdown.get(intent, 0) + 1

        concept_counts = {}
        for log in ml_logs:
            if log.concept_ids:
                for concept_id in log.concept_ids:
                    concept_counts[concept_id] = concept_counts.get(concept_id, 0) + 1

        top_concepts = [
            {"name": concept_id, "count": count}
            for concept_id, count in sorted(concept_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        ]

        session_durations = []
        for row in per_session_stats.values():
            if row.message_count >= 2 and row.first_ts and row.last_ts:
                duration = (row.last_ts - row.first_ts).total_seconds() / 60
                session_durations.append(duration)

        avg_session_length = f"{int(sum(session_durations) / len(session_durations))}m" if session_durations else "0m"

        return {
            "total_chats": total_chats,
            "avg_session_length": avg_session_length,
            "most_active_day": most_active_day,
            "avg_messages_per_chat": avg_messages_per_chat,
            "intent_breakdown": intent_breakdown,
            "top_concepts": top_concepts
        }

    except Exception as e:
        logger.error(f"Error getting chat details: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_flashcard_details")
def get_flashcard_details(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        flashcards = db.query(models.Flashcard).join(
            models.FlashcardSet,
            models.Flashcard.set_id == models.FlashcardSet.id
        ).filter(
            models.FlashcardSet.user_id == user.id
        ).all()

        total_reviews = sum(max(card.times_reviewed or 0, 0) for card in flashcards)
        correct_reviews = sum(
            min(max(card.correct_count or 0, 0), max(card.times_reviewed or 0, 0))
            for card in flashcards
        )

        accuracy_rate = f"{(correct_reviews / total_reviews * 100):.1f}%" if total_reviews > 0 else "0%"

        study_days = set()
        for card in flashcards:
            if card.last_reviewed:
                study_days.add(card.last_reviewed.date())
        
        study_streak = 0
        current_date = datetime.now(timezone.utc).date()
        while current_date in study_days:
            study_streak += 1
            current_date -= timedelta(days=1)
        
        mastered_cards = 0
        for card in flashcards:
            reviews = max(card.times_reviewed or 0, 0)
            if reviews < 5:
                continue
            accuracy = (max(card.correct_count or 0, 0) / reviews) if reviews else 0
            if accuracy >= 0.8:
                mastered_cards += 1

        reviewed_cards = [card for card in flashcards if (card.times_reviewed or 0) > 0]
        avg_retention = (
            sum(
                (max(card.correct_count or 0, 0) / max(card.times_reviewed or 1, 1))
                for card in reviewed_cards
            ) / len(reviewed_cards)
        ) if reviewed_cards else 0
        avg_retention = f"{avg_retention * 100:.1f}%"
        
        today = datetime.now(timezone.utc)
        cards_due_today = sum(
            1 for card in flashcards
            if card.next_review_date is not None and card.next_review_date <= today
        )
        
        review_hours = {}
        for card in flashcards:
            if card.last_reviewed:
                hour = card.last_reviewed.hour
                review_hours[hour] = review_hours.get(hour, 0) + 1
        
        optimal_hour = max(review_hours.items(), key=lambda x: x[1])[0] if review_hours else None
        optimal_review_time = f"{optimal_hour}:00" if optimal_hour is not None else "N/A"
        
        difficulty_distribution = {
            "easy": 0,
            "medium": 0,
            "hard": 0
        }
        
        for card in flashcards:
            difficulty_raw = str(card.difficulty or "").strip().lower()
            if difficulty_raw in {"easy", "beginner"}:
                difficulty_distribution["easy"] += 1
            elif difficulty_raw in {"hard", "advanced"}:
                difficulty_distribution["hard"] += 1
            elif difficulty_raw:
                try:
                    numeric = float(difficulty_raw)
                    if numeric < 5:
                        difficulty_distribution["easy"] += 1
                    elif numeric < 7:
                        difficulty_distribution["medium"] += 1
                    else:
                        difficulty_distribution["hard"] += 1
                except ValueError:
                    difficulty_distribution["medium"] += 1
            else:
                difficulty_distribution["medium"] += 1

        return {
            "total_reviews": total_reviews,
            "accuracy_rate": accuracy_rate,
            "study_streak": study_streak,
            "mastered_cards": mastered_cards,
            "avg_retention": avg_retention,
            "cards_due_today": cards_due_today,
            "optimal_review_time": optimal_review_time,
            "difficulty_distribution": difficulty_distribution
        }

    except Exception as e:
        logger.error(f"Error getting flashcard details: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_context_sessions")
def get_context_sessions(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        sessions = db.query(models.CerbylSessionState).filter_by(user_id=user.id).order_by(
            models.CerbylSessionState.last_message_at.desc()
        ).limit(20).all()

        session_data = []
        for session in sessions:
            session_data.append({
                "session_id": session.session_id,
                "started_at": session.started_at.isoformat() if session.started_at else None,
                "last_message_at": session.last_message_at.isoformat() if session.last_message_at else None,
                "message_count": session.message_count,
                "current_concept_id": session.current_concept_id,
                "frustration_trend": session.frustration_trend or [],
                "engagement_trend": session.engagement_trend or [],
                "session_brief": session.session_brief,
                "messages_on_concept": session.messages_on_concept or {}
            })

        return {"sessions": session_data}

    except Exception as e:
        logger.error(f"Error getting context sessions: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")
