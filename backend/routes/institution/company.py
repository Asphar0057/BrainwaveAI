"""Self-service company workspaces. Membership, not client role, authorizes operations."""
import csv
import hashlib
import io
import secrets
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session
import models
from database import get_db
from deps import get_current_user
from .helpers import _user_summary

router = APIRouter()


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def member(db, org_id, user, owner=False):
    row = db.query(models.OrganizationMembership).join(models.Organization).filter(
        models.OrganizationMembership.organization_id == org_id,
        models.OrganizationMembership.user_id == user.id,
        models.OrganizationMembership.status == 'active', models.Organization.status == 'active').first()
    if not row or (owner and row.role != 'owner'):
        raise HTTPException(404, 'Company workspace not found or not available to this account.')
    return row


def audit(db, org_id, user, action, detail):
    db.add(models.OrganizationAudit(organization_id=org_id, actor_id=user.id, action=action, detail=detail))


def locked_company(db, org_id):
    return db.query(models.Organization).filter_by(id=org_id).with_for_update().one()


def capacity(db, org_id):
    license = db.get(models.OrganizationLicense, org_id)
    active = db.query(models.OrganizationMembership).filter_by(organization_id=org_id, status='active').count()
    pending = db.query(models.OrganizationInvite).filter_by(organization_id=org_id, status='pending').filter(models.OrganizationInvite.expires_at > now()).count()
    return license, active, pending


def require_capacity(db, org_id, additional=1, reserve=True):
    license, active, pending = capacity(db, org_id)
    if not license or (license.expires_at and license.expires_at < now()):
        raise HTTPException(409, 'Company licence needs operator renewal before adding members.')
    if active + (pending if reserve else 0) + additional > license.seat_limit:
        raise HTTPException(409, 'No available seats. Revoke an unused invitation or contact your Cerbyl operator.')


class CompanyCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=3, max_length=160)
    institution_type: str = Field(default='coaching', pattern='^(coaching|training|school|university|company)$')


class SectionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    code: str = Field(min_length=2, max_length=30, pattern=r'^[A-Za-z0-9_-]+$')
    title: str = Field(min_length=3, max_length=160)
    name: str = Field(min_length=2, max_length=80)
    instructor_id: int
    student_ids: list[int] = Field(default_factory=list, max_length=200)
    schedule: str = Field(default='', max_length=120)
    room: str = Field(default='', max_length=80)


class InviteEntry(BaseModel):
    email: EmailStr
    role: str = Field(default='student', pattern='^(student|educator)$')
    section_id: int | None = None


class InviteBatch(BaseModel):
    entries: list[InviteEntry] = Field(min_length=1, max_length=200)


class AcceptInvite(BaseModel):
    token: str = Field(min_length=30, max_length=200)


class MemberState(BaseModel):
    status: str = Field(pattern='^(active|inactive)$')


class SectionState(BaseModel):
    status: str = Field(pattern='^(active|archived)$')


@router.post('/companies', status_code=201)
def create_company(payload: CompanyCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if user.account_role == 'student':
        raise HTTPException(403, 'Student accounts cannot create a company workspace.')
    if db.query(models.OrganizationMembership).filter_by(user_id=user.id, role='owner', status='active').count() >= 3:
        raise HTTPException(409, 'Contact your Cerbyl operator to provision more workspaces.')
    org = models.Organization(name=payload.name.strip(), slug='workspace-' + secrets.token_hex(8), institution_type=payload.institution_type)
    db.add(org); db.flush()
    db.add(models.OrganizationMembership(organization_id=org.id, user_id=user.id, role='owner'))
    db.add(models.OrganizationLicense(organization_id=org.id, seat_limit=25, plan='pilot', expires_at=now()+timedelta(days=30)))
    user.account_role = 'educator'
    audit(db, org.id, user, 'company_created', 'Created a 30-day, 25-seat pilot workspace.')
    db.commit()
    return {'id': org.id, 'name': org.name}


@router.get('/companies')
def companies(user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(models.OrganizationMembership).join(models.Organization).filter(models.OrganizationMembership.user_id == user.id, models.OrganizationMembership.status == 'active', models.Organization.status == 'active').all()
    return [{'id': r.organization_id, 'name': r.organization.name, 'role': r.role} for r in rows]


@router.get('/companies/{org_id}')
def company_detail(org_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    membership = member(db, org_id, user, owner=True)
    license, active, pending = capacity(db, org_id)
    sections = db.query(models.ClassSection).join(models.Course).filter(models.Course.organization_id == org_id).all()
    invites = db.query(models.OrganizationInvite).filter_by(organization_id=org_id).order_by(models.OrganizationInvite.id.desc()).limit(200).all()
    log = db.query(models.OrganizationAudit).filter_by(organization_id=org_id).order_by(models.OrganizationAudit.id.desc()).limit(50).all()
    return {'id': org_id, 'name': membership.organization.name,
        'license': {'plan': license.plan if license else 'unconfigured', 'seat_limit': license.seat_limit if license else 0, 'active': active, 'reserved': pending, 'expires_at': license.expires_at if license else None, 'includes_personal_ai': False},
        'members': [{'id': r.id, 'role': r.role, 'status': r.status, 'user': _user_summary(r.user)} for r in db.query(models.OrganizationMembership).filter_by(organization_id=org_id).all()],
        'sections': [{'id': s.id, 'code': s.course.code, 'title': s.course.title, 'name': s.name, 'instructor_id': s.instructor_id, 'status': s.status, 'students': sum(e.status == 'active' for e in s.enrollments)} for s in sections],
        'invitations': [{'id': i.id, 'email': i.email, 'role': i.role, 'status': 'expired' if i.status == 'pending' and i.expires_at < now() else i.status, 'expires_at': i.expires_at} for i in invites],
        'audit': [{'id': a.id, 'action': a.action, 'detail': a.detail, 'created_at': a.created_at} for a in log]}


@router.get('/educator/class-setup')
def class_setup(user=Depends(get_current_user), db: Session = Depends(get_db)):
    if user.account_role != 'educator':
        raise HTTPException(403, 'Class setup is available to teachers.')
    memberships = db.query(models.OrganizationMembership).join(models.Organization).filter(
        models.OrganizationMembership.user_id == user.id, models.OrganizationMembership.status == 'active',
        models.OrganizationMembership.role.in_(['owner', 'educator']), models.Organization.status == 'active').all()
    return {'instructor_id': user.id, 'companies': [{'id': m.organization_id, 'name': m.organization.name,
        'students': [_user_summary(student.user) for student in db.query(models.OrganizationMembership).filter_by(
            organization_id=m.organization_id, status='active', role='student').all()]} for m in memberships]}


@router.post('/companies/{org_id}/sections', status_code=201)
def create_section(org_id: int, payload: SectionCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    membership = member(db, org_id, user)
    if membership.role not in {'owner', 'educator'} or (membership.role == 'educator' and payload.instructor_id != user.id):
        raise HTTPException(403, 'Teachers can create classes only for themselves.')
    locked_company(db, org_id)
    license, _, _ = capacity(db, org_id)
    if license and license.expires_at and license.expires_at < now():
        raise HTTPException(402, 'Your company licence has expired. Ask the company owner to renew before creating a class.')
    student_ids = set(payload.student_ids)
    eligible = {m.user_id for m in db.query(models.OrganizationMembership).filter(
        models.OrganizationMembership.organization_id == org_id,
        models.OrganizationMembership.role == 'student', models.OrganizationMembership.status == 'active',
        models.OrganizationMembership.user_id.in_(student_ids)).all()}
    if eligible != student_ids:
        raise HTTPException(422, 'Choose active students from this company.')
    instructor = db.query(models.OrganizationMembership).filter_by(organization_id=org_id, user_id=payload.instructor_id, status='active').first()
    if not instructor or instructor.role not in {'owner', 'educator'}:
        raise HTTPException(422, 'Choose an active instructor in this company.')
    code = payload.code.upper()
    course = db.query(models.Course).filter_by(organization_id=org_id, code=code).first()
    if not course:
        course = models.Course(organization_id=org_id, code=code, title=payload.title.strip(), created_by=user.id)
        db.add(course); db.flush()
    elif course.title != payload.title.strip():
        raise HTTPException(409, 'That course code already has a different title. Use its existing title or a new code.')
    term = db.query(models.AcademicTerm).filter_by(organization_id=org_id, is_current=True).first()
    if not term:
        term = models.AcademicTerm(organization_id=org_id, name=f'{date.today().year} learning year', starts_on=date.today(), ends_on=date.today()+timedelta(days=365), is_current=True)
        db.add(term); db.flush()
    if db.query(models.ClassSection).filter_by(course_id=course.id, academic_term_id=term.id, name=payload.name.strip()).first():
        raise HTTPException(409, 'This cohort name already exists for the course.')
    section = models.ClassSection(course_id=course.id, academic_term_id=term.id, name=payload.name.strip(), instructor_id=payload.instructor_id, schedule_text=payload.schedule, room=payload.room)
    db.add(section); db.flush()
    for student_id in student_ids:
        db.add(models.Enrollment(section_id=section.id, student_id=student_id))
    audit(db, org_id, user, 'cohort_created', f'{code} · {section.name}')
    db.commit(); return {'id': section.id}


@router.patch('/companies/{org_id}/sections/{section_id}')
def section_state(org_id: int, section_id: int, payload: SectionState, user=Depends(get_current_user), db: Session = Depends(get_db)):
    member(db, org_id, user, owner=True)
    section = db.query(models.ClassSection).join(models.Course).filter(models.ClassSection.id == section_id, models.Course.organization_id == org_id).first()
    if not section: raise HTTPException(404, 'Cohort not found.')
    section.status = payload.status
    audit(db, org_id, user, 'cohort_' + payload.status, f'{section.course.code} · {section.name}')
    db.commit(); return {'status': section.status}


@router.post('/companies/{org_id}/invitations', status_code=201)
def invite(org_id: int, payload: InviteBatch, user=Depends(get_current_user), db: Session = Depends(get_db)):
    member(db, org_id, user, owner=True); locked_company(db, org_id)
    emails = [str(e.email).lower() for e in payload.entries]
    if len(set(emails)) != len(emails): raise HTTPException(422, 'Remove duplicate email addresses from this import.')
    require_capacity(db, org_id, len(emails))
    # Validate the entire import before reserving seats or creating tokens.
    for e, email in zip(payload.entries, emails):
        if len(email) > 100: raise HTTPException(422, 'Email addresses must be at most 100 characters.')
        if db.query(models.OrganizationMembership).join(models.User).filter(models.OrganizationMembership.organization_id == org_id, func.lower(models.User.email) == email).first():
            raise HTTPException(409, f'{email} is already a member. Manage their access in People.')
        if db.query(models.OrganizationInvite).filter_by(organization_id=org_id, email=email, status='pending').filter(models.OrganizationInvite.expires_at > now()).first():
            raise HTTPException(409, f'{email} already has a pending invitation.')
        if e.section_id:
            s = db.query(models.ClassSection).join(models.Course).filter(models.ClassSection.id == e.section_id, models.Course.organization_id == org_id, models.ClassSection.status == 'active').first()
            if not s or e.role != 'student': raise HTTPException(422, 'Student invitations must reference an active cohort in this company.')
    result = []
    for e, email in zip(payload.entries, emails):
        token = secrets.token_urlsafe(32)
        db.add(models.OrganizationInvite(organization_id=org_id, email=email, role=e.role, section_id=e.section_id, token_hash=hashlib.sha256(token.encode()).hexdigest(), expires_at=now()+timedelta(days=7), created_by=user.id))
        result.append({'email': email, 'token': token, 'path': '/join-company?invite=' + token})
    audit(db, org_id, user, 'members_invited', f'Reserved {len(result)} seats. Invitation links were generated for manual sharing.')
    db.commit(); return {'invitations': result}


@router.delete('/companies/{org_id}/invitations/{invite_id}')
def revoke_invite(org_id: int, invite_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    member(db, org_id, user, owner=True); locked_company(db, org_id)
    row = db.query(models.OrganizationInvite).filter_by(id=invite_id, organization_id=org_id, status='pending').first()
    if not row: raise HTTPException(404, 'Pending invitation not found.')
    row.status = 'revoked'; audit(db, org_id, user, 'invitation_revoked', row.email)
    db.commit(); return {'status': 'revoked'}


@router.post('/invitations/accept')
def accept_invite(payload: AcceptInvite, user=Depends(get_current_user), db: Session = Depends(get_db)):
    hashed = hashlib.sha256(payload.token.encode()).hexdigest()
    row = db.query(models.OrganizationInvite).filter_by(token_hash=hashed).first()
    if not row: raise HTTPException(404, 'Invitation not found.')
    locked_company(db, row.organization_id)
    db.refresh(row)
    if row.status != 'pending' or row.expires_at < now(): raise HTTPException(409, 'Invitation expired or already used. Ask the company owner for a new link.')
    if db.get(models.Organization, row.organization_id).status != 'active': raise HTTPException(404, 'Company unavailable.')
    if (user.email or '').lower() != row.email: raise HTTPException(403, 'Sign in using the email address this invitation was sent to.')
    if user.account_role not in {'learner', row.role}: raise HTTPException(409, 'This account has a different classroom role. Use a separate account for this role.')
    require_capacity(db, row.organization_id, reserve=False)
    if db.query(models.OrganizationMembership).filter_by(organization_id=row.organization_id, user_id=user.id).first(): raise HTTPException(409, 'You already belong to this company. Ask its owner to manage your access.')
    if row.section_id and db.get(models.ClassSection, row.section_id).status != 'active': raise HTTPException(409, 'This cohort is archived. Ask for a new invitation.')
    db.add(models.OrganizationMembership(organization_id=row.organization_id, user_id=user.id, role=row.role))
    if row.section_id: db.add(models.Enrollment(section_id=row.section_id, student_id=user.id))
    user.account_role = row.role; row.status = 'accepted'
    audit(db, row.organization_id, user, 'invitation_accepted', user.email)
    db.commit(); return {'role': row.role, 'organization_id': row.organization_id}


@router.patch('/companies/{org_id}/members/{membership_id}')
def member_state(org_id: int, membership_id: int, payload: MemberState, user=Depends(get_current_user), db: Session = Depends(get_db)):
    member(db, org_id, user, owner=True); locked_company(db, org_id)
    row = db.query(models.OrganizationMembership).filter_by(id=membership_id, organization_id=org_id).first()
    if not row: raise HTTPException(404, 'Member not found.')
    if row.role == 'owner': raise HTTPException(409, 'Owner access cannot be changed here.')
    if row.status != payload.status:
        if payload.status == 'active': require_capacity(db, org_id)
        row.status = payload.status
        # Suspend enrollments immediately; reactivation deliberately requires the
        # owner to choose the cohorts again rather than restoring stale access.
        if payload.status == 'inactive':
            section_ids = [r[0] for r in db.query(models.ClassSection.id).join(models.Course).filter(models.Course.organization_id == org_id)]
            db.query(models.Enrollment).filter(models.Enrollment.section_id.in_(section_ids), models.Enrollment.student_id == row.user_id).update({'status': 'inactive'}, synchronize_session=False)
        audit(db, org_id, user, 'member_' + payload.status, row.user.email)
    db.commit(); return {'status': row.status}


class EnrollmentAdd(BaseModel):
    student_id: int


@router.post('/companies/{org_id}/sections/{section_id}/enrollments')
def enroll(org_id: int, section_id: int, payload: EnrollmentAdd, user=Depends(get_current_user), db: Session = Depends(get_db)):
    member(db, org_id, user, owner=True); locked_company(db, org_id)
    section = db.query(models.ClassSection).join(models.Course).filter(models.ClassSection.id == section_id, models.Course.organization_id == org_id, models.ClassSection.status == 'active').first()
    student = db.query(models.OrganizationMembership).filter_by(organization_id=org_id, user_id=payload.student_id, role='student', status='active').first()
    if not section or not student: raise HTTPException(404, 'Active cohort or student not found in this company.')
    row = db.query(models.Enrollment).filter_by(section_id=section_id, student_id=payload.student_id).first()
    if row: row.status = 'active'
    else: db.add(models.Enrollment(section_id=section_id, student_id=payload.student_id))
    audit(db, org_id, user, 'student_enrolled', f'{student.user.email} · {section.course.code} · {section.name}')
    db.commit(); return {'status': 'active'}


def csv_response(filename, headers, rows):
    # Prevent spreadsheet formula execution in user-supplied cells.
    def cell(v):
        s = '' if v is None else str(v)
        return "'" + s if s.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else s
    output = io.StringIO(); writer = csv.writer(output); writer.writerow(headers)
    writer.writerows([[cell(v) for v in row] for row in rows])
    return Response(output.getvalue(), media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="{filename}"'})


@router.get('/companies/{org_id}/roster.csv')
def roster_export(org_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    member(db, org_id, user, owner=True)
    rows = db.query(models.OrganizationMembership).filter_by(organization_id=org_id).all()
    return csv_response('company-roster.csv', ['Name', 'Email', 'Role', 'Status'], [[r.user.first_name, r.user.email, r.role, r.status] for r in rows])
