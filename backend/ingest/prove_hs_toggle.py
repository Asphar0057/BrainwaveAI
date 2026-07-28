"""
Standalone proof script: verifies the HS-mode toggle actually changes behavior for
Solo Quiz (routes/social.py::create_solo_quiz) and the Notes AI assistant
(routes/notes.py::notes_agent) — the two surfaces that previously ignored the flag
entirely. Calls the real route functions directly (bypassing HTTP/auth, which is
just FastAPI Depends() plumbing) against the local sqlite DB with the CLP-1
Differential Calculus book already ingested.

Run: DATABASE_URL="sqlite:///./brainwave_tutor.db" python -m ingest.prove_hs_toggle
"""
from __future__ import annotations

import asyncio
import os
import re
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

FAILURES: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> bool:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}" + (f" — {detail}" if detail else ""))
    if not condition:
        FAILURES.append(label)
    return condition


def has_citation(text: str) -> bool:
    return bool(re.search(r"\[\d+\]|\(Source:", text or ""))


async def main() -> int:
    from database import SessionLocal
    import models
    from routes.social import create_solo_quiz
    from routes.notes import notes_agent, NoteAgentRequest

    db = SessionLocal()
    user = db.query(models.User).first()
    print(f"Using test user id={user.id} username={user.username}")

    topic = "the power rule for differentiating polynomials"

    print("\n[1] Solo Quiz — use_hs_context=True")
    r_true = await create_solo_quiz(
        payload={"subject": topic, "difficulty": "medium", "question_count": 3, "use_hs_context": True},
        username=user.username,
        db=db,
    )
    check("quiz created (hs=True)", r_true.get("status") == "success", str(r_true))
    quiz_true = db.query(models.SoloQuizQuestion).filter(
        models.SoloQuizQuestion.quiz_id == r_true["quiz_id"]
    ).all()
    explanations_true = " ".join(q.explanation or "" for q in quiz_true)
    hs_true_cited = has_citation(explanations_true)
    check("hs=True quiz explanations contain a citation", hs_true_cited, explanations_true[:200])

    print("\n[2] Solo Quiz — use_hs_context=False")
    r_false = await create_solo_quiz(
        payload={"subject": topic, "difficulty": "medium", "question_count": 3, "use_hs_context": False},
        username=user.username,
        db=db,
    )
    check("quiz created (hs=False)", r_false.get("status") == "success", str(r_false))
    quiz_false = db.query(models.SoloQuizQuestion).filter(
        models.SoloQuizQuestion.quiz_id == r_false["quiz_id"]
    ).all()
    explanations_false = " ".join(q.explanation or "" for q in quiz_false)
    hs_false_not_cited = not has_citation(explanations_false)
    check("hs=False quiz explanations do NOT contain a citation", hs_false_not_cited, explanations_false[:200])

    print("\n[3] Notes AI assistant — action=generate, use_hs_context=True")
    note_true = await notes_agent(
        NoteAgentRequest(user_id=user.username, action="generate", topic=topic, use_hs_context=True),
        db=db,
    )
    note_true_content = note_true.get("content", "")
    check("note generated (hs=True)", note_true.get("success") is True, str(note_true)[:150])
    check("hs=True note contains a citation/reference", has_citation(note_true_content) or "references" in note_true_content.lower(), note_true_content[:200])

    print("\n[4] Notes AI assistant — action=generate, use_hs_context=False")
    note_false = await notes_agent(
        NoteAgentRequest(user_id=user.username, action="generate", topic=topic, use_hs_context=False),
        db=db,
    )
    note_false_content = note_false.get("content", "")
    check("note generated (hs=False)", note_false.get("success") is True, str(note_false)[:150])
    check(
        "hs=False note does NOT contain a References section",
        "references" not in note_false_content.lower(),
        note_false_content[:200],
    )

    print("\n[5] Notes AI assistant — action=grammar respects RAG allowlist (never gets RAG even if hs=True)")
    grammar_result = await notes_agent(
        NoteAgentRequest(user_id=user.username, action="grammar", content="this sentence have bad grammar", use_hs_context=True),
        db=db,
    )
    check("grammar action succeeded", grammar_result.get("success") is True, str(grammar_result)[:150])
    check(
        "grammar output has no citation (action not in RAG allowlist)",
        not has_citation(grammar_result.get("content", "")),
        grammar_result.get("content", "")[:150],
    )

    db.close()

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
