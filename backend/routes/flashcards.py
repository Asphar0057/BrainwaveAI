import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

import models
from deps import call_ai, enforce_request_user_scope, get_current_user, get_db, get_user_by_email, get_user_by_username, unified_ai
from services.ai_json_parser import parse_json_array_response
from uid_utils import resolve_by_id_or_uid

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api",
    tags=["flashcards"],
    dependencies=[Depends(enforce_request_user_scope)],
)

class FlashcardReviewRequest(BaseModel):
    user_id: str
    card_id: str
    was_correct: bool
    mode: str = "preview"

class FlashcardSetCreateRequest(BaseModel):
    user_id: str
    title: str = "New Flashcard Set"
    description: str = ""
    is_public: bool = False

class FlashcardCreateRequest(BaseModel):
    set_id: int
    question: str
    answer: str
    difficulty: Optional[str] = "medium"

@router.get("/get_flashcards")
def get_flashcards(
    user_id: str = Query(...),
    limit: Optional[int] = Query(None, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    query = (
        db.query(models.Flashcard, models.FlashcardSet)
        .join(models.FlashcardSet, models.Flashcard.set_id == models.FlashcardSet.id)
        .filter(models.FlashcardSet.user_id == user.id)
        .order_by(models.FlashcardSet.created_at.desc(), models.Flashcard.created_at.desc())
    )
    if offset:
        query = query.offset(offset)
    if limit:
        query = query.limit(limit)

    result = []
    for card, fs in query.all():
        result.append({
            "id": card.id,
            "set_id": fs.id,
            "set_title": fs.title,
            "question": card.question,
            "answer": card.answer,
            "difficulty": card.difficulty,
            "created_at": (card.created_at or fs.created_at).isoformat() + "Z",
        })
    return result

@router.get("/get_flashcards_in_set")
def get_flashcards_in_set(set_id: str = Query(...), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    fs = resolve_by_id_or_uid(db.query(models.FlashcardSet), models.FlashcardSet, set_id).first()
    if not fs:
        raise HTTPException(status_code=404, detail="Flashcard set not found")
    if fs.user_id != current_user.id and not getattr(fs, "is_public", False):
        raise HTTPException(status_code=403, detail="Access denied")

    if fs.user_id == current_user.id and not getattr(fs, "public_token", None):
        token = secrets.token_urlsafe(12)
        while db.query(models.FlashcardSet).filter(models.FlashcardSet.public_token == token).first():
            token = secrets.token_urlsafe(12)
        fs.public_token = token
        db.commit()

    cards = db.query(models.Flashcard).filter(models.Flashcard.set_id == fs.id).all()

    return {
        "set_id": fs.id,
        "uid": getattr(fs, "public_token", None),
        "set_title": fs.title,
        "share_code": getattr(fs, "share_code", None),
        "public_token": getattr(fs, "public_token", None),
        "description": fs.description or "",
        "flashcards": [
            {
                "id": c.id,
                "question": c.question,
                "answer": c.answer,
                "difficulty": c.difficulty or "medium",
                "times_reviewed": c.times_reviewed or 0,
                "correct_count": c.correct_count or 0,
                "marked_for_review": bool(getattr(c, "marked_for_review", False)),
                "is_edited": bool(getattr(c, "is_edited", False)),
            }
            for c in cards
        ],
    }

@router.get("/get_flashcard_history")
def get_flashcard_history(
    user_id: str = Query(...),
    limit: int = Query(20),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    total_count = db.query(func.count(models.FlashcardSet.id)).filter(
        models.FlashcardSet.user_id == user.id
    ).scalar() or 0

    card_counts = (
        db.query(
            models.Flashcard.set_id.label("set_id"),
            func.count(models.Flashcard.id).label("card_count"),
            func.sum(
                case(
                    (models.Flashcard.correct_count > 0, case((models.Flashcard.marked_for_review == True, 5), else_=10)),
                    else_=0,
                )
            ).label("mastery_sum"),
        )
        .group_by(models.Flashcard.set_id)
        .subquery()
    )

    sets = (
        db.query(
            models.FlashcardSet,
            func.coalesce(card_counts.c.card_count, 0).label("card_count"),
            func.coalesce(card_counts.c.mastery_sum, 0).label("mastery_sum"),
        )
        .outerjoin(card_counts, card_counts.c.set_id == models.FlashcardSet.id)
        .filter(models.FlashcardSet.user_id == user.id)
        .order_by(models.FlashcardSet.created_at.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    result = []
    for fs, total_cards, mastery_sum in sets:
        mastery = min(int(mastery_sum or 0), 100)

        result.append({
            "id": fs.id,
            "share_code": getattr(fs, "share_code", None),
            "uid": getattr(fs, "public_token", None),
            "title": fs.title,
            "description": fs.description or "",
            "card_count": total_cards,
            "accuracy_percentage": round(mastery, 1),
            "source_type": fs.source_type or "manual",
            "is_public": getattr(fs, "is_public", False),
            "created_at": fs.created_at.isoformat() + "Z" if fs.created_at else None,
            "updated_at": fs.updated_at.isoformat() + "Z" if fs.updated_at else None,
        })

    return {
        "flashcard_history": result,
        "total_count": total_count,
        "has_more": (offset + len(result)) < total_count,
        "offset": offset,
        "limit": limit,
    }

@router.post("/flashcards/sets/create")
def create_flashcard_set(
    payload: FlashcardSetCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = get_user_by_username(db, payload.user_id) or get_user_by_email(db, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    flashcard_set = models.FlashcardSet(
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        is_public=payload.is_public,
        source_type="media",
    )
    db.add(flashcard_set)
    db.commit()
    db.refresh(flashcard_set)

    return {
        "success": True,
        "set_id": flashcard_set.id,
        "uid": flashcard_set.public_token,
        "title": flashcard_set.title,
    }

@router.post("/flashcards/cards/create")
def create_flashcard_card(
    payload: FlashcardCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    flashcard_set = db.query(models.FlashcardSet).filter(
        models.FlashcardSet.id == payload.set_id,
        models.FlashcardSet.user_id == current_user.id,
    ).first()
    if not flashcard_set:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    flashcard = models.Flashcard(
        set_id=flashcard_set.id,
        question=payload.question,
        answer=payload.answer,
        difficulty=payload.difficulty or "medium",
    )
    db.add(flashcard)
    db.commit()
    db.refresh(flashcard)

    return {
        "success": True,
        "card_id": flashcard.id,
    }

@router.delete("/flashcards/sets/{set_id}")
def delete_flashcard_set(
    set_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    flashcard_set = resolve_by_id_or_uid(
        db.query(models.FlashcardSet).filter(models.FlashcardSet.user_id == current_user.id),
        models.FlashcardSet,
        set_id,
    ).first()

    if not flashcard_set:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    set_pk = flashcard_set.id
    try:
        db.query(models.FlashcardStudySession).filter(
            models.FlashcardStudySession.set_id == set_pk
        ).delete(synchronize_session=False)
        db.query(models.Flashcard).filter(
            models.Flashcard.set_id == set_pk
        ).delete(synchronize_session=False)
        db.delete(flashcard_set)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting flashcard set {set_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete flashcard set")

    return {
        "success": True,
        "message": "Flashcard set deleted",
    }

@router.get("/get_flashcard_statistics")
def get_flashcard_statistics(user_id: str = Query(...), db: Session = Depends(get_db)):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        return {"total_sets": 0, "total_cards": 0, "cards_mastered": 0, "average_accuracy": 0}

    total_sets = db.query(func.count(models.FlashcardSet.id)).filter(
        models.FlashcardSet.user_id == user.id
    ).scalar() or 0

    total_cards = (
        db.query(func.count(models.Flashcard.id))
        .join(models.FlashcardSet)
        .filter(models.FlashcardSet.user_id == user.id)
        .scalar() or 0
    )

    cards_mastered = (
        db.query(func.count(models.Flashcard.id))
        .join(models.FlashcardSet)
        .filter(models.FlashcardSet.user_id == user.id, models.Flashcard.correct_count >= 3)
        .scalar() or 0
    )

    cards = (
        db.query(models.Flashcard)
        .join(models.FlashcardSet)
        .filter(models.FlashcardSet.user_id == user.id)
        .all()
    )
    total_reviews = sum(c.times_reviewed or 0 for c in cards)
    total_correct = sum(c.correct_count or 0 for c in cards)
    avg = (total_correct / total_reviews * 100) if total_reviews > 0 else 0

    return {
        "total_sets": total_sets,
        "total_cards": total_cards,
        "cards_mastered": cards_mastered,
        "average_accuracy": round(avg, 1),
    }

@router.get("/get_flashcards_for_review")
@router.post("/get_flashcards_for_review")
def get_flashcards_for_review(user_id: str = Query(None), db: Session = Depends(get_db)):
    if not user_id:
        return {"total_cards": 0, "sets": []}

    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        return {"total_cards": 0, "sets": []}

    cards = (
        db.query(models.Flashcard)
        .join(models.FlashcardSet)
        .filter(models.FlashcardSet.user_id == user.id, models.Flashcard.marked_for_review == True)
        .all()
    )

    sets_dict = {}
    for card in cards:
        if card.set_id not in sets_dict:
            fs = db.query(models.FlashcardSet).filter(models.FlashcardSet.id == card.set_id).first()
            sets_dict[card.set_id] = {
                "set_id": card.set_id,
                "set_title": fs.title if fs else "Unknown",
                "cards": [],
            }
        sets_dict[card.set_id]["cards"].append({
            "id": card.id,
            "question": card.question,
            "answer": card.answer,
            "difficulty": card.difficulty or "medium",
            "times_reviewed": card.times_reviewed or 0,
            "correct_count": card.correct_count or 0,
        })

    return {"total_cards": len(cards), "sets": list(sets_dict.values())}

def _unwrap_form_value(value):
    if value is None:
        return None
    if value.__class__.__name__ == "Form" and hasattr(value, "default"):
        return value.default
    return value

def _coerce_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes", "y", "on")
    return default

def _collect_context_doc_chunks_for_prompt(user_id: int, doc_ids: list[str], max_chars: int = 16000) -> str:
    if not doc_ids:
        return ""
    try:
        from services import context_store
        rows = context_store.get_document_chunks(
            user_id=str(user_id),
            doc_ids=doc_ids,
            max_chunks_per_doc=12,
            max_chars_per_chunk=1800,
        )
    except Exception as e:
        logger.warning(f"Flashcard context chunk collection failed: {e}")
        rows = []
    if not rows:
        return ""

    blocks: list[str] = []
    used = 0
    for row in rows:
        meta = row.get("metadata") or {}
        label = meta.get("filename") or meta.get("doc_id") or "context document"
        chunk_index = meta.get("chunk_index", "")
        text = (row.get("text") or "").strip()
        if not text:
            continue
        block = f"[{label} chunk {chunk_index}]\n{text}"
        if used + len(block) > max_chars:
            remaining = max_chars - used
            if remaining > 800:
                blocks.append(block[:remaining])
            break
        blocks.append(block)
        used += len(block)
    return "\n\n".join(blocks).strip()

def _clean_flashcard_text(value: object, limit: int = 420) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) > limit:
        return text[: limit - 3].rstrip() + "..."
    return text

def _build_local_flashcards(topic: str, content: str, card_count: int, difficulty: str) -> list[dict]:
    """Last-resort cards so temporary AI/parser failures do not break the workflow."""
    subject = _clean_flashcard_text(topic, 90) or "this topic"
    source = _clean_flashcard_text(content, 4000)
    raw_sentences = re.split(r"(?<=[.!?])\s+", source) if source else []
    sentences = [
        _clean_flashcard_text(s, 280)
        for s in raw_sentences
        if len(s.strip()) >= 35
    ][: max(card_count, 3)]

    cards: list[dict] = []
    if sentences:
        cards.append({
            "question": f"What is the main idea in {subject}?",
            "answer": sentences[0],
            "difficulty": difficulty,
            "wrong_options": [
                f"{subject} is unrelated to the selected material.",
                f"{subject} only involves memorizing isolated facts.",
                f"{subject} cannot be summarized from the source."
            ],
        })
        for idx, sentence in enumerate(sentences[1:card_count], start=2):
            cards.append({
                "question": f"What key point does the source make about {subject}? ({idx})",
                "answer": sentence,
                "difficulty": difficulty,
                "wrong_options": [
                    "The source states the opposite of this point.",
                    "The source does not mention this concept at all.",
                    "This point is only a minor formatting detail."
                ],
            })
    else:
        templates = [
            (
                f"What is {subject}?",
                f"{subject} is the study focus for this flashcard set. Review its core definition, purpose, and the situations where it applies."
            ),
            (
                f"Why is {subject} important?",
                f"{subject} matters because it connects key ideas and helps explain how the topic works in practice."
            ),
            (
                f"What should you remember first about {subject}?",
                f"Start with the main definition, then learn the supporting examples, common mistakes, and how the idea is used."
            ),
            (
                f"How can you review {subject} effectively?",
                f"Break {subject} into smaller concepts, test yourself with recall questions, and revisit the weakest points after a short delay."
            ),
        ]
        for question, answer in templates[:card_count]:
            cards.append({
                "question": question,
                "answer": answer,
                "difficulty": difficulty,
                "wrong_options": [
                    "Ignore the definition and memorize random examples.",
                    "Review it once without testing recall.",
                    "Focus only on unrelated background details."
                ],
            })

    return cards[: max(1, card_count)]

@router.post("/generate_flashcards")
async def generate_flashcards_endpoint(
    user_id: str = Form(...),
    topic: str = Form(None),
    generation_type: str = Form("topic"),
    chat_data: str = Form(None),
    content: str = Form(None),
    document_ids: str = Form(None),
    card_count: int = Form(10),
    difficulty: str = Form("medium"),
    depth_level: str = Form("standard"),
    additional_specs: str = Form(""),
    use_hs_context: bool = Form(True),
    context_doc_ids: Optional[str] = Form(None),
    set_title: str = Form(None),
    is_public: bool = Form(False),
    db: Session = Depends(get_db),
):
    user_id = _unwrap_form_value(user_id)
    topic = _unwrap_form_value(topic)
    generation_type = _unwrap_form_value(generation_type) or "topic"
    chat_data = _unwrap_form_value(chat_data)
    content = _unwrap_form_value(content)
    document_ids = _unwrap_form_value(document_ids)
    card_count = _unwrap_form_value(card_count) or 10
    difficulty = _unwrap_form_value(difficulty) or "medium"
    depth_level = _unwrap_form_value(depth_level) or "standard"
    additional_specs = _unwrap_form_value(additional_specs) or ""
    context_doc_ids = _unwrap_form_value(context_doc_ids)
    set_title = _unwrap_form_value(set_title)
    is_public = _coerce_bool(_unwrap_form_value(is_public), default=False)
    try:
        card_count = int(card_count)
    except (TypeError, ValueError):
        card_count = 10
    if set_title is not None and not isinstance(set_title, str):
        set_title = None

    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    hs_flag = bool(_coerce_bool(_unwrap_form_value(use_hs_context), default=True))
    doc_ids_list = [x.strip() for x in context_doc_ids.split(",") if x.strip()] if context_doc_ids else []
    source_document_names = []
    context_prompt_content = ""

    if generation_type == "document_sources":
        if not document_ids:
            raise HTTPException(status_code=400, detail="Provide document_ids")

        try:
            source_document_ids = [
                int(x.strip())
                for x in str(document_ids).split(",")
                if x.strip()
            ]
        except ValueError:
            raise HTTPException(status_code=400, detail="document_ids must be comma-separated integers")

        if not source_document_ids:
            raise HTTPException(status_code=400, detail="Select at least one document")

        documents = (
            db.query(models.UploadedDocument)
            .filter(
                models.UploadedDocument.user_id == user.id,
                models.UploadedDocument.id.in_(source_document_ids),
            )
            .all()
        )
        found_ids = {doc.id for doc in documents}
        missing_ids = [doc_id for doc_id in source_document_ids if doc_id not in found_ids]
        if missing_ids:
            raise HTTPException(status_code=404, detail=f"Document(s) not found: {missing_ids}")

        docs_by_id = {doc.id: doc for doc in documents}
        ordered_documents = [docs_by_id[doc_id] for doc_id in source_document_ids]
        source_document_names = [doc.filename for doc in ordered_documents]
        content = "\n\n---\n\n".join(
            f"Source: {doc.filename}\nDocument type: {doc.document_type or 'unknown'}\n\n{doc.content or ''}"
            for doc in ordered_documents
        )
        topic = topic or ", ".join(source_document_names[:3])
        set_title = set_title or (
            f"Flashcards from {source_document_names[0]}"
            if len(source_document_names) == 1
            else f"Flashcards from {len(source_document_names)} PDFs"
        )
        source_note = (
            "Generate flashcards strictly from the selected uploaded PDF source material. "
            "Prioritize key concepts, definitions, cause-effect relationships, formulas, and exam-relevant details."
        )
        additional_specs = f"{source_note}\n\n{additional_specs}".strip()

    logger.info(
        f"[FLASHCARD ROUTE] generate request | topic='{topic}' user={user.id} "
        f"HS_MODE={'ON  <-- curriculum RAG will run' if hs_flag else 'OFF <-- no RAG, model-only'}"
    )

    chat_content = ""
    graph_generation_type = generation_type
    if generation_type in {"chat_history", "document_sources"}:
        if content:
            chat_content = content
        elif chat_data:
            try:
                chat_history = json.loads(chat_data)
                chat_content = "\n".join(
                    [f"Q: {m.get('question', '')}\nA: {m.get('answer', '')}" for m in chat_history[:10]]
                )
            except Exception:
                chat_content = chat_data
        if not chat_content:
            raise HTTPException(status_code=400, detail="Provide content, chat_data, or document_ids")
        graph_generation_type = "chat_history"
    elif generation_type == "topic" and not topic:
        raise HTTPException(status_code=400, detail="Provide topic")

    if doc_ids_list:
        context_prompt_content = _collect_context_doc_chunks_for_prompt(user.id, doc_ids_list)

    from graphs.flashcard_graph import get_flashcard_graph

    graph = get_flashcard_graph()
    flashcards_data = []
    if graph:
        try:
            flashcards_data = await graph.invoke(
                user_id=str(user.id),
                topic=topic or "",
                content=chat_content,
                generation_type=graph_generation_type,
                card_count=card_count,
                difficulty=difficulty,
                depth_level=depth_level,
                additional_specs=additional_specs,
                use_hs_context=hs_flag,
                context_doc_ids=doc_ids_list,
            )
        except Exception as e:
            logger.exception(f"Flashcard graph invocation failed; falling back to direct generation: {e}")

    if not flashcards_data:
        source_content = chat_content or context_prompt_content
        prompt = (
            f"Generate {card_count} flashcards about: {topic or chat_content[:500]}\n"
            f"{'Use this source content from the selected context file chunks: ' + source_content[:12000] if source_content else ''}\n"
            f"Difficulty: {difficulty}\n\n"
            f"Return ONLY a valid JSON array. Each object: "
            f'{{"question": "...", "answer": "...", "difficulty": "{difficulty}", '
            f'"wrong_options": ["wrong1", "wrong2", "wrong3"]}}\n'
            f"No other text."
        )
        try:
            ai_response = unified_ai.generate(prompt, max_tokens=3000, temperature=0.7)
            flashcards_data = parse_json_array_response(ai_response)
        except Exception as e:
            logger.exception(f"Direct flashcard generation failed; using local fallback: {e}")

    if not flashcards_data:
        flashcards_data = _build_local_flashcards(topic or "", chat_content or context_prompt_content or content or "", card_count, difficulty)

    if not flashcards_data:
        raise HTTPException(status_code=500, detail="Failed to generate flashcards")

    normalized_flashcards = []
    for idx, card_data in enumerate(flashcards_data[:card_count], start=1):
        if not isinstance(card_data, dict):
            continue
        question = _clean_flashcard_text(card_data.get("question") or card_data.get("front") or card_data.get("term"))
        answer = _clean_flashcard_text(card_data.get("answer") or card_data.get("back") or card_data.get("definition"), 700)
        if not question and answer:
            question = f"What should you remember about {topic or 'this topic'}? ({idx})"
        if not answer and question:
            answer = "Review the related source material and summarize the key idea in your own words."
        if not question or not answer:
            continue
        wrong_options = card_data.get("wrong_options") or card_data.get("options") or []
        if not isinstance(wrong_options, list):
            wrong_options = []
        wrong_options = [
            _clean_flashcard_text(option, 400)
            for option in wrong_options
            if _clean_flashcard_text(option, 400) and _clean_flashcard_text(option, 400) != answer
        ][:3]
        while len(wrong_options) < 3:
            wrong_options.append([
                "This is not supported by the source material.",
                "This reverses the main idea.",
                "This focuses on an unrelated detail.",
            ][len(wrong_options)])
        normalized_flashcards.append({
            "question": question,
            "answer": answer,
            "difficulty": card_data.get("difficulty") or difficulty,
            "wrong_options": wrong_options,
        })

    flashcards_data = normalized_flashcards or _build_local_flashcards(topic or "", chat_content or content or "", card_count, difficulty)

    try:
        from services.math_processor import process_math_in_response
        for card_data in flashcards_data:
            if card_data.get("question"):
                card_data["question"] = process_math_in_response(card_data["question"])
            if card_data.get("answer"):
                card_data["answer"] = process_math_in_response(card_data["answer"])
    except Exception:
        pass

    title = set_title or (f"Flashcards: {topic[:30]}" if topic else "Generated Flashcards")
    new_set = models.FlashcardSet(
        user_id=user.id,
        title=title,
        description=(
            f"Generated from {', '.join(source_document_names)}"
            if source_document_names
            else f"Generated from {generation_type}"
        ),
        source_type=generation_type,
        is_public=is_public,
    )
    db.add(new_set)
    db.commit()
    db.refresh(new_set)

    saved_cards = []
    for card_data in flashcards_data:
        card = models.Flashcard(
            set_id=new_set.id,
            question=card_data.get("question", ""),
            answer=card_data.get("answer", ""),
            difficulty=card_data.get("difficulty", difficulty),
        )
        db.add(card)
        db.commit()
        db.refresh(card)
        saved_cards.append({
            **card_data,
            "id": card.id,
        })

    try:
        from services.gamification_system import award_points
        award_points(db, user.id, "flashcard_created")
    except Exception:
        pass

    db.commit()

    try:
        from tutor import chroma_store
        if chroma_store.available():
            card_topics = [c.get("question", "")[:50] for c in saved_cards[:5]]
            summary = (
                f"Flashcard set created: \"{title}\" with {len(saved_cards)} cards "
                f"on topic \"{topic or 'chat history'}\". "
                f"Difficulty: {difficulty}. "
                f"Sample questions: {'; '.join(card_topics)}"
            )
            chroma_store.write_episode(
                user_id=str(user.id),
                summary=summary,
                metadata={
                    "source": "flashcard_created",
                    "set_id": str(new_set.id),
                    "set_title": title,
                    "topic": topic or "",
                    "card_count": str(len(saved_cards)),
                    "difficulty": difficulty,
                },
            )
    except Exception as e:
        logger.warning(f"Chroma write failed on flashcard creation: {e}")

    return {
        "success": True,
        "status": "success",
        "set_id": new_set.id,
        "set_title": new_set.title,
        "cards": saved_cards,
        "flashcards": saved_cards,
        "total_generated": len(saved_cards),
    }

@router.post("/mark_flashcard_for_review")
async def mark_flashcard_for_review(
    card_id: int = Form(...),
    marked: bool = Form(True),
    db: Session = Depends(get_db),
):
    card = db.query(models.Flashcard).filter(models.Flashcard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    card.marked_for_review = marked
    db.commit()

    if marked:
        flashcard_set = db.query(models.FlashcardSet).filter(
            models.FlashcardSet.id == card.set_id
        ).first()
        if flashcard_set:
            from tutor import neo4j_store
            if neo4j_store.available():
                try:
                    concept = flashcard_set.title.replace("Flashcards: ", "") if flashcard_set.title else ""
                    if concept:
                        await neo4j_store.update_struggle(
                            str(flashcard_set.user_id), concept
                        )
                except Exception as e:
                    logger.warning(f"Neo4j struggle write on mark_for_review failed: {e}")

            from tutor import chroma_store
            if chroma_store.available():
                try:
                    summary = (
                        f"Student marked flashcard for review (doesn't know): "
                        f"Q: {card.question[:100]} from set \"{flashcard_set.title}\""
                    )
                    chroma_store.write_episode(
                        user_id=str(flashcard_set.user_id),
                        summary=summary,
                        metadata={
                            "source": "flashcard_review",
                            "card_id": str(card.id),
                            "set_id": str(card.set_id),
                            "was_correct": "False",
                            "topic": flashcard_set.title or "",
                            "action": "marked_for_review",
                        },
                    )
                except Exception as e:
                    logger.warning(f"Chroma write failed on mark_for_review: {e}")

    return {"status": "success", "card_id": card_id, "marked_for_review": marked}

@router.post("/flashcards/review")
async def update_flashcard_review(request: FlashcardReviewRequest, db: Session = Depends(get_db)):
    card = db.query(models.Flashcard).filter(models.Flashcard.id == int(request.card_id)).first()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    card.times_reviewed = (card.times_reviewed or 0) + 1
    if request.was_correct:
        card.correct_count = (card.correct_count or 0) + 1
    card.last_reviewed = datetime.now(timezone.utc)
    db.commit()

    flashcard_set = db.query(models.FlashcardSet).filter(
        models.FlashcardSet.id == card.set_id
    ).first()
    set_title = flashcard_set.title if flashcard_set else ""
    owner_id = str(flashcard_set.user_id) if flashcard_set else ""

    from tutor import chroma_store
    if chroma_store.available() and owner_id:
        try:
            outcome = "correctly" if request.was_correct else "incorrectly"
            summary = (
                f"Flashcard review in set \"{set_title}\": Student answered {outcome}. "
                f"Q: {card.question[:100]} A: {card.answer[:100]}. "
                f"Total reviews: {card.times_reviewed}, Correct: {card.correct_count}."
            )
            chroma_store.write_episode(
                user_id=owner_id,
                summary=summary,
                metadata={
                    "source": "flashcard_review",
                    "card_id": str(card.id),
                    "set_id": str(card.set_id),
                    "was_correct": str(request.was_correct),
                    "topic": set_title,
                    "mode": request.mode,
                },
            )
        except Exception as e:
            logger.warning(f"Chroma write failed on flashcard review: {e}")

    if not request.was_correct and owner_id:
        from tutor import neo4j_store
        if neo4j_store.available():
            try:
                concept = set_title.replace("Flashcards: ", "") if set_title else ""
                if concept:
                    await neo4j_store.update_struggle(owner_id, concept)
            except Exception as e:
                logger.warning(f"Neo4j struggle write failed: {e}")

    return {
        "status": "success",
        "card_id": card.id,
        "times_reviewed": card.times_reviewed,
        "correct_count": card.correct_count,
    }

class SRReviewRequest(BaseModel):
    user_id: str
    card_id: int
    grade: str

@router.get("/flashcards/due")
def get_due_flashcards(
    user_id: str = Query(...),
    limit: int = Query(50),
    db: Session = Depends(get_db),
):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from services.spaced_repetition import preview_intervals

    now = datetime.now(timezone.utc)

    due_cards = (
        db.query(models.Flashcard)
        .join(models.FlashcardSet)
        .filter(
            models.FlashcardSet.user_id == user.id,
            or_(
                models.Flashcard.next_review_date <= now,
                and_(
                    models.Flashcard.next_review_date == None,
                    or_(
                        models.Flashcard.sr_state == "new",
                        models.Flashcard.sr_state == None,
                    ),
                ),
                and_(
                    models.Flashcard.sr_state.in_(["learning", "relearning"]),
                    models.Flashcard.next_review_date <= now,
                ),
            ),
        )
        .order_by(models.Flashcard.next_review_date.asc().nullsfirst())
        .limit(limit)
        .all()
    )

    new_count = sum(1 for c in due_cards if (c.sr_state or "new") == "new")
    review_count = sum(1 for c in due_cards if c.sr_state == "review")
    learning_count = sum(1 for c in due_cards if c.sr_state == "learning")
    relearning_count = sum(1 for c in due_cards if c.sr_state == "relearning")

    cards_data = []
    for c in due_cards:
        fs = db.query(models.FlashcardSet).filter(models.FlashcardSet.id == c.set_id).first()
        set_title = fs.title if fs else ""

        card_state = c.sr_state or "new"
        card_ease = c.ease_factor if c.ease_factor else 2.5
        card_interval = c.interval if c.interval else 0
        card_reps = c.repetitions if c.repetitions else 0
        card_lapses = c.lapses if c.lapses else 0
        card_step = c.learning_step if c.learning_step else 0

        interval_preview = preview_intervals(
            card_state, card_ease, card_interval, card_reps, card_lapses, card_step
        )

        cards_data.append({
            "id": c.id,
            "set_id": c.set_id,
            "set_title": set_title,
            "question": c.question,
            "answer": c.answer,
            "difficulty": c.difficulty or "medium",
            "sr_state": card_state,
            "ease_factor": card_ease,
            "interval": card_interval,
            "repetitions": card_reps,
            "lapses": card_lapses,
            "interval_preview": interval_preview,
        })

    return {
        "due_count": len(due_cards),
        "new_count": new_count,
        "review_count": review_count,
        "learning_count": learning_count,
        "relearning_count": relearning_count,
        "cards": cards_data,
    }

@router.post("/flashcards/sr_review")
async def sr_review(request: SRReviewRequest, db: Session = Depends(get_db)):
    from services.fsrs_scheduler import GRADE_TO_RATING, apply_fsrs_review, preview_intervals as fsrs_preview

    user = get_user_by_username(db, request.user_id) or get_user_by_email(db, request.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    grade_str = request.grade.lower()
    if grade_str not in GRADE_TO_RATING:
        raise HTTPException(status_code=400, detail=f"Invalid grade. Must be one of: {list(GRADE_TO_RATING)}")

    card = db.query(models.Flashcard).filter(models.Flashcard.id == request.card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    old_state = card.sr_state or "new"

    result = apply_fsrs_review(card, grade_str)

    card.sr_state       = result["new_state"]
    card.ease_factor    = result["new_ease"]
    card.interval       = result["new_interval"]
    card.repetitions    = result["new_repetitions"]
    card.lapses         = result["new_lapses"]
    card.learning_step  = result["new_learning_step"]
    card.next_review_date = result["next_review_date"]
    card.fsrs_stability = result["fsrs_stability"]

    card.times_reviewed = (card.times_reviewed or 0) + 1
    if grade_str in ("good", "easy"):
        card.correct_count = (card.correct_count or 0) + 1
    card.last_reviewed = datetime.now(timezone.utc)

    if result["new_state"] == "review" and grade_str in ("good", "easy"):
        card.marked_for_review = False

    db.commit()

    flashcard_set = db.query(models.FlashcardSet).filter(
        models.FlashcardSet.id == card.set_id
    ).first()
    set_title = flashcard_set.title if flashcard_set else ""

    try:
        from services.gamification_system import award_points
        award_points(db, user.id, "flashcard_reviewed")
        if old_state in ("new", "learning") and result["new_state"] == "review":
            award_points(db, user.id, "flashcard_mastered")
    except Exception:
        pass

    from tutor import chroma_store
    if chroma_store.available():
        try:
            summary = (
                f"FSRS Review in \"{set_title}\": grade={grade_str}, "
                f"Q: {card.question[:80]}. "
                f"State: {old_state}->{result['new_state']}, "
                f"interval={result['new_interval']:.1f}d, "
                f"stability={result['fsrs_stability']:.2f}, "
                f"retrievability={result['retrievability']:.2%}"
            )
            chroma_store.write_episode(
                user_id=str(user.id),
                summary=summary,
                metadata={
                    "source": "flashcard_sr_review",
                    "card_id": str(card.id),
                    "set_id": str(card.set_id),
                    "sr_grade": grade_str,
                    "sr_state_before": old_state,
                    "sr_state_after": result["new_state"],
                    "new_interval_days": str(round(result["new_interval"], 2)),
                    "topic": set_title,
                },
            )
        except Exception as e:
            logger.warning(f"Chroma write failed on SR review: {e}")

    if grade_str == "again":
        from tutor import neo4j_store
        if neo4j_store.available():
            try:
                concept = set_title.replace("Flashcards: ", "") if set_title else ""
                if concept:
                    await neo4j_store.update_struggle(str(user.id), concept)
            except Exception as e:
                logger.warning(f"Neo4j struggle write failed: {e}")

    try:
        from services.context_agent import get_context_agent, LearningEvent
        _agent = get_context_agent()
        if _agent:
            _concept_name = set_title.replace("Flashcards: ", "") if set_title else card.category or ""
            _correct = grade_str in ("good", "easy")
            _event = LearningEvent(
                student_id=str(user.id),
                source="flashcard",
                event_type="review",
                concept_id=str(card.set_id),
                concept_name=_concept_name,
                correct=_correct,
                wrong_count=0 if _correct else 1,
                raw_data={"grade": grade_str, "difficulty": card.difficulty or "medium"},
            )
            _agent.record_event(db, _event)
    except Exception as _ae:
        logger.debug(f"[Flashcard] agent event skipped: {_ae}")

    new_preview = fsrs_preview(card)

    return {
        "status": "success",
        "card_id": card.id,
        "new_state": result["new_state"],
        "new_interval": round(result["new_interval"], 2),
        "new_ease": result["new_ease"],
        "next_review_date": result["next_review_date"].isoformat() + "Z",
        "fsrs_stability": result["fsrs_stability"],
        "retrievability": result["retrievability"],
        "interval_preview": new_preview,
    }

@router.get("/flashcards/sr_stats")
def get_sr_stats(user_id: str = Query(...), db: Session = Depends(get_db)):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    all_cards = (
        db.query(models.Flashcard)
        .join(models.FlashcardSet)
        .filter(models.FlashcardSet.user_id == user.id)
        .all()
    )

    total = len(all_cards)
    if total == 0:
        return {
            "total_cards": 0,
            "state_distribution": {"new": 0, "learning": 0, "review": 0, "relearning": 0},
            "retention_rate": 0,
            "ease_distribution": [],
            "review_forecast": [],
            "maturity": {"average_interval": 0, "mature_count": 0, "longest_interval": 0},
            "lapse_stats": {"total_lapses": 0, "most_lapsed": []},
        }

    state_dist = {"new": 0, "learning": 0, "review": 0, "relearning": 0}
    for c in all_cards:
        state = c.sr_state or "new"
        if state in state_dist:
            state_dist[state] += 1

    total_reviews = sum(c.times_reviewed or 0 for c in all_cards)
    total_correct = sum(c.correct_count or 0 for c in all_cards)
    retention = round((total_correct / total_reviews * 100), 1) if total_reviews > 0 else 0

    ease_buckets = [
        {"range": "1.3-1.7", "label": "Hard", "count": 0},
        {"range": "1.7-2.1", "label": "Difficult", "count": 0},
        {"range": "2.1-2.5", "label": "Normal", "count": 0},
        {"range": "2.5-2.9", "label": "Easy", "count": 0},
        {"range": "2.9+", "label": "Very Easy", "count": 0},
    ]
    for c in all_cards:
        ease = c.ease_factor or 2.5
        if ease < 1.7:
            ease_buckets[0]["count"] += 1
        elif ease < 2.1:
            ease_buckets[1]["count"] += 1
        elif ease < 2.5:
            ease_buckets[2]["count"] += 1
        elif ease < 2.9:
            ease_buckets[3]["count"] += 1
        else:
            ease_buckets[4]["count"] += 1

    now = datetime.now(timezone.utc)
    forecast = []
    for day_offset in range(14):
        target_date = (now + timedelta(days=day_offset)).date()
        count = 0
        for c in all_cards:
            if c.next_review_date:
                review_date = c.next_review_date
                if hasattr(review_date, 'date'):
                    review_date = review_date.date()
                if review_date == target_date:
                    count += 1
            elif (c.sr_state or "new") == "new" and day_offset == 0:
                count += 1
        forecast.append({
            "date": target_date.isoformat(),
            "day_label": "Today" if day_offset == 0 else target_date.strftime("%b %d"),
            "count": count,
        })

    review_cards = [c for c in all_cards if c.sr_state == "review"]
    intervals = [c.interval or 0 for c in review_cards]
    avg_interval = round(sum(intervals) / len(intervals), 1) if intervals else 0
    longest = max(intervals) if intervals else 0
    mature_count = sum(1 for i in intervals if i >= 21)

    total_lapses = sum(c.lapses or 0 for c in all_cards)
    most_lapsed = sorted(
        [c for c in all_cards if (c.lapses or 0) > 0],
        key=lambda c: c.lapses or 0,
        reverse=True,
    )[:5]

    return {
        "total_cards": total,
        "state_distribution": state_dist,
        "retention_rate": retention,
        "total_reviews": total_reviews,
        "ease_distribution": ease_buckets,
        "review_forecast": forecast,
        "maturity": {
            "average_interval": avg_interval,
            "mature_count": mature_count,
            "longest_interval": round(longest, 1),
            "review_card_count": len(review_cards),
        },
        "lapse_stats": {
            "total_lapses": total_lapses,
            "most_lapsed": [
                {"card_id": c.id, "question": c.question[:80], "lapses": c.lapses}
                for c in most_lapsed
            ],
        },
    }

@router.get("/flashcards/ai_suggestions")
async def get_ai_suggestions(user_id: str = Query(...), db: Session = Depends(get_db)):
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    all_cards = (
        db.query(models.Flashcard)
        .join(models.FlashcardSet)
        .filter(models.FlashcardSet.user_id == user.id)
        .all()
    )

    total = len(all_cards)
    if total == 0:
        return {
            "daily_target": 10,
            "problem_areas": [],
            "study_tips": ["Start by creating some flashcard sets on topics you want to learn!"],
            "optimal_new_cards_per_day": 10,
            "encouragement": "Welcome! Create your first flashcard set to get started.",
        }

    now = datetime.now(timezone.utc)

    state_counts = {"new": 0, "learning": 0, "review": 0, "relearning": 0}
    for c in all_cards:
        s = c.sr_state or "new"
        if s in state_counts:
            state_counts[s] += 1

    due_today = sum(
        1 for c in all_cards
        if (c.next_review_date and c.next_review_date <= now)
        or (c.sr_state or "new") == "new"
    )

    total_reviews = sum(c.times_reviewed or 0 for c in all_cards)
    total_correct = sum(c.correct_count or 0 for c in all_cards)
    retention = round((total_correct / total_reviews * 100), 1) if total_reviews > 0 else 0

    avg_ease = round(sum((c.ease_factor or 2.5) for c in all_cards) / total, 2)

    low_ease_cards = [c for c in all_cards if (c.ease_factor or 2.5) < 1.8]
    high_lapse_cards = [c for c in all_cards if (c.lapses or 0) >= 3]

    problem_topics = set()
    for c in low_ease_cards + high_lapse_cards:
        fs = db.query(models.FlashcardSet).filter(models.FlashcardSet.id == c.set_id).first()
        if fs:
            problem_topics.add(fs.title)

    reviewed_last_week = sum(
        1 for c in all_cards
        if c.last_reviewed and (now - c.last_reviewed).days <= 7
    )

    prompt = f"""You are a spaced repetition study coach. Analyze this student's flashcard data and provide personalized suggestions.

Stats:
- Total cards: {total}, Due today: {due_today}
- State distribution: new={state_counts['new']}, learning={state_counts['learning']}, review={state_counts['review']}, relearning={state_counts['relearning']}
- Retention rate: {retention}%
- Average ease factor: {avg_ease}
- Cards with low ease (<1.8): {len(low_ease_cards)} cards
- Cards with high lapses (>=3): {len(high_lapse_cards)} cards
- Problem topics: {', '.join(problem_topics) if problem_topics else 'None'}
- Cards reviewed in last 7 days: {reviewed_last_week}
- Total lifetime reviews: {total_reviews}

Return ONLY valid JSON (no markdown, no code blocks):
{{
  "daily_target": <recommended cards to review per day as number>,
  "problem_areas": [
    {{"topic": "topic name", "suggestion": "specific advice", "priority": "high or medium or low"}}
  ],
  "study_tips": ["tip 1", "tip 2", "tip 3"],
  "optimal_new_cards_per_day": <number>,
  "encouragement": "motivational message based on their data"
}}"""

    try:
        ai_response = unified_ai.generate(prompt, max_tokens=800, temperature=0.7)
        cleaned = ai_response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0]
        suggestions = json.loads(cleaned)
        return suggestions
    except Exception as e:
        logger.warning(f"AI suggestions failed: {e}")
        tips = []
        if retention < 80:
            tips.append("Your retention rate is below 80%. Consider reviewing more frequently to strengthen memory.")
        if len(low_ease_cards) > 5:
            tips.append(f"You have {len(low_ease_cards)} difficult cards. Try breaking these into simpler sub-concepts.")
        if state_counts["new"] > 50:
            tips.append("You have many unstarted cards. Focus on reviewing existing cards before adding more new ones.")
        if not tips:
            tips.append("Keep up the great work! Consistency is key to long-term retention.")

        return {
            "daily_target": min(50, max(10, due_today)),
            "problem_areas": [
                {"topic": t, "suggestion": "Focus extra time on this topic", "priority": "high"}
                for t in list(problem_topics)[:3]
            ],
            "study_tips": tips,
            "optimal_new_cards_per_day": 10 if state_counts["review"] < 100 else 5,
            "encouragement": f"You've reviewed {total_reviews} cards total. Keep going!",
        }
