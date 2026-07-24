"""
Regression tests for the BKT mastery update in services.ml_pipeline, covering
two bugs fixed 2026-07-23:

  1. Naive substring keyword matching (`kw in msg_lower`) misclassified
     ordinary academic messages as off_topic/frustrated because short
     keywords like "hi" and "help" appear inside unrelated words ("this",
     "which", "white", "helpful"). Fixed with word-boundary matching
     (_keyword_hit).
  2. _layer1_intent_concept silently fell back to the previous session
     concept for ANY message with no fresh concept match, including
     off-topic chit-chat -- so "hi"/"thanks" mid-conversation fed the BKT
     update a low-confidence "wrong answer" observation against whatever
     concept was last discussed, and inflated messages_on_concept (which
     drives the >=3 "stuck" override) on turns that never engaged the
     concept at all. Fixed by dropping the fallback from layer1 and gating
     the BKT-only carry-forward in process() on intent != "off_topic".

Run:  cd backend && python -m pytest tests/test_ml_pipeline_mastery.py -v
"""

from __future__ import annotations

import os
import sys
import uuid
import asyncio
import tempfile
from pathlib import Path

import pytest

_SCRATCH_DIR = Path(tempfile.gettempdir()) / "brainwave_bandit_tests"
_SCRATCH_DIR.mkdir(exist_ok=True)
_SCRATCH_DB = _SCRATCH_DIR / f"ml_pipeline_test_{uuid.uuid4().hex[:8]}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_SCRATCH_DB.as_posix()}"

sys.path.insert(0, str(Path(__file__).parent.parent))

import database  # noqa: E402
import models  # noqa: E402

database.Base.metadata.create_all(bind=database.engine)

from services.ml_pipeline import (  # noqa: E402
    MessageMLPipeline, SessionContext, _keyword_hit, _is_filler_message,
)


@pytest.fixture()
def db():
    session = database.SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _mk_user(db, email: str) -> int:
    u = models.User(email=email, username=email.split("@")[0], hashed_password="x")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u.id


def _mk_pipeline() -> MessageMLPipeline:
    pipeline = MessageMLPipeline(db_factory=None, memory_svc=None)
    # Disable the embedding-similarity concept detector: deterministic,
    # network-free tests. Only keyword-driven intent classification and the
    # explicit session-concept carry-forward are under test here.
    pipeline._registry.embed = lambda text: None
    return pipeline


class TestKeywordMatching:

    def test_hi_does_not_match_inside_other_words(self):
        for word in ("this", "which", "white", "history", "think", "chip"):
            assert not _keyword_hit(word, "hi"), f"'hi' should not match inside {word!r}"

    def test_hi_matches_standalone(self):
        assert _keyword_hit("hi there", "hi")
        assert _keyword_hit("hi", "hi")
        assert _keyword_hit("oh hi!", "hi")

    def test_help_does_not_match_inside_helpful(self):
        assert not _keyword_hit("that was helpful, thanks", "help")
        assert _keyword_hit("i need help with this", "help")

    def test_multi_word_phrase_still_matches(self):
        assert _keyword_hit("this doesn't make sense to me", "doesn't make sense")
        assert not _keyword_hit("that makes total sense", "doesn't make sense")


class TestFillerDetection:

    def test_pure_filler_detected(self):
        for msg in ("hi", "thanks!", "lol ok", "yep thanks", "sure ok"):
            assert _is_filler_message(msg.lower()), f"{msg!r} should be pure filler"

    def test_hey_there_still_off_topic_via_keyword_list(self):
        # Not pure filler by the strict word-set helper ("there" isn't a
        # filler word), but still correctly reaches off_topic through the
        # existing off_topic keyword list ("hey") in the main loop.
        pipeline = _mk_pipeline()
        session = SessionContext()
        intent, _ = asyncio.run(
            pipeline._layer1_intent_concept("hey there", None, 1, session)
        )
        assert intent == "off_topic"

    def test_substantive_message_starting_with_filler_word_not_filler(self):
        # A message must be ENTIRELY filler to short-circuit -- otherwise a
        # real question that happens to start with "ok"/"sure" would be
        # wrongly classified off_topic and skip the BKT update it deserves.
        msg = "ok so how does osmosis work in plant cells"
        assert not _is_filler_message(msg.lower())

    def test_filler_classified_off_topic_via_layer1(self):
        pipeline = _mk_pipeline()
        session = SessionContext(current_concept_id="thermodynamics")
        intent, concepts = asyncio.run(
            pipeline._layer1_intent_concept("thanks!", None, 1, session)
        )
        assert intent == "off_topic"
        assert concepts == []


class TestIntentClassification:

    def test_science_messages_not_misclassified_off_topic(self):
        pipeline = _mk_pipeline()
        session = SessionContext()
        cases = [
            "which effect explains this reaction?",
            "white blood cells fight infection in the body",
            "give me a brief history of this theory",
            "I think this is confusing me a lot",
        ]
        for msg in cases:
            intent, _ = asyncio.run(pipeline._layer1_intent_concept(msg, None, 1, session))
            assert intent != "off_topic", f"{msg!r} wrongly classified as off_topic"

    def test_greeting_is_off_topic(self):
        pipeline = _mk_pipeline()
        session = SessionContext()
        intent, _ = asyncio.run(pipeline._layer1_intent_concept("hi there!", None, 1, session))
        assert intent == "off_topic"

    def test_layer1_does_not_backfill_stale_concept(self):
        # Regression: layer1 used to silently re-stamp session.current_concept_id
        # into its return value whenever no fresh concept was detected -- even
        # for off-topic turns. detected_concepts must now reflect only genuine
        # detections, empty when there are none.
        pipeline = _mk_pipeline()
        session = SessionContext(current_concept_id="thermodynamics")
        _intent, concepts = asyncio.run(
            pipeline._layer1_intent_concept("hi thanks!", None, 1, session)
        )
        assert concepts == []


class TestBKTMasteryDirection:

    def test_confident_signal_increases_mastery_from_mid(self, db):
        # Regression: every CONFIDENCE value used to be <= 0.5, so
        # `if obs > 0.5` (the "correct answer" BKT branch) was unreachable --
        # mastery could only ever be pulled toward a low floor, never rise
        # from genuine understanding. "confident" (obs=0.85) must actually
        # raise mastery starting from a real mid-level, not just drift
        # slightly above a near-zero floor.
        pipeline = _mk_pipeline()
        uid = _mk_user(db, f"conf_{uuid.uuid4().hex[:6]}@x.com")
        concept = "photosynthesis"
        state = models.StudentKnowledgeState(
            user_id=uid, concept_id=concept, concept_name=concept,
            p_mastery=0.4, p_learn=0.09, p_slip=0.1, p_guess=0.2,
        )
        db.add(state)
        db.commit()

        _p, _d, kt_before, kt_after = asyncio.run(
            pipeline._layer2_bkt_update(db, uid, [concept], "confident")
        )
        assert kt_after[concept] > kt_before[concept], \
            "a confident/breakthrough turn should raise mastery"
        assert kt_after[concept] > 0.5, \
            f"expected a real jump above the 0.4 seed, got {kt_after[concept]}"

    def test_breakthrough_overrides_turn_count_stuck_default(self, db):
        # Regression: once messages_on_concept >= 3 forced intent="stuck",
        # the keyword-matching loop was skipped entirely (or broke after
        # checking only the first category), so a breakthrough message could
        # never be recognized -- the student would be stuck forever in the
        # pipeline's eyes even after saying "oh wait, that makes sense now!".
        pipeline = _mk_pipeline()
        session = SessionContext(messages_on_concept=5)
        intent, _ = asyncio.run(
            pipeline._layer1_intent_concept(
                "oh wait, that makes sense now!", None, 1, session
            )
        )
        assert intent == "confident"

    def test_confused_signal_decreases_mastery_from_mid(self, db):
        pipeline = _mk_pipeline()
        uid = _mk_user(db, f"confd_{uuid.uuid4().hex[:6]}@x.com")
        concept = "integration_by_parts"
        state = models.StudentKnowledgeState(
            user_id=uid, concept_id=concept, concept_name=concept,
            p_mastery=0.6, p_learn=0.09, p_slip=0.1, p_guess=0.2,
        )
        db.add(state)
        db.commit()

        _p, _d, kt_before, kt_after = asyncio.run(
            pipeline._layer2_bkt_update(db, uid, [concept], "confused")
        )
        assert kt_after[concept] < kt_before[concept], \
            "a confused-intent turn should lower mastery, not raise it"

    def test_off_topic_never_touches_mastery(self, db):
        pipeline = _mk_pipeline()
        uid = _mk_user(db, f"offt_{uuid.uuid4().hex[:6]}@x.com")
        concept = "cell_biology"
        state = models.StudentKnowledgeState(
            user_id=uid, concept_id=concept, concept_name=concept,
            p_mastery=0.55, p_learn=0.09, p_slip=0.1, p_guess=0.2,
        )
        db.add(state)
        db.commit()

        session = SessionContext(current_concept_id=concept, messages_on_concept=1)
        out = asyncio.run(pipeline.process("hi thanks!", str(uid), session, db))

        db.refresh(state)
        assert state.p_mastery == 0.55, \
            "off-topic chit-chat must not move an unrelated concept's mastery"
        assert out.detected_concepts == []

    def test_off_topic_does_not_inflate_messages_on_concept(self, db):
        # Regression for the "stuck" false-trip: three off-topic turns used to
        # look like three turns "on" the stale concept because layer1 kept
        # re-stamping it into detected_concepts.
        pipeline = _mk_pipeline()
        uid = _mk_user(db, f"stuck_{uuid.uuid4().hex[:6]}@x.com")
        concept = "linear_algebra"
        db.add(models.StudentKnowledgeState(
            user_id=uid, concept_id=concept, concept_name=concept,
            p_mastery=0.5, p_learn=0.09, p_slip=0.1, p_guess=0.2,
        ))
        db.commit()

        session = SessionContext(current_concept_id=concept, messages_on_concept=0)
        for _ in range(4):
            out = asyncio.run(pipeline.process("hi", str(uid), session, db))
            assert out.detected_concepts == []
            # messages_on_concept is driven by the caller (routes/chat.py) off of
            # detected_concepts; since that's empty, a real caller would never
            # bump the counter here -- confirm there's nothing to bump.
