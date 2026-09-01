from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class GeneratedQuestion(Base):
    __tablename__ = "generated_questions"

    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String, nullable=False)
    subtopic = Column(String, nullable=True)
    question_text = Column(Text, nullable=False)
    question_type = Column(String, nullable=False)
    options = Column(Text, nullable=True)
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=False)
    hints = Column(Text, nullable=True)
    difficulty = Column(String, default="intermediate")
    generated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    times_used = Column(Integer, default=0)
    avg_accuracy = Column(Float, default=0.0)


class QuestionAttempt(Base):
    __tablename__ = "question_attempts"

    id = Column(Integer, primary_key=True, index=True)
    question_set_id = Column(Integer, ForeignKey("question_sets.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    attempt_number = Column(Integer, nullable=False)
    answers = Column(Text, nullable=False)
    score = Column(Float, default=0.0)
    correct_count = Column(Integer, default=0)
    incorrect_count = Column(Integer, default=0)
    total_questions = Column(Integer, default=0)
    time_spent_seconds = Column(Integer, nullable=True)
    feedback = Column(Text, nullable=True)
    submitted_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    question_set = relationship("QuestionSet", back_populates="attempt_records")


class QuestionResult(Base):
    __tablename__ = "question_results"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("question_attempts.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    user_answer = Column(Text, nullable=True)
    is_correct = Column(Boolean, default=False)
    time_spent_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class QuestionSetSlide(Base):
    __tablename__ = "question_set_slides"

    id = Column(Integer, primary_key=True, index=True)
    question_set_id = Column(Integer, ForeignKey("question_sets.id"), nullable=False)
    slide_id = Column(Integer, ForeignKey("uploaded_slides.id"), nullable=False)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class UserWeakArea(Base):
    __tablename__ = "user_weak_areas"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    topic = Column(String(255), nullable=False, index=True)
    subtopic = Column(String(255), nullable=True)

    total_questions = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    incorrect_count = Column(Integer, default=0)
    accuracy = Column(Float, default=0.0)

    weakness_score = Column(Float, default=0.0)
    consecutive_wrong = Column(Integer, default=0)
    last_wrong_streak = Column(Integer, default=0)

    practice_sessions = Column(Integer, default=0)
    last_practiced = Column(DateTime, nullable=True)
    improvement_rate = Column(Float, default=0.0)

    status = Column(String(50), default="needs_practice")
    priority = Column(Integer, default=5)

    first_identified = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User")


class WrongAnswerLog(Base):
    __tablename__ = "wrong_answer_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # question_id/question_set_id are nullable because this table also holds
    # solo-quiz and flashcard mistakes (see `source`), which have no
    # question-bank Question/QuestionSet row to point at.
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=True)
    question_set_id = Column(Integer, ForeignKey("question_sets.id"), nullable=True)
    attempt_id = Column(Integer, ForeignKey("question_attempts.id"), nullable=True)
    source = Column(String(20), nullable=False, default="question_bank", server_default="question_bank")
    solo_quiz_question_id = Column(Integer, ForeignKey("solo_quiz_questions.id"), nullable=True)
    flashcard_id = Column(Integer, ForeignKey("flashcards.id"), nullable=True)

    question_text = Column(Text, nullable=False)
    topic = Column(String(255), nullable=True, index=True)
    difficulty = Column(String(20), nullable=True)

    correct_answer = Column(Text, nullable=False)
    user_answer = Column(Text, nullable=False)

    mistake_type = Column(String(100), nullable=True)
    confidence_before = Column(Integer, nullable=True)

    reviewed = Column(Boolean, default=False)
    reviewed_at = Column(DateTime, nullable=True)
    understood_after_review = Column(Boolean, nullable=True)

    ai_explanation = Column(Text, nullable=True)
    ai_explanation_generated_at = Column(DateTime, nullable=True)

    answered_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    question = relationship("Question")
    solo_quiz_question = relationship("SoloQuizQuestion")
    flashcard = relationship("Flashcard")


class PracticeRecommendation(Base):
    __tablename__ = "practice_recommendations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    recommendation_type = Column(String(50), nullable=False)
    topic = Column(String(255), nullable=False)
    reason = Column(Text, nullable=True)
    priority = Column(Integer, default=5)

    question_set_id = Column(Integer, ForeignKey("question_sets.id"), nullable=True)
    suggested_question_count = Column(Integer, default=5)
    suggested_difficulty = Column(String(20), default="medium")

    status = Column(String(50), default="pending")
    completed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)

    user = relationship("User")


class ChatConceptSignal(Base):
    __tablename__ = "chat_concept_signals"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    chat_session_id  = Column(Integer, ForeignKey("chat_sessions.id"), nullable=True)
    concept          = Column(String(255), nullable=False, index=True)
    signal_type      = Column(String(40), nullable=False)
    knowledge_signal = Column(Float, nullable=False)
    message_snippet  = Column(String(300), nullable=True)
    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User")
