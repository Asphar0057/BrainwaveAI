from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float, JSON, Date
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class DailyGoal(Base):
    __tablename__ = "daily_goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    date = Column(Date, default=lambda: datetime.now(timezone.utc).date())
    target = Column(Integer, default=20)
    progress = Column(Integer, default=0)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(50), nullable=True)
    last_name = Column(String(50), nullable=True)
    email = Column(String(100), unique=True, index=True)
    username = Column(String(50), unique=True, index=True)
    hashed_password = Column(String(255))
    age = Column(Integer, nullable=True)
    field_of_study = Column(String(100), nullable=True)
    learning_style = Column(String(50), nullable=True)
    school_university = Column(String(100), nullable=True)
    picture_url = Column(Text, nullable=True)
    google_user = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    chat_sessions = relationship("ChatSession", back_populates="user")
    user_stats = relationship("UserStats", back_populates="user", uselist=False)
    notes = relationship("Note", back_populates="user")
    folders = relationship("Folder", back_populates="user")
    chat_folders = relationship("ChatFolder", back_populates="user")
    activities = relationship("Activity", back_populates="user")
    flashcard_sets = relationship("FlashcardSet", back_populates="user")
    flashcard_study_sessions = relationship("FlashcardStudySession", back_populates="user")
    user_profile = relationship("UserPersonalityProfile", back_populates="user", uselist=False)
    learning_patterns = relationship("LearningPattern", back_populates="user")
    user_preferences = relationship("UserPreferences", back_populates="user", uselist=False)
    topic_mastery = relationship("TopicMastery", back_populates="user")
    feedback_entries = relationship("UserFeedback", back_populates="user")
    enhanced_stats = relationship("EnhancedUserStats", back_populates="user", uselist=False)
    daily_metrics = relationship("DailyLearningMetrics", back_populates="user")
    achievements = relationship("UserAchievement", back_populates="user")
    comprehensive_profile = relationship("ComprehensiveUserProfile", back_populates="user", uselist=False)
    podcast_sessions = relationship("PodcastSessionMemory", back_populates="user")
    podcast_bookmarks = relationship("PodcastBookmark", back_populates="user")
    uploaded_slides = relationship("UploadedSlide", back_populates="user")
    uploaded_documents = relationship("UploadedDocument", back_populates="user")
    context_folders = relationship("ContextFolder", back_populates="user")
    question_sets_new = relationship("QuestionSet", back_populates="user")
    question_sessions_new = relationship("QuestionSession", back_populates="user")
    performance_metrics = relationship("UserPerformanceMetrics", back_populates="user")
    gamification_stats = relationship("UserGamificationStats", back_populates="user", uselist=False)
    media_files = relationship("MediaFile", back_populates="user")
    learning_paths = relationship("LearningPath", backref="user")
    learning_path_progress = relationship("LearningPathProgress", backref="user")
    learning_node_progress = relationship("LearningNodeProgress", backref="user")


class UserStats(Base):
    __tablename__ = "user_stats"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    total_lessons = Column(Integer, default=0)
    total_hours = Column(Float, default=0.0)
    day_streak = Column(Integer, default=0)
    accuracy_percentage = Column(Float, default=0.0)
    last_activity = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="user_stats")


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)

    preferred_explanation_style = Column(String(50), default="balanced")
    preferred_example_types = Column(JSON, nullable=True)
    language_complexity = Column(String(50), default="medium")

    favorite_subjects = Column(JSON, nullable=True)
    avoided_subjects = Column(JSON, nullable=True)
    preferred_difficulty_progression = Column(String(50), default="gradual")

    likes_challenges = Column(Boolean, default=True)
    likes_games = Column(Boolean, default=False)
    likes_storytelling = Column(Boolean, default=True)
    likes_step_by_step = Column(Boolean, default=True)

    wants_progress_updates = Column(Boolean, default=True)
    wants_encouragement = Column(Boolean, default=True)
    wants_constructive_criticism = Column(Boolean, default=True)

    prefers_visual_aids = Column(Boolean, default=False)
    prefers_mnemonics = Column(Boolean, default=False)
    prefers_analogies = Column(Boolean, default=True)
    prefers_real_examples = Column(Boolean, default=True)

    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="user_preferences")


class UserPersonalityProfile(Base):
    __tablename__ = "user_personality_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)

    formality_preference = Column(Float, default=0.5)
    humor_preference = Column(Float, default=0.5)
    detail_preference = Column(Float, default=0.5)
    encouragement_preference = Column(Float, default=0.7)

    pace_preference = Column(String(50), default="medium")
    question_frequency = Column(Float, default=0.5)
    example_preference = Column(Float, default=0.7)
    repetition_tolerance = Column(Float, default=0.5)

    visual_learner_score = Column(Float, default=0.5)
    auditory_learner_score = Column(Float, default=0.5)
    kinesthetic_learner_score = Column(Float, default=0.5)
    reading_learner_score = Column(Float, default=0.5)

    session_length_preference = Column(Integer, default=30)
    break_frequency = Column(Integer, default=15)
    preferred_time_of_day = Column(String(50), nullable=True)

    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    profile_confidence = Column(Float, default=0.1)

    user = relationship("User", back_populates="user_profile")


class LearningPattern(Base):
    __tablename__ = "learning_patterns"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)

    most_active_hour = Column(Integer, nullable=True)
    most_active_day = Column(Integer, nullable=True)
    average_session_length = Column(Float, default=0.0)
    peak_performance_time = Column(String(50), nullable=True)

    questions_per_session = Column(Float, default=0.0)
    concepts_mastered_per_hour = Column(Float, default=0.0)
    retention_rate = Column(Float, default=0.0)

    help_seeking_frequency = Column(Float, default=0.0)
    topic_jumping_tendency = Column(Float, default=0.0)
    depth_vs_breadth = Column(Float, default=0.5)

    average_response_time = Column(Float, default=0.0)
    session_completion_rate = Column(Float, default=0.0)
    comeback_likelihood = Column(Float, default=0.0)

    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="learning_patterns")


class EnhancedUserStats(Base):
    __tablename__ = "enhanced_user_stats"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)

    learning_velocity = Column(Float, default=0.0)
    comprehension_rate = Column(Float, default=0.0)
    retention_score = Column(Float, default=0.0)
    consistency_rating = Column(Float, default=0.0)

    weekly_sessions = Column(Integer, default=0)
    monthly_goal = Column(Integer, default=100)
    achievement_score = Column(Integer, default=0)
    study_level = Column(String(50), default="Beginner")
    favorite_subject = Column(String(100), default="General")

    total_questions = Column(Integer, default=0)
    correct_answers = Column(Integer, default=0)
    average_session_time = Column(Float, default=0.0)
    total_flashcards = Column(Integer, default=0)
    total_notes = Column(Integer, default=0)
    total_chat_sessions = Column(Integer, default=0)

    last_active_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="enhanced_stats")


class DailyLearningMetrics(Base):
    __tablename__ = "daily_learning_metrics"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    date = Column(Date, default=datetime.now(timezone.utc).date)

    sessions_completed = Column(Integer, default=0)
    time_spent_minutes = Column(Float, default=0.0)
    questions_answered = Column(Integer, default=0)
    correct_answers = Column(Integer, default=0)
    topics_studied = Column(Text, default="[]")

    accuracy_rate = Column(Float, default=0.0)
    engagement_score = Column(Float, default=0.0)
    difficulty_level_attempted = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="daily_metrics")


class StudentStyleModel(Base):
    __tablename__ = "student_style_models"

    id                       = Column(Integer, primary_key=True, index=True)
    user_id                  = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    bandit_state             = Column(Text, nullable=True)
    pending_style            = Column(String(40), nullable=True)
    pending_context          = Column(Text, nullable=True)
    student_classifier_state = Column(Text, nullable=True)
    updated_at               = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")


class PasswordResetOTP(Base):
    __tablename__ = "password_reset_otps"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    email = Column(String(100), index=True, nullable=False)
    otp_hash = Column(String(255), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, default=0)
    consumed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")


class RegistrationOTP(Base):
    __tablename__ = "registration_otps"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), index=True, nullable=False)
    username = Column(String(50), index=True, nullable=False)
    otp_hash = Column(String(255), nullable=False)
    registration_data = Column(Text, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, default=0)
    consumed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AccountDeletionOTP(Base):
    __tablename__ = "account_deletion_otps"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    email = Column(String(100), index=True, nullable=False)
    otp_hash = Column(String(255), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, default=0)
    consumed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")


class ComprehensiveUserProfile(Base):
    __tablename__ = "comprehensive_user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)

    is_college_student = Column(Boolean, default=True)
    college_level = Column(String(100), nullable=True)
    major = Column(String(200), nullable=True)
    main_subject = Column(String(200), nullable=True)

    preferred_subjects = Column(Text, nullable=True)
    brainwave_goal = Column(String(100), nullable=True)
    difficulty_level = Column(String(50), default="intermediate")
    learning_pace = Column(String(50), default="moderate")
    best_study_times = Column(Text, nullable=True)
    weak_areas = Column(Text, nullable=True)
    strong_areas = Column(Text, nullable=True)

    quiz_responses = Column(Text, nullable=True)
    quiz_completed = Column(Boolean, default=False)
    quiz_skipped = Column(Boolean, default=False)

    primary_archetype = Column(String(50), nullable=True)
    secondary_archetype = Column(String(50), nullable=True)
    archetype_scores = Column(Text, nullable=True)
    archetype_description = Column(Text, nullable=True)

    learning_preferences = Column(Text, nullable=True)
    derived_teaching_style = Column(String(50), nullable=True)

    show_study_insights = Column(Boolean, default=True)
    notifications_enabled = Column(Boolean, default=True)

    subscription_tier = Column(String(30), default="starter")
    billing_cycle = Column(String(20), default="monthly")
    subscription_status = Column(String(20), default="active")
    subscription_started_at = Column(DateTime, nullable=True)
    stripe_customer_id = Column(String(120), nullable=True)
    stripe_subscription_id = Column(String(120), nullable=True)
    stripe_price_id = Column(String(120), nullable=True)
    stripe_checkout_session_id = Column(String(120), nullable=True)
    billing_currency = Column(String(12), nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    cancel_at_period_end = Column(Boolean, default=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="comprehensive_profile")
