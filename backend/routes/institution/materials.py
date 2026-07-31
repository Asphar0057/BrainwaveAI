import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import RedirectResponse, Response
from sqlalchemy.orm import Session

import models
from database import get_db
from deps import get_current_user
from services.access_control import require_account_role
from services.storage_service import StorageService

from .helpers import _accessible_section, _notify_section_students, _record_activity, _safe_filename
from .schemas import CourseMaterialCreate

router = APIRouter()


@router.post(
    "/educator/sections/{section_id}/materials",
    status_code=status.HTTP_201_CREATED,
)
def create_course_material(
    section_id: int,
    payload: CourseMaterialCreate,
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    material = models.CourseMaterial(
        course_id=section.course_id,
        section_id=section.id,
        title=payload.title.strip(),
        material_type=payload.material_type.strip().lower(),
        source_url=str(payload.source_url) if payload.source_url else None,
        created_by=current_user.id,
    )
    db.add(material)
    db.flush()
    _record_activity(
        db,
        section_id=section.id,
        actor_id=current_user.id,
        event_type="material_published",
        entity_type="course_material",
        entity_id=material.id,
        title=material.title,
        detail="A new course resource is available.",
        visible_to_students=True,
    )
    _notify_section_students(
        db,
        section,
        f"New class material · {material.title}",
        f"{section.course.code} has a new {material.material_type}.",
        "class_material",
    )
    db.commit()
    db.refresh(material)
    return {
        "id": material.id,
        "title": material.title,
        "material_type": material.material_type,
        "source_url": material.source_url,
        "created_at": material.created_at,
    }


@router.post("/educator/sections/{section_id}/materials/upload")
async def upload_course_material(
    section_id: int,
    request: Request,
    title: str = Form(...),
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_account_role("educator")),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    clean_title = title.strip()
    if len(clean_title) < 3 or len(clean_title) > 180:
        raise HTTPException(status_code=422, detail="Material title must be 3–180 characters.")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Choose a non-empty file.")
    if len(raw) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Materials must be 50 MB or smaller.")
    safe_name = _safe_filename(file.filename)
    storage_path = f"classroom/materials/{section.course_id}/{uuid.uuid4()}_{safe_name}"
    StorageService.get_storage().upload_bytes(raw, storage_path, file.content_type)
    material = models.CourseMaterial(
        course_id=section.course_id,
        section_id=section.id,
        title=clean_title,
        material_type="document",
        status="published",
        storage_path=storage_path,
        original_filename=safe_name,
        content_type=(file.content_type or "application/octet-stream")[:120],
        file_size=len(raw),
        created_by=current_user.id,
    )
    db.add(material)
    db.flush()
    material.source_url = str(request.url_for("download_course_material", section_id=section.id, material_id=material.id))
    _notify_section_students(db, section, f"New class material · {material.title}", f"{section.course.code} has a new file.", "class_material")
    db.commit()
    return {"id": material.id, "title": material.title, "source_url": material.source_url, "file_size": material.file_size}


@router.get("/files/sections/{section_id}/materials/{material_id}", name="download_course_material")
def download_course_material(
    section_id: int,
    material_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _accessible_section(db, section_id, current_user)
    material = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.id == material_id,
        models.CourseMaterial.course_id == section.course_id,
        (models.CourseMaterial.section_id.is_(None))
        | (models.CourseMaterial.section_id == section.id),
    ).first()
    if not material or not material.storage_path:
        raise HTTPException(status_code=404, detail="Material file not found.")
    storage = StorageService.get_storage()
    if getattr(storage, "storage_type", "local") != "local":
        return RedirectResponse(storage.get_private_file_url(material.storage_path))
    return Response(
        storage.download_bytes(material.storage_path),
        media_type=material.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{material.original_filename or "material"}"'},
    )
