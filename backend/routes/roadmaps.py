import json
import logging
import math
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
from database import get_db
from deps import (
    call_ai,
    call_ai_async,
    enforce_request_user_scope,
    get_current_user,
    get_user_by_email,
    get_user_by_username,
    unified_ai,
)

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api",
    tags=["roadmaps"],
    dependencies=[Depends(enforce_request_user_scope)],
)

def _normalize_topic_name(topic: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(topic or "").lower()).strip()

def _clean_knowledge_map_text(value: Any, *, max_length: int = 160, fallback: str = "") -> str:
    text = str(value or "").strip()
    if not text:
        return fallback

    text = re.sub(r"^```(?:json|text)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    text = text.strip(" \t\r\n\"'`")

    # AI topic extraction sometimes uses symbols as accidental word separators.
    text = re.sub(r"(?<=[A-Za-z])[$@#](?=[A-Za-z])", " ", text)
    text = re.sub(r"(?<=[A-Za-z])[_/|](?=[A-Za-z])", " ", text)
    text = re.sub(r"[\u200b-\u200f\u202a-\u202e]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s*[-–—]\s*Click\s+'?Explore'?.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+([,.;:!?%)\]])", r"\1", text)
    text = re.sub(r"([([%])\s+", r"\1", text)

    if max_length and len(text) > max_length:
        text = text[:max_length].rsplit(" ", 1)[0].strip() or text[:max_length].strip()
    return text or fallback

def _topic_names_match(left: str, right: str) -> bool:
    normalized_left = _normalize_topic_name(left)
    normalized_right = _normalize_topic_name(right)
    if not normalized_left or not normalized_right:
        return False
    if normalized_left == normalized_right:
        return True

    left_tokens = set(normalized_left.split())
    right_tokens = set(normalized_right.split())
    if not left_tokens or not right_tokens:
        return False

    overlap = left_tokens & right_tokens
    return len(overlap) / max(len(left_tokens), len(right_tokens)) >= 0.8

def build_user_profile_dict(user, comprehensive_profile=None) -> Dict[str, Any]:
    profile = {
        "user_id": getattr(user, "id", "unknown"),
        "first_name": getattr(user, "first_name", "Student"),
        "last_name": getattr(user, "last_name", ""),
        "field_of_study": getattr(user, "field_of_study", "General Studies"),
        "learning_style": getattr(user, "learning_style", "Mixed"),
        "school_university": getattr(user, "school_university", "Student"),
        "age": getattr(user, "age", None),
    }
    if comprehensive_profile:
        profile.update({
            "difficulty_level": getattr(comprehensive_profile, "difficulty_level", "intermediate"),
            "learning_pace": getattr(comprehensive_profile, "learning_pace", "moderate"),
            "study_environment": getattr(comprehensive_profile, "study_environment", "quiet"),
            "preferred_language": getattr(comprehensive_profile, "preferred_language", "english"),
            "study_goals": getattr(comprehensive_profile, "study_goals", None),
            "career_goals": getattr(comprehensive_profile, "career_goals", None),
            "primary_archetype": getattr(comprehensive_profile, "primary_archetype", ""),
            "secondary_archetype": getattr(comprehensive_profile, "secondary_archetype", ""),
            "archetype_description": getattr(comprehensive_profile, "archetype_description", ""),
        })
    return profile

def _create_roadmap_record(db: Session, user_id: int, root_topic: str, title: Optional[str] = None):
    clean_topic = _clean_knowledge_map_text(root_topic, max_length=120)
    if not clean_topic:
        raise HTTPException(status_code=400, detail="root_topic required")
    clean_title = _clean_knowledge_map_text(title, max_length=255, fallback=f"Exploring {clean_topic}")

    root_node = models.KnowledgeNode(
        user_id=user_id,
        parent_node_id=None,
        topic_name=clean_topic,
        description=f"Explore {clean_topic}",
        depth_level=0,
        ai_explanation=None,
        key_concepts=None,
        generated_subtopics=None,
        is_explored=False,
        exploration_count=0,
        expansion_status="unexpanded",
        position_x=0.0,
        position_y=0.0,
    )
    db.add(root_node)
    db.flush()

    roadmap = models.KnowledgeRoadmap(
        user_id=user_id,
        title=clean_title,
        root_topic=clean_topic,
        root_node_id=root_node.id,
        total_nodes=1,
        max_depth_reached=0,
        status="active",
        last_accessed=datetime.now(timezone.utc),
    )
    db.add(roadmap)
    db.flush()
    root_node.roadmap_id = roadmap.id
    db.commit()
    db.refresh(roadmap)
    db.refresh(root_node)
    return roadmap, root_node

def _extract_text_from_docs_for_topic(user_id: int, doc_ids: list[str], max_chars: int = 12000) -> str:
    try:
        from services import vector_store as vs
    except Exception:
        return ""
    if not vs.available():
        return ""

    blocks: list[str] = []
    used_chars = 0
    for doc_id in doc_ids[:40]:
        try:
            rows = vs.get_by_metadata("user_docs", {"doc_id": doc_id}, user_id=str(user_id))
        except Exception:
            rows = []
        if not rows:
            continue
        rows.sort(
            key=lambda r: int(str((r.get("metadata") or {}).get("chunk_index", "0")).strip() or "0")
            if str((r.get("metadata") or {}).get("chunk_index", "0")).strip().isdigit()
            else 0
        )
        snippet_parts: list[str] = []
        doc_chars = 0
        for row in rows:
            chunk = (row.get("content") or "").strip()
            if not chunk:
                continue
            if len(chunk) > 520:
                chunk = chunk[:520].rsplit(" ", 1)[0].strip() + "…"
            if doc_chars + len(chunk) > 1700:
                break
            snippet_parts.append(chunk)
            doc_chars += len(chunk)
            if len(snippet_parts) >= 4:
                break
        if not snippet_parts:
            continue
        joined = "\n".join(f"- {s}" for s in snippet_parts)
        if used_chars + len(joined) > max_chars:
            break
        used_chars += len(joined)
        blocks.append(joined)
    return "\n\n".join(blocks)

async def _infer_root_topic_from_docs(docs: list[models.ContextDocument], extracted_text: str) -> tuple[str, str]:
    doc_lines = [
        f"- {d.filename or d.doc_id} | subject: {d.subject or 'General'} | summary: {(d.ai_summary or '')[:220]}"
        for d in docs[:40]
    ]
    prompt = (
        "Infer one concise study topic for a knowledge map from these selected documents.\n"
        "Return JSON only:\n"
        '{"root_topic":"2-6 word topic","title":"short knowledge map title"}\n\n'
        f"Document metadata:\n{chr(10).join(doc_lines)}\n\n"
        f"Document excerpts:\n{extracted_text[:14000]}"
    )

    root_topic = ""
    title = ""
    try:
        ai_text = await call_ai_async(prompt, max_tokens=220, temperature=0.2)
        json_match = re.search(r"\{.*\}", ai_text or "", re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group())
            root_topic = str(parsed.get("root_topic", "")).strip()
            title = str(parsed.get("title", "")).strip()
    except Exception:
        pass

    if not root_topic:
        subjects = [d.subject.strip() for d in docs if (d.subject or "").strip()]
        if subjects:
            common = max(set(subjects), key=subjects.count)
            root_topic = common
        else:
            first = docs[0].filename if docs else "Selected Documents"
            root_topic = (first or "Selected Documents").rsplit(".", 1)[0][:80]
    if not title:
        title = f"Exploring {root_topic}"
    root_topic = _clean_knowledge_map_text(root_topic, max_length=120, fallback="Selected Documents")
    title = _clean_knowledge_map_text(title, max_length=255, fallback=f"Exploring {root_topic}")
    return root_topic, title

_GENERIC_EXPLORATION_TERMS = {
    "core principles",
    "key theories",
    "practical applications",
    "related fields",
    "future directions",
    "used in various industries",
    "applied in research and development",
    "concept 1",
    "concept 2",
    "concept 3",
    "concept 4",
    "concept 5",
    "example 1 with context",
    "example 2 with context",
    "practical mastery advice",
}

def _coerce_string_list(value: Any, max_items: int = 6) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                value = parsed
            else:
                value = [value]
        except Exception:
            value = [value]
    if not isinstance(value, list):
        return []

    seen = set()
    cleaned = []
    for item in value:
        text = str(item or "").strip()
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)
        cleaned.append(text[:280])
        if len(cleaned) >= max_items:
            break
    return cleaned

def _looks_like_placeholder(text: Any) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return True
    if normalized in _GENERIC_EXPLORATION_TERMS:
        return True
    placeholder_starts = (
        "clear explanation",
        "concept ",
        "example ",
        "why this matters",
        "practical mastery",
        "an exploration of ",
    )
    return normalized.startswith(placeholder_starts) and (
        "fundamental concepts" in normalized
        or "with context" in normalized
        or normalized in _GENERIC_EXPLORATION_TERMS
    )

def _parse_json_object(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", raw):
        try:
            parsed, _ = decoder.raw_decode(raw[match.start():])
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            continue
    raise ValueError("No valid JSON object found")

def _build_node_path(db: Session, node: models.KnowledgeNode, user_id: int) -> list[str]:
    path = []
    current = node
    visited = set()
    while current and current.id not in visited:
        visited.add(current.id)
        path.insert(0, current.topic_name)
        if current.parent_node_id:
            current = db.query(models.KnowledgeNode).filter(
                models.KnowledgeNode.id == current.parent_node_id,
                models.KnowledgeNode.user_id == user_id,
            ).first()
        else:
            current = None
    return path

def _find_roadmap_for_node(db: Session, node: models.KnowledgeNode, user_id: int):
    if node.roadmap_id:
        roadmap = db.query(models.KnowledgeRoadmap).filter(
            models.KnowledgeRoadmap.id == node.roadmap_id,
            models.KnowledgeRoadmap.user_id == user_id,
        ).first()
        if roadmap:
            return roadmap

    root = node
    visited = set()
    while root.parent_node_id and root.id not in visited:
        visited.add(root.id)
        parent = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.id == root.parent_node_id,
            models.KnowledgeNode.user_id == user_id,
        ).first()
        if not parent:
            break
        root = parent

    return db.query(models.KnowledgeRoadmap).filter(
        models.KnowledgeRoadmap.root_node_id == root.id,
        models.KnowledgeRoadmap.user_id == user_id,
    ).first()

def _topic_specific_exploration_fallback(
    topic: str,
    context_path: str,
    description: Optional[str] = None,
) -> dict[str, Any]:
    clean_topic = _clean_knowledge_map_text(topic, max_length=120, fallback="this topic")
    clean_context = _clean_knowledge_map_text(context_path, max_length=240, fallback=clean_topic)
    useful_description = _clean_knowledge_map_text(description, max_length=180)
    if useful_description.lower().startswith("explore ") and "click" in useful_description.lower():
        useful_description = ""

    explanation_parts = [
        f"{clean_topic} is the focus of this node in the path {clean_context}.",
        f"Study it by defining the boundaries of {clean_topic}, identifying the ideas that make it work, and connecting those ideas back to the parent topic.",
    ]
    if useful_description:
        explanation_parts.append(f"In this map, the node is described as: {useful_description}")
    explanation_parts.append(
        f"A strong understanding of {clean_topic} should let you explain the main terms, recognize when the idea is being used, and compare it with nearby nodes in the knowledge map."
    )

    return {
        "explanation": " ".join(explanation_parts),
        "key_concepts": [
            f"{clean_topic} definition and scope",
            f"Core mechanisms inside {clean_topic}",
            f"How {clean_topic} connects to {clean_context}",
            f"Common examples involving {clean_topic}",
            f"Typical mistakes when learning {clean_topic}",
        ],
        "why_important": (
            f"{clean_topic} matters because it is a specific step in understanding {clean_context}. "
            f"If this node is unclear, later subtopics in the map will be harder to organize."
        ),
        "real_world_examples": [
            f"Use {clean_topic} to explain a concrete case, problem, or source connected to {clean_context}.",
            f"Compare {clean_topic} with a sibling or parent node to decide what belongs inside this topic and what belongs elsewhere.",
        ],
        "learning_tips": (
            f"Write a three-sentence explanation of {clean_topic}, list three examples, then ask one question that distinguishes it from the parent topic."
        ),
    }

def _normalize_exploration_payload(
    raw_data: dict[str, Any],
    topic: str,
    context_path: str,
    description: Optional[str],
) -> dict[str, Any]:
    fallback = _topic_specific_exploration_fallback(topic, context_path, description)

    explanation = _clean_knowledge_map_text(
        raw_data.get("explanation") or raw_data.get("ai_explanation"),
        max_length=1200,
    )
    if len(explanation) < 80 or _looks_like_placeholder(explanation):
        explanation = fallback["explanation"]

    key_concepts = [
        _clean_knowledge_map_text(item, max_length=140)
        for item in _coerce_string_list(raw_data.get("key_concepts"), max_items=7)
        if not _looks_like_placeholder(item) and _clean_knowledge_map_text(item, max_length=140)
    ]
    if len(key_concepts) < 3:
        key_concepts = fallback["key_concepts"]

    why_important = _clean_knowledge_map_text(raw_data.get("why_important"), max_length=900)
    if len(why_important) < 40 or _looks_like_placeholder(why_important):
        why_important = fallback["why_important"]

    real_world_examples = [
        _clean_knowledge_map_text(item, max_length=280)
        for item in _coerce_string_list(raw_data.get("real_world_examples"), max_items=4)
        if not _looks_like_placeholder(item) and _clean_knowledge_map_text(item, max_length=280)
    ]
    if len(real_world_examples) < 2:
        real_world_examples = fallback["real_world_examples"]

    learning_tips = _clean_knowledge_map_text(raw_data.get("learning_tips"), max_length=900)
    if len(learning_tips) < 40 or _looks_like_placeholder(learning_tips):
        learning_tips = fallback["learning_tips"]

    return {
        "explanation": explanation,
        "key_concepts": key_concepts,
        "why_important": why_important,
        "real_world_examples": real_world_examples,
        "learning_tips": learning_tips,
    }

def _node_has_generic_exploration(node: models.KnowledgeNode) -> bool:
    concepts = {item.lower() for item in _coerce_string_list(node.key_concepts, max_items=10)}
    generic_concepts = concepts.intersection(_GENERIC_EXPLORATION_TERMS)
    explanation = (node.ai_explanation or "").strip()
    examples = {item.lower() for item in _coerce_string_list(node.real_world_examples, max_items=10)}
    return (
        _looks_like_placeholder(explanation)
        or len(generic_concepts) >= 3
        or bool(examples.intersection({"used in various industries", "applied in research and development"}))
    )

def _serialize_explored_node(node: models.KnowledgeNode, context_path: Optional[list[str]] = None) -> dict[str, Any]:
    return {
        "id": node.id,
        "nodeId": node.id,
        "parent_id": node.parent_node_id,
        "topic_name": _clean_knowledge_map_text(node.topic_name, max_length=120),
        "description": _clean_knowledge_map_text(node.description, max_length=180),
        "depth_level": node.depth_level,
        "context_path": [
            _clean_knowledge_map_text(item, max_length=120)
            for item in (context_path or [])
            if _clean_knowledge_map_text(item, max_length=120)
        ],
        "ai_explanation": _clean_knowledge_map_text(node.ai_explanation, max_length=1200),
        "key_concepts": [
            _clean_knowledge_map_text(item, max_length=140)
            for item in _coerce_string_list(node.key_concepts, max_items=10)
            if _clean_knowledge_map_text(item, max_length=140)
        ],
        "why_important": _clean_knowledge_map_text(node.why_important, max_length=900),
        "real_world_examples": [
            _clean_knowledge_map_text(item, max_length=280)
            for item in _coerce_string_list(node.real_world_examples, max_items=10)
            if _clean_knowledge_map_text(item, max_length=280)
        ],
        "learning_tips": _clean_knowledge_map_text(node.learning_tips, max_length=900),
        "is_explored": node.is_explored,
        "exploration_count": node.exploration_count,
    }

@router.post("/create_knowledge_roadmap")
async def create_knowledge_roadmap(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        root_topic = payload.get("root_topic")

        if not user_id or not root_topic:
            raise HTTPException(status_code=400, detail="user_id and root_topic required")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        roadmap, root_node = _create_roadmap_record(
            db=db,
            user_id=user.id,
            root_topic=root_topic,
            title=f"Exploring {root_topic}",
        )

        return {
            "status": "success",
            "roadmap_id": roadmap.id,
            "root_node_id": root_node.id,
            "root_node": {
                "id": root_node.id,
                "topic_name": root_node.topic_name,
                "description": root_node.description,
                "depth_level": root_node.depth_level,
                "ai_explanation": root_node.ai_explanation,
                "key_concepts": json.loads(root_node.key_concepts) if root_node.key_concepts else [],
                "is_explored": root_node.is_explored,
                "expansion_status": root_node.expansion_status,
                "position": {"x": root_node.position_x, "y": root_node.position_y},
            },
            "child_nodes": [],
            "total_nodes": roadmap.total_nodes,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating roadmap: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/create_roadmap_from_context_docs")
async def create_roadmap_from_context_docs(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        raw_doc_ids = payload.get("context_doc_ids") or []
        title_hint = (payload.get("title") or "").strip()

        if isinstance(raw_doc_ids, str):
            doc_ids = [x.strip() for x in raw_doc_ids.split(",") if x.strip()]
        else:
            doc_ids = [str(x).strip() for x in raw_doc_ids if str(x).strip()]
        doc_ids = list(dict.fromkeys(doc_ids))[:40]
        if not user_id or not doc_ids:
            raise HTTPException(status_code=400, detail="user_id and context_doc_ids required")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

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

        extracted_text = _extract_text_from_docs_for_topic(user.id, doc_ids)
        root_topic, inferred_title = await _infer_root_topic_from_docs(docs, extracted_text)
        final_title = _clean_knowledge_map_text(
            title_hint or inferred_title or f"Exploring {root_topic}",
            max_length=255,
            fallback=f"Exploring {root_topic}",
        )

        roadmap, root_node = _create_roadmap_record(
            db=db,
            user_id=user.id,
            root_topic=root_topic,
            title=final_title,
        )

        return {
            "status": "success",
            "roadmap_id": roadmap.id,
            "root_node_id": root_node.id,
            "root_topic": root_topic,
            "title": roadmap.title,
            "source_doc_count": len(docs),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating roadmap from context docs: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/create_roadmap_from_chat")
async def create_roadmap_from_chat(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        chat_session_id = payload.get("chat_session_id")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        chat_session = db.query(models.ChatSession).filter(
            models.ChatSession.id == chat_session_id,
            models.ChatSession.user_id == user.id,
        ).first()

        if not chat_session:
            raise HTTPException(status_code=404, detail="Chat session not found")

        messages = db.query(models.ChatMessage).filter(
            models.ChatMessage.chat_session_id == chat_session_id
        ).order_by(models.ChatMessage.timestamp.asc()).all()

        if not messages:
            raise HTTPException(status_code=404, detail="No messages in chat session")

        conversation_text = []
        for msg in messages:
            conversation_text.append(f"Q: {msg.user_message}")
            conversation_text.append(f"A: {msg.ai_response}")

        full_conversation = "\n\n".join(conversation_text)[:4000]

        prompt = f"""Extract main topic name only. Return ONLY the topic name (e.g., "Machine Learning", "World War II", "Quantum Physics"). No explanation, just the topic.

Conversation:
{full_conversation}

Topic:"""

        root_topic = _clean_knowledge_map_text(
            await call_ai_async(prompt, max_tokens=50, temperature=0.3),
            max_length=120,
            fallback=chat_session.title or "Chat Topic",
        )

        return {
            "status": "success",
            "root_topic": root_topic,
            "chat_title": chat_session.title,
            "message": f"Knowledge map topic identified: {root_topic}",
        }

    except Exception as e:
        logger.error(f"Error creating roadmap from chat: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/expand_knowledge_node/{node_id}")
async def expand_knowledge_node(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    node = None
    try:
        node = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.id == node_id,
            models.KnowledgeNode.user_id == current_user.id,
        ).first()

        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        if node.expansion_status == "expanded" and node.generated_subtopics:
            children = db.query(models.KnowledgeNode).filter(
                models.KnowledgeNode.parent_node_id == node_id,
                models.KnowledgeNode.user_id == current_user.id,
            ).all()

            return {
                "status": "already_expanded",
                "message": "Node already expanded",
                "child_nodes": [
                    {
                        "id": child.id,
                        "parent_id": child.parent_node_id,
                        "topic_name": _clean_knowledge_map_text(child.topic_name, max_length=120),
                        "description": _clean_knowledge_map_text(child.description, max_length=180),
                        "depth_level": child.depth_level,
                        "is_explored": child.is_explored,
                        "expansion_status": child.expansion_status,
                        "position": {"x": child.position_x, "y": child.position_y},
                    }
                for child in children
            ],
        }

        roadmap = _find_roadmap_for_node(db, node, current_user.id)
        if roadmap and not node.roadmap_id:
            node.roadmap_id = roadmap.id

        node.expansion_status = "expanding"
        db.commit()

        user = db.query(models.User).filter(models.User.id == node.user_id).first()
        user_profile = build_user_profile_dict(user)

        context_path = []
        current = node
        while current:
            context_path.insert(0, current.topic_name)
            if current.parent_node_id:
                current = db.query(models.KnowledgeNode).filter(
                    models.KnowledgeNode.id == current.parent_node_id,
                    models.KnowledgeNode.user_id == current_user.id,
                ).first()
            else:
                current = None

        context_str = " → ".join(context_path)

        existing_children = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.parent_node_id == node_id,
            models.KnowledgeNode.user_id == current_user.id,
        ).all()
        existing_child_names = [child.topic_name for child in existing_children]
        existing_child_context = ", ".join(existing_child_names) if existing_child_names else "None"

        expansion_prompt = f"""Expand "{node.topic_name}".
Context: {context_str}
Depth: {node.depth_level}
Level: {user_profile.get('difficulty_level', 'intermediate')}
Existing immediate child topics: {existing_child_context}

Generate 4-5 specific subtopics (more specific than parent, 2-5 words each).
Do not repeat, rename, or closely overlap with any existing immediate child topic.

**JSON OUTPUT**:
{{
  "subtopics": [
    {{
      "name": "Short Name (2-5 words)",
      "description": "One-line description (<100 chars)",
      "complexity": "beginner|intermediate|advanced"
    }}
  ]
}}"""

        response_text = await call_ai_async(expansion_prompt, max_tokens=1000, temperature=0.8)

        try:
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                ai_data = json.loads(json_match.group())
            else:
                raise ValueError("No JSON found")
        except Exception as e:
            logger.error(f"Failed to parse expansion JSON: {str(e)}")
            ai_data = {
                "subtopics": [
                    {"name": "Fundamentals", "description": "Core concepts and basics", "complexity": "beginner"},
                    {"name": "Key Principles", "description": "Essential rules and theories", "complexity": "intermediate"},
                    {"name": "Applications", "description": "Real-world uses", "complexity": "intermediate"},
                    {"name": "Advanced Topics", "description": "Deep dive into complexity", "complexity": "advanced"},
                ]
            }

        subtopics = ai_data.get("subtopics", [])[:5]
        if not subtopics:
            subtopics = [
                {"name": "Fundamentals", "description": "Core concepts and basics", "complexity": "beginner"},
                {"name": "Key Principles", "description": "Essential rules and theories", "complexity": "intermediate"},
                {"name": "Applications", "description": "Real-world uses", "complexity": "intermediate"},
                {"name": "Advanced Topics", "description": "Deep dive into complexity", "complexity": "advanced"},
            ]

        fallback_subtopics = [
            {"name": f"{node.topic_name} Foundations", "description": "Foundational ideas for this topic", "complexity": "beginner"},
            {"name": f"{node.topic_name} Examples", "description": "Concrete examples and cases", "complexity": "intermediate"},
            {"name": f"{node.topic_name} Practice", "description": "Ways to apply and reinforce this topic", "complexity": "intermediate"},
            {"name": "Core Concepts", "description": "Essential ideas to understand", "complexity": "beginner"},
            {"name": "Key Methods", "description": "Important techniques and approaches", "complexity": "intermediate"},
            {"name": "Practical Uses", "description": "How this appears in real scenarios", "complexity": "intermediate"},
            {"name": "Common Challenges", "description": "Typical problems and tradeoffs", "complexity": "intermediate"},
            {"name": "Advanced Patterns", "description": "Deeper structures and extensions", "complexity": "advanced"},
            {"name": "Related Tools", "description": "Helpful tools, systems, or frameworks", "complexity": "intermediate"},
        ]

        unique_subtopics = []
        seen_names = list(existing_child_names)
        for subtopic in [*subtopics, *fallback_subtopics]:
            name = _clean_knowledge_map_text(subtopic.get("name", ""), max_length=80)
            if not name:
                continue
            if any(_topic_names_match(name, existing_name) for existing_name in seen_names):
                continue
            description = _clean_knowledge_map_text(
                subtopic.get("description", ""),
                max_length=100,
                fallback=f"Explore {name}",
            )
            unique_subtopics.append({**subtopic, "name": name, "description": description})
            seen_names.append(name)
            if len(unique_subtopics) >= 5:
                break

        subtopics = unique_subtopics
        if not subtopics:
            node.expansion_status = "unexpanded"
            db.commit()
            return {
                "status": "success",
                "message": "No new non-duplicate subtopics were generated",
                "child_nodes": [],
            }

        child_nodes = []

        for idx, subtopic in enumerate(subtopics):
            angle = (idx * (360 / len(subtopics))) * (3.14159 / 180)
            radius = 300 + (node.depth_level * 50)

            parent_x = node.position_x if node.position_x is not None else 0
            parent_y = node.position_y if node.position_y is not None else 0

            child_node = models.KnowledgeNode(
                user_id=node.user_id,
                roadmap_id=roadmap.id if roadmap else node.roadmap_id,
                parent_node_id=node.id,
                topic_name=_clean_knowledge_map_text(subtopic.get("name", ""), max_length=80),
                description=_clean_knowledge_map_text(subtopic.get("description", ""), max_length=100),
                depth_level=node.depth_level + 1,
                ai_explanation=None,
                key_concepts=None,
                generated_subtopics=None,
                is_explored=False,
                exploration_count=0,
                expansion_status="unexpanded",
                position_x=parent_x + (radius * float(math.cos(angle))),
                position_y=parent_y + (radius * float(math.sin(angle))),
            )
            db.add(child_node)
            child_nodes.append(child_node)

        node.expansion_status = "expanded"
        node.generated_subtopics = json.dumps(subtopics)

        if roadmap:
            roadmap.total_nodes += len(child_nodes)
            roadmap.max_depth_reached = max(roadmap.max_depth_reached, node.depth_level + 1)
            roadmap.last_accessed = datetime.now(timezone.utc)

        db.commit()

        for child in child_nodes:
            db.refresh(child)

        return {
            "status": "success",
            "message": f"Expanded {node.topic_name} with {len(child_nodes)} subtopics",
            "child_nodes": [
                {
                    "id": child.id,
                    "parent_id": child.parent_node_id,
                    "topic_name": _clean_knowledge_map_text(child.topic_name, max_length=120),
                    "description": _clean_knowledge_map_text(child.description, max_length=180),
                    "depth_level": child.depth_level,
                    "is_explored": child.is_explored,
                    "expansion_status": child.expansion_status,
                    "position": {"x": child.position_x, "y": child.position_y},
                }
                for child in child_nodes
            ],
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        logger.error(f"Error expanding node: {str(e)}", exc_info=True)
        if node:
            node.expansion_status = "unexpanded"
            db.commit()
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/explore_node/{node_id}")
async def explore_node(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        node = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.id == node_id,
            models.KnowledgeNode.user_id == current_user.id,
        ).first()

        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        context_path = _build_node_path(db, node, current_user.id)
        context_str = " → ".join(context_path) if context_path else node.topic_name
        roadmap = _find_roadmap_for_node(db, node, current_user.id)
        if roadmap and not node.roadmap_id:
            node.roadmap_id = roadmap.id

        if node.ai_explanation and node.key_concepts and not _node_has_generic_exploration(node):
            node.exploration_count += 1
            node.last_explored = datetime.now(timezone.utc)
            if roadmap:
                roadmap.last_accessed = datetime.now(timezone.utc)
            db.commit()
            db.refresh(node)

            return {
                "status": "already_generated",
                "node": _serialize_explored_node(node, context_path),
            }

        user = db.query(models.User).filter(models.User.id == node.user_id).first()
        user_profile = build_user_profile_dict(user)

        sibling_nodes = []
        if node.parent_node_id:
            sibling_nodes = db.query(models.KnowledgeNode).filter(
                models.KnowledgeNode.parent_node_id == node.parent_node_id,
                models.KnowledgeNode.id != node.id,
                models.KnowledgeNode.user_id == current_user.id,
            ).limit(6).all()
        child_nodes = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.parent_node_id == node.id,
            models.KnowledgeNode.user_id == current_user.id,
        ).limit(6).all()

        sibling_context = ", ".join(s.topic_name for s in sibling_nodes) or "None listed"
        child_context = ", ".join(c.topic_name for c in child_nodes) or "None expanded yet"
        roadmap_title = roadmap.title if roadmap else "Knowledge Map"
        root_topic = roadmap.root_topic if roadmap else (context_path[0] if context_path else node.topic_name)

        explanation_prompt = f"""You are generating the Learn panel for one Knowledge Map node.
Return strict JSON only. No markdown, no prose outside JSON.

Knowledge Map Title: {roadmap_title}
Root Topic: {root_topic}
Node Topic: {node.topic_name}
Node Path: {context_str}
Node Description: {node.description or "No description provided"}
Nearby Sibling Nodes: {sibling_context}
Existing Child Nodes: {child_context}
Student Level: {user_profile.get('difficulty_level', 'intermediate')}

Requirements:
- Every field must be specifically about "{node.topic_name}" in the scope of this node path.
- Do not use generic placeholders such as "Core principles", "Key theories", "Practical applications", "Used in various industries", or "Applied in research and development".
- Explain the actual topic, not the Knowledge Map UI.
- Key concepts must be named concepts, steps, terms, or distinctions a student should learn for this exact topic.
- Real-world examples must mention concrete situations where "{node.topic_name}" appears or is applied.

JSON schema:
{{
  "explanation": "250-400 words specifically explaining this node topic",
  "key_concepts": ["specific concept 1", "specific concept 2", "specific concept 3", "specific concept 4", "specific concept 5"],
  "why_important": "2-3 sentences explaining why this exact topic matters in the node path",
  "real_world_examples": ["specific example 1", "specific example 2"],
  "learning_tips": "practical advice for mastering this exact topic"
}}"""

        try:
            response_text = await call_ai_async(explanation_prompt, max_tokens=2048, temperature=0.55)
            ai_data = _normalize_exploration_payload(
                _parse_json_object(response_text),
                topic=node.topic_name,
                context_path=context_str,
                description=node.description,
            )
        except Exception as e:
            logger.warning(f"Failed to generate strict exploration JSON for node {node.id}: {str(e)}")
            repair_prompt = f"""Create valid strict JSON for the Knowledge Map node "{node.topic_name}".
Node Path: {context_str}
Description: {node.description or "No description provided"}
Avoid all generic placeholders. Make every value specific to "{node.topic_name}".

JSON keys required: explanation, key_concepts, why_important, real_world_examples, learning_tips."""
            try:
                response_text = await call_ai_async(repair_prompt, max_tokens=1800, temperature=0.35)
                ai_data = _normalize_exploration_payload(
                    _parse_json_object(response_text),
                    topic=node.topic_name,
                    context_path=context_str,
                    description=node.description,
                )
            except Exception as retry_error:
                logger.warning(f"Using topic-scoped fallback for node {node.id}: {str(retry_error)}")
                ai_data = _topic_specific_exploration_fallback(
                    topic=node.topic_name,
                    context_path=context_str,
                    description=node.description,
                )

        node.ai_explanation = ai_data.get("explanation", "")
        node.key_concepts = json.dumps(ai_data.get("key_concepts", []))
        node.why_important = ai_data.get("why_important", "")
        node.real_world_examples = json.dumps(ai_data.get("real_world_examples", []))
        node.learning_tips = ai_data.get("learning_tips", "")
        node.is_explored = True
        node.exploration_count += 1
        node.last_explored = datetime.now(timezone.utc)

        history = models.NodeExplorationHistory(
            node_id=node.id,
            user_id=node.user_id,
            exploration_duration=0,
            explored_at=datetime.now(timezone.utc),
        )
        db.add(history)

        if roadmap:
            roadmap.last_accessed = datetime.now(timezone.utc)

        db.commit()
        db.refresh(node)

        return {
            "status": "success",
            "node": _serialize_explored_node(node, context_path),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exploring node: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_knowledge_roadmap/{roadmap_id}")
async def get_knowledge_roadmap(
    roadmap_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        roadmap = db.query(models.KnowledgeRoadmap).filter(
            models.KnowledgeRoadmap.id == roadmap_id,
            models.KnowledgeRoadmap.user_id == current_user.id,
        ).first()

        if not roadmap:
            raise HTTPException(status_code=404, detail="Knowledge map not found")

        root_node = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.id == roadmap.root_node_id,
            models.KnowledgeNode.user_id == current_user.id,
        ).first()

        # All nodes for this roadmap fetched in a single query; the tree walk
        # below (root reachability + expanded-node collection) happens in
        # memory instead of one query per node, which used to make this
        # endpoint O(node_count) round-trips on large knowledge maps.
        roadmap_nodes = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.roadmap_id == roadmap_id,
            models.KnowledgeNode.user_id == current_user.id,
        ).all()
        node_map = {node.id: node for node in roadmap_nodes}
        children_by_parent = {}
        for node in roadmap_nodes:
            children_by_parent.setdefault(node.parent_node_id, []).append(node)

        roadmap_node_ids = set()

        def collect_node_ids(node_id):
            if node_id in roadmap_node_ids or node_id not in node_map:
                return
            roadmap_node_ids.add(node_id)
            for child in children_by_parent.get(node_id, []):
                collect_node_ids(child.id)

        if root_node:
            collect_node_ids(root_node.id)

        all_nodes = [node_map[node_id] for node_id in roadmap_node_ids]

        expanded_nodes = set()

        def build_expansion_hierarchy(node_id):
            node = node_map.get(node_id)
            if not node:
                return
            if node.expansion_status == "expanded":
                expanded_nodes.add(node_id)
                for child in children_by_parent.get(node_id, []):
                    build_expansion_hierarchy(child.id)

        if root_node:
            build_expansion_hierarchy(root_node.id)

        nodes_flat = [
            {
                "id": node.id,
                "parent_id": node.parent_node_id,
                "topic_name": _clean_knowledge_map_text(node.topic_name, max_length=120),
                "description": _clean_knowledge_map_text(node.description, max_length=180),
                "depth_level": node.depth_level,
                "ai_explanation": _clean_knowledge_map_text(node.ai_explanation, max_length=1200),
                "key_concepts": [
                    _clean_knowledge_map_text(item, max_length=140)
                    for item in _coerce_string_list(node.key_concepts, max_items=10)
                    if _clean_knowledge_map_text(item, max_length=140)
                ],
                "why_important": _clean_knowledge_map_text(node.why_important, max_length=900),
                "real_world_examples": [
                    _clean_knowledge_map_text(item, max_length=280)
                    for item in _coerce_string_list(node.real_world_examples, max_items=10)
                    if _clean_knowledge_map_text(item, max_length=280)
                ],
                "learning_tips": _clean_knowledge_map_text(node.learning_tips, max_length=900),
                "is_explored": node.is_explored,
                "exploration_count": node.exploration_count,
                "expansion_status": node.expansion_status,
                "has_generated_subtopics": bool(node.generated_subtopics),
                "user_notes": node.user_notes,
                "position": {"x": node.position_x, "y": node.position_y},
                "created_at": node.created_at.isoformat() + "Z",
            }
            for node in all_nodes
        ]

        return {
            "roadmap": {
                "id": roadmap.id,
                "title": roadmap.title,
                "root_topic": roadmap.root_topic,
                "total_nodes": roadmap.total_nodes,
                "max_depth_reached": roadmap.max_depth_reached,
                "status": roadmap.status,
                "created_at": roadmap.created_at.isoformat() + "Z",
                "last_accessed": roadmap.last_accessed.isoformat() + "Z" if roadmap.last_accessed else None,
            },
            "nodes_flat": nodes_flat,
            "expanded_nodes": list(expanded_nodes),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting roadmap: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_user_roadmaps")
async def get_user_roadmaps(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        roadmaps = db.query(models.KnowledgeRoadmap).filter(
            models.KnowledgeRoadmap.user_id == user.id
        ).order_by(models.KnowledgeRoadmap.last_accessed.desc()).all()

        roadmap_data = []
        for roadmap in roadmaps:
            roadmap_data.append({
                "id": roadmap.id,
                "title": roadmap.title,
                "root_topic": roadmap.root_topic,
                "total_nodes": roadmap.total_nodes,
                "max_depth_reached": roadmap.max_depth_reached,
                "status": roadmap.status,
                "created_at": roadmap.created_at.isoformat() + "Z",
                "last_accessed": roadmap.last_accessed.isoformat() + "Z" if roadmap.last_accessed else roadmap.created_at.isoformat() + "Z",
            })

        return {"status": "success", "roadmaps": roadmap_data}

    except Exception as e:
        logger.error(f"Error getting user roadmaps: {str(e)}")
        return {"status": "error", "roadmaps": []}

@router.get("/get_knowledge_roadmaps")
async def get_knowledge_roadmaps(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        roadmaps = db.query(models.KnowledgeRoadmap).filter(
            models.KnowledgeRoadmap.user_id == user.id
        ).order_by(models.KnowledgeRoadmap.created_at.desc()).all()

        return {
            "roadmaps": [
                {
                    "id": roadmap.id,
                    "title": roadmap.title,
                    "root_topic": roadmap.root_topic,
                    "total_nodes": roadmap.total_nodes,
                    "max_depth_reached": roadmap.max_depth_reached,
                    "status": roadmap.status,
                    "created_at": roadmap.created_at.isoformat() + "Z",
                    "last_accessed": roadmap.last_accessed.isoformat() + "Z" if roadmap.last_accessed else None,
                }
                for roadmap in roadmaps
            ]
        }

    except Exception as e:
        logger.error(f"Error getting user roadmaps: {str(e)}")
        return {"roadmaps": []}

@router.post("/save_node_notes/{node_id}")
async def save_node_notes(
    node_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        node = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.id == node_id,
            models.KnowledgeNode.user_id == current_user.id,
        ).first()

        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        notes = payload.get("notes", "")
        node.user_notes = notes

        db.commit()

        return {"status": "success", "message": "Notes saved successfully"}

    except Exception as e:
        logger.error(f"Error saving notes: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/delete_roadmap/{roadmap_id}")
async def delete_roadmap(
    roadmap_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        roadmap = db.query(models.KnowledgeRoadmap).filter(
            models.KnowledgeRoadmap.id == roadmap_id,
            models.KnowledgeRoadmap.user_id == current_user.id,
        ).first()

        if not roadmap:
            raise HTTPException(status_code=404, detail="Knowledge map not found")

        roadmap_nodes = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.roadmap_id == roadmap_id,
            models.KnowledgeNode.user_id == current_user.id,
        ).all()
        node_ids = {node.id for node in roadmap_nodes}
        if roadmap.root_node_id:
            node_ids.add(roadmap.root_node_id)

        pending_node_ids = list(node_ids)
        while pending_node_ids:
            child_rows = db.query(models.KnowledgeNode.id).filter(
                models.KnowledgeNode.parent_node_id.in_(pending_node_ids),
                models.KnowledgeNode.user_id == current_user.id,
            ).all()
            pending_node_ids = []
            for row in child_rows:
                if row.id not in node_ids:
                    node_ids.add(row.id)
                    pending_node_ids.append(row.id)

        if node_ids:
            roadmap_nodes = db.query(models.KnowledgeNode).filter(
                models.KnowledgeNode.id.in_(node_ids),
                models.KnowledgeNode.user_id == current_user.id,
            ).all()

        if node_ids:
            db.query(models.KnowledgeRoadmap).filter(
                models.KnowledgeRoadmap.root_node_id.in_(node_ids),
                models.KnowledgeRoadmap.user_id == current_user.id,
            ).update(
                {models.KnowledgeRoadmap.root_node_id: None},
                synchronize_session=False,
            )

            db.query(models.NodeExplorationHistory).filter(
                models.NodeExplorationHistory.node_id.in_(node_ids),
                models.NodeExplorationHistory.user_id == current_user.id,
            ).delete(synchronize_session=False)

        db.query(models.NodeExplorationHistory).filter(
            models.NodeExplorationHistory.roadmap_id == roadmap_id,
            models.NodeExplorationHistory.user_id == current_user.id,
        ).delete(synchronize_session=False)

        for node in sorted(roadmap_nodes, key=lambda item: item.depth_level or 0, reverse=True):
            db.delete(node)

        db.delete(roadmap)
        db.commit()

        return {"status": "success", "message": "Knowledge map deleted successfully"}

    except Exception as e:
        logger.error(f"Error deleting roadmap: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/add_manual_node")
async def add_manual_node(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        roadmap_id = payload.get("roadmap_id")
        parent_id = payload.get("parent_id")
        topic_name = _clean_knowledge_map_text(payload.get("topic_name"), max_length=80)
        description = _clean_knowledge_map_text(payload.get("description", ""), max_length=120)

        if not all([roadmap_id, parent_id, topic_name]):
            raise HTTPException(status_code=400, detail="Missing required fields")

        parent_node = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.id == parent_id,
            models.KnowledgeNode.user_id == current_user.id,
        ).first()

        if not parent_node:
            raise HTTPException(status_code=404, detail="Parent node not found")

        roadmap = db.query(models.KnowledgeRoadmap).filter(
            models.KnowledgeRoadmap.id == roadmap_id,
            models.KnowledgeRoadmap.user_id == current_user.id,
        ).first()

        if not roadmap:
            raise HTTPException(status_code=404, detail="Knowledge map not found")

        new_node = models.KnowledgeNode(
            user_id=current_user.id,
            roadmap_id=roadmap_id,
            parent_node_id=parent_id,
            topic_name=topic_name,
            description=description or f"Custom node: {topic_name}",
            depth_level=parent_node.depth_level + 1,
            is_explored=False,
            expansion_status="unexpanded",
            is_manual=True,
        )

        db.add(new_node)

        roadmap.total_nodes = (roadmap.total_nodes or 0) + 1
        if new_node.depth_level > (roadmap.max_depth_reached or 0):
            roadmap.max_depth_reached = new_node.depth_level

        db.commit()
        db.refresh(new_node)

        return {
            "status": "success",
            "node": {
                "id": new_node.id,
                "topic_name": _clean_knowledge_map_text(new_node.topic_name, max_length=120),
                "description": _clean_knowledge_map_text(new_node.description, max_length=180),
                "depth_level": new_node.depth_level,
                "parent_id": new_node.parent_node_id,
                "is_explored": new_node.is_explored,
                "expansion_status": new_node.expansion_status,
                "is_manual": True,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding manual node: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/delete_roadmap_node/{node_id}")
async def delete_roadmap_node(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        node = db.query(models.KnowledgeNode).filter(
            models.KnowledgeNode.id == node_id,
            models.KnowledgeNode.user_id == current_user.id,
        ).first()

        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        if node.parent_node_id is None:
            raise HTTPException(status_code=400, detail="Cannot delete root node")

        roadmap_id = node.roadmap_id
        deleted_count = 0

        def delete_node_tree(nid):
            nonlocal deleted_count
            children = db.query(models.KnowledgeNode).filter(
                models.KnowledgeNode.parent_node_id == nid,
                models.KnowledgeNode.user_id == current_user.id,
            ).all()

            for child in children:
                delete_node_tree(child.id)

            db.query(models.NodeExplorationHistory).filter(
                models.NodeExplorationHistory.node_id == nid
            ).delete()

            db.query(models.KnowledgeNode).filter(
                models.KnowledgeNode.id == nid,
                models.KnowledgeNode.user_id == current_user.id,
            ).delete()

            deleted_count += 1

        delete_node_tree(node_id)

        roadmap = db.query(models.KnowledgeRoadmap).filter(
            models.KnowledgeRoadmap.id == roadmap_id,
            models.KnowledgeRoadmap.user_id == current_user.id,
        ).first()

        if roadmap:
            roadmap.total_nodes = max(0, (roadmap.total_nodes or 0) - deleted_count)

        db.commit()

        return {
            "status": "success",
            "message": f"Deleted {deleted_count} node(s)",
            "deleted_count": deleted_count,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting node: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/get_learning_hints")
async def get_learning_hints(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        review_id = payload.get("review_id")
        missing_points = payload.get("missing_points", [])

        if not review_id or not missing_points:
            raise HTTPException(status_code=400, detail="Review ID and missing points required")

        review = db.query(models.LearningReview).filter(
            models.LearningReview.id == review_id,
            models.LearningReview.user_id == current_user.id,
        ).first()

        if not review:
            raise HTTPException(status_code=404, detail="Learning review not found")

        source_content = review.source_content[:3000]
        missing_points = missing_points[:3]
        hints_list = []

        for point in missing_points:
            hint_prompt = f"""You are a helpful learning assistant providing subtle hints.

**CONTEXT** (original learning material):
{source_content}

**MISSING LEARNING POINT**:
{point}

**TASK**: Create a helpful hint that guides the student toward remembering this point WITHOUT directly giving away the answer.

**OUTPUT FORMAT** (JSON only):
{{
  "missing_point": "{point}",
  "hint": "A subtle clue that prompts memory without revealing the full answer",
  "memory_trigger": "A keyword or phrase that might jog their memory",
  "guiding_question": "A question that leads them to think about this topic"
}}

Generate hint now:"""

            response_text = await call_ai_async(hint_prompt, max_tokens=512, temperature=0.7)

            try:
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    hint_data = json.loads(json_match.group())
                    hints_list.append(hint_data)
            except Exception:
                hints_list.append({
                    "missing_point": point,
                    "hint": f"Think about the key concepts related to: {point[:50]}...",
                    "memory_trigger": "Review your notes",
                    "guiding_question": "What do you remember about this topic?",
                })

        return {
            "status": "success",
            "hints": hints_list,
            "total_hints": len(hints_list),
        }

    except Exception as e:
        logger.error(f"Error generating hints: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_concept_web")
async def get_concept_web(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            return {"nodes": [], "connections": []}

        nodes = db.query(models.ConceptNode).filter(
            models.ConceptNode.user_id == user.id
        ).all()

        connections = db.query(models.ConceptConnection).filter(
            models.ConceptConnection.user_id == user.id
        ).all()

        return {
            "nodes": [
                {
                    "id": node.id,
                    "concept_name": node.concept_name,
                    "description": node.description,
                    "category": node.category,
                    "importance_score": node.importance_score,
                    "mastery_level": node.mastery_level,
                    "position_x": node.position_x,
                    "position_y": node.position_y,
                    "notes_count": node.notes_count,
                    "quizzes_count": node.quizzes_count,
                    "flashcards_count": node.flashcards_count,
                    "created_at": node.created_at.isoformat() + "Z",
                }
                for node in nodes
            ],
            "connections": [
                {
                    "id": conn.id,
                    "source_id": conn.source_concept_id,
                    "target_id": conn.target_concept_id,
                    "connection_type": conn.connection_type,
                    "strength": conn.strength,
                    "ai_generated": conn.ai_generated,
                    "user_confirmed": conn.user_confirmed,
                }
                for conn in connections
            ],
        }
    except Exception as e:
        logger.error(f"Error getting concept web: {str(e)}")
        return {"nodes": [], "connections": []}

@router.post("/generate_concept_web")
async def generate_concept_web(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        logger.info(f"Generating concept web for user: {user.username}")

        db.query(models.ConceptConnection).filter(
            models.ConceptConnection.user_id == user.id
        ).delete()
        db.query(models.ConceptNode).filter(
            models.ConceptNode.user_id == user.id
        ).delete()
        db.commit()

        raw_concepts = []

        notes = db.query(models.Note).filter(
            models.Note.user_id == user.id,
            models.Note.is_deleted == False,
        ).all()
        logger.info(f"Found {len(notes)} notes")
        for note in notes:
            if note.title and len(note.title.strip()) > 2:
                raw_concepts.append((note.title.strip(), "Note", "Academic"))

        quizzes = db.query(models.SoloQuiz).filter(
            models.SoloQuiz.user_id == user.id
        ).all()
        logger.info(f"Found {len(quizzes)} quizzes")
        for quiz in quizzes:
            if quiz.subject and len(quiz.subject.strip()) > 2:
                raw_concepts.append((quiz.subject.strip(), "Quiz", "Academic"))

        flashcard_sets = db.query(models.FlashcardSet).filter(
            models.FlashcardSet.user_id == user.id
        ).all()
        logger.info(f"Found {len(flashcard_sets)} flashcard sets")
        for fs in flashcard_sets:
            if fs.title and len(fs.title.strip()) > 2:
                raw_concepts.append((fs.title.strip(), "Flashcards", "Academic"))

        chat_sessions = db.query(models.ChatSession).filter(
            models.ChatSession.user_id == user.id
        ).order_by(models.ChatSession.updated_at.desc()).limit(50).all()
        logger.info(f"Found {len(chat_sessions)} chat sessions")
        for session in chat_sessions:
            if session.title and session.title != "New Chat" and len(session.title.strip()) > 2:
                raw_concepts.append((session.title.strip(), "AI Chat", "Discussion"))

        if not raw_concepts:
            logger.info("No content found")
            return {"status": "no_content", "message": "No learning content found"}

        def normalize_topic(title):
            normalized = title.lower().strip()
            prefixes_to_remove = [
                "introduction to ", "intro to ", "basics of ", "advanced ",
                "fundamentals of ", "learning ", "study ", "notes on ",
                "flashcards on ", "quiz on ",
            ]
            for prefix in prefixes_to_remove:
                if normalized.startswith(prefix):
                    normalized = normalized[len(prefix):]
            normalized = re.sub(r'[^\w\s]', '', normalized)
            normalized = ' '.join(normalized.split())
            return normalized

        def topics_are_similar(topic1, topic2):
            norm1 = normalize_topic(topic1)
            norm2 = normalize_topic(topic2)

            if norm1 == norm2:
                return True
            if norm1 in norm2 or norm2 in norm1:
                return True

            words1 = set(norm1.split())
            words2 = set(norm2.split())
            if not words1 or not words2:
                return False

            intersection = words1 & words2
            union = words1 | words2
            similarity = len(intersection) / len(union)
            return similarity > 0.6

        concepts_to_create = {}

        for title, source_type, category in raw_concepts:
            normalized = normalize_topic(title)
            found_match = False
            for existing_key in list(concepts_to_create.keys()):
                existing_title = concepts_to_create[existing_key][0]
                if topics_are_similar(title, existing_title):
                    existing_sources = concepts_to_create[existing_key][1]
                    if source_type not in existing_sources:
                        existing_sources.append(source_type)
                    if len(title) < len(existing_title):
                        concepts_to_create[existing_key] = (title, existing_sources, category)
                    found_match = True
                    break
            if not found_match:
                concepts_to_create[normalized] = (title, [source_type], category)

        logger.info(f"Deduplicated {len(raw_concepts)} raw concepts to {len(concepts_to_create)} unique concepts")
        logger.info(f"Creating {len(concepts_to_create)} concepts with AI classification")

        from concept_classification_agent import get_concept_agent
        agent = get_concept_agent(
            unified_ai.groq_client,
            unified_ai.groq_model,
            unified_ai.gemini_module,
            unified_ai.gemini_model,
            unified_ai.gemini_api_key,
        )

        concept_data = list(concepts_to_create.values())
        concept_names = [data[0] for data in concept_data]
        logger.info(f"Batch classifying {len(concept_names)} concepts in ONE AI request...")

        try:
            classifications = agent.ai_classify_batch_concepts(concept_names)
        except Exception as e:
            logger.error(f"Batch classification failed: {e}, falling back to basic classification")
            classifications = [
                {
                    "category": data[2],
                    "subcategory": "",
                    "advanced_topic": data[0],
                    "related_concepts": [],
                    "prerequisites": [],
                }
                for data in concept_data
            ]

        concept_map = {}
        connections_to_create = []

        for i, (display_title, source_types, category) in enumerate(concept_data):
            classification = classifications[i] if i < len(classifications) else {}

            ai_category_raw = classification.get("category", category)
            subcategory = classification.get("subcategory", "")
            advanced_topic = classification.get("advanced_topic", display_title)

            if ai_category_raw and ai_category_raw not in ["General", "Academic", "Discussion"]:
                ai_category = ai_category_raw
                logger.info(f"'{display_title}' -> '{ai_category}' (from AI category)")
            elif subcategory and subcategory not in ["General", "Academic", "Discussion"]:
                ai_category = subcategory
                logger.info(f"'{display_title}' -> '{subcategory}' (from AI subcategory)")
            else:
                ai_category = category
                logger.info(f"'{display_title}' -> '{category}' (fallback)")

            source_str = ", ".join(source_types)
            description = f"{advanced_topic}"
            if subcategory and subcategory != advanced_topic and subcategory != ai_category:
                description = f"{subcategory}: {advanced_topic}"
            description += f" (from {source_str})"

            related = classification.get("related_concepts", [])
            prereqs = classification.get("prerequisites", [])

            node = models.ConceptNode(
                user_id=user.id,
                concept_name=display_title,
                description=description,
                category=ai_category,
                importance_score=0.7,
            )
            db.add(node)
            db.flush()
            concept_map[display_title] = node.id

            connections_to_create.append((node.id, display_title, related, prereqs))

        connections_created = 0

        all_nodes = db.query(models.ConceptNode).filter(
            models.ConceptNode.user_id == user.id
        ).all()

        for node_id, concept_name, related_concepts, prerequisites in connections_to_create:
            current_node = next((n for n in all_nodes if n.id == node_id), None)
            if not current_node:
                continue

            for related_name in related_concepts[:3]:
                for other_node in all_nodes:
                    if other_node.id != node_id and related_name.lower() in other_node.concept_name.lower():
                        conn = models.ConceptConnection(
                            user_id=user.id,
                            source_concept_id=node_id,
                            target_concept_id=other_node.id,
                            connection_type="related",
                            strength=0.7,
                            ai_generated=True,
                        )
                        db.add(conn)
                        connections_created += 1
                        break

            for prereq_name in prerequisites[:2]:
                for other_node in all_nodes:
                    if other_node.id != node_id and prereq_name.lower() in other_node.concept_name.lower():
                        conn = models.ConceptConnection(
                            user_id=user.id,
                            source_concept_id=other_node.id,
                            target_concept_id=node_id,
                            connection_type="prerequisite",
                            strength=0.8,
                            ai_generated=True,
                        )
                        db.add(conn)
                        connections_created += 1
                        break

            same_category_nodes = [n for n in all_nodes if n.id != node_id and n.category == current_node.category][:2]
            existing_targets = {
                row.target_concept_id for row in db.query(models.ConceptConnection.target_concept_id).filter(
                    models.ConceptConnection.user_id == user.id,
                    models.ConceptConnection.source_concept_id == node_id,
                    models.ConceptConnection.target_concept_id.in_([n.id for n in same_category_nodes]),
                ).all()
            } if same_category_nodes else set()

            for other_node in same_category_nodes:
                if other_node.id not in existing_targets:
                    conn = models.ConceptConnection(
                        user_id=user.id,
                        source_concept_id=node_id,
                        target_concept_id=other_node.id,
                        connection_type="similar",
                        strength=0.5,
                        ai_generated=True,
                    )
                    db.add(conn)
                    connections_created += 1

        db.commit()
        logger.info(f"Successfully created {len(concept_map)} concepts and {connections_created} connections")

        return {
            "status": "success",
            "concepts_created": len(concept_map),
            "connections_created": connections_created,
        }

    except Exception as e:
        logger.error(f"Error generating concept web: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/add_concept_node")
async def add_concept_node(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        concept_name = payload.get("concept_name")
        description = payload.get("description", "")

        from concept_classification_agent import get_concept_agent
        agent = get_concept_agent(
            unified_ai.groq_client,
            unified_ai.groq_model,
            unified_ai.gemini_module,
            unified_ai.gemini_model,
            unified_ai.gemini_api_key,
        )

        classification = agent.ai_classify_single_concept(concept_name, description)

        base_category = classification.get("category", payload.get("category", "General"))
        subcategory = classification.get("subcategory", "")
        advanced_topic = classification.get("advanced_topic", concept_name)

        if subcategory and subcategory not in ["General", base_category]:
            category = subcategory
        else:
            category = base_category

        enhanced_description = description
        if not enhanced_description:
            if subcategory and subcategory != category:
                enhanced_description = f"{subcategory}: {advanced_topic}"
            else:
                enhanced_description = f"{advanced_topic}"

        node = models.ConceptNode(
            user_id=user.id,
            concept_name=concept_name,
            description=enhanced_description,
            category=category,
        )
        db.add(node)
        db.flush()

        related_concepts = classification.get("related_concepts", [])
        prerequisites = classification.get("prerequisites", [])

        for related_name in related_concepts[:3]:
            related_node = db.query(models.ConceptNode).filter(
                models.ConceptNode.user_id == user.id,
                models.ConceptNode.concept_name.ilike(f"%{related_name}%"),
            ).first()

            if related_node:
                conn = models.ConceptConnection(
                    user_id=user.id,
                    source_concept_id=node.id,
                    target_concept_id=related_node.id,
                    connection_type="related",
                    strength=0.7,
                    ai_generated=True,
                )
                db.add(conn)

        for prereq_name in prerequisites[:2]:
            prereq_node = db.query(models.ConceptNode).filter(
                models.ConceptNode.user_id == user.id,
                models.ConceptNode.concept_name.ilike(f"%{prereq_name}%"),
            ).first()

            if prereq_node:
                conn = models.ConceptConnection(
                    user_id=user.id,
                    source_concept_id=prereq_node.id,
                    target_concept_id=node.id,
                    connection_type="prerequisite",
                    strength=0.8,
                    ai_generated=True,
                )
                db.add(conn)

        db.commit()
        db.refresh(node)

        return {
            "status": "success",
            "node_id": node.id,
            "concept_name": node.concept_name,
            "classification": {
                "category": category,
                "subcategory": subcategory,
                "advanced_topic": advanced_topic,
                "difficulty": classification.get("difficulty_level", "intermediate"),
            },
            "connections_created": len(related_concepts) + len(prerequisites),
        }
    except Exception as e:
        logger.error(f"Error adding concept node: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/update_node_position")
async def update_node_position(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        node_id = payload.get("node_id")
        x = payload.get("x")
        y = payload.get("y")

        node = db.query(models.ConceptNode).filter(
            models.ConceptNode.id == node_id,
            models.ConceptNode.user_id == current_user.id,
        ).first()

        if node:
            node.position_x = x
            node.position_y = y
            db.commit()
            return {"status": "success"}

        return {"status": "not_found"}
    except Exception as e:
        logger.error(f"Error updating node position: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/update_concept_mastery")
async def update_concept_mastery(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        node_id = payload.get("node_id")
        mastery_level = payload.get("mastery_level")

        if not isinstance(mastery_level, (int, float)) or isinstance(mastery_level, bool):
            raise HTTPException(status_code=422, detail="mastery_level is required and must be a number")
        if mastery_level < 0 or mastery_level > 1:
            raise HTTPException(status_code=400, detail="Mastery level must be between 0 and 1")

        node = db.query(models.ConceptNode).filter(
            models.ConceptNode.id == node_id,
            models.ConceptNode.user_id == current_user.id,
        ).first()

        if node:
            node.mastery_level = mastery_level
            db.commit()
            return {"status": "success", "mastery_level": mastery_level}

        return {"status": "not_found"}
    except Exception as e:
        logger.error(f"Error updating mastery level: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/generate_concept_notes")
async def generate_concept_notes(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        concept_id = payload.get("concept_id")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        concept = db.query(models.ConceptNode).filter(
            models.ConceptNode.id == concept_id,
            models.ConceptNode.user_id == user.id,
        ).first()

        if not concept:
            raise HTTPException(status_code=404, detail="Concept not found")

        recent_chats = db.query(models.ChatMessage).join(
            models.ChatSession
        ).filter(
            models.ChatSession.user_id == user.id
        ).order_by(models.ChatMessage.timestamp.desc()).limit(10).all()

        chat_context = "\n".join([
            f"Q: {msg.user_message}\nA: {msg.ai_response}"
            for msg in recent_chats
        ])[:2000]

        prompt = f"""Create comprehensive study notes about: {concept.concept_name}

Description: {concept.description}
Category: {concept.category}

Recent learning context:
{chat_context}

Generate detailed notes covering:
1. Key concepts and definitions
2. Important points to remember
3. Examples and applications
4. Common misconceptions

Format as clear, organized study notes."""

        content = await call_ai_async(prompt, max_tokens=1500, temperature=0.7)

        note = models.Note(
            user_id=user.id,
            title=f"Study Notes: {concept.concept_name}",
            content=content,
        )
        db.add(note)
        db.flush()

        concept.notes_count += 1
        concept.mastery_level = min(1.0, concept.mastery_level + 0.1)

        db.commit()

        return {
            "status": "success",
            "note_id": note.id,
            "new_mastery": concept.mastery_level,
            "message": f"Generated notes for {concept.concept_name}",
        }

    except Exception as e:
        logger.error(f"Error generating notes: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/generate_concept_flashcards")
async def generate_concept_flashcards(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        concept_id = payload.get("concept_id")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        concept = db.query(models.ConceptNode).filter(
            models.ConceptNode.id == concept_id,
            models.ConceptNode.user_id == user.id,
        ).first()

        if not concept:
            raise HTTPException(status_code=404, detail="Concept not found")

        recent_chats = db.query(models.ChatMessage).join(
            models.ChatSession
        ).filter(
            models.ChatSession.user_id == user.id
        ).order_by(models.ChatMessage.timestamp.desc()).limit(10).all()

        chat_context = "\n".join([
            f"Q: {msg.user_message}\nA: {msg.ai_response}"
            for msg in recent_chats
        ])[:2000]

        prompt = f"""Create 10 flashcard pairs (question/answer) about: {concept.concept_name}

Description: {concept.description}
Category: {concept.category}

Recent learning context:
{chat_context}

Return ONLY a JSON array with this format:
[
  {{"front": "Question 1", "back": "Answer 1"}},
  {{"front": "Question 2", "back": "Answer 2"}}
]

Make questions clear and answers concise."""

        content = (await call_ai_async(prompt, max_tokens=1500, temperature=0.7)).strip()

        json_match = re.search(r'\[[\s\S]*\]', content)
        if json_match:
            flashcards_data = json.loads(json_match.group())
        else:
            flashcards_data = json.loads(content)

        flashcard_set = models.FlashcardSet(
            user_id=user.id,
            title=f"Flashcards: {concept.concept_name}",
            description=f"AI-generated flashcards for {concept.concept_name}",
        )
        db.add(flashcard_set)
        db.flush()

        for card_data in flashcards_data[:10]:
            flashcard = models.Flashcard(
                set_id=flashcard_set.id,
                question=card_data.get("front", ""),
                answer=card_data.get("back", ""),
            )
            db.add(flashcard)

        concept.flashcards_count += 1
        concept.mastery_level = min(1.0, concept.mastery_level + 0.1)

        db.commit()

        return {
            "status": "success",
            "set_id": flashcard_set.id,
            "new_mastery": concept.mastery_level,
            "message": f"Generated flashcards for {concept.concept_name}",
        }

    except Exception as e:
        logger.error(f"Error generating flashcards: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/generate_concept_quiz")
async def generate_concept_quiz(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        concept_id = payload.get("concept_id")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        concept = db.query(models.ConceptNode).filter(
            models.ConceptNode.id == concept_id,
            models.ConceptNode.user_id == user.id,
        ).first()

        if not concept:
            raise HTTPException(status_code=404, detail="Concept not found")

        recent_chats = db.query(models.ChatMessage).join(
            models.ChatSession
        ).filter(
            models.ChatSession.user_id == user.id
        ).order_by(models.ChatMessage.timestamp.desc()).limit(10).all()

        chat_context = "\n".join([
            f"Q: {msg.user_message}\nA: {msg.ai_response}"
            for msg in recent_chats
        ])[:2000]

        prompt = f"""Create 5 multiple choice questions about: {concept.concept_name}

Description: {concept.description}
Category: {concept.category}

Recent learning context:
{chat_context}

CRITICAL: Each option MUST contain the FULL ANSWER TEXT, not just letter labels like "A", "B", "C", "D".

Return ONLY a JSON array:
[
  {{
    "question": "Question text",
    "options": ["First option with full answer text", "Second option with full answer text", "Third option with full answer text", "Fourth option with full answer text"],
    "correct": 0,
    "explanation": "Why this is correct"
  }}
]"""

        content = (await call_ai_async(prompt, max_tokens=1500, temperature=0.7)).strip()

        json_match = re.search(r'\[[\s\S]*\]', content)
        if json_match:
            questions_data = json.loads(json_match.group())
        else:
            questions_data = json.loads(content)

        quiz = models.SoloQuiz(
            user_id=user.id,
            subject=concept.concept_name,
            difficulty="intermediate",
            question_count=len(questions_data),
            answers=json.dumps(questions_data),
        )
        db.add(quiz)
        db.flush()

        concept.quizzes_count += 1
        concept.mastery_level = min(1.0, concept.mastery_level + 0.1)

        db.commit()

        return {
            "status": "success",
            "quiz_id": quiz.id,
            "questions": questions_data,
            "new_mastery": concept.mastery_level,
            "message": f"Generated quiz for {concept.concept_name}",
        }

    except Exception as e:
        logger.error(f"Error generating quiz: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/delete_concept_node/{node_id}")
async def delete_concept_node(
    node_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        node = db.query(models.ConceptNode).filter(
            models.ConceptNode.id == node_id,
            models.ConceptNode.user_id == current_user.id,
        ).first()
        if not node:
            raise HTTPException(status_code=404, detail="Concept node not found")

        db.query(models.ConceptConnection).filter(
            models.ConceptConnection.user_id == current_user.id,
            (
                (models.ConceptConnection.source_concept_id == node_id)
                | (models.ConceptConnection.target_concept_id == node_id)
            ),
        ).delete()

        db.query(models.ConceptNode).filter(
            models.ConceptNode.id == node_id,
            models.ConceptNode.user_id == current_user.id,
        ).delete()

        db.commit()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error deleting concept node: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/delete_all_concepts")
async def delete_all_concepts(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        db.query(models.ConceptConnection).filter(
            models.ConceptConnection.user_id == user.id
        ).delete()

        db.query(models.ConceptNode).filter(
            models.ConceptNode.user_id == user.id
        ).delete()

        db.commit()
        return {"status": "success", "message": "All concepts deleted"}
    except Exception as e:
        logger.error(f"Error deleting all concepts: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")
