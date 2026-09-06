import asyncio
import logging
import hashlib
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
import requests
from sqlalchemy import case
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from deps import get_current_user, get_db, unified_ai
from services.youtube_api_service import youtube_service
from services.learning_path_lessons import generate_lesson, valid_lesson, LEVELS
from types import SimpleNamespace
from activity_context import clear_activity_context, set_activity_context
from services.learning_path_activities import (
    _build_flashcards, _build_completion_quiz, _build_question_bank_quiz, _build_chat_prompt,
)
from graphs.learningpath_graph import (
    create_learningpath_graph,
    get_learningpath_graph,
    _default_outline,
    _normalize_content_plan,
    _normalize_core_sections,
    _normalize_node_title,
    _normalize_topic_prompt,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/learning-paths", tags=["learning-paths"])

VALID_PATH_DIFFICULTIES = {"beginner", "intermediate", "advanced"}
VALID_PATH_LENGTHS = {"short", "medium", "long"}

class GeneratePathRequest(BaseModel):
    topicPrompt: str
    difficulty: Optional[str] = "intermediate"
    length: Optional[str] = "medium"
    goals: Optional[list] = []

class StartNodeRequest(BaseModel):
    pass

class CompleteNodeRequest(BaseModel):
    evidence: Optional[Dict[str, Any]] = {}

class UpdateProgressRequest(BaseModel):
    activity_type: str
    completed: bool
    metadata: Optional[Dict[str, Any]] = {}

class GenerateContentRequest(BaseModel):
    activity_type: str
    count: Optional[int] = None

class SaveNodeNoteRequest(BaseModel):
    content: str

class UpdateDifficultyViewRequest(BaseModel):
    difficulty_view: str

class RateResourceRequest(BaseModel):
    resource_id: str
    rating: int

class MarkResourceCompletedRequest(BaseModel):
    resource_id: str
    time_spent_minutes: int

class UpdateTimeSpentRequest(BaseModel):
    minutes: int

class ExportToNotesRequest(BaseModel):
    node_id: str
    include_resources: bool = True
    include_summary: bool = True

class ExportToFlashcardsRequest(BaseModel):
    node_id: str
    concept_focus: Optional[List[str]] = None

class ExportToCalendarRequest(BaseModel):
    node_id: str
    scheduled_date: str
    duration_minutes: int

class AddResourceRequest(BaseModel):
    url: str
    title: Optional[str] = None
    description: Optional[str] = None
    resource_type: Optional[str] = "article"

class SearchResourcesRequest(BaseModel):
    query: str
    provider: Optional[str] = "auto"
    include_youtube: bool = True
    max_results: int = 8

def _ensure_graph():
    graph = get_learningpath_graph()
    if not graph:
        graph = create_learningpath_graph(unified_ai, SessionLocal)
    return graph

def _generate_outline(user_id: int, topic: str, difficulty: str, length: str, goals: list[str]) -> dict:
    graph = _ensure_graph()
    topic = _normalize_topic_prompt(topic)
    difficulty = (difficulty or "intermediate").strip().lower()
    length = (length or "medium").strip().lower()
    if difficulty not in VALID_PATH_DIFFICULTIES:
        difficulty = "intermediate"
    if length not in VALID_PATH_LENGTHS:
        length = "medium"
    if graph:
        return graph.invoke(
            user_id=str(user_id),
            topic=topic,
            difficulty=difficulty,
            length=length,
            goals=goals,
        )
    return _default_outline(topic, difficulty, length, goals)

def _resource_id(url: str) -> str:
    normalized = (url or "").strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]

def _resource_kind(url: str, fallback: str = "article") -> str:
    host = urlparse(url).netloc.lower()
    if "youtube.com" in host or "youtu.be" in host:
        return "video"
    if any(host.endswith(domain) or domain in host for domain in ("github.com", "stackoverflow.com", "docs.", "developer.")):
        return "reference"
    return fallback or "article"

def _clean_resource(resource: Dict[str, Any]) -> Dict[str, Any]:
    url = str(resource.get("url") or "").strip()
    title = str(resource.get("title") or url or "Resource").strip()
    return {
        "id": resource.get("id") or _resource_id(url or title),
        "title": title[:180],
        "url": url,
        "description": str(resource.get("description") or "").strip()[:500],
        "type": resource.get("type") or _resource_kind(url),
        "source": resource.get("source") or urlparse(url).netloc.replace("www.", ""),
        "thumbnail": resource.get("thumbnail"),
        "duration_seconds": resource.get("duration_seconds"),
        "estimated_minutes": resource.get("estimated_minutes"),
        "added_at": resource.get("added_at") or datetime.now(timezone.utc).isoformat(),
    }

def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)) or default)
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(value, maximum))

def _load_test_fallback_enabled(user: models.User) -> bool:
    identifiers = {
        item.strip().lower()
        for item in os.getenv("AI_LOAD_TEST_FALLBACK_USERS", "").split(",")
        if item.strip()
    }
    return any(
        value and str(value).strip().lower() in identifiers
        for value in (getattr(user, "id", None), getattr(user, "username", None), getattr(user, "email", None))
    )

def _extract_meta(html: str, pattern: str) -> Optional[str]:
    match = re.search(pattern, html, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    return re.sub(r"\s+", " ", match.group(1)).strip()

def _fetch_url_metadata(url: str) -> Dict[str, Any]:
    try:
        response = requests.get(
            url,
            timeout=8,
            headers={"User-Agent": "BrainwaveAI/1.0 resource-preview"},
            allow_redirects=True,
        )
        response.raise_for_status()
        html = response.text[:200000]
        title = (
            _extract_meta(html, r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']')
            or _extract_meta(html, r"<title[^>]*>(.*?)</title>")
        )
        description = (
            _extract_meta(html, r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']')
            or _extract_meta(html, r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']')
        )
        image = _extract_meta(html, r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']')
        return {"title": title, "description": description, "thumbnail": image}
    except Exception as exc:
        logger.info("Resource metadata fetch failed for %s: %s", url, exc)
        return {}

def _youtube_search(query: str, max_results: int) -> List[Dict[str, Any]]:
    api = getattr(youtube_service, "youtube_api", None)
    if not api:
        return []
    request = api.search().list(
        part="snippet",
        q=query,
        type="video",
        maxResults=max(1, min(max_results, 10)),
        safeSearch="moderate",
        relevanceLanguage="en",
    )
    response = request.execute()
    resources = []
    for item in response.get("items", []):
        video_id = item.get("id", {}).get("videoId")
        snippet = item.get("snippet", {})
        if not video_id:
            continue
        resources.append(_clean_resource({
            "id": f"yt_{video_id}",
            "title": snippet.get("title"),
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "description": snippet.get("description"),
            "type": "video",
            "source": snippet.get("channelTitle") or "YouTube",
            "thumbnail": (snippet.get("thumbnails") or {}).get("high", {}).get("url"),
        }))
    return resources

def _brave_search(query: str, max_results: int) -> List[Dict[str, Any]]:
    key = os.getenv("BRAVE_SEARCH_API_KEY")
    if not key:
        return []
    response = requests.get(
        "https://api.search.brave.com/res/v1/web/search",
        params={"q": query, "count": max(1, min(max_results, 10)), "safesearch": "moderate"},
        headers={"Accept": "application/json", "X-Subscription-Token": key},
        timeout=10,
    )
    response.raise_for_status()
    results = response.json().get("web", {}).get("results", [])
    return [
        _clean_resource({
            "title": item.get("title"),
            "url": item.get("url"),
            "description": item.get("description"),
            "type": _resource_kind(item.get("url") or ""),
            "source": urlparse(item.get("url") or "").netloc.replace("www.", ""),
        })
        for item in results
        if item.get("url")
    ]

def _tavily_search(query: str, max_results: int) -> List[Dict[str, Any]]:
    key = os.getenv("TAVILY_API_KEY")
    if not key:
        return []
    response = requests.post(
        "https://api.tavily.com/search",
        json={
            "query": query,
            "search_depth": "basic",
            "max_results": max(1, min(max_results, 10)),
            "include_answer": False,
        },
        headers={"Authorization": f"Bearer {key}"},
        timeout=12,
    )
    response.raise_for_status()
    results = response.json().get("results", [])
    return [
        _clean_resource({
            "title": item.get("title"),
            "url": item.get("url"),
            "description": item.get("content"),
            "type": _resource_kind(item.get("url") or ""),
            "source": urlparse(item.get("url") or "").netloc.replace("www.", ""),
        })
        for item in results
        if item.get("url")
    ]

def _dedupe_resources(resources: List[Dict[str, Any]], max_results: int) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    seen = set()
    for resource in resources:
        cleaned = _clean_resource(resource)
        key = cleaned.get("url") or cleaned.get("id")
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(cleaned)
        if len(deduped) >= max_results:
            break
    return deduped

def _search_learning_resources(
    query: str,
    *,
    provider: str = "auto",
    include_youtube: bool = True,
    max_results: int = 8,
) -> tuple[List[Dict[str, Any]], List[str]]:
    max_results = max(1, min(max_results or 8, 12))
    provider = (provider or "auto").lower()
    resources: List[Dict[str, Any]] = []
    errors: List[str] = []

    if include_youtube:
        try:
            resources.extend(_youtube_search(query, max(2, min(3, max_results))))
        except Exception as exc:
            logger.warning("YouTube learning resource search failed: %s", exc)
            errors.append("youtube")

    providers = ["tavily", "brave"] if provider == "auto" else [provider]
    for provider_name in providers:
        if len(resources) >= max_results:
            break
        try:
            if provider_name == "tavily":
                resources.extend(_tavily_search(query, max_results - len(resources)))
            elif provider_name == "brave":
                resources.extend(_brave_search(query, max_results - len(resources)))
        except Exception as exc:
            logger.warning("%s learning resource search failed: %s", provider_name, exc)
            errors.append(provider_name)

    return _dedupe_resources(resources, max_results), errors

def _merge_resources(*groups: Any, max_results: int = 8) -> List[Dict[str, Any]]:
    resources: List[Dict[str, Any]] = []
    for group in groups:
        if isinstance(group, list):
            resources.extend([item for item in group if isinstance(item, dict)])
    return _dedupe_resources(resources, max_results)

def _auto_discover_node_resources(topic: str, node_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    if os.getenv("ENABLE_LEARNING_PATH_AUTO_RESOURCES", "true").lower() in {"0", "false", "no"}:
        return []

    title = str(node_data.get("title") or "").strip()
    if not title:
        return []

    max_results = _env_int("LEARNING_PATH_AUTO_RESOURCE_MAX_RESULTS", 5, 1, 8)
    provider = os.getenv("LEARNING_PATH_AUTO_RESOURCE_PROVIDER", "auto")
    objectives = node_data.get("objectives") if isinstance(node_data.get("objectives"), list) else []
    keywords = node_data.get("keywords") if isinstance(node_data.get("keywords"), list) else []
    focus = " ".join(str(item) for item in (keywords[:4] or objectives[:2]))
    query = f"{title} {topic} {focus} tutorial guide video documentation".strip()

    resources, errors = _search_learning_resources(
        query,
        provider=provider,
        include_youtube=True,
        max_results=max_results,
    )
    for resource in resources:
        resource["auto_discovered"] = True
        resource["search_query"] = query
    if errors:
        logger.info("Auto resource discovery had provider errors for %s: %s", title, errors)
    return resources

def _serialize_path(path, db: Session, user_id: int, include_nodes: bool) -> dict:
    progress = (
        db.query(models.LearningPathProgress)
        .filter(
            models.LearningPathProgress.path_id == path.id,
            models.LearningPathProgress.user_id == user_id,
        )
        .first()
    )

    progress_payload = {
        "current_node_index": getattr(progress, "current_node_index", 0) if progress else 0,
        "total_xp_earned": getattr(progress, "total_xp_earned", 0) if progress else 0,
        "completion_percentage": getattr(progress, "completion_percentage", 0) if progress else 0,
    }

    payload = {
        "id": path.id,
        "title": path.title,
        "topic_prompt": path.topic_prompt,
        "description": path.description,
        "difficulty": path.difficulty,
        "status": path.status,
        "total_nodes": path.total_nodes,
        "completed_nodes": path.completed_nodes,
        "estimated_hours": path.estimated_hours,
        "created_at": path.created_at.isoformat() if path.created_at else None,
        "updated_at": path.updated_at.isoformat() if path.updated_at else None,
        "progress": progress_payload,
    }

    if include_nodes:
        nodes = (
            db.query(models.LearningPathNode)
            .filter(models.LearningPathNode.path_id == path.id)
            .order_by(models.LearningPathNode.order_index)
            .all()
        )
        payload["nodes"] = [_serialize_node(node, db, user_id) for node in nodes]

    return payload

def _serialize_node(node, db: Session, user_id: int) -> dict:
    node_progress = (
        db.query(models.LearningNodeProgress)
        .filter(
            models.LearningNodeProgress.node_id == node.id,
            models.LearningNodeProgress.user_id == user_id,
        )
        .first()
    )

    progress_payload = {
        "status": node_progress.status if node_progress else "locked",
        "progress_pct": node_progress.progress_pct if node_progress else 0,
        "xp_earned": node_progress.xp_earned if node_progress else 0,
        "evidence": node_progress.evidence if node_progress else {},
        "difficulty_view": node_progress.difficulty_view if node_progress else "intermediate",
        "resource_ratings": node_progress.resource_ratings if node_progress else {},
        "resources_completed": node_progress.resources_completed if node_progress else [],
        "time_spent_minutes": node_progress.time_spent_minutes if node_progress else 0,
    }

    topic = _normalize_topic_prompt(getattr(node.path, "topic_prompt", "") or getattr(node.path, "title", ""))
    path_difficulty = (getattr(node.path, "difficulty", "") or "intermediate").strip().lower()
    if path_difficulty not in VALID_PATH_DIFFICULTIES:
        path_difficulty = "intermediate"
    objectives = node.objectives if isinstance(node.objectives, list) else []
    prerequisites = node.prerequisites if isinstance(node.prerequisites, list) else []
    keywords = node.keywords if isinstance(node.keywords, list) else []
    applications = node.real_world_applications if isinstance(node.real_world_applications, list) else []
    node_title = _normalize_node_title(node.title, topic)
    core_sections = _normalize_core_sections(
        node.core_sections,
        node_title=node_title,
        topic=topic,
        objectives=objectives,
        prerequisites=prerequisites,
        keywords=keywords,
        applications=applications,
        difficulty=path_difficulty,
    )
    content_plan = _normalize_content_plan(
        node.content_plan,
        node_title=node_title,
        difficulty=path_difficulty,
        length="medium",
    )

    return {
        "id": node.id,
        "order_index": node.order_index,
        "title": node_title,
        "description": node.description,
        "tags": node.tags,
        "keywords": node.keywords,
        "bloom_level": node.bloom_level,
        "cognitive_load": node.cognitive_load,
        "industry_relevance": node.industry_relevance,
        "introduction": node.introduction,
        "core_sections": core_sections,
        "summary": node.summary,
        "connection_map": node.connection_map,
        "real_world_applications": node.real_world_applications,
        "beginner_content": node.beginner_content,
        "intermediate_content": node.intermediate_content,
        "advanced_content": node.advanced_content,
        "video_resources": node.video_resources,
        "interactive_diagrams": node.interactive_diagrams,
        "audio_narration": node.audio_narration,
        "infographics": node.infographics,
        "code_playgrounds": node.code_playgrounds,
        "objectives": node.objectives,
        "learning_outcomes": node.learning_outcomes,
        "prerequisites": node.prerequisites,
        "prerequisite_nodes": node.prerequisite_nodes,
        "resources": node.resources,
        "primary_resources": node.primary_resources,
        "supplementary_resources": node.supplementary_resources,
        "practice_resources": node.practice_resources,
        "estimated_minutes": node.estimated_minutes,
        "content_plan": content_plan,
        "concept_mapping": node.concept_mapping,
        "scenarios": node.scenarios,
        "hands_on_projects": node.hands_on_projects,
        "prerequisite_quiz": node.prerequisite_quiz,
        "unlock_rule": node.unlock_rule,
        "reward": node.reward,
        "progress": progress_payload,
    }

def _build_notes(node, topic: str) -> str:
    sections = _normalize_core_sections(
        node.core_sections,
        node_title=_normalize_node_title(node.title, topic),
        topic=topic,
        objectives=node.objectives if isinstance(node.objectives, list) else [],
        prerequisites=node.prerequisites if isinstance(node.prerequisites, list) else [],
        keywords=node.keywords if isinstance(node.keywords, list) else [],
        applications=node.real_world_applications if isinstance(node.real_world_applications, list) else [],
        difficulty=getattr(node.path, "difficulty", "intermediate"),
    )
    lines = [f"# {node.title}", "", f"Topic: {topic}", "", node.introduction or "", ""]
    for section in sections:
        title = section.get("title", "Section")
        content = section.get("content", "")
        example = section.get("example")
        lines.append(f"## {title}")
        lines.append(content)
        if example:
            lines.append(f"Example: {example}")
        lines.append("")

    if node.summary:
        summary_items = node.summary if isinstance(node.summary, list) else [str(node.summary)]
        lines.append("## Key Takeaways")
        for item in summary_items:
            lines.append(f"- {item}")
        lines.append("")

    if node.real_world_applications:
        applications = (
            node.real_world_applications
            if isinstance(node.real_world_applications, list)
            else [str(node.real_world_applications)]
        )
        lines.append("## Real-World Applications")
        for item in applications:
            lines.append(f"- {item}")

    return "\n".join(lines).strip()

def _write_chroma_path(user_id: int, path, nodes: list):
    try:
        from tutor import chroma_store
        if not chroma_store.available():
            return
        sample_titles = "; ".join([n.title for n in nodes[:5]])
        summary = (
            f"Learning path created: \"{path.title}\" on \"{path.topic_prompt}\" with {len(nodes)} chapters. "
            f"Sample chapters: {sample_titles}" if sample_titles else f"Learning path created: \"{path.title}\"."
        )
        chroma_store.write_episode(
            user_id=str(user_id),
            summary=summary,
            metadata={
                "source": "learning_path_created",
                "action": "created",
                "path_id": str(path.id),
                "path_title": path.title[:120],
                "topic": path.topic_prompt[:200],
                "node_count": str(len(nodes)),
                "difficulty": path.difficulty,
            },
        )
    except Exception as e:
        logger.warning(f"Chroma write failed on learning path create: {e}")

def _write_chroma_node_complete(user_id: int, path, node, completion_pct: float):
    try:
        from tutor import chroma_store
        if not chroma_store.available():
            return
        summary = (
            f"Learning path progress: completed chapter \"{node.title}\" "
            f"in \"{path.title}\" ({int(completion_pct)}% complete)."
        )
        chroma_store.write_episode(
            user_id=str(user_id),
            summary=summary,
            metadata={
                "source": "learning_path_progress",
                "action": "node_completed",
                "path_id": str(path.id),
                "path_title": path.title[:120],
                "node_id": str(node.id),
                "node_title": node.title[:120],
                "topic": path.topic_prompt[:200],
                "completion_pct": str(int(completion_pct)),
            },
        )
    except Exception as e:
        logger.warning(f"Chroma write failed on learning path node complete: {e}")

@router.post("/generate")
async def generate_learning_path(
    request: GeneratePathRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.topicPrompt:
        raise HTTPException(status_code=400, detail="Topic prompt is required")

    topic_prompt = _normalize_topic_prompt(request.topicPrompt)
    difficulty = (request.difficulty or "intermediate").strip().lower()
    length = (request.length or "medium").strip().lower()
    if difficulty not in VALID_PATH_DIFFICULTIES:
        difficulty = "intermediate"
    if length not in VALID_PATH_LENGTHS:
        length = "medium"
    goals = request.goals or []

    load_test_fallback = _load_test_fallback_enabled(user)
    outline = (
        _default_outline(topic_prompt, difficulty, length, goals)
        if load_test_fallback
        else await asyncio.to_thread(_generate_outline, user.id, topic_prompt, difficulty, length, goals)
    )
    nodes_data = outline.get("nodes", []) if isinstance(outline, dict) else []

    if not nodes_data:
        raise HTTPException(status_code=500, detail="Failed to generate learning path")

    if load_test_fallback:
        now_iso = datetime.now(timezone.utc).isoformat()
        synthetic_nodes = []
        for idx, node_data in enumerate(nodes_data):
            node_title = _normalize_node_title(node_data.get("title", f"Chapter {idx + 1}"), topic_prompt)
            synthetic_nodes.append({
                "id": idx + 1,
                "path_id": "load-test",
                "order_index": idx,
                "title": node_title,
                "description": node_data.get("description", ""),
                "objectives": node_data.get("objectives") or [],
                "summary": node_data.get("summary") or "",
                "estimated_minutes": node_data.get("estimated_minutes", 35),
                "status": "unlocked" if idx == 0 else "locked",
                "progress_pct": 0,
            })
        return {
            "success": True,
            "path_id": "load-test",
            "path": {
                "id": "load-test",
                "user_id": user.id,
                "title": outline.get("title") or topic_prompt,
                "topic_prompt": topic_prompt,
                "description": outline.get("description") or f"A structured path to master {topic_prompt}.",
                "difficulty": difficulty,
                "status": "active",
                "total_nodes": len(synthetic_nodes),
                "completed_nodes": 0,
                "estimated_hours": outline.get("estimated_hours") or 0.0,
                "completion_percentage": 0.0,
                "created_at": now_iso,
                "updated_at": now_iso,
                "nodes": synthetic_nodes,
            },
            "load_test_fallback": True,
            "persisted": False,
        }

    try:
        path = models.LearningPath(
            user_id=user.id,
            title=outline.get("title") or topic_prompt,
            topic_prompt=topic_prompt,
            description=outline.get("description") or f"A structured path to master {topic_prompt}.",
            difficulty=difficulty,
            status="active",
            total_nodes=len(nodes_data),
            completed_nodes=0,
            estimated_hours=outline.get("estimated_hours") or 0.0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(path)
        db.commit()
        db.refresh(path)

        auto_resource_node_limit = 0 if load_test_fallback else _env_int("LEARNING_PATH_AUTO_RESOURCE_NODE_LIMIT", 12, 0, 50)
        for idx, node_data in enumerate(nodes_data):
            node_title = _normalize_node_title(node_data.get("title", f"Chapter {idx + 1}"), topic_prompt)
            node_objectives = node_data.get("objectives")
            node_prerequisites = node_data.get("prerequisites")
            node_keywords = node_data.get("keywords")
            node_applications = node_data.get("real_world_applications")
            core_sections = _normalize_core_sections(
                node_data.get("core_sections"),
                node_title=node_title,
                topic=topic_prompt,
                objectives=node_objectives if isinstance(node_objectives, list) else [],
                prerequisites=node_prerequisites if isinstance(node_prerequisites, list) else [],
                keywords=node_keywords if isinstance(node_keywords, list) else [],
                applications=node_applications if isinstance(node_applications, list) else [],
                difficulty=difficulty,
            )
            auto_resources = (
                await asyncio.to_thread(_auto_discover_node_resources, topic_prompt, node_data)
                if idx < max(0, auto_resource_node_limit)
                else []
            )
            primary_resources = _merge_resources(
                node_data.get("primary_resources"),
                node_data.get("resources"),
                auto_resources,
                max_results=10,
            )
            video_resources = _merge_resources(
                node_data.get("video_resources"),
                [resource for resource in auto_resources if resource.get("type") == "video"],
                max_results=6,
            )
            node = models.LearningPathNode(
                path_id=path.id,
                order_index=idx,
                title=node_title,
                description=node_data.get("description", ""),
                tags=node_data.get("tags"),
                keywords=node_data.get("keywords"),
                bloom_level=node_data.get("bloom_level"),
                cognitive_load=node_data.get("cognitive_load"),
                industry_relevance=node_data.get("industry_relevance"),
                introduction=node_data.get("introduction"),
                core_sections=core_sections,
                summary=node_data.get("summary"),
                connection_map=node_data.get("connection_map"),
                real_world_applications=node_data.get("real_world_applications"),
                beginner_content=node_data.get("beginner_content"),
                intermediate_content=node_data.get("intermediate_content"),
                advanced_content=node_data.get("advanced_content"),
                video_resources=video_resources,
                interactive_diagrams=node_data.get("interactive_diagrams"),
                audio_narration=node_data.get("audio_narration"),
                infographics=node_data.get("infographics"),
                code_playgrounds=node_data.get("code_playgrounds"),
                objectives=node_data.get("objectives"),
                learning_outcomes=node_data.get("learning_outcomes"),
                prerequisites=node_data.get("prerequisites"),
                prerequisite_nodes=node_data.get("prerequisite_nodes"),
                resources=node_data.get("resources"),
                primary_resources=primary_resources,
                supplementary_resources=node_data.get("supplementary_resources"),
                practice_resources=node_data.get("practice_resources"),
                estimated_minutes=node_data.get("estimated_minutes", 35),
                content_plan=node_data.get("content_plan"),
                concept_mapping=node_data.get("concept_mapping"),
                scenarios=node_data.get("scenarios"),
                hands_on_projects=node_data.get("hands_on_projects"),
                prerequisite_quiz=node_data.get("prerequisite_quiz"),
                unlock_rule=node_data.get("unlock_rule"),
                reward=node_data.get("reward"),
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(node)
        db.commit()

        nodes = (
            db.query(models.LearningPathNode)
            .filter(models.LearningPathNode.path_id == path.id)
            .order_by(models.LearningPathNode.order_index)
            .all()
        )

        for idx, node in enumerate(nodes):
            status = "unlocked" if idx == 0 else "locked"
            node_progress = models.LearningNodeProgress(
                node_id=node.id,
                user_id=user.id,
                status=status,
                progress_pct=0,
                xp_earned=0,
                evidence={},
                started_at=None,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(node_progress)

        path_progress = models.LearningPathProgress(
            path_id=path.id,
            user_id=user.id,
            current_node_index=0,
            total_xp_earned=0,
            completion_percentage=0.0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(path_progress)
        db.commit()

        _write_chroma_path(user.id, path, nodes)

        return {
            "success": True,
            "path_id": path.id,
            "path": _serialize_path(path, db, user.id, include_nodes=True),
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error generating learning path: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("")
async def get_learning_paths(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    paths = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.user_id == user.id)
        .order_by(models.LearningPath.updated_at.desc())
        .all()
    )
    return {"paths": [_serialize_path(path, db, user.id, include_nodes=False) for path in paths]}

@router.get("/{path_id}")
async def get_learning_path(
    path_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    path.last_accessed = datetime.now(timezone.utc)
    db.commit()

    return {"path": _serialize_path(path, db, user.id, include_nodes=True)}

@router.get("/{path_id}/nodes")
async def get_path_nodes(
    path_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    nodes_data = []
    for node in sorted(path.nodes, key=lambda n: n.order_index):
        node_progress = (
            db.query(models.LearningNodeProgress)
            .filter(
                models.LearningNodeProgress.node_id == node.id,
                models.LearningNodeProgress.user_id == user.id,
            )
            .first()
        )
        nodes_data.append(
            {
                "id": node.id,
                "order_index": node.order_index,
                "title": node.title,
                "description": node.description,
                "objectives": node.objectives,
                "prerequisites": node.prerequisites,
                "resources": node.resources,
                "estimated_minutes": node.estimated_minutes,
                "content_plan": node.content_plan,
                "unlock_rule": node.unlock_rule,
                "reward": node.reward,
                "progress": {
                    "status": node_progress.status if node_progress else "locked",
                    "progress_pct": node_progress.progress_pct if node_progress else 0,
                    "xp_earned": node_progress.xp_earned if node_progress else 0,
                    "evidence": node_progress.evidence if node_progress else {},
                },
            }
        )

    return {"nodes": nodes_data}

@router.post("/{path_id}/nodes/{node_id}/start")
async def start_node(
    path_id: str,
    node_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node_progress = (
        db.query(models.LearningNodeProgress)
        .filter(
            models.LearningNodeProgress.node_id == node_id,
            models.LearningNodeProgress.user_id == user.id,
        )
        .first()
    )
    if not node_progress:
        raise HTTPException(status_code=404, detail="Node progress not found")

    if node_progress.status == "locked":
        raise HTTPException(status_code=400, detail="Node is locked")

    if node_progress.status != "completed":
        node_progress.status = "in_progress"
        node_progress.started_at = node_progress.started_at or datetime.now(timezone.utc)
        node_progress.updated_at = datetime.now(timezone.utc)
        db.commit()

    return {"success": True, "status": node_progress.status}

@router.post("/{path_id}/nodes/{node_id}/completion-quiz")
async def get_completion_quiz(
    path_id: str,
    node_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node = (
        db.query(models.LearningPathNode)
        .filter(models.LearningPathNode.id == node_id, models.LearningPathNode.path_id == path_id)
        .first()
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    lesson_node, difficulty = await _activity_lesson_node(node, path, user, db)
    questions = _build_completion_quiz(lesson_node, path.topic_prompt, 10, difficulty)
    return {"questions": questions}

@router.post("/{path_id}/nodes/{node_id}/complete")
async def complete_node(
    path_id: str,
    node_id: str,
    request: CompleteNodeRequest = Body(...),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quiz_score = request.evidence.get("quiz_score") if request.evidence else None
    if quiz_score is None:
        raise HTTPException(status_code=400, detail="Quiz completion required. Please take the completion quiz first.")
    if quiz_score < 75:
        raise HTTPException(
            status_code=400,
            detail=f"Quiz score of {quiz_score}% is below the required 75%. Please review the material and try again.",
        )

    node_progress = (
        db.query(models.LearningNodeProgress)
        .filter(
            models.LearningNodeProgress.node_id == node_id,
            models.LearningNodeProgress.user_id == user.id,
        )
        .first()
    )
    if not node_progress:
        raise HTTPException(status_code=404, detail="Node progress not found")

    node = db.query(models.LearningPathNode).filter(models.LearningPathNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    path = db.query(models.LearningPath).filter(
        models.LearningPath.id == path_id,
        models.LearningPath.user_id == user.id,
    ).first()
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    if node_progress.status == "completed":
        return {
            "success": True,
            "status": node_progress.status,
            "xp_earned": 0,
            "completion_percentage": path.progress.completion_percentage if path.progress else 0,
        }

    # Atomic conditional update guards against two concurrent requests (double
    # click, client retry) both passing the status check above and double
    # awarding XP for the same node.
    claimed = db.query(models.LearningNodeProgress).filter(
        models.LearningNodeProgress.id == node_progress.id,
        models.LearningNodeProgress.status != "completed",
    ).update({
        models.LearningNodeProgress.status: "completed",
        models.LearningNodeProgress.progress_pct: 100,
        models.LearningNodeProgress.evidence: request.evidence or {},
        models.LearningNodeProgress.completed_at: datetime.now(timezone.utc),
        models.LearningNodeProgress.updated_at: datetime.now(timezone.utc),
    })
    if not claimed:
        db.rollback()
        db.refresh(node_progress)
        return {
            "success": True,
            "status": node_progress.status,
            "xp_earned": 0,
            "completion_percentage": path.progress.completion_percentage if path.progress else 0,
        }
    db.refresh(node_progress)

    db.query(models.LearningPath).filter(models.LearningPath.id == path.id).update({
        models.LearningPath.completed_nodes: case(
            (
                models.LearningPath.completed_nodes + 1 > models.LearningPath.total_nodes,
                models.LearningPath.total_nodes,
            ),
            else_=models.LearningPath.completed_nodes + 1,
        ),
        models.LearningPath.updated_at: datetime.now(timezone.utc),
    }, synchronize_session=False)
    db.refresh(path)

    path_progress = (
        db.query(models.LearningPathProgress)
        .filter(
            models.LearningPathProgress.path_id == path.id,
            models.LearningPathProgress.user_id == user.id,
        )
        .first()
    )
    if not path_progress:
        path_progress = models.LearningPathProgress(
            path_id=path.id,
            user_id=user.id,
            current_node_index=0,
            total_xp_earned=0,
            completion_percentage=0.0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(path_progress)

    path_progress.completion_percentage = (
        (path.completed_nodes / path.total_nodes) * 100 if path.total_nodes else 0.0
    )
    completion_percentage = path_progress.completion_percentage
    reward_xp = (node.reward or {}).get("xp", 50)
    path_progress.total_xp_earned = (path_progress.total_xp_earned or 0) + reward_xp
    path_progress.current_node_index = min(path.total_nodes - 1, node.order_index + 1)
    path_progress.updated_at = datetime.now(timezone.utc)

    next_node = (
        db.query(models.LearningPathNode)
        .filter(
            models.LearningPathNode.path_id == path.id,
            models.LearningPathNode.order_index == node.order_index + 1,
        )
        .first()
    )
    if next_node:
        next_progress = (
            db.query(models.LearningNodeProgress)
            .filter(
                models.LearningNodeProgress.node_id == next_node.id,
                models.LearningNodeProgress.user_id == user.id,
            )
            .first()
        )
        if next_progress and next_progress.status == "locked":
            next_progress.status = "unlocked"
            next_progress.updated_at = datetime.now(timezone.utc)

    db.commit()

    gamification_award = None
    try:
        from services.gamification_system import award_points

        gamification_award = award_points(
            db,
            user.id,
            "learning_path_node",
            {
                "xp": reward_xp,
                "path_id": path.id,
                "path_title": path.title,
                "node_id": node.id,
                "node_title": node.title,
                "quiz_score": quiz_score,
                "completion_percentage": completion_percentage,
            },
        )
    except Exception as exc:
        db.rollback()
        logger.warning(
            "Learning path global gamification award failed: user_id=%s path_id=%s node_id=%s error=%s",
            user.id,
            path.id,
            node.id,
            exc,
        )

    _write_chroma_node_complete(user.id, path, node, completion_percentage)

    return {
        "success": True,
        "status": node_progress.status,
        "xp_earned": reward_xp,
        "global_xp": gamification_award,
        "completion_percentage": completion_percentage,
    }

@router.post("/{path_id}/nodes/{node_id}/evaluate")
async def evaluate_node(
    path_id: str,
    node_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node = db.query(models.LearningPathNode).filter(models.LearningPathNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    node_progress = (
        db.query(models.LearningNodeProgress)
        .filter(
            models.LearningNodeProgress.node_id == node_id,
            models.LearningNodeProgress.user_id == user.id,
        )
        .first()
    )
    if not node_progress:
        raise HTTPException(status_code=404, detail="Node progress not found")

    evidence = dict(node_progress.evidence or {})
    missing = []
    if node.content_plan:
        for activity in node.content_plan:
            activity_type = activity.get("type")
            if not evidence.get(activity_type, {}).get("completed"):
                missing.append(activity_type)

    return {"ready": len(missing) == 0, "missing": missing}

@router.post("/{path_id}/nodes/{node_id}/progress")
async def update_node_progress(
    path_id: str,
    node_id: str,
    request: UpdateProgressRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node_progress = (
        db.query(models.LearningNodeProgress)
        .filter(
            models.LearningNodeProgress.node_id == node_id,
            models.LearningNodeProgress.user_id == user.id,
        )
        .first()
    )
    if not node_progress:
        raise HTTPException(status_code=404, detail="Node progress not found")

    evidence = dict(node_progress.evidence or {})
    evidence[request.activity_type] = {
        "completed": request.completed,
        "metadata": request.metadata,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    node_progress.evidence = evidence

    node = db.query(models.LearningPathNode).filter(models.LearningPathNode.id == node_id).first()
    if node and node.content_plan:
        total_activities = len(node.content_plan)
        completed_activities = sum(
            1
            for a in node.content_plan
            if evidence.get(a.get("type"), {}).get("completed")
        )
        if total_activities:
            node_progress.progress_pct = int((completed_activities / total_activities) * 100)

    db.commit()

    return {
        "success": True,
        "progress_pct": node_progress.progress_pct,
        "evidence": evidence,
    }

@router.get("/{path_id}/progress")
async def get_path_progress(
    path_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    progress = (
        db.query(models.LearningPathProgress)
        .filter(
            models.LearningPathProgress.path_id == path_id,
            models.LearningPathProgress.user_id == user.id,
        )
        .first()
    )
    if not progress:
        raise HTTPException(status_code=404, detail="Progress not found")

    return {
        "current_node_index": progress.current_node_index,
        "total_xp_earned": progress.total_xp_earned,
        "completion_percentage": progress.completion_percentage,
        "created_at": progress.created_at.isoformat() if progress.created_at else None,
        "updated_at": progress.updated_at.isoformat() if progress.updated_at else None,
    }

@router.delete("/{path_id}")
async def delete_learning_path(
    path_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    db.delete(path)
    db.commit()

    return {"success": True, "message": "Path deleted"}

@router.post("/{path_id}/nodes/{node_id}/generate-content")
async def generate_node_content(
    path_id: str,
    node_id: str,
    request: GenerateContentRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node = (
        db.query(models.LearningPathNode)
        .filter(models.LearningPathNode.id == node_id, models.LearningPathNode.path_id == path_id)
        .first()
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    activity_type = request.activity_type
    count = request.count or 6
    try:
        count = int(count)
    except (TypeError, ValueError):
        count = 6

    if activity_type == "notes":
        return {"content": _build_notes(node, path.topic_prompt)}
    lesson_node, difficulty = await _activity_lesson_node(node, path, user, db)
    if activity_type == "flashcards":
        return {"flashcards": _build_flashcards(lesson_node, path.topic_prompt, count, difficulty)}
    if activity_type == "quiz":
        return {"questions": _build_question_bank_quiz(lesson_node, path.topic_prompt, count, difficulty)}
    if activity_type == "chat":
        return {"prompt": _build_chat_prompt(lesson_node, path.topic_prompt)}

    raise HTTPException(status_code=400, detail="Unsupported activity type")

@router.get("/{path_id}/nodes/{node_id}/note")
async def get_node_note(
    path_id: str,
    node_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = (
        db.query(models.LearningNodeNote)
        .filter(models.LearningNodeNote.node_id == node_id, models.LearningNodeNote.user_id == user.id)
        .first()
    )

    if not note:
        return {"content": "", "exists": False}

    return {
        "content": note.content,
        "exists": True,
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
    }

@router.post("/{path_id}/nodes/{node_id}/note")
async def save_node_note(
    path_id: str,
    node_id: str,
    request: SaveNodeNoteRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node = (
        db.query(models.LearningPathNode)
        .filter(models.LearningPathNode.id == node_id, models.LearningPathNode.path_id == path_id)
        .first()
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    note = (
        db.query(models.LearningNodeNote)
        .filter(models.LearningNodeNote.node_id == node_id, models.LearningNodeNote.user_id == user.id)
        .first()
    )

    if note:
        note.content = request.content
        note.updated_at = datetime.now(timezone.utc)
    else:
        note = models.LearningNodeNote(
            node_id=node_id,
            user_id=user.id,
            content=request.content,
        )
        db.add(note)

    db.commit()

    return {
        "success": True,
        "message": "Note saved successfully",
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
    }

async def _ensure_node_lesson(node, path, difficulty, db):
    if difficulty not in LEVELS:
        raise HTTPException(status_code=422, detail="Choose beginner, intermediate, or advanced")
    field = f"{difficulty}_content"
    cached = getattr(node, field, None)
    if valid_lesson(cached, difficulty):
        return cached
    activity_token = set_activity_context({
        "user_id": str(path.user_id), "tool_name": "learning_path_ai", "action": "lesson",
        "endpoint": f"/api/learning-paths/{path.id}/nodes/{node.id}/difficulty-view", "method": "POST",
    })
    try:
        lesson = await asyncio.to_thread(generate_lesson, unified_ai, node, path, difficulty)
    except Exception:
        logger.exception("Could not prepare learning node lesson")
        raise HTTPException(status_code=503, detail="Could not prepare this lesson. Please retry.")
    finally:
        clear_activity_context(activity_token)
    setattr(node, field, lesson)
    db.commit()
    return lesson


async def _activity_lesson_node(node, path, user, db):
    progress = db.query(models.LearningNodeProgress).filter(
        models.LearningNodeProgress.node_id == node.id,
        models.LearningNodeProgress.user_id == user.id,
    ).first()
    difficulty = (progress.difficulty_view if progress else None) or path.difficulty or "intermediate"
    lesson = await _ensure_node_lesson(node, path, difficulty, db)
    return SimpleNamespace(id=node.id, title=node.title, core_sections=lesson['core_sections'],
                           summary=lesson.get('summary', [])), difficulty


@router.post("/{path_id}/nodes/{node_id}/difficulty-view")
async def update_difficulty_view(
    path_id: str,
    node_id: str,
    request: UpdateDifficultyViewRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    path = db.query(models.LearningPath).filter(
        models.LearningPath.id == path_id, models.LearningPath.user_id == user.id,
    ).first()
    node = db.query(models.LearningPathNode).filter(
        models.LearningPathNode.id == node_id, models.LearningPathNode.path_id == path_id,
    ).first()
    if not path or not node:
        raise HTTPException(status_code=404, detail="Learning node not found")
    progress = db.query(models.LearningNodeProgress).filter(
        models.LearningNodeProgress.node_id == node_id,
        models.LearningNodeProgress.user_id == user.id,
    ).first()
    if not progress:
        raise HTTPException(status_code=404, detail="Node progress not found")
    lesson = await _ensure_node_lesson(node, path, request.difficulty_view, db)
    progress.difficulty_view = request.difficulty_view
    db.commit()
    return {"success": True, "difficulty_view": request.difficulty_view, "lesson": lesson}

@router.post("/{path_id}/nodes/{node_id}/resources/add")
async def add_node_resource(
    path_id: str,
    node_id: str,
    request: AddResourceRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    url = (request.url or "").strip()
    if not url or not re.match(r"^https?://", url):
        raise HTTPException(status_code=400, detail="A valid http(s) URL is required")

    node = (
        db.query(models.LearningPathNode)
        .filter(models.LearningPathNode.id == node_id, models.LearningPathNode.path_id == path_id)
        .first()
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    metadata: Dict[str, Any] = {}
    video_id = youtube_service.extract_video_id(url)
    if video_id:
        video_meta = await youtube_service._get_video_metadata(video_id)
        metadata = {
            "title": video_meta.get("title"),
            "description": video_meta.get("description"),
            "thumbnail": video_meta.get("thumbnail"),
            "duration_seconds": video_meta.get("duration"),
            "source": video_meta.get("author") or "YouTube",
            "type": "video",
        }
    elif not request.title or not request.description:
        metadata = _fetch_url_metadata(url)

    resource = _clean_resource({
        "url": url,
        "title": request.title or metadata.get("title"),
        "description": request.description or metadata.get("description"),
        "type": metadata.get("type") or request.resource_type or _resource_kind(url),
        "source": metadata.get("source") or urlparse(url).netloc.replace("www.", ""),
        "thumbnail": metadata.get("thumbnail"),
        "duration_seconds": metadata.get("duration_seconds"),
    })

    resources = node.supplementary_resources or []
    if not isinstance(resources, list):
        resources = []
    resources = [item for item in resources if item.get("id") != resource["id"] and item.get("url") != url]
    resources.insert(0, resource)
    node.supplementary_resources = resources
    node.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"success": True, "resource": resource, "resources": resources}

@router.post("/{path_id}/nodes/{node_id}/resources/search")
async def search_node_resources(
    path_id: str,
    node_id: str,
    request: SearchResourcesRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = (request.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query is required")

    node = (
        db.query(models.LearningPathNode)
        .filter(models.LearningPathNode.id == node_id, models.LearningPathNode.path_id == path_id)
        .first()
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    max_results = max(1, min(request.max_results or 8, 12))
    deduped, errors = _search_learning_resources(
        query,
        provider=request.provider or "auto",
        include_youtube=request.include_youtube,
        max_results=max_results,
    )

    configured = {
        "youtube": bool(getattr(youtube_service, "youtube_api", None)),
        "brave": bool(os.getenv("BRAVE_SEARCH_API_KEY")),
        "tavily": bool(os.getenv("TAVILY_API_KEY")),
    }

    return {
        "success": True,
        "query": query,
        "resources": deduped,
        "configured": configured,
        "errors": errors,
    }

@router.post("/{path_id}/nodes/{node_id}/resources/{resource_id}/rate")
async def rate_resource(
    path_id: str,
    node_id: str,
    resource_id: str,
    request: RateResourceRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node_progress = (
        db.query(models.LearningNodeProgress)
        .filter(
            models.LearningNodeProgress.node_id == node_id,
            models.LearningNodeProgress.user_id == user.id,
        )
        .first()
    )
    if not node_progress:
        raise HTTPException(status_code=404, detail="Node progress not found")

    ratings = node_progress.resource_ratings or {}
    ratings[resource_id] = request.rating
    node_progress.resource_ratings = ratings

    db.commit()

    return {"success": True, "resource_id": resource_id, "rating": request.rating}

@router.post("/{path_id}/nodes/{node_id}/resources/{resource_id}/complete")
async def mark_resource_completed(
    path_id: str,
    node_id: str,
    resource_id: str,
    request: MarkResourceCompletedRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node_progress = (
        db.query(models.LearningNodeProgress)
        .filter(
            models.LearningNodeProgress.node_id == node_id,
            models.LearningNodeProgress.user_id == user.id,
        )
        .first()
    )
    if not node_progress:
        raise HTTPException(status_code=404, detail="Node progress not found")

    completed = node_progress.resources_completed or []
    if resource_id not in completed:
        completed.append(resource_id)
    node_progress.resources_completed = completed

    node_progress.time_spent_minutes += request.time_spent_minutes
    db.commit()

    return {
        "success": True,
        "resource_id": resource_id,
        "total_time_spent": node_progress.time_spent_minutes,
    }

@router.post("/{path_id}/nodes/{node_id}/time-spent")
async def update_time_spent(
    path_id: str,
    node_id: str,
    request: UpdateTimeSpentRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node_progress = (
        db.query(models.LearningNodeProgress)
        .filter(
            models.LearningNodeProgress.node_id == node_id,
            models.LearningNodeProgress.user_id == user.id,
        )
        .first()
    )
    if not node_progress:
        raise HTTPException(status_code=404, detail="Node progress not found")

    node_progress.time_spent_minutes += request.minutes
    node_progress.last_accessed = datetime.now(timezone.utc)
    db.commit()

    return {"success": True, "total_time_spent": node_progress.time_spent_minutes}

@router.post("/{path_id}/nodes/{node_id}/export-to-notes")
async def export_to_notes(
    path_id: str,
    node_id: str,
    request: ExportToNotesRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node = (
        db.query(models.LearningPathNode)
        .filter(models.LearningPathNode.id == node_id, models.LearningPathNode.path_id == path_id)
        .first()
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    note_content = f'<h1 style="font-weight: 800; font-size: 28px; margin-bottom: 24px; color: var(--accent);">{node.title}</h1>'
    note_content += f'<p style="color: var(--text-secondary); margin-bottom: 32px; font-style: italic;">From Learning Path: {path.title}</p>'
    note_content += '<hr style="border: none; border-top: 2px solid var(--border); margin: 24px 0;">'

    if node.introduction:
        note_content += '<div style="margin-bottom: 24px; padding: 16px; background: var(--panel); border-left: 4px solid var(--accent); border-radius: 4px;">'
        note_content += '<h4 style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px;">Introduction</h4>'
        note_content += f'<p style="color: var(--text-primary); line-height: 1.7; font-size: 14px;">{node.introduction}</p>'
        note_content += '</div>'

    if node.core_sections:
        for section in node.core_sections:
            note_content += '<div style="margin-bottom: 24px;">'
            note_content += f'<h3 style="font-weight: 700; font-size: 20px; margin-bottom: 12px; color: var(--accent);">{section.get("title", "Section")}</h3>'
            note_content += f'<p style="color: var(--text-primary); line-height: 1.7; font-size: 14px; margin-bottom: 12px;">{section.get("content", "")}</p>'

            if section.get('example'):
                note_content += '<div style="padding: 12px; background: color-mix(in srgb, var(--info) 10%, transparent); border-radius: 4px; border: 1px solid var(--info); margin-top: 12px;">'
                note_content += '<h4 style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--info); text-transform: uppercase; letter-spacing: 0.5px;">Example</h4>'
                note_content += f'<p style="color: var(--text-primary); line-height: 1.7; font-size: 14px;">{section.get("example")}</p>'
                note_content += '</div>'

            note_content += '</div>'

    if request.include_summary and node.summary:
        note_content += '<div style="margin-bottom: 24px;">'
        note_content += '<h3 style="font-weight: 700; font-size: 20px; margin-bottom: 12px; color: var(--accent);">Key Takeaways</h3>'
        note_content += '<ul style="margin-left: 20px; color: var(--text-primary); line-height: 1.8;">'
        for item in node.summary:
            note_content += f'<li style="margin-bottom: 6px; font-size: 14px;">{item}</li>'
        note_content += '</ul></div>'

    if node.real_world_applications:
        note_content += '<div style="margin-bottom: 24px;">'
        note_content += '<h4 style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px;">Real-World Applications</h4>'
        note_content += '<ul style="margin-left: 20px; color: var(--text-primary); line-height: 1.8;">'
        for app in node.real_world_applications:
            note_content += f'<li style="margin-bottom: 6px; font-size: 14px;">{app}</li>'
        note_content += '</ul></div>'

    if request.include_resources and node.primary_resources:
        note_content += '<div style="margin-bottom: 24px; padding: 16px; background: var(--panel); border-radius: 4px;">'
        note_content += '<h4 style="font-weight: 600; font-size: 14px; margin-bottom: 12px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px;">Resources</h4>'
        note_content += '<ul style="margin-left: 20px; color: var(--text-primary); line-height: 1.8;">'
        for resource in node.primary_resources:
            title = resource.get('title', 'Resource')
            url = resource.get('url', '#')
            description = resource.get('description', '')
            note_content += f'<li style="margin-bottom: 8px; font-size: 14px;"><a href="{url}" style="color: var(--accent); text-decoration: none; font-weight: 600;">{title}</a>'
            if description:
                note_content += f' - {description}'
            note_content += '</li>'
        note_content += '</ul></div>'

    note_content += '<hr style="border: none; border-top: 2px solid var(--border); margin: 32px 0;">'
    note_content += '<p style="color: var(--text-secondary); font-size: 12px; text-align: center; margin-top: 24px;">'
    note_content += f'Exported from Learning Path: {path.title}'
    note_content += '</p>'

    return {
        "success": True,
        "note_title": f"{path.title} - {node.title}",
        "note_content": note_content,
        "tags": node.tags or [],
    }

@router.post("/{path_id}/nodes/{node_id}/export-to-flashcards")
async def export_to_flashcards(
    path_id: str,
    node_id: str,
    request: ExportToFlashcardsRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node = (
        db.query(models.LearningPathNode)
        .filter(models.LearningPathNode.id == node_id, models.LearningPathNode.path_id == path_id)
        .first()
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    lesson_node, difficulty = await _activity_lesson_node(node, path, user, db)
    flashcards = _build_flashcards(lesson_node, path.topic_prompt, 15, difficulty)

    return {
        "success": True,
        "deck_title": f"{path.title} - {node.title}",
        "flashcards": flashcards,
        "tags": node.tags or [],
    }

@router.post("/{path_id}/nodes/{node_id}/export-to-calendar")
async def export_to_calendar(
    path_id: str,
    node_id: str,
    request: ExportToCalendarRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    node = (
        db.query(models.LearningPathNode)
        .filter(models.LearningPathNode.id == node_id, models.LearningPathNode.path_id == path_id)
        .first()
    )
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    path = (
        db.query(models.LearningPath)
        .filter(models.LearningPath.id == path_id, models.LearningPath.user_id == user.id)
        .first()
    )
    if not path:
        raise HTTPException(status_code=404, detail="Path not found")

    return {
        "success": True,
        "message": "Calendar export prepared",
        "event": {
            "title": f"Study: {path.title} - {node.title}",
            "scheduled_date": request.scheduled_date,
            "duration_minutes": request.duration_minutes,
        },
    }
