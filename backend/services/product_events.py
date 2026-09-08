"""Minimal events: no prompts, answers, email addresses or document contents."""
import uuid
from sqlalchemy.exc import IntegrityError
import models


def record_event(db, name, user_id=None, key=None, visitor_id=None, origin="server"):
    key = key or str(uuid.uuid4())
    if db.query(models.ProductEvent.id).filter_by(event_key=key).first():
        return
    try:
        with db.begin_nested():
            db.add(models.ProductEvent(event_key=key, name=name, user_id=user_id, visitor_id=visitor_id, origin=origin))
            db.flush()
    except IntegrityError:
        pass
