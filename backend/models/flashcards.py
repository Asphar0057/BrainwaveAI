from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base
from uid_utils import generate_uid


class FlashcardSet(Base):
    __tablename__ = "flashcard_sets"

    id = Column(Integer, primary_key=True, index=True)
    share_code = Column(String(6), unique=True, index=True, nullable=True)
    public_token = Column(String(32), unique=True, index=True, nullable=True, default=generate_uid)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String(200), default="New Flashcard Set")
    description = Column(Text, default="")
    source_type = Column(String(50), default="manual")
    source_id = Column(Integer, nullable=True)
    bandit_episode_id = Column(String(36), nullable=True, index=True)
    bandit_topic_key = Column(String(50), nullable=True)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="flashcard_sets")
    flashcards = relationship("Flashcard", back_populates="flashcard_set", cascade="all, delete-orphan")
    study_sessions = relationship("FlashcardStudySession", back_populates="flashcard_set")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True, index=True)
    set_id = Column(Integer, ForeignKey("flashcard_sets.id"))
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    difficulty = Column(String(20), default="medium")
    category = Column(String(50), default="general")
    times_reviewed = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    last_reviewed = Column(DateTime, nullable=True)
    marked_for_review = Column(Boolean, default=False)
    is_edited = Column(Boolean, default=False)
    edited_at = Column(DateTime, nullable=True)
    ease_factor = Column(Float, default=2.5)
    interval = Column(Float, default=0)
    repetitions = Column(Integer, default=0)
    next_review_date = Column(DateTime, nullable=True)
    lapses = Column(Integer, default=0)
    sr_state = Column(String(20), default="new")
    learning_step = Column(Integer, default=0)
    fsrs_stability = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    flashcard_set = relationship("FlashcardSet", back_populates="flashcards")


class FlashcardStudySession(Base):
    __tablename__ = "flashcard_study_sessions"

    id = Column(Integer, primary_key=True, index=True)
    set_id = Column(Integer, ForeignKey("flashcard_sets.id"))
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    cards_studied = Column(Integer, nullable=False)
    correct_answers = Column(Integer, nullable=False)
    session_duration = Column(Integer, nullable=False)
    session_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="flashcard_study_sessions")
    flashcard_set = relationship("FlashcardSet", back_populates="study_sessions")
