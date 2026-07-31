from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

import models
from database import get_db
from services.access_control import require_account_role

from .helpers import _accessible_section, _notify_section_students, _record_activity
from .schemas import AnnouncementCreate

router = APIRouter()


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
