import json
import logging
import random
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

import models
from database import get_db
from deps import call_ai, call_ai_async, get_current_user, get_user_by_username, get_user_by_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["search"])

async def get_expanded_search_terms(query: str) -> list:
    try:
        original_terms = [query]
        words = [w.strip() for w in query.split() if len(w.strip()) > 2]

        ai_prompt = f"""Given the search query "{query}", generate a list of semantically related terms that someone might use to find the same content.

RULES:
1. Include synonyms, alternative names, and related concepts
2. Include historical alternative names if applicable
3. Include common abbreviations or acronyms
4. Keep terms concise (1-4 words each)
5. Return ONLY a JSON array of strings, nothing else
6. Include 5-10 related terms maximum

EXAMPLES:
Query: "Irish Revolution"
["Irish War of Independence", "Easter Rising", "1916 Rising", "Irish independence", "Anglo-Irish War", "Irish rebellion"]

Query: "machine learning"
["ML", "artificial intelligence", "AI", "deep learning", "neural networks", "data science"]

Query: "World War 2"
["WWII", "WW2", "Second World War", "World War II", "1939-1945"]

NOW GENERATE RELATED TERMS FOR: "{query}"
Return ONLY the JSON array:"""

        ai_response = await call_ai_async(ai_prompt, max_tokens=200, temperature=0.3)
        ai_response_clean = ai_response.strip()

        if ai_response_clean.startswith('```'):
            lines = ai_response_clean.split('\n')
            json_lines = []
            in_code_block = False
            for line in lines:
                if line.strip().startswith('```'):
                    in_code_block = not in_code_block
                    continue
                if in_code_block or (not line.strip().startswith('```')):
                    json_lines.append(line)
            ai_response_clean = '\n'.join(json_lines).strip()

        related_terms = json.loads(ai_response_clean)

        if isinstance(related_terms, list):
            all_terms = original_terms + words + related_terms
            seen = set()
            unique_terms = []
            for term in all_terms:
                term_lower = term.lower()
                if term_lower not in seen and len(term.strip()) > 0:
                    seen.add(term_lower)
                    unique_terms.append(term)
            logger.info(f"Expanded '{query}' to {len(unique_terms)} terms: {unique_terms}")
            return unique_terms[:15]

    except Exception as e:
        logger.error(f"Error expanding search terms: {str(e)}")

    fallback_terms = [query] + [w.strip() for w in query.split() if len(w.strip()) > 2]
    return list(set(fallback_terms))

async def get_spelling_suggestion(query: str, db, user_id: int) -> Optional[str]:
    try:
        all_titles = []

        flashcard_sets = db.query(models.FlashcardSet.title).filter(
            models.FlashcardSet.user_id == user_id
        ).all()
        all_titles.extend([fs.title for fs in flashcard_sets if fs.title])

        notes = db.query(models.Note.title).filter(
            models.Note.user_id == user_id,
            models.Note.is_deleted == False
        ).all()
        all_titles.extend([n.title for n in notes if n.title])

        chats = db.query(models.ChatSession.title).filter(
            models.ChatSession.user_id == user_id
        ).all()
        all_titles.extend([c.title for c in chats if c.title and c.title != "New Chat"])

        if not all_titles:
            return None

        ai_prompt = f"""The user searched for "{query}" but found no results.
Here are the titles of content they have:
{json.dumps(all_titles[:50])}

If the search query appears to be a typo or misspelling of one of these titles, suggest the correct title.
If no close match exists, return null.

Return ONLY a JSON object in this format (no markdown):
{{"suggestion": "correct title" or null, "confidence": 0.0 to 1.0}}

Examples:
Query: "quantm computing", Titles: ["Quantum Computing", "Machine Learning"]
{{"suggestion": "Quantum Computing", "confidence": 0.95}}

Query: "xyz123", Titles: ["Math", "Science"]
{{"suggestion": null, "confidence": 0.0}}
"""

        ai_response = await call_ai_async(ai_prompt, max_tokens=100, temperature=0.1)
        ai_response_clean = ai_response.strip()

        if ai_response_clean.startswith('```'):
            lines = ai_response_clean.split('\n')
            json_lines = [l for l in lines if not l.strip().startswith('```')]
            ai_response_clean = '\n'.join(json_lines).strip()

        result = json.loads(ai_response_clean)

        if result.get("suggestion") and result.get("confidence", 0) > 0.6:
            return result["suggestion"]

        return None

    except Exception as e:
        logger.error(f"Error getting spelling suggestion: {str(e)}")
        return None

async def get_related_searches(query: str, results: list) -> list:
    try:
        result_topics = [r.get("title", "") for r in results[:10]]

        ai_prompt = f"""Based on the search query "{query}" and these related results: {result_topics[:5]},
suggest 4-6 related searches the user might be interested in.

RULES:
1. Suggestions should be related but different from the original query
2. Include both broader and narrower topics
3. Include related concepts or prerequisites
4. Keep suggestions concise (2-5 words each)
5. Return ONLY a JSON array of strings

Examples:
Query: "machine learning"
["deep learning basics", "neural networks", "python for ML", "supervised vs unsupervised", "ML algorithms"]

Query: "Irish history"
["Easter Rising 1916", "Irish independence", "British rule in Ireland", "Irish famine", "Celtic history"]

NOW GENERATE RELATED SEARCHES FOR: "{query}"
Return ONLY the JSON array:"""

        ai_response = await call_ai_async(ai_prompt, max_tokens=150, temperature=0.5)
        ai_response_clean = ai_response.strip()

        if ai_response_clean.startswith('```'):
            lines = ai_response_clean.split('\n')
            json_lines = [l for l in lines if not l.strip().startswith('```')]
            ai_response_clean = '\n'.join(json_lines).strip()

        related = json.loads(ai_response_clean)

        if isinstance(related, list):
            related = [r for r in related if r.lower() != query.lower()]
            return related[:6]

        return []

    except Exception as e:
        logger.error(f"Error getting related searches: {str(e)}")
        return []

def get_smart_actions(result: dict) -> list:
    actions = []
    result_type = result.get("type", "")

    if result_type == "flashcard_set":
        actions = [
            {"action": "study", "label": "Study", "icon": "play"},
            {"action": "quiz", "label": "Start Quiz", "icon": "help-circle"},
            {"action": "review", "label": "Review", "icon": "refresh-cw"}
        ]
    elif result_type == "flashcard":
        actions = [
            {"action": "view_set", "label": "View Set", "icon": "layers"},
            {"action": "quiz", "label": "Quiz This", "icon": "help-circle"}
        ]
    elif result_type == "note":
        actions = [
            {"action": "edit", "label": "Edit", "icon": "edit"},
            {"action": "create_flashcards", "label": "Make Flashcards", "icon": "layers"},
            {"action": "summarize", "label": "Summarize", "icon": "file-text"}
        ]
    elif result_type == "chat":
        actions = [
            {"action": "continue", "label": "Continue Chat", "icon": "message-circle"},
            {"action": "create_flashcards", "label": "Make Flashcards", "icon": "layers"}
        ]
    elif result_type == "question_set":
        actions = [
            {"action": "start_quiz", "label": "Start Quiz", "icon": "play"},
            {"action": "practice", "label": "Practice", "icon": "target"}
        ]

    return actions

def generate_filter_description(filters: dict) -> str:
    parts = []

    if filters.get("content_type") and filters["content_type"] != "all":
        parts.append(f"{filters['content_type']}s")

    if filters.get("difficulty"):
        parts.append(f"{filters['difficulty']} difficulty")

    if filters.get("reviewed") is not None:
        parts.append("reviewed" if filters["reviewed"] else "not reviewed")

    if filters.get("marked_for_review"):
        parts.append("marked for review")

    if filters.get("topic"):
        parts.append(f"about '{filters['topic']}'")

    if filters.get("time_filter"):
        time_map = {
            "today": "from today",
            "yesterday": "from yesterday",
            "last_week": "from last week",
            "last_month": "from last month"
        }
        parts.append(time_map.get(filters["time_filter"], ""))

    if parts:
        return "Showing " + ", ".join(parts)
    return "Showing all results"

from services.topic_utils import is_valid_topic as _is_valid_topic
from services.suggestion_engine import (
    extract_topic_from_episode as _extract_topic_from_episode,
    build_chroma_prompts as _build_chroma_prompts,
)

def _clean_prompt_topic(text: str) -> str:
    import re as _re
    cleaned = _re.sub(r"^(ai generated:|cerbyl:|flashcards?:|notes?:|chats?:|new chat)\s*", "", (text or ""), flags=_re.IGNORECASE)
    return cleaned.strip()

@router.post("/search_content")
async def search_content(
    user_id: str = Form(...),
    query: str = Form(...),
    content_types: str = Form("all"),
    sort_by: str = Form("relevance"),
    date_from: Optional[str] = Form(None),
    date_to: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"Search request - user_id: {user_id}, query: {query}, filters: types={content_types}, sort={sort_by}")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            return {"results": [], "total": 0, "message": "User not found"}

        actual_user_id = user.id
        results = []

        expanded_terms = await get_expanded_search_terms(query)
        logger.info(f"Expanded search terms: {expanded_terms}")

        if content_types == "all":
            enabled_types = ["flashcard_set", "note", "chat", "question_set"]
        else:
            enabled_types = [t.strip() for t in content_types.split(",")]
            if "flashcard" in enabled_types:
                enabled_types.remove("flashcard")

        date_from_obj = None
        date_to_obj = None
        if date_from:
            try:
                date_from_obj = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            except Exception:
                pass
        if date_to:
            try:
                date_to_obj = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            except Exception:
                pass

        def build_search_conditions(column, terms):
            conditions = []
            for term in terms:
                search_term = f"%{term.lower()}%"
                conditions.append(func.lower(column).like(search_term))
            return or_(*conditions) if conditions else func.lower(column).like(f"%{query.lower()}%")

        if "flashcard_set" in enabled_types:
            try:
                title_conditions = build_search_conditions(models.FlashcardSet.title, expanded_terms)
                desc_conditions = build_search_conditions(models.FlashcardSet.description, expanded_terms)

                query_builder = db.query(models.FlashcardSet).filter(
                    and_(
                        or_(title_conditions, desc_conditions),
                        or_(
                            models.FlashcardSet.user_id == actual_user_id,
                            models.FlashcardSet.is_public == True
                        )
                    )
                )

                if date_from_obj:
                    query_builder = query_builder.filter(models.FlashcardSet.created_at >= date_from_obj)
                if date_to_obj:
                    query_builder = query_builder.filter(models.FlashcardSet.created_at <= date_to_obj)

                flashcard_sets = query_builder.all()

                for fset in flashcard_sets:
                    card_count = db.query(models.Flashcard).filter(
                        models.Flashcard.set_id == fset.id
                    ).count()

                    author = db.query(models.User).filter(models.User.id == fset.user_id).first()
                    author_name = author.username if author else "Unknown"

                    results.append({
                        "id": fset.id,
                        "uid": fset.public_token,
                        "type": "flashcard_set",
                        "title": fset.title or "Untitled Set",
                        "description": fset.description or "",
                        "created_at": fset.created_at.isoformat() if fset.created_at else None,
                        "card_count": card_count,
                        "source_type": fset.source_type,
                        "author": author_name,
                        "author_id": fset.user_id,
                        "is_public": fset.is_public,
                        "is_own": fset.user_id == actual_user_id
                    })
            except Exception as e:
                logger.error(f"Error searching flashcard sets: {str(e)}")

        if "flashcard" in enabled_types:
            try:
                question_conditions = build_search_conditions(models.Flashcard.question, expanded_terms)
                answer_conditions = build_search_conditions(models.Flashcard.answer, expanded_terms)

                query_builder = db.query(models.Flashcard).join(
                    models.FlashcardSet
                ).filter(
                    and_(
                        or_(question_conditions, answer_conditions),
                        or_(
                            models.FlashcardSet.user_id == actual_user_id,
                            models.FlashcardSet.is_public == True
                        )
                    )
                )

                if date_from_obj:
                    query_builder = query_builder.filter(models.Flashcard.created_at >= date_from_obj)
                if date_to_obj:
                    query_builder = query_builder.filter(models.Flashcard.created_at <= date_to_obj)

                flashcards = query_builder.limit(50).all()
                logger.info(f"Found {len(flashcards)} individual flashcards (own + public)")

                for card in flashcards:
                    fset = db.query(models.FlashcardSet).filter(
                        models.FlashcardSet.id == card.set_id
                    ).first()

                    author = db.query(models.User).filter(models.User.id == fset.user_id).first() if fset else None
                    author_name = author.username if author else "Unknown"

                    results.append({
                        "id": card.id,
                        "type": "flashcard",
                        "title": card.question[:100] if card.question else "Flashcard",
                        "description": card.answer[:200] if card.answer else "",
                        "created_at": card.created_at.isoformat() if card.created_at else None,
                        "set_name": fset.title if fset else None,
                        "set_id": card.set_id,
                        "set_uid": fset.public_token if fset else None,
                        "difficulty": card.difficulty,
                        "author": author_name,
                        "author_id": fset.user_id if fset else None,
                        "is_public": fset.is_public if fset else False,
                        "is_own": fset.user_id == actual_user_id if fset else False
                    })
            except Exception as e:
                logger.error(f"Error searching flashcards: {str(e)}")

        if "note" in enabled_types:
            try:
                title_conditions = build_search_conditions(models.Note.title, expanded_terms)
                content_conditions = build_search_conditions(models.Note.content, expanded_terms)

                query_builder = db.query(models.Note).filter(
                    and_(
                        models.Note.is_deleted == False,
                        or_(title_conditions, content_conditions),
                        or_(
                            models.Note.user_id == actual_user_id,
                            models.Note.is_public == True
                        )
                    )
                )

                if date_from_obj:
                    query_builder = query_builder.filter(models.Note.created_at >= date_from_obj)
                if date_to_obj:
                    query_builder = query_builder.filter(models.Note.created_at <= date_to_obj)

                notes = query_builder.limit(50).all()
                logger.info(f"Found {len(notes)} notes (own + public)")

                for note in notes:
                    author = db.query(models.User).filter(models.User.id == note.user_id).first()
                    author_name = author.username if author else "Unknown"

                    results.append({
                        "id": note.id,
                        "uid": note.uid,
                        "type": "note",
                        "title": note.title if note.title else "Untitled Note",
                        "description": note.content[:200] if note.content else "",
                        "created_at": note.created_at.isoformat() if note.created_at else None,
                        "is_favorite": note.is_favorite,
                        "folder_id": note.folder_id,
                        "author": author_name,
                        "author_id": note.user_id,
                        "is_public": note.is_public,
                        "is_own": note.user_id == actual_user_id
                    })
            except Exception as e:
                logger.error(f"Error searching notes: {str(e)}")

        if "chat" in enabled_types:
            try:
                title_conditions = build_search_conditions(models.ChatSession.title, expanded_terms)

                query_builder = db.query(models.ChatSession).filter(
                    and_(
                        models.ChatSession.user_id == actual_user_id,
                        title_conditions
                    )
                )

                if date_from_obj:
                    query_builder = query_builder.filter(models.ChatSession.created_at >= date_from_obj)
                if date_to_obj:
                    query_builder = query_builder.filter(models.ChatSession.created_at <= date_to_obj)

                chats = query_builder.limit(50).all()
                logger.info(f"Found {len(chats)} chat sessions")

                for chat in chats:
                    message_count = db.query(models.ChatMessage).filter(
                        models.ChatMessage.chat_session_id == chat.id
                    ).count()

                    results.append({
                        "id": chat.id,
                        "uid": chat.public_token,
                        "type": "chat",
                        "title": chat.title or "Untitled Chat",
                        "description": f"{message_count} messages",
                        "created_at": chat.created_at.isoformat() if chat.created_at else None,
                        "updated_at": chat.updated_at.isoformat() if chat.updated_at else None,
                        "message_count": message_count,
                        "folder_id": chat.folder_id
                    })
            except Exception as e:
                logger.error(f"Error searching chats: {str(e)}")

        if "question_set" in enabled_types:
            try:
                title_conditions = build_search_conditions(models.QuestionSet.title, expanded_terms)
                desc_conditions = build_search_conditions(models.QuestionSet.description, expanded_terms)

                query_builder = db.query(models.QuestionSet).filter(
                    and_(
                        models.QuestionSet.user_id == actual_user_id,
                        or_(title_conditions, desc_conditions)
                    )
                )

                if date_from_obj:
                    query_builder = query_builder.filter(models.QuestionSet.created_at >= date_from_obj)
                if date_to_obj:
                    query_builder = query_builder.filter(models.QuestionSet.created_at <= date_to_obj)

                question_sets = query_builder.limit(50).all()
                logger.info(f"Found {len(question_sets)} question sets")

                for qset in question_sets:
                    question_count = db.query(models.Question).filter(
                        models.Question.question_set_id == qset.id
                    ).count()

                    results.append({
                        "id": qset.id,
                        "type": "question_set",
                        "title": qset.title,
                        "description": qset.description or "",
                        "created_at": qset.created_at.isoformat() if qset.created_at else None,
                        "question_count": question_count,
                        "difficulty": getattr(qset, "difficulty_level", None) or getattr(qset, "difficulty", None),
                        "subject": getattr(qset, "subject", None) or getattr(qset, "topic", None),
                    })
            except Exception as e:
                logger.error(f"Error searching question sets: {str(e)}")

        if sort_by == "date_desc":
            results.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        elif sort_by == "date_asc":
            results.sort(key=lambda x: x.get('created_at', ''))
        elif sort_by == "title_asc":
            results.sort(key=lambda x: x.get('title', '').lower())
        elif sort_by == "title_desc":
            results.sort(key=lambda x: x.get('title', '').lower(), reverse=True)
        else:
            results.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        logger.info(f"Total results: {len(results)}")

        type_counts = {}
        for result in results:
            result_type = result['type']
            type_counts[result_type] = type_counts.get(result_type, 0) + 1

        did_you_mean = None
        if len(results) == 0:
            did_you_mean = await get_spelling_suggestion(query, db, actual_user_id)

        related_searches = await get_related_searches(query, results)

        for result in results:
            result["smart_actions"] = get_smart_actions(result)

        return {
            "total_results": len(results),
            "results": results,
            "query": query,
            "filters_applied": {
                "content_types": content_types,
                "sort_by": sort_by,
                "date_from": date_from,
                "date_to": date_to
            },
            "type_counts": type_counts,
            "did_you_mean": did_you_mean,
            "related_searches": related_searches,
            "expanded_terms": expanded_terms[:5] if expanded_terms else []
        }

    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/autocomplete")
async def autocomplete(
    user_id: str = Form(...),
    query: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            return {"suggestions": []}

        suggestions = []
        query_lower = query.lower().strip()

        commands = [
            {"text": "create flashcards on", "subtext": "Generate AI flashcards on any topic", "type": "command", "category": "create", "needs_topic": True},
            {"text": "create a quiz on", "subtext": "Test your knowledge on any topic", "type": "command", "category": "create", "needs_topic": True},
            {"text": "create a note on", "subtext": "AI writes comprehensive notes", "type": "command", "category": "create", "needs_topic": True},
            {"text": "create questions on", "subtext": "Generate practice questions", "type": "command", "category": "create", "needs_topic": True},
            {"text": "create study plan for", "subtext": "Plan your learning journey", "type": "command", "category": "create", "needs_topic": True},
            {"text": "explain", "subtext": "Get AI explanation on any topic", "type": "command", "category": "learn", "needs_topic": True},
            {"text": "teach me about", "subtext": "Learn a new topic", "type": "command", "category": "learn", "needs_topic": True},
            {"text": "what is", "subtext": "Get definition", "type": "command", "category": "learn", "needs_topic": True},
            {"text": "how does", "subtext": "Understand how something works", "type": "command", "category": "learn", "needs_topic": True},
            {"text": "summarize", "subtext": "Get a quick summary", "type": "command", "category": "learn", "needs_topic": True},
            {"text": "quiz me on", "subtext": "Quick quiz on any topic", "type": "command", "category": "test", "needs_topic": True},
            {"text": "test me on", "subtext": "Test your knowledge", "type": "command", "category": "test", "needs_topic": True},
            {"text": "show my progress", "subtext": "View your learning statistics", "type": "command", "category": "progress", "needs_topic": False},
            {"text": "show my weak areas", "subtext": "Find knowledge gaps", "type": "command", "category": "progress", "needs_topic": False},
            {"text": "what is my learning style", "subtext": "AI analyzes your learning patterns", "type": "command", "category": "progress", "needs_topic": False},
            {"text": "show my achievements", "subtext": "View your badges and rewards", "type": "command", "category": "progress", "needs_topic": False},
            {"text": "show knowledge gaps", "subtext": "Find your blind spots", "type": "command", "category": "progress", "needs_topic": False},
            {"text": "what should I study next", "subtext": "Get AI recommendations", "type": "command", "category": "schedule", "needs_topic": False},
            {"text": "predict what I'll forget", "subtext": "Forgetting curve analysis", "type": "command", "category": "schedule", "needs_topic": False},
            {"text": "optimize my retention", "subtext": "Spaced repetition schedule", "type": "command", "category": "schedule", "needs_topic": False},
            {"text": "review flashcards", "subtext": "Start flashcard review", "type": "command", "category": "quick", "needs_topic": False},
            {"text": "review weak flashcards", "subtext": "Focus on difficult cards", "type": "command", "category": "quick", "needs_topic": False},
            {"text": "search for", "subtext": "Search your content", "type": "command", "category": "search", "needs_topic": True},
        ]

        is_typing_command = False
        matched_command = None
        remaining_topic = ""

        for cmd in commands:
            cmd_text = cmd["text"].lower()
            if query_lower.startswith(cmd_text):
                is_typing_command = True
                matched_command = cmd
                remaining_topic = query_lower[len(cmd_text):].strip()
                break
            elif cmd_text.startswith(query_lower):
                is_typing_command = True
                matched_command = cmd
                break

        if is_typing_command and matched_command:
            if matched_command.get("needs_topic"):
                if remaining_topic:
                    suggestions.append({
                        "text": f"{matched_command['text']} {remaining_topic}",
                        "subtext": matched_command["subtext"],
                        "type": "command",
                        "category": matched_command.get("category", "")
                    })
                else:
                    suggestions.append({
                        "text": matched_command["text"],
                        "subtext": f"{matched_command['subtext']} (type a topic)",
                        "type": "command",
                        "category": matched_command.get("category", "")
                    })
            else:
                suggestions.append({
                    "text": matched_command["text"],
                    "subtext": matched_command["subtext"],
                    "type": "command",
                    "category": matched_command.get("category", "")
                })

        if not is_typing_command or len(suggestions) < 3:
            for cmd in commands:
                cmd_lower = cmd["text"].lower()
                if cmd_lower.startswith(query_lower) and cmd != matched_command:
                    suggestions.append({
                        "text": cmd["text"],
                        "subtext": cmd["subtext"],
                        "type": "command",
                        "category": cmd.get("category", "")
                    })
                    if len(suggestions) >= 4:
                        break

        if not is_typing_command and len(query_lower) >= 2:
            search_term = f"%{query_lower}%"

            flashcard_sets = db.query(models.FlashcardSet).filter(
                models.FlashcardSet.user_id == user.id,
                func.lower(models.FlashcardSet.title).like(search_term)
            ).order_by(models.FlashcardSet.updated_at.desc()).limit(3).all()

            for fset in flashcard_sets:
                card_count = db.query(models.Flashcard).filter(models.Flashcard.set_id == fset.id).count()
                suggestions.append({
                    "text": fset.title,
                    "subtext": f"Flashcard Set â€¢ {card_count} cards",
                    "type": "content",
                    "contentType": "flashcard_set",
                    "id": fset.id,
                    "uid": fset.public_token
                })

            notes = db.query(models.Note).filter(
                models.Note.user_id == user.id,
                models.Note.is_deleted == False,
                func.lower(models.Note.title).like(search_term)
            ).order_by(models.Note.updated_at.desc()).limit(3).all()

            for note in notes:
                suggestions.append({
                    "text": note.title,
                    "subtext": "Note",
                    "type": "content",
                    "contentType": "note",
                    "id": note.id,
                    "uid": note.uid
                })

            chats = db.query(models.ChatSession).filter(
                models.ChatSession.user_id == user.id,
                func.lower(models.ChatSession.title).like(search_term)
            ).order_by(models.ChatSession.updated_at.desc()).limit(2).all()

            for chat in chats:
                if chat.title and chat.title != "New Chat":
                    suggestions.append({
                        "text": chat.title,
                        "subtext": "Chat Session",
                        "type": "content",
                        "contentType": "chat",
                        "id": chat.id,
                        "uid": chat.public_token
                    })

        if len(suggestions) < 3 and len(query) >= 2:
            suggestions.append({
                "text": query,
                "subtext": f"Search for '{query}'",
                "type": "search"
            })

        seen = set()
        unique_suggestions = []
        for s in suggestions:
            key = s["text"].lower()
            if key not in seen:
                seen.add(key)
                unique_suggestions.append(s)

        return {"suggestions": unique_suggestions[:10]}

    except Exception as e:
        logger.error(f"Autocomplete error: {str(e)}")
        return {"suggestions": []}

@router.post("/natural_language_search")
async def natural_language_search(
    user_id: str = Form(...),
    query: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            return {"results": [], "total_results": 0, "parsed_filters": {}}

        ai_prompt = f"""Parse this natural language search query into structured filters.

QUERY: "{query}"

Extract these filters if mentioned:
- content_type: "flashcard", "flashcard_set", "note", "chat", "question_set", or "all"
- difficulty: "easy", "medium", "hard", or null
- reviewed: true (reviewed), false (not reviewed), or null
- topic: the subject/topic being searched for, or null
- time_filter: "today", "yesterday", "last_week", "last_month", or null
- marked_for_review: true or false
- sort_by: "newest", "oldest", "difficulty", or null

Return ONLY a JSON object (no markdown):
{{
  "content_type": "string or null",
  "difficulty": "string or null",
  "reviewed": "boolean or null",
  "topic": "string or null",
  "time_filter": "string or null",
  "marked_for_review": "boolean or null",
  "sort_by": "string or null"
}}

Examples:
Query: "show me hard flashcards I haven't reviewed"
{{"content_type": "flashcard", "difficulty": "hard", "reviewed": false, "topic": null, "time_filter": null, "marked_for_review": null, "sort_by": null}}

Query: "notes from last week about physics"
{{"content_type": "note", "difficulty": null, "reviewed": null, "topic": "physics", "time_filter": "last_week", "marked_for_review": null, "sort_by": null}}

Query: "easy flashcards on math that need review"
{{"content_type": "flashcard", "difficulty": "easy", "reviewed": null, "topic": "math", "time_filter": null, "marked_for_review": true, "sort_by": null}}

NOW PARSE: "{query}"
"""

        ai_response = await call_ai_async(ai_prompt, max_tokens=200, temperature=0.1)
        ai_response_clean = ai_response.strip()

        if ai_response_clean.startswith('```'):
            lines = ai_response_clean.split('\n')
            json_lines = [l for l in lines if not l.strip().startswith('```')]
            ai_response_clean = '\n'.join(json_lines).strip()

        filters = json.loads(ai_response_clean)
        logger.info(f"Parsed natural language filters: {filters}")

        results = []

        content_type = filters.get("content_type", "all")
        difficulty = filters.get("difficulty")
        reviewed = filters.get("reviewed")
        topic = filters.get("topic")
        time_filter = filters.get("time_filter")
        marked_for_review = filters.get("marked_for_review")

        date_from = None
        if time_filter:
            now = datetime.now(timezone.utc)
            if time_filter == "today":
                date_from = now.replace(hour=0, minute=0, second=0, microsecond=0)
            elif time_filter == "yesterday":
                date_from = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            elif time_filter == "last_week":
                date_from = now - timedelta(days=7)
            elif time_filter == "last_month":
                date_from = now - timedelta(days=30)

        if content_type in ["flashcard", "all"]:
            query_builder = db.query(models.Flashcard).join(models.FlashcardSet).filter(
                models.FlashcardSet.user_id == user.id
            )

            if difficulty:
                query_builder = query_builder.filter(models.Flashcard.difficulty == difficulty)

            if reviewed is not None:
                if reviewed:
                    query_builder = query_builder.filter(models.Flashcard.times_reviewed > 0)
                else:
                    query_builder = query_builder.filter(models.Flashcard.times_reviewed == 0)

            if marked_for_review:
                query_builder = query_builder.filter(models.Flashcard.marked_for_review == True)

            if topic:
                topic_term = f"%{topic.lower()}%"
                query_builder = query_builder.filter(
                    or_(
                        func.lower(models.Flashcard.question).like(topic_term),
                        func.lower(models.Flashcard.answer).like(topic_term),
                        func.lower(models.FlashcardSet.title).like(topic_term)
                    )
                )

            if date_from:
                query_builder = query_builder.filter(models.Flashcard.created_at >= date_from)

            flashcards = query_builder.limit(50).all()

            for card in flashcards:
                fset = db.query(models.FlashcardSet).filter(models.FlashcardSet.id == card.set_id).first()
                results.append({
                    "id": card.id,
                    "type": "flashcard",
                    "title": card.question[:100] if card.question else "Flashcard",
                    "description": card.answer[:200] if card.answer else "",
                    "created_at": card.created_at.isoformat() if card.created_at else None,
                    "set_name": fset.title if fset else None,
                    "set_id": card.set_id,
                    "difficulty": card.difficulty,
                    "times_reviewed": card.times_reviewed,
                    "marked_for_review": card.marked_for_review,
                    "smart_actions": get_smart_actions({"type": "flashcard"})
                })

        if content_type in ["flashcard_set", "all"]:
            query_builder = db.query(models.FlashcardSet).filter(
                models.FlashcardSet.user_id == user.id
            )

            if topic:
                topic_term = f"%{topic.lower()}%"
                query_builder = query_builder.filter(
                    or_(
                        func.lower(models.FlashcardSet.title).like(topic_term),
                        func.lower(models.FlashcardSet.description).like(topic_term)
                    )
                )

            if date_from:
                query_builder = query_builder.filter(models.FlashcardSet.created_at >= date_from)

            flashcard_sets = query_builder.limit(50).all()

            for fset in flashcard_sets:
                card_count = db.query(models.Flashcard).filter(models.Flashcard.set_id == fset.id).count()
                results.append({
                    "id": fset.id,
                    "type": "flashcard_set",
                    "title": fset.title or "Untitled Set",
                    "description": fset.description or "",
                    "created_at": fset.created_at.isoformat() if fset.created_at else None,
                    "card_count": card_count,
                    "smart_actions": get_smart_actions({"type": "flashcard_set"})
                })

        if content_type in ["note", "all"]:
            query_builder = db.query(models.Note).filter(
                models.Note.user_id == user.id,
                models.Note.is_deleted == False
            )

            if topic:
                topic_term = f"%{topic.lower()}%"
                query_builder = query_builder.filter(
                    or_(
                        func.lower(models.Note.title).like(topic_term),
                        func.lower(models.Note.content).like(topic_term)
                    )
                )

            if date_from:
                query_builder = query_builder.filter(models.Note.created_at >= date_from)

            notes = query_builder.limit(50).all()

            for note in notes:
                results.append({
                    "id": note.id,
                    "type": "note",
                    "title": note.title or "Untitled Note",
                    "description": note.content[:200] if note.content else "",
                    "created_at": note.created_at.isoformat() if note.created_at else None,
                    "smart_actions": get_smart_actions({"type": "note"})
                })

        sort_by = filters.get("sort_by")
        if sort_by == "newest":
            results.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        elif sort_by == "oldest":
            results.sort(key=lambda x: x.get('created_at', ''))
        elif sort_by == "difficulty":
            difficulty_order = {"easy": 0, "medium": 1, "hard": 2}
            results.sort(key=lambda x: difficulty_order.get(x.get('difficulty', 'medium'), 1))
        else:
            results.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        filter_desc = generate_filter_description(filters)

        return {
            "total_results": len(results),
            "results": results,
            "query": query,
            "parsed_filters": filters,
            "filter_description": filter_desc
        }

    except Exception as e:
        logger.error(f"Natural language search error: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"results": [], "total_results": 0, "error": str(e)}

@router.post("/detect_search_intent")
async def detect_search_intent(
    user_id: str = Form(...),
    query: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        available_actions = {
            "create_note": {
                "description": "Create a new note",
                "parameters": {"title": "string (optional)", "content": "string (optional)"},
                "endpoint": None,
                "method": None
            },
            "create_flashcards": {
                "description": "Generate flashcards on a topic",
                "parameters": {"topic": "string (required)", "count": "integer (optional, default 10)"},
                "endpoint": None,
                "method": None
            },
            "create_quiz": {
                "description": "Create a quiz or test",
                "parameters": {"topics": "array of strings", "difficulty": "string (easy/medium/hard)", "count": "integer"},
                "endpoint": None,
                "method": None
            },
            "review_flashcards": {
                "description": "Review existing flashcards",
                "parameters": {"filter": "string (needs_review/marked_for_review/all)"},
                "endpoint": "/api/get_flashcards_for_review",
                "method": "POST"
            },
            "show_weak_areas": {
                "description": "Show topics user is struggling with",
                "parameters": {},
                "endpoint": "/api/get_weak_areas",
                "method": "POST"
            },
            "show_progress": {
                "description": "Show learning progress and statistics",
                "parameters": {},
                "endpoint": None,
                "method": None
            },
            "show_achievements": {
                "description": "Show earned achievements and badges",
                "parameters": {},
                "endpoint": None,
                "method": None
            },
            "start_chat": {
                "description": "Start AI chat conversation",
                "parameters": {"message": "string (the question or topic)", "topic": "string (optional)"},
                "endpoint": None,
                "method": None
            },
            "adapt_difficulty": {
                "description": "Adapt content difficulty to user's level",
                "parameters": {"topic": "string (optional)"},
                "endpoint": "/api/adaptive/difficulty",
                "method": "GET"
            },
            "show_learning_style": {
                "description": "Detect and show user's learning style",
                "parameters": {},
                "endpoint": "/api/adaptive/learning-style",
                "method": "GET"
            },
            "show_knowledge_gaps": {
                "description": "Find knowledge blind spots and gaps",
                "parameters": {},
                "endpoint": "/api/adaptive/knowledge-gaps",
                "method": "GET"
            },
            "create_curriculum": {
                "description": "Create personalized learning curriculum",
                "parameters": {"topic": "string (required)"},
                "endpoint": "/api/adaptive/curriculum",
                "method": "GET"
            },
            "optimize_retention": {
                "description": "Get spaced repetition schedule",
                "parameters": {},
                "endpoint": "/api/adaptive/retention",
                "method": "GET"
            },
            "predict_forgetting": {
                "description": "Predict what user will forget next",
                "parameters": {},
                "endpoint": "/api/adaptive/predict-forgetting",
                "method": "GET"
            },
            "detect_burnout": {
                "description": "Detect burnout risk",
                "parameters": {},
                "endpoint": "/api/adaptive/burnout-risk",
                "method": "GET"
            },
            "suggest_breaks": {
                "description": "Suggest optimal break schedule",
                "parameters": {},
                "endpoint": "/api/adaptive/break-schedule",
                "method": "GET"
            },
            "predict_focus": {
                "description": "Predict focus level at current time",
                "parameters": {},
                "endpoint": "/api/adaptive/focus-prediction",
                "method": "GET"
            },
            "find_study_twin": {
                "description": "Find study partner with similar learning patterns",
                "parameters": {},
                "endpoint": "/api/adaptive/study-twin",
                "method": "GET"
            },
            "find_complementary": {
                "description": "Find learners with complementary strengths",
                "parameters": {},
                "endpoint": "/api/adaptive/complementary-learners",
                "method": "GET"
            },
            "tutor_step_by_step": {
                "description": "Explain topic step-by-step",
                "parameters": {"topic": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "create_analogies": {
                "description": "Create analogies to explain concept",
                "parameters": {"topic": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "simplify_content": {
                "description": "Simplify content for beginners",
                "parameters": {"topic": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "suggest_study_next": {
                "description": "Suggest what to study next",
                "parameters": {},
                "endpoint": "/api/suggest_study_next",
                "method": "POST"
            },
            "summarize_notes": {
                "description": "Summarize user's notes",
                "parameters": {"topic": "string (optional)"},
                "endpoint": "/api/summarize_notes",
                "method": "POST"
            },
            "create_study_plan": {
                "description": "Create a study plan",
                "parameters": {"topic": "string (required)", "duration": "integer (days)"},
                "endpoint": "/api/create_study_plan",
                "method": "POST"
            },
            "search_recent": {
                "description": "Search recent content",
                "parameters": {"timeframe": "string (yesterday/last_week/last_month/recent)"},
                "endpoint": "/api/search_recent_content",
                "method": "POST"
            },
            "find_study_buddies": {
                "description": "Find study buddies",
                "parameters": {},
                "endpoint": None,
                "method": None
            },
            "challenge_friend": {
                "description": "Challenge friend to quiz battle",
                "parameters": {"friend_name": "string (optional)"},
                "endpoint": None,
                "method": None
            },
            "show_popular_content": {
                "description": "Show trending/popular content",
                "parameters": {"topic": "string (optional)"},
                "endpoint": "/api/get_popular_content",
                "method": "POST"
            },
            "search": {
                "description": "Regular search for content",
                "parameters": {},
                "endpoint": "/api/search_content",
                "method": "POST"
            },
            "compare_topics": {
                "description": "Compare two or more topics",
                "parameters": {"topics": "array of strings (2+ topics to compare)"},
                "endpoint": None,
                "method": None
            },
            "explain_like_im_five": {
                "description": "Explain a concept in very simple terms",
                "parameters": {"topic": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "give_examples": {
                "description": "Provide examples of a concept",
                "parameters": {"topic": "string (required)", "count": "integer (optional)"},
                "endpoint": None,
                "method": None
            },
            "test_me": {
                "description": "Quick test/quiz on a topic",
                "parameters": {"topic": "string (required)", "difficulty": "string (optional)"},
                "endpoint": None,
                "method": None
            },
            "define": {
                "description": "Get definition of a term",
                "parameters": {"term": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "list_prerequisites": {
                "description": "List prerequisites for learning a topic",
                "parameters": {"topic": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "suggest_resources": {
                "description": "Suggest learning resources for a topic",
                "parameters": {"topic": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "practice_problems": {
                "description": "Generate practice problems",
                "parameters": {"topic": "string (required)", "difficulty": "string (optional)", "count": "integer (optional)"},
                "endpoint": None,
                "method": None
            },
            "summarize_topic": {
                "description": "Get a summary of a topic",
                "parameters": {"topic": "string (required)", "length": "string (short/medium/long)"},
                "endpoint": None,
                "method": None
            },
            "show_statistics": {
                "description": "Show learning statistics and analytics",
                "parameters": {"timeframe": "string (optional: today/week/month/all)"},
                "endpoint": None,
                "method": None
            },
            "set_goal": {
                "description": "Set a learning goal",
                "parameters": {"goal": "string (required)", "deadline": "string (optional)"},
                "endpoint": None,
                "method": None
            },
            "remind_me": {
                "description": "Set a study reminder",
                "parameters": {"topic": "string (required)", "time": "string (optional)"},
                "endpoint": None,
                "method": None
            },
            "export_content": {
                "description": "Export flashcards or notes",
                "parameters": {"content_type": "string (flashcards/notes)", "topic": "string (optional)"},
                "endpoint": None,
                "method": None
            },
            "how_to": {
                "description": "Get step-by-step instructions",
                "parameters": {"task": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "pros_and_cons": {
                "description": "List pros and cons of something",
                "parameters": {"topic": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "timeline": {
                "description": "Get a timeline of events or history",
                "parameters": {"topic": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "mind_map": {
                "description": "Create a mind map of a topic",
                "parameters": {"topic": "string (required)"},
                "endpoint": None,
                "method": None
            },
            "flashcard_from_text": {
                "description": "Generate flashcards from pasted text",
                "parameters": {"text": "string (required)", "count": "integer (optional)"},
                "endpoint": None,
                "method": None
            },
            "daily_review": {
                "description": "Start daily review session",
                "parameters": {},
                "endpoint": None,
                "method": None
            },
            "whats_due": {
                "description": "Show what's due for review today",
                "parameters": {},
                "endpoint": "/api/adaptive/retention",
                "method": "GET"
            },
            "random_flashcard": {
                "description": "Show a random flashcard",
                "parameters": {"topic": "string (optional)"},
                "endpoint": None,
                "method": None
            }
        }

        ai_prompt = f"""You are an intent detection system. Analyze the user's query and determine their intent.

USER QUERY: "{query}"

AVAILABLE ACTIONS:
{json.dumps(available_actions, indent=2)}

INSTRUCTIONS:
1. Identify the user's primary intent from the available actions
2. Extract any parameters mentioned in the query
3. Return ONLY valid JSON in this EXACT format (no markdown, no explanation):

{{
  "intent": "action" or "search",
  "action": "action_name" or null,
  "parameters": {{}},
  "confidence": 0.0 to 1.0
}}

RULES:
- If the query matches an action, set intent="action" and specify the action name
- If it's a general search query, set intent="search" and action=null
- Extract parameters EXACTLY as specified in the action definition
- For topics/titles, extract the actual subject matter from the query
- confidence should be 0.8+ for clear matches, 0.5-0.8 for uncertain, <0.5 for unclear
- Return ONLY the JSON object, nothing else

IMPORTANT - SEARCH INTENT KEYWORDS:
The following words/phrases indicate the user wants to SEARCH for existing content (intent="search"):
- "fetch", "get", "get me", "bring", "bring me"
- "find", "find me", "look for", "look up", "search", "search for"
- "can I see", "show me", "display", "pull up", "retrieve"
- "where is", "where are", "locate", "give me"
- "my flashcards on", "my notes on", "my content on"
- "do I have", "have I created"

When these keywords are followed by a topic (e.g., "fetch my flashcards on irish", "get me notes on biology"),
the intent is SEARCH, NOT create. The user wants to find EXISTING content.

EXAMPLES:
Query: "create flashcards on machine learning"
{{"intent": "action", "action": "create_flashcards", "parameters": {{"topic": "machine learning", "count": 10}}, "confidence": 0.95}}

Query: "what is my learning style"
{{"intent": "action", "action": "show_learning_style", "parameters": {{}}, "confidence": 0.98}}

Query: "adapt difficulty to my level"
{{"intent": "action", "action": "adapt_difficulty", "parameters": {{}}, "confidence": 0.95}}

Query: "explain neural networks step by step"
{{"intent": "action", "action": "tutor_step_by_step", "parameters": {{"topic": "neural networks"}}, "confidence": 0.92}}

Query: "python programming"
{{"intent": "search", "action": null, "parameters": {{}}, "confidence": 0.85}}

Query: "fetch my flashcards on irish"
{{"intent": "search", "action": null, "parameters": {{}}, "confidence": 0.95}}

Query: "get me notes on biology"
{{"intent": "search", "action": null, "parameters": {{}}, "confidence": 0.95}}

Query: "can I see my flashcards on history"
{{"intent": "search", "action": null, "parameters": {{}}, "confidence": 0.95}}

Query: "bring me my notes"
{{"intent": "search", "action": null, "parameters": {{}}, "confidence": 0.90}}

Query: "find flashcards on chemistry"
{{"intent": "search", "action": null, "parameters": {{}}, "confidence": 0.95}}

Query: "show me my content on math"
{{"intent": "search", "action": null, "parameters": {{}}, "confidence": 0.95}}

Query: "do I have any notes on physics"
{{"intent": "search", "action": null, "parameters": {{}}, "confidence": 0.90}}

ADDITIONAL NLP EXAMPLES:

Query: "compare python and javascript"
{{"intent": "action", "action": "compare_topics", "parameters": {{"topics": ["python", "javascript"]}}, "confidence": 0.95}}

Query: "explain quantum physics like I'm 5"
{{"intent": "action", "action": "explain_like_im_five", "parameters": {{"topic": "quantum physics"}}, "confidence": 0.98}}

Query: "give me 5 examples of recursion"
{{"intent": "action", "action": "give_examples", "parameters": {{"topic": "recursion", "count": 5}}, "confidence": 0.95}}

Query: "test me on calculus"
{{"intent": "action", "action": "test_me", "parameters": {{"topic": "calculus"}}, "confidence": 0.95}}

Query: "what is photosynthesis"
{{"intent": "action", "action": "define", "parameters": {{"term": "photosynthesis"}}, "confidence": 0.90}}

Query: "what do I need to know before learning machine learning"
{{"intent": "action", "action": "list_prerequisites", "parameters": {{"topic": "machine learning"}}, "confidence": 0.92}}

Query: "give me practice problems on algebra"
{{"intent": "action", "action": "practice_problems", "parameters": {{"topic": "algebra"}}, "confidence": 0.95}}

Query: "summarize world war 2 in short"
{{"intent": "action", "action": "summarize_topic", "parameters": {{"topic": "world war 2", "length": "short"}}, "confidence": 0.93}}

Query: "how am I doing this week"
{{"intent": "action", "action": "show_statistics", "parameters": {{"timeframe": "week"}}, "confidence": 0.88}}

Query: "remind me to study biology tomorrow"
{{"intent": "action", "action": "remind_me", "parameters": {{"topic": "biology", "time": "tomorrow"}}, "confidence": 0.90}}

Query: "how to solve quadratic equations"
{{"intent": "action", "action": "how_to", "parameters": {{"task": "solve quadratic equations"}}, "confidence": 0.92}}

Query: "pros and cons of renewable energy"
{{"intent": "action", "action": "pros_and_cons", "parameters": {{"topic": "renewable energy"}}, "confidence": 0.95}}

Query: "timeline of the french revolution"
{{"intent": "action", "action": "timeline", "parameters": {{"topic": "french revolution"}}, "confidence": 0.95}}

Query: "what's due today"
{{"intent": "action", "action": "whats_due", "parameters": {{}}, "confidence": 0.95}}

Query: "start my daily review"
{{"intent": "action", "action": "daily_review", "parameters": {{}}, "confidence": 0.95}}

Query: "show me a random flashcard"
{{"intent": "action", "action": "random_flashcard", "parameters": {{}}, "confidence": 0.92}}

Query: "quiz me on hard chemistry questions"
{{"intent": "action", "action": "test_me", "parameters": {{"topic": "chemistry", "difficulty": "hard"}}, "confidence": 0.95}}

NOW ANALYZE THIS QUERY AND RETURN ONLY THE JSON:
"{query}"
"""

        logger.info(f"Calling AI for intent detection: '{query}'")
        ai_response = await call_ai_async(ai_prompt, max_tokens=500, temperature=0.1)
        logger.info(f"AI response: {ai_response[:200]}...")

        ai_response_clean = ai_response.strip()

        if ai_response_clean.startswith('```'):
            lines = ai_response_clean.split('\n')
            json_lines = []
            in_code_block = False
            for line in lines:
                if line.strip().startswith('```'):
                    in_code_block = not in_code_block
                    continue
                if in_code_block or (not line.strip().startswith('```')):
                    json_lines.append(line)
            ai_response_clean = '\n'.join(json_lines).strip()

        try:
            result = json.loads(ai_response_clean)

            if not isinstance(result, dict):
                raise ValueError("Response is not a JSON object")

            if "intent" not in result:
                raise ValueError("Missing 'intent' field")

            result.setdefault("action", None)
            result.setdefault("parameters", {})
            result.setdefault("confidence", 0.5)

            logger.info(f"Intent detected - Intent: {result['intent']}, Action: {result['action']}, Confidence: {result['confidence']}")

            result["original_query"] = query

            return result

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {e}")
            logger.error(f"Raw response: {ai_response_clean}")

            action_match = None
            for action_name in available_actions.keys():
                if action_name in ai_response_clean.lower():
                    action_match = action_name
                    break

            if action_match:
                logger.info(f"Fallback: Extracted action '{action_match}' from text")
                return {
                    "intent": "action",
                    "action": action_match,
                    "parameters": {},
                    "confidence": 0.6,
                    "original_query": query
                }
            else:
                logger.info("Fallback: Defaulting to search")
                return {
                    "intent": "search",
                    "action": None,
                    "parameters": {},
                    "confidence": 0.5,
                    "original_query": query
                }

    except Exception as e:
        logger.error(f"Intent detection error: {str(e)}")
        import traceback
        traceback.print_exc()

        return {
            "intent": "search",
            "action": None,
            "parameters": {},
            "confidence": 0.3,
            "original_query": query,
            "error": str(e)
        }

@router.post("/generate_topic_description")
async def generate_topic_description(
    user_id: str = Form(...),
    topic: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"Generating topic description for: '{topic}' (user: {user_id})")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)

        ai_prompt = f"""You are an educational AI assistant. Provide a brief, clear, and engaging description of the following topic.

TOPIC: "{topic}"

INSTRUCTIONS:
1. Write 2-3 sentences that explain what this topic is about
2. Make it educational and informative
3. Use simple, accessible language
4. Focus on the core concepts and why it matters
5. Be encouraging and make the user curious to learn more
6. DO NOT use phrases like "I couldn't find" or "no results" - just describe the topic
7. Keep it concise (max 150 words)

EXAMPLES:

Topic: "quantum physics"
Description: "Quantum physics is the branch of physics that studies the behavior of matter and energy at the smallest scales - atoms and subatomic particles. It reveals a fascinating world where particles can exist in multiple states simultaneously and can be connected across vast distances. Understanding quantum physics opens doors to cutting-edge technologies like quantum computing and helps explain the fundamental nature of our universe."

Topic: "machine learning"
Description: "Machine learning is a field of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed. It powers many technologies you use daily, from recommendation systems to voice assistants. By studying patterns in data, machine learning algorithms can make predictions, recognize images, understand language, and solve complex problems."

Topic: "photosynthesis"
Description: "Photosynthesis is the remarkable process by which plants convert sunlight into chemical energy, producing the oxygen we breathe and the food that sustains life on Earth. During this process, plants use chlorophyll to capture light energy and transform carbon dioxide and water into glucose and oxygen. It's one of the most important biological processes on our planet."

Now generate a description for: "{topic}"

Return ONLY the description text, no labels or extra formatting."""

        description = await call_ai_async(ai_prompt, max_tokens=300, temperature=0.7)
        description = description.strip()

        if description.lower().startswith("description:"):
            description = description[12:].strip()

        logger.info(f"Generated description: {description[:100]}...")

        return {
            "success": True,
            "description": description,
            "topic": topic,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        logger.error(f"Error generating topic description: {str(e)}")
        import traceback
        traceback.print_exc()

        return {
            "success": True,
            "description": f"Let's explore {topic} together! This is a fascinating subject with many interesting aspects to discover. I can help you create flashcards, notes, or start a learning session to dive deeper into this topic.",
            "topic": topic,
            "fallback": True,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

@router.post("/get_personalized_prompts")
async def get_personalized_prompts(
    user_id: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        import re as _re
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        topic_prompts = _build_chroma_prompts(str(user.id))

        if not topic_prompts:
            recent_flashcard_sets = db.query(models.FlashcardSet).filter(
                models.FlashcardSet.user_id == user.id
            ).order_by(models.FlashcardSet.updated_at.desc()).limit(10).all()

            if recent_flashcard_sets:
                selected_sets = random.sample(recent_flashcard_sets, min(2, len(recent_flashcard_sets)))
                for fs in selected_sets:
                    clean_title = fs.title
                    if clean_title:
                        clean_title = _re.sub(r'^(AI Generated:\s*|Cerbyl:\s*|Flashcards?:\s*)', '', clean_title, flags=_re.IGNORECASE).strip()

                    topic_prompts.append({
                        "text": f"create a quiz on {clean_title}",
                        "reason": "Test your flashcard knowledge",
                        "priority": "high"
                    })

            recent_notes = db.query(models.Note).filter(
                models.Note.user_id == user.id
            ).order_by(models.Note.updated_at.desc()).limit(10).all()

            if recent_notes:
                selected_notes = random.sample(recent_notes, min(2, len(recent_notes)))
                for note in selected_notes:
                    clean_title = note.title
                    if clean_title:
                        clean_title = _re.sub(r'^(AI Generated:\s*|Cerbyl:\s*|Notes?:\s*)', '', clean_title, flags=_re.IGNORECASE).strip()

                    topic_prompts.append({
                        "text": f"create flashcards on {clean_title}",
                        "reason": "Turn notes into active learning",
                        "priority": "high"
                    })

            recent_chats = db.query(models.ChatSession).filter(
                models.ChatSession.user_id == user.id
            ).order_by(models.ChatSession.updated_at.desc()).limit(10).all()

            if recent_chats:
                meaningful_chats = [
                    c for c in recent_chats
                    if c.title and _is_valid_topic(c.title)
                    and c.title.lower() not in ['new chat', 'untitled', '']
                ]
                if meaningful_chats:
                    selected_chats = random.sample(meaningful_chats, min(2, len(meaningful_chats)))
                    for chat in selected_chats:
                        clean_title = _clean_prompt_topic(chat.title)
                        if not _is_valid_topic(clean_title):
                            continue
                        topic_prompts.append({
                            "text": f"create notes on {clean_title}",
                            "reason": "Document your recent discussion",
                            "priority": "medium"
                        })

            profile = db.query(models.ComprehensiveUserProfile).filter(
                models.ComprehensiveUserProfile.user_id == user.id
            ).first()

            weak_topics = []
            if profile and profile.weak_areas:
                try:
                    weak_topics = json.loads(profile.weak_areas) if isinstance(profile.weak_areas, str) else profile.weak_areas
                except Exception:
                    pass

            if weak_topics:
                selected_weak = random.sample(weak_topics, min(2, len(weak_topics)))
                for topic in selected_weak:
                    topic_prompts.append({
                        "text": f"create flashcards on {topic}",
                        "reason": "Focus on weak areas",
                        "priority": "high"
                    })

            weak_flashcard_sets = db.query(models.FlashcardSet).join(
                models.Flashcard
            ).filter(
                models.FlashcardSet.user_id == user.id,
                models.Flashcard.marked_for_review == True
            ).distinct().limit(5).all()

            if weak_flashcard_sets:
                topic_prompts.append({
                    "text": "review weak flashcards",
                    "reason": f"{len(weak_flashcard_sets)} sets need attention",
                    "priority": "high"
                })

        random.shuffle(topic_prompts)
        seen_texts = set()
        unique_prompts = []
        for p in topic_prompts:
            text_lower = p["text"].lower()
            if text_lower not in seen_texts:
                seen_texts.add(text_lower)
                unique_prompts.append(p)

        priority_order = {"high": 0, "medium": 1, "low": 2}
        unique_prompts.sort(key=lambda x: (priority_order.get(x["priority"], 3), random.random()))

        logger.info(f"Generated {len(unique_prompts)} personalized prompts for user {user_id}")

        return {
            "prompts": unique_prompts[:4],
            "user_id": user_id
        }

    except Exception as e:
        logger.error(f"Error getting personalized prompts: {str(e)}")
        return {"prompts": []}

@router.post("/get_weak_areas")
async def get_weak_areas(
    user_id: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            return {"weak_areas": []}

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        weak_areas = []

        if comprehensive_profile and comprehensive_profile.weak_areas:
            try:
                weak_areas_list = json.loads(comprehensive_profile.weak_areas)
                for area in weak_areas_list:
                    weak_areas.append({
                        "id": len(weak_areas) + 1,
                        "type": "weak_area",
                        "title": area,
                        "description": f"You've been struggling with {area}",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
            except Exception:
                pass

        solo_quizzes = db.query(models.SoloQuiz).filter(
            models.SoloQuiz.user_id == user.id,
            models.SoloQuiz.completed == True
        ).all()

        quiz_performance = {}
        for quiz in solo_quizzes:
            subject = quiz.subject
            if subject not in quiz_performance:
                quiz_performance[subject] = {"total_score": 0, "total_questions": 0, "quiz_count": 0}

            quiz_performance[subject]["total_score"] += quiz.score
            quiz_performance[subject]["total_questions"] += quiz.question_count
            quiz_performance[subject]["quiz_count"] += 1

        for subject, perf in quiz_performance.items():
            if perf["total_questions"] > 0:
                accuracy = (perf["total_score"] / perf["total_questions"]) * 100

                if accuracy < 60:
                    weak_areas.append({
                        "id": len(weak_areas) + 1,
                        "type": "quiz_subject",
                        "title": subject,
                        "description": f"Quiz accuracy: {accuracy:.1f}% across {perf['quiz_count']} quiz(es) - Needs more practice",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "accuracy": accuracy
                    })

        flashcard_sets = db.query(models.FlashcardSet).filter(
            models.FlashcardSet.user_id == user.id
        ).all()

        for fset in flashcard_sets:
            cards = db.query(models.Flashcard).filter(
                models.Flashcard.set_id == fset.id,
                models.Flashcard.times_reviewed > 0
            ).all()

            if cards:
                total_reviews = sum(c.times_reviewed for c in cards)
                total_correct = sum(c.correct_count for c in cards)

                if total_reviews > 0:
                    accuracy = (total_correct / total_reviews) * 100

                    if accuracy < 60:
                        weak_areas.append({
                            "id": len(weak_areas) + 1,
                            "type": "flashcard_set",
                            "title": fset.title,
                            "description": f"Flashcard accuracy: {accuracy:.1f}% - Needs more practice",
                            "created_at": fset.created_at.isoformat() if fset.created_at else None,
                            "set_id": fset.id
                        })

        if len(weak_areas) == 0:
            recent_sets = db.query(models.FlashcardSet).filter(
                models.FlashcardSet.user_id == user.id
            ).order_by(models.FlashcardSet.created_at.desc()).limit(5).all()

            for fset in recent_sets:
                weak_areas.append({
                    "id": len(weak_areas) + 1,
                    "type": "suggestion",
                    "title": f"Review {fset.title}",
                    "description": "Keep your knowledge fresh with regular review",
                    "created_at": fset.created_at.isoformat() if fset.created_at else None,
                    "set_id": fset.id
                })

            recent_notes = db.query(models.Note).filter(
                models.Note.user_id == user.id
            ).order_by(models.Note.updated_at.desc()).limit(3).all()

            for note in recent_notes:
                weak_areas.append({
                    "id": len(weak_areas) + 1,
                    "type": "suggestion",
                    "title": f"Create flashcards on {note.title}",
                    "description": "Turn your notes into active learning",
                    "created_at": note.updated_at.isoformat() if note.updated_at else None
                })

        if len(weak_areas) == 0:
            field_of_study = comprehensive_profile.field_of_study if comprehensive_profile else user.field_of_study

            default_topics = [
                "Create your first flashcard set",
                "Take notes on a new topic",
                "Start a study session",
                "Explore AI chat for learning",
                "Set up your study goals"
            ]

            if field_of_study and field_of_study.lower() not in ['general studies', 'general', 'none', '']:
                default_topics = [
                    f"Core concepts in {field_of_study}",
                    f"Advanced topics in {field_of_study}",
                    f"Practice problems for {field_of_study}",
                    f"Review fundamentals of {field_of_study}",
                    f"Explore new areas in {field_of_study}"
                ]

            for i, topic in enumerate(default_topics[:5]):
                weak_areas.append({
                    "id": i + 1,
                    "type": "suggestion",
                    "title": topic,
                    "description": "Start building your knowledge base",
                    "created_at": datetime.now(timezone.utc).isoformat()
                })

        type_priority = {"weak_area": 0, "quiz_subject": 1, "flashcard_set": 2, "suggestion": 3}
        weak_areas.sort(key=lambda x: type_priority.get(x.get("type", "suggestion"), 3))

        logger.info(f"Returning {len(weak_areas)} weak areas/suggestions for user {user_id}")
        return {"weak_areas": weak_areas[:10]}

    except Exception as e:
        logger.error(f"Error getting weak areas: {str(e)}")
        return {
            "weak_areas": [
                {
                    "id": 1,
                    "type": "suggestion",
                    "title": "Create your first flashcard set",
                    "description": "Start your learning journey",
                    "created_at": datetime.now(timezone.utc).isoformat()
                },
                {
                    "id": 2,
                    "type": "suggestion",
                    "title": "Take notes on a topic you're learning",
                    "description": "Document your knowledge",
                    "created_at": datetime.now(timezone.utc).isoformat()
                },
                {
                    "id": 3,
                    "type": "suggestion",
                    "title": "Ask AI to explain a concept",
                    "description": "Get personalized help",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
            ]
        }

@router.post("/suggest_study_next")
async def suggest_study_next(
    user_id: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            return {"suggestions": []}

        suggestions = []
        profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        if profile and profile.weak_areas:
            try:
                weak_topics = json.loads(profile.weak_areas) if isinstance(profile.weak_areas, str) else profile.weak_areas
                for topic in weak_topics[:3]:
                    suggestions.append({
                        "topic": topic,
                        "reason": "You've been struggling with this",
                        "priority": "high"
                    })
            except Exception:
                pass

        return {"suggestions": suggestions[:5]}
    except Exception as e:
        logger.error(f"Error suggesting study next: {str(e)}")
        return {"suggestions": []}

@router.post("/summarize_notes")
async def summarize_notes(
    user_id: str = Form(...),
    topic: str = Form(None),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            return {"summary": "User not found"}

        notes_query = db.query(models.Note).filter(models.Note.user_id == user.id)
        if topic:
            notes_query = notes_query.filter(
                or_(models.Note.title.ilike(f"%{topic}%"), models.Note.content.ilike(f"%{topic}%"))
            )

        notes = notes_query.order_by(models.Note.updated_at.desc()).limit(10).all()
        if not notes:
            return {"summary": f"No notes found on {topic}" if topic else "No notes found"}

        combined_content = "\n\n".join([f"# {note.title}\n{note.content}" for note in notes])
        prompt = f"Summarize these notes:\n\n{combined_content[:4000]}"
        summary = await call_ai_async(prompt, max_tokens=1000, temperature=0.7)

        return {"summary": summary.strip(), "notes_count": len(notes)}
    except Exception as e:
        logger.error(f"Error summarizing notes: {str(e)}")
        return {"summary": f"Error: {str(e)}"}

@router.post("/create_study_plan")
async def create_study_plan(
    user_id: str = Form(...),
    topic: str = Form(...),
    duration: int = Form(30),
    db: Session = Depends(get_db)
):
    try:
        prompt = f"Create a {duration} day study plan for {topic}"
        plan = await call_ai_async(prompt, max_tokens=2000, temperature=0.7)
        return {"plan": plan.strip()}
    except Exception as e:
        return {"plan": f"Error: {str(e)}"}

@router.post("/search_recent_content")
async def search_recent_content(
    user_id: str = Form(...),
    timeframe: str = Form("recent"),
    db: Session = Depends(get_db)
):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            return {"results": []}

        now = datetime.now(timezone.utc)
        start_date = now - timedelta(days={"yesterday": 1, "last_week": 7, "last_month": 30}.get(timeframe, 3))

        results = []
        sets = db.query(models.FlashcardSet).filter(
            models.FlashcardSet.user_id == user.id,
            models.FlashcardSet.created_at >= start_date
        ).all()

        for fset in sets:
            results.append({"id": fset.id, "type": "flashcard_set", "title": fset.title})

        return {"results": results}
    except Exception as e:
        return {"results": []}

@router.post("/get_search_suggestion")
async def get_search_suggestion(
    user_id: str = Form(...),
    query: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        prompt = f"""The user searched for "{query}" but no results were found.

Provide a helpful, encouraging response that:
1. Acknowledges what they're looking for
2. Suggests what type of content they could create (flashcards, notes, questions, etc.)
3. Offers to help them get started

Keep it brief, friendly, and actionable. 2-3 sentences max."""

        suggestion = await call_ai_async(prompt, max_tokens=200, temperature=0.7)

        return {
            "description": suggestion.strip(),
            "suggestions": [
                "Create Flashcards",
                "Take Notes",
                "Ask AI"
            ]
        }

    except Exception as e:
        logger.error(f"AI suggestion error: {str(e)}")
        return {
            "description": f"I couldn't find anything matching \"{query}\". Would you like to create some learning materials on this topic?",
            "suggestions": [
                "Create Flashcards",
                "Take Notes",
                "Ask AI"
            ]
        }

@router.get("/get_trending_topics")
async def get_trending_topics(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        popular_sets = db.query(
            models.FlashcardSet.title,
            func.count(models.FlashcardSet.id).label('count')
        ).filter(
            models.FlashcardSet.is_public == True
        ).group_by(models.FlashcardSet.title).order_by(
            func.count(models.FlashcardSet.id).desc()
        ).limit(5).all()

        trending = []
        for set_title, count in popular_sets:
            trending.append({
                "topic": set_title,
                "count": count
            })

        if len(trending) < 5:
            defaults = [
                {"topic": "Machine Learning Basics", "count": 45},
                {"topic": "Calculus Integration", "count": 38},
                {"topic": "World History Timeline", "count": 32},
                {"topic": "Python Programming", "count": 29},
                {"topic": "Chemistry Reactions", "count": 24}
            ]
            trending.extend(defaults[len(trending):])

        return {"trending": trending[:5]}

    except Exception as e:
        logger.error(f"Trending topics error: {str(e)}")
        return {
            "trending": [
                {"topic": "Machine Learning Basics", "count": 45},
                {"topic": "Calculus Integration", "count": 38},
                {"topic": "World History Timeline", "count": 32},
                {"topic": "Python Programming", "count": 29},
                {"topic": "Chemistry Reactions", "count": 24}
            ]
        }
