import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from deps import call_ai, call_ai_async, get_db, get_user_by_email, get_user_by_username
from services.topic_utils import is_valid_topic as _is_valid_topic

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents/searchhub", tags=["searchhub"])

SESSION_CONTEXT: Dict[str, List[dict]] = {}
_SESSION_CONTEXT_MAX = 500

class SearchHubRequest(BaseModel):
    user_id: str
    query: str
    session_id: Optional[str] = None
    context: Optional[dict] = None
    use_hs_context: bool = True

class CreateNoteRequest(BaseModel):
    user_id: str
    topic: str
    content: Optional[str] = None
    depth: str = "standard"
    tone: str = "professional"
    use_hs_context: bool = True
    context_doc_ids: list[str] = []

class CreateFlashcardsRequest(BaseModel):
    user_id: str
    topic: str
    count: int = 10
    difficulty: str = "medium"
    content: Optional[str] = None
    use_hs_context: bool = True

class CreateQuestionsRequest(BaseModel):
    user_id: str
    topic: str
    count: int = 10
    difficulty_mix: Optional[dict] = None
    content: Optional[str] = None
    use_hs_context: bool = True

class ExplainRequest(BaseModel):
    user_id: str
    topic: str
    depth: str = "standard"

class ClearContextRequest(BaseModel):
    user_id: str
    session_id: str

def _resolve_user(db: Session, user_id: str):
    if not user_id or user_id.lower() == "guest":
        return None
    return get_user_by_username(db, user_id) or get_user_by_email(db, user_id)

def _dedupe_preserve(items: List[str]) -> List[str]:
    seen = set()
    output = []
    for item in items:
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output

from services.suggestion_engine import (
    extract_topic_from_episode as _extract_topic_from_episode,
    get_chroma_suggestions as _get_chroma_suggestions,
)

_PATH_DIFFICULTY_LEVELS = {"beginner", "intermediate", "advanced"}
_PATH_LENGTH_LEVELS = {"short", "medium", "long"}
_NOTE_DEPTH_LEVELS = {"brief", "standard", "deep"}
_ACTION_REQUIRES_TOPIC = {
    "create_note",
    "create_flashcards",
    "create_questions",
    "create_quiz",
    "create_learning_path",
    "create_knowledge_map",
    "explain",
}

def _extract_count(query: str) -> Optional[int]:
    if not query:
        return None
    m = re.search(r"\b(\d{1,2})\b", query)
    if not m:
        return None
    count = int(m.group(1))
    if 1 <= count <= 50:
        return count
    return None

def _extract_difficulty(query: str) -> Optional[str]:
    q = (query or "").lower()
    if "easy" in q:
        return "easy"
    if "hard" in q:
        return "hard"
    if "medium" in q:
        return "medium"
    return None

def _extract_topic_after_action(query: str) -> str:
    q = (query or "").strip()
    q = re.sub(
        r"^/(flashcards?|notes?|quiz|quizzes|questions?|explain|path|map|roadmap)\s*",
        "",
        q,
        flags=re.IGNORECASE,
    ).strip()
    q = re.sub(
        r"^(create|make|generate|build)\s+",
        "",
        q,
        flags=re.IGNORECASE,
    ).strip()
    q = re.sub(
        r"^(flashcards?|notes?|quiz|quizzes|questions?|learning path|knowledge map|path|map|roadmap|study plan)\s+(on|for|about)\s+",
        "",
        q,
        flags=re.IGNORECASE,
    ).strip()
    return q

def _infer_action(query: str) -> dict:
    text = (query or "").strip()
    lower = text.lower()

    difficulty = _extract_difficulty(lower)
    count = _extract_count(lower)

    if lower in {"help", "/help", "commands"}:
        return {"action": "show_help", "topic": "", "confidence": 0.95}
    if lower in {"hi", "hello", "hey", "yo"}:
        return {"action": "greeting", "topic": "", "confidence": 0.95}
    if "progress" in lower:
        return {"action": "show_progress", "topic": "", "confidence": 0.9}
    if "achievement" in lower:
        return {"action": "show_achievements", "topic": "", "confidence": 0.85}
    if "weak" in lower:
        return {"action": "show_weak_areas", "topic": "", "confidence": 0.85}
    if "review flashcard" in lower:
        return {"action": "review_flashcards", "topic": "", "confidence": 0.9}

    if lower.startswith("/notes") or "create note" in lower or lower.startswith("notes "):
        topic = _extract_topic_after_action(text)
        depth = "standard"
        if "brief" in lower:
            depth = "brief"
        elif "deep" in lower or "detailed" in lower:
            depth = "deep"
        return {
            "action": "create_note",
            "topic": topic,
            "depth": depth,
            "tone": "professional",
            "confidence": 0.88,
        }

    if lower.startswith("/flashcard") or lower.startswith("/flashcards") or "flashcard" in lower:
        return {
            "action": "create_flashcards",
            "topic": _extract_topic_after_action(text),
            "count": count or 10,
            "difficulty": difficulty or "medium",
            "confidence": 0.88,
        }

    if lower.startswith("/quiz") or "create quiz" in lower or "create question" in lower or lower.startswith("/questions"):
        return {
            "action": "create_quiz",
            "topic": _extract_topic_after_action(text),
            "count": count or 10,
            "difficulty": difficulty or "medium",
            "confidence": 0.88,
        }

    if "knowledge map" in lower or "roadmap" in lower or lower.startswith("/map"):
        return {
            "action": "create_knowledge_map",
            "topic": _extract_topic_after_action(text),
            "confidence": 0.84,
        }

    if "learning path" in lower or "study plan" in lower or lower.startswith("/path"):
        topic = _extract_topic_after_action(text)
        path_difficulty = "intermediate"
        if "beginner" in lower:
            path_difficulty = "beginner"
        elif "advanced" in lower:
            path_difficulty = "advanced"
        path_length = "medium"
        if "short" in lower:
            path_length = "short"
        elif "long" in lower:
            path_length = "long"
        return {
            "action": "create_learning_path",
            "topic": topic,
            "difficulty": path_difficulty,
            "length": path_length,
            "confidence": 0.84,
        }

    if lower.startswith("/explain") or lower.startswith("explain "):
        return {
            "action": "explain",
            "topic": _extract_topic_after_action(text),
            "confidence": 0.82,
        }

    return {"action": "search", "topic": text, "confidence": 0.6}

def _build_topic_suggestions(topic: str) -> list[str]:
    clean = (topic or "").strip()
    if not clean:
        return _build_default_command_suggestions()
    return [
        f"/notes {clean}",
        f"/flashcards {clean}",
        f"/quiz {clean}",
        f"/path {clean}",
    ]

def _build_default_command_suggestions() -> list[str]:
    return [
        "/notes photosynthesis",
        "/flashcards cell biology",
        "/quiz calculus derivatives",
        "/path machine learning",
        "/progress",
    ]

def _get_action_command_examples(action: str) -> list[str]:
    mapping = {
        "create_note": ["/notes world history", "/notes photosynthesis deep"],
        "create_flashcards": ["/flashcards osmosis", "/flashcards algebra 15"],
        "create_questions": ["/quiz electrochemistry 10", "/questions trigonometry"],
        "create_quiz": ["/quiz probability", "/quiz thermodynamics hard"],
        "create_learning_path": ["/path data structures", "/path organic chemistry"],
        "create_knowledge_map": ["/map data structures", "/map organic chemistry"],
        "explain": ["/explain black body radiation", "/explain photosynthesis"],
    }
    return mapping.get(action, _build_default_command_suggestions())

def _build_search_ai_response(query: str, topic: str, results: list[dict], suggestions: list[str]) -> str:
    if not results:
        return ""

    lower = (query or "").lower()
    titles = [
        item.get("title") or item.get("name") or item.get("type") or "saved item"
        for item in results[:3]
    ]
    top_text = "\n".join(f"- {title}" for title in titles if title)

    if "weak" in lower or "next study" in lower or "checklist" in lower:
        return (
            "Here is the best next study action from your saved work:\n"
            "1. Start with the top matching note or flashcard set.\n"
            "2. Do one active-recall pass without looking at the answer.\n"
            "3. Turn missed points into 3-5 flashcards or practice questions.\n"
            "4. Re-test the same topic tomorrow.\n\n"
            f"Most relevant items:\n{top_text}"
        )

    suggestion_text = ", ".join(suggestions[:3]) if suggestions else "notes, flashcards, or a quiz"
    return (
        f"I found {len(results)} matching item{'s' if len(results) != 1 else ''} for {topic or 'your search'}.\n"
        f"Start with:\n{top_text}\n\n"
        f"Next actions: {suggestion_text}."
    )

def _get_command_catalog() -> list[dict]:
    return [
        {"command": "/notes <topic>", "description": "Create notes from a topic"},
        {"command": "/flashcards <topic>", "description": "Generate flashcards"},
        {"command": "/quiz <topic>", "description": "Generate practice questions"},
        {"command": "/path <topic>", "description": "Create a learning path"},
        {"command": "/map <topic>", "description": "Create a knowledge map"},
        {"command": "/explain <topic>", "description": "Quick explanation"},
        {"command": "/progress", "description": "Open study insights"},
        {"command": "/help", "description": "Show command help"},
    ]

async def _create_note_with_ai(
    db: Session,
    user: models.User,
    topic: str,
    content: Optional[str],
    depth: str,
    tone: str,
    use_hs_context: bool = True,
    context_doc_ids: list = None,
) -> dict:
    note_title = topic.strip() if topic else "New Note"
    logger.info(
        f"[NOTE ROUTE] create note | topic='{note_title}' user={user.id} "
        f"HS_MODE={'ON  <-- curriculum RAG will run' if use_hs_context else 'OFF <-- no RAG, model-only'}"
    )
    if not content:
        try:
            from graphs.note_graph import get_note_graph
            note_graph_instance = get_note_graph()
            if note_graph_instance:
                content = await note_graph_instance.invoke(
                    user_id=str(user.id),
                    topic=note_title,
                    generation_type="topic",
                    depth=depth or "standard",
                    tone=tone or "professional",
                    use_hs_context=use_hs_context,
                    context_doc_ids=context_doc_ids or [],
                )
        except Exception as e:
            logger.warning(f"Note graph invoke failed: {e}")

        if not content:
            depth_lower = (depth or "standard").lower()
            depth_guidance = {
                "brief": "Keep it concise with key bullets and short sections.",
                "deep": "Go in depth with detailed explanations and examples.",
            }
            prompt = (
                f"Create study notes on: {note_title}\n\n"
                f"Tone: {tone}\n"
                f"{depth_guidance.get(depth_lower, 'Use clear headers, bullets, and examples when helpful.')}\n"
                f"Format with markdown headers and bullet points."
            )
            try:
                content = (await call_ai_async(prompt, max_tokens=2000, temperature=0.7)).strip()
            except Exception:
                content = f"# {note_title}\n\n- Key ideas\n- Definitions\n- Examples"

    new_note = models.Note(user_id=user.id, title=note_title, content=content or "")
    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    try:
        from services.gamification_system import award_points
        award_points(db, user.id, "note_created")
        db.commit()
    except Exception:
        pass

    try:
        from tutor import chroma_store
        if chroma_store.available():
            clean_preview = re.sub(r'<[^>]+>', '', content or "")
            clean_preview = re.sub(r'[#*_\[\]()]', '', clean_preview).strip()
            preview = clean_preview[:200]
            summary = (
                f"Note created: \"{note_title}\". Content: {preview}" if preview
                else f"Note created: \"{note_title}\" (empty note)"
            )
            chroma_store.write_episode(
                user_id=str(user.id),
                summary=summary,
                metadata={
                    "source": "note_activity",
                    "action": "created",
                    "note_id": str(new_note.id),
                    "note_title": note_title[:100],
                },
            )
    except Exception as e:
        logger.warning(f"Chroma write failed on searchhub note create: {e}")

    return {
        "id": new_note.id,
        "uid": new_note.uid,
        "title": new_note.title,
        "content": new_note.content,
    }

@router.post("")
async def searchhub_agent(request: SearchHubRequest, db: Session = Depends(get_db)):
    query = (request.query or "").strip()
    user = _resolve_user(db, request.user_id)

    if request.session_id:
        if len(SESSION_CONTEXT) >= _SESSION_CONTEXT_MAX and request.session_id not in SESSION_CONTEXT:
            oldest = next(iter(SESSION_CONTEXT))
            SESSION_CONTEXT.pop(oldest, None)
        history = SESSION_CONTEXT.setdefault(request.session_id, [])
        history.append({"query": query})
        if len(history) > 20:
            history.pop(0)

    intent = None
    try:
        from graphs.searchhub_graph import get_searchhub_graph
        graph = get_searchhub_graph()
        if graph:
            intent = await graph.invoke(
                user_id=request.user_id,
                query=query,
                context=request.context,
            )
    except Exception as e:
        logger.warning(f"SearchHub graph invoke failed: {e}")

    if not intent:
        intent = _infer_action(query)
    action = intent.get("action")
    topic = intent.get("topic") or query
    intent_difficulty = intent.get("difficulty")
    difficulty = intent_difficulty if intent_difficulty in ("easy", "medium", "hard") else None
    count = intent.get("count") or _extract_count(query) or 10
    difficulty = difficulty or _extract_difficulty(query) or "medium"
    path_difficulty = intent_difficulty if intent_difficulty in _PATH_DIFFICULTY_LEVELS else None
    path_length = intent.get("length") if intent.get("length") in _PATH_LENGTH_LEVELS else None
    note_depth = intent.get("depth") if intent.get("depth") in _NOTE_DEPTH_LEVELS else None
    note_tone = intent.get("tone") or "professional"

    if action in {"create_note", "create_flashcards", "create_questions", "create_quiz"} and not user:
        return {
            "ai_response": "Please log in to create content. Once you are logged in, I can create notes, flashcards, and quizzes for you.",
            "search_results": [],
            "suggestions": ["log in", "create an account"],
            "metadata": {
                "action": "auth_required",
                "confidence": intent.get("confidence", 0.4),
                "topic": topic,
                "response_type": "chat",
                "chatbot_message": "Log in required to create content.",
            },
        }

    if action in _ACTION_REQUIRES_TOPIC and not (topic and topic.strip()):
        return {
            "ai_response": "Tell me the topic you want to work on so I can continue.",
            "search_results": [],
            "suggestions": _get_action_command_examples(action),
            "metadata": {
                "action": "need_topic",
                "confidence": intent.get("confidence", 0.5),
                "topic": topic,
                "response_type": "chat",
                "chatbot_message": "Which topic should I use?",
            },
        }

    if action == "greeting":
        return {
            "ai_response": "Hi! What would you like to learn or create today?",
            "search_results": [],
            "suggestions": [
                "/flashcards biology",
                "/notes world history",
                "/explain photosynthesis",
                "/quiz calculus",
            ],
            "metadata": {
                "action": "greeting",
                "confidence": intent.get("confidence", 0.95),
                "response_type": "chat",
                "chatbot_message": "Hi! How can I help?",
            },
        }

    if action == "show_help":
        return {
            "ai_response": (
                "SearchHub works like a command terminal. Try:\n"
                "/flashcards <topic> â€” create flashcards\n"
                "/notes <topic> â€” create notes\n"
                "/quiz <topic> â€” start a quiz\n"
                "/path <topic> â€” generate a learning path\n"
                "/map <topic> â€” create a knowledge map\n"
                "/progress â€” open study insights\n"
                "Type /help anytime to see the full command list."
            ),
            "search_results": [],
            "suggestions": [
                "/flashcards biology",
                "/notes world history",
                "/quiz calculus",
                "/path machine learning",
                "/map organic chemistry",
                "/progress",
                "/weak",
            ],
            "metadata": {
                "action": "show_help",
                "confidence": intent.get("confidence", 0.9),
                "response_type": "chat",
                "chatbot_message": "Here are a few things I can do.",
            },
        }

    if action == "show_progress":
        return {
            "navigate_to": "/study-insights",
            "metadata": {
                "action": "show_progress",
                "confidence": intent.get("confidence", 0.85),
                "response_type": "navigation",
                "chatbot_message": "Opening your study insights.",
            },
        }

    if action == "show_achievements":
        return {
            "navigate_to": "/study-insights?tab=achievements",
            "metadata": {
                "action": "show_achievements",
                "confidence": intent.get("confidence", 0.85),
                "response_type": "navigation",
                "chatbot_message": "Showing your achievements.",
            },
        }

    if action == "show_weak_areas":
        return {
            "navigate_to": "/study-insights?tab=weak",
            "metadata": {
                "action": "show_weak_areas",
                "confidence": intent.get("confidence", 0.85),
                "response_type": "navigation",
                "chatbot_message": "Loading your weak areas.",
            },
        }

    if action == "review_flashcards":
        return {
            "navigate_to": "/flashcards",
            "metadata": {
                "action": "review_flashcards",
                "confidence": intent.get("confidence", 0.85),
                "response_type": "navigation",
                "chatbot_message": "Opening flashcards.",
            },
        }

    if action == "create_learning_path":
        return {
            "navigate_to": "/learning-paths",
            "navigate_params": {
                "autoGenerate": True,
                "topic": topic,
                "difficulty": path_difficulty or "intermediate",
                "length": path_length or "medium",
            },
            "metadata": {
                "action": "create_learning_path",
                "confidence": intent.get("confidence", 0.8),
                "response_type": "navigation",
                "chatbot_message": f"Generating a learning path for {topic}.",
            },
        }

    if action == "create_knowledge_map":
        return {
            "navigate_to": "/knowledge-map",
            "navigate_params": {
                "autoCreateTopic": topic,
            },
            "metadata": {
                "action": "create_knowledge_map",
                "confidence": intent.get("confidence", 0.8),
                "response_type": "navigation",
                "chatbot_message": f"Creating a knowledge map for {topic}.",
            },
        }

    if action == "show_learning_paths":
        return {
            "navigate_to": "/learning-paths",
            "metadata": {
                "action": "show_learning_paths",
                "confidence": intent.get("confidence", 0.8),
                "response_type": "navigation",
                "chatbot_message": "Showing your learning paths.",
            },
        }

    if action == "start_chat":
        return {
            "navigate_to": "/ai-chat",
            "navigate_params": {"initialMessage": topic},
            "metadata": {
                "action": "start_chat",
                "confidence": intent.get("confidence", 0.75),
                "response_type": "navigation",
                "chatbot_message": "Opening chat.",
            },
        }

    if action == "explain":
        prompt = (
            f"Explain the topic '{topic}' clearly and concisely. "
            f"Use simple language and 2-4 short paragraphs."
        )
        try:
            explanation = (await call_ai_async(prompt, max_tokens=400, temperature=0.6)).strip()
        except Exception:
            explanation = f"Here is a concise overview of {topic}. I can also create flashcards or notes if you'd like."

        return {
            "ai_response": explanation,
            "search_results": [],
            "suggestions": _build_topic_suggestions(topic),
            "metadata": {
                "action": "explain",
                "confidence": intent.get("confidence", 0.75),
                "topic": topic,
                "response_type": "chat",
                "chatbot_message": "Here is a quick explanation.",
            },
        }

    if action == "create_note":
        note_data = await _create_note_with_ai(
            db,
            user,
            topic,
            None,
            note_depth or "standard",
            note_tone or "professional",
            use_hs_context=request.use_hs_context,
            context_doc_ids=[],
        )
        return {
            "success": True,
            "content_id": note_data["id"],
            "content_title": note_data["title"],
            "navigate_to": f"/notes/editor/{note_data['id']}",
            "metadata": {
                "action": "create_note",
                "confidence": intent.get("confidence", 0.85),
                "topic": topic,
                "response_type": "navigation",
                "chatbot_message": f"Created notes on {note_data['title']}.",
            },
        }

    if action == "create_flashcards":
        from routes import flashcards as flashcard_routes

        generation_type = "topic"
        response = await flashcard_routes.generate_flashcards_endpoint(
            user_id=request.user_id,
            topic=topic,
            generation_type=generation_type,
            card_count=count,
            difficulty=difficulty,
            use_hs_context=request.use_hs_context,
            context_doc_ids="",
            db=db,
        )
        set_id = response.get("set_id")
        set_title = response.get("set_title") or topic
        return {
            "success": True,
            "content_id": set_id,
            "content_title": set_title,
            "navigate_to": f"/flashcards?set_id={set_id}" if set_id else "/flashcards",
            "metadata": {
                "action": "create_flashcards",
                "confidence": intent.get("confidence", 0.85),
                "topic": topic,
                "response_type": "navigation",
                "chatbot_message": f"Created flashcards on {set_title}.",
            },
        }

    if action in {"create_questions", "create_quiz"}:
        from routes import questions as question_routes

        payload = {
            "user_id": request.user_id,
            "topic": topic,
            "question_count": count,
            "difficulty_mix": {"easy": 3, "medium": 5, "hard": 2},
            "question_types": ["multiple_choice"],
            "title": f"Practice: {topic[:50]}",
            "use_hs_context": request.use_hs_context,
        }
        response = await question_routes.generate_practice_questions(payload=payload, db=db)
        content_id = response.get("question_set_id") or response.get("id")
        navigate_to = f"/question-bank?set_id={content_id}" if content_id else "/question-bank"

        return {
            "success": True,
            "content_id": content_id,
            "content_title": response.get("title") or topic,
            "navigate_to": navigate_to,
            "metadata": {
                "action": action,
                "confidence": intent.get("confidence", 0.85),
                "topic": topic,
                "response_type": "navigation",
                "chatbot_message": f"Created questions on {topic}.",
            },
        }

    if user:
        from routes import search as search_routes

        filters = request.context or {}
        content_types = filters.get("content_types", "all")
        sort_by = filters.get("sort_by", "relevance")
        date_from = filters.get("date_from")
        date_to = filters.get("date_to")

        search_result = await search_routes.search_content(
            user_id=request.user_id,
            query=query,
            content_types=content_types,
            sort_by=sort_by,
            date_from=date_from,
            date_to=date_to,
            db=db,
        )

        suggestions = _get_chroma_suggestions(str(user.id), query, limit=6)
        if not suggestions:
            suggestions = search_result.get("related_searches", []) or _build_topic_suggestions(topic)

        results = search_result.get("results", [])
        ai_response = _build_search_ai_response(query, topic, results, suggestions)
        if not results:
            try:
                ai_response = await call_ai_async(
                    f"Provide a short, friendly description of '{topic}' in 2-3 sentences.",
                    max_tokens=200,
                    temperature=0.6,
                ).strip()
            except Exception:
                ai_response = (
                    f"I can help you learn about {topic}. "
                    "Ask me to create notes, flashcards, or a quick quiz."
                )

        return {
            "search_results": results,
            "ai_response": ai_response,
            "suggestions": suggestions,
            "metadata": {
                "action": "search",
                "confidence": intent.get("confidence", 0.6),
                "topic": topic,
                "response_type": "search",
            },
        }

    ai_response = "I can help explain a topic or create study materials. Log in to search your saved content."
    return {
        "ai_response": ai_response,
        "search_results": [],
        "suggestions": _build_topic_suggestions(topic),
        "metadata": {
            "action": "search",
            "confidence": intent.get("confidence", 0.4),
            "topic": topic,
            "response_type": "chat",
        },
    }

@router.post("/create-note")
async def create_note_endpoint(request: CreateNoteRequest, db: Session = Depends(get_db)):
    user = _resolve_user(db, request.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    note_data = await _create_note_with_ai(
        db=db,
        user=user,
        topic=request.topic,
        content=request.content,
        depth=request.depth,
        tone=request.tone,
        use_hs_context=request.use_hs_context,
        context_doc_ids=request.context_doc_ids or [],
    )

    return {
        "success": True,
        "content_id": note_data["id"],
        "content_title": note_data["title"],
        "navigate_to": f"/notes/editor/{note_data['id']}",
    }

@router.post("/create-flashcards")
async def create_flashcards_endpoint(request: CreateFlashcardsRequest, db: Session = Depends(get_db)):
    user = _resolve_user(db, request.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from routes import flashcards as flashcard_routes

    generation_type = "chat_history" if request.content else "topic"
    response = await flashcard_routes.generate_flashcards_endpoint(
        user_id=request.user_id,
        topic=request.topic,
        generation_type=generation_type,
        content=request.content,
        card_count=request.count,
        difficulty=request.difficulty,
        use_hs_context=request.use_hs_context,
        context_doc_ids="",
        db=db,
    )

    set_id = response.get("set_id")
    set_title = response.get("set_title") or request.topic

    return {
        "success": True,
        "content_id": set_id,
        "content_title": set_title,
        "navigate_to": f"/flashcards?set_id={set_id}" if set_id else "/flashcards",
        "flashcards": response.get("flashcards", []),
    }

@router.post("/create-questions")
async def create_questions_endpoint(request: CreateQuestionsRequest, db: Session = Depends(get_db)):
    user = _resolve_user(db, request.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from routes import questions as question_routes

    payload = {
        "user_id": request.user_id,
        "topic": request.topic,
        "question_count": request.count,
        "difficulty_mix": request.difficulty_mix or {"easy": 3, "medium": 5, "hard": 2},
        "question_types": ["multiple_choice"],
        "title": f"Practice: {request.topic[:50]}",
        "use_hs_context": request.use_hs_context,
    }
    response = await question_routes.generate_practice_questions(payload=payload, db=db)
    content_id = response.get("question_set_id") or response.get("id")

    return {
        "success": True,
        "content_id": content_id,
        "content_title": response.get("title") or request.topic,
        "navigate_to": f"/question-bank?set_id={content_id}" if content_id else "/question-bank",
        "questions": response.get("questions", []),
    }

@router.post("/explain")
async def explain_endpoint(request: ExplainRequest, db: Session = Depends(get_db)):
    topic = request.topic.strip()
    prompt = (
        f"Explain the topic '{topic}' clearly and concisely. "
        f"Use simple language and 2-4 short paragraphs."
    )
    try:
        explanation = (await call_ai_async(prompt, max_tokens=400, temperature=0.6)).strip()
    except Exception:
        explanation = f"Here is a concise overview of {topic}. I can also create flashcards or notes if you'd like."

    return {
        "success": True,
        "topic": topic,
        "explanation": explanation,
    }

@router.get("/suggestions")
async def suggestions_endpoint(
    query: str = Query("", min_length=0),
    user_id: str = Query("guest"),
    db: Session = Depends(get_db),
):
    user = _resolve_user(db, user_id)
    suggestions: List[str] = []

    if user:
        suggestions.extend(_get_chroma_suggestions(str(user.id), query, limit=8))

    if query:
        suggestions.extend(_build_topic_suggestions(query))

    if not suggestions:
        suggestions = _build_default_command_suggestions()

    return {"success": True, "suggestions": _dedupe_preserve(suggestions)[:8]}

@router.get("/actions")
async def actions_endpoint():
    return {
        "success": True,
        "actions": [
            {"action": "create_note", "label": "Create Note"},
            {"action": "create_flashcards", "label": "Create Flashcards"},
            {"action": "create_questions", "label": "Create Questions"},
            {"action": "create_quiz", "label": "Create Quiz"},
            {"action": "create_learning_path", "label": "Create Learning Path"},
            {"action": "create_knowledge_map", "label": "Create Knowledge Map"},
            {"action": "show_progress", "label": "Show Progress"},
            {"action": "show_weak_areas", "label": "Show Weak Areas"},
            {"action": "review_flashcards", "label": "Review Flashcards"},
            {"action": "start_chat", "label": "Start Chat"},
        ],
        "commands": _get_command_catalog(),
    }

@router.get("/commands")
async def commands_endpoint():
    return {
        "success": True,
        "commands": _get_command_catalog(),
    }

@router.post("/clear-context")
async def clear_context_endpoint(request: ClearContextRequest):
    if request.session_id in SESSION_CONTEXT:
        SESSION_CONTEXT.pop(request.session_id, None)
    return {"success": True, "session_id": request.session_id}
