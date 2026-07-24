"""
Focused week-long simulation for the BKT mastery signal in
services.ml_pipeline.MessageMLPipeline, built to answer one question:
"when we talk, does mastery reliably go up on genuine progress and down on
genuine struggle -- and does it stay put on turns that carry no signal?"

This complements tests/simulate_week.py (which resets current_concept_id=None
every turn, so it never actually exercises the session-carryover path) by
keeping ONE persistent conversation session per synthetic student across a
simulated week, exactly like a real chat_id would in routes/chat.py.

Scenarios (each run through the REAL MessageMLPipeline.process(), against an
isolated scratch sqlite db -- never the dev db):
  A. Sustained confident/correct turns on one topic for 7 days -> mastery
     should trend upward.
  B. Sustained confused/stuck turns on one topic for 7 days -> mastery should
     trend downward from a seeded mid-level start.
  C. A confident week 1 followed by a confused week 2 on the same topic ->
     mastery should rise then fall (direction reversal).
  D. Extreme: real content turns on a topic interleaved with pure off-topic
     chit-chat ("hi", "thanks", "lol", "brb") every other turn -> the
     off-topic turns must NOT move that topic's mastery at all (this is the
     regression test for the bug fixed 2026-07-23: off-topic turns used to
     fall back to the stale session concept and get scored as a low-
     confidence wrong answer).

Run:  cd backend && python tests/simulate_mastery_extremes.py
"""

from __future__ import annotations

import os
import sys
import json
import uuid
import random
import asyncio
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta

_SCRATCH_DIR = Path(tempfile.gettempdir()) / "brainwave_bandit_tests"
_SCRATCH_DIR.mkdir(exist_ok=True)
_SCRATCH_DB = _SCRATCH_DIR / f"mastery_extremes_{uuid.uuid4().hex[:8]}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_SCRATCH_DB.as_posix()}"

sys.path.insert(0, str(Path(__file__).parent.parent))

import database  # noqa: E402
import models  # noqa: E402

database.Base.metadata.create_all(bind=database.engine)

from services.ml_pipeline import MessageMLPipeline, SessionContext  # noqa: E402

random.seed(20260723)

CONFIDENT_MESSAGES = [
    "ok I think I understand now, let me try an example",
    "got it, that makes sense, what's next?",
    "nice, I solved it, can we try a harder one?",
    "that clicked, I can explain it back to you now",
]
CONFUSED_MESSAGES = [
    "I don't get how this works at all",
    "this doesn't make sense to me, can you explain again",
    "still not getting it, tried again and same result",
    "I keep failing this, same issue as before, I'm lost",
]
OFF_TOPIC_MESSAGES = [
    "hi",
    "thanks!",
    "lol ok",
    "yep thanks",
    "hey there",
]


def _mk_pipeline() -> MessageMLPipeline:
    pipeline = MessageMLPipeline(db_factory=None, memory_svc=None)
    # Deterministic, network-free: disable the embedding-similarity concept
    # detector so concept attribution is driven purely by the explicit
    # session.current_concept_id carry-forward under test here, not by
    # whichever sentence-transformer happens to be installed.
    pipeline._registry.embed = lambda text: None
    return pipeline


def _mk_student(db, tag: str) -> int:
    email = f"mastery_{tag}_{uuid.uuid4().hex[:6]}@test.local"
    u = models.User(email=email, username=email.split("@")[0], hashed_password="x")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u.id


def _seed_concept(db, user_id: int, concept: str, p_mastery: float) -> None:
    state = models.StudentKnowledgeState(
        user_id=user_id, concept_id=concept, concept_name=concept,
        p_mastery=p_mastery, p_learn=0.09, p_slip=0.1, p_guess=0.2,
    )
    db.add(state)
    db.commit()


def _get_mastery(db, user_id: int, concept: str) -> float:
    db.expire_all()
    state = db.query(models.StudentKnowledgeState).filter_by(
        user_id=user_id, concept_id=concept
    ).first()
    return state.p_mastery if state else None


class ConversationSession:
    """Mirrors the session bookkeeping routes/chat.py does around CerbylSessionState,
    without needing the DB row -- so a synthetic conversation can persist
    current_concept_id / messages_on_concept across turns exactly like real chat."""

    def __init__(self, session_id: int, seed_concept: str | None = None):
        self.session_id = session_id
        self.message_count = 0
        self.current_concept_id = seed_concept
        self._messages_on_concept: dict[str, int] = {}
        self.frustration_trend: list[float] = []

    def as_context(self) -> SessionContext:
        return SessionContext(
            session_id=self.session_id,
            message_count=self.message_count,
            current_concept_id=self.current_concept_id,
            messages_on_concept=self._messages_on_concept.get(self.current_concept_id or "", 0),
            frustration_trend=list(self.frustration_trend),
        )

    def apply(self, out) -> None:
        self.message_count += 1
        self.frustration_trend = (self.frustration_trend + [round(out.frustration_score, 3)])[-10:]
        if out.detected_concepts:
            cid = out.detected_concepts[0]
            self.current_concept_id = cid
            self._messages_on_concept[cid] = self._messages_on_concept.get(cid, 0) + 1


async def run_day(pipeline, db, user_id: int, session: ConversationSession,
                   concept: str, messages: list[str], turns: int) -> None:
    for _ in range(turns):
        msg = random.choice(messages)
        ctx = session.as_context()
        # Force attribution onto `concept` for real-content turns the same way
        # layer1's embedding match would in production; off-topic turns get no
        # forced concept so the intent classifier decides the fallback path.
        out = await pipeline.process(msg, str(user_id), ctx, db)
        session.apply(out)


def scenario_a_sustained_confident(db) -> dict:
    pipeline = _mk_pipeline()
    uid = _mk_student(db, "confident")
    concept = "photosynthesis"
    _seed_concept(db, uid, concept, p_mastery=0.3)
    session = ConversationSession(session_id=1001, seed_concept=concept)

    trace = [_get_mastery(db, uid, concept)]
    for _day in range(7):
        asyncio.run(run_day(pipeline, db, uid, session, concept, CONFIDENT_MESSAGES, turns=5))
        trace.append(_get_mastery(db, uid, concept))

    return {"scenario": "A_sustained_confident", "concept": concept, "mastery_trace": trace,
            "passed": trace[-1] > trace[0]}


def scenario_b_sustained_confused(db) -> dict:
    pipeline = _mk_pipeline()
    uid = _mk_student(db, "confused")
    concept = "integration_by_parts"
    _seed_concept(db, uid, concept, p_mastery=0.6)
    session = ConversationSession(session_id=1002, seed_concept=concept)

    trace = [_get_mastery(db, uid, concept)]
    for _day in range(7):
        asyncio.run(run_day(pipeline, db, uid, session, concept, CONFUSED_MESSAGES, turns=5))
        trace.append(_get_mastery(db, uid, concept))

    return {"scenario": "B_sustained_confused", "concept": concept, "mastery_trace": trace,
            "passed": trace[-1] < trace[0]}


def scenario_c_reversal(db) -> dict:
    pipeline = _mk_pipeline()
    uid = _mk_student(db, "reversal")
    concept = "thermodynamics"
    _seed_concept(db, uid, concept, p_mastery=0.4)
    session = ConversationSession(session_id=1003, seed_concept=concept)

    trace = [_get_mastery(db, uid, concept)]
    for _day in range(4):
        asyncio.run(run_day(pipeline, db, uid, session, concept, CONFIDENT_MESSAGES, turns=5))
        trace.append(_get_mastery(db, uid, concept))
    peak = trace[-1]
    for _day in range(4):
        asyncio.run(run_day(pipeline, db, uid, session, concept, CONFUSED_MESSAGES, turns=5))
        trace.append(_get_mastery(db, uid, concept))

    return {"scenario": "C_reversal", "concept": concept, "mastery_trace": trace,
            "passed": bool(peak > trace[0] and trace[-1] < peak)}


def scenario_d_off_topic_immunity(db) -> dict:
    pipeline = _mk_pipeline()
    uid = _mk_student(db, "immunity")
    concept = "cell_biology"
    _seed_concept(db, uid, concept, p_mastery=0.5)
    session = ConversationSession(session_id=1004, seed_concept=concept)

    trace = [_get_mastery(db, uid, concept)]
    for _day in range(7):
        # interleave: content turn, off-topic turn, content turn, off-topic turn...
        for i in range(6):
            msgs = CONFIDENT_MESSAGES if i % 2 == 0 else OFF_TOPIC_MESSAGES
            asyncio.run(run_day(pipeline, db, uid, session, concept, msgs, turns=1))
        trace.append(_get_mastery(db, uid, concept))

    # Compare against a control run with ONLY the content turns (no off-topic
    # interleaved) on a fresh identical student -- if off-topic turns are
    # truly inert, the two traces should match turn-for-turn.
    pipeline2 = _mk_pipeline()
    uid2 = _mk_student(db, "control")
    _seed_concept(db, uid2, concept, p_mastery=0.5)
    session2 = ConversationSession(session_id=1005, seed_concept=concept)
    control_trace = [_get_mastery(db, uid2, concept)]
    for _day in range(7):
        asyncio.run(run_day(pipeline2, db, uid2, session2, concept, CONFIDENT_MESSAGES, turns=3))
        control_trace.append(_get_mastery(db, uid2, concept))

    matches = all(abs(a - b) < 1e-9 for a, b in zip(trace, control_trace))

    return {"scenario": "D_off_topic_immunity", "concept": concept,
            "with_off_topic_trace": trace, "control_trace_no_off_topic": control_trace,
            "passed": matches}


def main() -> None:
    db = database.SessionLocal()
    results = []
    try:
        results.append(scenario_a_sustained_confident(db))
        results.append(scenario_b_sustained_confused(db))
        results.append(scenario_c_reversal(db))
        results.append(scenario_d_off_topic_immunity(db))
    finally:
        db.close()

    print("\n=== BKT mastery direction + off-topic immunity results ===\n")
    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"[{status}] {r['scenario']}  (concept={r['concept']})")
        if "mastery_trace" in r:
            print("        trace:", [round(x, 3) for x in r["mastery_trace"]])
        else:
            print("        with off-topic:   ", [round(x, 3) for x in r["with_off_topic_trace"]])
            print("        control (no off):  ", [round(x, 3) for x in r["control_trace_no_off_topic"]])

    out_path = Path(__file__).parent / "simulate_mastery_extremes_results.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {out_path}")

    all_passed = all(r["passed"] for r in results)
    print(f"\n{'ALL SCENARIOS PASSED' if all_passed else 'SOME SCENARIOS FAILED'}")
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
