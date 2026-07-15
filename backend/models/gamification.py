from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True)
    description = Column(Text)
    icon = Column(String(50))
    criteria = Column(JSON)
    points = Column(Integer, default=0)
    category = Column(String(50), default="general")
    rarity = Column(String(20), default="common")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user_achievements = relationship("UserAchievement", back_populates="achievement")


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    achievement_id = Column(Integer, ForeignKey("achievements.id"))

    earned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    progress_data = Column(JSON, nullable=True)

    user = relationship("User", back_populates="achievements")
    achievement = relationship("Achievement", back_populates="user_achievements")


class UserGamificationStats(Base):
    __tablename__ = "user_gamification_stats"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    total_points = Column(Integer, default=0)
    level = Column(Integer, default=1)
    experience = Column(Integer, default=0)

    weekly_points = Column(Integer, default=0)
    weekly_ai_chats = Column(Integer, default=0)
    weekly_notes_created = Column(Integer, default=0)
    weekly_questions_answered = Column(Integer, default=0)
    weekly_quizzes_completed = Column(Integer, default=0)
    weekly_flashcards_created = Column(Integer, default=0)
    weekly_study_minutes = Column(Integer, default=0)
    weekly_battles_won = Column(Integer, default=0)

    total_ai_chats = Column(Integer, default=0)
    total_notes_created = Column(Integer, default=0)
    total_questions_answered = Column(Integer, default=0)
    total_quizzes_completed = Column(Integer, default=0)
    total_flashcards_created = Column(Integer, default=0)
    total_study_minutes = Column(Integer, default=0)
    total_battles_won = Column(Integer, default=0)
    total_solo_quizzes = Column(Integer, default=0)
    total_flashcards_reviewed = Column(Integer, default=0)
    total_flashcards_mastered = Column(Integer, default=0)

    weekly_solo_quizzes = Column(Integer, default=0)
    weekly_flashcards_reviewed = Column(Integer, default=0)
    weekly_flashcards_mastered = Column(Integer, default=0)

    weekly_chat_goal = Column(Integer, default=10)
    weekly_note_goal = Column(Integer, default=5)
    weekly_flashcard_goal = Column(Integer, default=20)
    weekly_quiz_goal = Column(Integer, default=5)

    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)
    last_activity_date = Column(DateTime, nullable=True)
    timezone_name = Column(String(64), default="UTC")
    freeze_charges = Column(Integer, default=0)
    revive_charges = Column(Integer, default=0)
    xp_boost_until = Column(DateTime, nullable=True)
    xp_boost_multiplier = Column(Float, default=1.0)
    xp_boost_uses = Column(Integer, default=0)
    vault_rewards_claimed = Column(Integer, default=0)
    powerups_initialized = Column(Boolean, default=False)

    week_start_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="gamification_stats")


class PointTransaction(Base):
    __tablename__ = "point_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    activity_type = Column(String(50), nullable=False)
    points_earned = Column(Integer, nullable=False)
    description = Column(String(255), nullable=True)
    activity_metadata = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")


class WeeklyBingoProgress(Base):
    __tablename__ = "weekly_bingo_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    week_start_date = Column(DateTime, nullable=False)

    task_1_completed = Column(Boolean, default=False)
    task_2_completed = Column(Boolean, default=False)
    task_3_completed = Column(Boolean, default=False)
    task_4_completed = Column(Boolean, default=False)
    task_5_completed = Column(Boolean, default=False)
    task_6_completed = Column(Boolean, default=False)
    task_7_completed = Column(Boolean, default=False)
    task_8_completed = Column(Boolean, default=False)
    task_9_completed = Column(Boolean, default=False)
    task_10_completed = Column(Boolean, default=False)
    task_11_completed = Column(Boolean, default=False)
    task_12_completed = Column(Boolean, default=False)
    task_13_completed = Column(Boolean, default=False)
    task_14_completed = Column(Boolean, default=False)
    task_15_completed = Column(Boolean, default=False)
    task_16_completed = Column(Boolean, default=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User")
