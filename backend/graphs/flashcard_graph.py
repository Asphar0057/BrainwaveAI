from __future__ import annotations

import re
import logging
from typing import Any, Optional, TypedDict

from langgraph.graph import StateGraph, END
from services.ai_json_parser import parse_json_array_response

logger = logging.getLogger(__name__)

class FlashcardGenState(TypedDict, total=False):
    user_id: str
    topic: str
    content: str
    generation_type: str
    card_count: int
    difficulty: str
    depth_level: str
    additional_specs: str
    student_weaknesses: list[str]
    student_strengths: list[str]
    rag_context: list[str]
    use_hs_context: bool
    context_doc_ids: list[str]
    built_prompt: str
    flashcards_json: list[dict]
    _ai_client: Any
    _hs_ai_client: Any
    _db_factory: Any

async def fetch_context(state: FlashcardGenState) -> dict:
    user_id = state.get("user_id", "")
    db_factory = state.get("_db_factory")
    weaknesses = []
    strengths = []

    if db_factory:
        try:
            from models import UserWeakArea, TopicMastery
            db = db_factory()
            try:
                uid = int(user_id)
                weak_areas = (
                    db.query(UserWeakArea)
                    .filter(UserWeakArea.user_id == uid)
                    .order_by(UserWeakArea.weakness_score.desc())
                    .limit(5)
                    .all()
                )
                for wa in weak_areas:
                    if wa.topic and wa.topic not in weaknesses:
                        weaknesses.append(wa.topic)

                mastery = (
                    db.query(TopicMastery)
                    .filter(TopicMastery.user_id == uid, TopicMastery.mastery_level >= 0.7)
                    .limit(5)
                    .all()
                )
                for tm in mastery:
                    if tm.topic_name and tm.topic_name not in strengths:
                        strengths.append(tm.topic_name)
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"DB context fetch failed: {e}")

    rag_chunks: list[str] = []
    topic = state.get("topic", "")
    use_hs = state.get("use_hs_context", True)
    context_doc_ids = state.get("context_doc_ids") or []
    logger.info(
        f"[FLASHCARD RAG] topic='{topic}' use_hs_context={use_hs} "
        f"user_id={user_id} context_doc_ids={len(context_doc_ids)}"
    )
    should_query_context = bool(topic and (use_hs or context_doc_ids))
    if should_query_context:
        try:
            from services import context_store
            if context_store.available():
                if context_doc_ids:
                    results = context_store.get_document_chunks(
                        user_id=user_id,
                        doc_ids=context_doc_ids,
                        max_chunks_per_doc=10,
                        max_chars_per_chunk=1800,
                    )
                else:
                    results = context_store.search_context(
                        query=topic,
                        user_id=user_id,
                        use_hs=bool(use_hs),
                        top_k=8,
                    )
                rag_chunks = [r["text"] for r in results]
                if rag_chunks:
                    logger.info(
                        f"[FLASHCARD RAG] Retrieved {len(rag_chunks)} chunk(s) for '{topic}' "
                        f"(use_hs_context={use_hs})"
                    )
                    for i, r in enumerate(results):
                        preview = r["text"][:120].replace("\n", " ")
                        logger.info(
                            f"[FLASHCARD RAG]   chunk[{i}] source={r.get('source')} "
                            f"dist={float(r.get('distance', 0.0)):.4f} | {preview}..."
                        )
                else:
                    logger.info(f"[FLASHCARD RAG] No matching chunks found for '{topic}' in curriculum/docs")
            else:
                logger.info("[FLASHCARD RAG] context_store not available — skipping RAG")
        except Exception as e:
            logger.warning(f"RAG context fetch failed: {e}")
    else:
        logger.info(f"[FLASHCARD RAG] No context query (missing topic and no selected docs)")

    return {
        "student_weaknesses": weaknesses,
        "student_strengths": strengths,
        "rag_context": rag_chunks,
    }

DIFFICULTY_GUIDES = {
    "easy": (
        "EASY level — basic recall and definitions.\n"
        "- Questions: 'What is...', 'Define...', 'Name the...'\n"
        "- Answers: short, factual, 1-2 sentences\n"
        "- Focus on terminology, key facts, straightforward concepts"
    ),
    "medium": (
        "MEDIUM level — application and understanding.\n"
        "- Questions: 'Why does...', 'How would you...', 'Compare...'\n"
        "- Answers: explanatory, 2-3 sentences with reasoning\n"
        "- Focus on understanding relationships, applying concepts"
    ),
    "hard": (
        "HARD level — analysis, synthesis, and edge cases.\n"
        "- Questions: 'What happens if...', 'Analyze why...', 'Design a...'\n"
        "- Answers: detailed, 3-4 sentences, may include nuances\n"
        "- Focus on tricky distinctions, multi-step reasoning, expert knowledge"
    ),
}

DEPTH_GUIDES = {
    "surface": (
        "SURFACE depth — broad overview.\n"
        "- Cover many different subtopics at a high level\n"
        "- Don't go into detailed mechanisms or edge cases\n"
        "- Good for initial exposure and general awareness"
    ),
    "standard": (
        "STANDARD depth — balanced coverage.\n"
        "- Cover key subtopics with reasonable detail\n"
        "- Include some 'why' and 'how', not just 'what'\n"
        "- Balance breadth and depth"
    ),
    "deep": (
        "DEEP depth — nuanced and thorough.\n"
        "- Go deep into specific subtopics\n"
        "- Include prerequisites, common mistakes, expert insights\n"
        "- Cover edge cases, exceptions, and advanced details"
    ),
}

def build_prompt(state: FlashcardGenState) -> dict:
    topic = state.get("topic", "")
    content = state.get("content", "")
    generation_type = state.get("generation_type", "topic")
    card_count = state.get("card_count", 10)
    difficulty = state.get("difficulty", "medium")
    depth_level = state.get("depth_level", "standard")
    additional_specs = state.get("additional_specs", "")
    if not isinstance(additional_specs, str):
        additional_specs = ""
    weaknesses = state.get("student_weaknesses", [])
    strengths = state.get("student_strengths", [])

    parts = []

    if generation_type == "chat_history" and content:
        parts.append(
            f"Generate {card_count} flashcards from this conversation/content:\n\n"
            f"{content[:3000]}\n"
        )
    else:
        parts.append(f"Generate {card_count} flashcards about: {topic}\n")

    diff_guide = DIFFICULTY_GUIDES.get(difficulty, DIFFICULTY_GUIDES["medium"])
    parts.append(f"DIFFICULTY:\n{diff_guide}\n")

    depth_guide = DEPTH_GUIDES.get(depth_level, DEPTH_GUIDES["standard"])
    parts.append(f"DEPTH:\n{depth_guide}\n")

    if weaknesses:
        parts.append(
            f"STUDENT WEAKNESSES: {', '.join(weaknesses[:5])}\n"
            "If relevant to the topic, include cards that help address these gaps.\n"
        )
    if strengths:
        parts.append(
            f"STUDENT STRENGTHS: {', '.join(strengths[:5])}\n"
            "Skip overly basic questions on these topics — challenge the student.\n"
        )

    if additional_specs.strip():
        parts.append(f"ADDITIONAL INSTRUCTIONS FROM STUDENT:\n{additional_specs.strip()}\n")

    rag_context = state.get("rag_context", [])
    if rag_context:
        logger.info(f"[FLASHCARD PROMPT] *** INJECTING {len(rag_context)} RAG chunk(s) into prompt ***")
        context_block = "\n---\n".join(rag_context[:5])
        parts.append(
            f"RELEVANT CURRICULUM CONTEXT (from student's documents and HS curriculum):\n"
            f"{context_block}\n\n"
            "Prioritise this material when relevant to the topic. "
            "Use it to make flashcards more curriculum-aligned and accurate.\n"
        )
    else:
        logger.info("[FLASHCARD PROMPT] No RAG context — generating from model knowledge only")

    parts.append(
        "MATH FORMATTING: For any mathematical expressions, use LaTeX notation. "
        "Wrap inline math in single dollar signs: $f(x) = ax^2 + bx + c$. "
        "Wrap display equations in double dollar signs: $$E = mc^2$$.\n\n"
        "FORMAT: Return ONLY a valid JSON array. Each object must have:\n"
        '{"question": "...", "answer": "...", "difficulty": "' + difficulty + '", '
        '"wrong_options": ["wrong1", "wrong2", "wrong3"]}\n\n'
        "RULES:\n"
        "- Questions must be clear and specific\n"
        "- Answers: concise (2-4 sentences max)\n"
        "- wrong_options: 3 plausible but incorrect answers for MCQ mode\n"
        "- wrong_options must be similar in length, specificity, and formatting to the correct answer\n"
        "- Do not make the correct answer obviously longer, more detailed, or more mathematical than all wrong options\n"
        "- No duplicate or redundant cards\n"
        "- No markdown fences or extra text — just the JSON array"
    )

    return {"built_prompt": "\n".join(parts)}

def generate_cards(state: FlashcardGenState) -> dict:
    rag_active = bool(state.get("rag_context"))
    hs_ai = state.get("_hs_ai_client")
    ai_client = (hs_ai if rag_active and hs_ai else None) or state.get("_ai_client")
    if not ai_client:
        return {"flashcards_json": []}

    if rag_active and hs_ai:
        logger.info("[FLASHCARD GEN] Using HS context AI client (RAG-enriched prompt)")
    else:
        logger.info("[FLASHCARD GEN] Using main AI client")

    prompt = state.get("built_prompt", "")
    difficulty = state.get("difficulty", "medium")
    card_count = state.get("card_count", 10)

    def _generate_with(client) -> list[dict]:
        response = client.generate(prompt, max_tokens=3000, temperature=0.7)
        data = parse_json_array_response(response)

        valid = []
        for card in data[:card_count]:
            if isinstance(card, dict) and "question" in card and "answer" in card:
                answer = card["answer"]
                if len(answer) > 400:
                    answer = answer[:400] + "..."
                wrong_options = card.get("wrong_options", [])
                wrong_options = [
                    opt[:400] + "..." if len(opt) > 400 else opt
                    for opt in wrong_options[:3]
                ]
                valid.append({
                    "question": card["question"].strip(),
                    "answer": answer.strip(),
                    "difficulty": card.get("difficulty", difficulty),
                    "wrong_options": wrong_options,
                })
        return valid

    try:
        return {"flashcards_json": _generate_with(ai_client)}
    except Exception as e:
        main_ai = state.get("_ai_client")
        if ai_client is hs_ai and main_ai and main_ai is not ai_client:
            logger.error(f"HS flashcard generation failed; falling back to main AI client: {e}")
            try:
                return {"flashcards_json": _generate_with(main_ai)}
            except Exception as fallback_error:
                logger.error(f"Main AI flashcard fallback failed: {fallback_error}")
        logger.error(f"Flashcard generation failed: {e}")
        return {"flashcards_json": []}

class FlashcardGraph:

    def __init__(self, ai_client: Any, db_session_factory: Any = None, hs_ai_client: Any = None):
        self.ai_client = ai_client
        self.hs_ai_client = hs_ai_client
        self.db_factory = db_session_factory
        self._graph = self._build()

    def _build(self):
        g = StateGraph(FlashcardGenState)
        g.add_node("fetch_context", fetch_context)
        g.add_node("build_prompt", build_prompt)
        g.add_node("generate_cards", generate_cards)
        g.set_entry_point("fetch_context")
        g.add_edge("fetch_context", "build_prompt")
        g.add_edge("build_prompt", "generate_cards")
        g.add_edge("generate_cards", END)
        return g.compile()

    async def invoke(
        self,
        user_id: str,
        topic: str = "",
        content: str = "",
        generation_type: str = "topic",
        card_count: int = 10,
        difficulty: str = "medium",
        depth_level: str = "standard",
        additional_specs: str = "",
        use_hs_context: bool = True,
        context_doc_ids: list = None,
    ) -> list[dict]:
        initial_state: FlashcardGenState = {
            "user_id": user_id,
            "topic": topic,
            "content": content,
            "generation_type": generation_type,
            "card_count": card_count,
            "difficulty": difficulty,
            "depth_level": depth_level,
            "additional_specs": additional_specs,
            "use_hs_context": use_hs_context,
            "context_doc_ids": context_doc_ids or [],
            "_ai_client": self.ai_client,
            "_hs_ai_client": self.hs_ai_client,
            "_db_factory": self.db_factory,
        }
        try:
            result = await self._graph.ainvoke(initial_state)
            return result.get("flashcards_json", [])
        except Exception as e:
            logger.error(f"Flashcard graph failed: {e}")
            return []

_flashcard_graph: Optional[FlashcardGraph] = None

def create_flashcard_graph(ai_client: Any, db_session_factory: Any = None, hs_ai_client: Any = None) -> FlashcardGraph:
    global _flashcard_graph
    _flashcard_graph = FlashcardGraph(ai_client, db_session_factory, hs_ai_client=hs_ai_client)
    return _flashcard_graph

def get_flashcard_graph() -> Optional[FlashcardGraph]:
    return _flashcard_graph
