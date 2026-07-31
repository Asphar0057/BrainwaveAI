import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import RedirectResponse, Response
from sqlalchemy.orm import Session, joinedload

import models
from database import get_db
from deps import get_current_user
from services.access_control import normalize_account_role, require_account_role
from services.storage_service import StorageService

from .helpers import (
    _accessible_section,
    _assignment_row,
    _display_name,
    _ensure_assignment_available,
    _notify,
    _notify_section_students,
    _recalculate_enrollment,
    _record_activity,
    _safe_filename,
    _user_summary,
)
from .schemas import AssignmentCreate, AssignmentUpdate, GradeSubmission, SubmissionCreate, SubmissionDraft

router = APIRouter()


@router.put("/student/assignments/{assignment_id}/draft")
def save_assignment_draft(
    assignment_id: int,
    payload: SubmissionDraft,
    current_user: models.User = Depends(require_account_role("student")),
    db: Session = Depends(get_db),
):
    assignment = (
        db.query(models.Assignment)
        .filter(
            models.Assignment.id == assignment_id,
            models.Assignment.status == "published",
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    _accessible_section(db, assignment.section_id, current_user)
    _ensure_assignment_available(assignment)
    submission = (
        db.query(models.Submission)
        .filter(
            models.Submission.assignment_id == assignment.id,
            models.Submission.student_id == current_user.id,
        )
        .first()
    )
    if submission and submission.status in {"submitted", "graded"}:
        raise HTTPException(
            status_code=409,
            detail="Submitted work cannot be changed as a draft. Use resubmit instead.",
        )
    if not submission:
        submission = models.Submission(
            assignment_id=assignment.id,
            student_id=current_user.id,
            status="draft",
            attempt_number=1,
        )
        db.add(submission)
    submission.content_text = payload.content_text
    submission.attachment_url = (
        str(payload.attachment_url) if payload.attachment_url else None
    )
    submission.status = "draft"
    db.commit()
    db.refresh(submission)
    return {
        "id": submission.id,
        "assignment_id": assignment.id,
        "status": submission.status,
        "updated_at": submission.updated_at,
    }


@router.post("/student/assignments/{assignment_id}/submit")
def submit_assignment(
    assignment_id: int,
    payload: SubmissionCreate,
    current_user: models.User = Depends(require_account_role("student")),
    db: Session = Depends(get_db),
):
    assignment = (
        db.query(models.Assignment)
        .options(
            joinedload(models.Assignment.section).joinedload(
                models.ClassSection.assignments
            )
        )
        .filter(
            models.Assignment.id == assignment_id,
            models.Assignment.status == "published",
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    section = _accessible_section(db, assignment.section_id, current_user)
    _ensure_assignment_available(assignment)
    if len(payload.content_text.strip()) < 20 and not payload.attachment_url:
        raise HTTPException(
            status_code=422,
            detail="Add a response of at least 20 characters or attach your completed work.",
        )
    submission = (
        db.query(models.Submission)
        .filter(
            models.Submission.assignment_id == assignment.id,
            models.Submission.student_id == current_user.id,
        )
        .first()
    )
    now = datetime.now(timezone.utc)
    if submission:
        was_submitted = submission.status in {"submitted", "graded"}
        if was_submitted:
            if not assignment.allow_resubmission:
                raise HTTPException(status_code=409, detail="Resubmission is disabled for this assignment.")
            if submission.attempt_number >= assignment.max_attempts:
                raise HTTPException(status_code=409, detail=f"Maximum of {assignment.max_attempts} attempts reached.")
            submission.attempt_number = (submission.attempt_number or 1) + 1
        submission.score = None
        submission.feedback = None
        submission.graded_at = None
        submission.graded_by = None
    else:
        submission = models.Submission(
            assignment_id=assignment.id,
            student_id=current_user.id,
            attempt_number=1,
        )
        db.add(submission)
    submission.content_text = payload.content_text.strip()
    submission.attachment_url = (
        str(payload.attachment_url) if payload.attachment_url else None
    )
    submission.status = "submitted"
    submission.submitted_at = now
    db.flush()
    _record_activity(
        db,
        section_id=section.id,
        actor_id=current_user.id,
        event_type="submission_received",
        entity_type="submission",
        entity_id=submission.id,
        title=f"{_display_name(current_user)} submitted {assignment.title}",
        visible_to_students=False,
    )
    _recalculate_enrollment(db, section, current_user.id)
    db.commit()
    db.refresh(submission)
    return {
        "id": submission.id,
        "assignment_id": assignment.id,
        "status": submission.status,
        "attempt_number": submission.attempt_number,
        "submitted_at": submission.submitted_at,
    }


@router.get("/educator/assignments/{assignment_id}/submissions")
def get_assignment_submissions(
    assignment_id: int,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    assignment = (
        db.query(models.Assignment)
        .options(
            joinedload(models.Assignment.section)
            .joinedload(models.ClassSection.enrollments)
            .joinedload(models.Enrollment.student),
            joinedload(models.Assignment.submissions).joinedload(
                models.Submission.student
            ),
        )
        .filter(models.Assignment.id == assignment_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    section = _accessible_section(db, assignment.section_id, current_user)
    submissions_by_student = {
        row.student_id: row for row in assignment.submissions
    }

    submission_rows = []
    for enrollment in section.enrollments:
        if enrollment.status != "active":
            continue
        submission = submissions_by_student.get(enrollment.student_id)
        submission_rows.append(
            {
                "student": _user_summary(enrollment.student),
                "submission_id": submission.id if submission else None,
                "status": submission.status if submission else "not_started",
                "content_text": submission.content_text if submission else None,
                "attachment_url": submission.attachment_url if submission else None,
                "attachment_name": submission.attachment_name if submission else None,
                "attachment_size": submission.attachment_size if submission else None,
                "score": submission.score if submission else None,
                "feedback": submission.feedback if submission else None,
                "submitted_at": submission.submitted_at if submission else None,
            }
        )

    return {
        "assignment": {
            "id": assignment.id,
            "title": assignment.title,
            "description": assignment.description,
            "course_code": section.course.code,
            "points_possible": assignment.points_possible,
            "due_at": assignment.due_at,
        },
        "submissions": submission_rows,
    }


@router.patch("/educator/submissions/{submission_id}/grade")
def grade_submission(
    submission_id: int,
    payload: GradeSubmission,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    submission = (
        db.query(models.Submission)
        .options(
            joinedload(models.Submission.student),
            joinedload(models.Submission.assignment)
            .joinedload(models.Assignment.section)
            .joinedload(models.ClassSection.assignments)
            .joinedload(models.Assignment.submissions),
        )
        .filter(models.Submission.id == submission_id)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")
    section = _accessible_section(
        db,
        submission.assignment.section_id,
        current_user,
    )
    if submission.status not in {"submitted", "graded"}:
        raise HTTPException(
            status_code=409,
            detail="This student has not submitted work yet.",
        )
    if payload.score > submission.assignment.points_possible:
        raise HTTPException(
            status_code=422,
            detail=f"Score cannot exceed {submission.assignment.points_possible:g}.",
        )
    submission.score = payload.score
    submission.feedback = payload.feedback.strip()
    submission.status = "graded"
    submission.graded_at = datetime.now(timezone.utc)
    submission.graded_by = current_user.id
    _notify(
        db,
        submission.student_id,
        f"Feedback published · {submission.assignment.title}",
        f"Your work was graded {payload.score:g}/{submission.assignment.points_possible:g}. Open the assignment to read feedback.",
        "class_grade",
    )
    _record_activity(
        db,
        section_id=section.id,
        actor_id=current_user.id,
        event_type="feedback_published",
        entity_type="submission",
        entity_id=submission.id,
        title=f"Feedback published for {submission.assignment.title}",
        detail="A score and written feedback were published.",
        visible_to_students=False,
    )
    _recalculate_enrollment(db, section, submission.student_id)
    db.commit()
    return {
        "id": submission.id,
        "status": submission.status,
        "score": submission.score,
        "feedback": submission.feedback,
        "graded_at": submission.graded_at,
    }


@router.post(
    "/educator/assignments",
    status_code=status.HTTP_201_CREATED,
)
def create_assignment(
    payload: AssignmentCreate,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    section = (
        db.query(models.ClassSection)
        .filter(
            models.ClassSection.id == payload.section_id,
            models.ClassSection.instructor_id == current_user.id,
            models.ClassSection.status == "active",
        )
        .first()
    )
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class section not found or not assigned to you.",
        )

    assignment = models.Assignment(
        section_id=section.id,
        title=payload.title.strip(),
        description=payload.description,
        assignment_type=payload.assignment_type,
        due_at=payload.due_at,
        points_possible=payload.points_possible,
        estimated_minutes=payload.estimated_minutes,
        status=payload.status,
        ai_policy=payload.ai_policy,
        rubric_text=payload.rubric_text,
        weight_percent=payload.weight_percent,
        start_at=payload.start_at,
        allow_resubmission=payload.allow_resubmission,
        max_attempts=payload.max_attempts,
        created_by=current_user.id,
    )
    db.add(assignment)
    db.flush()
    if assignment.status == "published":
        _record_activity(
            db,
            section_id=section.id,
            actor_id=current_user.id,
            event_type="assignment_published",
            entity_type="assignment",
            entity_id=assignment.id,
            title=assignment.title,
            detail=assignment.description,
            visible_to_students=True,
        )
        _notify_section_students(
            db,
            section,
            f"New assignment · {assignment.title}",
            f"{section.course.code} published new work"
            + (f" due {assignment.due_at.strftime('%d %b')}" if assignment.due_at else "."),
            "class_assignment",
        )
    db.commit()
    db.refresh(assignment)
    return {
        "id": assignment.id,
        "section_id": assignment.section_id,
        "title": assignment.title,
        "due_at": assignment.due_at,
        "status": assignment.status,
    }


@router.get("/educator/assignments")
def list_educator_assignments(
    section_id: int | None = Query(default=None),
    include_archived: bool = Query(default=False),
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.Assignment)
        .options(
            joinedload(models.Assignment.section).joinedload(models.ClassSection.course),
            joinedload(models.Assignment.submissions),
        )
        .join(models.ClassSection)
        .filter(models.ClassSection.instructor_id == current_user.id)
    )
    if section_id:
        query = query.filter(models.Assignment.section_id == section_id)
    if not include_archived:
        query = query.filter(models.Assignment.status != "archived")
    assignments = query.order_by(models.Assignment.created_at.desc()).all()
    return {
        "assignments": [
            {
                **_assignment_row(item),
                "section_id": item.section_id,
                "course_code": item.section.course.code,
                "course_title": item.section.course.title,
                "published_status": item.status,
                "submitted_count": sum(row.status in {"submitted", "graded"} for row in item.submissions),
                "graded_count": sum(row.status == "graded" for row in item.submissions),
                "student_count": sum(row.status == "active" for row in item.section.enrollments),
            }
            for item in assignments
        ]
    }


@router.patch("/educator/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    payload: AssignmentUpdate,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    section = _accessible_section(db, assignment.section_id, current_user)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field in {"title", "description", "rubric_text"} and isinstance(value, str):
            value = value.strip()
        setattr(assignment, field, value)
    if changes.get("status") == "published":
        _notify_section_students(
            db,
            section,
            f"Assignment updated · {assignment.title}",
            f"{section.course.code} coursework has changed.",
            "class_assignment",
        )
    db.commit()
    db.refresh(assignment)
    return {**_assignment_row(assignment), "published_status": assignment.status, "section_id": assignment.section_id}


@router.delete("/educator/assignments/{assignment_id}")
def archive_assignment(
    assignment_id: int,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    _accessible_section(db, assignment.section_id, current_user)
    assignment.status = "archived"
    db.commit()
    return {"id": assignment.id, "status": "archived"}


@router.get("/educator/sections/{section_id}/gradebook")
def get_gradebook(
    section_id: int,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    assignments = [item for item in section.assignments if item.status == "published"]
    uses_weighting = any(item.weight_percent > 0 for item in assignments)
    rows = []
    for enrollment in section.enrollments:
        if enrollment.status != "active":
            continue
        scores = {}
        earned = possible = 0.0
        for assignment in assignments:
            submission = next((row for row in assignment.submissions if row.student_id == enrollment.student_id), None)
            scores[str(assignment.id)] = {
                "status": submission.status if submission else "not_started",
                "score": submission.score if submission else None,
            }
            if submission and submission.status == "graded" and submission.score is not None:
                if uses_weighting and assignment.weight_percent > 0:
                    earned += (submission.score / assignment.points_possible) * assignment.weight_percent
                    possible += assignment.weight_percent
                elif not uses_weighting:
                    earned += submission.score
                    possible += assignment.points_possible
        rows.append({
            "student": _user_summary(enrollment.student),
            "scores": scores,
            "average_percent": round(100 * earned / possible) if possible else None,
            "progress_percent": enrollment.progress_percent,
            "mastery_percent": enrollment.mastery_percent,
        })
    return {
        "section": {"id": section.id, "course_code": section.course.code, "course_title": section.course.title},
        "uses_weighting": uses_weighting,
        "assignments": [
            {"id": item.id, "title": item.title, "points_possible": item.points_possible, "weight_percent": item.weight_percent}
            for item in assignments
        ],
        "rows": rows,
    }


@router.post("/student/assignments/{assignment_id}/file")
async def upload_submission_file(
    assignment_id: int,
    request: Request,
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_account_role("student")),
    db: Session = Depends(get_db),
):
    assignment = db.query(models.Assignment).filter(
        models.Assignment.id == assignment_id,
        models.Assignment.status == "published",
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    _accessible_section(db, assignment.section_id, current_user)
    _ensure_assignment_available(assignment)
    submission = db.query(models.Submission).filter(
        models.Submission.assignment_id == assignment.id,
        models.Submission.student_id == current_user.id,
    ).first()
    if submission and submission.status in {"submitted", "graded"}:
        raise HTTPException(
            status_code=409,
            detail="Submitted file evidence is locked. Resubmit revised text or a new supporting link.",
        )
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Choose a non-empty file.")
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Files must be 25 MB or smaller.")
    safe_name = _safe_filename(file.filename)
    storage_path = f"classroom/submissions/{current_user.id}/{uuid.uuid4()}_{safe_name}"
    StorageService.get_storage().upload_bytes(raw, storage_path, file.content_type)
    if not submission:
        submission = models.Submission(
            assignment_id=assignment.id,
            student_id=current_user.id,
            status="draft",
            attempt_number=1,
        )
        db.add(submission)
        db.flush()
    submission.attachment_storage_path = storage_path
    submission.attachment_name = safe_name
    submission.attachment_content_type = (file.content_type or "application/octet-stream")[:120]
    submission.attachment_size = len(raw)
    submission.attachment_url = str(request.url_for("download_submission_file", submission_id=submission.id))
    db.commit()
    return {
        "submission_id": submission.id,
        "name": safe_name,
        "size": len(raw),
        "url": submission.attachment_url,
    }


@router.get("/files/submissions/{submission_id}", name="download_submission_file")
def download_submission_file(
    submission_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    submission = db.query(models.Submission).options(
        joinedload(models.Submission.assignment),
    ).filter(models.Submission.id == submission_id).first()
    if not submission or not submission.attachment_storage_path:
        raise HTTPException(status_code=404, detail="Submission file not found.")
    _accessible_section(db, submission.assignment.section_id, current_user)
    if normalize_account_role(current_user.account_role) == "student" and submission.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="You cannot access another student's file.")
    storage = StorageService.get_storage()
    if getattr(storage, "storage_type", "local") != "local":
        return RedirectResponse(storage.get_private_file_url(submission.attachment_storage_path))
    raw = storage.download_bytes(submission.attachment_storage_path)
    return Response(
        raw,
        media_type=submission.attachment_content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{submission.attachment_name or "submission"}"'},
    )
