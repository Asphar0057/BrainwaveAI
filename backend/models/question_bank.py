from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

def create_question_bank_models(Base):
    
    class UploadedDocument(Base):
        __tablename__ = "uploaded_documents"
        
        id = Column(Integer, primary_key=True, index=True)
        user_id = Column(Integer, ForeignKey("users.id"))
        filename = Column(String(255))
        document_type = Column(String(50))
        content = Column(Text)
        document_metadata = Column(Text)
        storage_path = Column(String(500), nullable=True)
        storage_type = Column(String(30), nullable=True)
        storage_url = Column(String(1000), nullable=True)
        created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
        
        user = relationship("User", back_populates="uploaded_documents")

    class QuestionSet(Base):
        __tablename__ = "question_sets"
        
        id = Column(Integer, primary_key=True, index=True)
        user_id = Column(Integer, ForeignKey("users.id"))
        title = Column(String(255))
        description = Column(Text)
        source_type = Column(String(50))
        source_id = Column(Integer, nullable=True)
        bandit_episode_id = Column(String(36), nullable=True, index=True)
        bandit_topic_key = Column(String(50), nullable=True)
        total_questions = Column(Integer, default=0)
        best_score = Column(Integer, default=0)
        attempts = Column(Integer, default=0)
        created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
        updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
        
        user = relationship("User", back_populates="question_sets_new")
        questions = relationship("Question", back_populates="question_set", cascade="all, delete-orphan")
        sessions = relationship("QuestionSession", back_populates="question_set", cascade="all, delete-orphan")
        attempt_records = relationship("QuestionAttempt", back_populates="question_set", cascade="all, delete-orphan")

    class Question(Base):
        __tablename__ = "questions"
        
        id = Column(Integer, primary_key=True, index=True)
        question_set_id = Column(Integer, ForeignKey("question_sets.id"))
        question_text = Column(Text)
        question_type = Column(String(50))
        difficulty = Column(String(20))
        topic = Column(String(255))
        correct_answer = Column(Text)
        options = Column(Text)
        explanation = Column(Text)
        points = Column(Integer, default=1)
        order_index = Column(Integer, default=0)
        cognitive_level = Column(String(50), nullable=True)
        estimated_time_seconds = Column(Integer, nullable=True)
        
        question_set = relationship("QuestionSet", back_populates="questions")

    class QuestionSession(Base):
        __tablename__ = "question_sessions"
        
        id = Column(Integer, primary_key=True, index=True)
        user_id = Column(Integer, ForeignKey("users.id"))
        question_set_id = Column(Integer, ForeignKey("question_sets.id"))
        score = Column(Integer)
        total_questions = Column(Integer)
        correct_count = Column(Integer)
        results = Column(Text)
        started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
        completed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
        time_taken_seconds = Column(Integer, nullable=True)
        
        user = relationship("User", back_populates="question_sessions_new")
        question_set = relationship("QuestionSet", back_populates="sessions")

    class UserPerformanceMetrics(Base):
        __tablename__ = "user_performance_metrics"
        
        id = Column(Integer, primary_key=True, index=True)
        user_id = Column(Integer, ForeignKey("users.id"))
        topic = Column(String(255))
        difficulty_level = Column(String(20))
        total_attempts = Column(Integer, default=0)
        correct_attempts = Column(Integer, default=0)
        accuracy = Column(Float, default=0.0)
        average_time_seconds = Column(Float, default=0.0)
        last_attempted = Column(DateTime, default=lambda: datetime.now(timezone.utc))
        mastery_level = Column(String(50), default="beginner")
        
        user = relationship("User", back_populates="performance_metrics")
    
    return UploadedDocument, QuestionSet, Question, QuestionSession, UserPerformanceMetrics
