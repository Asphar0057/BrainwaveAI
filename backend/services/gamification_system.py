from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)
import models
from models import PointTransaction

POINT_VALUES = {
    "ai_chat": 1,
    "note_created": 20,
    "flashcard_set": 10,
    "flashcard_created": 10,
    "quiz_high_score": 30,
    "quiz_completed": 15,
    "study_hour": 50,
    "question_answered": 2,
    "battle_win": 10,
    "battle_draw": 5,
    "battle_loss": 2,
    "flashcard_reviewed": 1,
    "flashcard_mastered": 5,
    "learning_path_node": 0,
}

MILESTONE_COUNTS = {
    "ai_chat": [10, 50, 100, 250, 500],
    "note_created": [1, 5, 10, 25, 50, 100],
    "flashcard_created": [1, 5, 10, 25, 50, 100],
    "question_answered": [10, 50, 100, 250, 500, 1000],
    "quiz_completed": [1, 5, 10, 25, 50],
    "solo_quiz": [1, 5, 10, 25],
    "flashcard_reviewed": [25, 50, 100, 250, 500],
    "flashcard_mastered": [5, 10, 25, 50, 100],
}

STUDY_TIME_MILESTONES_MINUTES = [30, 60, 120, 300, 600, 1200]

def _add_notification(db: Session, user_id: int, title: str, message: str, notification_type: str):
    notification = models.Notification(
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type
    )
    db.add(notification)

def _format_minutes(total_minutes: int) -> str:
    if total_minutes < 60:
        return f"{total_minutes} minutes"
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if minutes == 0:
        return f"{hours} hour{'s' if hours != 1 else ''}"
    return f"{hours}h {minutes}m"

DIFFICULTY_MULTIPLIERS = {
    "easy": 0.5,
    "intermediate": 0.75,
    "hard": 1.0
}

QUESTION_COUNT_MULTIPLIERS = {
    5: 0.5,
    10: 0.75,
    15: 0.9,
    20: 1.0
}

def calculate_solo_quiz_points(difficulty: str, question_count: int, score_percentage: float) -> dict:
    base_points = 40
    
    diff_mult = DIFFICULTY_MULTIPLIERS.get(difficulty.lower(), 0.75)
    
    q_mult = 0.5
    for q_count, mult in sorted(QUESTION_COUNT_MULTIPLIERS.items()):
        if question_count >= q_count:
            q_mult = mult
    
    score_mult = score_percentage / 100.0
    
    points = int(base_points * diff_mult * q_mult * score_mult)
    
    bonus = 0
    bonus_reasons = []
    
    if score_percentage == 100:
        bonus += 5
        bonus_reasons.append("Perfect Score (+5)")
    
    elif score_percentage >= 90:
        bonus += 3
        bonus_reasons.append("Excellent Score (+3)")
    
    if difficulty.lower() == "hard" and score_percentage >= 70:
        bonus += 2
        bonus_reasons.append("Hard Mode Bonus (+2)")
    
    total_points = points + bonus
    
    return {
        "points_earned": total_points,
        "base_points": points,
        "bonus_points": bonus,
        "bonus_reasons": bonus_reasons,
        "breakdown": {
            "difficulty": difficulty,
            "difficulty_multiplier": diff_mult,
            "question_count": question_count,
            "question_multiplier": q_mult,
            "score_percentage": score_percentage,
            "score_multiplier": score_mult
        }
    }

LEVEL_THRESHOLDS = [0, 100, 282, 500, 800, 1200, 1700, 2300, 3000]

def get_week_start(tz_name: str = None):
    """Monday of the current week, in the given local timezone. Mirrors
    _today_local's day-boundary logic for streaks: comparing against a raw
    UTC date meant users west of UTC (most of the Americas) rolled into the
    "new week" several hours before their local Monday, silently zeroing
    weekly stats on Sunday afternoon/evening."""
    today = _today_local(tz_name) if tz_name else datetime.now(timezone.utc).date()
    return today - timedelta(days=today.weekday())

def calculate_level_from_xp(xp: int) -> int:
    for level, threshold in enumerate(LEVEL_THRESHOLDS):
        if xp < threshold:
            return max(1, level)
    return len(LEVEL_THRESHOLDS) + int((xp - LEVEL_THRESHOLDS[-1]) / 1000)

def get_xp_for_level(level: int) -> int:
    if level < len(LEVEL_THRESHOLDS):
        return LEVEL_THRESHOLDS[level]
    else:
        return LEVEL_THRESHOLDS[-1] + ((level - len(LEVEL_THRESHOLDS) + 1) * 1000)

def get_or_create_stats(db: Session, user_id: int):
    stats = db.query(models.UserGamificationStats).filter(
        models.UserGamificationStats.user_id == user_id
    ).first()
    
    if not stats:
        stats = models.UserGamificationStats(
            user_id=user_id,
            week_start_date=datetime.combine(get_week_start(), datetime.min.time()).replace(tzinfo=timezone.utc)
        )
        db.add(stats)
        db.flush()
    
    return stats

def _normalize_datetime(value):
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value

def _ensure_powerup_baseline(stats):
    if getattr(stats, 'powerups_initialized', False):
        return

    earned_freezes = min(3, max(0, int((stats.longest_streak or 0) / 7)))
    earned_revives = 1 if (stats.longest_streak or 0) > 0 else 0
    stats.freeze_charges = max(getattr(stats, 'freeze_charges', 0) or 0, earned_freezes)
    stats.revive_charges = max(getattr(stats, 'revive_charges', 0) or 0, earned_revives)
    stats.powerups_initialized = True

def _completed_weekly_quest_count(stats):
    lanes = [
        ((stats.weekly_ai_chats or 0), max(1, getattr(stats, 'weekly_chat_goal', 10) or 10)),
        ((stats.weekly_notes_created or 0), max(1, getattr(stats, 'weekly_note_goal', 5) or 5)),
        ((stats.weekly_flashcards_created or 0), max(1, getattr(stats, 'weekly_flashcard_goal', 20) or 20)),
        ((stats.weekly_quizzes_completed or 0), max(1, getattr(stats, 'weekly_quiz_goal', 5) or 5)),
    ]
    return sum(1 for current, goal in lanes if current >= goal)

def _mastered_vault_count(stats):
    xp = stats.total_points or 0
    return sum(1 for threshold in (250, 1700) if xp >= threshold)

def _active_boost_payload(stats):
    boost_until = _normalize_datetime(getattr(stats, 'xp_boost_until', None))
    if boost_until and boost_until > datetime.now(timezone.utc):
        return {
            "active": True,
            "until": boost_until.isoformat(),
            "multiplier": float(getattr(stats, 'xp_boost_multiplier', 1.0) or 1.0),
        }
    return {
        "active": False,
        "until": None,
        "multiplier": 1.0,
    }

DEFAULT_STREAK_TZ = "UTC"


def _resolve_timezone(tz_name):
    try:
        return ZoneInfo(tz_name) if tz_name else ZoneInfo(DEFAULT_STREAK_TZ)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return ZoneInfo(DEFAULT_STREAK_TZ)


def _today_local(tz_name):
    return datetime.now(_resolve_timezone(tz_name)).date()


def _local_date(value, tz_name):
    """Convert a stored (assumed-UTC) datetime to a date in the user's own
    timezone. Streaks are a "did you show up today" concept in the user's
    local day, not the server's UTC day — comparing raw UTC dates meant
    activity anywhere but near UTC midnight could land on the wrong day and
    silently break a real daily streak."""
    if value is None:
        return None
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(_resolve_timezone(tz_name)).date()


def _expire_stale_streak(stats):
    if not stats.last_activity_date:
        return
    tz_name = getattr(stats, 'timezone_name', None) or DEFAULT_STREAK_TZ
    today = _today_local(tz_name)
    last_date = _local_date(stats.last_activity_date, tz_name)
    if last_date and last_date < today - timedelta(days=1):
        stats.current_streak = 0


def _apply_daily_streak(db: Session, stats, user_id: int, tz_name: str = None):
    """Update current/longest streak for "activity happened today" in the
    user's local timezone. Shared by award_points (any XP-earning action)
    and record_daily_check_in (just opening the app), so simply logging in
    counts toward the streak instead of requiring a specific graded action.
    """
    if tz_name:
        stats.timezone_name = tz_name
    active_tz = getattr(stats, 'timezone_name', None) or DEFAULT_STREAK_TZ

    today = _today_local(active_tz)
    old_streak = stats.current_streak
    last_date = _local_date(stats.last_activity_date, active_tz)
    streak_milestone_reached = False

    if last_date == today:
        # Already checked in today. Self-heal a bad prior state (e.g. a stale
        # last_activity_date left at "today" by _expire_stale_streak zeroing
        # current_streak without clearing the date) instead of leaving the
        # streak stuck at 0 for the rest of the day.
        if (stats.current_streak or 0) < 1:
            stats.current_streak = 1
            if stats.current_streak > stats.longest_streak:
                stats.longest_streak = stats.current_streak
    elif last_date == today - timedelta(days=1):
        stats.current_streak += 1
        if stats.current_streak > stats.longest_streak:
            stats.longest_streak = stats.current_streak
        if stats.current_streak in [7, 14, 30, 60, 100]:
            streak_milestone_reached = True
        if stats.current_streak % 7 == 0 and hasattr(stats, 'freeze_charges'):
            stats.freeze_charges = min(3, (stats.freeze_charges or 0) + 1)
    else:
        if last_date is not None and old_streak >= 7:
            _add_notification(
                db,
                user_id,
                "Streak Broken",
                f"Your {old_streak}-day streak has ended. Start a new one today!",
                "streak_broken"
            )
        stats.current_streak = 1

    stats.last_activity_date = datetime.now(timezone.utc)

    if streak_milestone_reached:
        _add_notification(
            db,
            user_id,
            f"{stats.current_streak}-Day Streak!",
            f"Incredible! You've maintained a {stats.current_streak}-day learning streak. Keep it going!",
            "streak_milestone"
        )

    return stats.current_streak


def record_daily_check_in(db: Session, user_id: int, tz_name: str = None):
    """Count today's visit toward the streak even when the user doesn't do
    anything that earns XP — just opening the app should keep a streak alive."""
    user_exists = db.query(models.User.id).filter(models.User.id == user_id).first()
    if not user_exists:
        return None

    stats = get_or_create_stats(db, user_id)
    _ensure_powerup_baseline(stats)
    check_and_reset_weekly_stats(stats)

    streak = _apply_daily_streak(db, stats, user_id, tz_name=tz_name)
    db.commit()
    return streak

def check_and_reset_weekly_stats(stats):
    tz_name = getattr(stats, 'timezone_name', None) or DEFAULT_STREAK_TZ
    week_start = get_week_start(tz_name)
    if stats.week_start_date is None:
        needs_reset = True
    elif hasattr(stats.week_start_date, 'date'):
        needs_reset = stats.week_start_date.date() < week_start
    else:
        needs_reset = stats.week_start_date < week_start
    
    if needs_reset:
        logger.info(f" WEEKLY RESET: Resetting weekly stats for user {stats.user_id}")
        logger.info(f"   Previous week start: {stats.week_start_date}")
        logger.info(f"   New week start: {week_start}")
        logger.info(f"   Previous weekly_points: {stats.weekly_points}")
        stats.weekly_points = 0
        stats.weekly_ai_chats = 0
        stats.weekly_notes_created = 0
        stats.weekly_questions_answered = 0
        stats.weekly_quizzes_completed = 0
        stats.weekly_flashcards_created = 0
        stats.weekly_study_minutes = 0
        stats.weekly_battles_won = 0
        if hasattr(stats, 'weekly_solo_quizzes'):
            stats.weekly_solo_quizzes = 0
        if hasattr(stats, 'weekly_flashcards_reviewed'):
            stats.weekly_flashcards_reviewed = 0
        if hasattr(stats, 'weekly_flashcards_mastered'):
            stats.weekly_flashcards_mastered = 0
        if hasattr(stats, 'xp_boost_uses'):
            stats.xp_boost_uses = 0
        stats.week_start_date = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=timezone.utc)
        logger.info(f"    Weekly stats reset complete")
    else:
        logger.debug(f" Weekly stats current for user {stats.user_id} (week_start: {stats.week_start_date}, current_week: {week_start})")

def award_points(db: Session, user_id: int, activity_type: str, metadata: dict = None):
    if metadata is None:
        metadata = {}

    user_exists = db.query(models.User.id).filter(models.User.id == user_id).first()
    if not user_exists:
        logger.warning("Skipping gamification award for missing user FK: user_id=%s activity=%s", user_id, activity_type)
        return {
            "points_earned": 0,
            "total_points": 0,
            "level": 1,
            "experience": 0,
            "description": "Missing user (skipped)",
        }
    
    stats = get_or_create_stats(db, user_id)
    _ensure_powerup_baseline(stats)
    check_and_reset_weekly_stats(stats)
    
    from datetime import datetime, timedelta, timezone
    duplicate_types = [activity_type]
    if activity_type in ("flashcard_set", "flashcard_created"):
        duplicate_types = ["flashcard_set", "flashcard_created"]
    recent_transaction = db.query(PointTransaction).filter(
        PointTransaction.user_id == user_id,
        PointTransaction.activity_type.in_(duplicate_types),
        PointTransaction.created_at >= datetime.now(timezone.utc) - timedelta(seconds=2)
    ).first()
    
    if recent_transaction:
        logger.info(f"  Duplicate {activity_type} detected within 2 seconds - skipping")
        return {
            "points_earned": 0,
            "total_points": stats.total_points,
            "level": stats.level,
            "experience": stats.experience,
            "description": f"Duplicate {activity_type} (skipped)"
        }
    
    points_earned = 0
    description = ""
    
    if activity_type == "ai_chat":
        points_earned = POINT_VALUES["ai_chat"]
        stats.total_ai_chats += 1
        stats.weekly_ai_chats += 1
        description = "AI Chat Message"
        if stats.total_ai_chats in MILESTONE_COUNTS["ai_chat"]:
            _add_notification(
                db,
                user_id,
                "AI Chat Milestone",
                f"You've sent {stats.total_ai_chats} messages to your AI tutor. Keep the conversation going!",
                "ai_chat_milestone"
            )
        
    elif activity_type == "note_created":
        points_earned = POINT_VALUES["note_created"]
        stats.total_notes_created += 1
        stats.weekly_notes_created += 1
        description = "Created Note"
        if stats.total_notes_created in MILESTONE_COUNTS["note_created"]:
            _add_notification(
                db,
                user_id,
                "Notes Milestone",
                f"You've created {stats.total_notes_created} notes. Great job capturing insights!",
                "notes_milestone"
            )
        
    elif activity_type == "question_answered":
        try:
            question_count = int(metadata.get("count", 1))
        except (TypeError, ValueError):
            question_count = 1
        question_count = max(1, question_count)

        prev_total = stats.total_questions_answered
        stats.total_questions_answered += question_count
        stats.weekly_questions_answered += question_count
        points_earned = POINT_VALUES["question_answered"] * question_count
        description = "Answered Question" if question_count == 1 else f"Answered {question_count} Questions"

        for threshold in MILESTONE_COUNTS["question_answered"]:
            if prev_total < threshold <= stats.total_questions_answered:
                _add_notification(
                    db,
                    user_id,
                    "Practice Milestone",
                    f"You've answered {threshold} questions. Keep sharpening your skills!",
                    "questions_milestone"
                )
        
    elif activity_type in ("flashcard_set", "flashcard_created"):
        points_earned = POINT_VALUES["flashcard_set"]
        stats.total_flashcards_created += 1
        stats.weekly_flashcards_created += 1
        description = "Created Flashcard Set"
        if stats.total_flashcards_created in MILESTONE_COUNTS["flashcard_created"]:
            _add_notification(
                db,
                user_id,
                "Flashcards Milestone",
                f"You've created {stats.total_flashcards_created} flashcard sets. Keep building your memory bank!",
                "flashcards_milestone"
            )
        
    elif activity_type == "quiz_completed":
        raw_score = metadata.get("score_percentage")
        has_score = raw_score is not None
        try:
            score_percentage = float(raw_score) if has_score else 0
        except (TypeError, ValueError):
            score_percentage = 0
            has_score = False
        if score_percentage >= 80:
            points_earned = POINT_VALUES["quiz_high_score"]
            description = f"Completed Quiz with {score_percentage}% (High Score Bonus!)"
        else:
            points_earned = POINT_VALUES["quiz_completed"]
            description = f"Completed Quiz with {score_percentage}%" if has_score else "Completed Quiz"
        stats.total_quizzes_completed += 1
        stats.weekly_quizzes_completed += 1

        if has_score:
            if score_percentage >= 90:
                _add_notification(
                    db,
                    user_id,
                    "Excellent Work!",
                    f"Amazing! You scored {score_percentage}% on a quiz. Keep it up!",
                    "quiz_excellent"
                )
            elif score_percentage < 50:
                _add_notification(
                    db,
                    user_id,
                    "Quiz Performance Alert",
                    f"Your recent quiz score was {score_percentage}%. Review the material and try again to improve!",
                    "quiz_poor_performance"
                )
            else:
                _add_notification(
                    db,
                    user_id,
                    "Quiz Completed",
                    f"You completed a quiz with {score_percentage}%. Nice work!",
                    "quiz_completed"
                )

        if stats.total_quizzes_completed in MILESTONE_COUNTS["quiz_completed"]:
            _add_notification(
                db,
                user_id,
                "Quiz Milestone",
                f"You've completed {stats.total_quizzes_completed} quizzes. Keep testing your knowledge!",
                "quiz_milestone"
            )
        
    elif activity_type == "study_time":
        minutes = metadata.get("minutes", 0)
        hours = minutes / 60
        points_earned = int(hours * POINT_VALUES["study_hour"])
        prev_minutes = stats.total_study_minutes
        stats.total_study_minutes += minutes
        stats.weekly_study_minutes += minutes
        if minutes >= 60:
            description = f"Studied {int(hours)}h {minutes % 60}m (+{points_earned} pts)"
        else:
            description = f"Studied {minutes} minutes"

        for threshold in STUDY_TIME_MILESTONES_MINUTES:
            if prev_minutes < threshold <= stats.total_study_minutes:
                formatted = _format_minutes(threshold)
                _add_notification(
                    db,
                    user_id,
                    "Study Time Milestone",
                    f"You've studied for {formatted} in total. Keep it up!",
                    "study_time_milestone"
                )
        
    elif activity_type == "battle_win":
        points_earned = POINT_VALUES["battle_win"]
        stats.total_battles_won += 1
        stats.weekly_battles_won += 1
        description = "Won Battle"
        
    elif activity_type == "battle_draw":
        points_earned = POINT_VALUES["battle_draw"]
        description = "Drew Battle"
        
    elif activity_type == "battle_loss":
        points_earned = POINT_VALUES["battle_loss"]
        description = "Participated in Battle"
    
    elif activity_type == "learning_path_node":
        xp = metadata.get("xp", 50)
        points_earned = xp
        node_id = metadata.get("node_id", "unknown")
        description = f"Completed Learning Path Node (+{xp} XP)"
    
    elif activity_type == "solo_quiz":
        difficulty = metadata.get("difficulty", "intermediate")
        question_count = metadata.get("question_count", 10)
        try:
            score_percentage = float(metadata.get("score_percentage", 0))
        except (TypeError, ValueError):
            score_percentage = 0
        
        quiz_result = calculate_solo_quiz_points(difficulty, question_count, score_percentage)
        points_earned = quiz_result["points_earned"]
        
        if hasattr(stats, 'total_solo_quizzes'):
            stats.total_solo_quizzes += 1
        if hasattr(stats, 'weekly_solo_quizzes'):
            stats.weekly_solo_quizzes += 1
        
        stats.total_quizzes_completed += 1
        stats.weekly_quizzes_completed += 1
        
        bonus_str = f" ({', '.join(quiz_result['bonus_reasons'])})" if quiz_result['bonus_reasons'] else ""
        description = f"Solo Quiz: {difficulty.title()} {question_count}Q - {score_percentage}%{bonus_str}"

        if 50 <= score_percentage < 90:
            _add_notification(
                db,
                user_id,
                "Quiz Completed",
                f"You completed a solo quiz with {score_percentage}%. Keep practicing!",
                "quiz_completed"
            )

        if hasattr(stats, 'total_solo_quizzes') and stats.total_solo_quizzes in MILESTONE_COUNTS["solo_quiz"]:
            _add_notification(
                db,
                user_id,
                "Solo Quiz Milestone",
                f"You've completed {stats.total_solo_quizzes} solo quizzes. Nice work!",
                "quiz_milestone"
            )
    
    elif activity_type == "flashcard_reviewed":
        points_earned = POINT_VALUES["flashcard_reviewed"]
        if hasattr(stats, 'total_flashcards_reviewed'):
            stats.total_flashcards_reviewed += 1
        if hasattr(stats, 'weekly_flashcards_reviewed'):
            stats.weekly_flashcards_reviewed += 1
        description = "Reviewed Flashcard"
        if hasattr(stats, 'total_flashcards_reviewed') and stats.total_flashcards_reviewed in MILESTONE_COUNTS["flashcard_reviewed"]:
            _add_notification(
                db,
                user_id,
                "Flashcards Milestone",
                f"You've reviewed {stats.total_flashcards_reviewed} flashcards. Great consistency!",
                "flashcards_milestone"
            )
    
    elif activity_type == "flashcard_mastered":
        points_earned = POINT_VALUES["flashcard_mastered"]
        if hasattr(stats, 'total_flashcards_mastered'):
            stats.total_flashcards_mastered += 1
        if hasattr(stats, 'weekly_flashcards_mastered'):
            stats.weekly_flashcards_mastered += 1
        description = "Mastered Flashcard"
        if hasattr(stats, 'total_flashcards_mastered') and stats.total_flashcards_mastered in MILESTONE_COUNTS["flashcard_mastered"]:
            _add_notification(
                db,
                user_id,
                "Flashcard Mastery",
                f"You've mastered {stats.total_flashcards_mastered} flashcards. Impressive!",
                "flashcard_mastered"
            )
    
    boost = _active_boost_payload(stats)
    if boost["active"] and points_earned > 0:
        boosted_points = int(round(points_earned * boost["multiplier"]))
        points_earned = max(points_earned, boosted_points)
        description = f"{description} ({boost['multiplier']:g}x boost)"

    old_level = stats.level
    stats.total_points += points_earned
    stats.weekly_points += points_earned
    stats.experience = stats.total_points
    stats.level = calculate_level_from_xp(stats.experience)
    
    logger.info(f" POINTS AWARDED: {points_earned} pts for {activity_type}")
    logger.info(f"   User: {user_id}")
    logger.info(f"   Total Points: {stats.total_points}")
    logger.info(f"   Weekly Points: {stats.weekly_points}")
    logger.info(f"   Level: {stats.level}")
    
    if stats.level > old_level:
        notification = models.Notification(
            user_id=user_id,
            title=f"Level Up! Now Level {stats.level}",
            message=f"Congratulations! You've reached level {stats.level}. Keep learning to unlock more!",
            notification_type="level_up"
        )
        db.add(notification)
    
    _apply_daily_streak(db, stats, user_id)

    transaction = models.PointTransaction(
        user_id=user_id,
        activity_type=activity_type,
        points_earned=points_earned,
        description=description,
        activity_metadata=str(metadata) if metadata else None
    )
    db.add(transaction)
    result_payload = {
        "points_earned": points_earned,
        "total_points": stats.total_points,
        "level": stats.level,
        "experience": stats.experience
    }
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.warning(
            "Skipping gamification award after FK/integrity failure: user_id=%s activity=%s error=%s",
            user_id,
            activity_type,
            exc,
        )
        return {
            "points_earned": 0,
            "total_points": result_payload["total_points"],
            "level": result_payload["level"],
            "experience": result_payload["experience"],
            "description": "Integrity failure (skipped)",
        }

    return result_payload

def get_user_stats(db: Session, user_id: int):
    stats = get_or_create_stats(db, user_id)
    _ensure_powerup_baseline(stats)
    check_and_reset_weekly_stats(stats)
    _expire_stale_streak(stats)

    if db.new or db.dirty:
        db.commit()
    
    next_level_xp = get_xp_for_level(stats.level + 1)
    xp_to_next_level = next_level_xp - stats.experience
    
    rank = (
        db.query(func.count(models.UserGamificationStats.user_id))
        .filter(
            or_(
                models.UserGamificationStats.total_points > stats.total_points,
                and_(
                    models.UserGamificationStats.total_points == stats.total_points,
                    models.UserGamificationStats.user_id < user_id,
                ),
            )
        )
        .scalar()
        or 0
    ) + 1
    
    total_chat_sessions = db.query(func.count(func.distinct(models.ChatSession.id))).join(
        models.ChatMessage, models.ChatMessage.chat_session_id == models.ChatSession.id
    ).filter(
        models.ChatSession.user_id == user_id
    ).scalar() or 0
    
    current_messages = db.query(func.count(models.ChatMessage.id)).join(
        models.ChatSession, models.ChatMessage.chat_session_id == models.ChatSession.id
    ).filter(
        models.ChatSession.user_id == user_id
    ).scalar() or 0
    
    completed_weekly_quests = _completed_weekly_quest_count(stats)
    boost = _active_boost_payload(stats)
    mastered_vaults = _mastered_vault_count(stats)
    vault_rewards_claimed = getattr(stats, 'vault_rewards_claimed', 0) or 0

    return {
        "total_points": stats.total_points,
        "weekly_points": stats.weekly_points,
        "level": stats.level,
        "experience": stats.experience,
        "xp_to_next_level": xp_to_next_level,
        "next_level_xp": next_level_xp,
        "rank": rank,
        "global_rank": rank,
        "current_streak": stats.current_streak,
        "longest_streak": stats.longest_streak,
        "weekly_ai_chats": stats.weekly_ai_chats,
        "weekly_notes_created": stats.weekly_notes_created,
        "weekly_questions_answered": stats.weekly_questions_answered,
        "weekly_quizzes_completed": stats.weekly_quizzes_completed,
        "weekly_flashcards_created": stats.weekly_flashcards_created,
        "weekly_study_minutes": stats.weekly_study_minutes,
        "weekly_battles_won": stats.weekly_battles_won,
        "weekly_solo_quizzes": getattr(stats, 'weekly_solo_quizzes', 0),
        "weekly_flashcards_reviewed": getattr(stats, 'weekly_flashcards_reviewed', 0),
        "weekly_flashcards_mastered": getattr(stats, 'weekly_flashcards_mastered', 0),
        "total_ai_chats": stats.total_ai_chats,
        "total_chat_sessions": total_chat_sessions,
        "current_messages": current_messages,
        "total_notes_created": stats.total_notes_created,
        "total_questions_answered": stats.total_questions_answered,
        "total_quizzes_completed": stats.total_quizzes_completed,
        "total_flashcards_created": stats.total_flashcards_created,
        "total_study_minutes": stats.total_study_minutes,
        "total_battles_won": stats.total_battles_won,
        "total_solo_quizzes": getattr(stats, 'total_solo_quizzes', 0),
        "total_flashcards_reviewed": getattr(stats, 'total_flashcards_reviewed', 0),
        "total_flashcards_mastered": getattr(stats, 'total_flashcards_mastered', 0),
        "weekly_chat_goal": getattr(stats, 'weekly_chat_goal', 10),
        "weekly_note_goal": getattr(stats, 'weekly_note_goal', 5),
        "weekly_flashcard_goal": getattr(stats, 'weekly_flashcard_goal', 20),
        "weekly_quiz_goal": getattr(stats, 'weekly_quiz_goal', 5),
        "freeze_charges": getattr(stats, 'freeze_charges', 0) or 0,
        "revive_charges": getattr(stats, 'revive_charges', 0) or 0,
        "xp_boost_active": boost["active"],
        "xp_boost_until": boost["until"],
        "xp_boost_multiplier": boost["multiplier"],
        "xp_boost_uses": getattr(stats, 'xp_boost_uses', 0) or 0,
        "vault_rewards_claimed": vault_rewards_claimed,
        "powerups": {
            "freeze_charges": getattr(stats, 'freeze_charges', 0) or 0,
            "revive_charges": getattr(stats, 'revive_charges', 0) or 0,
            "boost_active": boost["active"],
            "boost_until": boost["until"],
            "boost_multiplier": boost["multiplier"],
            "boost_available": max(0, completed_weekly_quests - (getattr(stats, 'xp_boost_uses', 0) or 0)),
            "boost_uses": getattr(stats, 'xp_boost_uses', 0) or 0,
            "vaults_available": max(0, mastered_vaults - vault_rewards_claimed),
            "vaults_claimed": vault_rewards_claimed,
            "vaults_mastered": mastered_vaults,
        }
    }

def use_xp_powerup(db: Session, user_id: int, powerup_id: str) -> dict:
    stats = get_or_create_stats(db, user_id)
    _ensure_powerup_baseline(stats)
    check_and_reset_weekly_stats(stats)
    _expire_stale_streak(stats)
    now = datetime.now(timezone.utc)
    powerup = (powerup_id or "").strip().lower()

    if powerup == "freeze":
        if (stats.freeze_charges or 0) <= 0:
            raise ValueError("No freeze charges available")
        stats.freeze_charges -= 1
        stats.last_activity_date = now
        stats.current_streak = max(1, stats.current_streak or 0)
        message = "Freeze used. Your streak is protected for today."

    elif powerup == "revive":
        if (stats.revive_charges or 0) <= 0:
            raise ValueError("No revive charges available")
        if (stats.current_streak or 0) > 0:
            raise ValueError("Your streak is already active")
        stats.revive_charges -= 1
        stats.current_streak = max(1, min(stats.longest_streak or 1, 7))
        stats.last_activity_date = now
        message = "Revive used. Your streak is active again."

    elif powerup == "boost":
        completed_weekly_quests = _completed_weekly_quest_count(stats)
        available_boosts = completed_weekly_quests - (stats.xp_boost_uses or 0)
        if available_boosts <= 0:
            raise ValueError("Complete a weekly quest lane to earn a boost")
        stats.xp_boost_uses = (stats.xp_boost_uses or 0) + 1
        stats.xp_boost_multiplier = min(2.0, 1 + (completed_weekly_quests * 0.2))
        stats.xp_boost_until = now + timedelta(minutes=30)
        message = f"{stats.xp_boost_multiplier:g}x XP boost active for 30 minutes."

    elif powerup == "vault":
        mastered_vaults = _mastered_vault_count(stats)
        vault_rewards_claimed = stats.vault_rewards_claimed or 0
        if mastered_vaults <= vault_rewards_claimed:
            raise ValueError("No vault rewards available")
        reward_points = 25 if vault_rewards_claimed == 0 else 75
        stats.vault_rewards_claimed = vault_rewards_claimed + 1
        stats.total_points += reward_points
        stats.weekly_points += reward_points
        stats.experience = stats.total_points
        stats.level = calculate_level_from_xp(stats.experience)
        db.add(models.PointTransaction(
            user_id=user_id,
            activity_type="xp_vault_reward",
            points_earned=reward_points,
            description="XP Roadmap Vault Reward",
            activity_metadata=f"vault_index={stats.vault_rewards_claimed}",
        ))
        message = f"Vault opened. You earned {reward_points} XP."

    else:
        raise ValueError("Unknown power-up")

    stats.updated_at = now
    db.commit()
    return {
        "status": "success",
        "message": message,
        "stats": get_user_stats(db, user_id),
    }

def recalculate_all_stats(db: Session):
    users = db.query(models.User).all()
    week_start_datetime = datetime.combine(get_week_start(), datetime.min.time()).replace(tzinfo=timezone.utc)

    def _counts_by_user(model, user_col, date_col):
        total_rows = db.query(user_col, func.count(model.id)).group_by(user_col).all()
        weekly_rows = (
            db.query(user_col, func.count(model.id))
            .filter(date_col >= week_start_datetime)
            .group_by(user_col)
            .all()
        )
        return dict(total_rows), dict(weekly_rows)

    total_chats_by_user, weekly_chats_by_user = _counts_by_user(
        models.ChatMessage, models.ChatMessage.user_id, models.ChatMessage.timestamp
    )
    total_notes_by_user, weekly_notes_by_user = _counts_by_user(
        models.Note, models.Note.user_id, models.Note.created_at
    )
    total_flashcards_by_user, weekly_flashcards_by_user = _counts_by_user(
        models.FlashcardSet, models.FlashcardSet.user_id, models.FlashcardSet.created_at
    )

    # Points are sourced from the PointTransaction ledger — the same ledger
    # analytics/xp_history sums for "all time" — instead of being rebuilt from
    # only chats/notes/flashcards. The old version reconstructed total_points
    # from just those 3 categories, silently dropping quizzes/questions/study
    # time/battles/vault rewards/etc., which left total_points (and therefore
    # the leaderboard, which sorts by it) permanently out of sync with the
    # ledger for any account this ever ran on.
    total_points_by_user = dict(
        db.query(models.PointTransaction.user_id, func.sum(models.PointTransaction.points_earned))
        .group_by(models.PointTransaction.user_id)
        .all()
    )
    weekly_points_by_user = dict(
        db.query(models.PointTransaction.user_id, func.sum(models.PointTransaction.points_earned))
        .filter(models.PointTransaction.created_at >= week_start_datetime)
        .group_by(models.PointTransaction.user_id)
        .all()
    )

    for user in users:
        stats = get_or_create_stats(db, user.id)

        # Only fields actually recomputed below get touched — total_points now
        # comes from the ledger (which already reflects every activity type),
        # and counters this function has no data to rebuild (questions
        # answered, quizzes completed, study minutes, battles won) are left
        # alone instead of being zeroed out with nothing to replace them.
        stats.total_ai_chats = total_chats_by_user.get(user.id, 0)
        stats.weekly_ai_chats = weekly_chats_by_user.get(user.id, 0)
        stats.total_notes_created = total_notes_by_user.get(user.id, 0)
        stats.weekly_notes_created = weekly_notes_by_user.get(user.id, 0)
        stats.total_flashcards_created = total_flashcards_by_user.get(user.id, 0)
        stats.weekly_flashcards_created = weekly_flashcards_by_user.get(user.id, 0)

        stats.total_points = int(total_points_by_user.get(user.id, 0) or 0)
        stats.weekly_points = int(weekly_points_by_user.get(user.id, 0) or 0)
        stats.experience = stats.total_points
        stats.level = calculate_level_from_xp(stats.experience)
        stats.week_start_date = week_start_datetime
        stats.last_activity_date = datetime.now(timezone.utc)

    db.commit()
    return len(users)
