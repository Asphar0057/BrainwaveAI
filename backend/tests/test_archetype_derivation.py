"""Tests for ProfileQuiz-derived archetype scoring (2026-07-24).

Real gap found: ProfileQuiz.js's real onboarding flow (src/pages/ProfileQuiz.js,
handleSubmit) posts `learning_preferences` + `quiz_completed: true` to
/save_complete_profile but never sends primary_archetype/secondary_archetype/
archetype_scores/archetype_description -- so comprehensive_profile.primary_archetype
was always blank for every real user, which silently disables:
  - rl_strategy_agent.py::_rule_based_fallback's Kinetiq/Logicor/Flowist mapping
  - ml_pipeline.py's archetype_p_learn BKT prior (Logicor/Kinetiq/Flowist)
services/archetype.py::derive_archetype_from_quiz mirrors the shape of
dkt/style_bandit.py::derive_style_from_quiz (already used for StyleBandit's
cold start from the same learning_preferences payload) but scores a different,
persisted axis. Wired into routes/auth.py::save_complete_profile.

Run:  cd backend && python -m pytest tests/test_archetype_derivation.py -v
"""

from __future__ import annotations

import os
import sys
import uuid
import json
import tempfile
from pathlib import Path

import pytest

_SCRATCH_DIR = Path(tempfile.gettempdir()) / "brainwave_bandit_tests"
_SCRATCH_DIR.mkdir(exist_ok=True)
_SCRATCH_DB = _SCRATCH_DIR / f"archetype_test_{uuid.uuid4().hex[:8]}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_SCRATCH_DB.as_posix()}"

sys.path.insert(0, str(Path(__file__).parent.parent))

import database  # noqa: E402
import models  # noqa: E402

database.Base.metadata.create_all(bind=database.engine)

from services.archetype import derive_archetype_from_quiz, ARCHETYPES  # noqa: E402
from routes.auth import save_complete_profile  # noqa: E402


@pytest.fixture()
def db():
    session = database.SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _mk_user(db, email: str) -> models.User:
    u = models.User(email=email, username=email.split("@")[0], hashed_password="x")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


class TestDeriveArchetypeFromQuiz:

    def test_no_signal_returns_none(self):
        assert derive_archetype_from_quiz(None) is None
        assert derive_archetype_from_quiz({}) is None
        assert derive_archetype_from_quiz({"q1": [], "q3": [], "q5": []}) is None

    def test_all_structured_answers_score_logicor(self):
        result = derive_archetype_from_quiz({"q1": ["A"], "q3": ["A"], "q5": ["A"]})
        assert result is not None
        assert result["primary_archetype"] == "Logicor"
        assert result["archetype_description"]

    def test_all_adaptive_answers_score_flowist(self):
        result = derive_archetype_from_quiz({"q1": ["B"], "q3": ["B"], "q5": ["B"]})
        assert result["primary_archetype"] == "Flowist"

    def test_all_practical_answers_score_kinetiq(self):
        result = derive_archetype_from_quiz({"q1": ["D"], "q3": ["C"], "q5": ["C"]})
        assert result["primary_archetype"] == "Kinetiq"

    def test_mixed_answers_produce_a_nonzero_secondary(self):
        # 2x Logicor-leaning (A) + 1x Flowist-leaning (B) -> Logicor primary,
        # Flowist secondary.
        result = derive_archetype_from_quiz({"q1": ["A"], "q3": ["A"], "q5": ["B"]})
        assert result["primary_archetype"] == "Logicor"
        assert result["secondary_archetype"] == "Flowist"

    def test_scores_dict_covers_all_three_archetypes(self):
        result = derive_archetype_from_quiz({"q1": ["A"], "q3": ["B"], "q5": ["C"]})
        assert set(result["archetype_scores"].keys()) == set(ARCHETYPES)

    def test_irrelevant_questions_are_ignored(self):
        """q2/q4 aren't part of the archetype rubric (q4 already drives
        StyleBandit's cold start, a different axis) -- garbage there shouldn't
        affect scoring."""
        with_noise = derive_archetype_from_quiz(
            {"q1": ["A"], "q3": ["A"], "q5": ["A"], "q2": ["D"], "q4": ["B"]}
        )
        without_noise = derive_archetype_from_quiz({"q1": ["A"], "q3": ["A"], "q5": ["A"]})
        assert with_noise["archetype_scores"] == without_noise["archetype_scores"]


class TestSaveCompleteProfileWiring:

    @pytest.mark.asyncio
    async def test_real_onboarding_payload_populates_archetype(self, db):
        """Exercises the REAL production path: the exact payload shape
        ProfileQuiz.js's handleSubmit sends (learning_preferences +
        quiz_completed=True, no archetype fields at all)."""
        user = _mk_user(db, f"user_{uuid.uuid4().hex[:8]}@test.local")
        payload = {
            "user_id": user.username,
            "learning_stage": "Undergraduate Student",
            "preferred_subjects": ["Biology"],
            "main_subject": "Biology",
            "brainwave_goal": "exam_prep",
            "learning_preferences": {
                "q1": ["A"], "q2": ["B"], "q3": ["A"], "q4": ["A"], "q5": ["A"],
            },
            "quiz_completed": True,
        }

        await save_complete_profile(payload=payload, db=db)

        db.expire_all()
        profile = db.query(models.ComprehensiveUserProfile).filter_by(user_id=user.id).one()
        assert profile.primary_archetype == "Logicor"
        assert profile.archetype_scores
        assert json.loads(profile.archetype_scores)["Logicor"] > 0
        assert profile.archetype_description

    @pytest.mark.asyncio
    async def test_explicit_archetype_fields_are_not_overridden(self, db):
        """The dedicated /save_archetype_profile endpoint's contract (explicit
        primary_archetype in the payload) must still win over derivation, for
        any caller that supplies it directly."""
        user = _mk_user(db, f"user_{uuid.uuid4().hex[:8]}@test.local")
        payload = {
            "user_id": user.username,
            "learning_preferences": {"q1": ["A"], "q3": ["A"], "q5": ["A"]},  # would derive Logicor
            "primary_archetype": "Flowist",
            "secondary_archetype": "Kinetiq",
            "archetype_scores": {"Flowist": 9.0},
            "archetype_description": "explicit description",
            "quiz_completed": True,
        }

        await save_complete_profile(payload=payload, db=db)

        db.expire_all()
        profile = db.query(models.ComprehensiveUserProfile).filter_by(user_id=user.id).one()
        assert profile.primary_archetype == "Flowist"
        assert profile.archetype_description == "explicit description"

    @pytest.mark.asyncio
    async def test_skipped_quiz_does_not_derive_archetype(self, db):
        user = _mk_user(db, f"user_{uuid.uuid4().hex[:8]}@test.local")
        payload = {
            "user_id": user.username,
            "learning_stage": "Undergraduate Student",
            "quiz_completed": False,
            "quiz_skipped": True,
        }

        await save_complete_profile(payload=payload, db=db)

        db.expire_all()
        profile = db.query(models.ComprehensiveUserProfile).filter_by(user_id=user.id).one()
        assert not profile.primary_archetype
