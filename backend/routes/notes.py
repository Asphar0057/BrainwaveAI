import json
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from deps import (
    call_ai,
    call_ai_async,
    enforce_request_user_scope,
    get_current_user,
    get_db,
    get_user_by_email,
    get_user_by_username,
)
from uid_utils import resolve_by_id_or_uid

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api",
    tags=["notes"],
    dependencies=[Depends(enforce_request_user_scope)],
)

class NoteCreate(BaseModel):
    user_id: str
    title: str = "New Note"
    content: str = ""
    folder_id: Optional[int] = None
    custom_font: Optional[str] = "Inter"
    canvas_data: Optional[str] = None

class NoteUpdate(BaseModel):
    note_id: str
    title: str
    content: str
    custom_font: Optional[str] = None
    canvas_data: Optional[str] = None

class FolderCreate(BaseModel):
    user_id: str
    name: str
    color: Optional[str] = "#D7B38C"
    parent_id: Optional[int] = None

class NoteUpdateFolder(BaseModel):
    note_id: str
    folder_id: Optional[int] = None

class NoteFavorite(BaseModel):
    note_id: str
    is_favorite: bool

class AIWritingAssistRequest(BaseModel):
    user_id: str
    content: str
    action: str
    tone: Optional[str] = "professional"

class NoteAgentRequest(BaseModel):
    user_id: str
    action: str
    content: Optional[str] = None
    topic: Optional[str] = None
    tone: Optional[str] = "professional"
    depth: Optional[str] = "standard"
    context: Optional[str] = None
    use_hs_context: bool = True
    context_doc_ids: Optional[list[str]] = None

def _note_folder_ids(db: Session, note: models.Note) -> list[int]:
    folder_ids = {
        folder_id
        for (folder_id,) in db.query(models.NoteFolder.folder_id)
        .filter(models.NoteFolder.note_id == note.id)
        .all()
        if folder_id is not None
    }
    legacy_folder_id = getattr(note, "folder_id", None)
    if legacy_folder_id is not None:
        folder_ids.add(legacy_folder_id)
    return sorted(folder_ids)

def _ensure_note_folder_membership(db: Session, note: models.Note, folder_id: Optional[int]) -> None:
    if folder_id is None:
        return
    exists = (
        db.query(models.NoteFolder)
        .filter(
            models.NoteFolder.note_id == note.id,
            models.NoteFolder.folder_id == folder_id,
        )
        .first()
    )
    if not exists:
        db.add(models.NoteFolder(note_id=note.id, folder_id=folder_id))

def _folder_note_count(db: Session, folder_id: int) -> int:
    note_ids = {
        note_id
        for (note_id,) in db.query(models.NoteFolder.note_id)
        .join(models.Note, models.Note.id == models.NoteFolder.note_id)
        .filter(
            models.NoteFolder.folder_id == folder_id,
            models.Note.is_deleted == False,
        )
        .all()
    }
    note_ids.update(
        note_id
        for (note_id,) in db.query(models.Note.id)
        .filter(models.Note.folder_id == folder_id, models.Note.is_deleted == False)
        .all()
    )
    return len(note_ids)

class ContextNotesCreateRequest(BaseModel):
    user_id: str
    context_doc_ids: list[str]
    title: Optional[str] = None
    topic: Optional[str] = None
    depth: Optional[str] = "standard"
    tone: Optional[str] = "professional"

def _trim(text: Optional[str], limit: int) -> str:
    if not text:
        return ""
    return text[:limit]

def _clean_grammar_result(text: str) -> str:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:text|markdown)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = re.sub(
        r"^\s*(?:corrected(?:\s+(?:sentence|text|version))?|correction|answer)\s*:\s*",
        "",
        cleaned,
        count=1,
        flags=re.IGNORECASE,
    )
    cleaned = re.split(
        r"\n\s*\n?\s*(?:note|explanation|reasoning|changes?|context)\s*:",
        cleaned,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    return cleaned.strip()

def _build_note_agent_prompt(req: NoteAgentRequest) -> str:
    content = req.content or ""
    topic = req.topic or ""
    tone = req.tone or "professional"
    depth = req.depth or "standard"
    context = req.context or ""

    base = topic or content

    action_prompts = {
        "generate": f"Create comprehensive study notes about: {base}\n\nTone: {tone}\nDepth: {depth}\n",
        "explain": f"Explain this clearly and concisely:\n\n{_trim(content, 2000)}",
        "key_points": f"Extract 5-8 key points from:\n\n{_trim(content, 2000)}",
        "summarize": f"Summarize this:\n\n{_trim(content, 2000)}",
        "grammar": (
            "Correct only the grammar, spelling, capitalization, and punctuation of the text below.\n"
            "Return only the corrected text. Do not add a label, note, explanation, commentary, "
            "suggestion, parenthetical instruction, or quotation marks.\n"
            "Preserve the original meaning and level of detail. Do not complete an unfinished thought "
            "or add information that was not provided.\n\n"
            f"{_trim(content, 2000)}"
        ),
        "improve": f"Improve clarity and style:\n\n{_trim(content, 2000)}",
        "simplify": f"Simplify this for easier understanding:\n\n{_trim(content, 2000)}",
        "expand": f"Expand with more detail and examples:\n\n{_trim(content, 2000)}",
        "continue": f"Continue writing from where this text ends:\n\n{_trim(content, 1200)}",
        "tone_change": f"Rewrite in a {tone} tone:\n\n{_trim(content, 2000)}",
        "outline": f"Create a structured outline about: {base}\n\nTone: {tone}\nDepth: {depth}\n",
        "code": f"Help with this code or request:\n\n{_trim(content or topic, 2000)}",
    }

    prompt = action_prompts.get(req.action, f"Help with this request:\n\n{_trim(content or topic, 2000)}")

    if context and req.action != "grammar":
        prompt += f"\n\nContext:\n{_trim(context, 2000)}"

    return prompt

def _build_context_note_title(title: Optional[str], docs: list[models.ContextDocument]) -> str:
    clean = (title or "").strip()
    if clean:
        return clean[:220]
    if len(docs) == 1:
        raw = (docs[0].filename or "Document").rsplit(".", 1)[0].strip()
        return f"Study Notes: {raw[:120] or 'Document'}"
    return f"Study Notes ({len(docs)} Documents)"

def _fetch_document_chunks(user_id: int, doc_id: str) -> list[str]:
    try:
        from services import vector_store as vs
    except Exception:
        return []

    if not vs.available():
        return []

    try:
        rows = vs.get_by_metadata("user_docs", {"doc_id": doc_id}, user_id=str(user_id))
    except Exception:
        rows = []
    if not rows:
        return []

    rows.sort(
        key=lambda r: int(str((r.get("metadata") or {}).get("chunk_index", "0")).strip() or "0")
        if str((r.get("metadata") or {}).get("chunk_index", "0")).strip().isdigit()
        else 0
    )
    chunks: list[str] = []
    for row in rows:
        text = (row.get("content") or "").strip()
        if text:
            chunks.append(text)
    return chunks

def _fetch_topic_chunks_for_docs(
    user_id: int,
    doc_ids: list[str],
    topic: str,
    top_k: int = 16,
) -> dict[str, list[str]]:
    clean_topic = (topic or "").strip()
    if not clean_topic or not doc_ids:
        return {}

    try:
        from services import context_store
    except Exception:
        return {}

    if not context_store.available():
        return {}

    try:
        rows = context_store.search_context(
            query=clean_topic,
            user_id=str(user_id),
            use_hs=False,
            top_k=max(4, min(int(top_k or 16), 30)),
            doc_ids=doc_ids,
        )
    except Exception:
        rows = []

    if not rows:
        return {}

    grouped: dict[str, list[str]] = {str(d): [] for d in doc_ids}
    for row in rows:
        metadata = row.get("metadata") if isinstance(row, dict) else {}
        if not isinstance(metadata, dict):
            metadata = {}
        doc_id = str(metadata.get("doc_id") or "").strip()
        if not doc_id or doc_id not in grouped:
            continue
        text = _clean_chunk_text(str(row.get("text") or ""))
        if not text:
            continue
        text = text[:2200]
        if text in grouped[doc_id]:
            continue
        grouped[doc_id].append(text)

    return {doc_id: chunks for doc_id, chunks in grouped.items() if chunks}

def _clean_chunk_text(text: str) -> str:
    clean = (text or "").replace("\u0000", " ").strip()
    clean = re.sub(r"\(cid:\d+\)", " ", clean)
    clean = re.sub(r"[ \t]+", " ", clean)
    clean = re.sub(r"\n{3,}", "\n\n", clean)
    return clean.strip()

def _build_chunk_batches(
    chunks: list[str],
    max_chunks_per_batch: int = 18,
    max_chars_per_batch: int = 18000,
) -> list[list[tuple[int, str]]]:
    cleaned = [(idx + 1, _clean_chunk_text(ch)) for idx, ch in enumerate(chunks)]
    cleaned = [(i, t) for i, t in cleaned if t]
    if not cleaned:
        return []

    batches: list[list[tuple[int, str]]] = []
    current: list[tuple[int, str]] = []
    current_chars = 0
    for chunk_no, text in cleaned:
        t = text[:2200]
        extra = len(t) + 32
        if current and (len(current) >= max_chunks_per_batch or current_chars + extra > max_chars_per_batch):
            batches.append(current)
            current = [(chunk_no, t)]
            current_chars = len(t)
        else:
            current.append((chunk_no, t))
            current_chars += extra
    if current:
        batches.append(current)
    return batches

async def _merge_markdown_parts(parts: list[str], merge_prompt_prefix: str, max_chars: int = 22000) -> str:
    if not parts:
        return ""
    working = [p for p in parts if p and p.strip()]
    if not working:
        return ""

    while len(working) > 1:
        next_round: list[str] = []
        batch: list[str] = []
        batch_len = 0
        for part in working:
            part_len = len(part)
            if batch and batch_len + part_len > max_chars:
                prompt = (
                    f"{merge_prompt_prefix}\n\n"
                    "Draft note parts to merge:\n\n"
                    + "\n\n---\n\n".join(batch)
                )
                merged = (await call_ai_async(prompt, max_tokens=4500, temperature=0.35)).strip()
                next_round.append(merged or "\n\n".join(batch))
                batch = [part]
                batch_len = part_len
            else:
                batch.append(part)
                batch_len += part_len
        if batch:
            if len(batch) == 1:
                next_round.append(batch[0])
            else:
                prompt = (
                    f"{merge_prompt_prefix}\n\n"
                    "Draft note parts to merge:\n\n"
                    + "\n\n---\n\n".join(batch)
                )
                merged = (await call_ai_async(prompt, max_tokens=4500, temperature=0.35)).strip()
                next_round.append(merged or "\n\n".join(batch))
        working = next_round
    return working[0]

async def _generate_doc_level_notes(doc: models.ContextDocument, chunks: list[str], depth: str, tone: str) -> str:
    if not chunks:
        fallback = (doc.ai_summary or "").strip()
        if fallback:
            return f"## {doc.filename or doc.doc_id}\n\n{fallback}"
        return ""

    chunk_batches = _build_chunk_batches(chunks, max_chunks_per_batch=18, max_chars_per_batch=18000)
    if not chunk_batches:
        return ""

    intermediate_notes: list[str] = []
    for idx, batch in enumerate(chunk_batches, start=1):
        chunk_block = "\n\n".join([f"[Chunk {chunk_no}]\n{text}" for chunk_no, text in batch])
        segment_prompt = (
            "You are turning raw PDF chunks into clear study notes.\n"
            f"Document: {doc.filename or doc.doc_id}\n"
            f"Subject: {doc.subject or 'General'}\n"
            f"Depth: {depth}\n"
            f"Tone: {tone}\n"
            f"Batch: {idx}/{len(chunk_batches)}\n\n"
            "Instructions:\n"
            "- Use ONLY provided chunks; do not invent facts.\n"
            "- Convert noisy text into clear notes.\n"
            "- Preserve definitions, formulas, examples, steps, and facts.\n"
            "- If question-answer style is present, convert it into concept explanations.\n"
            "- Remove OCR/PDF noise and duplicates.\n"
            "- Keep this structure:\n"
            f"  ### Batch {idx} Notes\n"
            "  - Key Concepts\n"
            "  - Important Details\n"
            "  - Formulas / Facts\n"
            "  - Examples / Applications\n"
            "  - Potential Confusions\n"
            "- Return markdown only.\n\n"
            "Raw chunks:\n"
            f"{chunk_block}"
        )
        segment = (await call_ai_async(segment_prompt, max_tokens=3600, temperature=0.2)).strip()
        if segment:
            intermediate_notes.append(segment)

    if not intermediate_notes:
        return ""

    merge_prompt = (
        f"Merge these batch notes into a single comprehensive, clear note for `{doc.filename or doc.doc_id}`.\n"
        "Preserve all important information. Remove only redundancy.\n"
        "Do not add facts that are not supported by the batch notes.\n"
        "Required sections:\n"
        "- Overview\n"
        "- Core Concepts\n"
        "- Detailed Explanations\n"
        "- Key Facts / Definitions / Formulas\n"
        "- Examples or Applications\n"
        "- Misconceptions & Clarifications\n"
        "- Quick Revision Checklist\n"
        "Return markdown only."
    )
    merged = await _merge_markdown_parts(intermediate_notes, merge_prompt, max_chars=20000)
    if not merged:
        merged = "\n\n".join(intermediate_notes)
    return f"## {doc.filename or doc.doc_id}\n\n{merged}".strip()

async def _generate_notes_from_context(docs: list[models.ContextDocument], doc_chunks: dict[str, list[str]], depth: str, tone: str) -> str:
    depth_key = (depth or "standard").lower()
    tone_key = (tone or "professional").lower()

    depth_instruction = {
        "brief": "Keep it concise and revision-focused. Use compact bullets.",
        "deep": "Go in depth with detailed explanations, examples, and conceptual links.",
    }.get(depth_key, "Balance clarity and depth for practical studying.")

    tone_instruction = {
        "academic": "Use formal, textbook-style wording.",
        "casual": "Use simple, conversational explanations.",
        "concise": "Be direct and compact; remove fluff.",
    }.get(tone_key, "Use clear, professional study-note language.")

    per_doc_notes: list[str] = []
    for doc in docs[:20]:
        chunks = doc_chunks.get(doc.doc_id, [])
        doc_note = await _generate_doc_level_notes(doc, chunks, depth_key, tone_key)
        if doc_note:
            per_doc_notes.append(doc_note)

    if not per_doc_notes:
        fallback = "\n\n".join(
            [
                f"## {d.filename or d.doc_id}\n\n{(d.ai_summary or '').strip()}"
                for d in docs[:20]
                if (d.ai_summary or "").strip()
            ]
        ).strip()
        return fallback

    if len(per_doc_notes) == 1:
        return per_doc_notes[0]

    final_merge_prompt = (
        "Merge the following document-level notes into one exhaustive study note.\n"
        f"Style constraints:\n- {depth_instruction}\n- {tone_instruction}\n"
        "Must preserve complete coverage of each document and keep document-specific sections.\n"
        "Add top-level sections:\n"
        "- Cross-Document Overview\n"
        "- Document-by-Document Notes\n"
        "- Common Themes\n"
        "- Differences / Contrasts\n"
        "- Final Master Revision Checklist\n"
        "Return markdown only."
    )
    merged = await _merge_markdown_parts(per_doc_notes, final_merge_prompt, max_chars=22000)
    return merged or "\n\n".join(per_doc_notes)

@router.get("/get_notes")
def get_notes(
    user_id: str = Query(...),
    limit: Optional[int] = Query(None, ge=1, le=500),
    offset: int = Query(0, ge=0),
    summary: bool = Query(False),
    db: Session = Depends(get_db),
):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    query = (
        db.query(models.Note)
        .filter(models.Note.user_id == user.id, models.Note.is_deleted == False)
        .order_by(models.Note.updated_at.desc())
    )
    if offset:
        query = query.offset(offset)
    if limit:
        query = query.limit(limit)
    notes = query.all()

    if summary:
        return [
            {
                "id": n.id,
                "uid": n.uid,
                "title": n.title,
                "preview": re.sub(r"<[^>]+>", " ", n.content or "").strip()[:240],
                "created_at": n.created_at.isoformat() + "Z" if n.created_at else None,
                "updated_at": n.updated_at.isoformat() + "Z" if n.updated_at else None,
                "is_favorite": getattr(n, "is_favorite", False),
                "folder_id": getattr(n, "folder_id", None),
                "is_deleted": False,
            }
            for n in notes
            if not n.is_deleted
        ]

    return [
        {
            "id": n.id,
            "uid": n.uid,
            "title": n.title,
            "content": n.content,
            "created_at": n.created_at.isoformat() + "Z" if n.created_at else None,
            "updated_at": n.updated_at.isoformat() + "Z" if n.updated_at else None,
            "is_favorite": getattr(n, "is_favorite", False),
            "folder_id": getattr(n, "folder_id", None),
            "folder_ids": _note_folder_ids(db, n),
            "custom_font": getattr(n, "custom_font", "Inter"),
            "canvas_data": getattr(n, "canvas_data", None) or "",
            "is_deleted": False,
        }
        for n in notes
        if not n.is_deleted
    ]

@router.post("/create_note")
def create_note(note_data: NoteCreate, db: Session = Depends(get_db)):
    user = get_user_by_username(db, note_data.user_id) or get_user_by_email(db, note_data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_note = models.Note(
        user_id=user.id,
        title=note_data.title,
        content=note_data.content,
        folder_id=note_data.folder_id,
        custom_font=note_data.custom_font or "Inter",
        canvas_data=note_data.canvas_data,
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    _ensure_note_folder_membership(db, new_note, note_data.folder_id)
    db.commit()

    try:
        from services.gamification_system import award_points
        award_points(db, user.id, "note_created")
        db.commit()
    except Exception:
        pass

    try:
        from tutor import chroma_store
        if chroma_store.available():
            import re as _re
            content_preview = ""
            if note_data.content:
                clean = _re.sub(r'<[^>]+>', '', note_data.content)
                clean = _re.sub(r'[#*_\[\]()]', '', clean).strip()
                content_preview = clean[:200]
            summary = (
                f"Note created: \"{note_data.title}\". "
                f"Content: {content_preview}" if content_preview else f"Note created: \"{note_data.title}\" (empty note)"
            )
            chroma_store.write_episode(
                user_id=str(user.id),
                summary=summary,
                metadata={
                    "source": "note_activity",
                    "action": "created",
                    "note_id": str(new_note.id),
                    "note_title": note_data.title[:100],
                },
            )
    except Exception as e:
        logger.warning(f"Chroma write failed on note create: {e}")

    return {
        "id": new_note.id,
        "uid": new_note.uid,
        "title": new_note.title,
        "content": new_note.content,
        "custom_font": getattr(new_note, "custom_font", "Inter"),
        "canvas_data": getattr(new_note, "canvas_data", None) or "",
        "folder_id": getattr(new_note, "folder_id", None),
        "folder_ids": _note_folder_ids(db, new_note),
        "user_id": user.id,
        "created_at": new_note.created_at.isoformat() + "Z",
        "updated_at": new_note.updated_at.isoformat() + "Z",
        "status": "success",
    }

@router.post("/create_note_from_context_docs")
async def create_note_from_context_docs(
    request: ContextNotesCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = current_user

    doc_ids = [str(d).strip() for d in (request.context_doc_ids or []) if str(d).strip()]
    doc_ids = list(dict.fromkeys(doc_ids))[:40]
    if not doc_ids:
        raise HTTPException(status_code=400, detail="context_doc_ids required")

    docs = (
        db.query(models.ContextDocument)
        .filter(
            models.ContextDocument.user_id == user.id,
            models.ContextDocument.doc_id.in_(doc_ids),
        )
        .all()
    )
    if not docs:
        raise HTTPException(status_code=404, detail="No matching documents found")

    doc_index = {doc_id: idx for idx, doc_id in enumerate(doc_ids)}
    docs.sort(key=lambda d: doc_index.get(d.doc_id, 10**6))

    doc_chunks = {doc_id: _fetch_document_chunks(user.id, doc_id) for doc_id in doc_ids}
    topic_focus = (request.topic or "").strip()
    if topic_focus:
        topic_chunks = _fetch_topic_chunks_for_docs(
            user_id=user.id,
            doc_ids=doc_ids,
            topic=topic_focus,
        )
        if topic_chunks:
            for doc_id, chunks in topic_chunks.items():
                if chunks:
                    doc_chunks[doc_id] = chunks
    try:
        content = await _generate_notes_from_context(
            docs=docs,
            doc_chunks=doc_chunks,
            depth=request.depth or "deep",
            tone=request.tone or "professional",
        )
    except Exception as gen_err:
        logger.warning(f"Context note generation failed: {gen_err}")
        content = ""

    if not content:
        fallback_title = _build_context_note_title(request.title, docs)
        content = (
            f"## {fallback_title}\n\n"
            "I could not generate full notes from the selected documents right now. "
            "Please try again."
        )

    note_title = _build_context_note_title(request.title, docs)
    new_note = models.Note(
        user_id=user.id,
        title=note_title,
        content=content,
        custom_font="Inter",
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    try:
        from services.gamification_system import award_points
        award_points(db, user.id, "note_created")
        db.commit()
    except Exception:
        pass

    return {
        "status": "success",
        "id": new_note.id,
        "uid": new_note.uid,
        "title": new_note.title,
        "content": new_note.content,
        "source_doc_count": len(docs),
    }

@router.put("/update_note")
def update_note(note_data: NoteUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    note = resolve_by_id_or_uid(db.query(models.Note), models.Note, note_data.note_id, uid_field="uid").first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if note.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot update a deleted note")

    note.title = note_data.title
    note.content = note_data.content
    if note_data.custom_font:
        note.custom_font = note_data.custom_font
    note.canvas_data = note_data.canvas_data
    note.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(note)

    try:
        from tutor import chroma_store
        if chroma_store.available():
            import re as _re
            content_preview = ""
            if note_data.content:
                clean = _re.sub(r'<[^>]+>', '', note_data.content)
                clean = _re.sub(r'[#*_\[\]()]', '', clean).strip()
                content_preview = clean[:200]
            summary = (
                f"Note updated: \"{note_data.title}\". "
                f"Content: {content_preview}" if content_preview else f"Note updated: \"{note_data.title}\""
            )
            chroma_store.write_episode(
                user_id=str(note.user_id),
                summary=summary,
                metadata={
                    "source": "note_activity",
                    "action": "updated",
                    "note_id": str(note.id),
                    "note_title": note_data.title[:100],
                },
            )
    except Exception as e:
        logger.warning(f"Chroma write failed on note update: {e}")

    return {
        "id": note.id,
        "uid": note.uid,
        "title": note.title,
        "content": note.content,
        "updated_at": note.updated_at.isoformat() + "Z",
        "custom_font": getattr(note, "custom_font", "Inter"),
        "canvas_data": getattr(note, "canvas_data", None) or "",
        "status": "success",
    }

@router.delete("/delete_note/{note_id}")
def delete_note(note_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    note = resolve_by_id_or_uid(db.query(models.Note), models.Note, note_id, uid_field="uid").first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(note)
    db.commit()
    return {"message": "Note deleted successfully"}

@router.get("/get_note/{note_id}")
def get_single_note(note_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    note = resolve_by_id_or_uid(db.query(models.Note), models.Note, note_id, uid_field="uid").first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    can_access = note.user_id == current_user.id
    if not can_access:
        shared = db.query(models.SharedContent).filter(
            models.SharedContent.content_type == "note",
            models.SharedContent.content_id == note.id,
            models.SharedContent.shared_with_id == current_user.id,
        ).first()
        can_access = shared is not None

    if not can_access:
        raise HTTPException(status_code=403, detail="Access denied")

    def _safe_json(value, default):
        if not value:
            return default
        if isinstance(value, (list, dict)):
            return value
        try:
            return json.loads(value)
        except Exception:
            return default

    return {
        "id": note.id,
        "uid": note.uid,
        "title": note.title,
        "content": note.content,
        "created_at": note.created_at.isoformat() + "Z" if note.created_at else None,
        "updated_at": note.updated_at.isoformat() + "Z" if note.updated_at else None,
        "is_favorite": getattr(note, "is_favorite", False),
        "folder_id": getattr(note, "folder_id", None),
        "folder_ids": _note_folder_ids(db, note),
        "custom_font": getattr(note, "custom_font", "Inter"),
        "canvas_data": getattr(note, "canvas_data", None) or "",
        "transcript": getattr(note, "transcript", "") or "",
        "analysis": _safe_json(getattr(note, "analysis", None), {}),
        "flashcards": _safe_json(getattr(note, "flashcards", None), []),
        "quiz_questions": _safe_json(getattr(note, "quiz_questions", None), []),
        "key_moments": _safe_json(getattr(note, "key_moments", None), []),
    }

@router.put("/soft_delete_note/{note_id}")
def soft_delete_note(note_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    note = resolve_by_id_or_uid(db.query(models.Note), models.Note, note_id, uid_field="uid").first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    note.is_deleted = True
    note.deleted_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Note moved to trash", "note_id": note.id, "status": "success"}

@router.put("/restore_note/{note_id}")
def restore_note(note_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    note = resolve_by_id_or_uid(db.query(models.Note), models.Note, note_id, uid_field="uid").first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    note.is_deleted = False
    note.deleted_at = None
    db.commit()

    return {"message": "Note restored", "note_id": note.id, "status": "success"}

@router.delete("/permanent_delete_note/{note_id}")
def permanent_delete_note(note_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    note = resolve_by_id_or_uid(db.query(models.Note), models.Note, note_id, uid_field="uid").first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(note)
    db.commit()
    return {"message": "Note permanently deleted", "status": "success"}

@router.get("/get_trash")
def get_trash(user_id: str = Query(...), db: Session = Depends(get_db)):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    notes = (
        db.query(models.Note)
        .filter(
            models.Note.user_id == user.id,
            models.Note.is_deleted == True,
            models.Note.deleted_at != None,
            models.Note.deleted_at >= thirty_days_ago,
        )
        .order_by(models.Note.deleted_at.desc())
        .all()
    )

    result = []
    for note in notes:
        deleted_at = note.deleted_at
        if deleted_at and deleted_at.tzinfo is None:
            deleted_at = deleted_at.replace(tzinfo=timezone.utc)
        days_remaining = max(0, 30 - (datetime.now(timezone.utc) - deleted_at).days) if deleted_at else 0

        result.append({
            "id": note.id,
            "title": note.title,
            "content": note.content[:200] if note.content else "",
            "deleted_at": deleted_at.isoformat() + "Z" if deleted_at else None,
            "days_remaining": days_remaining,
        })

    return {"trash": result, "total": len(result)}

@router.get("/get_folders")
def get_folders(user_id: str = Query(...), db: Session = Depends(get_db)):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    folders = (
        db.query(models.Folder)
        .filter(models.Folder.user_id == user.id)
        .order_by(models.Folder.name.asc())
        .all()
    )

    return {
        "folders": [
            {
                "id": f.id,
                "name": f.name,
                "color": f.color,
                "parent_id": f.parent_id,
                "note_count": _folder_note_count(db, f.id),
                "created_at": f.created_at.isoformat() + "Z",
            }
            for f in folders
        ]
    }

@router.post("/create_folder")
def create_folder(folder_data: FolderCreate, db: Session = Depends(get_db)):
    user = get_user_by_username(db, folder_data.user_id) or get_user_by_email(db, folder_data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    folder = models.Folder(
        user_id=user.id,
        name=folder_data.name,
        color=folder_data.color,
        parent_id=folder_data.parent_id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    return {"id": folder.id, "name": folder.name, "color": folder.color, "status": "success"}

@router.delete("/delete_folder/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    db.query(models.Note).filter(models.Note.folder_id == folder_id).update({"folder_id": None})
    db.query(models.NoteFolder).filter(models.NoteFolder.folder_id == folder_id).delete()
    db.delete(folder)
    db.commit()

    return {"status": "success"}

@router.put("/move_note_to_folder")
def move_note_to_folder(data: NoteUpdateFolder, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    note = resolve_by_id_or_uid(db.query(models.Note), models.Note, data.note_id, uid_field="uid").first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if data.folder_id is None:
        note.folder_id = None
        db.query(models.NoteFolder).filter(models.NoteFolder.note_id == note.id).delete()
    else:
        folder = db.query(models.Folder).filter(models.Folder.id == data.folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        if folder.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        if note.folder_id is None:
            note.folder_id = data.folder_id
        _ensure_note_folder_membership(db, note, data.folder_id)
    db.commit()

    return {"status": "success", "folder_id": getattr(note, "folder_id", None), "folder_ids": _note_folder_ids(db, note)}

@router.put("/remove_note_from_folder")
def remove_note_from_folder(data: NoteUpdateFolder, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if data.folder_id is None:
        raise HTTPException(status_code=400, detail="folder_id is required")

    note = resolve_by_id_or_uid(db.query(models.Note), models.Note, data.note_id, uid_field="uid").first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    folder = db.query(models.Folder).filter(models.Folder.id == data.folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    db.query(models.NoteFolder).filter(
        models.NoteFolder.note_id == note.id,
        models.NoteFolder.folder_id == data.folder_id,
    ).delete()

    if note.folder_id == data.folder_id:
        remaining_folder_id = (
            db.query(models.NoteFolder.folder_id)
            .filter(models.NoteFolder.note_id == note.id)
            .first()
        )
        note.folder_id = remaining_folder_id[0] if remaining_folder_id else None

    db.commit()

    return {"status": "success", "folder_id": getattr(note, "folder_id", None), "folder_ids": _note_folder_ids(db, note)}

@router.put("/toggle_favorite")
def toggle_favorite(data: NoteFavorite, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    note = resolve_by_id_or_uid(db.query(models.Note), models.Note, data.note_id, uid_field="uid").first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    note.is_favorite = data.is_favorite
    db.commit()

    return {"status": "success", "is_favorite": note.is_favorite}

@router.get("/get_favorite_notes")
def get_favorite_notes(user_id: str = Query(...), db: Session = Depends(get_db)):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    notes = (
        db.query(models.Note)
        .filter(
            models.Note.user_id == user.id,
            models.Note.is_favorite == True,
            models.Note.is_deleted == False,
        )
        .order_by(models.Note.updated_at.desc())
        .all()
    )

    return [
        {
            "id": n.id,
            "title": n.title,
            "content": n.content,
            "created_at": n.created_at.isoformat() + "Z" if n.created_at else None,
            "updated_at": n.updated_at.isoformat() + "Z" if n.updated_at else None,
            "is_favorite": True,
            "folder_id": getattr(n, "folder_id", None),
            "folder_ids": _note_folder_ids(db, n),
        }
        for n in notes
    ]

@router.post("/generate_note_content/")
async def generate_note_content(
    user_id: str = Form(...),
    topic: str = Form(...),
    db: Session = Depends(get_db),
):
    prompt = (
        f"Create comprehensive study notes on: {topic}\n\n"
        f"Format with markdown headers, bullet points, and key concepts. "
        f"Include examples where helpful."
    )
    try:
        content = await call_ai_async(prompt, max_tokens=2000, temperature=0.7)
        from services.math_processor import process_math_in_response
        return {"content": process_math_in_response(content.strip()), "status": "success"}
    except Exception as e:
        logger.error("note generation error: %s", e, exc_info=True)
        return {"content": "", "status": "error", "error": "AI generation failed"}

@router.post("/generate_note_summary/")
async def generate_note_summary(
    user_id: str = Form(...),
    conversation_data: str = Form(...),
    session_titles: str = Form(...),
    import_mode: str = Form("summary"),
    db: Session = Depends(get_db),
):
    if import_mode == "exam_prep":
        prompt = (
            f"Create an exam preparation guide from this conversation. Include:\n"
            f"1. Key Concepts\n2. Study Strategy\n3. Review Checklist\n\n"
            f"Conversation: {conversation_data[:3000]}"
        )
    else:
        prompt = (
            f"Create study notes from this conversation. "
            f"Format with headers, bullet points, and key concepts.\n\n"
            f"Conversation: {conversation_data[:3000]}"
        )

    try:
        content = await call_ai_async(prompt, max_tokens=2000, temperature=0.5)
        from services.math_processor import process_math_in_response
        return {"content": process_math_in_response(content.strip()), "title": session_titles, "status": "success"}
    except Exception as e:
        return {"content": conversation_data[:500], "title": session_titles, "status": "fallback"}

@router.post("/expand_note_content/")
async def expand_note_content(
    user_id: str = Form(...),
    content: str = Form(...),
    db: Session = Depends(get_db),
):
    prompt = (
        f"Expand and enrich these study notes with more detail, examples, and explanations:\n\n"
        f"{content[:3000]}\n\nExpanded notes:"
    )
    try:
        expanded = await call_ai_async(prompt, max_tokens=2000, temperature=0.7)
        from services.math_processor import process_math_in_response
        return {"content": process_math_in_response(expanded.strip()), "status": "success"}
    except Exception as e:
        return {"content": content, "status": "error"}

@router.post("/ai_writing_assistant/")
async def ai_writing_assistant(
    request: AIWritingAssistRequest,
    db: Session = Depends(get_db),
):
    action_prompts = {
        "continue": f"Continue writing from where this text left off:\n\n{request.content[-1000:]}",
        "improve": f"Improve the clarity and quality of this text:\n\n{request.content[:2000]}",
        "simplify": f"Simplify this text for easier understanding:\n\n{request.content[:2000]}",
        "expand": f"Expand on the ideas in this text with more detail:\n\n{request.content[:2000]}",
        "tone_change": f"Rewrite this text in a {request.tone} tone:\n\n{request.content[:2000]}",
    }

    prompt = action_prompts.get(request.action, f"Help with this text:\n\n{request.content[:2000]}")

    try:
        result = await call_ai_async(prompt, max_tokens=1500, temperature=0.7)
        from services.math_processor import process_math_in_response
        return {"content": process_math_in_response(result.strip()), "status": "success", "action": request.action}
    except Exception as e:
        logger.error("note generation error: %s", e, exc_info=True)
        return {"content": "", "status": "error", "error": "AI generation failed"}

@router.post("/agents/notes")
async def notes_agent(
    request: NoteAgentRequest,
    db: Session = Depends(get_db),
):
    user = get_user_by_username(db, request.user_id) or get_user_by_email(db, request.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    _NOTES_RAG_ACTIONS = {"generate", "explain", "summarize", "key_points", "outline"}

    try:
        prompt = _build_note_agent_prompt(request)

        rag_sources = []
        if request.use_hs_context and request.action in _NOTES_RAG_ACTIONS:
            query = (request.topic or request.content or "")[:300].strip()
            if query:
                try:
                    from services import context_store
                    if context_store.available():
                        results = context_store.search_context(
                            query=query,
                            user_id=str(user.id),
                            use_hs=request.use_hs_context,
                            top_k=5,
                            doc_ids=request.context_doc_ids or None,
                        )
                        rag_sources = context_store.build_rag_sources(results)
                        if rag_sources:
                            excerpts_text = context_store.format_rag_sources_block(rag_sources)
                            prompt += (
                                f"\n\nRELEVANT CURRICULUM CONTEXT:\n{excerpts_text}\n"
                                "Cite sources inline as [1], [2], etc. when used.\n"
                            )
                            logger.info(
                                f"[NOTES AGENT RAG] injected {len(rag_sources)} source(s) for action={request.action}"
                            )
                except Exception as rag_err:
                    logger.warning(f"[NOTES AGENT RAG] context fetch failed: {rag_err}")

        temperature = 0.2 if request.action == "grammar" else 0.7
        result = await call_ai_async(prompt, max_tokens=1500, temperature=temperature)
        content = _clean_grammar_result(result) if request.action == "grammar" else result.strip()
        from services.math_processor import process_math_in_response
        content = process_math_in_response(content)
        if rag_sources:
            from services.context_store import resolve_citations
            content = resolve_citations(content, rag_sources)
        return {"success": True, "content": content, "action": request.action}
    except Exception as e:
        logger.error("note agent error: %s", e, exc_info=True)
        return {"success": False, "error": "AI generation failed"}

@router.put("/update_shared_note/{note_id}")
def update_shared_note(
    note_id: str,
    data: dict,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = resolve_by_id_or_uid(db.query(models.Note), models.Note, note_id, uid_field="uid").first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    can_edit = note.user_id == current_user.id
    if not can_edit:
        shared = db.query(models.SharedContent).filter(
            models.SharedContent.content_type == "note",
            models.SharedContent.content_id == note.id,
            models.SharedContent.shared_with_id == current_user.id,
            models.SharedContent.permission == "edit",
        ).first()
        can_edit = shared is not None

    if not can_edit:
        raise HTTPException(status_code=403, detail="No edit permission for this note")

    if "title" in data:
        note.title = str(data["title"])[:500]
    if "content" in data:
        note.content = data["content"]
    if "canvas_data" in data:
        note.canvas_data = data["canvas_data"]
    note.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "success"}
