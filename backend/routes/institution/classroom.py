from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

import models
from database import get_db
from deps import get_current_user
from services.access_control import normalize_account_role

from .helpers import (
    _accessible_section,
    _assignment_row,
    _attendance_summary,
    _datetime_sort_key,
    _display_name,
    _leaderboard_for_section,
    _user_summary,
)

router = APIRouter()


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
