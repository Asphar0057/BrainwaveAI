import re
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

import models
from services.access_control import normalize_account_role


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
        .join(models.Organization)
        .filter(models.Organization.status == "active")
        .options(joinedload(models.OrganizationMembership.organization))
        .filter(
            models.OrganizationMembership.user_id == user_id,
            models.OrganizationMembership.status == "active",
        )
    )


def _active_section_ids(db: Session, user: models.User) -> list[int]:
    query = db.query(models.ClassSection.id).join(models.Course).join(
        models.OrganizationMembership, models.OrganizationMembership.organization_id == models.Course.organization_id
    ).join(models.Organization, models.Organization.id == models.Course.organization_id).filter(
        models.OrganizationMembership.user_id == user.id,
        models.OrganizationMembership.status == "active",
        models.Organization.status == "active",
        models.ClassSection.status == "active",
    )
    if user.account_role == "educator":
        query = query.filter(models.ClassSection.instructor_id == user.id, models.OrganizationMembership.role.in_(["owner", "educator"]))
    elif user.account_role == "student":
        query = query.join(models.Enrollment).filter(models.Enrollment.student_id == user.id, models.Enrollment.status == "active", models.OrganizationMembership.role == "student")
    else:
        return []
    return [r[0] for r in query.all()]


def _snapshot_submission(db, submission, actor_id, event):
    db.add(models.SubmissionRevision(submission_id=submission.id, attempt_number=submission.attempt_number or 1,
        actor_id=actor_id, event=event, snapshot={
            "content_text": submission.content_text, "attachment_name": submission.attachment_name,
            "attachment_url": submission.attachment_url, "score": submission.score,
            "feedback": submission.feedback, "status": submission.status,
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
            "graded_at": submission.graded_at.isoformat() if submission.graded_at else None,
        }))


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
            models.ClassSection.id.in_(_active_section_ids(db, current_user)),
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
    *,
    record_activity: bool = True,
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
        enrollment.progress_percent = 0
        enrollment.mastery_percent = 0
        return
    submissions = (
        db.query(models.Submission)
        .filter(
            models.Submission.assignment_id.in_([item.id for item in published]),
            models.Submission.student_id == student_id,
        )
        .all()
    )
    submissions_by_assignment = {row.assignment_id: row for row in submissions}
    completed = 0
    uses_weighting = any(item.weight_percent > 0 for item in published)
    earned = possible = 0.0
    for assignment in published:
        submission = submissions_by_assignment.get(assignment.id)
        if submission and submission.status in {"submitted", "graded"}:
            completed += 1
        if (
            submission
            and submission.status == "graded"
            and submission.score is not None
            and assignment.points_possible
        ):
            if uses_weighting and assignment.weight_percent > 0:
                earned += submission.score / assignment.points_possible * assignment.weight_percent
                possible += assignment.weight_percent
            elif not uses_weighting:
                earned += submission.score
                possible += assignment.points_possible
    enrollment.progress_percent = round(100 * completed / len(published))
    enrollment.mastery_percent = round(100 * earned / possible) if possible else 0
    if record_activity:
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
