from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
from database import get_db
from services.access_control import require_account_role

from .helpers import _accessible_section, _record_activity
from .schemas import AttendanceUpdate

router = APIRouter()


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
