from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

import models
from database import get_db
from deps import get_current_user
from services.access_control import normalize_account_role

from .helpers import _accessible_section, _display_name, _notify, _user_summary
from .schemas import ClassroomMessageCreate

router = APIRouter()


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
