"""The signed-in classroom identity; organizational access is never self-editable."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

import models
from database import get_db
from services.access_control import require_account_role
from .helpers import _active_section_ids, _display_name, _membership_query, _user_summary

router = APIRouter()
classroom_user = require_account_role('student', 'educator')


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(default='', max_length=50)


def profile_data(db, user):
    memberships = _membership_query(db, user.id).all()
    sections = db.query(models.ClassSection).options(
        joinedload(models.ClassSection.course).joinedload(models.Course.organization),
        joinedload(models.ClassSection.instructor),
    ).filter(models.ClassSection.id.in_(_active_section_ids(db, user))).order_by(models.ClassSection.id).all()
    return {
        'user': _user_summary(user),
        'role': user.account_role,
        'dashboard_route': '/company' if any(m.role == 'owner' for m in memberships) else f'/{user.account_role}',
        'organizations': [{
            'id': m.organization_id, 'name': m.organization.name,
            'role': m.role, 'status': m.status,
        } for m in memberships],
        'classes': [{
            'id': s.id, 'code': s.course.code, 'title': s.course.title,
            'cohort': s.name, 'organization': s.course.organization.name,
            'instructor': _display_name(s.instructor), 'schedule': s.schedule_text,
        } for s in sections],
    }


@router.get('/profile')
def get_profile(user=Depends(classroom_user), db: Session = Depends(get_db)):
    return profile_data(db, user)


@router.patch('/profile')
def update_profile(payload: ProfileUpdate, user=Depends(classroom_user), db: Session = Depends(get_db)):
    user.first_name = payload.first_name
    user.last_name = payload.last_name
    db.commit()
    db.refresh(user)
    return profile_data(db, user)
