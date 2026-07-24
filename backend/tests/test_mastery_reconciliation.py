"""
Tests for services/mastery_reconciliation.py -- the BKT/DKT unification
requested after the earlier finding that the two mastery signals were fully
independent (a student could show 80% BKT mastery in chat while DKT said 40%
for the same concept, never compared). This doesn't replace either system;
it blends them by evidence volume and is used both for the chat prompt's
"Current mastery" line (services/ml_pipeline.py::process) and StyleBandit's
context vector (tutor/nodes.py::select_teaching_style).

Run:  cd backend && python -m pytest tests/test_mastery_reconciliation.py -v
"""

from __future__ import annotations

import os
import sys
import uuid
import tempfile
from pathlib import Path
from datetime import datetime, timezone

import pytest

_SCRATCH_DIR = Path(tempfile.gettempdir()) / "brainwave_bandit_tests"
_SCRATCH_DIR.mkdir(exist_ok=True)
_SCRATCH_DB = _SCRATCH_DIR / f"mastery_recon_test_{uuid.uuid4().hex[:8]}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_SCRATCH_DB.as_posix()}"

sys.path.insert(0, str(Path(__file__).parent.parent))

import database  # noqa: E402
import models  # noqa: E402

database.Base.metadata.create_all(bind=database.engine)

from services.mastery_reconciliation import blend_mastery, get_concept_mastery  # noqa: E402


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


class TestBlendMastery:

    def test_no_evidence_returns_prior(self):
        assert blend_mastery(None, 0, None, 0) == 0.5

    def test_only_bkt_available_returns_bkt(self):
        assert blend_mastery(0.7, 5, None, 0) == 0.7

    def test_only_dkt_available_returns_dkt(self):
        assert blend_mastery(None, 0, 0.3, 5) == 0.3

    def test_more_dkt_evidence_pulls_blend_toward_dkt(self):
        # BKT says 0.9 with only 1 interaction; DKT says 0.2 with 20 --
        # the blend should sit much closer to DKT's number.
        blended = blend_mastery(0.9, 1, 0.2, 20)
        assert 0.2 < blended < 0.55
        assert abs(blended - 0.2) < abs(blended - 0.9)

    def test_equal_evidence_averages(self):
        blended = blend_mastery(0.8, 10, 0.4, 10)
        # DKT weighted 1.5x BKT even at equal interaction counts.
        assert blended < 0.6  # pulled below the midpoint (0.6) toward DKT
        assert blended > 0.4


class TestGetConceptMastery:

    def test_no_data_returns_none_source(self, db):
        uid = _mk_user(db, f"nodata_{uuid.uuid4().hex[:6]}@x.com")
        result = get_concept_mastery(uid, "photosynthesis", db)
        assert result["source"] == "none"
        assert result["mastery"] == 0.5

    def test_bkt_only_uses_bkt_value(self, db):
        uid = _mk_user(db, f"bktonly_{uuid.uuid4().hex[:6]}@x.com")
        db.add(models.StudentKnowledgeState(
            user_id=uid, concept_id="cell_biology", concept_name="cell_biology",
            p_mastery=0.65, p_learn=0.09, p_slip=0.1, p_guess=0.2,
            interaction_count=4, last_updated=datetime.now(timezone.utc),
        ))
        db.commit()

        result = get_concept_mastery(uid, "cell_biology", db)
        # No trained DKT model in this scratch env -> falls back to pure BKT.
        assert result["source"] == "bkt"
        assert abs(result["mastery"] - 0.65) < 1e-6
        assert result["dkt_mastery"] is None
