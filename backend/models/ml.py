from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class StudentKnowledgeState(Base):
    __tablename__ = "student_knowledge_states"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    concept_id = Column(String(255), nullable=False, index=True)
    concept_name = Column(String(255), nullable=False)

    p_mastery = Column(Float, default=0.1)
    p_learn = Column(Float, default=0.09)
    p_slip = Column(Float, default=0.1)
    p_guess = Column(Float, default=0.2)

    mastery_history = Column(JSON, default=list)
    interaction_count = Column(Integer, default=0)
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")


class StudentMemory(Base):
    __tablename__ = "student_memories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    memory_hash = Column(String(16), unique=True, index=True, nullable=False)
    memory_type = Column(String(50), nullable=False)
    concept_id = Column(String(255), nullable=True, index=True)
    concept_name = Column(String(255), nullable=True)
    source = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    importance_score = Column(Float, default=0.3)
    access_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    last_accessed = Column(DateTime, nullable=True)
    metadata_json = Column(JSON, nullable=True)

    user = relationship("User")


class MessageMLLog(Base):
    __tablename__ = "message_ml_logs"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    message_text = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    response_latency_ms = Column(Integer, nullable=True)
    intent_class = Column(String(50), nullable=True)
    concept_ids = Column(JSON, nullable=True)
    frustration_score = Column(Float, default=0.0)
    engagement_score = Column(Float, default=0.5)
    cognitive_state = Column(String(50), nullable=True)
    archetype = Column(String(50), nullable=True)
    response_strategy = Column(String(50), nullable=True)
    kt_delta = Column(JSON, nullable=True)
    memories_used = Column(JSON, nullable=True)
    messages_this_session = Column(Integer, default=1)
    messages_on_concept = Column(Integer, default=1)

    user = relationship("User")


class CerbylSessionState(Base):
    __tablename__ = "cerbyl_session_states"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False, unique=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_message_at = Column(DateTime, nullable=True)
    message_count = Column(Integer, default=0)
    current_concept_id = Column(String(255), nullable=True)
    frustration_trend = Column(JSON, default=list)
    engagement_trend = Column(JSON, default=list)
    session_brief = Column(Text, nullable=True)
    messages_on_concept = Column(JSON, default=dict)

    user = relationship("User")


class AgentEvent(Base):
    __tablename__ = "agent_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    session_id = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    source = Column(String(50), nullable=False)
    event_type = Column(String(50), nullable=False)
    concept_id = Column(String(255), nullable=True, index=True)
    concept_name = Column(String(255), nullable=True)
    correct = Column(Boolean, nullable=True)
    confidence_signal = Column(Float, nullable=True)
    kt_before = Column(JSON, nullable=True)
    kt_after = Column(JSON, nullable=True)
    triggers_fired = Column(JSON, nullable=True)
    raw_data = Column(JSON, nullable=True)

    user = relationship("User")


class BanditState(Base):
    __tablename__ = "bandit_state"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(36), nullable=False, index=True)
    state_hash = Column(String(32), nullable=False, index=True)
    strategy_id = Column(String(32), nullable=False)
    pulls = Column(Integer, default=0)
    total_reward = Column(Float, default=0.0)
    avg_reward = Column(Float, default=0.0)
    alpha = Column(Float, default=1.0)
    beta_param = Column(Float, default=1.0)
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("student_id", "state_hash", "strategy_id", name="uq_bandit_state"),
    )


class BanditRewardQueue(Base):
    __tablename__ = "bandit_reward_queue"

    id = Column(String(36), primary_key=True)
    student_id = Column(String(36), nullable=False, index=True)
    session_id = Column(Integer, nullable=True)
    message_id = Column(Integer, ForeignKey("message_ml_logs.id"), nullable=True)
    state_hash = Column(String(32), nullable=False)
    strategy_id = Column(String(32), nullable=False)
    response_sent_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    reward_measured = Column(Boolean, default=False, index=True)
    reward_value = Column(Float, nullable=True)
    reward_components = Column(JSON, nullable=True)
    measure_after = Column(DateTime, nullable=False, index=True)
    p_mastery_before = Column(Float, nullable=True)
    frustration_before = Column(Float, nullable=True)
    engagement_before = Column(Float, nullable=True)


class BanditEpisodeLog(Base):
    __tablename__ = "bandit_episode_log"

    id = Column(String(36), primary_key=True)
    student_id = Column(String(36), nullable=False, index=True)
    session_id = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    state_hash = Column(String(32), nullable=False)
    state_features = Column(JSON, nullable=True)
    strategy_selected = Column(String(32), nullable=False)
    baseline_strategy_id = Column(String(32), nullable=True)
    selection_method = Column(String(16), nullable=False)
    thompson_samples = Column(JSON, nullable=True)
    exploration_flag = Column(Boolean, default=False)
    reward_received = Column(Float, nullable=True)
    p_mastery_before = Column(Float, nullable=True)
    p_mastery_after = Column(Float, nullable=True)
