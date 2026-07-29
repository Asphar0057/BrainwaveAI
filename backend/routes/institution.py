from datetime import date, datetime, timezone
import re
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import RedirectResponse, Response
from pydantic import AnyHttpUrl, BaseModel, Field
from sqlalchemy.orm import Session, joinedload

import models
from database import get_db
from deps import enforce_request_user_scope, get_current_user
from services.access_control import (
    landing_route_for_role,
    normalize_account_role,
    require_account_role,
)
from services.storage_service import StorageService


router = APIRouter(
    prefix="/api/institution",
    tags=["institution"],
    dependencies=[Depends(enforce_request_user_scope)],
)


def _display_name(user: models.User | None) -> str:
    if not user:
        return "Unassigned"
    full_name = " ".join(
        part for part in (user.first_name, user.last_name) if part
    ).strip()
    return full_name or user.username


def _user_summary(user: models.User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "display_name": _display_name(user),
        "email": user.email,
        "picture_url": user.picture_url,
    }


def _datetime_sort_key(value: datetime | None) -> float:
    if value is None:
        return float("inf")
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def _membership_query(db: Session, user_id: int):
    return (
        db.query(models.OrganizationMembership)
        .options(joinedload(models.OrganizationMembership.organization))
        .filter(
            models.OrganizationMembership.user_id == user_id,
            models.OrganizationMembership.status == "active",
        )
    )


def _accessible_section(
    db: Session,
    section_id: int,
    current_user: models.User,
) -> models.ClassSection:
    role = normalize_account_role(current_user.account_role)
    query = (
        db.query(models.ClassSection)
        .options(
            joinedload(models.ClassSection.course),
            joinedload(models.ClassSection.instructor),
            joinedload(models.ClassSection.enrollments).joinedload(
                models.Enrollment.student
            ),
            joinedload(models.ClassSection.assignments).joinedload(
                models.Assignment.submissions
            ),
        )
        .filter(
            models.ClassSection.id == section_id,
            models.ClassSection.status == "active",
        )
    )
    if role == "student":
        query = query.join(models.Enrollment).filter(
            models.Enrollment.student_id == current_user.id,
            models.Enrollment.status == "active",
        )
    elif role == "educator":
        query = query.filter(models.ClassSection.instructor_id == current_user.id)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This classroom is available only to enrolled students and assigned educators.",
        )
    section = query.first()
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class section not found or you do not have access.",
        )
    return section


def _assignment_row(
    assignment: models.Assignment,
    student_id: int | None = None,
) -> dict:
    submission = (
        next(
            (
                row
                for row in assignment.submissions
                if row.student_id == student_id
            ),
            None,
        )
        if student_id
        else None
    )
    assignment_status = submission.status if submission else "not_started"
    if student_id and not submission and assignment.start_at:
        now = datetime.now(timezone.utc)
        start_at = assignment.start_at
        if start_at.tzinfo is None:
            now = now.replace(tzinfo=None)
        if start_at > now:
            assignment_status = "scheduled"
    return {
        "id": assignment.id,
        "title": assignment.title,
        "description": assignment.description,
        "due_at": assignment.due_at,
        "assignment_type": assignment.assignment_type,
        "estimated_minutes": assignment.estimated_minutes,
        "points_possible": assignment.points_possible,
        "ai_policy": assignment.ai_policy,
        "rubric_text": assignment.rubric_text,
        "weight_percent": assignment.weight_percent,
        "start_at": assignment.start_at,
        "allow_resubmission": assignment.allow_resubmission,
        "max_attempts": assignment.max_attempts,
        "status": assignment_status,
        "submission_id": submission.id if submission else None,
        "content_text": submission.content_text if submission else None,
        "attachment_url": submission.attachment_url if submission else None,
        "attempt_number": submission.attempt_number if submission else 0,
        "score": submission.score if submission else None,
        "feedback": submission.feedback if submission else None,
        "submitted_at": submission.submitted_at if submission else None,
        "graded_at": submission.graded_at if submission else None,
        "attachment_name": submission.attachment_name if submission else None,
        "attachment_size": submission.attachment_size if submission else None,
    }


def _ensure_assignment_available(assignment: models.Assignment) -> None:
    if not assignment.start_at:
        return
    now = datetime.now(timezone.utc)
    start_at = assignment.start_at
    if start_at.tzinfo is None:
        now = now.replace(tzinfo=None)
    if start_at > now:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This assignment opens on {start_at.strftime('%d %b %Y at %H:%M')}.",
        )


def _notify(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str,
) -> None:
    db.add(models.Notification(
        user_id=user_id,
        title=title[:200],
        message=message,
        notification_type=notification_type,
        is_read=False,
    ))


def _notify_section_students(
    db: Session,
    section: models.ClassSection,
    title: str,
    message: str,
    notification_type: str,
) -> None:
    for enrollment in section.enrollments:
        if enrollment.status == "active":
            _notify(db, enrollment.student_id, title, message, notification_type)


def _safe_filename(value: str | None) -> str:
    cleaned = re.sub(r"[^\w.\-]", "_", value or "upload")[:180]
    return cleaned or "upload"


def _leaderboard_for_section(
    section: models.ClassSection,
    current_user_id: int,
) -> list[dict]:
    published = [
        assignment
        for assignment in section.assignments
        if assignment.status == "published"
    ]
    rows = []
    for enrollment in section.enrollments:
        if enrollment.status != "active":
            continue
        submissions = [
            submission
            for assignment in published
            for submission in assignment.submissions
            if submission.student_id == enrollment.student_id
        ]
        completed = sum(
            row.status in {"submitted", "graded"} for row in submissions
        )
        completion_rate = (
            round(100 * completed / len(published)) if published else 0
        )
        grade_percentages = []
        for assignment in published:
            graded = next(
                (
                    row
                    for row in assignment.submissions
                    if row.student_id == enrollment.student_id
                    and row.status == "graded"
                    and row.score is not None
                ),
                None,
            )
            if graded and assignment.points_possible:
                grade_percentages.append(
                    min(100, 100 * graded.score / assignment.points_possible)
                )
        grade_average = (
            round(sum(grade_percentages) / len(grade_percentages))
            if grade_percentages
            else 0
        )
        score = round(
            enrollment.mastery_percent * 0.45
            + enrollment.progress_percent * 0.30
            + grade_average * 0.20
            + completion_rate * 0.05
        )
        rows.append(
            {
                "student": {
                    "id": enrollment.student.id,
                    "display_name": _display_name(enrollment.student),
                    "picture_url": enrollment.student.picture_url,
                },
                "score": score,
                "mastery_percent": enrollment.mastery_percent,
                "progress_percent": enrollment.progress_percent,
                "grade_average": grade_average,
                "completion_rate": completion_rate,
                "is_current_user": enrollment.student_id == current_user_id,
            }
        )
    rows.sort(
        key=lambda row: (
            -row["score"],
            -row["mastery_percent"],
            row["student"]["display_name"].lower(),
        )
    )
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    return rows


def _record_activity(
    db: Session,
    *,
    section_id: int,
    actor_id: int,
    event_type: str,
    entity_type: str,
    entity_id: int | None,
    title: str,
    detail: str | None = None,
    visible_to_students: bool = True,
) -> None:
    db.add(
        models.ClassActivityEvent(
            section_id=section_id,
            actor_id=actor_id,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            title=title,
            detail=detail,
            visible_to_students=visible_to_students,
        )
    )


def _recalculate_enrollment(
    db: Session,
    section: models.ClassSection,
    student_id: int,
) -> None:
    enrollment = (
        db.query(models.Enrollment)
        .filter(
            models.Enrollment.section_id == section.id,
            models.Enrollment.student_id == student_id,
            models.Enrollment.status == "active",
        )
        .first()
    )
    if not enrollment:
        return
    published = (
        db.query(models.Assignment)
        .filter(
            models.Assignment.section_id == section.id,
            models.Assignment.status == "published",
        )
        .all()
    )
    if not published:
        return
    completed = 0
    grade_percentages = []
    for assignment in published:
        submission = (
            db.query(models.Submission)
            .filter(
                models.Submission.assignment_id == assignment.id,
                models.Submission.student_id == student_id,
            )
            .first()
        )
        if submission and submission.status in {"submitted", "graded"}:
            completed += 1
        if (
            submission
            and submission.status == "graded"
            and submission.score is not None
            and assignment.points_possible
        ):
            grade_percentages.append(
                min(100, 100 * submission.score / assignment.points_possible)
            )
    enrollment.progress_percent = round(100 * completed / len(published))
    if grade_percentages:
        enrollment.mastery_percent = round(
            sum(grade_percentages) / len(grade_percentages)
        )
    enrollment.last_active_at = datetime.now(timezone.utc)


def _attendance_summary(records: list[models.AttendanceRecord]) -> dict:
    counted = [
        record for record in records if record.status in {"present", "late", "absent"}
    ]
    attended = sum(record.status in {"present", "late"} for record in counted)
    return {
        "attended": attended,
        "total": len(counted),
        "percent": round(100 * attended / len(counted)) if counted else None,
    }


@router.get("/session")
def get_institution_session(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = normalize_account_role(current_user.account_role)
    memberships = _membership_query(db, current_user.id).all()
    return {
        "role": role,
        "landing_route": landing_route_for_role(role),
        "user": _user_summary(current_user),
        "memberships": [
            {
                "id": membership.id,
                "role": membership.role,
                "organization": {
                    "id": membership.organization.id,
                    "name": membership.organization.name,
                    "slug": membership.organization.slug,
                    "institution_type": membership.organization.institution_type,
                },
            }
            for membership in memberships
        ],
    }


@router.get("/student/dashboard")
def get_student_dashboard(
    current_user: models.User = Depends(require_account_role("student")),
    db: Session = Depends(get_db),
):
    enrollments = (
        db.query(models.Enrollment)
        .options(
            joinedload(models.Enrollment.section)
            .joinedload(models.ClassSection.course)
            .joinedload(models.Course.organization),
            joinedload(models.Enrollment.section).joinedload(
                models.ClassSection.instructor
            ),
            joinedload(models.Enrollment.section).joinedload(
                models.ClassSection.academic_term
            ),
            joinedload(models.Enrollment.section)
            .joinedload(models.ClassSection.assignments)
            .joinedload(models.Assignment.submissions),
        )
        .filter(
            models.Enrollment.student_id == current_user.id,
            models.Enrollment.status == "active",
        )
        .all()
    )

    organization = None
    term = None
    courses = []
    assignment_rows = []
    section_ids = []
    now = datetime.now(timezone.utc)

    for enrollment in enrollments:
        section = enrollment.section
        section_ids.append(section.id)
        organization = organization or section.course.organization
        term = term or section.academic_term
        pending_assignments = []

        for assignment in section.assignments:
            if assignment.status != "published":
                continue
            submission = next(
                (
                    row
                    for row in assignment.submissions
                    if row.student_id == current_user.id
                ),
                None,
            )
            submission_status = submission.status if submission else "not_started"
            row = {
                **_assignment_row(assignment, current_user.id),
                "course_code": section.course.code,
                "course_title": section.course.title,
                "section_id": section.id,
            }
            assignment_rows.append(row)
            if submission_status not in {"submitted", "graded"}:
                pending_assignments.append(row)

        next_assignment = min(
            pending_assignments,
            key=lambda item: _datetime_sort_key(item["due_at"]),
            default=None,
        )
        attendance_records = (
            db.query(models.AttendanceRecord)
            .filter(
                models.AttendanceRecord.section_id == section.id,
                models.AttendanceRecord.student_id == current_user.id,
            )
            .all()
        )
        courses.append(
            {
                "id": section.course.id,
                "section_id": section.id,
                "code": section.course.code,
                "title": section.course.title,
                "teacher": _display_name(section.instructor),
                "schedule": section.schedule_text,
                "room": section.room,
                "progress_percent": enrollment.progress_percent,
                "mastery_percent": enrollment.mastery_percent,
                "attendance": _attendance_summary(attendance_records),
                "next_assignment": next_assignment,
            }
        )

    assignment_rows.sort(key=lambda item: _datetime_sort_key(item["due_at"]))
    upcoming = [
        item
        for item in assignment_rows
        if item["status"] not in {"submitted", "graded"}
        and (
            item["due_at"] is None
            or (
                item["due_at"].replace(tzinfo=timezone.utc)
                if item["due_at"].tzinfo is None
                else item["due_at"].astimezone(timezone.utc)
            )
            >= now
        )
    ]

    announcements = []
    if section_ids:
        announcement_models = (
            db.query(models.Announcement)
            .options(
                joinedload(models.Announcement.section).joinedload(
                    models.ClassSection.course
                ),
                joinedload(models.Announcement.author),
            )
            .filter(models.Announcement.section_id.in_(section_ids))
            .order_by(models.Announcement.published_at.desc())
            .limit(5)
            .all()
        )
        announcements = [
            {
                "id": item.id,
                "title": item.title,
                "body": item.body,
                "course_code": item.section.course.code,
                "author": _display_name(item.author),
                "published_at": item.published_at,
            }
            for item in announcement_models
        ]

    weakest_course = min(
        courses, key=lambda item: item["mastery_percent"], default=None
    )
    completed = sum(
        1 for item in assignment_rows if item["status"] in {"submitted", "graded"}
    )
    attendance_totals = [
        course["attendance"] for course in courses if course["attendance"]["total"]
    ]
    attendance_attended = sum(item["attended"] for item in attendance_totals)
    attendance_classes = sum(item["total"] for item in attendance_totals)
    return {
        "role": "student",
        "user": _user_summary(current_user),
        "organization": (
            {
                "id": organization.id,
                "name": organization.name,
                "slug": organization.slug,
            }
            if organization
            else None
        ),
        "term": (
            {
                "id": term.id,
                "name": term.name,
                "starts_on": term.starts_on,
                "ends_on": term.ends_on,
            }
            if term
            else None
        ),
        "summary": {
            "active_courses": len(courses),
            "upcoming_assignments": len(upcoming),
            "completed_assignments": completed,
            "average_mastery": round(
                sum(course["mastery_percent"] for course in courses) / len(courses)
            )
            if courses
            else 0,
            "attendance_percent": (
                round(100 * attendance_attended / attendance_classes)
                if attendance_classes
                else None
            ),
        },
        "courses": courses,
        "assignments": assignment_rows,
        "upcoming_assignments": upcoming[:6],
        "announcements": announcements,
        "recommended_focus": (
            {
                "course_code": weakest_course["code"],
                "title": f"Strengthen {weakest_course['title']}",
                "description": "Review your weakest course, then test recall with a short practice set.",
                "mastery_percent": weakest_course["mastery_percent"],
                "target_percent": min(100, weakest_course["mastery_percent"] + 12),
                "duration_minutes": 24,
                "route": "/questions",
            }
            if weakest_course
            else None
        ),
    }


@router.get("/educator/dashboard")
def get_educator_dashboard(
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    sections = (
        db.query(models.ClassSection)
        .options(
            joinedload(models.ClassSection.course).joinedload(
                models.Course.organization
            ),
            joinedload(models.ClassSection.academic_term),
            joinedload(models.ClassSection.enrollments).joinedload(
                models.Enrollment.student
            ),
            joinedload(models.ClassSection.assignments).joinedload(
                models.Assignment.submissions
            ),
        )
        .filter(
            models.ClassSection.instructor_id == current_user.id,
            models.ClassSection.status == "active",
        )
        .all()
    )

    organization = sections[0].course.organization if sections else None
    term = sections[0].academic_term if sections else None
    attention_queue = []
    class_health = []
    agenda = []
    review_workload = []
    active_student_ids = set()

    for section in sections:
        active_enrollments = [
            enrollment
            for enrollment in section.enrollments
            if enrollment.status == "active"
        ]
        enrollment_count = len(active_enrollments)
        mastery_values = [
            enrollment.mastery_percent for enrollment in active_enrollments
        ]
        average_mastery = (
            round(sum(mastery_values) / len(mastery_values))
            if mastery_values
            else 0
        )
        active_student_ids.update(
            enrollment.student_id for enrollment in active_enrollments
        )
        class_health.append(
            {
                "section_id": section.id,
                "course_code": section.course.code,
                "course_title": section.course.title,
                "students": enrollment_count,
                "average_mastery": average_mastery,
                "on_track_percent": round(
                    100
                    * sum(value >= 65 for value in mastery_values)
                    / len(mastery_values)
                )
                if mastery_values
                else 0,
            }
        )

        if section.schedule_text:
            agenda.append(
                {
                    "id": section.id,
                    "time": section.schedule_text,
                    "title": section.course.title,
                    "meta": f"{section.name} · {section.room or 'Room TBA'}",
                    "type": "class",
                }
            )

        for enrollment in active_enrollments:
            missing = 0
            for assignment in section.assignments:
                if assignment.status != "published":
                    continue
                submission = next(
                    (
                        row
                        for row in assignment.submissions
                        if row.student_id == enrollment.student_id
                    ),
                    None,
                )
                if not submission or submission.status not in {"submitted", "graded"}:
                    missing += 1

            if missing or enrollment.mastery_percent < 65:
                if enrollment.mastery_percent < 55:
                    signal = "Prerequisite gap"
                elif missing:
                    signal = f"{missing} missing submission{'s' if missing != 1 else ''}"
                else:
                    signal = "Needs reinforcement"
                attention_queue.append(
                    {
                        "student_id": enrollment.student_id,
                        "student_name": _display_name(enrollment.student),
                        "course_code": section.course.code,
                        "signal": signal,
                        "mastery_percent": enrollment.mastery_percent,
                        "progress_percent": enrollment.progress_percent,
                        "last_active_at": enrollment.last_active_at,
                    }
                )

        for assignment in section.assignments:
            if assignment.status != "published":
                continue
            graded = sum(
                1 for row in assignment.submissions if row.status == "graded"
            )
            submitted = sum(
                1
                for row in assignment.submissions
                if row.status in {"submitted", "graded"}
            )
            review_workload.append(
                {
                    "assignment_id": assignment.id,
                    "title": assignment.title,
                    "course_code": section.course.code,
                    "submitted": submitted,
                    "total_students": enrollment_count,
                    "needs_review": max(0, submitted - graded),
                    "due_at": assignment.due_at,
                }
            )

    attention_queue.sort(
        key=lambda item: (item["mastery_percent"], -item["progress_percent"])
    )
    review_workload.sort(
        key=lambda item: (
            -item["needs_review"],
            _datetime_sort_key(item["due_at"]),
        )
    )
    average_mastery = (
        round(
            sum(row["average_mastery"] for row in class_health)
            / len(class_health)
        )
        if class_health
        else 0
    )
    return {
        "role": "educator",
        "user": _user_summary(current_user),
        "organization": (
            {
                "id": organization.id,
                "name": organization.name,
                "slug": organization.slug,
            }
            if organization
            else None
        ),
        "term": (
            {"id": term.id, "name": term.name} if term else None
        ),
        "summary": {
            "active_sections": len(sections),
            "active_students": len(active_student_ids),
            "needs_attention": len(attention_queue),
            "submissions_to_review": sum(
                row["needs_review"] for row in review_workload
            ),
            "average_mastery": average_mastery,
        },
        "attention_queue": attention_queue[:8],
        "agenda": agenda,
        "review_workload": review_workload[:6],
        "class_health": class_health,
        "focus": (
            min(class_health, key=lambda row: row["average_mastery"])
            if class_health
            else None
        ),
    }


class AssignmentCreate(BaseModel):
    section_id: int
    title: str = Field(min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=5000)
    assignment_type: str = Field(default="practice", max_length=30)
    due_at: datetime | None = None
    points_possible: float = Field(default=100, gt=0, le=1000)
    estimated_minutes: int = Field(default=30, ge=5, le=600)
    ai_policy: str = Field(default="guided", max_length=40)
    rubric_text: str | None = Field(default=None, max_length=10000)
    weight_percent: float = Field(default=0, ge=0, le=100)
    start_at: datetime | None = None
    allow_resubmission: bool = True
    max_attempts: int = Field(default=3, ge=1, le=20)
    status: str = Field(default="published", pattern="^(draft|published)$")


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=5000)
    assignment_type: str | None = Field(default=None, max_length=30)
    due_at: datetime | None = None
    start_at: datetime | None = None
    points_possible: float | None = Field(default=None, gt=0, le=1000)
    estimated_minutes: int | None = Field(default=None, ge=5, le=600)
    ai_policy: str | None = Field(default=None, pattern="^(guided|open|restricted)$")
    rubric_text: str | None = Field(default=None, max_length=10000)
    weight_percent: float | None = Field(default=None, ge=0, le=100)
    allow_resubmission: bool | None = None
    max_attempts: int | None = Field(default=None, ge=1, le=20)
    status: str | None = Field(default=None, pattern="^(draft|published|archived)$")


class SubmissionCreate(BaseModel):
    content_text: str = Field(default="", max_length=20000)
    attachment_url: AnyHttpUrl | None = None


class SubmissionDraft(BaseModel):
    content_text: str = Field(default="", max_length=20000)
    attachment_url: AnyHttpUrl | None = None


class AnnouncementCreate(BaseModel):
    section_id: int
    title: str = Field(min_length=3, max_length=180)
    body: str = Field(min_length=3, max_length=5000)


class GradeSubmission(BaseModel):
    score: float = Field(ge=0)
    feedback: str = Field(min_length=3, max_length=5000)


class AttendanceEntry(BaseModel):
    student_id: int
    status: str = Field(pattern="^(present|late|absent|excused)$")
    note: str | None = Field(default=None, max_length=300)


class AttendanceUpdate(BaseModel):
    class_date: date
    entries: list[AttendanceEntry] = Field(min_length=1, max_length=500)


class CourseMaterialCreate(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    material_type: str = Field(
        default="document",
        pattern="^(document|video|slides|link)$",
    )
    source_url: AnyHttpUrl | None = None


class ClassroomMessageCreate(BaseModel):
    section_id: int
    recipient_id: int
    assignment_id: int | None = None
    subject: str = Field(min_length=3, max_length=180)
    body: str = Field(min_length=3, max_length=5000)


@router.get("/sections/{section_id}/leaderboard")
def get_class_leaderboard(
    section_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    leaderboard = _leaderboard_for_section(section, current_user.id)
    current_row = next(
        (row for row in leaderboard if row["is_current_user"]),
        None,
    )
    return {
        "section": {
            "id": section.id,
            "name": section.name,
            "course_code": section.course.code,
            "course_title": section.course.title,
        },
        "formula": "45% mastery + 30% course progress + 20% grade average + 5% completion",
        "student_count": len(leaderboard),
        "current_rank": current_row["rank"] if current_row else None,
        "leaderboard": leaderboard,
    }


@router.get("/sections/{section_id}")
def get_class_workspace(
    section_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    role = normalize_account_role(current_user.account_role)
    activities = (
        db.query(models.ClassActivityEvent)
        .options(joinedload(models.ClassActivityEvent.actor))
        .filter(models.ClassActivityEvent.section_id == section.id)
    )
    if role == "student":
        activities = activities.filter(
            models.ClassActivityEvent.visible_to_students.is_(True)
        )
    activity_rows = [
        {
            "id": item.id,
            "event_type": item.event_type,
            "title": item.title,
            "detail": item.detail,
            "actor": _display_name(item.actor),
            "created_at": item.created_at,
        }
        for item in activities.order_by(
            models.ClassActivityEvent.created_at.desc()
        ).limit(12)
    ]
    attendance_query = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.section_id == section.id
    )
    if role == "student":
        attendance_query = attendance_query.filter(
            models.AttendanceRecord.student_id == current_user.id
        )
    attendance_records = attendance_query.order_by(
        models.AttendanceRecord.class_date.desc()
    ).limit(250).all()
    return {
        "id": section.id,
        "name": section.name,
        "course_code": section.course.code,
        "course_title": section.course.title,
        "schedule": section.schedule_text,
        "room": section.room,
        "instructor": _user_summary(section.instructor)
        if section.instructor
        else None,
        "student_count": sum(
            row.status == "active" for row in section.enrollments
        ),
        "assignments": [
            _assignment_row(
                assignment,
                current_user.id if role == "student" else None,
            )
            for assignment in sorted(
                (
                    item
                    for item in section.assignments
                    if item.status == "published"
                ),
                key=lambda item: _datetime_sort_key(item.due_at),
            )
        ],
        "materials": [
            {
                "id": material.id,
                "title": material.title,
                "material_type": material.material_type,
                "source_url": material.source_url,
                "original_filename": material.original_filename,
                "file_size": material.file_size,
                "created_at": material.created_at,
            }
            for material in sorted(
                (
                    item
                    for item in section.course.materials
                    if item.status == "published"
                    and item.section_id in {None, section.id}
                ),
                key=lambda item: item.created_at,
                reverse=True,
            )
        ],
        "roster": (
            [
                {
                    "student": _user_summary(enrollment.student),
                    "progress_percent": enrollment.progress_percent,
                    "mastery_percent": enrollment.mastery_percent,
                    "last_active_at": enrollment.last_active_at,
                }
                for enrollment in section.enrollments
                if enrollment.status == "active"
            ]
            if role == "educator"
            else None
        ),
        "attendance": {
            "summary": (
                _attendance_summary(attendance_records)
                if role == "student"
                else None
            ),
            "records": [
                {
                    "id": record.id,
                    "student_id": record.student_id,
                    "class_date": record.class_date,
                    "status": record.status,
                    "note": record.note,
                }
                for record in attendance_records
            ],
        },
        "activity": activity_rows,
    }


@router.put("/student/assignments/{assignment_id}/draft")
def save_assignment_draft(
    assignment_id: int,
    payload: SubmissionDraft,
    current_user: models.User = Depends(require_account_role("student")),
    db: Session = Depends(get_db),
):
    assignment = (
        db.query(models.Assignment)
        .filter(
            models.Assignment.id == assignment_id,
            models.Assignment.status == "published",
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    _accessible_section(db, assignment.section_id, current_user)
    _ensure_assignment_available(assignment)
    submission = (
        db.query(models.Submission)
        .filter(
            models.Submission.assignment_id == assignment.id,
            models.Submission.student_id == current_user.id,
        )
        .first()
    )
    if submission and submission.status in {"submitted", "graded"}:
        raise HTTPException(
            status_code=409,
            detail="Submitted work cannot be changed as a draft. Use resubmit instead.",
        )
    if not submission:
        submission = models.Submission(
            assignment_id=assignment.id,
            student_id=current_user.id,
            status="draft",
            attempt_number=1,
        )
        db.add(submission)
    submission.content_text = payload.content_text
    submission.attachment_url = (
        str(payload.attachment_url) if payload.attachment_url else None
    )
    submission.status = "draft"
    db.commit()
    db.refresh(submission)
    return {
        "id": submission.id,
        "assignment_id": assignment.id,
        "status": submission.status,
        "updated_at": submission.updated_at,
    }


@router.post("/student/assignments/{assignment_id}/submit")
def submit_assignment(
    assignment_id: int,
    payload: SubmissionCreate,
    current_user: models.User = Depends(require_account_role("student")),
    db: Session = Depends(get_db),
):
    assignment = (
        db.query(models.Assignment)
        .options(
            joinedload(models.Assignment.section).joinedload(
                models.ClassSection.assignments
            )
        )
        .filter(
            models.Assignment.id == assignment_id,
            models.Assignment.status == "published",
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    section = _accessible_section(db, assignment.section_id, current_user)
    _ensure_assignment_available(assignment)
    if len(payload.content_text.strip()) < 20 and not payload.attachment_url:
        raise HTTPException(
            status_code=422,
            detail="Add a response of at least 20 characters or attach your completed work.",
        )
    submission = (
        db.query(models.Submission)
        .filter(
            models.Submission.assignment_id == assignment.id,
            models.Submission.student_id == current_user.id,
        )
        .first()
    )
    now = datetime.now(timezone.utc)
    if submission:
        was_submitted = submission.status in {"submitted", "graded"}
        if was_submitted:
            if not assignment.allow_resubmission:
                raise HTTPException(status_code=409, detail="Resubmission is disabled for this assignment.")
            if submission.attempt_number >= assignment.max_attempts:
                raise HTTPException(status_code=409, detail=f"Maximum of {assignment.max_attempts} attempts reached.")
            submission.attempt_number = (submission.attempt_number or 1) + 1
        submission.score = None
        submission.feedback = None
        submission.graded_at = None
        submission.graded_by = None
    else:
        submission = models.Submission(
            assignment_id=assignment.id,
            student_id=current_user.id,
            attempt_number=1,
        )
        db.add(submission)
    submission.content_text = payload.content_text.strip()
    submission.attachment_url = (
        str(payload.attachment_url) if payload.attachment_url else None
    )
    submission.status = "submitted"
    submission.submitted_at = now
    db.flush()
    _record_activity(
        db,
        section_id=section.id,
        actor_id=current_user.id,
        event_type="submission_received",
        entity_type="submission",
        entity_id=submission.id,
        title=f"{_display_name(current_user)} submitted {assignment.title}",
        visible_to_students=False,
    )
    _recalculate_enrollment(db, section, current_user.id)
    db.commit()
    db.refresh(submission)
    return {
        "id": submission.id,
        "assignment_id": assignment.id,
        "status": submission.status,
        "attempt_number": submission.attempt_number,
        "submitted_at": submission.submitted_at,
    }


@router.get("/educator/assignments/{assignment_id}/submissions")
def get_assignment_submissions(
    assignment_id: int,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    assignment = (
        db.query(models.Assignment)
        .options(
            joinedload(models.Assignment.section)
            .joinedload(models.ClassSection.enrollments)
            .joinedload(models.Enrollment.student),
            joinedload(models.Assignment.submissions).joinedload(
                models.Submission.student
            ),
        )
        .filter(models.Assignment.id == assignment_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    section = _accessible_section(db, assignment.section_id, current_user)
    submissions_by_student = {
        row.student_id: row for row in assignment.submissions
    }
    return {
        "assignment": {
            "id": assignment.id,
            "title": assignment.title,
            "description": assignment.description,
            "course_code": section.course.code,
            "points_possible": assignment.points_possible,
            "due_at": assignment.due_at,
        },
        "submissions": [
            {
                "student": _user_summary(enrollment.student),
                "submission_id": submissions_by_student.get(
                    enrollment.student_id
                ).id
                if submissions_by_student.get(enrollment.student_id)
                else None,
                "status": submissions_by_student.get(
                    enrollment.student_id
                ).status
                if submissions_by_student.get(enrollment.student_id)
                else "not_started",
                "content_text": submissions_by_student.get(
                    enrollment.student_id
                ).content_text
                if submissions_by_student.get(enrollment.student_id)
                else None,
                "attachment_url": submissions_by_student.get(
                    enrollment.student_id
                ).attachment_url
                if submissions_by_student.get(enrollment.student_id)
                else None,
                "attachment_name": submissions_by_student.get(
                    enrollment.student_id
                ).attachment_name
                if submissions_by_student.get(enrollment.student_id)
                else None,
                "attachment_size": submissions_by_student.get(
                    enrollment.student_id
                ).attachment_size
                if submissions_by_student.get(enrollment.student_id)
                else None,
                "score": submissions_by_student.get(
                    enrollment.student_id
                ).score
                if submissions_by_student.get(enrollment.student_id)
                else None,
                "feedback": submissions_by_student.get(
                    enrollment.student_id
                ).feedback
                if submissions_by_student.get(enrollment.student_id)
                else None,
                "submitted_at": submissions_by_student.get(
                    enrollment.student_id
                ).submitted_at
                if submissions_by_student.get(enrollment.student_id)
                else None,
            }
            for enrollment in section.enrollments
            if enrollment.status == "active"
        ],
    }


@router.patch("/educator/submissions/{submission_id}/grade")
def grade_submission(
    submission_id: int,
    payload: GradeSubmission,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    submission = (
        db.query(models.Submission)
        .options(
            joinedload(models.Submission.student),
            joinedload(models.Submission.assignment)
            .joinedload(models.Assignment.section)
            .joinedload(models.ClassSection.assignments)
            .joinedload(models.Assignment.submissions),
        )
        .filter(models.Submission.id == submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")
    section = _accessible_section(
        db,
        submission.assignment.section_id,
        current_user,
    )
    if submission.status not in {"submitted", "graded"}:
        raise HTTPException(
            status_code=409,
            detail="This student has not submitted work yet.",
        )
    if payload.score > submission.assignment.points_possible:
        raise HTTPException(
            status_code=422,
            detail=f"Score cannot exceed {submission.assignment.points_possible:g}.",
        )
    submission.score = payload.score
    submission.feedback = payload.feedback.strip()
    submission.status = "graded"
    submission.graded_at = datetime.now(timezone.utc)
    submission.graded_by = current_user.id
    _notify(
        db,
        submission.student_id,
        f"Feedback published · {submission.assignment.title}",
        f"Your work was graded {payload.score:g}/{submission.assignment.points_possible:g}. Open the assignment to read feedback.",
        "class_grade",
    )
    _record_activity(
        db,
        section_id=section.id,
        actor_id=current_user.id,
        event_type="feedback_published",
        entity_type="submission",
        entity_id=submission.id,
        title=f"Feedback published for {submission.assignment.title}",
        detail="A score and written feedback were published.",
        visible_to_students=False,
    )
    _recalculate_enrollment(db, section, submission.student_id)
    db.commit()
    return {
        "id": submission.id,
        "status": submission.status,
        "score": submission.score,
        "feedback": submission.feedback,
        "graded_at": submission.graded_at,
    }


@router.put("/educator/sections/{section_id}/attendance")
def update_section_attendance(
    section_id: int,
    payload: AttendanceUpdate,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    enrolled_ids = {
        enrollment.student_id
        for enrollment in section.enrollments
        if enrollment.status == "active"
    }
    supplied_ids = {entry.student_id for entry in payload.entries}
    if not supplied_ids.issubset(enrolled_ids):
        raise HTTPException(
            status_code=422,
            detail="Attendance can only be marked for students enrolled in this section.",
        )
    now = datetime.now(timezone.utc)
    for entry in payload.entries:
        record = (
            db.query(models.AttendanceRecord)
            .filter(
                models.AttendanceRecord.section_id == section.id,
                models.AttendanceRecord.student_id == entry.student_id,
                models.AttendanceRecord.class_date == payload.class_date,
            )
            .first()
        )
        if not record:
            record = models.AttendanceRecord(
                section_id=section.id,
                student_id=entry.student_id,
                class_date=payload.class_date,
            )
            db.add(record)
        record.status = entry.status
        record.note = entry.note.strip() if entry.note else None
        record.marked_by = current_user.id
        record.marked_at = now
    _record_activity(
        db,
        section_id=section.id,
        actor_id=current_user.id,
        event_type="attendance_updated",
        entity_type="attendance",
        entity_id=None,
        title=f"Attendance updated for {payload.class_date.isoformat()}",
        detail=f"{len(payload.entries)} student records updated.",
        visible_to_students=True,
    )
    db.commit()
    return {
        "section_id": section.id,
        "class_date": payload.class_date,
        "updated": len(payload.entries),
    }


@router.post(
    "/educator/sections/{section_id}/materials",
    status_code=status.HTTP_201_CREATED,
)
def create_course_material(
    section_id: int,
    payload: CourseMaterialCreate,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    material = models.CourseMaterial(
        course_id=section.course_id,
        section_id=section.id,
        title=payload.title.strip(),
        material_type=payload.material_type.strip().lower(),
        source_url=str(payload.source_url) if payload.source_url else None,
        status=payload.status,
        created_by=current_user.id,
    )
    db.add(material)
    db.flush()
    _record_activity(
        db,
        section_id=section.id,
        actor_id=current_user.id,
        event_type="material_published",
        entity_type="course_material",
        entity_id=material.id,
        title=material.title,
        detail="A new course resource is available.",
        visible_to_students=True,
    )
    _notify_section_students(
        db,
        section,
        f"New class material · {material.title}",
        f"{section.course.code} has a new {material.material_type}.",
        "class_material",
    )
    db.commit()
    db.refresh(material)
    return {
        "id": material.id,
        "title": material.title,
        "material_type": material.material_type,
        "source_url": material.source_url,
        "created_at": material.created_at,
    }


@router.post("/educator/announcements", status_code=status.HTTP_201_CREATED)
def create_announcement(
    payload: AnnouncementCreate,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, payload.section_id, current_user)
    announcement = models.Announcement(
        section_id=section.id,
        author_id=current_user.id,
        title=payload.title.strip(),
        body=payload.body.strip(),
    )
    db.add(announcement)
    db.flush()
    _record_activity(
        db,
        section_id=section.id,
        actor_id=current_user.id,
        event_type="announcement_published",
        entity_type="announcement",
        entity_id=announcement.id,
        title=announcement.title,
        detail=announcement.body,
        visible_to_students=True,
    )
    _notify_section_students(
        db,
        section,
        announcement.title,
        f"{section.course.code}: {announcement.body}",
        "class_announcement",
    )
    db.commit()
    db.refresh(announcement)
    return {
        "id": announcement.id,
        "section_id": announcement.section_id,
        "title": announcement.title,
        "body": announcement.body,
        "published_at": announcement.published_at,
    }


@router.post(
    "/educator/assignments",
    status_code=status.HTTP_201_CREATED,
)
def create_assignment(
    payload: AssignmentCreate,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    section = (
        db.query(models.ClassSection)
        .filter(
            models.ClassSection.id == payload.section_id,
            models.ClassSection.instructor_id == current_user.id,
            models.ClassSection.status == "active",
        )
        .first()
    )
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class section not found or not assigned to you.",
        )

    assignment = models.Assignment(
        section_id=section.id,
        title=payload.title.strip(),
        description=payload.description,
        assignment_type=payload.assignment_type,
        due_at=payload.due_at,
        points_possible=payload.points_possible,
        estimated_minutes=payload.estimated_minutes,
        status=payload.status,
        ai_policy=payload.ai_policy,
        rubric_text=payload.rubric_text,
        weight_percent=payload.weight_percent,
        start_at=payload.start_at,
        allow_resubmission=payload.allow_resubmission,
        max_attempts=payload.max_attempts,
        created_by=current_user.id,
    )
    db.add(assignment)
    db.flush()
    if assignment.status == "published":
        _record_activity(
            db,
            section_id=section.id,
            actor_id=current_user.id,
            event_type="assignment_published",
            entity_type="assignment",
            entity_id=assignment.id,
            title=assignment.title,
            detail=assignment.description,
            visible_to_students=True,
        )
        _notify_section_students(
            db,
            section,
            f"New assignment · {assignment.title}",
            f"{section.course.code} published new work"
            + (f" due {assignment.due_at.strftime('%d %b')}" if assignment.due_at else "."),
            "class_assignment",
        )
    db.commit()
    db.refresh(assignment)
    return {
        "id": assignment.id,
        "section_id": assignment.section_id,
        "title": assignment.title,
        "due_at": assignment.due_at,
        "status": assignment.status,
    }


@router.get("/educator/assignments")
def list_educator_assignments(
    section_id: int | None = Query(default=None),
    include_archived: bool = Query(default=False),
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.Assignment)
        .options(
            joinedload(models.Assignment.section).joinedload(models.ClassSection.course),
            joinedload(models.Assignment.submissions),
        )
        .join(models.ClassSection)
        .filter(models.ClassSection.instructor_id == current_user.id)
    )
    if section_id:
        query = query.filter(models.Assignment.section_id == section_id)
    if not include_archived:
        query = query.filter(models.Assignment.status != "archived")
    assignments = query.order_by(models.Assignment.created_at.desc()).all()
    return {
        "assignments": [
            {
                **_assignment_row(item),
                "section_id": item.section_id,
                "course_code": item.section.course.code,
                "course_title": item.section.course.title,
                "published_status": item.status,
                "submitted_count": sum(row.status in {"submitted", "graded"} for row in item.submissions),
                "graded_count": sum(row.status == "graded" for row in item.submissions),
                "student_count": sum(row.status == "active" for row in item.section.enrollments),
            }
            for item in assignments
        ]
    }


@router.patch("/educator/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    payload: AssignmentUpdate,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    section = _accessible_section(db, assignment.section_id, current_user)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field in {"title", "description", "rubric_text"} and isinstance(value, str):
            value = value.strip()
        setattr(assignment, field, value)
    if changes.get("status") == "published":
        _notify_section_students(
            db,
            section,
            f"Assignment updated · {assignment.title}",
            f"{section.course.code} coursework has changed.",
            "class_assignment",
        )
    db.commit()
    db.refresh(assignment)
    return {**_assignment_row(assignment), "published_status": assignment.status, "section_id": assignment.section_id}


@router.delete("/educator/assignments/{assignment_id}")
def archive_assignment(
    assignment_id: int,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    _accessible_section(db, assignment.section_id, current_user)
    assignment.status = "archived"
    db.commit()
    return {"id": assignment.id, "status": "archived"}


@router.get("/educator/sections/{section_id}/gradebook")
def get_gradebook(
    section_id: int,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    assignments = [item for item in section.assignments if item.status == "published"]
    uses_weighting = any(item.weight_percent > 0 for item in assignments)
    rows = []
    for enrollment in section.enrollments:
        if enrollment.status != "active":
            continue
        scores = {}
        earned = possible = 0.0
        for assignment in assignments:
            submission = next((row for row in assignment.submissions if row.student_id == enrollment.student_id), None)
            scores[str(assignment.id)] = {
                "status": submission.status if submission else "not_started",
                "score": submission.score if submission else None,
            }
            if submission and submission.status == "graded" and submission.score is not None:
                if uses_weighting and assignment.weight_percent > 0:
                    earned += (submission.score / assignment.points_possible) * assignment.weight_percent
                    possible += assignment.weight_percent
                elif not uses_weighting:
                    earned += submission.score
                    possible += assignment.points_possible
        rows.append({
            "student": _user_summary(enrollment.student),
            "scores": scores,
            "average_percent": round(100 * earned / possible) if possible else None,
            "progress_percent": enrollment.progress_percent,
            "mastery_percent": enrollment.mastery_percent,
        })
    return {
        "section": {"id": section.id, "course_code": section.course.code, "course_title": section.course.title},
        "uses_weighting": uses_weighting,
        "assignments": [
            {"id": item.id, "title": item.title, "points_possible": item.points_possible, "weight_percent": item.weight_percent}
            for item in assignments
        ],
        "rows": rows,
    }


@router.get("/notifications")
def list_classroom_notifications(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if normalize_account_role(current_user.account_role) not in {"student", "educator"}:
        raise HTTPException(status_code=403, detail="Class notifications are not available for this account.")
    rows = (
        db.query(models.Notification)
        .filter(
            models.Notification.user_id == current_user.id,
            models.Notification.notification_type.like("class_%"),
        )
        .order_by(models.Notification.created_at.desc())
        .limit(100)
        .all()
    )
    return {
        "unread_count": sum(not row.is_read for row in rows),
        "notifications": [
            {
                "id": row.id,
                "title": row.title,
                "message": row.message,
                "type": row.notification_type,
                "is_read": row.is_read,
                "created_at": row.created_at,
            }
            for row in rows
        ],
    }


@router.patch("/notifications/{notification_id}/read")
def read_classroom_notification(
    notification_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found.")
    row.is_read = True
    db.commit()
    return {"id": row.id, "is_read": True}


@router.get("/messages")
def list_classroom_messages(
    section_id: int | None = Query(default=None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = normalize_account_role(current_user.account_role)
    if role not in {"student", "educator"}:
        raise HTTPException(status_code=403, detail="Class messaging is not available for this account.")
    query = db.query(models.ClassroomMessage).options(
        joinedload(models.ClassroomMessage.section).joinedload(models.ClassSection.course),
        joinedload(models.ClassroomMessage.sender),
        joinedload(models.ClassroomMessage.recipient),
    ).filter(
        (models.ClassroomMessage.sender_id == current_user.id)
        | (models.ClassroomMessage.recipient_id == current_user.id)
    )
    if section_id:
        _accessible_section(db, section_id, current_user)
        query = query.filter(models.ClassroomMessage.section_id == section_id)
    rows = query.order_by(models.ClassroomMessage.created_at.desc()).limit(200).all()
    for row in rows:
        if row.recipient_id == current_user.id:
            row.is_read = True
    db.commit()
    return {
        "messages": [
            {
                "id": row.id,
                "section_id": row.section_id,
                "course_code": row.section.course.code,
                "sender": _user_summary(row.sender),
                "recipient": _user_summary(row.recipient),
                "assignment_id": row.assignment_id,
                "subject": row.subject,
                "body": row.body,
                "is_read": row.is_read,
                "created_at": row.created_at,
                "is_mine": row.sender_id == current_user.id,
            }
            for row in rows
        ]
    }


@router.post("/messages", status_code=status.HTTP_201_CREATED)
def create_classroom_message(
    payload: ClassroomMessageCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, payload.section_id, current_user)
    role = normalize_account_role(current_user.account_role)
    active_student_ids = {
        row.student_id for row in section.enrollments if row.status == "active"
    }
    if role == "student":
        if payload.recipient_id != section.instructor_id:
            raise HTTPException(status_code=422, detail="Students can message the assigned educator for this class.")
    elif role == "educator":
        if payload.recipient_id not in active_student_ids:
            raise HTTPException(status_code=422, detail="Choose a student enrolled in this class.")
    else:
        raise HTTPException(status_code=403, detail="Class messaging is not available for this account.")
    if payload.assignment_id:
        assignment = db.query(models.Assignment).filter(
            models.Assignment.id == payload.assignment_id,
            models.Assignment.section_id == section.id,
        ).first()
        if not assignment:
            raise HTTPException(status_code=422, detail="Assignment does not belong to this class.")
    message = models.ClassroomMessage(
        section_id=section.id,
        sender_id=current_user.id,
        recipient_id=payload.recipient_id,
        assignment_id=payload.assignment_id,
        subject=payload.subject.strip(),
        body=payload.body.strip(),
    )
    db.add(message)
    _notify(
        db,
        payload.recipient_id,
        f"New message · {payload.subject.strip()}",
        f"{section.course.code}: {_display_name(current_user)} sent you a private message.",
        "class_message",
    )
    db.commit()
    db.refresh(message)
    return {"id": message.id, "created_at": message.created_at}


@router.post("/student/assignments/{assignment_id}/file")
async def upload_submission_file(
    assignment_id: int,
    request: Request,
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_account_role("student")),
    db: Session = Depends(get_db),
):
    assignment = db.query(models.Assignment).filter(
        models.Assignment.id == assignment_id,
        models.Assignment.status == "published",
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    _accessible_section(db, assignment.section_id, current_user)
    _ensure_assignment_available(assignment)
    submission = db.query(models.Submission).filter(
        models.Submission.assignment_id == assignment.id,
        models.Submission.student_id == current_user.id,
    ).first()
    if submission and submission.status in {"submitted", "graded"}:
        raise HTTPException(
            status_code=409,
            detail="Submitted file evidence is locked. Resubmit revised text or a new supporting link.",
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Choose a non-empty file.")
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Files must be 25 MB or smaller.")
    safe_name = _safe_filename(file.filename)
    storage_path = f"classroom/submissions/{current_user.id}/{uuid.uuid4()}_{safe_name}"
    StorageService.get_storage().upload_bytes(raw, storage_path, file.content_type)
    if not submission:
        submission = models.Submission(
            assignment_id=assignment.id,
            student_id=current_user.id,
            status="draft",
            attempt_number=1,
        )
        db.add(submission)
        db.flush()
    submission.attachment_storage_path = storage_path
    submission.attachment_name = safe_name
    submission.attachment_content_type = (file.content_type or "application/octet-stream")[:120]
    submission.attachment_size = len(raw)
    submission.attachment_url = str(request.url_for("download_submission_file", submission_id=submission.id))
    db.commit()
    return {
        "submission_id": submission.id,
        "name": safe_name,
        "size": len(raw),
        "url": submission.attachment_url,
    }


@router.get("/files/submissions/{submission_id}", name="download_submission_file")
def download_submission_file(
    submission_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    submission = db.query(models.Submission).options(
        joinedload(models.Submission.assignment),
    ).filter(models.Submission.id == submission_id).first()
    if not submission or not submission.attachment_storage_path:
        raise HTTPException(status_code=404, detail="Submission file not found.")
    _accessible_section(db, submission.assignment.section_id, current_user)
    if normalize_account_role(current_user.account_role) == "student" and submission.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="You cannot access another student's file.")
    storage = StorageService.get_storage()
    if getattr(storage, "storage_type", "local") != "local":
        return RedirectResponse(storage.get_private_file_url(submission.attachment_storage_path))
    raw = storage.download_bytes(submission.attachment_storage_path)
    return Response(
        raw,
        media_type=submission.attachment_content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{submission.attachment_name or "submission"}"'},
    )


@router.post("/educator/sections/{section_id}/materials/upload")
async def upload_course_material(
    section_id: int,
    request: Request,
    title: str = Form(...),
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    clean_title = title.strip()
    if len(clean_title) < 3 or len(clean_title) > 180:
        raise HTTPException(status_code=422, detail="Material title must be 3–180 characters.")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Choose a non-empty file.")
    if len(raw) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Materials must be 50 MB or smaller.")
    safe_name = _safe_filename(file.filename)
    storage_path = f"classroom/materials/{section.course_id}/{uuid.uuid4()}_{safe_name}"
    StorageService.get_storage().upload_bytes(raw, storage_path, file.content_type)
    material = models.CourseMaterial(
        course_id=section.course_id,
        section_id=section.id,
        title=clean_title,
        material_type="document",
        status="published",
        storage_path=storage_path,
        original_filename=safe_name,
        content_type=(file.content_type or "application/octet-stream")[:120],
        file_size=len(raw),
        created_by=current_user.id,
    )
    db.add(material)
    db.flush()
    material.source_url = str(request.url_for("download_course_material", section_id=section.id, material_id=material.id))
    _notify_section_students(db, section, f"New class material · {material.title}", f"{section.course.code} has a new file.", "class_material")
    db.commit()
    return {"id": material.id, "title": material.title, "source_url": material.source_url, "file_size": material.file_size}


@router.get("/files/sections/{section_id}/materials/{material_id}", name="download_course_material")
def download_course_material(
    section_id: int,
    material_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    material = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.id == material_id,
        models.CourseMaterial.course_id == section.course_id,
        (models.CourseMaterial.section_id.is_(None))
        | (models.CourseMaterial.section_id == section.id),
    ).first()
    if not material or not material.storage_path:
        raise HTTPException(status_code=404, detail="Material file not found.")
    storage = StorageService.get_storage()
    if getattr(storage, "storage_type", "local") != "local":
        return RedirectResponse(storage.get_private_file_url(material.storage_path))
    return Response(
        storage.download_bytes(material.storage_path),
        media_type=material.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{material.original_filename or "material"}"'},
    )
