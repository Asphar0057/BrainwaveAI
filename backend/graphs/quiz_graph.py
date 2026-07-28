from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional, TypedDict

from langgraph.graph import StateGraph, END
from services.ai_json_parser import parse_json_array_response
from services.context_store import format_rag_sources_block, resolve_citations

logger = logging.getLogger(__name__)

class QuizGenState(TypedDict, total=False):
    user_id: str
    topic: str
    content: str
    generation_type: str
    question_count: int
    difficulty: str
    question_types: list[str]
    additional_specs: str
    student_weaknesses: list[str]
    student_strengths: list[str]
    quiz_history: list[dict]
    rag_context: list[str]
    rag_sources: list[dict]
    use_hs_context: bool
    context_doc_ids: list[str]
    built_prompt: str
    questions_json: list[dict]
    _ai_client: Any
    _hs_ai_client: Any
    _db_factory: Any

async def fetch_context(state: QuizGenState) -> dict:
    started = time.perf_counter()
    user_id = state.get("user_id", "")
    db_factory = state.get("_db_factory")
    weaknesses = []
    strengths = []
    quiz_history = []

    if db_factory:
        try:
            from models import QuestionSet, QuestionAttempt
            from services.personalization_context import get_personalization_context
            db = db_factory()
            try:
                uid = int(user_id)

                ctx = get_personalization_context(db, user_id)
                weaknesses = ctx.weaknesses
                strengths = ctx.strengths

                recent_attempts = (
                    db.query(QuestionAttempt, QuestionSet)
                    .join(QuestionSet, QuestionAttempt.question_set_id == QuestionSet.id)
                    .filter(QuestionAttempt.user_id == uid)
                    .order_by(QuestionAttempt.submitted_at.desc())
                    .limit(5)
                    .all()
                )
                for attempt, qset in recent_attempts:
                    raw_title = qset.title or ""
                    clean_topic = raw_title.replace("Practice: ", "").strip()
                    quiz_history.append({
                        "topic": clean_topic,
                        "score": round(attempt.score, 1),
                        "correct": attempt.correct_count,
                        "total": attempt.total_questions,
                    })

            finally:
                db.close()
        except Exception as e:
            logger.warning(f"DB context fetch failed in quiz graph: {e}")
    logger.info(
        "[QUIZ TIMING] fetch_context db stage elapsed=%.2fs weaknesses=%s strengths=%s history=%s",
        time.perf_counter() - started,
        len(weaknesses),
        len(strengths),
        len(quiz_history),
    )

    rag_chunks: list[str] = []
    rag_sources: list[dict] = []
    topic = state.get("topic", "")
    use_hs = state.get("use_hs_context", True)
    context_doc_ids = state.get("context_doc_ids") or []
    logger.info(
        f"[QUIZ RAG] topic='{topic}' use_hs_context={use_hs} "
        f"user_id={user_id} context_doc_ids={len(context_doc_ids)}"
    )
    should_query_context = bool(topic and (use_hs or context_doc_ids))
    if should_query_context:
        rag_started = time.perf_counter()
        try:
            from services import context_store
            if context_store.available():
                if context_doc_ids:
                    results = context_store.get_document_chunks(
                        user_id=user_id,
                        doc_ids=context_doc_ids,
                        max_chunks_per_doc=5,
                        max_chars_per_chunk=1400,
                    )
                else:
                    results = context_store.search_context(
                        query=topic,
                        user_id=user_id,
                        use_hs=bool(use_hs),
                        top_k=4,
                    )
                rag_chunks = [r["text"] for r in results]
                rag_sources = context_store.build_rag_sources(results)
                if rag_chunks:
                    logger.info(
                        f"[QUIZ RAG] Retrieved {len(rag_chunks)} chunk(s) for '{topic}' "
                        f"(use_hs_context={use_hs})"
                    )
                    for i, r in enumerate(results):
                        preview = r["text"][:120].replace("\n", " ")
                        logger.info(
                            f"[QUIZ RAG]   chunk[{i}] source={r.get('source')} "
                            f"dist={float(r.get('distance', 0.0)):.4f} | {preview}..."
                        )
                else:
                    logger.info(f"[QUIZ RAG] No matching chunks found for '{topic}' in curriculum/docs")
            else:
                logger.info("[QUIZ RAG] context_store not available — skipping RAG")
        except Exception as e:
            logger.warning(f"RAG context fetch failed: {e}")
        logger.info(
            "[QUIZ TIMING] fetch_context rag stage elapsed=%.2fs chunks=%s chars=%s",
            time.perf_counter() - rag_started,
            len(rag_chunks),
            sum(len(chunk or "") for chunk in rag_chunks),
        )
    else:
        logger.info("[QUIZ RAG] No context query (missing topic and no selected docs)")

    logger.info(
        "[QUIZ TIMING] fetch_context total elapsed=%.2fs",
        time.perf_counter() - started,
    )
    return {
        "student_weaknesses": weaknesses,
        "student_strengths": strengths,
        "quiz_history": quiz_history,
        "rag_context": rag_chunks,
        "rag_sources": rag_sources,
    }

DIFFICULTY_GUIDES = {
    "easy": (
        "EASY level — basic recall and recognition.\n"
        "- Questions: 'What is...', 'Which of the following...', 'True or False:'\n"
        "- Test fundamental terminology, key facts, and basic definitions\n"
        "- Distractors: clearly wrong but plausible; student can eliminate by knowing basics"
    ),
    "medium": (
        "MEDIUM level — application and comprehension.\n"
        "- Questions: 'Why does...', 'How would you...', 'What happens when...'\n"
        "- Test understanding of relationships, cause/effect, applied concepts\n"
        "- Distractors: subtly wrong; require real understanding to eliminate"
    ),
    "hard": (
        "HARD level — analysis, synthesis, and edge cases.\n"
        "- Questions: 'Which best explains...', 'Analyze why...', 'Under what conditions...'\n"
        "- Test nuanced distinctions, multi-step reasoning, expert knowledge\n"
        "- Distractors: sophisticated; require deep understanding to distinguish from correct answer"
    ),
    "mixed": (
        "MIXED difficulty — balanced spread across all levels.\n"
        "- ~30% easy (recall/recognition), ~50% medium (application), ~20% hard (analysis)\n"
        "- Questions should progress naturally from foundational to advanced\n"
        "- Each question's distractors scaled to match its individual difficulty"
    ),
}

def build_prompt(state: QuizGenState) -> dict:
    topic = state.get("topic", "")
    content = state.get("content", "")
    generation_type = state.get("generation_type", "topic")
    question_count = state.get("question_count", 10)
    difficulty = state.get("difficulty", "mixed")
    question_types = state.get("question_types") or ["multiple_choice"]
    additional_specs = (state.get("additional_specs") or "").strip()
    weaknesses = state.get("student_weaknesses", [])
    strengths = state.get("student_strengths", [])
    quiz_history = state.get("quiz_history", [])

    if difficulty not in DIFFICULTY_GUIDES:
        difficulty = "mixed"

    parts = []

    if generation_type == "chat_history" and content:
        parts.append(
            f"Generate {question_count} quiz questions from this content:\n\n"
            f"{content[:3000]}\n"
        )
    elif generation_type == "weak_areas" and weaknesses:
        focus = weaknesses[:3]
        parts.append(
            f"Generate {question_count} quiz questions targeting these weak areas:\n"
            f"{', '.join(focus)}\n"
            f"(Topic context: {topic})\n"
        )
    else:
        parts.append(f"Generate {question_count} quiz questions about: {topic}\n")

    diff_guide = DIFFICULTY_GUIDES[difficulty]
    parts.append(f"DIFFICULTY:\n{diff_guide}\n")

    type_instructions = []
    if "multiple_choice" in question_types:
        type_instructions.append("multiple choice with 4 options (exactly one correct)")
    if "true_false" in question_types:
        type_instructions.append("true/false")
    if "short_answer" in question_types:
        type_instructions.append("short answer (concise phrase, not full sentence)")
    if type_instructions:
        parts.append(f"QUESTION TYPES: {', '.join(type_instructions)}\n")

    if weaknesses:
        parts.append(
            f"STUDENT WEAK AREAS: {', '.join(weaknesses[:5])}\n"
            "If relevant to the topic, include questions that target these gaps.\n"
        )
    if strengths:
        parts.append(
            f"STUDENT STRONG AREAS: {', '.join(strengths[:5])}\n"
            "Avoid trivially simple questions on these — challenge the student appropriately.\n"
        )

    if quiz_history:
        history_lines = []
        for h in quiz_history[:3]:
            status = "struggled" if h["score"] < 60 else ("passed" if h["score"] < 80 else "excelled")
            history_lines.append(f"{h['topic']} — {h['score']}% ({status})")
        parts.append(
            f"RECENT QUIZ PERFORMANCE:\n" + "\n".join(f"  • {l}" for l in history_lines) + "\n"
            "Use this to calibrate question difficulty and focus.\n"
        )

    if additional_specs:
        parts.append(f"ADDITIONAL INSTRUCTIONS FROM STUDENT:\n{additional_specs}\n")

    rag_context = state.get("rag_context", [])
    rag_sources = state.get("rag_sources") or []
    if rag_context:
        logger.info(f"[QUIZ PROMPT] *** INJECTING {len(rag_context)} RAG chunk(s) into prompt ***")
        context_block = (
            format_rag_sources_block(rag_sources, max_sources=4, max_chars=1400)
            if rag_sources
            else "\n---\n".join((chunk or "")[:1400] for chunk in rag_context[:4])
        )
        parts.append(
            f"RELEVANT CURRICULUM CONTEXT (from student's documents and HS curriculum):\n"
            f"{context_block}\n\n"
            "Prioritise this material when relevant to the topic. "
            "Use it to make quiz questions more curriculum-aligned and accurate. "
            "When a question's explanation draws on a specific source above, cite it inline "
            "in the explanation as [1], [2], etc., matching the source numbers.\n"
        )
    else:
        logger.info("[QUIZ PROMPT] No RAG context — generating from model knowledge only")

    parts.append(
        "MATH FORMATTING: For any mathematical expressions use LaTeX — "
        "\\( ... \\) for inline, \\[ ... \\] for display. "
        "Example: 'Solve \\(ax^2 + bx + c = 0\\)' — never write bare math.\n\n"
        "FORMAT: Return ONLY a valid JSON array. Each object must have:\n"
        '{"question_text": "Clear, specific question?", '
        '"question_type": "multiple_choice|true_false|short_answer", '
        '"correct_answer": "Full text of the correct answer (NOT A/B/C/D labels)", '
        '"options": ["Option 1", "Option 2", "Option 3", "Option 4"], '
        '"difficulty": "easy|medium|hard", '
        '"explanation": "1-2 sentence explanation of why this answer is correct", '
        f'"topic": "{(topic[:50] or "General")}"' + "}\n\n"
        "RULES:\n"
        "- For multiple_choice: exactly 4 options; correct_answer must be the FULL TEXT of the correct option\n"
        "- For true_false: options = ['True', 'False']; correct_answer is 'True' or 'False'\n"
        "- For short_answer: options = []; correct_answer is a short phrase\n"
        "- No duplicate or semantically redundant questions\n"
        "- explanations must be genuinely educational\n"
        "- No markdown fences or extra text — return only the JSON array"
    )

    prompt = "\n".join(parts)
    logger.info(
        "[QUIZ TIMING] build_prompt prompt_chars=%s rag_chunks=%s content_chars=%s",
        len(prompt),
        len(rag_context),
        len(content or ""),
    )
    return {"built_prompt": prompt}

def generate_questions_node(state: QuizGenState) -> dict:
    rag_active = bool(state.get("rag_context"))
    hs_ai = state.get("_hs_ai_client")
    ai_client = (hs_ai if rag_active and hs_ai else None) or state.get("_ai_client")
    if not ai_client:
        return {"questions_json": []}

    if rag_active and hs_ai:
        logger.info("[QUIZ GEN] Using HS context AI client (RAG-enriched prompt)")
    else:
        logger.info("[QUIZ GEN] Using main AI client")

    prompt = state.get("built_prompt", "")
    difficulty = state.get("difficulty", "mixed")
    question_count = state.get("question_count", 10)
    topic = state.get("topic", "")
    rag_sources = state.get("rag_sources") or []

    def _generate_with(client) -> list[dict]:
        started = time.perf_counter()
        provider = "hs_context" if client is hs_ai else "main"
        logger.info(
            "[QUIZ TIMING] model call start provider=%s prompt_chars=%s max_tokens=4000",
            provider,
            len(prompt or ""),
        )
        response = client.generate(prompt, max_tokens=4000, temperature=0.7)
        logger.info(
            "[QUIZ TIMING] model call complete provider=%s elapsed=%.2fs response_chars=%s",
            provider,
            time.perf_counter() - started,
            len(response or ""),
        )
        data = parse_json_array_response(response)

        valid = []
        for q in data[:question_count]:
            if not isinstance(q, dict):
                continue
            question_text = q.get("question_text", "").strip()
            if not question_text:
                continue

            q_type = q.get("question_type", "multiple_choice")
            correct = str(q.get("correct_answer", "")).strip()
            options = q.get("options", [])
            if isinstance(options, list):
                options = [str(o)[:300] for o in options[:4]]
            explanation = (q.get("explanation") or "")[:500]
            explanation = resolve_citations(explanation, rag_sources)

            if q_type == "multiple_choice" and len(options) < 2:
                continue

            q_difficulty = q.get("difficulty", "")
            if q_difficulty not in ("easy", "medium", "hard"):
                q_difficulty = difficulty if difficulty != "mixed" else "medium"

            valid.append({
                "question_text": question_text,
                "question_type": q_type,
                "correct_answer": correct,
                "options": options,
                "difficulty": q_difficulty,
                "explanation": explanation,
                "topic": (q.get("topic") or topic)[:100],
            })
        logger.info(
            "[QUIZ TIMING] parsed questions provider=%s valid=%s raw=%s",
            provider,
            len(valid),
            len(data),
        )
        return valid

    try:
        return {"questions_json": _generate_with(ai_client)}

    except Exception as e:
        main_ai = state.get("_ai_client")
        if ai_client is hs_ai and main_ai and main_ai is not ai_client:
            logger.error(f"HS quiz generation failed; falling back to main AI client: {e}")
            try:
                return {"questions_json": _generate_with(main_ai)}
            except Exception as fallback_error:
                logger.error(f"Main AI quiz fallback failed: {fallback_error}")
        logger.error(f"Quiz generation failed: {e}")
        return {"questions_json": []}

class QuizGraph:

    def __init__(self, ai_client: Any, db_session_factory: Any = None, hs_ai_client: Any = None):
        self.ai_client = ai_client
        self.hs_ai_client = hs_ai_client
        self.db_factory = db_session_factory
        self._graph = self._build()

    def _build(self):
        g = StateGraph(QuizGenState)
        g.add_node("fetch_context", fetch_context)
        g.add_node("build_prompt", build_prompt)
        g.add_node("generate_questions", generate_questions_node)
        g.set_entry_point("fetch_context")
        g.add_edge("fetch_context", "build_prompt")
        g.add_edge("build_prompt", "generate_questions")
        g.add_edge("generate_questions", END)
        return g.compile()

    async def invoke(
        self,
        user_id: str,
        topic: str = "",
        content: str = "",
        generation_type: str = "topic",
        question_count: int = 10,
        difficulty: str = "mixed",
        question_types: Optional[list] = None,
        additional_specs: str = "",
        use_hs_context: bool = True,
        context_doc_ids: list = None,
    ) -> list[dict]:
        initial_state: QuizGenState = {
            "user_id": user_id,
            "topic": topic,
            "content": content,
            "generation_type": generation_type,
            "question_count": question_count,
            "difficulty": difficulty,
            "question_types": question_types or ["multiple_choice"],
            "additional_specs": additional_specs,
            "use_hs_context": use_hs_context,
            "context_doc_ids": context_doc_ids or [],
            "_ai_client": self.ai_client,
            "_hs_ai_client": self.hs_ai_client,
            "_db_factory": self.db_factory,
        }
        try:
            started = time.perf_counter()
            result = await self._graph.ainvoke(initial_state)
            questions = result.get("questions_json", [])
            logger.info(
                "[QUIZ TIMING] graph invoke complete elapsed=%.2fs questions=%s topic='%s' hs=%s docs=%s",
                time.perf_counter() - started,
                len(questions),
                topic[:80],
                use_hs_context,
                len(context_doc_ids or []),
            )
            return questions
        except Exception as e:
            logger.error(f"Quiz graph failed: {e}")
            return []

_quiz_graph: Optional[QuizGraph] = None

def create_quiz_graph(ai_client: Any, db_session_factory: Any = None, hs_ai_client: Any = None) -> QuizGraph:
    global _quiz_graph
    _quiz_graph = QuizGraph(ai_client, db_session_factory, hs_ai_client=hs_ai_client)
    return _quiz_graph

def get_quiz_graph() -> Optional[QuizGraph]:
    return _quiz_graph
