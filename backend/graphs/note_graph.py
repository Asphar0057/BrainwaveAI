from __future__ import annotations

import logging
import re
from typing import Any, Optional, TypedDict

from langgraph.graph import StateGraph, END
from services.context_store import format_rag_sources_block

logger = logging.getLogger(__name__)

_CITATION_MARKER_RE = re.compile(r"\[(\d+)\]")

def _ensure_references_section(content: str, rag_sources: list) -> str:
    """If the notes use [n] citation markers but never rendered a References section,
    append one resolved from rag_sources so citations are always traceable."""
    if not content or not rag_sources:
        return content
    if re.search(r"^#+\s*references\b", content, re.IGNORECASE | re.MULTILINE):
        return content
    used = sorted({int(m) for m in _CITATION_MARKER_RE.findall(content)})
    if not used:
        return content
    by_index = {s["index"]: s for s in rag_sources if isinstance(s, dict)}
    lines = ["\n## References"]
    for i in used:
        src = by_index.get(i)
        if not src:
            continue
        page_str = f", p.{src['page']}" if src.get("page") else ""
        lines.append(f"- [{i}] {src.get('book_title', 'Unknown')}{page_str}")
    if len(lines) == 1:
        return content
    return content + "\n" + "\n".join(lines)

class NoteGenState(TypedDict, total=False):
    user_id: str
    topic: str
    source_content: str
    generation_type: str
    depth: str
    tone: str
    additional_specs: str
    student_weaknesses: list[str]
    student_strengths: list[str]
    rag_context: list[str]
    rag_sources: list[dict]
    use_hs_context: bool
    context_doc_ids: list[str]
    built_prompt: str
    note_content: str
    _ai_client: Any
    _hs_ai_client: Any
    _db_factory: Any

async def fetch_context(state: NoteGenState) -> dict:
    user_id = state.get("user_id", "")
    topic = state.get("topic", "")
    db_factory = state.get("_db_factory")

    weaknesses: list[str] = []
    strengths: list[str] = []

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
            logger.warning(f"NoteGraph DB context fetch failed: {e}")

    rag_chunks: list[str] = []
    rag_sources: list[dict] = []
    use_hs = state.get("use_hs_context", True)
    context_doc_ids = state.get("context_doc_ids") or []
    logger.info(
        f"[NOTE RAG] topic='{topic}' use_hs_context={use_hs} "
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
                        max_chunks_per_doc=12,
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
                rag_sources = context_store.build_rag_sources(results)
                if rag_chunks:
                    logger.info(
                        f"[NOTE RAG] Retrieved {len(rag_chunks)} chunk(s) for '{topic}' "
                        f"(use_hs_context={use_hs})"
                    )
                    for i, r in enumerate(results):
                        preview = r["text"][:120].replace("\n", " ")
                        logger.info(
                            f"[NOTE RAG]   chunk[{i}] source={r.get('source')} "
                            f"dist={float(r.get('distance', 0.0)):.4f} | {preview}..."
                        )
                else:
                    logger.info(f"[NOTE RAG] No matching chunks found for '{topic}' in curriculum/docs")
            else:
                logger.info("[NOTE RAG] context_store not available — skipping RAG")
        except Exception as e:
            logger.warning(f"RAG context fetch failed: {e}")
    else:
        logger.info("[NOTE RAG] No context query (missing topic and no selected docs)")

    return {
        "student_weaknesses": weaknesses,
        "student_strengths": strengths,
        "rag_context": rag_chunks,
        "rag_sources": rag_sources,
    }

DEPTH_GUIDES = {
    "brief": (
        "BRIEF — concise summary.\n"
        "- 3-5 bullet points per section, max 2 sections\n"
        "- Only the most important definitions and facts\n"
        "- No deep explanations — think revision cheat-sheet"
    ),
    "standard": (
        "STANDARD — balanced notes.\n"
        "- Clear headers, bullet points, and short explanations\n"
        "- Include key definitions, main concepts, and 1-2 examples\n"
        "- Enough detail to understand and revise from"
    ),
    "deep": (
        "DEEP — comprehensive reference notes.\n"
        "- Full explanations with reasoning and context\n"
        "- Cover prerequisites, edge cases, and common pitfalls\n"
        "- Include multiple worked examples and comparisons\n"
        "- Expert-level nuance and connections between concepts"
    ),
}

TONE_GUIDES = {
    "professional": "Clear, precise, neutral — like a well-written textbook.",
    "academic": "Formal language, citations-style structure, rigorous definitions.",
    "casual": "Conversational and friendly — explain like talking to a classmate.",
    "concise": "Ultra-tight — no fluff, every word earns its place.",
}

def build_prompt(state: NoteGenState) -> dict:
    topic = state.get("topic", "")
    source_content = state.get("source_content", "")
    generation_type = state.get("generation_type", "topic")
    depth = state.get("depth", "standard")
    tone = state.get("tone", "professional")
    additional_specs = (state.get("additional_specs") or "").strip()
    weaknesses = state.get("student_weaknesses", [])
    strengths = state.get("student_strengths", [])

    if depth not in DEPTH_GUIDES:
        depth = "standard"
    if tone not in TONE_GUIDES:
        tone = "professional"

    parts = []

    if generation_type == "content" and source_content:
        parts.append(
            f"Create detailed study notes summarising this content:\n\n"
            f"{source_content[:4000]}\n\n"
            f"Topic title: {topic}\n"
        )
    else:
        parts.append(f"Create comprehensive study notes on: **{topic}**\n")

    parts.append(f"DEPTH:\n{DEPTH_GUIDES[depth]}\n")

    parts.append(f"TONE: {TONE_GUIDES[tone]}\n")

    if weaknesses:
        relevant_weak = [w for w in weaknesses[:5] if any(
            kw.lower() in topic.lower() or topic.lower() in kw.lower()
            for kw in w.split()
        )] or weaknesses[:3]
        if relevant_weak:
            parts.append(
                f"STUDENT WEAK AREAS: {', '.join(relevant_weak)}\n"
                "Emphasise and explain these areas more thoroughly in the notes.\n"
            )

    if strengths:
        parts.append(
            f"STUDENT STRONG AREAS: {', '.join(strengths[:5])}\n"
            "Don't over-explain these — a brief mention is enough.\n"
        )

    if additional_specs:
        parts.append(f"ADDITIONAL INSTRUCTIONS:\n{additional_specs}\n")

    rag_context = state.get("rag_context", [])
    rag_sources = state.get("rag_sources") or []
    cite_instructions = ""
    if rag_context:
        logger.info(f"[NOTE PROMPT] *** INJECTING {len(rag_context)} RAG chunk(s) into prompt ***")
        context_block = format_rag_sources_block(rag_sources) if rag_sources else "\n---\n".join(rag_context[:5])
        parts.append(
            f"RELEVANT CURRICULUM CONTEXT (from student's documents and HS curriculum):\n"
            f"{context_block}\n\n"
            "Prioritise this material when relevant to the topic. "
            "Use it to make the notes more curriculum-aligned and accurate.\n"
        )
        cite_instructions = (
            "\n- Cite sources inline as [1], [2], etc. when the notes use specific facts from the "
            "curriculum context above, matching the source numbers.\n"
            "- End the notes with a '## References' section listing each numbered source used, "
            "formatted as '- [1] Book Title, p.X'."
        )
    else:
        logger.info("[NOTE PROMPT] No RAG context — generating from model knowledge only")

    parts.append(
        "FORMAT REQUIREMENTS:\n"
        "- Use markdown: ## for sections, ### for subsections, **bold** for key terms\n"
        "- Use bullet points for lists, numbered lists for steps\n"
        "- Include a brief intro paragraph, then structured sections\n"
        "- If relevant, include a 'Summary' or 'Key Takeaways' section at the end\n"
        "- Return only the note content — no meta-commentary or preamble"
        + cite_instructions
    )

    return {"built_prompt": "\n".join(parts)}

def generate_note(state: NoteGenState) -> dict:
    rag_active = bool(state.get("rag_context"))
    hs_ai = state.get("_hs_ai_client")
    ai_client = (hs_ai if rag_active and hs_ai else None) or state.get("_ai_client")
    if not ai_client:
        return {"note_content": ""}

    if rag_active and hs_ai:
        logger.info("[NOTE GEN] Using HS context AI client (RAG-enriched prompt)")
    else:
        logger.info("[NOTE GEN] Using main AI client")

    prompt = state.get("built_prompt", "")
    depth = state.get("depth", "standard")
    rag_sources = state.get("rag_sources") or []

    max_tokens = {"brief": 800, "standard": 2000, "deep": 3500}.get(depth, 2000)

    try:
        content = ai_client.generate(prompt, max_tokens=max_tokens, temperature=0.65)
        return {"note_content": _ensure_references_section(content.strip(), rag_sources)}
    except Exception as e:
        main_ai = state.get("_ai_client")
        if ai_client is hs_ai and main_ai and main_ai is not ai_client:
            logger.error(f"HS NoteGraph generation failed; falling back to main AI client: {e}")
            try:
                content = main_ai.generate(prompt, max_tokens=max_tokens, temperature=0.65)
                return {"note_content": _ensure_references_section(content.strip(), rag_sources)}
            except Exception as fallback_error:
                logger.error(f"Main AI NoteGraph fallback failed: {fallback_error}")
        logger.error(f"NoteGraph generation failed: {e}")
        return {"note_content": ""}

class NoteGraph:

    def __init__(self, ai_client: Any, db_session_factory: Any = None, hs_ai_client: Any = None):
        self.ai_client = ai_client
        self.hs_ai_client = hs_ai_client
        self.db_factory = db_session_factory
        self._graph = self._build()

    def _build(self):
        g = StateGraph(NoteGenState)
        g.add_node("fetch_context", fetch_context)
        g.add_node("build_prompt", build_prompt)
        g.add_node("generate_note", generate_note)
        g.set_entry_point("fetch_context")
        g.add_edge("fetch_context", "build_prompt")
        g.add_edge("build_prompt", "generate_note")
        g.add_edge("generate_note", END)
        return g.compile()

    async def invoke(
        self,
        user_id: str,
        topic: str = "",
        source_content: str = "",
        generation_type: str = "topic",
        depth: str = "standard",
        tone: str = "professional",
        additional_specs: str = "",
        use_hs_context: bool = True,
        context_doc_ids: list = None,
    ) -> str:
        initial_state: NoteGenState = {
            "user_id": user_id,
            "topic": topic,
            "source_content": source_content,
            "generation_type": generation_type,
            "depth": depth,
            "tone": tone,
            "additional_specs": additional_specs,
            "use_hs_context": use_hs_context,
            "context_doc_ids": context_doc_ids or [],
            "_ai_client": self.ai_client,
            "_hs_ai_client": self.hs_ai_client,
            "_db_factory": self.db_factory,
        }
        try:
            result = await self._graph.ainvoke(initial_state)
            return result.get("note_content", "")
        except Exception as e:
            logger.error(f"NoteGraph failed: {e}")
            return ""

_note_graph: Optional[NoteGraph] = None

def create_note_graph(ai_client: Any, db_session_factory: Any = None, hs_ai_client: Any = None) -> NoteGraph:
    global _note_graph
    _note_graph = NoteGraph(ai_client, db_session_factory, hs_ai_client=hs_ai_client)
    return _note_graph

def get_note_graph() -> Optional[NoteGraph]:
    return _note_graph
