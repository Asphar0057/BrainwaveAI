"""Expired contracts retain read access, but cannot create new classroom work."""
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from deps import get_current_user
import models

async def enforce_company_write_license(request: Request, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if request.method not in {'POST','PUT','PATCH','DELETE'}: return
    # Company administration and invitation acceptance have their own seat / licence rules.
    if '/companies' in request.url.path or '/invitations/' in request.url.path: return
    section_id=request.path_params.get('section_id')
    for key, model in [('assignment_id',models.Assignment),('submission_id',models.Submission),('lesson_id',models.LearningLesson),('checkpoint_id',models.LearningCheckpoint),('followup_id',models.LearningIntervention)]:
        value=request.path_params.get(key)
        if value:
            row=db.get(model,int(value))
            if row: section_id=row.assignment.section_id if key=='submission_id' else row.section_id
    if not section_id and 'application/json' in request.headers.get('content-type',''):
        try:
            body=await request.json()
            if isinstance(body,dict):section_id=body.get('section_id')
        except Exception:return
    if not isinstance(section_id,(int,str)) or not str(section_id).isdigit():return
    section=db.get(models.ClassSection,int(section_id))
    if not section:return
    org_id=section.course.organization_id
    membership=db.query(models.OrganizationMembership).filter_by(organization_id=org_id,user_id=user.id,status='active').first()
    if not membership:return  # Leave authorization errors to the scoped route.
    license=db.get(models.OrganizationLicense,org_id)
    # Legacy organisations are operator-managed until explicitly provisioned.
    if license and license.expires_at and license.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(402,'Your company licence has expired. Existing lessons, grades and exports remain available. Ask the company owner to renew before saving new work.')
