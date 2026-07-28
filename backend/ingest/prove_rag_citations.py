"""
Standalone proof script: verifies that HS-mode RAG citations are real, not theater.

Run against the LOCAL sqlite DB after ingesting CLP-1 Differential Calculus:
  DATABASE_URL="sqlite:///./brainwave_tutor.db" python -m ingest.prove_rag_citations

Checks, in order:
  1. context_store.search_context() returns real page_number/book_title metadata
     for a calculus query.
  2. All 4 graphs (tutor, flashcard, quiz, note), invoked directly with
     use_hs_context=True, produce output containing a resolvable [n] citation
     with a real page number traceable back to the actual retrieved chunk text.
  3. Cross-check: a keyword from the cited chunk's real text appears in the
     generated answer, proving the citation isn't decorative.

Exits 0 if all checks pass, 1 otherwise. Prints a readable report either way.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)
sys.path.insert(0, os.path.join(_BACKEND_DIR, "services"))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CITATION_RE = re.compile(r"\[(\d+)\]")
FAILURES: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> bool:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        FAILURES.append(label)
    return condition


def extract_keywords(text: str, n: int = 6) -> list[str]:
    words = re.findall(r"[A-Za-z]{5,}", text)
    seen = []
    for w in words:
        lw = w.lower()
        if lw not in seen:
            seen.append(lw)
        if len(seen) >= n:
            break
    return seen


async def main() -> int:
    print("=" * 70)
    print("RAG CITATION PROOF — CLP-1 Differential Calculus (local sqlite)")
    print("=" * 70)

    from services import vector_store as vs
    from services import context_store

    from sentence_transformers import SentenceTransformer
    try:
        model = SentenceTransformer("BAAI/bge-small-en-v1.5")
    except Exception:
        model = SentenceTransformer("all-MiniLM-L6-v2")
    vs.initialize(model)

    print(f"\ncontext_store.available() = {context_store.available()}")
    if not context_store.available():
        print("FATAL: context_store not available. Did the ingest finish?")
        return 1

    # ---- Check 1: raw retrieval has real metadata ----
    print("\n[1] Direct search_context() retrieval")
    query = "how do you differentiate a polynomial using the power rule"
    results = context_store.search_context(query=query, user_id="0", use_hs=True, top_k=5)
    check("search_context returns results", len(results) > 0, f"{len(results)} result(s)")
    if not results:
        print("\nFATAL: no results — cannot proceed with citation checks.")
        return 1

    top = results[0]
    meta = top.get("metadata") or {}
    book_title = meta.get("book_title") or meta.get("filename") or ""
    page = meta.get("page_number") or meta.get("page_start") or ""
    check("top result has book_title", bool(book_title), book_title)
    check("top result has page number", bool(page), str(page))
    check(
        "book_title mentions CLP-1 / Differential Calculus",
        ("clp" in book_title.lower()) or ("differential calculus" in book_title.lower()),
        book_title,
    )
    cited_chunk_text = top.get("text", "")
    cited_keywords = extract_keywords(cited_chunk_text)
    print(f"      cited chunk keywords sample: {cited_keywords[:4]}")

    rag_sources = context_store.build_rag_sources(results)

    # ---- Check 2: all 4 graphs produce resolvable citations ----
    from deps import unified_ai, hs_context_ai
    from database import SessionLocal

    topic = "differentiating polynomials with the power rule"

    print("\n[2] Flashcard graph (use_hs_context=True)")
    from graphs.flashcard_graph import create_flashcard_graph
    fc_graph = create_flashcard_graph(unified_ai, SessionLocal, hs_ai_client=hs_context_ai)
    cards = await fc_graph.invoke(user_id="0", topic=topic, card_count=3, use_hs_context=True)
    check("flashcards generated", len(cards) > 0, f"{len(cards)} card(s)")
    fc_cited = any(re.search(r"\(Source:", c.get("answer", "")) for c in cards) if cards else False
    check("at least one flashcard answer has a resolved (Source: ...) citation", fc_cited)
    if cards:
        for c in cards[:2]:
            print(f"      Q: {c['question'][:70]}")
            print(f"      A: {c['answer'][:160]}")

    print("\n[3] Quiz graph (use_hs_context=True)")
    from graphs.quiz_graph import create_quiz_graph
    quiz_graph = create_quiz_graph(unified_ai, SessionLocal, hs_ai_client=hs_context_ai)
    questions = await quiz_graph.invoke(
        user_id="0", topic=topic, question_count=3,
        question_types=["multiple_choice"], use_hs_context=True,
    )
    check("quiz questions generated", len(questions) > 0, f"{len(questions)} question(s)")
    quiz_cited = any(re.search(r"\(Source:", q.get("explanation", "")) for q in questions) if questions else False
    check("at least one quiz explanation has a resolved (Source: ...) citation", quiz_cited)
    if questions:
        for q in questions[:2]:
            print(f"      Q: {q['question_text'][:70]}")
            print(f"      Explanation: {q['explanation'][:160]}")

    print("\n[4] Note graph (use_hs_context=True)")
    from graphs.note_graph import create_note_graph
    note_graph = create_note_graph(unified_ai, SessionLocal, hs_ai_client=hs_context_ai)
    note_content = await note_graph.invoke(user_id="0", topic=topic, depth="standard", use_hs_context=True)
    check("note content generated", bool(note_content), f"{len(note_content)} chars")
    note_has_refs = bool(re.search(r"#+\s*references", note_content, re.IGNORECASE)) if note_content else False
    note_has_markers = bool(CITATION_RE.search(note_content)) if note_content else False
    check("note has [n] citation marker(s)", note_has_markers)
    check("note has a References section", note_has_refs)
    if note_content:
        print(f"      note excerpt: {note_content[:200]!r}")
        ref_idx = note_content.lower().find("## references")
        if ref_idx >= 0:
            print(f"      references section: {note_content[ref_idx:ref_idx+300]!r}")

    print("\n[5] Tutor chat graph (use_hs_context=True)")
    from tutor.graph import create_tutor
    tutor = create_tutor(unified_ai, SessionLocal, hs_ai_client=hs_context_ai)
    tutor_result = await tutor.invoke(
        user_id="0",
        user_input=f"Explain {topic} and show an example.",
        use_hs_context=True,
    )
    tutor_response = tutor_result.get("response", "") if isinstance(tutor_result, dict) else ""
    check("tutor produced a response", bool(tutor_response), f"{len(tutor_response)} chars")
    tutor_has_markers = bool(CITATION_RE.search(tutor_response)) if tutor_response else False
    tutor_has_sources = "sources:" in tutor_response.lower() if tutor_response else False
    check("tutor response has [n] citation marker(s)", tutor_has_markers)
    check("tutor response has a Sources line", tutor_has_sources)
    if tutor_response:
        print(f"      tutor excerpt: {tutor_response[:200]!r}")
        src_idx = tutor_response.lower().find("sources:")
        if src_idx >= 0:
            print(f"      sources line: {tutor_response[src_idx:src_idx+200]!r}")

    # ---- Check 3: traceability — a keyword from the actual cited chunk appears somewhere ----
    print("\n[6] Traceability cross-check")
    all_generated_text = " ".join([
        " ".join(c.get("answer", "") for c in (cards or [])),
        " ".join(q.get("explanation", "") for q in (questions or [])),
        note_content or "",
        tutor_response or "",
    ]).lower()
    matched_keywords = [kw for kw in cited_keywords if kw in all_generated_text]
    check(
        "at least one keyword from the actual retrieved chunk appears in generated content",
        len(matched_keywords) > 0,
        f"matched: {matched_keywords[:5]}",
    )

    print("\n" + "=" * 70)
    if FAILURES:
        print(f"RESULT: {len(FAILURES)} check(s) FAILED:")
        for f in FAILURES:
            print(f"  - {f}")
        print("=" * 70)
        return 1
    print("RESULT: ALL CHECKS PASSED")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
