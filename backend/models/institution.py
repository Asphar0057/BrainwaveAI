from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(160), nullable=False)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    institution_type = Column(String(30), nullable=False, default="university")
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)

    memberships = relationship(
        "OrganizationMembership",
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    terms = relationship(
        "AcademicTerm", back_populates="organization", cascade="all, delete-orphan"
    )
    courses = relationship(
        "Course", back_populates="organization", cascade="all, delete-orphan"
    )


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "user_id", name="uq_organization_membership_user"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(30), nullable=False)
    status = Column(String(20), nullable=False, default="active")
    joined_at = Column(DateTime, nullable=False, default=utc_now)

    organization = relationship("Organization", back_populates="memberships")
    user = relationship("User")


class AcademicTerm(Base):
    __tablename__ = "academic_terms"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "name", name="uq_academic_term_organization_name"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String(100), nullable=False)
    starts_on = Column(Date, nullable=False)
    ends_on = Column(Date, nullable=False)
    is_current = Column(Boolean, nullable=False, default=False)

    organization = relationship("Organization", back_populates="terms")
    sections = relationship("ClassSection", back_populates="academic_term")


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "code", name="uq_course_organization_code"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    code = Column(String(30), nullable=False)
    title = Column(String(160), nullable=False)
    description = Column(Text)
    department = Column(String(100))
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)

    organization = relationship("Organization", back_populates="courses")
    creator = relationship("User")
    sections = relationship(
        "ClassSection", back_populates="course", cascade="all, delete-orphan"
    )
    materials = relationship(
        "CourseMaterial", back_populates="course", cascade="all, delete-orphan"
    )


class ClassSection(Base):
    __tablename__ = "class_sections"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    academic_term_id = Column(
        Integer, ForeignKey("academic_terms.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String(80), nullable=False, default="Section A")
    schedule_text = Column(String(120))
    room = Column(String(80))
    instructor_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status = Column(String(20), nullable=False, default="active")

    course = relationship("Course", back_populates="sections")
    academic_term = relationship("AcademicTerm", back_populates="sections")
    instructor = relationship("User")
    enrollments = relationship(
        "Enrollment", back_populates="section", cascade="all, delete-orphan"
    )
    assignments = relationship(
        "Assignment", back_populates="section", cascade="all, delete-orphan"
    )
    announcements = relationship(
        "Announcement", back_populates="section", cascade="all, delete-orphan"
    )
    activity_events = relationship(
        "ClassActivityEvent", back_populates="section", cascade="all, delete-orphan"
    )
    attendance_records = relationship(
        "AttendanceRecord", back_populates="section", cascade="all, delete-orphan"
    )
    messages = relationship(
        "ClassroomMessage", back_populates="section", cascade="all, delete-orphan"
    )
    materials = relationship("CourseMaterial", back_populates="section")


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("section_id", "student_id", name="uq_enrollment_student"),
    )

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(
        Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False
    )
    student_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status = Column(String(20), nullable=False, default="active")
    progress_percent = Column(Integer, nullable=False, default=0)
    mastery_percent = Column(Integer, nullable=False, default=0)
    last_active_at = Column(DateTime)
    enrolled_at = Column(DateTime, nullable=False, default=utc_now)

    section = relationship("ClassSection", back_populates="enrollments")
    student = relationship("User")


class CourseMaterial(Base):
    __tablename__ = "course_materials"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    section_id = Column(
        Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=True
    )
    title = Column(String(180), nullable=False)
    material_type = Column(String(30), nullable=False, default="document")
    source_url = Column(String(500))
    storage_path = Column(String(500))
    original_filename = Column(String(255))
    content_type = Column(String(120))
    file_size = Column(Integer)
    status = Column(String(20), nullable=False, default="published")
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime, nullable=False, default=utc_now)

    course = relationship("Course", back_populates="materials")
    section = relationship("ClassSection", back_populates="materials")
    creator = relationship("User")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(
        Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String(180), nullable=False)
    description = Column(Text)
    assignment_type = Column(String(30), nullable=False, default="practice")
    due_at = Column(DateTime)
    points_possible = Column(Float, nullable=False, default=100)
    estimated_minutes = Column(Integer, nullable=False, default=30)
    status = Column(String(20), nullable=False, default="published")
    ai_policy = Column(String(40), nullable=False, default="guided")
    rubric_text = Column(Text)
    weight_percent = Column(Float, nullable=False, default=0)
    start_at = Column(DateTime)
    allow_resubmission = Column(Boolean, nullable=False, default=True)
    max_attempts = Column(Integer, nullable=False, default=3)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)

    section = relationship("ClassSection", back_populates="assignments")
    creator = relationship("User")
    submissions = relationship(
        "Submission", back_populates="assignment", cascade="all, delete-orphan"
    )


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint(
            "assignment_id", "student_id", name="uq_submission_assignment_student"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(
        Integer, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False
    )
    student_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status = Column(String(20), nullable=False, default="draft")
    content_text = Column(Text)
    attachment_url = Column(String(500))
    attachment_storage_path = Column(String(500))
    attachment_name = Column(String(255))
    attachment_content_type = Column(String(120))
    attachment_size = Column(Integer)
    attempt_number = Column(Integer, nullable=False, default=1)
    score = Column(Float)
    submitted_at = Column(DateTime)
    feedback = Column(Text)
    graded_at = Column(DateTime)
    graded_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)

    assignment = relationship("Assignment", back_populates="submissions")
    student = relationship("User", foreign_keys=[student_id])
    grader = relationship("User", foreign_keys=[graded_by])


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(
        Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False
    )
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    title = Column(String(180), nullable=False)
    body = Column(Text, nullable=False)
    published_at = Column(DateTime, nullable=False, default=utc_now)

    section = relationship("ClassSection", back_populates="announcements")
    author = relationship("User")


class ClassActivityEvent(Base):
    __tablename__ = "class_activity_events"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(
        Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False
    )
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    event_type = Column(String(40), nullable=False)
    entity_type = Column(String(40), nullable=False)
    entity_id = Column(Integer)
    title = Column(String(180), nullable=False)
    detail = Column(Text)
    visible_to_students = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)

    section = relationship("ClassSection", back_populates="activity_events")
    actor = relationship("User")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint(
            "section_id",
            "student_id",
            "class_date",
            name="uq_attendance_section_student_date",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(
        Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False
    )
    student_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    class_date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="present")
    note = Column(String(300))
    marked_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    marked_at = Column(DateTime, nullable=False, default=utc_now)

    section = relationship("ClassSection", back_populates="attendance_records")
    student = relationship("User", foreign_keys=[student_id])
    marker = relationship("User", foreign_keys=[marked_by])


class ClassroomMessage(Base):
    __tablename__ = "classroom_messages"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(
        Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False
    )
    sender_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    recipient_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    assignment_id = Column(
        Integer, ForeignKey("assignments.id", ondelete="SET NULL")
    )
    subject = Column(String(180), nullable=False)
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)

    section = relationship("ClassSection", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])
    assignment = relationship("Assignment")
