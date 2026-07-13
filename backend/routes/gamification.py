import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

try:
    from services.redis_cache import get_analytics as _cache_get, set_analytics as _cache_set
except Exception:
    def _cache_get(key): return None
    def _cache_set(key, value, ttl=60): pass

import models
from services.admin_analytics import check_admin
from deps import (
    calculate_day_streak,
    enforce_request_user_scope,
    get_current_user,
    get_db,
    get_user_by_email,
    get_user_by_username,
    verify_token,
)

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api",
    tags=["gamification"],
    dependencies=[Depends(enforce_request_user_scope)],
)


def _recent_note_summaries(db: Session, user_id: int, limit: int = 3) -> list[dict]:
    notes = (
        db.query(models.Note)
        .filter(
            models.Note.user_id == user_id,
            models.Note.is_deleted == False,
        )
        .order_by(models.Note.updated_at.desc(), models.Note.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": note.id,
            "title": note.title,
            "updated_at": note.updated_at.isoformat() + "Z" if note.updated_at else None,
            "created_at": note.created_at.isoformat() + "Z" if note.created_at else None,
        }
        for note in notes
    ]


def _recent_flashcard_set_summaries(db: Session, user_id: int, limit: int = 3) -> list[dict]:
    card_counts = (
        db.query(
            models.Flashcard.set_id.label("set_id"),
            func.count(models.Flashcard.id).label("card_count"),
        )
        .group_by(models.Flashcard.set_id)
        .subquery()
    )
    sets = (
        db.query(
            models.FlashcardSet.id,
            models.FlashcardSet.title,
            models.FlashcardSet.created_at,
            func.coalesce(card_counts.c.card_count, 0).label("card_count"),
        )
        .outerjoin(card_counts, card_counts.c.set_id == models.FlashcardSet.id)
        .filter(models.FlashcardSet.user_id == user_id)
        .order_by(models.FlashcardSet.created_at.desc(), models.FlashcardSet.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "set_id": row.id,
            "title": row.title,
            "created_at": row.created_at.isoformat() + "Z" if row.created_at else None,
            "count": int(row.card_count or 0),
        }
        for row in sets
    ]


def _build_daily_challenge(stats) -> dict:
    challenges = [
        {"id": 1, "title": "Knowledge Sprint", "description": "Answer 15 questions correctly", "target": 15, "type": "questions_answered", "reward": 100, "icon": "target"},
        {"id": 2, "title": "Chat Master", "description": "Have 25 AI conversations", "target": 25, "type": "ai_chats", "reward": 75, "icon": "chat"},
        {"id": 3, "title": "Note Taker", "description": "Create 5 new notes", "target": 5, "type": "notes_created", "reward": 150, "icon": "note"},
        {"id": 4, "title": "Study Marathon", "description": "Study for 2 hours", "target": 120, "type": "study_minutes", "reward": 200, "icon": "clock"},
        {"id": 5, "title": "Quiz Champion", "description": "Complete 3 quizzes with 80%+", "target": 3, "type": "quizzes_completed", "reward": 175, "icon": "trophy"},
        {"id": 6, "title": "Flashcard Creator", "description": "Create 20 flashcards", "target": 20, "type": "flashcards_created", "reward": 125, "icon": "cards"},
        {"id": 7, "title": "Perfect Score", "description": "Get 100% on any quiz", "target": 1, "type": "perfect_quizzes", "reward": 250, "icon": "star"},
    ]

    day_of_year = datetime.now(timezone.utc).timetuple().tm_yday
    daily_challenge = challenges[day_of_year % len(challenges)]

    progress = 0
    if stats:
        if daily_challenge["type"] == "questions_answered":
            progress = stats.weekly_questions_answered
        elif daily_challenge["type"] == "ai_chats":
            progress = stats.weekly_ai_chats
        elif daily_challenge["type"] == "notes_created":
            progress = stats.weekly_notes_created
        elif daily_challenge["type"] == "study_minutes":
            progress = stats.weekly_study_minutes
        elif daily_challenge["type"] == "quizzes_completed":
            progress = stats.weekly_quizzes_completed
        elif daily_challenge["type"] == "flashcards_created":
            progress = stats.weekly_flashcards_created

    return {
        "challenge": daily_challenge,
        "progress": progress,
    }

@router.get("/get_user_achievements")
def get_user_achievements(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user_achievements = db.query(models.UserAchievement).filter(
            models.UserAchievement.user_id == user.id
        ).order_by(models.UserAchievement.earned_at.desc()).all()

        achievements = []
        for ua in user_achievements:
            achievement = db.query(models.Achievement).filter(
                models.Achievement.id == ua.achievement_id
            ).first()

            if achievement:
                achievements.append({
                    "id": achievement.id,
                    "name": achievement.name,
                    "description": achievement.description,
                    "icon": achievement.icon,
                    "points": achievement.points,
                    "category": achievement.category,
                    "rarity": achievement.rarity,
                    "earned_at": ua.earned_at.isoformat() + "Z"
                })

        return {
            "achievements": achievements,
            "total_points": sum(a["points"] for a in achievements)
        }

    except Exception as e:
        logger.error(f"Error getting achievements: {str(e)}")
        return {
            "achievements": [],
            "total_points": 0
        }

@router.post("/track_gamification_activity")
async def track_gamification_activity(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        from services.gamification_system import award_points

        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        activity_type = payload.get("activity_type")
        metadata = payload.get("metadata", {})

        result = award_points(db, current_user.id, activity_type, metadata)
        db.commit()

        return {
            "status": "success",
            **result
        }

    except Exception as e:
        logger.error(f"Error tracking gamification activity: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_gamification_stats")
async def get_gamification_stats(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        from services.gamification_system import get_user_stats

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return get_user_stats(db, user.id)

    except Exception as e:
        logger.error(f"Error getting gamification stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/xp_roadmap/personalized")
async def get_personalized_xp_roadmap(
    user_id: str = Query(...),
    include_stats: bool = Query(False),
    force_refresh: bool = Query(False),
    db: Session = Depends(get_db)
):
    try:
        from services.xp_roadmap_system import get_personalized_roadmap

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        roadmap_data = get_personalized_roadmap(db, user.id, force_refresh=force_refresh)
        response = {
            "status": "success",
            "roadmap": roadmap_data
        }
        if include_stats:
            from services.gamification_system import get_user_stats
            response["user_stats"] = get_user_stats(db, user.id)

        return response

    except Exception as e:
        logger.error(f"Error getting personalized roadmap: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/xp_roadmap/powerups/use")
async def use_xp_roadmap_powerup(
    payload: dict = Body(...),
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        from services.gamification_system import use_xp_powerup

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        powerup_id = payload.get("powerup_id")
        if not powerup_id:
            raise HTTPException(status_code=400, detail="Missing powerup_id")

        return use_xp_powerup(db, user.id, powerup_id)

    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error using XP roadmap power-up: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/set_weekly_goals")
async def set_weekly_goals(
    user_id: str = Query(...),
    chat_goal: int = Query(10),
    note_goal: int = Query(5),
    flashcard_goal: int = Query(20),
    quiz_goal: int = Query(5),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        stats = db.query(models.UserGamificationStats).filter(
            models.UserGamificationStats.user_id == user.id
        ).first()
        if not stats:
            stats = models.UserGamificationStats(user_id=user.id)
            db.add(stats)

        stats.weekly_chat_goal = max(1, chat_goal)
        stats.weekly_note_goal = max(1, note_goal)
        stats.weekly_flashcard_goal = max(1, flashcard_goal)
        stats.weekly_quiz_goal = max(1, quiz_goal)
        db.commit()

        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error setting weekly goals: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_dashboard_data")
async def get_dashboard_data(
    user_id: str = Query(...),
    include_recent_summaries: bool = Query(False),
    db: Session = Depends(get_db)
):
    cache_key = f"dashboard:v2:{user_id}:{int(include_recent_summaries)}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        from services.gamification_system import get_user_stats

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        gamification_stats = get_user_stats(db, user.id)

        today = datetime.now(timezone.utc).date()
        daily_metrics = db.query(models.DailyLearningMetrics).filter(
            models.DailyLearningMetrics.user_id == user.id,
            models.DailyLearningMetrics.date == today
        ).first()

        streak = calculate_day_streak(db, user.id)

        result = {
            "status": "success",
            "gamification": gamification_stats,
            "daily_metrics": {
                "questions_answered": daily_metrics.questions_answered if daily_metrics else 0,
                "time_spent_minutes": daily_metrics.time_spent_minutes if daily_metrics else 0,
                "accuracy_rate": daily_metrics.accuracy_rate if daily_metrics else 0
            },
            "streak": streak,
            "daily_challenge": _build_daily_challenge(
                db.query(models.UserGamificationStats).filter(
                    models.UserGamificationStats.user_id == user.id
                ).first()
            ),
        }
        if include_recent_summaries:
            result["recent_notes"] = _recent_note_summaries(db, user.id)
            result["recent_flashcard_sets"] = _recent_flashcard_set_summaries(db, user.id)
        _cache_set(cache_key, result, ttl=60)
        return result

    except Exception as e:
        logger.error(f"Error getting dashboard data: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/check_missed_achievements")
async def check_missed_achievements(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user_achievements = db.query(models.UserAchievement).filter(
            models.UserAchievement.user_id == user.id
        ).all()

        earned_achievement_ids = {ua.achievement_id for ua in user_achievements}

        all_achievements = db.query(models.Achievement).all()

        missed_achievements = []
        for achievement in all_achievements:
            if achievement.id not in earned_achievement_ids:
                missed_achievements.append({
                    "id": achievement.id,
                    "name": achievement.name,
                    "description": achievement.description,
                    "icon": achievement.icon,
                    "points": achievement.points
                })

        return {
            "status": "success",
            "missed_achievements": missed_achievements[:5]
        }

    except Exception as e:
        logger.error(f"Error checking missed achievements: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_weekly_bingo_stats")
async def get_weekly_bingo_stats(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        stats = db.query(models.UserGamificationStats).filter(
            models.UserGamificationStats.user_id == user.id
        ).first()

        if not stats:
            return {"stats": {}}

        return {
            "stats": {
                "ai_chats": stats.weekly_ai_chats,
                "questions_answered": stats.weekly_questions_answered,
                "notes_created": stats.weekly_notes_created,
                "study_hours": stats.weekly_study_minutes / 60,
                "quizzes_completed": stats.weekly_quizzes_completed,
                "flashcards_created": stats.weekly_flashcards_created,
                "streak": stats.current_streak,
                "battles_won": stats.weekly_battles_won,
                "level": stats.level,
                "solo_quizzes": getattr(stats, "weekly_solo_quizzes", 0),
                "flashcards_reviewed": getattr(stats, "weekly_flashcards_reviewed", 0),
                "flashcards_mastered": getattr(stats, "weekly_flashcards_mastered", 0)
            }
        }

    except Exception as e:
        logger.error(f"Error getting bingo stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_weekly_activity_progress")
async def get_weekly_activity_progress(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        stats = db.query(models.UserGamificationStats).filter(
            models.UserGamificationStats.user_id == user.id
        ).first()

        if not stats:
            return {
                "study_minutes": 0,
                "ai_chats": 0,
                "notes_created": 0,
                "questions_answered": 0,
                "quizzes_completed": 0,
                "flashcards_created": 0,
                "solo_quizzes": 0,
                "flashcards_reviewed": 0,
                "flashcards_mastered": 0
            }

        return {
            "study_minutes": stats.weekly_study_minutes,
            "ai_chats": stats.weekly_ai_chats,
            "notes_created": stats.weekly_notes_created,
            "questions_answered": stats.weekly_questions_answered,
            "quizzes_completed": stats.weekly_quizzes_completed,
            "flashcards_created": stats.weekly_flashcards_created,
            "solo_quizzes": getattr(stats, "weekly_solo_quizzes", 0),
            "flashcards_reviewed": getattr(stats, "weekly_flashcards_reviewed", 0),
            "flashcards_mastered": getattr(stats, "weekly_flashcards_mastered", 0)
        }

    except Exception as e:
        logger.error(f"Error getting weekly progress: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_recent_point_activities")
async def get_recent_point_activities(
    user_id: str = Query(...),
    limit: int = Query(10),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        transactions = db.query(models.PointTransaction).filter(
            models.PointTransaction.user_id == user.id
        ).order_by(models.PointTransaction.created_at.desc()).limit(limit).all()

        activities = []
        for t in transactions:
            now = datetime.now(timezone.utc)
            created = t.created_at.replace(tzinfo=timezone.utc) if t.created_at.tzinfo is None else t.created_at
            time_diff = now - created

            if time_diff.days > 0:
                time_ago = f"{time_diff.days}d ago"
            elif time_diff.seconds >= 3600:
                time_ago = f"{time_diff.seconds // 3600}h ago"
            elif time_diff.seconds >= 60:
                time_ago = f"{time_diff.seconds // 60}m ago"
            else:
                time_ago = "just now"

            activities.append({
                "description": t.description,
                "points": t.points_earned,
                "time_ago": time_ago,
                "activity_type": t.activity_type
            })

        return {"activities": activities}

    except Exception as e:
        logger.error(f"Error getting recent activities: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_daily_challenge")
async def get_daily_challenge(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        stats = db.query(models.UserGamificationStats).filter(
            models.UserGamificationStats.user_id == user.id
        ).first()

        return _build_daily_challenge(stats)

    except Exception as e:
        logger.error(f"Error getting daily challenge: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_leaderboard")
async def get_leaderboard(
    category: str = Query("global"),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    try:
        leaderboard_query = db.query(
            models.User,
            models.UserGamificationStats
        ).join(
            models.UserGamificationStats,
            models.User.id == models.UserGamificationStats.user_id
        ).order_by(
            models.UserGamificationStats.total_points.desc(),
            models.UserGamificationStats.user_id.asc(),
        ).limit(limit)

        results = leaderboard_query.all()

        leaderboard = []
        for rank, (user, stats) in enumerate(results, 1):
            leaderboard.append({
                "rank": rank,
                "user_id": user.id,
                "username": user.username,
                "first_name": user.first_name or "",
                "last_name": user.last_name or "",
                "picture_url": user.picture_url or "",
                "total_points": stats.total_points,
                "level": stats.level,
                "experience": stats.experience,
                "weekly_points": stats.weekly_points,
                "current_streak": stats.current_streak
            })

        return {"leaderboard": leaderboard}

    except Exception as e:
        logger.error(f"Error getting leaderboard: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/admin/recalculate_gamification")
async def recalculate_gamification(
    db: Session = Depends(get_db),
    _: str = Depends(check_admin),
):
    try:
        from services.gamification_system import recalculate_all_stats

        count = recalculate_all_stats(db)
        return {
            "status": "success",
            "users_processed": count,
            "message": "All user stats recalculated from historical data"
        }

    except Exception as e:
        logger.error(f"Recalculation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
