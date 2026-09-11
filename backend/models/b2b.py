"""Company administration and the approved learning / intervention loop."""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Float, UniqueConstraint
from database import Base
from models.institution import utc_now


class OrganizationLicense(Base):
    __tablename__ = 'organization_licenses'
    organization_id = Column(Integer, ForeignKey('organizations.id', ondelete='CASCADE'), primary_key=True)
    seat_limit = Column(Integer, nullable=False, default=25)
    plan = Column(String(30), nullable=False, default='pilot')
    # Operator-managed contract information. Never grants personal AI entitlements.
    expires_at = Column(DateTime)


class OrganizationInvite(Base):
    __tablename__ = 'organization_invites'
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    section_id = Column(Integer, ForeignKey('class_sections.id', ondelete='CASCADE'))
    email = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default='pending')
    expires_at = Column(DateTime, nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class OrganizationAudit(Base):
    __tablename__ = 'organization_audit'
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
    action = Column(String(80), nullable=False)
    detail = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class LearningLesson(Base):
    __tablename__ = 'learning_lessons'
    id = Column(Integer, primary_key=True)
    section_id = Column(Integer, ForeignKey('class_sections.id', ondelete='CASCADE'), nullable=False, index=True)
    title = Column(String(180), nullable=False)
    objective = Column(String(500), nullable=False)
    content = Column(Text, nullable=False)
    source_url = Column(String(500))
    position = Column(Integer, nullable=False, default=1)
    minutes = Column(Integer, nullable=False, default=10)
    status = Column(String(20), nullable=False, default='draft')
    created_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class LessonCompletion(Base):
    __tablename__ = 'lesson_completions'
    __table_args__ = (UniqueConstraint('lesson_id', 'student_id', name='uq_lesson_completion'),)
    id = Column(Integer, primary_key=True)
    lesson_id = Column(Integer, ForeignKey('learning_lessons.id', ondelete='CASCADE'), nullable=False)
    student_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    confidence = Column(Integer, nullable=False)
    completed_at = Column(DateTime, nullable=False, default=utc_now)


class LearningCheckpoint(Base):
    __tablename__ = 'learning_checkpoints'
    id = Column(Integer, primary_key=True)
    section_id = Column(Integer, ForeignKey('class_sections.id', ondelete='CASCADE'), nullable=False, index=True)
    title = Column(String(180), nullable=False)
    concept = Column(String(120), nullable=False)
    questions = Column(JSON, nullable=False)
    status = Column(String(20), nullable=False, default='draft')
    approved_by = Column(Integer, ForeignKey('users.id'))
    approved_at = Column(DateTime)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class CheckpointAttempt(Base):
    __tablename__ = 'checkpoint_attempts'
    __table_args__ = (UniqueConstraint('checkpoint_id', 'student_id', name='uq_checkpoint_student'),)
    id = Column(Integer, primary_key=True)
    checkpoint_id = Column(Integer, ForeignKey('learning_checkpoints.id', ondelete='CASCADE'), nullable=False)
    student_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    answers = Column(JSON, nullable=False)
    confidence = Column(JSON, nullable=False)
    results = Column(JSON, nullable=False)
    score_percent = Column(Float, nullable=False)
    submitted_at = Column(DateTime, nullable=False, default=utc_now)


class LearningIntervention(Base):
    __tablename__ = 'learning_interventions'
    id = Column(Integer, primary_key=True)
    section_id = Column(Integer, ForeignKey('class_sections.id', ondelete='CASCADE'), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    title = Column(String(180), nullable=False)
    instructions = Column(Text, nullable=False)
    evidence = Column(JSON, nullable=False)
    due_at = Column(DateTime)
    status = Column(String(20), nullable=False, default='assigned')
    student_response = Column(Text)
    review = Column(Text)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    responded_at = Column(DateTime)
    reviewed_at = Column(DateTime)


class SubmissionRevision(Base):
    __tablename__ = 'submission_revisions'
    id = Column(Integer, primary_key=True)
    submission_id = Column(Integer, ForeignKey('submissions.id', ondelete='CASCADE'), nullable=False, index=True)
    attempt_number = Column(Integer, nullable=False)
    event = Column(String(20), nullable=False)
    snapshot = Column(JSON, nullable=False)
    actor_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
