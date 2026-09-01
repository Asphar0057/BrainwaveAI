
from __future__ import annotations

import logging
import uuid
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote
import ipaddress
import re
import requests

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload

import models
from services import context_store
from deps import get_db, get_current_user, call_ai
from services.document_processor import process_upload, CHUNK_SIZE, CHUNK_OVERLAP
from services.storage_service import StorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/context", tags=["context"])

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
DECK_LIMIT = 8

def _safe_storage_filename(filename: str) -> str:
    return re.sub(r"[^\w.\-]", "_", filename or "upload")[:180] or "upload"

def _store_context_original(file_bytes: bytes, *, user_id: int, doc_id: str, filename: str, content_type: str = "") -> dict:
    storage = StorageService.get_storage()
    safe_name = _safe_storage_filename(filename)
    storage_key = f"context_documents/{user_id}/{doc_id}/{safe_name}"
    result = storage.upload_bytes(file_bytes, storage_key, content_type or "application/octet-stream")
    storage_path = result.get("storage_path") or storage_key
    return {
        "storage_path": (
            storage.uri_for_path(storage_path)
            if hasattr(storage, "uri_for_path") and getattr(storage, "storage_type", "local") != "local"
            else storage_path
        ),
        "storage_type": result.get("storage_type") or getattr(storage, "storage_type", "local"),
        "storage_url": result.get("url") or "",
    }

def _storage_key_from_uri(file_path: str) -> str:
    parsed = urlparse(file_path or "")
    if parsed.scheme in {"s3", "r2"}:
        return parsed.path.lstrip("/")
    return file_path

def _read_context_original(storage_info: dict, fallback: bytes) -> bytes:
    if (storage_info.get("storage_type") or "local") == "local":
        return fallback
    storage = StorageService.get_storage()
    if not hasattr(storage, "download_bytes"):
        raise HTTPException(status_code=500, detail="Configured storage does not support file readback")
    try:
        return storage.download_bytes(_storage_key_from_uri(storage_info.get("storage_path") or ""))
    except Exception as exc:
        logger.error("Failed to read context document from storage: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Context document was stored but could not be read back from S3")

class RelatedTopicsRequest(BaseModel):
    topics: list[str]
    use_hs: bool = True
    top_k: int = 5
    max_related: int = 8

def _clean_topic_text(text: str) -> str:
    cleaned = re.sub(r"\.[a-zA-Z0-9]{1,5}$", "", text or "")
    cleaned = re.sub(r"[_\-\/]+", " ", cleaned)
    cleaned = re.sub(r"\b(chapter|unit|lesson|notes?|doc|document|slides?)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned

def _title_case_topic(text: str) -> str:
    return " ".join(word.capitalize() for word in (text or "").split())

def _extract_topic_from_result(result: dict) -> str:
    meta = result.get("metadata") or {}
    subject = (meta.get("subject") or "").strip()
    if subject and subject.lower() != "general":
        return context_store.canonicalize_subject(subject) or subject

    filename = (meta.get("filename") or "").strip()
    if filename:
        cleaned = _clean_topic_text(filename)
        if cleaned:
            return _title_case_topic(cleaned)

    text = (result.get("text") or "").strip()
    if not text:
        return ""
    first_line = text.splitlines()[0].strip()
    tokens = re.findall(r"[A-Za-z][A-Za-z'\-]+", first_line.lower())
    stopwords = context_store._STOPWORDS if hasattr(context_store, "_STOPWORDS") else set()
    generic = {
        "flashcards", "flashcard", "notes", "note", "quiz", "quizzes",
        "roadmap", "path", "plan", "study", "learning", "guide",
        "review", "overview", "summary", "explain", "practice"
    }
    keywords = [t for t in tokens if t not in stopwords and t not in generic]
    if not keywords:
        return ""
    return _title_case_topic(" ".join(keywords[:3]))

def _parse_ai_topics(raw: str) -> list[str]:
    if not raw:
        return []
    cleaned = raw.strip()
    cleaned = re.sub(r"```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip("`\n ")
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            topics = data.get("topics") or data.get("related_topics") or data.get("data") or []
        elif isinstance(data, list):
            topics = data
        else:
            topics = []
    except Exception:
        topics = []
        match = re.search(r"\[[\s\S]*\]", cleaned)
        if match:
            try:
                topics = json.loads(match.group(0))
            except Exception:
                topics = []
        if not topics:
            lines = [re.sub(r"^[\s\-*\d.]+", "", line).strip() for line in cleaned.splitlines()]
            topics = [line for line in lines if line]
    return [str(t).strip() for t in topics if str(t).strip()]

_BLOCKED_HOSTS = {
    "localhost", "127.0.0.1", "::1", "[::1]",
    "metadata.google.internal", "metadata.goog",
    "169.254.169.254",
    "100.100.100.200",
    "fd00:ec2::254",
}

import socket as _socket

def _resolve_and_check_ip(host: str) -> bool:
    try:
        infos = _socket.getaddrinfo(host, None)
        for info in infos:
            addr = info[4][0]
            try:
                ip = ipaddress.ip_address(addr)
                if (ip.is_private or ip.is_loopback or ip.is_reserved
                        or ip.is_link_local or ip.is_multicast):
                    return False
            except ValueError:
                return False
        return True
    except Exception:
        return False

def _is_safe_url(url: str) -> bool:
    if not url or len(url) > 2048:
        return False
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        host = parsed.hostname or ""
        if not host:
            return False
        host_lower = host.lower()
        if host_lower in _BLOCKED_HOSTS:
            return False
        if host_lower == "localhost" or host_lower.endswith(".localhost"):
            return False
        if host_lower.endswith(".internal") or host_lower.endswith(".local"):
            return False
        try:
            ip = ipaddress.ip_address(host)
            if (ip.is_private or ip.is_loopback or ip.is_reserved
                    or ip.is_link_local or ip.is_multicast):
                return False
        except ValueError:
            if not _resolve_and_check_ip(host_lower):
                return False
        return True
    except Exception:
        return False

_DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "Accept": "application/pdf,application/octet-stream,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

def _filename_from_disposition(value: str) -> str:
    if not value:
        return ""
    match = re.search(r"filename\\*=UTF-8''([^;]+)", value, re.IGNORECASE)
    if match:
        return unquote(match.group(1)).strip().strip('"')
    match = re.search(r'filename="?([^";]+)"?', value, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return ""

def _download_url(url: str) -> tuple[bytes, str, str]:
    current_url = url
    try:
        for _ in range(6):
            if not _is_safe_url(current_url):
                raise HTTPException(status_code=400, detail="Redirect to unsafe URL blocked")
            resp = requests.get(current_url, stream=True, timeout=30, headers=_DEFAULT_HEADERS, allow_redirects=False)
            if not (resp.is_redirect or resp.is_permanent_redirect):
                break
            location = resp.headers.get("Location", "")
            next_url = urljoin(current_url, location)
            if not location or not _is_safe_url(next_url):
                raise HTTPException(status_code=400, detail="Redirect to unsafe URL blocked")
            current_url = next_url
        else:
            raise HTTPException(status_code=400, detail="URL redirected too many times")
        if resp.status_code in (401, 403, 406):
            resp = requests.get(current_url, stream=True, timeout=30, headers={**_DEFAULT_HEADERS, "Referer": current_url}, allow_redirects=False)
    except requests.exceptions.RequestException as e:
        logger.warning(f"URL fetch failed: {e}")
        raise HTTPException(status_code=400, detail="Failed to fetch the URL. The resource may be unavailable or blocked.")

    if resp.status_code >= 400:
        if resp.status_code == 403:
            raise HTTPException(
                status_code=400,
                detail="URL blocked by host (403). Download locally and upload the file instead.",
            )
        raise HTTPException(status_code=400, detail=f"URL returned status {resp.status_code}")

    content_length = resp.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_FILE_SIZE_BYTES:
                raise HTTPException(status_code=413, detail="File too large. Maximum size is 50 MB.")
        except ValueError:
            pass

    content = bytearray()
    for chunk in resp.iter_content(chunk_size=1024 * 256):
        if not chunk:
            continue
        content.extend(chunk)
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 50 MB.")

    if not content:
        raise HTTPException(status_code=400, detail="Downloaded file is empty.")

    content_type = resp.headers.get("content-type", "")
    filename_hint = _filename_from_disposition(resp.headers.get("content-disposition", ""))
    return bytes(content), content_type, filename_hint

class ImportUrlRequest(BaseModel):
    url: str
    subject: str = ""
    grade_level: str = ""
    scope: str = "private"
    source_name: str = ""
    license: str = ""
    folder_id: Optional[int] = None

class AskRequest(BaseModel):
    question: str
    use_hs: bool = True
    top_k: int = 6
    doc_ids: Optional[list[str]] = None

class ContextFolderCreateRequest(BaseModel):
    name: str
    color: Optional[str] = "#D7B38C"
    parent_id: Optional[int] = None

class ContextFolderUpdateRequest(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    parent_id: Optional[int] = None

class ContextDocumentFolderUpdateRequest(BaseModel):
    folder_id: Optional[int] = None

def _normalize_topic_key(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())

def _parse_json_list(raw_value) -> list[str]:
    if raw_value is None:
        return []
    if isinstance(raw_value, list):
        return [str(v).strip() for v in raw_value if str(v).strip()]
    if isinstance(raw_value, str):
        value = raw_value.strip()
        if not value:
            return []
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(v).strip() for v in parsed if str(v).strip()]
        except Exception:
            pass
        return [value]
    return []

def _lookup_topic_mastery_score(
    topic: str,
    exact_map: dict[str, float],
    normalized_states: list[tuple[str, float]],
) -> float:
    key = _normalize_topic_key(topic)
    if not key:
        return -1.0
    if key in exact_map:
        return exact_map[key]

    best = -1.0
    for state_key, score in normalized_states:
        if not state_key:
            continue
        if state_key in key or key in state_key:
            best = max(best, score)
    return best

def _build_doc_progress_payload(db: Session, user_id: int) -> dict:
    docs = (
        db.query(models.ContextDocument)
        .filter(models.ContextDocument.user_id == user_id)
        .all()
    )

    states = (
        db.query(models.StudentKnowledgeState)
        .filter(models.StudentKnowledgeState.user_id == user_id)
        .all()
    )
    exact_mastery: dict[str, float] = {}
    normalized_states: list[tuple[str, float]] = []
    for state in states:
        key = _normalize_topic_key(state.concept_name or state.concept_id or "")
        score = float(state.p_mastery or 0.0)
        if not key:
            continue
        exact_mastery[key] = max(exact_mastery.get(key, -1.0), score)

    normalized_states = list(exact_mastery.items())

    doc_progress: list[dict] = []
    folder_aggregate: dict[str, dict] = {}
    overall_mastered_topics = 0
    overall_total_topics = 0
    docs_with_topics = 0
    mastered_docs = 0

    for doc in docs:
        raw_topics = []
        raw_topics.extend(_parse_json_list(doc.topic_tags))
        raw_topics.extend(_parse_json_list(doc.key_concepts))
        if doc.subject:
            raw_topics.append(doc.subject)

        dedup = {}
        for t in raw_topics:
            norm = _normalize_topic_key(t)
            if norm and norm not in dedup:
                dedup[norm] = t.strip()
        topics = list(dedup.values())

        mastered = []
        weak = []
        remaining = []

        for topic in topics:
            score = _lookup_topic_mastery_score(topic, exact_mastery, normalized_states)
            if score < 0:
                remaining.append(topic)
            elif score >= 0.75:
                mastered.append(topic)
            elif score < 0.45:
                weak.append(topic)
            else:
                remaining.append(topic)

        total_topics = len(topics)
        mastered_count = len(mastered)
        weak_count = len(weak)
        remaining_count = len(remaining)
        mastery_pct = round((mastered_count / total_topics) * 100, 1) if total_topics > 0 else 0.0
        doc_mastered = total_topics > 0 and mastery_pct >= 70.0 and weak_count == 0

        folder_key = str(doc.folder_id) if doc.folder_id is not None else "uncategorized"
        if folder_key not in folder_aggregate:
            folder_aggregate[folder_key] = {
                "folder_id": doc.folder_id,
                "total_docs": 0,
                "docs_with_topics": 0,
                "mastered_docs": 0,
                "weak_docs": 0,
                "mastered_topics": 0,
                "total_topics": 0,
                "avg_mastery_sum": 0.0,
            }
        agg = folder_aggregate[folder_key]
        agg["total_docs"] += 1
        agg["docs_with_topics"] += 1 if total_topics > 0 else 0
        agg["mastered_docs"] += 1 if doc_mastered else 0
        agg["weak_docs"] += 1 if weak_count > 0 else 0
        agg["mastered_topics"] += mastered_count
        agg["total_topics"] += total_topics
        agg["avg_mastery_sum"] += mastery_pct

        if total_topics > 0:
            docs_with_topics += 1
            overall_total_topics += total_topics
            overall_mastered_topics += mastered_count
            if doc_mastered:
                mastered_docs += 1

        doc_progress.append({
            "doc_id": doc.doc_id,
            "folder_id": doc.folder_id,
            "topics_total": total_topics,
            "mastered_topics_count": mastered_count,
            "weak_topics_count": weak_count,
            "remaining_topics_count": remaining_count,
            "mastery_pct": mastery_pct,
            "is_mastered": doc_mastered,
            "mastered_topics": mastered[:8],
            "weak_topics": weak[:8],
            "remaining_topics": remaining[:8],
        })

    folder_progress = []
    for value in folder_aggregate.values():
        total_docs = value["total_docs"]
        total_topics = value["total_topics"]
        mastered_topics = value["mastered_topics"]
        avg_mastery_pct = round((value["avg_mastery_sum"] / total_docs), 1) if total_docs > 0 else 0.0
        mastery_ratio_pct = round((mastered_topics / total_topics) * 100, 1) if total_topics > 0 else 0.0
        folder_progress.append({
            "folder_id": value["folder_id"],
            "total_docs": total_docs,
            "docs_with_topics": value["docs_with_topics"],
            "mastered_docs": value["mastered_docs"],
            "weak_docs": value["weak_docs"],
            "mastered_topics": mastered_topics,
            "total_topics": total_topics,
            "mastery_ratio_pct": mastery_ratio_pct,
            "avg_doc_mastery_pct": avg_mastery_pct,
        })

    overall = {
        "total_docs": len(docs),
        "docs_with_topics": docs_with_topics,
        "mastered_docs": mastered_docs,
        "mastered_docs_pct": round((mastered_docs / docs_with_topics) * 100, 1) if docs_with_topics > 0 else 0.0,
        "mastered_topics": overall_mastered_topics,
        "total_topics": overall_total_topics,
        "mastered_topics_pct": round((overall_mastered_topics / overall_total_topics) * 100, 1) if overall_total_topics > 0 else 0.0,
    }

    return {
        "overall": overall,
        "folder_progress": folder_progress,
        "doc_progress": doc_progress,
    }

def _normalize_scope(raw_scope: str) -> str:
    scope = (raw_scope or "private").strip().lower()
    if scope == "private":
        return "private"
    if scope in ("public", "community", "hs_shared"):
        return "hs_shared"
    raise HTTPException(status_code=400, detail="scope must be 'private' or 'hs_shared'")

def _get_context_folder_or_404(db: Session, user_id: int, folder_id: Optional[int]):
    if folder_id is None:
        return None
    folder = (
        db.query(models.ContextFolder)
        .filter(
            models.ContextFolder.id == folder_id,
            models.ContextFolder.user_id == user_id,
        )
        .first()
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder

def _would_create_folder_cycle(db: Session, user_id: int, folder_id: int, candidate_parent_id: Optional[int]) -> bool:
    current = candidate_parent_id
    visited = set()
    while current is not None:
        if current == folder_id:
            return True
        if current in visited:
            return True
        visited.add(current)
        parent = (
            db.query(models.ContextFolder)
            .filter(
                models.ContextFolder.id == current,
                models.ContextFolder.user_id == user_id,
            )
            .first()
        )
        if not parent:
            return False
        current = parent.parent_id
    return False

def _generate_doc_summary(doc_id: str, chunks: list[str], filename: str, subject: str, db_session_factory):
    try:
        sample = "\n\n".join(chunks[:8])[:4000]
        prompt = (
            "You are a study assistant. Analyse this excerpt from a student's document and return a JSON object "
            "with the following keys:\n"
            "  \"title\": a short descriptive title (max 10 words)\n"
            "  \"description\": a 1-2 sentence plain-English summary of what the document covers\n"
            "  \"key_concepts\": a JSON array of up to 8 key academic concepts covered\n"
            "  \"topic_tags\": a JSON array of up to 5 short topic labels (e.g. [\"Algebra\", \"Quadratic equations\"])\n\n"
            f"Document filename: {filename}\n"
            f"Subject hint: {subject or 'unknown'}\n\n"
            "Excerpt:\n"
            f"{sample}\n\n"
            "Return ONLY the JSON object, no markdown fences, no other text."
        )
        raw = call_ai(prompt, max_tokens=400, temperature=0.2)
        cleaned = (raw or "").strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()

        data = None
        candidates = [cleaned]

        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidates.append(cleaned[start : end + 1])

        for candidate in candidates:
            if not candidate:
                continue
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    data = parsed
                    break
            except Exception:
                try:
                    import ast
                    parsed = ast.literal_eval(candidate)
                    if isinstance(parsed, dict):
                        data = parsed
                        break
                except Exception:
                    continue

        if not isinstance(data, dict):
            data = {
                "title": "",
                "description": cleaned[:600],
                "key_concepts": [],
                "topic_tags": [],
            }

        ai_summary   = str(data.get("description") or data.get("title") or "")[:1000]
        key_concepts_val = data.get("key_concepts") or []
        topic_tags_val = data.get("topic_tags") or []
        if not isinstance(key_concepts_val, list):
            key_concepts_val = [str(key_concepts_val)]
        if not isinstance(topic_tags_val, list):
            topic_tags_val = [str(topic_tags_val)]

        key_concepts = json.dumps(key_concepts_val)[:2000]
        topic_tags   = json.dumps(topic_tags_val)[:500]

        db = db_session_factory()
        try:
            doc = db.query(models.ContextDocument).filter(models.ContextDocument.doc_id == doc_id).first()
            if doc:
                doc.ai_summary   = ai_summary
                doc.key_concepts = key_concepts
                doc.topic_tags   = topic_tags
                db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"AI summary generation failed for doc {doc_id}: {e}")

@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    subject: str = Form(""),
    grade_level: str = Form(""),
    scope: str = Form("private"),
    folder_id: Optional[int] = Form(None),
    source_url: str = Form(""),
    source_name: str = Form(""),
    license: str = Form(""),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    scope = _normalize_scope(scope)
    folder = _get_context_folder_or_404(db, current_user.id, folder_id)

    lower_name = (file.filename or "").lower()
    if not lower_name.endswith((".pdf", ".docx", ".txt", ".md")):
        raise HTTPException(
            status_code=400,
            detail="Only .pdf, .docx, .txt, and .md files are supported",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 50 MB.")

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="File is empty.")

    duplicate = (
        db.query(models.ContextDocument)
        .filter(
            models.ContextDocument.user_id == current_user.id,
            func.lower(models.ContextDocument.filename) == (file.filename or "").strip().lower(),
            models.ContextDocument.status.in_(("processing", "ready")),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f'"{file.filename}" is already in your library. Rename the file if this is a different version.',
        )

    doc_id = str(uuid.uuid4())
    clean_subject = context_store.canonicalize_subject(subject) if subject else ""
    clean_grade = (grade_level or "").strip()
    clean_source = (source_name or "").strip() or "User upload"
    clean_license = (license or "").strip() or "Unspecified"
    clean_chunk_size = CHUNK_SIZE
    clean_chunk_overlap = CHUNK_OVERLAP
    clean_toc_aware = True

    doc_record = models.ContextDocument(
        user_id=current_user.id,
        doc_id=doc_id,
        filename=(file.filename or "upload")[:255],
        file_type=lower_name.rsplit(".", 1)[-1],
        subject=clean_subject[:100] if clean_subject else "",
        grade_level=clean_grade[:20] if clean_grade else "",
        scope=scope,
        folder_id=folder.id if folder else None,
        source_url=source_url[:500] if source_url else "",
        source_name=clean_source[:200],
        license=clean_license[:80],
        status="processing",
        chunk_count=0,
    )
    db.add(doc_record)
    db.commit()

    try:
        storage_info = _store_context_original(
            file_bytes,
            user_id=current_user.id,
            doc_id=doc_id,
            filename=file.filename or "upload",
            content_type=file.content_type or "",
        )
        source_bytes = _read_context_original(storage_info, file_bytes)

        result = await run_in_threadpool(
            process_upload,
            file_bytes=source_bytes,
            filename=file.filename or "upload",
            subject=clean_subject,
            grade_level=clean_grade,
            scope=scope,
            source_url=source_url,
            chunk_size=clean_chunk_size,
            chunk_overlap=clean_chunk_overlap,
            toc_aware=clean_toc_aware,
        )

        if result.get("error") and not result.get("chunks"):
            doc_record.status = "failed"
            db.commit()
            raise HTTPException(status_code=422, detail=result["error"])

        if not result["chunks"]:
            doc_record.status = "failed"
            db.commit()
            raise HTTPException(
                status_code=422,
                detail="No text could be extracted from the file.",
            )

        if not context_store.available():
            doc_record.status = "failed"
            db.commit()
            raise HTTPException(
                status_code=503,
                detail="Context store unavailable. Please try again later.",
            )

        final_subject = result.get("subject", clean_subject)
        final_grade = result.get("grade_level", clean_grade)

        stored = context_store.add_document_chunks(
            user_id=str(current_user.id),
            doc_id=doc_id,
            filename=file.filename or "upload",
            chunks=result["chunks"],
            subject=final_subject,
            grade_level=final_grade,
            scope=scope,
            source_url=source_url,
            source_name=clean_source,
            license=clean_license,
            chunk_pages=result.get("chunk_pages") or None,
        )

        doc_record.chunk_count = stored
        doc_record.subject = final_subject[:100] if final_subject else ""
        doc_record.grade_level = final_grade[:20] if final_grade else ""
        doc_record.storage_path = storage_info["storage_path"]
        doc_record.storage_type = storage_info["storage_type"]
        doc_record.storage_url = storage_info["storage_url"][:1000] if storage_info["storage_url"] else ""
        doc_record.status = "ready"
        db.commit()

        from database import SessionLocal as _SL
        background_tasks.add_task(
            _generate_doc_summary,
            doc_id, result["chunks"], file.filename or "upload", final_subject, _SL
        )

        return {
            "success": True,
            "doc_id": doc_id,
            "filename": file.filename or "upload",
            "chunk_count": stored,
            "scope": scope,
            "message": f"Document processed into {stored} searchable chunks.",
            "subject": final_subject,
            "grade_level": final_grade,
            "detected_subject": result.get("detected_subject", ""),
            "detected_grade": result.get("detected_grade", ""),
            "chapters": result.get("chapters", []),
            "chunk_size": clean_chunk_size,
            "chunk_overlap": clean_chunk_overlap,
            "toc_aware": clean_toc_aware,
            "pdf_parser": result.get("pdf_parser", ""),
            "pdf_page_count": result.get("pdf_page_count", 0),
            "pdf_non_empty_pages": result.get("pdf_non_empty_pages", 0),
            "has_page_tracking": result.get("has_page_tracking", False),
            "extraction_warnings": result.get("extraction_warnings", []),
            "source_name": clean_source,
            "license": clean_license,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document upload failed for doc_id={doc_id}: {e}")
        try:
            doc_record.status = "failed"
            db.commit()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Document processing failed. Please try again.")

@router.post("/import_url")
def import_document_url(
    payload: ImportUrlRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    normalized_scope = _normalize_scope(payload.scope)

    url = (payload.url or "").strip()
    if not url or not _is_safe_url(url):
        raise HTTPException(status_code=400, detail="URL must be http(s) and not a private address")
    folder = _get_context_folder_or_404(db, current_user.id, payload.folder_id)

    clean_subject = context_store.canonicalize_subject(payload.subject) if payload.subject else ""
    clean_grade = (payload.grade_level or "").strip()
    clean_source = (payload.source_name or "").strip() or "URL import"
    clean_license = (payload.license or "").strip() or "Unspecified"
    clean_chunk_size = CHUNK_SIZE
    clean_chunk_overlap = CHUNK_OVERLAP
    clean_toc_aware = True

    file_bytes, content_type, filename_hint = _download_url(url)

    parsed = urlparse(url)
    filename = Path(parsed.path).name or filename_hint or "imported"
    lower_name = filename.lower()
    if not lower_name.endswith((".pdf", ".docx", ".txt", ".md")):
        if "pdf" in (content_type or "").lower():
            filename = f"{filename}.pdf"
        elif (content_type or "").lower().startswith("text/"):
            filename = f"{filename}.txt"
        else:
            raise HTTPException(status_code=400, detail="URL must point to a .pdf, .docx, .txt, or .md file")

    doc_id = str(uuid.uuid4())
    doc_record = models.ContextDocument(
        user_id=current_user.id,
        doc_id=doc_id,
        filename=filename[:255],
        file_type=filename.rsplit(".", 1)[-1].lower(),
        subject=clean_subject[:100] if clean_subject else "",
        grade_level=clean_grade[:20] if clean_grade else "",
        scope=normalized_scope,
        folder_id=folder.id if folder else None,
        source_url=url[:500],
        source_name=clean_source[:200],
        license=clean_license[:80],
        status="processing",
        chunk_count=0,
    )
    db.add(doc_record)
    db.commit()

    try:
        storage_info = _store_context_original(
            file_bytes,
            user_id=current_user.id,
            doc_id=doc_id,
            filename=filename,
            content_type=content_type or "",
        )
        source_bytes = _read_context_original(storage_info, file_bytes)

        result = process_upload(
            file_bytes=source_bytes,
            filename=filename,
            subject=clean_subject,
            grade_level=clean_grade,
            scope=normalized_scope,
            source_url=url,
            chunk_size=clean_chunk_size,
            chunk_overlap=clean_chunk_overlap,
            toc_aware=clean_toc_aware,
        )

        if result.get("error") and not result.get("chunks"):
            doc_record.status = "failed"
            db.commit()
            raise HTTPException(status_code=422, detail=result["error"])

        if not result["chunks"]:
            doc_record.status = "failed"
            db.commit()
            raise HTTPException(status_code=422, detail="No text could be extracted from the URL.")

        if not context_store.available():
            doc_record.status = "failed"
            db.commit()
            raise HTTPException(status_code=503, detail="Context store unavailable. Please try again later.")

        final_subject = result.get("subject", clean_subject)
        final_grade = result.get("grade_level", clean_grade)

        stored = context_store.add_document_chunks(
            user_id=str(current_user.id),
            doc_id=doc_id,
            filename=filename,
            chunks=result["chunks"],
            subject=final_subject,
            grade_level=final_grade,
            scope=normalized_scope,
            source_url=url,
            source_name=clean_source,
            license=clean_license,
            chunk_pages=result.get("chunk_pages") or None,
        )

        doc_record.chunk_count = stored
        doc_record.subject = final_subject[:100] if final_subject else ""
        doc_record.grade_level = final_grade[:20] if final_grade else ""
        doc_record.storage_path = storage_info["storage_path"]
        doc_record.storage_type = storage_info["storage_type"]
        doc_record.storage_url = storage_info["storage_url"][:1000] if storage_info["storage_url"] else ""
        doc_record.status = "ready"
        db.commit()

        return {
            "success": True,
            "doc_id": doc_id,
            "filename": filename,
            "chunk_count": stored,
            "scope": normalized_scope,
            "message": f"Document processed into {stored} searchable chunks.",
            "subject": final_subject,
            "grade_level": final_grade,
            "detected_subject": result.get("detected_subject", ""),
            "detected_grade": result.get("detected_grade", ""),
            "chapters": result.get("chapters", []),
            "chunk_size": clean_chunk_size,
            "chunk_overlap": clean_chunk_overlap,
            "toc_aware": clean_toc_aware,
            "pdf_parser": result.get("pdf_parser", ""),
            "pdf_page_count": result.get("pdf_page_count", 0),
            "pdf_non_empty_pages": result.get("pdf_non_empty_pages", 0),
            "extraction_warnings": result.get("extraction_warnings", []),
            "source_name": clean_source,
            "license": clean_license,
            "source_url": url,
            "folder_id": folder.id if folder else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"URL import failed for doc_id={doc_id}: {e}")
        try:
            doc_record.status = "failed"
            db.commit()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="URL import failed. Please try again.")

@router.get("/documents")
def list_documents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    List user's uploaded documents and the HS curriculum summary.

    Returns:
    {
        "user_docs": [
            {
                "doc_id", "filename", "subject", "grade_level",
                "scope", "chunk_count", "status", "created_at"
            }, ...
        ],
        "hs_summary": {
            "total_subjects": int,
            "subjects": [{"subject", "grade_level", "doc_count"}, ...]
        },
        "hs_mode_available": bool
    }
    """
    user_docs_db = (
        db.query(models.ContextDocument)
        .options(joinedload(models.ContextDocument.folder))
        .filter(models.ContextDocument.user_id == current_user.id)
        .order_by(models.ContextDocument.created_at.desc())
        .limit(1000)
        .all()
    )

    user_docs = [
        {
            "doc_id":       d.doc_id,
            "filename":     d.filename,
            "subject":      d.subject or "",
            "grade_level":  d.grade_level or "",
            "scope":        d.scope,
            "folder_id":    d.folder_id,
            "folder_name":  d.folder.name if getattr(d, "folder", None) else "",
            "chunk_count":  d.chunk_count,
            "status":       d.status,
            "source_url":   d.source_url or "",
            "source_name":  d.source_name or "",
            "license":      d.license or "",
            "ai_summary":   d.ai_summary or "",
            "key_concepts": _parse_json_list(d.key_concepts),
            "topic_tags":   _parse_json_list(d.topic_tags),
            "in_deck":      bool(d.in_deck),
            "deck_added_at": d.deck_added_at.isoformat() + "Z" if d.deck_added_at else "",
            "created_at":   d.created_at.isoformat() + "Z" if d.created_at else "",
        }
        for d in user_docs_db
    ]

    hs_subjects = []
    try:
        hs_subjects = context_store.list_hs_subjects()
    except Exception as e:
        logger.warning(f"list_hs_subjects failed: {e}")

    hs_total_docs = 0
    hs_last_updated = ""
    try:
        hs_total_docs, hs_last_updated_dt = (
            db.query(
                func.count(models.ContextDocument.id),
                func.max(models.ContextDocument.updated_at),
            )
            .filter(models.ContextDocument.scope == "hs_shared")
            .one()
        )
        hs_last_updated = hs_last_updated_dt.isoformat() + "Z" if hs_last_updated_dt else ""
    except Exception as e:
        logger.warning(f"hs_stats failed: {e}")

    hs_docs_db = (
        db.query(models.ContextDocument)
        .filter(
            models.ContextDocument.scope == "hs_shared",
            models.ContextDocument.status == "ready",
        )
        .order_by(models.ContextDocument.created_at.desc())
        .limit(1000)
        .all()
    )
    hs_docs = [
        {
            "doc_id":       d.doc_id,
            "filename":     d.filename,
            "subject":      d.subject or "",
            "grade_level":  d.grade_level or "",
            "scope":        d.scope,
            "chunk_count":  d.chunk_count,
            "page_count":   d.page_count if hasattr(d, "page_count") else None,
            "file_size":    d.file_size if hasattr(d, "file_size") else None,
            "status":       d.status,
            "source_name":  d.source_name or "",
            "ai_summary":   d.ai_summary or "",
            "topic_tags":   _parse_json_list(d.topic_tags),
            "key_concepts": _parse_json_list(d.key_concepts),
            "created_at":   d.created_at.isoformat() + "Z" if d.created_at else "",
        }
        for d in hs_docs_db
    ]

    return {
        "user_docs": user_docs,
        "hs_docs": hs_docs,
        "hs_summary": {
            "total_subjects": len(hs_subjects),
            "total_docs": hs_total_docs,
            "last_updated": hs_last_updated,
            "subjects": hs_subjects,
        },
        "hs_mode_available": context_store.available(),
    }

@router.get("/folders")
def list_context_folders(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    folders = (
        db.query(models.ContextFolder)
        .filter(models.ContextFolder.user_id == current_user.id)
        .order_by(models.ContextFolder.created_at.asc())
        .all()
    )
    doc_counts = dict(
        db.query(models.ContextDocument.folder_id, func.count(models.ContextDocument.id))
        .filter(models.ContextDocument.user_id == current_user.id)
        .group_by(models.ContextDocument.folder_id)
        .all()
    )
    return {
        "folders": [
            {
                "id": f.id,
                "name": f.name,
                "color": f.color,
                "parent_id": f.parent_id,
                "doc_count": doc_counts.get(f.id, 0),
                "created_at": f.created_at.isoformat() + "Z" if f.created_at else "",
                "updated_at": f.updated_at.isoformat() + "Z" if f.updated_at else "",
            }
            for f in folders
        ]
    }

@router.post("/folders")
def create_context_folder(
    payload: ContextFolderCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    if len(name) > 255:
        raise HTTPException(status_code=400, detail="Folder name is too long")
    parent = _get_context_folder_or_404(db, current_user.id, payload.parent_id)

    folder = models.ContextFolder(
        user_id=current_user.id,
        name=name[:255],
        color=(payload.color or "#D7B38C")[:50],
        parent_id=parent.id if parent else None,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {
        "id": folder.id,
        "name": folder.name,
        "color": folder.color,
        "parent_id": folder.parent_id,
        "status": "success",
    }

@router.put("/folders/{folder_id}")
def update_context_folder(
    folder_id: int,
    payload: ContextFolderUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    folder = _get_context_folder_or_404(db, current_user.id, folder_id)
    fields_set = getattr(payload, "__fields_set__", set())

    if "name" in fields_set:
        new_name = (payload.name or "").strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Folder name is required")
        if len(new_name) > 255:
            raise HTTPException(status_code=400, detail="Folder name is too long")
        folder.name = new_name[:255]

    if "color" in fields_set and payload.color is not None:
        folder.color = payload.color[:50]

    if "parent_id" in fields_set:
        if payload.parent_id == folder.id:
            raise HTTPException(status_code=400, detail="Folder cannot be its own parent")
        if payload.parent_id is not None:
            _get_context_folder_or_404(db, current_user.id, payload.parent_id)
            if _would_create_folder_cycle(db, current_user.id, folder.id, payload.parent_id):
                raise HTTPException(status_code=400, detail="Folder move would create a cycle")
        folder.parent_id = payload.parent_id

    db.commit()
    db.refresh(folder)
    return {
        "id": folder.id,
        "name": folder.name,
        "color": folder.color,
        "parent_id": folder.parent_id,
        "status": "success",
    }

@router.delete("/folders/{folder_id}")
def delete_context_folder(
    folder_id: int,
    move_to_folder_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    folder = _get_context_folder_or_404(db, current_user.id, folder_id)
    if move_to_folder_id == folder.id:
        raise HTTPException(status_code=400, detail="Cannot move contents into the same folder")

    target = _get_context_folder_or_404(db, current_user.id, move_to_folder_id)
    target_id = target.id if target else None
    if target_id is not None and _would_create_folder_cycle(db, current_user.id, folder.id, target_id):
        raise HTTPException(status_code=400, detail="Cannot move folder contents into a nested child folder")

    db.query(models.ContextDocument).filter(
        models.ContextDocument.user_id == current_user.id,
        models.ContextDocument.folder_id == folder.id,
    ).update({"folder_id": target_id})

    db.query(models.ContextFolder).filter(
        models.ContextFolder.user_id == current_user.id,
        models.ContextFolder.parent_id == folder.id,
    ).update({"parent_id": target_id})

    db.delete(folder)
    db.commit()
    return {"status": "success", "deleted_folder_id": folder_id, "moved_to_folder_id": target_id}

@router.put("/documents/{doc_id}/folder")
def move_document_to_folder(
    doc_id: str,
    payload: ContextDocumentFolderUpdateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = (
        db.query(models.ContextDocument)
        .filter(
            models.ContextDocument.doc_id == doc_id,
            models.ContextDocument.user_id == current_user.id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    target_folder = _get_context_folder_or_404(db, current_user.id, payload.folder_id)
    doc.folder_id = target_folder.id if target_folder else None
    db.commit()
    return {"status": "success", "doc_id": doc_id, "folder_id": doc.folder_id}

@router.get("/progress")
def get_context_progress(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return _build_doc_progress_payload(db, current_user.id)

@router.delete("/documents/{doc_id}")
def delete_document(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = (
        db.query(models.ContextDocument)
        .filter(models.ContextDocument.doc_id == doc_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    is_admin = (
        getattr(current_user, "is_admin", False)
        or getattr(current_user, "role", "") == "admin"
    )

    if doc.user_id != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="You can only delete your own documents")

    try:
        context_store.delete_document(
            user_id=str(doc.user_id),
            doc_id=doc_id,
            is_admin=is_admin,
        )
    except Exception as e:
        logger.error("Context vector cleanup failed for doc %s: %s", doc_id, e, exc_info=True)
        raise HTTPException(status_code=502, detail="Document could not be fully deleted. Try again.")

    if doc.storage_path:
        try:
            StorageService.get_storage().delete_file(_storage_key_from_uri(doc.storage_path))
        except Exception as e:
            logger.error("Context file cleanup failed for doc %s: %s", doc_id, e, exc_info=True)
            raise HTTPException(status_code=502, detail="Document could not be fully deleted. Try again.")

    db.delete(doc)
    db.commit()

    return {"success": True, "doc_id": doc_id}

def _get_own_doc_or_404(db: Session, user_id: int, doc_id: str) -> models.ContextDocument:
    doc = (
        db.query(models.ContextDocument)
        .filter(
            models.ContextDocument.doc_id == doc_id,
            models.ContextDocument.user_id == user_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

def _serialize_deck_doc(d: models.ContextDocument) -> dict:
    return {
        "doc_id":        d.doc_id,
        "filename":      d.filename,
        "subject":       d.subject or "",
        "grade_level":   d.grade_level or "",
        "scope":         d.scope,
        "chunk_count":   d.chunk_count,
        "status":        d.status,
        "ai_summary":    d.ai_summary or "",
        "key_concepts":  _parse_json_list(d.key_concepts),
        "topic_tags":    _parse_json_list(d.topic_tags),
        "in_deck":       bool(d.in_deck),
        "deck_added_at": d.deck_added_at.isoformat() + "Z" if d.deck_added_at else "",
        "created_at":    d.created_at.isoformat() + "Z" if d.created_at else "",
    }

@router.post("/documents/{doc_id}/deck")
def add_document_to_deck(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = _get_own_doc_or_404(db, current_user.id, doc_id)

    if not doc.in_deck:
        deck_count = (
            db.query(func.count(models.ContextDocument.id))
            .filter(
                models.ContextDocument.user_id == current_user.id,
                models.ContextDocument.in_deck == True,  # noqa: E712
            )
            .scalar()
        )
        if deck_count >= DECK_LIMIT:
            raise HTTPException(
                status_code=409,
                detail=f"Your deck is full ({DECK_LIMIT}/{DECK_LIMIT}) — remove a document first.",
            )
        doc.in_deck = True
        doc.deck_added_at = datetime.now(timezone.utc)
        db.commit()

    deck_count = (
        db.query(func.count(models.ContextDocument.id))
        .filter(
            models.ContextDocument.user_id == current_user.id,
            models.ContextDocument.in_deck == True,  # noqa: E712
        )
        .scalar()
    )
    return {"doc_id": doc_id, "in_deck": True, "deck_count": deck_count, "deck_limit": DECK_LIMIT}

@router.delete("/documents/{doc_id}/deck")
def remove_document_from_deck(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = _get_own_doc_or_404(db, current_user.id, doc_id)

    doc.in_deck = False
    doc.deck_added_at = None
    db.commit()

    deck_count = (
        db.query(func.count(models.ContextDocument.id))
        .filter(
            models.ContextDocument.user_id == current_user.id,
            models.ContextDocument.in_deck == True,  # noqa: E712
        )
        .scalar()
    )
    return {"doc_id": doc_id, "in_deck": False, "deck_count": deck_count, "deck_limit": DECK_LIMIT}

@router.get("/deck")
def get_deck(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    docs = (
        db.query(models.ContextDocument)
        .filter(
            models.ContextDocument.user_id == current_user.id,
            models.ContextDocument.in_deck == True,  # noqa: E712
        )
        .order_by(models.ContextDocument.deck_added_at.desc())
        .all()
    )
    return {
        "documents": [_serialize_deck_doc(d) for d in docs],
        "deck_count": len(docs),
        "deck_limit": DECK_LIMIT,
    }

@router.get("/search")
def search_context_endpoint(
    query: str = Query(..., min_length=2, description="Search query"),
    use_hs: bool = Query(True, description="Include shared HS curriculum in results"),
    subject: str = Query("", description="Optional HS subject filter (e.g., Biology)"),
    grade_level: str = Query("", description="Optional grade level filter (e.g., 9-12, AP)"),
    top_k: int = Query(5, ge=1, le=20, description="Number of results to return"),
    doc_ids: Optional[str] = Query(None, description="Comma-separated doc_ids to restrict results to"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        parsed_doc_ids = doc_ids.split(",") if doc_ids else None
        results = context_store.search_context(
            query=query,
            user_id=str(current_user.id),
            use_hs=use_hs,
            top_k=top_k,
            subject=subject or None,
            grade_level=grade_level or None,
            doc_ids=parsed_doc_ids,
        )
        cleaned = [
            {"text": r["text"], "metadata": r["metadata"], "source": r["source"]}
            for r in results
        ]
        return {"query": query, "results": cleaned, "chunk_count": len(cleaned)}
    except Exception as e:
        logger.error(f"context search endpoint failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/related-topics")
def related_topics_endpoint(
    payload: RelatedTopicsRequest,
    current_user: models.User = Depends(get_current_user),
):
    topics = [t.strip() for t in (payload.topics or []) if t and t.strip()]
    if not topics:
        return {"topics": [], "seed_topics": [], "source_counts": {}}
    if not context_store.available():
        return {"topics": [], "seed_topics": topics, "source_counts": {}}

    topics = topics[:6]
    top_k = max(1, min(payload.top_k or 5, 10))
    max_related = max(1, min(payload.max_related or 8, 12))

    results = []
    seen = set()
    for topic in topics:
        try:
            search_results = context_store.search_context(
                query=topic,
                user_id=str(current_user.id),
                use_hs=payload.use_hs,
                top_k=top_k,
            )
        except Exception as e:
            logger.warning(f"related-topics context search failed: {e}")
            search_results = []

        for res in search_results:
            meta = res.get("metadata") or {}
            key = f"{meta.get('doc_id', '')}:{meta.get('chunk_index', '')}:{res.get('source', '')}"
            if key in seen:
                continue
            seen.add(key)
            results.append(res)

    candidate_counts: dict[str, int] = {}
    candidate_sources: dict[str, set[str]] = {}
    snippets: list[str] = []
    for res in results:
        topic = _extract_topic_from_result(res)
        if topic:
            key = topic.lower()
            candidate_counts[key] = candidate_counts.get(key, 0) + 1
            candidate_sources.setdefault(key, set()).add(res.get("source", ""))

        text = (res.get("text") or "").strip()
        if text and len(snippets) < 12:
            cleaned = re.sub(r"\s+", " ", text).strip()
            if cleaned:
                snippets.append(cleaned[:240])

    seed_set = {t.lower() for t in topics}
    sorted_candidates = sorted(candidate_counts.items(), key=lambda item: item[1], reverse=True)
    candidate_list = [f"{topic} ({count})" for topic, count in sorted_candidates[:20]]
    candidate_str = ", ".join(candidate_list) if candidate_list else "none"

    prompt = (
        "You are a study assistant. Return related study topics based on the user's context.\n"
        "Output must be valid JSON: {\"topics\": [\"Topic 1\", \"Topic 2\", ...]}.\n"
        "Rules:\n"
        "- 2-4 words per topic\n"
        "- Avoid repeating seed topics\n"
        "- Prefer concrete academic topics, not generic actions\n\n"
        f"Seed topics: {', '.join(topics)}\n"
        f"Candidate topics from context: {candidate_str}\n"
        "Context snippets:\n"
        + "\n".join([f"- {s}" for s in snippets[:10]])
    )

    ai_topics = []
    try:
        raw = call_ai(prompt, max_tokens=200, temperature=0.3)
        ai_topics = _parse_ai_topics(raw)
    except Exception as e:
        logger.warning(f"related-topics AI call failed: {e}")

    cleaned_ai = []
    seen_ai = set()
    for topic in ai_topics:
        cleaned = _clean_topic_text(topic)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seed_set or key in seen_ai:
            continue
        seen_ai.add(key)
        cleaned_ai.append(_title_case_topic(cleaned))
        if len(cleaned_ai) >= max_related:
            break

    if not cleaned_ai:
        for topic, _ in sorted_candidates:
            if topic in seed_set:
                continue
            cleaned_ai.append(_title_case_topic(topic))
            if len(cleaned_ai) >= max_related:
                break

    source_counts = {}
    for sources in candidate_sources.values():
        for src in sources:
            source_counts[src] = source_counts.get(src, 0) + 1

    return {
        "topics": cleaned_ai,
        "seed_topics": topics,
        "source_counts": source_counts,
    }

@router.get("/hs/subjects")
def get_hs_subjects(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        subjects = context_store.list_hs_subjects()
        return {"subjects": subjects, "total": len(subjects)}
    except Exception as e:
        logger.warning(f"get_hs_subjects failed: {e}")
        return {"subjects": [], "total": 0}

@router.get("/hs/stats")
def get_hs_stats(
    current_user: models.User = Depends(get_current_user),
):
    try:
        stats = context_store.get_hs_stats()
        return stats
    except Exception as e:
        logger.warning(f"get_hs_stats failed: {e}")
        return {}

@router.post("/ask")
def ask_knowledge_base(
    payload: AskRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question must not be empty")
    if len(question) > 1000:
        raise HTTPException(status_code=400, detail="Question too long (max 1000 chars)")

    if not context_store.available():
        raise HTTPException(status_code=503, detail="Knowledge base unavailable. Please try again later.")

    top_k = max(1, min(payload.top_k or 6, 12))
    selected_doc_ids = [d.strip() for d in (payload.doc_ids or []) if isinstance(d, str) and d.strip()]
    if selected_doc_ids:
        selected_doc_ids = selected_doc_ids[:200]

    try:
        results = context_store.search_context(
            query=question,
            user_id=str(current_user.id),
            use_hs=payload.use_hs,
            top_k=top_k,
            doc_ids=selected_doc_ids or None,
        )
    except Exception as e:
        logger.error(f"context/ask search failed: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

    if not results:
        return {
            "answer": "I couldn't find any relevant information in your knowledge base for that question. Try uploading more documents or rephrasing your question.",
            "sources": [],
            "chunk_count": 0,
        }

    excerpts_text = ""
    sources = []
    for i, r in enumerate(results, start=1):
        meta = r.get("metadata") or {}
        filename = meta.get("filename", "Unknown")
        page     = meta.get("page_number") or meta.get("page_start") or ""
        subject  = meta.get("subject", "")
        src_label = r.get("source", "private")
        snippet  = (r.get("text") or "").strip()[:600]

        page_str = f", p.{page}" if page else ""
        src_str  = "Community Curriculum" if src_label == "hs" else "Your Notes"
        excerpts_text += f"[{i}] {filename}{page_str} ({src_str})\n{snippet}\n\n"

        sources.append({
            "filename": filename,
            "page":     page,
            "subject":  subject,
            "source":   src_label,
            "doc_id":   meta.get("doc_id", ""),
            "snippet":  snippet[:300],
        })

    prompt = (
        "You are a study assistant helping a student understand their own uploaded notes and documents.\n"
        "Answer the student's question using ONLY the excerpts provided below. "
        "Cite sources inline as [1], [2], etc. when you use information from them.\n"
        "Be thorough but concise. If the excerpts don't contain enough information to answer fully, say so clearly.\n\n"
        f"Student's question: {question}\n\n"
        "Relevant excerpts from their knowledge base:\n"
        f"{excerpts_text}"
        "Your answer:"
    )

    try:
        answer = call_ai(prompt, max_tokens=1000, temperature=0.3)
    except Exception as e:
        logger.error(f"context/ask AI call failed: {e}")
        raise HTTPException(status_code=502, detail="AI answer generation failed")

    return {
        "answer": answer.strip(),
        "sources": sources,
        "chunk_count": len(results),
    }
