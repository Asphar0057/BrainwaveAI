from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

import models
from database import get_db
from deps import get_current_user
from services.access_control import (
    landing_route_for_role,
    normalize_account_role,
    require_account_role,
)

from .helpers import (
    _assignment_row,
    _attendance_summary,
    _datetime_sort_key,
    _display_name,
    _membership_query,
    _user_summary,
)

router = APIRouter()


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
