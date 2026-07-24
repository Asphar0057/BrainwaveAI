"""
Tests for dkt/trainer.py::should_retrain -- the gating check for the new
automatic DKT retraining scheduler (main.py). Before this, nothing ever
called POST /api/kt/train automatically (confirmed: no dkt_model.pt existed
on disk anywhere), so the DKT model had never actually been trained in
practice despite interaction data accumulating continuously. This adds a
periodic check that only fires a real (expensive) retrain when enough new
interaction volume has accumulated since the last one.

Run:  cd backend && python -m pytest tests/test_dkt_retrain_scheduler.py -v
"""

from __future__ import annotations

import os
import sys
import json
import uuid
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta

import pytest

_SCRATCH_DIR = Path(tempfile.gettempdir()) / "brainwave_bandit_tests"
_SCRATCH_DIR.mkdir(exist_ok=True)
_SCRATCH_DB = _SCRATCH_DIR / f"kt_retrain_test_{uuid.uuid4().hex[:8]}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_SCRATCH_DB.as_posix()}"

sys.path.insert(0, str(Path(__file__).parent.parent))

import database  # noqa: E402
import models  # noqa: E402

database.Base.metadata.create_all(bind=database.engine)

from dkt.trainer import should_retrain, TRAINING_STATE_PATH  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_training_state_file(tmp_path, monkeypatch):
    # should_retrain() reads/writes a real file path (dkt/training_state.json)
    # -- redirect it per-test so tests don't clobber the real dev marker or
    # leak state between tests.
    fake_path = tmp_path / "training_state.json"
    monkeypatch.setattr("dkt.trainer.TRAINING_STATE_PATH", str(fake_path))
    yield fake_path


@pytest.fixture(autouse=True)
def _clear_interaction_tables():
    # should_retrain() counts interactions GLOBALLY (matching production
    # semantics -- total volume across all students gates the scheduler, not
    # any one student), so tests sharing one scratch DB file must clear
    # between runs or earlier tests' rows silently inflate later counts.
    db = database.SessionLocal()
    try:
        db.query(models.ChatConceptSignal).delete()
        db.query(models.QuestionResult).delete()
        db.commit()
    finally:
        db.close()
    yield


def _mk_user(db, email: str) -> int:
    u = models.User(email=email, username=email.split("@")[0], hashed_password="x")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u.id


def _add_chat_signals(db, uid: int, n: int) -> None:
    for i in range(n):
        db.add(models.ChatConceptSignal(
            user_id=uid, concept=f"concept_{i}", signal_type="explicit", knowledge_signal=0.5,
        ))
    db.commit()


class TestShouldRetrain:

    def test_never_trained_with_enough_data_returns_true(self, _isolate_training_state_file):
        db = database.SessionLocal()
        try:
            uid = _mk_user(db, f"never_{uuid.uuid4().hex[:6]}@x.com")
            _add_chat_signals(db, uid, 25)
        finally:
            db.close()

        assert should_retrain(database.SessionLocal, min_interactions_for_first_train=20) is True

    def test_never_trained_with_too_little_data_returns_false(self, _isolate_training_state_file):
        db = database.SessionLocal()
        try:
            uid = _mk_user(db, f"toofew_{uuid.uuid4().hex[:6]}@x.com")
            _add_chat_signals(db, uid, 5)
        finally:
            db.close()

        assert should_retrain(database.SessionLocal, min_interactions_for_first_train=20) is False

    def test_recently_trained_with_little_new_data_returns_false(self, _isolate_training_state_file):
        db = database.SessionLocal()
        try:
            uid = _mk_user(db, f"recent_{uuid.uuid4().hex[:6]}@x.com")
            _add_chat_signals(db, uid, 30)
        finally:
            db.close()

        _isolate_training_state_file.write_text(json.dumps({
            "last_trained_at": datetime.now(timezone.utc).isoformat(),
            "n_interactions": 28,
        }))

        assert should_retrain(
            database.SessionLocal, min_new_interactions=50, min_hours_between=6.0
        ) is False

    def test_enough_new_data_but_too_soon_returns_false(self, _isolate_training_state_file):
        db = database.SessionLocal()
        try:
            uid = _mk_user(db, f"toosoon_{uuid.uuid4().hex[:6]}@x.com")
            _add_chat_signals(db, uid, 200)
        finally:
            db.close()

        _isolate_training_state_file.write_text(json.dumps({
            "last_trained_at": datetime.now(timezone.utc).isoformat(),
            "n_interactions": 0,
        }))

        assert should_retrain(
            database.SessionLocal, min_new_interactions=50, min_hours_between=6.0
        ) is False

    def test_enough_new_data_and_enough_time_returns_true(self, _isolate_training_state_file):
        db = database.SessionLocal()
        try:
            uid = _mk_user(db, f"ready_{uuid.uuid4().hex[:6]}@x.com")
            _add_chat_signals(db, uid, 200)
        finally:
            db.close()

        old_ts = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
        _isolate_training_state_file.write_text(json.dumps({
            "last_trained_at": old_ts,
            "n_interactions": 0,
        }))

        assert should_retrain(
            database.SessionLocal, min_new_interactions=50, min_hours_between=6.0
        ) is True

    def test_corrupt_state_file_treated_as_never_trained(self, _isolate_training_state_file):
        db = database.SessionLocal()
        try:
            uid = _mk_user(db, f"corrupt_{uuid.uuid4().hex[:6]}@x.com")
            _add_chat_signals(db, uid, 25)
        finally:
            db.close()

        _isolate_training_state_file.write_text("not valid json{{{")

        assert should_retrain(database.SessionLocal, min_interactions_for_first_train=20) is True
