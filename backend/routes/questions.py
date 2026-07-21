import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict
from collections import Counter

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
)
from services.ai_json_parser import parse_json_array_response
from services.math_processor import process_math_in_response

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api",
    tags=["questions"],
    dependencies=[Depends(enforce_request_user_scope)],
)

def _looks_like_filename_topic(topic: str) -> bool:
    t = (topic or "").strip().lower()
    if not t:
        return True
    if ".pdf" in t or ".docx" in t or ".txt" in t or ".md" in t:
        return True
    if re.search(r"[_-]", t) and len(t.split()) <= 3:
        return True
    return False

def _topic_concept_id(topic: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", (topic or "").strip().lower()).strip("_")
    return f"topic::{(cleaned or 'general')[:120]}"

def _clean_chunk_text(text: str) -> str:
    clean = (text or "").replace("\u0000", " ").strip()
    clean = re.sub(r"\(cid:\d+\)", " ", clean)
    clean = re.sub(r"[ \t]+", " ", clean)
    clean = re.sub(r"\n{3,}", "\n\n", clean)
    return clean.strip()

def _build_local_question_fallback(
    topic: str,
    question_count: int,
    difficulty: str,
    question_types: list[str],
) -> list[dict[str, Any]]:
    clean_topic = (topic or "the selected material").strip()[:100]
    allowed_types = [qt for qt in (question_types or []) if qt in {"multiple_choice", "true_false", "short_answer"}]
    if not allowed_types:
        allowed_types = ["multiple_choice"]

    questions: list[dict[str, Any]] = []
    for idx in range(max(1, int(question_count or 1))):
        q_type = allowed_types[idx % len(allowed_types)]
        if q_type == "true_false":
            questions.append({
                "question_text": f"True or false: {clean_topic} can be understood by identifying its core ideas before details.",
                "question_type": "true_false",
                "correct_answer": "True",
                "options": ["True", "False"],
                "difficulty": difficulty or "easy",
                "explanation": "Starting with core ideas creates a framework for understanding details.",
                "topic": clean_topic,
            })
        elif q_type == "short_answer":
            questions.append({
                "question_text": f"What is one key idea someone should remember about {clean_topic}?",
                "question_type": "short_answer",
                "correct_answer": f"A key idea is to explain {clean_topic} in terms of its main concepts, examples, and purpose.",
                "options": [],
                "difficulty": difficulty or "easy",
                "explanation": "A concise explanation should connect the topic to its purpose and main concepts.",
                "topic": clean_topic,
            })
        else:
            questions.append({
                "question_text": f"Which study approach best helps you understand {clean_topic}?",
                "question_type": "multiple_choice",
                "correct_answer": "Break the topic into core ideas and test recall",
                "options": [
                    "Break the topic into core ideas and test recall",
                    "Only reread the material passively",
                    "Skip examples and focus only on definitions",
                    "Memorize unrelated facts first",
                ],
                "difficulty": difficulty or "easy",
                "explanation": "Breaking a topic into core ideas and testing recall supports durable understanding.",
                "topic": clean_topic,
            })
    return questions[:question_count]

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

def _collect_context_doc_content(
    db: Session,
    user_id: int,
    doc_ids: list[str],
    max_chars: int = 12000,
    focus_topic: str = "",
) -> tuple[str, str]:
    docs = (
        db.query(models.ContextDocument)
        .filter(
            models.ContextDocument.user_id == user_id,
            models.ContextDocument.doc_id.in_(doc_ids),
        )
        .all()
    )
    if not docs:
        return "", ""

    order_index = {d: i for i, d in enumerate(doc_ids)}
    docs.sort(key=lambda d: order_index.get(d.doc_id, 10**6))

    subject_candidates = [d.subject.strip() for d in docs if (d.subject or "").strip()]
    inferred_topic = ""
    if subject_candidates:
        inferred_topic = Counter(subject_candidates).most_common(1)[0][0]
    else:
        first_name = (docs[0].filename or docs[0].doc_id or "Selected context").strip()
        inferred_topic = re.sub(r"\.[A-Za-z0-9]+$", "", first_name).replace("_", " ").replace("-", " ").strip()

    focused_topic = (focus_topic or "").strip()
    if focused_topic:
        try:
            from services import context_store
        except Exception:
            context_store = None

        if context_store and context_store.available():
            try:
                ranked = context_store.search_context(
                    query=focused_topic,
                    user_id=str(user_id),
                    use_hs=False,
                    top_k=min(max(len(doc_ids) * 6, 8), 36),
                    doc_ids=doc_ids,
                )
            except Exception:
                ranked = []

            if ranked:
                grouped: dict[str, list[str]] = {d.doc_id: [] for d in docs}
                for row in ranked:
                    md = row.get("metadata") if isinstance(row, dict) else {}
                    if not isinstance(md, dict):
                        md = {}
                    did = str(md.get("doc_id") or "").strip()
                    if did not in grouped:
                        continue
                    txt = _clean_chunk_text(str(row.get("text") or ""))
                    if not txt:
                        continue
                    txt = txt[:1600]
                    if txt in grouped[did]:
                        continue
                    if len(grouped[did]) >= 12:
                        continue
                    grouped[did].append(txt)

                focused_blocks: list[str] = []
                used = 0
                for doc in docs:
                    lines = grouped.get(doc.doc_id, [])
                    if not lines:
                        continue
                    block = f"[{doc.filename or doc.doc_id}]\n" + "\n\n".join(lines)
                    if used + len(block) > max_chars:
                        remaining = max_chars - used
                        if remaining > 800:
                            focused_blocks.append(block[:remaining])
                        break
                    focused_blocks.append(block)
                    used += len(block)

                if focused_blocks:
                    return "\n\n".join(focused_blocks).strip(), inferred_topic

    try:
        from services import vector_store as vs
    except Exception:
        vs = None

    if not vs or not vs.available():
        summaries = []
        for doc in docs:
            sm = (doc.ai_summary or "").strip()
            if sm:
                summaries.append(f"[{doc.filename or doc.doc_id}]\n{sm}")
        return "\n\n".join(summaries)[:max_chars], inferred_topic

    content_blocks: list[str] = []
    used = 0
    for doc in docs:
        try:
            rows = vs.get_by_metadata("user_docs", {"doc_id": doc.doc_id}, user_id=str(user_id))
        except Exception:
            rows = []
        if not rows:
            if (doc.ai_summary or "").strip():
                block = f"[{doc.filename or doc.doc_id}]\n{doc.ai_summary.strip()}"
                if used + len(block) <= max_chars:
                    content_blocks.append(block)
                    used += len(block)
            continue

        rows.sort(
            key=lambda r: int(str((r.get("metadata") or {}).get("chunk_index", "0")).strip() or "0")
            if str((r.get("metadata") or {}).get("chunk_index", "0")).strip().isdigit()
            else 0
        )

        chunk_lines = []
        doc_chars = 0
        for row in rows:
            txt = _clean_chunk_text(row.get("content") or "")
            if not txt:
                continue
            txt = txt[:1600]
            if doc_chars + len(txt) > 9000:
                break
            chunk_lines.append(txt)
            doc_chars += len(txt)
            if len(chunk_lines) >= 30:
                break

        if not chunk_lines:
            continue

        block = f"[{doc.filename or doc.doc_id}]\n" + "\n\n".join(chunk_lines)
        if used + len(block) > max_chars:
            remaining = max_chars - used
            if remaining > 800:
                content_blocks.append(block[:remaining])
            break
        content_blocks.append(block)
        used += len(block)

    return "\n\n".join(content_blocks).strip(), inferred_topic

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
        profile.update(
            {
                "difficulty_level": getattr(
                    comprehensive_profile, "difficulty_level", "intermediate"
                ),
                "learning_pace": getattr(
                    comprehensive_profile, "learning_pace", "moderate"
                ),
                "study_environment": getattr(
                    comprehensive_profile, "study_environment", "quiet"
                ),
                "preferred_language": getattr(
                    comprehensive_profile, "preferred_language", "english"
                ),
                "study_goals": getattr(comprehensive_profile, "study_goals", None),
                "career_goals": getattr(comprehensive_profile, "career_goals", None),
                "primary_archetype": getattr(
                    comprehensive_profile, "primary_archetype", ""
                ),
                "secondary_archetype": getattr(
                    comprehensive_profile, "secondary_archetype", ""
                ),
                "archetype_description": getattr(
                    comprehensive_profile, "archetype_description", ""
                ),
            }
        )
    return profile

@router.post("/generate_practice_questions")
async def generate_practice_questions(
    payload: dict = Body(...), db: Session = Depends(get_db)
):
    request_started = time.perf_counter()
    try:
        user_id = payload.get("user_id")
        topic = payload.get("topic") or payload.get("content", "")
        question_count = int(payload.get("question_count", 10))
        difficulty = payload.get("difficulty", "mixed")
        question_types = payload.get("question_types", ["multiple_choice"])
        title = payload.get("title", f"Practice: {topic[:50]}")
        content = payload.get("content", "")
        generation_type = payload.get("generation_type", "topic")
        additional_specs = payload.get("additional_specs", "")
        use_hs_context = bool(payload.get("use_hs_context", True))
        raw_doc_ids = payload.get("context_doc_ids", None)
        if isinstance(raw_doc_ids, str):
            doc_ids_list = [x.strip() for x in raw_doc_ids.split(",") if x.strip()]
        elif isinstance(raw_doc_ids, list):
            doc_ids_list = [str(x).strip() for x in raw_doc_ids if str(x).strip()]
        else:
            doc_ids_list = []

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        load_test_fallback = _load_test_fallback_enabled(user)

        logger.info(
            f"[QUIZ ROUTE] generate request | topic='{topic}' user={user.id} "
            f"HS_MODE={'ON  <-- curriculum RAG will run' if use_hs_context else 'OFF <-- no RAG, model-only'} "
            f"count={question_count} docs={len(doc_ids_list)} content_chars={len(content or '')}"
        )

        if doc_ids_list:
            collect_started = time.perf_counter()
            merged_content, inferred_topic = _collect_context_doc_content(
                db,
                user.id,
                doc_ids_list,
                focus_topic=topic,
            )
            if merged_content:
                content = merged_content
                if not topic or _looks_like_filename_topic(topic):
                    topic = inferred_topic or topic or "Selected context documents"
                generation_type = "chat_history"
                logger.info(
                    f"[QUIZ ROUTE] Using selected context_doc_ids content for generation "
                    f"(docs={len(doc_ids_list)}, content_chars={len(content)}, "
                    f"elapsed={time.perf_counter() - collect_started:.2f}s)"
                )
            else:
                logger.info(
                    f"[QUIZ ROUTE] Selected context_doc_ids produced no merged content "
                    f"(docs={len(doc_ids_list)}, elapsed={time.perf_counter() - collect_started:.2f}s)"
                )

        if not topic and not content:
            raise HTTPException(status_code=400, detail="Topic or content required")

        questions_data = []
        if load_test_fallback:
            questions_data = _build_local_question_fallback(
                topic=topic,
                question_count=question_count,
                difficulty=difficulty,
                question_types=question_types,
            )
        else:
            try:
                from graphs.quiz_graph import get_quiz_graph
                quiz_graph = get_quiz_graph()
                if quiz_graph:
                    graph_started = time.perf_counter()
                    questions_data = await quiz_graph.invoke(
                        user_id=str(user.id),
                        topic=topic,
                        content=content,
                        generation_type=generation_type,
                        question_count=question_count,
                        difficulty=difficulty,
                        question_types=question_types,
                        additional_specs=additional_specs,
                        use_hs_context=use_hs_context,
                        context_doc_ids=doc_ids_list,
                    )
                    logger.info(
                        "[QUIZ ROUTE] quiz graph returned questions=%s elapsed=%.2fs",
                        len(questions_data or []),
                        time.perf_counter() - graph_started,
                    )
            except Exception as graph_err:
                logger.warning(f"Quiz graph invoke failed, falling back to direct: {graph_err}")

        if not questions_data:
            fallback_started = time.perf_counter()
            difficulty_mix = payload.get("difficulty_mix", {"easy": 3, "medium": 5, "hard": 2})
            type_instructions = []
            if "multiple_choice" in question_types:
                type_instructions.append("multiple choice questions with 4 options")
            if "true_false" in question_types:
                type_instructions.append("true/false questions")
            if "short_answer" in question_types:
                type_instructions.append("short answer questions")
            type_str = ", ".join(type_instructions) if type_instructions else "multiple choice questions"

            source_block = ""
            if content:
                source_block = f"\n\n**SOURCE CONTENT (from selected docs/chat)**:\n{content[:12000]}\n"

            fallback_prompt = f"""Generate {question_count} educational practice questions about: {topic or 'the provided content'}

**DIFFICULTY DISTRIBUTION**:
- Easy: {difficulty_mix.get('easy', 3)} questions (basic recall and understanding)
- Medium: {difficulty_mix.get('medium', 5)} questions (application and analysis)
- Hard: {difficulty_mix.get('hard', 2)} questions (synthesis and evaluation)

**QUESTION TYPES**: Create {type_str}
{source_block}

**OUTPUT FORMAT** (JSON array only, no markdown):
[
  {{
    "question_text": "Clear, specific question?",
    "question_type": "multiple_choice|true_false|short_answer",
    "correct_answer": "Full text of the correct option",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "difficulty": "easy|medium|hard",
    "explanation": "Why this answer is correct",
    "topic": "{topic[:100]}"
  }}
]

Generate exactly {question_count} high-quality questions:"""

            try:
                response_text = await call_ai_async(fallback_prompt, max_tokens=4000, temperature=0.7)
                response_text = process_math_in_response(response_text)
                questions_data = parse_json_array_response(response_text)
            except Exception as ai_err:
                logger.warning(
                    "[QUIZ ROUTE] direct AI fallback failed; using local question fallback: %s",
                    ai_err,
                )
                questions_data = _build_local_question_fallback(
                    topic=topic,
                    question_count=question_count,
                    difficulty=difficulty,
                    question_types=question_types,
                )
            if not questions_data:
                questions_data = _build_local_question_fallback(
                    topic=topic,
                    question_count=question_count,
                    difficulty=difficulty,
                    question_types=question_types,
                )
            logger.info(
                "[QUIZ ROUTE] direct fallback generated questions=%s elapsed=%.2fs",
                len(questions_data),
                time.perf_counter() - fallback_started,
            )

        if not questions_data:
            raise HTTPException(status_code=500, detail="No questions were generated")

        if load_test_fallback:
            return {
                "status": "success",
                "question_set_id": "load-test",
                "id": "load-test",
                "title": title,
                "question_count": len(questions_data),
                "questions": [
                    {
                        "id": idx + 1,
                        "question_text": q_data.get("question_text", ""),
                        "question_type": q_data.get("question_type", "multiple_choice"),
                        "difficulty": q_data.get("difficulty", difficulty),
                        "correct_answer": q_data.get("correct_answer", ""),
                        "options": q_data.get("options", []) or [],
                        "explanation": q_data.get("explanation", ""),
                        "topic": q_data.get("topic", topic[:100]),
                    }
                    for idx, q_data in enumerate(questions_data)
                ],
                "load_test_fallback": True,
                "persisted": False,
            }

        question_set = models.QuestionSet(
            user_id=user.id,
            title=title,
            description=f"Practice questions for {topic[:100]}",
            source_type="custom",
            total_questions=len(questions_data),
        )
        db.add(question_set)
        db.commit()
        db.refresh(question_set)
        save_started = time.perf_counter()

        for idx, q_data in enumerate(questions_data):
            question = models.Question(
                question_set_id=question_set.id,
                question_text=q_data.get("question_text", ""),
                question_type=q_data.get("question_type", "multiple_choice"),
                correct_answer=str(q_data.get("correct_answer", "")),
                options=json.dumps(q_data.get("options", [])) if q_data.get("options") else None,
                difficulty=q_data.get("difficulty", "medium"),
                explanation=q_data.get("explanation", ""),
                topic=q_data.get("topic", topic[:100]),
                order_index=idx,
            )
            db.add(question)

        db.commit()
        db.refresh(question_set)
        logger.info(
            "[QUIZ ROUTE] saved question set id=%s questions=%s elapsed=%.2fs",
            question_set.id,
            len(questions_data),
            time.perf_counter() - save_started,
        )

        try:
            from tutor import chroma_store
            if chroma_store.available():
                chroma_store.write_episode(
                    user_id=str(user.id),
                    summary=(
                        f"Quiz created: \"{title}\" on {topic}. "
                        f"{len(questions_data)} questions, difficulty: {difficulty}."
                    ),
                    metadata={
                        "source": "quiz_created",
                        "topic": topic[:100],
                        "title": title[:100],
                        "question_count": len(questions_data),
                        "difficulty": difficulty,
                        "question_set_id": str(question_set.id),
                    },
                )
        except Exception as chroma_err:
            logger.warning(f"Chroma write failed on quiz create: {chroma_err}")

        questions = (
            db.query(models.Question)
            .filter(models.Question.question_set_id == question_set.id)
            .order_by(models.Question.order_index)
            .all()
        )

        logger.info(
            f"Generated {len(questions)} practice questions for user {user.id} on topic: {topic[:50]} "
            f"total_elapsed={time.perf_counter() - request_started:.2f}s"
        )

        return {
            "status": "success",
            "question_set_id": question_set.id,
            "id": question_set.id,
            "title": question_set.title,
            "question_count": len(questions),
            "questions": [
                {
                    "id": q.id,
                    "question_text": q.question_text,
                    "question_type": q.question_type,
                    "difficulty": q.difficulty,
                    "correct_answer": q.correct_answer,
                    "options": json.loads(q.options) if q.options else [],
                    "explanation": q.explanation,
                    "topic": q.topic,
                }
                for q in questions
            ],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating practice questions: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/generate_questions")
async def generate_questions(
    payload: dict = Body(...), db: Session = Depends(get_db)
):
    try:
        user_id = payload.get("user_id")
        chat_session_ids = payload.get("chat_session_ids", [])
        slide_ids = payload.get("slide_ids", [])
        question_count = payload.get("question_count", 10)
        difficulty_mix = payload.get("difficulty_mix", {"easy": 3, "medium": 5, "hard": 2})

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not chat_session_ids and not slide_ids:
            raise HTTPException(status_code=400, detail="At least one source required")

        source_content = ""

        if chat_session_ids:
            sessions = (
                db.query(models.ChatSession)
                .filter(
                    models.ChatSession.id.in_(chat_session_ids),
                    models.ChatSession.user_id == user.id,
                )
                .all()
            )

            for session in sessions:
                messages = (
                    db.query(models.ChatMessage)
                    .filter(models.ChatMessage.chat_session_id == session.id)
                    .limit(20)
                    .all()
                )

                for msg in messages:
                    source_content += f"Q: {msg.user_message}\nA: {msg.ai_response}\n\n"

        if slide_ids:
            slides = (
                db.query(models.UploadedSlide)
                .filter(
                    models.UploadedSlide.id.in_(slide_ids),
                    models.UploadedSlide.user_id == user.id,
                )
                .all()
            )

            for slide in slides:
                if slide.extracted_text:
                    source_content += (
                        f"\n\nSlide: {slide.original_filename}\n{slide.extracted_text[:2000]}\n"
                    )

        source_content = source_content[:6000]

        prompt = f"""Generate {question_count} educational questions based on this content.

**DIFFICULTY DISTRIBUTION**:
- Easy: {difficulty_mix.get('easy', 3)} questions
- Medium: {difficulty_mix.get('medium', 5)} questions
- Hard: {difficulty_mix.get('hard', 2)} questions

**QUESTION TYPES**: Mix of multiple choice, true/false, and short answer

**SOURCE CONTENT**:
{source_content}

**OUTPUT FORMAT** (JSON array only):
[
  {{
    "question_text": "Question here?",
    "question_type": "multiple_choice|true_false|short_answer",
    "correct_answer": "Correct answer",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "difficulty": "easy|medium|hard",
    "explanation": "Why this is correct",
    "topic": "Topic name"
  }}
]

Generate exactly {question_count} questions:"""

        response_text = await call_ai_async(prompt, max_tokens=3000, temperature=0.7)
        response_text = process_math_in_response(response_text)

        questions_data = parse_json_array_response(response_text)
        if not questions_data:
            logger.error("Failed to parse questions: no valid JSON array in AI response")

        question_set = models.QuestionSet(
            user_id=user.id,
            title=f"Questions - {datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
            description="Auto-generated questions",
            source_type=(
                "mixed"
                if (chat_session_ids and slide_ids)
                else ("chat" if chat_session_ids else "slides")
            ),
            source_chat_sessions=json.dumps(chat_session_ids) if chat_session_ids else None,
            source_slides=json.dumps(slide_ids) if slide_ids else None,
            question_count=len(questions_data),
            easy_count=difficulty_mix.get("easy", 0),
            medium_count=difficulty_mix.get("medium", 0),
            hard_count=difficulty_mix.get("hard", 0),
            status="active",
        )

        db.add(question_set)
        db.commit()
        db.refresh(question_set)

        for idx, q_data in enumerate(questions_data):
            question = models.Question(
                question_set_id=question_set.id,
                question_text=q_data.get("question_text", ""),
                question_type=q_data.get("question_type", "multiple_choice"),
                correct_answer=q_data.get("correct_answer", ""),
                options=json.dumps(q_data.get("options", [])) if q_data.get("options") else None,
                difficulty=q_data.get("difficulty", "medium"),
                explanation=q_data.get("explanation", ""),
                topic=q_data.get("topic", "General"),
                order_index=idx,
            )
            db.add(question)

        db.commit()
        db.refresh(question_set)

        questions = (
            db.query(models.Question)
            .filter(models.Question.question_set_id == question_set.id)
            .order_by(models.Question.order_index)
            .all()
        )

        return {
            "status": "success",
            "question_set_id": question_set.id,
            "id": question_set.id,
            "title": question_set.title,
            "question_count": len(questions),
            "questions": [
                {
                    "id": q.id,
                    "question_text": q.question_text,
                    "question_type": q.question_type,
                    "difficulty": q.difficulty,
                    "options": json.loads(q.options) if q.options else [],
                }
                for q in questions
            ],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating questions: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_question_sets")
def get_question_sets(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        question_sets = (
            db.query(models.QuestionSet)
            .filter(models.QuestionSet.user_id == user.id)
            .order_by(models.QuestionSet.created_at.desc())
            .all()
        )

        question_sets_payload = []
        for qs in question_sets:
            total_questions = getattr(qs, "total_questions", None)
            if total_questions is None:
                total_questions = getattr(qs, "question_count", 0)

            attempt_count = getattr(qs, "attempt_count", None)
            if attempt_count is None:
                attempt_count = getattr(qs, "attempts", 0) or 0

            status = getattr(qs, "status", None) or "ready"

            question_sets_payload.append({
                "id": qs.id,
                "title": qs.title,
                "description": qs.description,
                "question_count": total_questions,
                "easy_count": getattr(qs, "easy_count", 0),
                "medium_count": getattr(qs, "medium_count", 0),
                "hard_count": getattr(qs, "hard_count", 0),
                "best_score": round(getattr(qs, "best_score", 0) or 0, 1),
                "attempt_count": attempt_count,
                "status": status,
                "can_practice": True,
                "created_at": qs.created_at.isoformat() + "Z",
            })

        return {"question_sets": question_sets_payload}

    except Exception as e:
        logger.error(f"Error getting question sets: {str(e)}")
        return {"question_sets": []}

@router.delete("/delete_question_set/{question_set_id}")
def delete_question_set(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        question_set = (
            db.query(models.QuestionSet)
            .filter(
                models.QuestionSet.id == question_set_id,
                models.QuestionSet.user_id == current_user.id,
            )
            .first()
        )

        if not question_set:
            raise HTTPException(status_code=404, detail="Question set not found")

        db.query(models.QuestionResult).filter(
            models.QuestionResult.question_id.in_(
                db.query(models.Question.id).filter(
                    models.Question.question_set_id == question_set_id
                )
            )
        ).delete(synchronize_session=False)

        db.query(models.QuestionAttempt).filter(
            models.QuestionAttempt.question_set_id == question_set_id
        ).delete()

        db.query(models.Question).filter(
            models.Question.question_set_id == question_set_id
        ).delete()

        db.delete(question_set)
        db.commit()

        return {"status": "success", "message": "Question set deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting question set: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/submit_question_answers")
async def submit_question_answers(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        question_set_id = payload.get("question_set_id")
        answers = payload.get("answers", {})

        question_set = (
            db.query(models.QuestionSet)
            .filter(
                models.QuestionSet.id == question_set_id,
                models.QuestionSet.user_id == current_user.id,
            )
            .first()
        )

        if not question_set:
            raise HTTPException(status_code=404, detail="Question set not found")

        questions = (
            db.query(models.Question)
            .filter(models.Question.question_set_id == question_set_id)
            .all()
        )

        correct_count = 0
        incorrect_count = 0
        question_results = []

        for question in questions:
            question_id_str = str(question.id)

            if question_id_str not in answers:
                is_correct = False
                display_answer = "No answer provided"
            else:
                user_answer = answers[question_id_str]

                if user_answer is None or (
                    isinstance(user_answer, str) and user_answer.strip() == ""
                ):
                    is_correct = False
                    display_answer = "No answer provided"
                else:
                    display_answer = user_answer

                    if question.question_type == "multiple_choice":
                        is_correct = (
                            user_answer.strip().lower() == question.correct_answer.strip().lower()
                        )
                    elif question.question_type == "true_false":
                        is_correct = (
                            user_answer.strip().lower() == question.correct_answer.strip().lower()
                        )
                    else:
                        is_correct = (
                            user_answer.strip().lower() in question.correct_answer.strip().lower()
                        )

            if is_correct:
                correct_count += 1
            else:
                incorrect_count += 1

            question_results.append(
                {
                    "question_id": question.id,
                    "question_text": question.question_text,
                    "user_answer": display_answer,
                    "correct_answer": question.correct_answer,
                    "is_correct": is_correct,
                    "explanation": question.explanation,
                }
            )

        score = (correct_count / len(questions) * 100) if questions else 0

        attempt = models.QuestionAttempt(
            question_set_id=question_set_id,
            user_id=question_set.user_id,
            attempt_number=(question_set.attempts or 0) + 1,
            answers=json.dumps(answers),
            score=score,
            correct_count=correct_count,
            incorrect_count=incorrect_count,
            total_questions=len(questions),
            submitted_at=datetime.now(timezone.utc),
        )

        db.add(attempt)

        # NOTE: models.QuestionSet has no `attempt_count` column (only `attempts`)
        # -- `question_set.attempt_count += 1` unconditionally raised AttributeError
        # on every submission, pre-existing and unrelated to this session's changes.
        question_set.attempts = (question_set.attempts or 0) + 1
        if score > question_set.best_score:
            question_set.best_score = score

        db.commit()

        topic = (question_set.title or "").replace("Practice: ", "").strip()

        try:
            from tutor import chroma_store
            if chroma_store.available():
                chroma_store.write_episode(
                    user_id=str(question_set.user_id),
                    summary=(
                        f"Quiz completed: \"{question_set.title}\" — scored {score:.1f}% "
                        f"({correct_count}/{len(questions)} correct)."
                    ),
                    metadata={
                        "source": "quiz_completed",
                        "topic": topic[:100],
                        "title": (question_set.title or "")[:100],
                        "score": str(round(score, 1)),
                        "correct": str(correct_count),
                        "total": str(len(questions)),
                        "question_set_id": str(question_set_id),
                    },
                )
                chroma_store.write_quiz_result(
                    user_id=str(question_set.user_id),
                    topic=topic,
                    score=score,
                    correct=correct_count,
                    total=len(questions),
                    metadata={"question_set_id": str(question_set_id)},
                )
        except Exception as chroma_err:
            logger.warning(f"Chroma write failed on quiz submit: {chroma_err}")

        try:
            from services.context_agent import get_context_agent, LearningEvent
            _agent = get_context_agent()
            if _agent and topic:
                _event = LearningEvent(
                    student_id=str(question_set.user_id),
                    source="quiz",
                    event_type="completed",
                    concept_id=_topic_concept_id(topic),
                    concept_name=topic[:100],
                    correct=score >= 70,
                    score=score / 100.0,
                    wrong_questions=incorrect_count,
                    time_seconds=0,
                )
                _agent.record_event(db, _event)
        except Exception as _ae:
            logger.debug(f"[Quiz] agent event skipped: {_ae}")

        # ── Write to UserWeakArea so Weaknesses page always has data ──
        if topic:
            try:
                from datetime import timezone as _tz
                _now = datetime.now(_tz.utc)
                _existing = db.query(models.UserWeakArea).filter(
                    models.UserWeakArea.user_id == question_set.user_id,
                    models.UserWeakArea.topic == topic[:255],
                ).first()
                if _existing:
                    _total = (_existing.total_questions or 0) + len(questions)
                    _correct = (_existing.correct_count or 0) + correct_count
                    _wrong = (_existing.incorrect_count or 0) + incorrect_count
                    _acc = round(_correct / _total * 100, 1) if _total else 0.0
                    _existing.total_questions = _total
                    _existing.correct_count = _correct
                    _existing.incorrect_count = _wrong
                    _existing.accuracy = _acc
                    _existing.weakness_score = max(_existing.weakness_score or 0.0, round((100 - _acc) * 0.8, 1))
                    _existing.last_practiced = _now
                    if score < 60:
                        _existing.consecutive_wrong = (_existing.consecutive_wrong or 0) + incorrect_count
                        _existing.status = "critical" if _acc < 50 else "needs_practice"
                        _existing.priority = min(10, (_existing.priority or 5) + 1)
                    elif score >= 80:
                        _existing.status = "improving"
                        _existing.improvement_rate = min(1.0, (_existing.improvement_rate or 0.0) + 0.1)
                    db.commit()
                elif score < 75:
                    _status = "critical" if score < 50 else "needs_practice"
                    _wa = models.UserWeakArea(
                        user_id=question_set.user_id,
                        topic=topic[:255],
                        total_questions=len(questions),
                        correct_count=correct_count,
                        incorrect_count=incorrect_count,
                        accuracy=round(score, 1),
                        weakness_score=round((100 - score) * 0.8, 1),
                        consecutive_wrong=incorrect_count,
                        practice_sessions=1,
                        last_practiced=_now,
                        improvement_rate=0.0,
                        status=_status,
                        priority=8 if score < 50 else 5,
                    )
                    db.add(_wa)
                    db.commit()
            except Exception as _we:
                logger.warning(f"UserWeakArea write failed: {_we}")

        return {
            "status": "success",
            "score": round(score, 1),
            "correct_count": correct_count,
            "incorrect_count": incorrect_count,
            "total_questions": len(questions),
            "question_results": question_results,
            "feedback": f"You scored {round(score, 1)}%! {'Excellent work!' if score >= 80 else 'Keep practicing!'}",
        }

    except Exception as e:
        logger.error(f"Error submitting answers: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_question_set_details/{question_set_id}")
def get_question_set_details(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        question_set = (
            db.query(models.QuestionSet)
            .filter(
                models.QuestionSet.id == question_set_id,
                models.QuestionSet.user_id == current_user.id,
            )
            .first()
        )

        if not question_set:
            raise HTTPException(status_code=404, detail="Question set not found")

        questions = (
            db.query(models.Question)
            .filter(models.Question.question_set_id == question_set_id)
            .order_by(models.Question.order_index)
            .all()
        )

        return {
            "id": question_set.id,
            "title": question_set.title,
            "description": question_set.description,
            "question_count": len(questions),
            "status": question_set.status,
            "questions": [
                {
                    "id": q.id,
                    "question_text": q.question_text,
                    "question_type": q.question_type,
                    "correct_answer": q.correct_answer,
                    "options": json.loads(q.options) if q.options else [],
                    "difficulty": q.difficulty,
                    "explanation": q.explanation,
                    "topic": q.topic,
                }
                for q in questions
            ],
        }

    except Exception as e:
        logger.error(f"Error getting question set details: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/submit_learning_response")
async def submit_learning_response(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        review_id = payload.get("review_id")
        user_response = payload.get("user_response", "")
        attempt_number = payload.get("attempt_number", 1)

        if not review_id or not user_response.strip():
            raise HTTPException(status_code=400, detail="Review ID and response are required")

        review = (
            db.query(models.LearningReview)
            .filter(
                models.LearningReview.id == review_id,
                models.LearningReview.user_id == current_user.id,
            )
            .first()
        )

        if not review:
            raise HTTPException(status_code=404, detail="Learning review not found")

        try:
            expected_points = json.loads(review.expected_points)
        except Exception:
            expected_points = []

        if not expected_points:
            raise HTTPException(status_code=400, detail="No learning points found in review")

        user = db.query(models.User).filter(models.User.id == review.user_id).first()

        evaluation_prompt = f"""Evaluate student's learning retention.

**EXPECTED POINTS**:
{chr(10).join([f"{i+1}. {point}" for i, point in enumerate(expected_points)])}

**STUDENT RESPONSE**:
{user_response}

**RULES**: Point is "covered" if student shows understanding (semantic match, not exact words).

**OUTPUT JSON**:
{{
  "covered_points": ["Covered points from expected list"],
  "missing_points": ["Missing points from expected list"],
  "coverage_percentage": <0-100>,
  "understanding_quality": "<poor|fair|good|excellent>",
  "feedback": "Brief feedback on strengths/improvements",
  "next_steps": "Actionable advice"
}}"""

        response_text = await call_ai_async(evaluation_prompt, max_tokens=2048, temperature=0.3)

        try:
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                evaluation = json.loads(json_match.group())
            else:
                raise ValueError("No JSON found in response")
        except Exception as e:
            logger.error(f"Failed to parse evaluation JSON: {str(e)}")
            logger.error(f"Raw response: {response_text}")
            evaluation = {
                "covered_points": [],
                "missing_points": expected_points,
                "coverage_percentage": 0,
                "understanding_quality": "fair",
                "feedback": "Unable to properly evaluate your response. Please try again with more detail.",
                "next_steps": "Write a more comprehensive response covering all key concepts.",
            }

        covered_points = evaluation.get("covered_points", [])
        missing_points = evaluation.get("missing_points", [])
        coverage_percentage = evaluation.get("coverage_percentage", 0)
        understanding_quality = evaluation.get("understanding_quality", "fair")
        feedback = evaluation.get("feedback", "")
        next_steps = evaluation.get("next_steps", "")

        attempt = models.LearningReviewAttempt(
            review_id=review.id,
            attempt_number=attempt_number,
            user_response=user_response,
            covered_points=json.dumps(covered_points),
            missing_points=json.dumps(missing_points),
            completeness_percentage=coverage_percentage,
            feedback=feedback,
            submitted_at=datetime.now(timezone.utc),
        )
        db.add(attempt)

        review.current_attempt = attempt_number
        review.attempt_count = max(review.attempt_count, attempt_number)

        if coverage_percentage > review.best_score:
            review.best_score = coverage_percentage

        is_complete = coverage_percentage >= 80.0 or attempt_number >= 3

        if is_complete and coverage_percentage >= 80.0:
            review.status = "completed"
            review.completed_at = datetime.now(timezone.utc)

        review.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(attempt)

        return {
            "status": "success",
            "attempt_id": attempt.id,
            "attempt_number": attempt_number,
            "covered_points": covered_points,
            "missing_points": missing_points,
            "completeness_percentage": round(coverage_percentage, 1),
            "understanding_quality": understanding_quality,
            "feedback": feedback,
            "next_steps": next_steps,
            "is_complete": is_complete,
            "can_continue": not is_complete and attempt_number < 5,
            "best_score": review.best_score,
            "points_covered_count": len(covered_points),
            "points_missing_count": len(missing_points),
            "total_points": len(expected_points),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting learning response: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to evaluate learning response",
        )

@router.get("/get_generated_questions")
def get_generated_questions(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        question_sets = (
            db.query(models.QuestionSet)
            .filter(models.QuestionSet.user_id == user.id)
            .order_by(models.QuestionSet.created_at.desc())
            .all()
        )

        question_sets_payload = []
        for qs in question_sets:
            total_questions = getattr(qs, "total_questions", None)
            if total_questions is None:
                total_questions = getattr(qs, "question_count", 0)

            attempt_count = getattr(qs, "attempt_count", None)
            if attempt_count is None:
                attempt_count = getattr(qs, "attempts", 0) or 0

            status = getattr(qs, "status", None) or "ready"

            question_sets_payload.append({
                "id": qs.id,
                "title": qs.title,
                "question_count": total_questions,
                "created_at": qs.created_at.isoformat() + "Z",
                "status": status,
                "best_score": round(getattr(qs, "best_score", 0) or 0, 1),
                "attempt_count": attempt_count,
            })

        return {"question_sets": question_sets_payload}

    except Exception as e:
        logger.error(f"Error getting generated questions: {str(e)}")
        return {"question_sets": []}

@router.get("/get_question_set/{question_set_id}")
def get_question_set_with_questions(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        question_set = (
            db.query(models.QuestionSet)
            .filter(
                models.QuestionSet.id == question_set_id,
                models.QuestionSet.user_id == current_user.id,
            )
            .first()
        )

        if not question_set:
            raise HTTPException(status_code=404, detail="Question set not found")

        questions = (
            db.query(models.Question)
            .filter(models.Question.question_set_id == question_set_id)
            .order_by(models.Question.order_index)
            .all()
        )

        return {
            "id": question_set.id,
            "title": question_set.title,
            "description": question_set.description,
            "questions": [
                {
                    "id": q.id,
                    "question_text": q.question_text,
                    "question_type": q.question_type,
                    "options": json.loads(q.options) if q.options else [],
                    "difficulty": q.difficulty,
                    "explanation": q.explanation,
                    "topic": q.topic,
                }
                for q in questions
            ],
        }

    except Exception as e:
        logger.error(f"Error getting question set: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/submit_answers")
async def submit_answers(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        question_set_id = payload.get("question_set_id")
        answers = payload.get("answers", {})
        user = current_user

        question_set = (
            db.query(models.QuestionSet)
            .filter(
                models.QuestionSet.id == question_set_id,
                models.QuestionSet.user_id == current_user.id,
            )
            .first()
        )

        if not question_set:
            raise HTTPException(status_code=404, detail="Question set not found")

        questions = (
            db.query(models.Question)
            .filter(models.Question.question_set_id == question_set_id)
            .all()
        )

        results = []
        correct_count = 0

        for question in questions:
            user_answer = answers.get(str(question.id), "").strip()
            is_correct = False

            if question.question_type == "multiple_choice":
                is_correct = user_answer.lower() == question.correct_answer.lower()
            elif question.question_type == "true_false":
                is_correct = user_answer.lower() == question.correct_answer.lower()
            else:
                is_correct = any(
                    keyword in user_answer.lower()
                    for keyword in question.correct_answer.lower().split()[:3]
                )

            if is_correct:
                correct_count += 1

            results.append(
                {
                    "question_id": question.id,
                    "user_answer": user_answer,
                    "correct_answer": question.correct_answer,
                    "is_correct": is_correct,
                    "explanation": question.explanation,
                }
            )

        score = (correct_count / len(questions)) * 100 if questions else 0

        question_set.attempts = (question_set.attempts or 0) + 1
        if score > question_set.best_score:
            question_set.best_score = score

        attempt = models.QuestionAttempt(
            question_set_id=question_set_id,
            user_id=user.id,
            attempt_number=question_set.attempts,
            answers=json.dumps(answers),
            score=score,
            correct_count=correct_count,
            incorrect_count=len(questions) - correct_count,
            total_questions=len(questions),
            submitted_at=datetime.now(timezone.utc),
        )
        db.add(attempt)
        db.commit()

        return {
            "status": "success",
            "score": round(score, 1),
            "correct_count": correct_count,
            "total_questions": len(questions),
            "details": results,
        }

    except Exception as e:
        logger.error(f"Error submitting answers: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_hints/{question_id}")
def get_hints_for_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        question = (
            db.query(models.Question)
            .join(models.QuestionSet, models.Question.question_set_id == models.QuestionSet.id)
            .filter(
                models.Question.id == question_id,
                models.QuestionSet.user_id == current_user.id,
            )
            .first()
        )

        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        hints = []

        if question.question_type == "multiple_choice":
            options = json.loads(question.options) if question.options else []
            if len(options) >= 2:
                hints.append("Consider the options carefully. Eliminate obviously wrong answers first.")
                hints.append(f"The correct answer relates to: {question.topic}")

        elif question.question_type == "true_false":
            hints.append(f"Think about the fundamental concepts of {question.topic}")
            hints.append("Consider real-world applications of this concept")

        else:
            hints.append(f"Focus on the key terms related to {question.topic}")
            hints.append("Think about how this concept is applied in practice")

        hints.append(f"Review your notes on {question.topic} if you're unsure")

        return {"question_id": question_id, "hints": hints[:3]}

    except Exception as e:
        logger.error(f"Error getting hints: {str(e)}")
        return {
            "question_id": question_id,
            "hints": ["Think about the main concepts covered in this topic."],
        }

@router.get("/get_quiz_history")
def get_quiz_history(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        result = []

        if hasattr(models, "QuizSession"):
            quiz_sessions = (
                db.query(models.QuizSession)
                .filter(models.QuizSession.user_id == user.id)
                .order_by(models.QuizSession.created_at.desc())
                .all()
            )

            for session in quiz_sessions:
                result.append(
                    {
                        "id": session.id,
                        "title": getattr(session, "title", "Quiz Session"),
                        "score": getattr(session, "score", 0),
                        "total_questions": getattr(session, "total_questions", 0),
                        "correct_answers": getattr(session, "correct_answers", 0),
                        "completed_at": (
                            session.completed_at.isoformat() + "Z"
                            if hasattr(session, "completed_at") and session.completed_at
                            else session.created_at.isoformat() + "Z"
                        ),
                        "created_at": session.created_at.isoformat() + "Z",
                    }
                )

        elif hasattr(models, "QuestionSet"):
            question_sets = (
                db.query(models.QuestionSet)
                .filter(models.QuestionSet.user_id == user.id)
                .order_by(models.QuestionSet.created_at.desc())
                .all()
            )

            for qs in question_sets:
                result.append(
                    {
                        "id": qs.id,
                        "title": qs.title or "Quiz Session",
                        "score": 0,
                        "total_questions": getattr(qs, "question_count", 0),
                        "correct_answers": 0,
                        "completed_at": qs.created_at.isoformat() + "Z",
                        "created_at": qs.created_at.isoformat() + "Z",
                    }
                )

        logger.info(f"Retrieved {len(result)} quiz sessions for user {user.email}")
        return result

    except Exception as e:
        logger.error(f"Error getting quiz history: {str(e)}", exc_info=True)
        return []
