from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float, JSON, Date
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base
from uid_utils import generate_uid


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), default="New Chat")
    folder_id = Column(Integer, ForeignKey("chat_folders.id"), nullable=True)
    public_token = Column(String(32), unique=True, index=True, nullable=True, default=generate_uid)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="chat_session", cascade="all, delete-orphan")
    folder = relationship("ChatFolder", back_populates="chat_sessions")
    tutor_state = relationship("ChatTutorState", back_populates="chat_session", uselist=False, cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    chat_session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    user_message = Column(Text, nullable=False)
    ai_response = Column(Text, nullable=False)
    is_user = Column(Boolean, default=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    image_metadata = Column(Text, nullable=True)
    source_metadata = Column(JSON, nullable=True)

    chat_session = relationship("ChatSession", back_populates="messages")


class ChatTutorState(Base):
    __tablename__ = "chat_tutor_states"

    id = Column(Integer, primary_key=True, index=True)
    chat_session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    level = Column(String(32), default="intermediate")
    phase = Column(String(32), default="teach")
    verdict = Column(String(32), default="not_applicable")
    confidence = Column(Float, default=0.65)
    objective = Column(Text, nullable=True)
    next_action = Column(Text, nullable=True)
    hint_level = Column(Integer, default=2)
    reply_style = Column(String(32), default="guided")
    attempts = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    current_step = Column(Integer, default=1)
    total_steps = Column(Integer, default=0)
    expected_step_answer = Column(Text, nullable=True)
    final_answer = Column(Text, nullable=True)
    skills_used = Column(JSON, nullable=True)
    misconceptions = Column(JSON, nullable=True)
    mastery_score = Column(Float, default=0.0)
    correct_streak = Column(Integer, default=0)
    wrong_streak = Column(Integer, default=0)
    lesson_plan = Column(JSON, nullable=True)
    last_options = Column(JSON, nullable=True)
    last_choice = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    chat_session = relationship("ChatSession", back_populates="tutor_state")


class ChatFolder(Base):
    __tablename__ = "chat_folders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    color = Column(String(50), default="#D7B38C")
    parent_id = Column(Integer, ForeignKey("chat_folders.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="chat_folders")
    chat_sessions = relationship("ChatSession", back_populates="folder")


class ConversationMemory(Base):
    __tablename__ = "conversation_memories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    session_id = Column(Integer, nullable=True)

    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    context_summary = Column(Text, nullable=True)

    topic_tags = Column(JSON, nullable=True)
    question_type = Column(String(50), nullable=True)
    emotional_context = Column(String(50), nullable=True)

    question_embedding = Column(Text, nullable=True)
    answer_embedding = Column(Text, nullable=True)
    combined_embedding = Column(Text, nullable=True)

    usage_count = Column(Integer, default=0)
    last_used = Column(DateTime, nullable=True)
    user_feedback_score = Column(Float, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User")


class AILearningMetrics(Base):
    __tablename__ = "ai_learning_metrics"

    id = Column(Integer, primary_key=True, index=True)

    date = Column(Date, default=datetime.now(timezone.utc).date)

    average_response_rating = Column(Float, default=0.0)
    total_interactions = Column(Integer, default=0)
    successful_interactions = Column(Integer, default=0)

    new_knowledge_entries = Column(Integer, default=0)
    improvements_implemented = Column(Integer, default=0)
    misconceptions_corrected = Column(Integer, default=0)

    user_satisfaction_trend = Column(Float, default=0.0)
    repeat_user_percentage = Column(Float, default=0.0)

    topic_performance_data = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
