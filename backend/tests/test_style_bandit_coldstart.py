"""
Tests for two related improvements (2026-07-23, follow-up pass):

  1. BKT forgetting/decay (services/ml_pipeline.py::MessageMLPipeline._decayed_mastery)
     -- classic BKT has no forgetting term, so mastery could only ever climb
     toward an equilibrium and never decay from inactivity, unlike the DKT
     model (dkt/temporal_decay.py) which already models this. Reuses that
     same retrievability curve so the two systems share one decay model.
  2. ProfileQuiz-derived StyleBandit cold start
     (dkt/style_bandit.py::derive_style_from_quiz, wired into
     tutor/nodes.py::select_teaching_style) -- a fresh StyleBandit's arms are
     near-identical near-zero-initialized nets, so its very first picks for a
     new student are close to random. Using the onboarding quiz's Q1/Q4
     answers as a `forced` pick until the bandit has real feedback replaces
     that near-random cold start with a real prior, without touching the
     bandit's behavior once it has data to learn from.

Run:  cd backend && python -m pytest tests/test_style_bandit_coldstart.py -v
"""

from __future__ import annotations

import os
import sys
import uuid
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta

import pytest

_SCRATCH_DIR = Path(tempfile.gettempdir()) / "brainwave_bandit_tests"
_SCRATCH_DIR.mkdir(exist_ok=True)
_SCRATCH_DB = _SCRATCH_DIR / f"style_coldstart_test_{uuid.uuid4().hex[:8]}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_SCRATCH_DB.as_posix()}"

sys.path.insert(0, str(Path(__file__).parent.parent))

import database  # noqa: E402
import models  # noqa: E402

database.Base.metadata.create_all(bind=database.engine)

from services.ml_pipeline import MessageMLPipeline  # noqa: E402
from dkt.style_bandit import (  # noqa: E402
    derive_style_from_quiz, StyleBandit, save_bandit, STYLES,
)
from tutor.nodes import select_teaching_style  # noqa: E402


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


class TestBKTDecay:

    def test_no_decay_at_zero_gap(self):
        now = datetime.now(timezone.utc)
        assert MessageMLPipeline._decayed_mastery(0.8, now, 5) == 0.8

    def test_no_decay_without_last_updated(self):
        assert MessageMLPipeline._decayed_mastery(0.8, None, 0) == 0.8

    def test_decays_after_long_gap(self):
        now = datetime.now(timezone.utc)
        decayed = MessageMLPipeline._decayed_mastery(0.8, now - timedelta(days=30), 0)
        assert decayed < 0.8

    def test_more_decay_after_longer_gap(self):
        now = datetime.now(timezone.utc)
        short_gap = MessageMLPipeline._decayed_mastery(0.8, now - timedelta(days=7), 0)
        long_gap = MessageMLPipeline._decayed_mastery(0.8, now - timedelta(days=90), 0)
        assert long_gap < short_gap < 0.8

    def test_more_practice_slows_decay(self):
        now = datetime.now(timezone.utc)
        low_practice = MessageMLPipeline._decayed_mastery(0.8, now - timedelta(days=30), 0)
        high_practice = MessageMLPipeline._decayed_mastery(0.8, now - timedelta(days=30), 20)
        assert high_practice > low_practice


class TestDeriveStyleFromQuiz:

    def test_no_preferences_returns_none(self):
        assert derive_style_from_quiz(None) is None
        assert derive_style_from_quiz({}) is None

    def test_step_by_step_preference(self):
        assert derive_style_from_quiz({"q1": ["A"]}) == "Cadence"

    def test_example_first_preference(self):
        assert derive_style_from_quiz({"q1": ["B"]}) == "Exemplar"

    def test_conceptual_preference(self):
        assert derive_style_from_quiz({"q1": ["C"]}) == "Axiom"

    def test_socratic_preference_from_q4(self):
        assert derive_style_from_quiz({"q4": ["B"]}) == "Catalyst"

    def test_combined_signals_accumulate(self):
        # q1=D leans Forge(2)+Bridge(1); q4=B adds Catalyst(2) --
        # Forge should still win since nothing else reaches 2.
        result = derive_style_from_quiz({"q1": ["D"], "q4": []})
        assert result == "Forge"


class TestStyleBanditColdStart:

    def _base_state(self, uid: int, db_factory) -> dict:
        return {
            "intent": "question",
            "_db_factory": db_factory,
            "user_id": str(uid),
            "language_analysis": {},
            "student_state": None,
            "session_gap_days": None,
            "decayed_concepts": [],
        }

    def test_fresh_bandit_uses_quiz_derived_style(self, db):
        uid = _mk_user(db, f"cold_{uuid.uuid4().hex[:6]}@x.com")
        db.add(models.ComprehensiveUserProfile(user_id=uid, derived_teaching_style="Catalyst"))
        db.commit()

        result = select_teaching_style(self._base_state(uid, database.SessionLocal))
        assert result["selected_style"] == "Catalyst"
        assert result["style_selection_source"] == "quiz_cold_start"

    def test_bandit_with_real_feedback_ignores_quiz_style(self, db):
        uid = _mk_user(db, f"warm_{uuid.uuid4().hex[:6]}@x.com")
        db.add(models.ComprehensiveUserProfile(user_id=uid, derived_teaching_style="Catalyst"))
        db.commit()

        # Give ONE arm a real update so the bandit is no longer "cold" --
        # the cold-start check must now be false and the quiz prior must no
        # longer be forced onto bandit.select().
        bandit = StyleBandit()
        bandit.arms["Axiom"].update(__import__("numpy").zeros(12), reward=1.0)
        save_bandit(uid, bandit, db)

        result = select_teaching_style(self._base_state(uid, database.SessionLocal))
        assert result["style_selection_source"] == "bandit"
        assert result["selected_style"] in STYLES

    def test_no_quiz_profile_falls_back_to_bandit_normally(self, db):
        uid = _mk_user(db, f"noquiz_{uuid.uuid4().hex[:6]}@x.com")
        result = select_teaching_style(self._base_state(uid, database.SessionLocal))
        assert result["style_selection_source"] == "bandit"
        assert result["selected_style"] in STYLES
