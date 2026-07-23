from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base
from uid_utils import generate_uid


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    friend_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), default="active")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", foreign_keys=[user_id])
    friend = relationship("User", foreign_keys=[friend_id])


class FriendRequest(Base):
    __tablename__ = "friend_requests"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    responded_at = Column(DateTime, nullable=True)

    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])


class FriendActivity(Base):
    __tablename__ = "friend_activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    activity_type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)
    activity_data = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", foreign_keys=[user_id])


class Kudos(Base):
    __tablename__ = "kudos"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(Integer, ForeignKey("friend_activities.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    reaction_type = Column(String(20), default="👏")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    activity = relationship("FriendActivity", foreign_keys=[activity_id])
    user = relationship("User", foreign_keys=[user_id])


class Leaderboard(Base):
    __tablename__ = "leaderboards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String(50), nullable=False)
    metric = Column(String(50), nullable=False)
    period = Column(String(20), default="all_time")
    score = Column(Float, default=0.0)
    rank = Column(Integer, nullable=True)
    subject_filter = Column(String(100), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", foreign_keys=[user_id])


class QuizBattle(Base):
    __tablename__ = "quiz_battles"

    id = Column(Integer, primary_key=True, index=True)
    challenger_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    opponent_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subject = Column(String(100), nullable=False)
    difficulty = Column(String(20), default="intermediate")
    status = Column(String(20), default="pending")

    question_count = Column(Integer, default=10)
    time_limit_seconds = Column(Integer, default=300)

    challenger_score = Column(Integer, default=0)
    opponent_score = Column(Integer, default=0)
    challenger_completed = Column(Boolean, default=False)
    opponent_completed = Column(Boolean, default=False)

    challenger_answers = Column(Text, nullable=True)
    opponent_answers = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    challenger = relationship("User", foreign_keys=[challenger_id])
    opponent = relationship("User", foreign_keys=[opponent_id])


class Challenge(Base):
    __tablename__ = "challenges"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    challenge_type = Column(String(50), nullable=False)
    subject = Column(String(100), nullable=True)

    target_metric = Column(String(50), nullable=False)
    target_value = Column(Float, nullable=False)
    time_limit_minutes = Column(Integer, nullable=True)

    status = Column(String(20), default="active")
    participant_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)

    creator = relationship("User", foreign_keys=[creator_id])


class ChallengeParticipation(Base):
    __tablename__ = "challenge_participations"

    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("challenges.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    score = Column(Float, default=0.0)
    progress = Column(Float, default=0.0)
    completed = Column(Boolean, default=False)
    rank = Column(Integer, nullable=True)

    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    challenge = relationship("Challenge", foreign_keys=[challenge_id])
    user = relationship("User", foreign_keys=[user_id])


class BattleQuestion(Base):
    __tablename__ = "battle_questions"

    id = Column(Integer, primary_key=True, index=True)
    battle_id = Column(Integer, ForeignKey("quiz_battles.id"), nullable=False)
    question = Column(Text, nullable=False)
    options = Column(Text, nullable=False)
    correct_answer = Column(Integer, nullable=False)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    battle = relationship("QuizBattle", foreign_keys=[battle_id])


class ChallengeQuestion(Base):
    __tablename__ = "challenge_questions"

    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("challenges.id"), nullable=False)
    question = Column(Text, nullable=False)
    options = Column(Text, nullable=False)
    correct_answer = Column(Integer, nullable=False)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    challenge = relationship("Challenge", foreign_keys=[challenge_id])


class BattleAnswer(Base):
    __tablename__ = "battle_answers"

    id = Column(Integer, primary_key=True, index=True)
    battle_id = Column(Integer, ForeignKey("quiz_battles.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("battle_questions.id"), nullable=False)
    selected_answer = Column(Integer, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    time_taken = Column(Integer, nullable=True)
    answered_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    battle = relationship("QuizBattle", foreign_keys=[battle_id])
    user = relationship("User", foreign_keys=[user_id])
    question = relationship("BattleQuestion", foreign_keys=[question_id])


class ChallengeAnswer(Base):
    __tablename__ = "challenge_answers"

    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("challenges.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("challenge_questions.id"), nullable=False)
    selected_answer = Column(Integer, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    answered_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    challenge = relationship("Challenge", foreign_keys=[challenge_id])
    user = relationship("User", foreign_keys=[user_id])
    question = relationship("ChallengeQuestion", foreign_keys=[question_id])


class SharedContent(Base):
    __tablename__ = "shared_content"

    id = Column(Integer, primary_key=True, index=True)
    content_type = Column(String(20), nullable=False)
    content_id = Column(Integer, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    shared_with_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    permission = Column(String(10), default="view")
    message = Column(Text, nullable=True)
    shared_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_accessed = Column(DateTime, nullable=True)

    owner = relationship("User", foreign_keys=[owner_id])
    shared_with = relationship("User", foreign_keys=[shared_with_id])


class SharedContentAccess(Base):
    __tablename__ = "shared_content_access"

    id = Column(Integer, primary_key=True, index=True)
    shared_content_id = Column(Integer, ForeignKey("shared_content.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    accessed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    action = Column(String(20), nullable=False)

    shared_content = relationship("SharedContent", foreign_keys=[shared_content_id])
    user = relationship("User", foreign_keys=[user_id])


class SoloQuiz(Base):
    __tablename__ = "solo_quizzes"

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(32), unique=True, index=True, nullable=True, default=generate_uid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subject = Column(String(100), nullable=False)
    difficulty = Column(String(20), default="intermediate")
    bandit_episode_id = Column(String(36), nullable=True, index=True)
    bandit_topic_key = Column(String(50), nullable=True)
    status = Column(String(20), default="active")

    question_count = Column(Integer, default=10)
    time_limit_seconds = Column(Integer, default=300)

    score = Column(Integer, default=0)
    completed = Column(Boolean, default=False)

    answers = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User")


class SoloQuizQuestion(Base):
    __tablename__ = "solo_quiz_questions"

    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("solo_quizzes.id"), nullable=False)
    question = Column(Text, nullable=False)
    options = Column(Text, nullable=False)
    correct_answer = Column(Integer, nullable=False)
    explanation = Column(Text, nullable=True)

    quiz = relationship("SoloQuiz")
