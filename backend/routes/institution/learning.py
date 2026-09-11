"""Teacher-approved learning, confidence evidence and closed-loop follow-up."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, AnyHttpUrl, model_validator, ConfigDict, StrictInt
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import models
from database import get_db
from deps import get_current_user
from services.access_control import require_account_role
from .helpers import _accessible_section, _active_section_ids, _display_name, _notify, _notify_section_students
from .company import csv_response

router = APIRouter()


def utc(): return datetime.now(timezone.utc).replace(tzinfo=None)


def scoped(db, cls, item_id, user):
    row = db.get(cls, item_id)
    if not row: raise HTTPException(404, 'Learning item not found.')
    _accessible_section(db, row.section_id, user)
    return row


class LessonBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=3, max_length=180)
    objective: str = Field(min_length=3, max_length=500)
    content: str = Field(min_length=20, max_length=30000)
    source_url: AnyHttpUrl | None = Field(default=None, max_length=500)
    position: int = Field(default=1, ge=1, le=1000)
    minutes: int = Field(default=10, ge=1, le=180)
    status: str = Field(default='draft', pattern='^(draft|published|archived)$')


class Confidence(BaseModel):
    confidence: int = Field(ge=1, le=3, strict=True)


class CheckQuestion(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    prompt: str = Field(min_length=5, max_length=2000)
    options: list[str] = Field(min_length=2, max_length=6)
    correct_index: int = Field(ge=0, le=5, strict=True)
    explanation: str = Field(min_length=10, max_length=3000)
    source: str = Field(min_length=3, max_length=1000)

    @model_validator(mode='after')
    def choices(self):
        if self.correct_index >= len(self.options) or any(not o.strip() or len(o)>1000 for o in self.options) or len(set(o.strip().lower() for o in self.options)) != len(self.options):
            raise ValueError('Provide distinct, non-empty options and a valid answer key.')
        return self


class CheckpointBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=3, max_length=180)
    concept: str = Field(min_length=2, max_length=120)
    questions: list[CheckQuestion] = Field(min_length=1, max_length=20)


class CheckpointAnswers(BaseModel):
    answers: list[StrictInt] = Field(min_length=1, max_length=20)
    confidence: list[StrictInt] = Field(min_length=1, max_length=20)


class FollowupBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    student_id: int
    title: str = Field(min_length=3, max_length=180)
    instructions: str = Field(min_length=20, max_length=5000)
    due_at: datetime | None = None
    checkpoint_attempt_id: int | None = None
    submission_id: int | None = None


class FollowupResponse(BaseModel):
    response: str = Field(min_length=20, max_length=10000)


class FollowupReview(BaseModel):
    review: str = Field(min_length=10, max_length=5000)
    status: str = Field(pattern='^(resolved|assigned)$')


def lesson_json(row, completion=None):
    return {k: getattr(row, k) for k in ('id','section_id','title','objective','content','source_url','position','minutes','status')} | {'completion': {'confidence': completion.confidence, 'completed_at': completion.completed_at} if completion else None}


def attempt_json(row):
    return {k: getattr(row, k) for k in ('id','checkpoint_id','score_percent','answers','confidence','results','submitted_at')}


def followup_json(row, db):
    student = db.get(models.User, row.student_id)
    return {k: getattr(row, k) for k in ('id','section_id','student_id','title','instructions','evidence','due_at','status','student_response','review','created_at','responded_at','reviewed_at')} | {'student_name': _display_name(student)}


@router.get('/sections/{section_id}/learning')
def learning_workspace(section_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    section = _accessible_section(db, section_id, user); teacher = user.account_role == 'educator'
    lessons = db.query(models.LearningLesson).filter_by(section_id=section_id).order_by(models.LearningLesson.position, models.LearningLesson.id).all()
    checkpoints = db.query(models.LearningCheckpoint).filter_by(section_id=section_id).order_by(models.LearningCheckpoint.id).all()
    own_done = {r.lesson_id: r for r in db.query(models.LessonCompletion).join(models.LearningLesson).filter(models.LearningLesson.section_id == section_id, models.LessonCompletion.student_id == user.id)}
    own_attempts = {r.checkpoint_id: r for r in db.query(models.CheckpointAttempt).join(models.LearningCheckpoint).filter(models.LearningCheckpoint.section_id == section_id, models.CheckpointAttempt.student_id == user.id)}
    check_rows = []
    for c in checkpoints:
        attempt = own_attempts.get(c.id)
        if not teacher and c.status != 'published' and not attempt: continue
        check_rows.append({'id': c.id, 'title': c.title, 'concept': c.concept, 'status': c.status, 'approved_at': c.approved_at,
            'questions': c.questions if teacher else [{'prompt': q['prompt'], 'options': q['options']} for q in c.questions],
            'attempt': attempt_json(attempt) if attempt else None})
    followups = db.query(models.LearningIntervention).filter_by(section_id=section_id)
    if not teacher: followups = followups.filter_by(student_id=user.id)
    return {'section': {'id': section.id, 'title': section.course.title, 'code': section.course.code, 'name': section.name, 'organization_name': section.course.organization.name},
        'lessons': [lesson_json(l, own_done.get(l.id)) for l in lessons if teacher or l.status == 'published'],
        'checkpoints': check_rows,
        'followups': [followup_json(r, db) for r in followups.order_by(models.LearningIntervention.id.desc()).limit(200)],
        'reports': [{'id': r.id, 'student_name': _display_name(db.get(models.User,r.user_id)), 'reason': r.reason, 'detail': r.detail, 'snapshot': r.snapshot, 'status': r.status, 'resolution': r.resolution} for r in db.query(models.AnswerReport).join(models.CheckpointAttempt, models.AnswerReport.resource_id == models.CheckpointAttempt.id).join(models.LearningCheckpoint).filter(models.AnswerReport.resource_type == 'checkpoint_attempt', models.LearningCheckpoint.section_id == section_id).order_by(models.AnswerReport.id.desc()).limit(200)] if teacher else [],
        'roster': [{'id': e.student_id, 'name': _display_name(e.student)} for e in section.enrollments if e.status == 'active'] if teacher else []}


@router.post('/educator/sections/{section_id}/lessons', status_code=201)
def create_lesson(section_id: int, payload: LessonBody, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    section = _accessible_section(db, section_id, user)
    row = models.LearningLesson(section_id=section_id, created_by=user.id, **payload.model_dump(mode='json'))
    db.add(row); db.flush()
    if row.status == 'published': _notify_section_students(db, section, 'New lesson · '+row.title, row.objective, 'class_lesson')
    db.commit(); return lesson_json(row)


@router.put('/educator/lessons/{lesson_id}')
def edit_lesson(lesson_id: int, payload: LessonBody, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    row = scoped(db, models.LearningLesson, lesson_id, user)
    for k, v in payload.model_dump(mode='json').items(): setattr(row, k, v)
    db.commit(); return lesson_json(row)


@router.post('/student/lessons/{lesson_id}/complete')
def complete_lesson(lesson_id: int, payload: Confidence, user=Depends(require_account_role('student')), db: Session = Depends(get_db)):
    lesson = scoped(db, models.LearningLesson, lesson_id, user)
    if lesson.status != 'published': raise HTTPException(404, 'Published lesson not found.')
    row = db.query(models.LessonCompletion).filter_by(lesson_id=lesson_id, student_id=user.id).first()
    if not row:
        row = models.LessonCompletion(lesson_id=lesson_id, student_id=user.id, confidence=payload.confidence); db.add(row)
    else: row.confidence = payload.confidence
    try: db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(409, 'Lesson already saved. Refresh to see your progress.')
    return {'status': 'completed', 'confidence': row.confidence, 'basis': 'student_self_report'}


@router.post('/educator/sections/{section_id}/checkpoints', status_code=201)
def create_checkpoint(section_id: int, payload: CheckpointBody, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    _accessible_section(db, section_id, user)
    row = models.LearningCheckpoint(section_id=section_id, created_by=user.id, **payload.model_dump())
    db.add(row); db.commit(); return {'id': row.id, 'status': row.status}


@router.put('/educator/checkpoints/{checkpoint_id}')
def edit_checkpoint(checkpoint_id: int, payload: CheckpointBody, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    row = scoped(db, models.LearningCheckpoint, checkpoint_id, user)
    db.query(models.LearningCheckpoint).filter_by(id=row.id).with_for_update().one(); db.refresh(row)
    if row.status != 'draft': raise HTTPException(409, 'Published checkpoints are fixed. Create a revised checkpoint to preserve student results.')
    for k, v in payload.model_dump().items(): setattr(row, k, v)
    db.commit(); return {'id': row.id}


@router.post('/educator/checkpoints/{checkpoint_id}/approve')
def approve_checkpoint(checkpoint_id: int, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    row = scoped(db, models.LearningCheckpoint, checkpoint_id, user)
    db.query(models.LearningCheckpoint).filter_by(id=row.id).with_for_update().one(); db.refresh(row)
    if row.status != 'draft': return {'id': row.id, 'status': row.status}
    CheckpointBody(title=row.title, concept=row.concept, questions=row.questions)
    row.status = 'published'; row.approved_by = user.id; row.approved_at = utc()
    _notify_section_students(db, _accessible_section(db, row.section_id, user), 'Checkpoint ready · '+row.title, 'Your instructor reviewed the questions, answer keys and references.', 'class_checkpoint')
    db.commit(); return {'id': row.id, 'status': row.status}


@router.post('/student/checkpoints/{checkpoint_id}/submit')
def submit_checkpoint(checkpoint_id: int, payload: CheckpointAnswers, user=Depends(require_account_role('student')), db: Session = Depends(get_db)):
    row = scoped(db, models.LearningCheckpoint, checkpoint_id, user)
    if row.status != 'published': raise HTTPException(404, 'Approved checkpoint not found.')
    existing = db.query(models.CheckpointAttempt).filter_by(checkpoint_id=row.id, student_id=user.id).first()
    if existing: return attempt_json(existing)
    if len(payload.answers) != len(row.questions) or len(payload.confidence) != len(row.questions): raise HTTPException(422, 'Answer every question and choose a confidence level.')
    results = []
    for q, answer, confidence in zip(row.questions, payload.answers, payload.confidence):
        if answer < 0 or answer >= len(q['options']) or confidence not in {1,2,3}: raise HTTPException(422, 'Invalid choice or confidence value.')
        results.append({**q, 'chosen_index': answer, 'is_correct': answer == q['correct_index'], 'confidence': confidence})
    attempt = models.CheckpointAttempt(checkpoint_id=row.id, student_id=user.id, answers=payload.answers, confidence=payload.confidence, results=results, score_percent=round(100*sum(r['is_correct'] for r in results)/len(results), 1))
    db.add(attempt)
    try: db.commit()
    except IntegrityError:
        db.rollback()
        attempt = db.query(models.CheckpointAttempt).filter_by(checkpoint_id=row.id, student_id=user.id).one()
    return attempt_json(attempt)


@router.get('/educator/sections/{section_id}/briefing')
def briefing(section_id: int, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    section = _accessible_section(db, section_id, user)
    attempts = db.query(models.CheckpointAttempt).join(models.LearningCheckpoint).filter(models.LearningCheckpoint.section_id == section_id).order_by(models.CheckpointAttempt.submitted_at.desc()).all()
    evidence = []
    for a in attempts:
        for index, r in enumerate(a.results):
            if not r['is_correct']:
                evidence.append({'attempt_id': a.id, 'student_id': a.student_id, 'student_name': _display_name(db.get(models.User, a.student_id)), 'concept': db.get(models.LearningCheckpoint, a.checkpoint_id).concept,
                    'question': r['prompt'], 'answer': r['options'][r['chosen_index']], 'expected': r['options'][r['correct_index']], 'source': r['source'], 'confidence': r['confidence'], 'submitted_at': a.submitted_at,
                    'signal': 'Confident but incorrect' if r['confidence'] == 3 else 'Needs another explanation', 'question_index': index})
    pending = []
    for assignment in section.assignments:
        if assignment.status != 'published' or not assignment.due_at or assignment.due_at > utc(): continue
        completed = {s.student_id for s in assignment.submissions if s.status in {'submitted','graded'}}
        for e in section.enrollments:
            if e.status == 'active' and e.student_id not in completed: pending.append({'student_id': e.student_id, 'student_name': _display_name(e.student), 'assignment': assignment.title, 'assignment_id': assignment.id})
    followups = db.query(models.LearningIntervention).filter_by(section_id=section_id).all()
    recent = [a for a in attempts if a.submitted_at >= utc()-timedelta(days=7)]
    checkins = db.query(models.LessonCompletion, models.LearningLesson).join(models.LearningLesson).filter(models.LearningLesson.section_id == section_id, models.LessonCompletion.confidence == 1).all()
    return {'lesson_checkins': [{'student_id': c.student_id, 'student_name': _display_name(db.get(models.User,c.student_id)), 'lesson': l.title, 'completed_at': c.completed_at} for c,l in checkins], 'window_days': 7, 'recent_attempts': len(recent), 'participating_students': len({a.student_id for a in recent}),
        'students': sum(e.status == 'active' for e in section.enrollments), 'waiting_for_review': sum(f.status == 'responded' for f in followups),
        'resolved_followups': sum(f.status == 'resolved' and f.reviewed_at and f.reviewed_at >= utc()-timedelta(days=7) for f in followups),
        'evidence': sorted(evidence, key=lambda e: -e['confidence'])[:200], 'missing_work': pending[:200],
        'basis': 'Checkpoint answers and assignment status. Confidence is self-reported; these are teaching signals, not a diagnosis.'}


@router.post('/educator/sections/{section_id}/followups', status_code=201)
def create_followup(section_id: int, payload: FollowupBody, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    section = _accessible_section(db, section_id, user)
    if not any(e.student_id == payload.student_id and e.status == 'active' for e in section.enrollments): raise HTTPException(404, 'Active student not found in this cohort.')
    evidence = {'basis': 'teacher_observation'}
    if payload.checkpoint_attempt_id:
        attempt = db.get(models.CheckpointAttempt, payload.checkpoint_attempt_id)
        if not attempt or attempt.student_id != payload.student_id or db.get(models.LearningCheckpoint, attempt.checkpoint_id).section_id != section_id: raise HTTPException(404, 'Attempt not found for this student and cohort.')
        evidence = {'basis': 'checkpoint', 'attempt_id': attempt.id, 'score_percent': attempt.score_percent, 'results': attempt.results}
    if payload.submission_id:
        submission = db.get(models.Submission, payload.submission_id)
        if not submission or submission.student_id != payload.student_id or submission.assignment.section_id != section_id: raise HTTPException(404, 'Submission not found for this student and cohort.')
        evidence = {'basis': 'assignment', 'submission_id': submission.id, 'answer': submission.content_text, 'score': submission.score, 'feedback': submission.feedback}
    row = models.LearningIntervention(section_id=section_id, student_id=payload.student_id, created_by=user.id, title=payload.title, instructions=payload.instructions, due_at=payload.due_at.replace(tzinfo=None) if payload.due_at and not payload.due_at.tzinfo else payload.due_at.astimezone(timezone.utc).replace(tzinfo=None) if payload.due_at else None, evidence=evidence)
    db.add(row); _notify(db, payload.student_id, 'Your next step · '+row.title, row.instructions, 'class_followup')
    db.commit(); return followup_json(row, db)


@router.post('/student/followups/{followup_id}/respond')
def respond_followup(followup_id: int, payload: FollowupResponse, user=Depends(require_account_role('student')), db: Session = Depends(get_db)):
    row = scoped(db, models.LearningIntervention, followup_id, user)
    if row.student_id != user.id: raise HTTPException(404, 'Follow-up not found.')
    if row.status != 'assigned': raise HTTPException(409, 'This response is already awaiting review or resolved.')
    changed = db.query(models.LearningIntervention).filter_by(id=row.id, status='assigned').update({'student_response': payload.response.strip(), 'status': 'responded', 'responded_at': utc()}, synchronize_session=False)
    if not changed: raise HTTPException(409, 'Response already saved. Refresh this page.')
    _notify(db, row.created_by, 'Follow-up ready to review', row.title, 'class_followup')
    db.commit(); return {'status': 'responded'}


@router.post('/educator/followups/{followup_id}/review')
def review_followup(followup_id: int, payload: FollowupReview, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    row = scoped(db, models.LearningIntervention, followup_id, user)
    changed = db.query(models.LearningIntervention).filter_by(id=row.id, status='responded').update({'review': payload.review.strip(), 'status': payload.status, 'reviewed_at': utc()}, synchronize_session=False)
    if not changed: raise HTTPException(409, 'Only a submitted response can be reviewed. Refresh this page.')
    _notify(db, row.student_id, 'Follow-up feedback · '+row.title, payload.review, 'class_followup')
    db.commit(); return {'status': payload.status}


@router.get('/student/plan')
def daily_plan(user=Depends(require_account_role('student')), db: Session = Depends(get_db)):
    ids = _active_section_ids(db, user)
    tasks = []
    for f in db.query(models.LearningIntervention).filter(models.LearningIntervention.section_id.in_(ids), models.LearningIntervention.student_id == user.id, models.LearningIntervention.status == 'assigned'):
        tasks.append({'type': 'followup', 'id': f.id, 'section_id': f.section_id, 'title': f.title, 'reason': 'Your instructor chose this next step for you.', 'minutes': 10, 'priority': 0, 'due_at': f.due_at})
    for sid in ids:
        section = db.get(models.ClassSection, sid)
        for a in section.assignments:
            if a.status != 'published' or (a.start_at and a.start_at > utc()): continue
            s = next((s for s in a.submissions if s.student_id == user.id), None)
            if s and s.status in {'submitted','graded'}: continue
            overdue = a.due_at and a.due_at < utc()
            tasks.append({'type': 'assignment', 'id': a.id, 'section_id': sid, 'title': a.title, 'reason': 'Past due. Submit your work or message your instructor.' if overdue else 'Finish your assigned coursework.', 'minutes': a.estimated_minutes, 'priority': 1 if overdue else 2, 'due_at': a.due_at})
    done_lessons = db.query(models.LessonCompletion.lesson_id).filter_by(student_id=user.id)
    for l in db.query(models.LearningLesson).filter(models.LearningLesson.section_id.in_(ids), models.LearningLesson.status == 'published', ~models.LearningLesson.id.in_(done_lessons)).order_by(models.LearningLesson.position):
        tasks.append({'type': 'lesson','id': l.id,'section_id': l.section_id,'title': l.title,'reason': l.objective,'minutes': l.minutes,'priority': 3,'due_at': None})
    attempted = db.query(models.CheckpointAttempt.checkpoint_id).filter_by(student_id=user.id)
    for c in db.query(models.LearningCheckpoint).filter(models.LearningCheckpoint.section_id.in_(ids), models.LearningCheckpoint.status == 'published', ~models.LearningCheckpoint.id.in_(attempted)):
        tasks.append({'type': 'checkpoint','id': c.id,'section_id': c.section_id,'title': c.title,'reason': 'Check your understanding with teacher-approved questions.','minutes': len(c.questions)*2,'priority': 4,'due_at': None})
    tasks.sort(key=lambda t: (t['priority'], t['due_at'] or datetime.max))
    return {'tasks': tasks[:50], 'total_tasks': len(tasks), 'suggested_minutes': sum(t['minutes'] for t in tasks[:3])}


@router.get('/submissions/{submission_id}/history')
def history(submission_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(models.Submission, submission_id)
    if not row: raise HTTPException(404, 'Submission not found.')
    _accessible_section(db, row.assignment.section_id, user)
    if user.account_role == 'student' and row.student_id != user.id: raise HTTPException(404, 'Submission not found.')
    return [{'id': r.id, 'attempt_number': r.attempt_number, 'event': r.event, 'snapshot': r.snapshot, 'created_at': r.created_at} for r in db.query(models.SubmissionRevision).filter_by(submission_id=submission_id).order_by(models.SubmissionRevision.id.desc())]


@router.get('/educator/sections/{section_id}/grades.csv')
def grades_export(section_id: int, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    section = _accessible_section(db, section_id, user)
    rows = [[_display_name(s.student), a.title, s.attempt_number, s.status, s.score, a.points_possible, s.feedback] for a in section.assignments for s in a.submissions if s.status in {'submitted','graded'}]
    return csv_response('cohort-grades.csv', ['Student','Assignment','Attempt','Status','Score','Possible','Feedback'], rows)


@router.post('/educator/checkpoints/{checkpoint_id}/archive')
def archive_checkpoint(checkpoint_id: int, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    row = scoped(db, models.LearningCheckpoint, checkpoint_id, user)
    row.status = 'archived'
    db.commit()
    return {'status': 'archived'}


class ReportResolution(BaseModel):
    resolution: str = Field(min_length=10, max_length=5000)


@router.post('/educator/checkpoint-reports/{report_id}/resolve')
def resolve_checkpoint_report(report_id: int, payload: ReportResolution, user=Depends(require_account_role('educator')), db: Session = Depends(get_db)):
    report = db.query(models.AnswerReport).filter_by(id=report_id, resource_type='checkpoint_attempt').first()
    if not report: raise HTTPException(404, 'Report not found.')
    attempt = db.get(models.CheckpointAttempt, report.resource_id)
    if not attempt: raise HTTPException(404, 'Attempt not found.')
    checkpoint = scoped(db, models.LearningCheckpoint, attempt.checkpoint_id, user)
    report.status = 'resolved'; report.resolution = payload.resolution.strip(); report.resolved_by = user.id; report.resolved_at = utc()
    _notify(db, report.user_id, 'Checkpoint correction reviewed', payload.resolution, 'class_correction')
    db.commit()
    return {'status': 'resolved'}
