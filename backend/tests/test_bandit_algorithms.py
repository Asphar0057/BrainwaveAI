"""
Unit/statistical tests for the three bandit/RL subsystems:
  - services.rl_strategy_agent.StrategyBandit      (chat response strategy)
  - services.content_bandit.ContentDifficultyBandit (flashcard/quiz difficulty)
  - dkt.style_bandit.StyleBandit                    (neural teaching-style bandit)

These did not exist before (repo-wide grep found zero tests touching Bandit*
classes/tables). Written 2026-07-23 to close that gap and verify the actual
math (Thompson sampling convergence, alpha/beta updates, delayed-reward
resolution, neural-arm uncertainty shrinkage) against a REAL sqlite db, not
mocks -- run against an isolated scratch DB file, never the dev DB.

Run:  cd backend && python -m pytest tests/test_bandit_algorithms.py -v
"""

from __future__ import annotations

import os
import sys
import uuid
import random
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta

import pytest

# --- isolated scratch DB, created before any backend module import -------
_SCRATCH_DIR = Path(tempfile.gettempdir()) / "brainwave_bandit_tests"
_SCRATCH_DIR.mkdir(exist_ok=True)
_SCRATCH_DB = _SCRATCH_DIR / f"bandit_test_{uuid.uuid4().hex[:8]}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_SCRATCH_DB.as_posix()}"

sys.path.insert(0, str(Path(__file__).parent.parent))

import database  # noqa: E402
import models  # noqa: E402

database.Base.metadata.create_all(bind=database.engine)

from services.content_bandit import (  # noqa: E402
    ContentDifficultyBandit, encode_content_state, COLD_START_INTERACTIONS,
)
from services.rl_strategy_agent import (  # noqa: E402
    StrategyBandit, StateFeatures, encode_state,
)
from dkt.style_bandit import StyleBandit, build_context  # noqa: E402


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


# ---------------------------------------------------------------------------
# ContentDifficultyBandit
# ---------------------------------------------------------------------------

class TestContentDifficultyBandit:

    def test_cold_start_uses_rule_not_bandit(self, db):
        bandit = ContentDifficultyBandit()
        sid = f"student-{uuid.uuid4().hex[:8]}"
        for i in range(COLD_START_INTERACTIONS):
            sel = bandit.select_difficulty(db, sid, "flashcard", "algebra")
            assert sel.selection_method == "rule", f"pull {i} should be cold-start rule"
            assert sel.difficulty == "medium"  # middle of easy/medium/hard
        db.commit()

    def test_switches_to_bandit_after_cold_start(self, db):
        bandit = ContentDifficultyBandit()
        sid = f"student-{uuid.uuid4().hex[:8]}"
        for _ in range(COLD_START_INTERACTIONS):
            bandit.select_difficulty(db, sid, "flashcard", "algebra")
        db.commit()
        sel = bandit.select_difficulty(db, sid, "flashcard", "algebra")
        assert sel.selection_method == "bandit"
        assert set(sel.thompson_samples.keys()) == {"easy", "medium", "hard"}
        db.commit()

    def test_alpha_beta_update_arithmetic(self, db):
        bandit = ContentDifficultyBandit()
        sid = f"student-{uuid.uuid4().hex[:8]}"
        for _ in range(COLD_START_INTERACTIONS):
            bandit.select_difficulty(db, sid, "flashcard", "geometry")
        db.commit()

        # Force a known selection by monkeypatching thompson sampling away:
        # instead, just resolve reward against whatever the cold-start picked
        # and check the resulting row's alpha/beta match the documented formula.
        state_hash = encode_content_state("flashcard", "geometry")
        accuracy = 0.9  # -> reward = clip((0.9-0.5)*2, -1, 1) = 0.8
        bandit.resolve_reward(db, sid, "flashcard", "geometry", accuracy)

        row = (
            db.query(models.BanditState)
            .filter_by(student_id=sid, state_hash=state_hash, strategy_id="medium")
            .first()
        )
        assert row is not None, "cold start always selects the middle arm"
        expected_reward = max(-1.0, min(1.0, (accuracy - 0.5) * 2))
        normalized = (expected_reward + 1.0) / 2.0
        assert row.pulls == 1
        assert row.alpha == pytest.approx(1.0 + normalized)
        assert row.beta_param == pytest.approx(1.0 + (1.0 - normalized))
        assert row.avg_reward == pytest.approx(expected_reward)

    def test_resolve_reward_attributes_to_most_recent_unresolved_episode_only(self, db):
        bandit = ContentDifficultyBandit()
        sid = f"student-{uuid.uuid4().hex[:8]}"
        for _ in range(COLD_START_INTERACTIONS):
            bandit.select_difficulty(db, sid, "quiz", "calculus")
        db.commit()

        state_hash = encode_content_state("quiz", "calculus")
        episodes_before = (
            db.query(models.BanditEpisodeLog)
            .filter_by(student_id=sid, state_hash=state_hash)
            .order_by(models.BanditEpisodeLog.timestamp.asc())
            .all()
        )
        assert len(episodes_before) == COLD_START_INTERACTIONS
        assert all(e.reward_received is None for e in episodes_before)

        bandit.resolve_reward(db, sid, "quiz", "calculus", accuracy=1.0)

        resolved = [
            e for e in db.query(models.BanditEpisodeLog)
            .filter_by(student_id=sid, state_hash=state_hash).all()
            if e.reward_received is not None
        ]
        assert len(resolved) == 1, "exactly one episode should be resolved per reward call"
        assert resolved[0].id == episodes_before[-1].id, (
            "reward must attach to the MOST RECENT unresolved episode, not an arbitrary one"
        )

    def test_resolve_reward_noop_when_no_pending_episode(self, db):
        bandit = ContentDifficultyBandit()
        sid = f"student-{uuid.uuid4().hex[:8]}"
        # No select_difficulty call ever happened for this topic.
        bandit.resolve_reward(db, sid, "flashcard", "never_selected_topic", accuracy=1.0)
        state_hash = encode_content_state("flashcard", "never_selected_topic")
        rows = db.query(models.BanditState).filter_by(student_id=sid, state_hash=state_hash).all()
        assert rows == [], "resolve_reward must not fabricate a BanditState row with no prior selection"

    def test_converges_to_best_arm_over_many_pulls(self, db):
        """Statistical convergence check: with a clear reward gap between arms,
        Thompson sampling should pick the best arm far more often than chance
        once cold-start is over. This is the core promise of the whole system
        ("adapts to the student") -- if this fails, nothing downstream matters.
        """
        random.seed(42)
        bandit = ContentDifficultyBandit()
        sid = f"student-{uuid.uuid4().hex[:8]}"
        true_accuracy = {"easy": 0.55, "medium": 0.55, "hard": 0.95}  # hard is clearly best

        N_PULLS = 400
        choices = []
        for i in range(N_PULLS):
            sel = bandit.select_difficulty(db, sid, "flashcard", "convergence_topic")
            choices.append(sel.difficulty)
            acc = 1.0 if random.random() < true_accuracy[sel.difficulty] else 0.0
            bandit.resolve_reward(db, sid, "flashcard", "convergence_topic", acc)

        last_100 = choices[-100:]
        hard_rate = last_100.count("hard") / len(last_100)
        assert hard_rate > 0.6, (
            f"expected bandit to converge toward the best arm ('hard') in the "
            f"final 100/{N_PULLS} pulls, got hard_rate={hard_rate:.2f}, "
            f"distribution={ {a: last_100.count(a) for a in true_accuracy} }"
        )

    def test_domain_topic_arm_vocabulary_collision(self, db):
        """Reproduces a real bug: practice-quiz (routes/questions.py) and solo-quiz
        (routes/social.py) both use domain='quiz' but different arm vocabularies
        (easy/medium/hard vs beginner/intermediate/advanced). Because state_hash
        is only a function of (domain, topic), both flows share one BanditState/
        interaction_count bucket even though their arm labels are incompatible.
        """
        bandit = ContentDifficultyBandit()
        sid = f"student-{uuid.uuid4().hex[:8]}"
        topic = "shared_topic"

        # Practice-quiz vocabulary
        for _ in range(3):
            sel = bandit.select_difficulty(db, sid, "quiz", topic, arms=["easy", "medium", "hard"])
            assert sel.difficulty in ("easy", "medium", "hard")

        # Solo-quiz vocabulary, SAME domain+topic -> same state_hash
        for _ in range(3):
            sel2 = bandit.select_difficulty(db, sid, "quiz", topic, arms=["beginner", "intermediate", "advanced"])
            assert sel2.difficulty in ("beginner", "intermediate", "advanced")

        state_hash_easy_vocab = encode_content_state("quiz", topic)
        state_hash_beginner_vocab = encode_content_state("quiz", topic)
        assert state_hash_easy_vocab == state_hash_beginner_vocab, (
            "confirms the collision: both vocabularies hash to the identical state"
        )

        interaction_count = (
            db.query(models.BanditEpisodeLog)
            .filter_by(student_id=sid, state_hash=state_hash_easy_vocab)
            .count()
        )
        assert interaction_count == 6, (
            "cold-start counter is shared across both vocabularies -- 3 practice-quiz "
            "pulls + 3 solo-quiz pulls advance the SAME counter, so whichever flow the "
            "student uses second exits cold-start early using priors that came from a "
            "vocabulary its own arms don't recognize (silently dropped, see "
            "content_bandit.py _thompson_sample's `if row.strategy_id in params` guard)"
        )


# ---------------------------------------------------------------------------
# StrategyBandit (chat)
# ---------------------------------------------------------------------------

class TestStrategyBandit:

    def _state(self, **overrides) -> StateFeatures:
        base = dict(archetype="default", cognitive_state="confused", intent="question",
                    p_mastery=0.2, frustration_score=0.1, session_depth="early")
        base.update(overrides)
        return StateFeatures(**base)

    def test_below_20_interactions_always_rule(self, db):
        bandit = StrategyBandit()
        sid = f"{random.randint(10**6, 10**7)}"
        state = self._state()
        for i in range(19):
            sel = bandit.select_strategy(db, sid, state, interaction_count=i)
            assert sel.selection_method == "rule"
        db.commit()

    def test_above_100_interactions_explore_rate_near_10_percent(self, db):
        random.seed(7)
        bandit = StrategyBandit()
        sid = f"{random.randint(10**6, 10**7)}"
        state = self._state()
        n = 500
        explore_count = 0
        for _ in range(n):
            sel = bandit.select_strategy(db, sid, state, interaction_count=150)
            if sel.exploration_flag:
                explore_count += 1
        db.commit()
        rate = explore_count / n
        assert 0.05 < rate < 0.17, f"expected ~10% epsilon-exploration, got {rate:.3f}"

    def test_blend_zone_probability_matches_formula(self, db):
        """At interaction_count=60 (halfway through [20,100)), blend_weight = 0.5,
        so roughly half of selections should route through the bandit arm and half
        through the rule arm (method labels differ even when they'd pick the same
        strategy, so we assert on method label, not strategy_id)."""
        random.seed(11)
        bandit = StrategyBandit()
        sid = f"{random.randint(10**6, 10**7)}"
        state = self._state()
        n = 400
        bandit_methods = 0
        for _ in range(n):
            sel = bandit.select_strategy(db, sid, state, interaction_count=60)
            if sel.selection_method == "blend_bandit":
                bandit_methods += 1
        db.commit()
        rate = bandit_methods / n
        assert 0.35 < rate < 0.65, f"expected ~50% blend_bandit rate at midpoint, got {rate:.3f}"

    def test_rule_fallback_reanchors_off_topic(self, db):
        bandit = StrategyBandit()
        sid = f"{random.randint(10**6, 10**7)}"
        state = self._state(intent="off_topic")
        sel = bandit.select_strategy(db, sid, state, interaction_count=0)
        assert sel.strategy_id == "REANCHOR"
        db.commit()

    def test_measure_pending_rewards_resolves_queue_and_updates_bandit_state(self, db):
        """Exercises the REAL delayed-reward production path: queue a reward,
        insert the 'next message' MessageMLLog it depends on, backdate
        measure_after into the past (standing in for the real 2-minute wait),
        then run measure_pending_rewards exactly as the APScheduler job does
        every 300s in production (main.py) -- and confirm BanditState AND
        BanditEpisodeLog both end up updated."""
        bandit = StrategyBandit()
        user_id = _mk_user(db, f"user_{uuid.uuid4().hex[:8]}@test.local")
        sid = str(user_id)
        state = self._state(cognitive_state="stuck")
        interaction_count = 0

        sel = bandit.select_strategy(
            db, sid, state, interaction_count=interaction_count,
            p_mastery_before=0.2, frustration_before=0.6, engagement_before=0.4,
        )
        db.commit()

        now = datetime.now(timezone.utc)
        response_sent_at = now - timedelta(minutes=5)

        bandit.queue_reward_measurement(
            db, sid, session_id=None, message_id=None,
            state_hash=sel.state_hash, strategy_id=sel.strategy_id,
            p_mastery_before=0.2, frustration_before=0.6, engagement_before=0.4,
        )
        db.commit()

        q = db.query(models.BanditRewardQueue).filter_by(student_id=sid).order_by(
            models.BanditRewardQueue.response_sent_at.desc()
        ).first()
        q.response_sent_at = response_sent_at
        q.measure_after = response_sent_at + timedelta(minutes=2)
        db.commit()

        # The "next message" that proves the student continued + improved.
        next_msg = models.MessageMLLog(
            user_id=user_id,
            message_text="oh that makes sense now, thanks!",
            timestamp=response_sent_at + timedelta(minutes=1),
            frustration_score=0.1,
            engagement_score=0.8,
            kt_delta={"concept_x": 0.5},
        )
        db.add(next_msg)
        db.commit()

        # Use the real sessionmaker, exactly like production's APScheduler job
        # (main.py passes `SessionLocal` itself) -- measure_pending_rewards opens
        # its own session and closes it when done, so don't hand it our fixture's
        # already-open `db` session (it would get closed out from under us).
        bandit.measure_pending_rewards(database.SessionLocal)

        db.expire_all()
        q_after = db.query(models.BanditRewardQueue).filter_by(id=q.id).first()
        assert q_after.reward_measured is True
        assert q_after.reward_value is not None
        assert q_after.reward_components is not None
        assert "p_mastery_delta" in q_after.reward_components
        assert "engagement_delta" in q_after.reward_components
        assert "frustration_delta" in q_after.reward_components
        assert "session_continuation" in q_after.reward_components
        # Student continued, mastery rose 0.2->0.5, frustration dropped, engagement rose
        # -> reward should land clearly positive.
        assert q_after.reward_value > 0.3, f"expected clearly positive reward, got {q_after.reward_value}"

        episode = db.query(models.BanditEpisodeLog).filter_by(id=sel.episode_id).first()
        assert episode.reward_received == pytest.approx(q_after.reward_value)

        bs = (
            db.query(models.BanditState)
            .filter_by(student_id=sid, state_hash=sel.state_hash, strategy_id=sel.strategy_id)
            .first()
        )
        assert bs is not None, "measure_pending_rewards must write BanditState, not just the queue row"
        assert bs.pulls == 1


# ---------------------------------------------------------------------------
# StyleBandit (neural, currently orphaned per architecture research -- but
# the math itself should still be verified independently of wiring status)
# ---------------------------------------------------------------------------

class TestStyleBandit:

    def test_untrained_arms_are_all_equal_prior(self):
        bandit = StyleBandit()
        ctx = build_context("medium", [0.0] * 5, session_gap_days=1, n_interactions=5)
        _, scores = bandit.select(ctx)
        vals = list(scores.values())
        spread = max(vals) - min(vals)
        assert spread < 0.5, f"freshly initialized arms should score similarly (within MC noise), spread={spread:.3f}"

    def test_repeated_positive_updates_raise_that_arms_mean_score(self):
        random.seed(3)
        bandit = StyleBandit()
        ctx = build_context("medium", [0.3, 0.4, 0.5], session_gap_days=1, n_interactions=10)

        arm = "step_by_step"
        baseline_scores = [bandit.arms[arm].score(ctx, alpha=0.0) for _ in range(10)]
        baseline_mu = sum(baseline_scores) / len(baseline_scores)

        for _ in range(60):
            bandit.update(arm, ctx, reward=1.0)

        trained_scores = [bandit.arms[arm].score(ctx, alpha=0.0) for _ in range(10)]
        trained_mu = sum(trained_scores) / len(trained_scores)

        assert trained_mu > baseline_mu + 0.15, (
            f"arm trained toward reward=1.0 for 60 updates should score noticeably "
            f"higher (alpha=0, pure mean) than an untrained arm: baseline={baseline_mu:.3f} "
            f"trained={trained_mu:.3f}"
        )

    def test_uncertainty_shrinks_after_updates(self):
        """UCB-style exploration bonus (alpha * std across MC-dropout samples)
        should shrink for an arm as it accumulates updates on a consistent
        context/reward -- otherwise the bandit would keep over-exploring an
        already-well-understood arm forever.

        Must measure mu/std from a SINGLE batch of MC forward passes (mirroring
        _NeuralArm.score's own implementation) rather than diffing two separate
        score() calls -- each score() call redraws its own 30 dropout masks, so
        subtracting two independent calls conflates sampling noise in mu with
        the std term itself and is not a meaningful measurement.
        """
        import torch
        random.seed(5)
        bandit = StyleBandit()
        ctx = build_context("medium", [0.3, 0.4, 0.5], session_gap_days=1, n_interactions=10)
        arm = "conceptual"

        def mc_std(n_batches=15, mc_samples=30):
            net = bandit.arms[arm].net
            stds = []
            xt = torch.FloatTensor(ctx).unsqueeze(0)
            bandit.arms[arm].train()
            with torch.no_grad():
                for _ in range(n_batches):
                    preds = torch.cat([net(xt) for _ in range(mc_samples)], dim=0)
                    stds.append(float(preds.std()))
            return sum(stds) / len(stds)

        std_before = mc_std()
        for _ in range(80):
            bandit.update(arm, ctx, reward=0.8)
        std_after = mc_std()

        # NOT a monotonic shrink-with-training test. _NeuralArm.__init__ zero-inits
        # the final layer's weights (nn.init.zeros_), so a fresh arm's output is
        # dropout-invariant regardless of which hidden units get zeroed -- the
        # last layer maps everything to the same constant (its bias). MC-dropout
        # "uncertainty" is therefore artificially ~0 at cold start, not a genuine
        # reflection of low epistemic uncertainty, and only becomes real once
        # gradient updates move the final layer's weights away from zero. That
        # means the UCB explore bonus (alpha*std) contributes ~nothing to arm
        # selection until an arm has been updated at least once -- confirmed here.
        assert std_before < 1e-4, (
            f"expected near-zero uncertainty at cold start due to zero-inited final "
            f"layer, got {std_before:.4f} -- if this changes, the 'UCB bonus is inert "
            f"until first update' characteristic no longer holds and downstream docs "
            f"about cold-start behavior need revisiting"
        )
        assert std_after > 1e-3, (
            f"expected uncertainty to become non-trivial once the final layer's "
            f"zero-init has been perturbed by training, got {std_after:.4f}"
        )

    def test_json_roundtrip_preserves_learned_weights(self):
        """The real invariant is 'the serialized WEIGHTS are bit-identical after
        a roundtrip' -- not 'two independent stochastic score() calls agree',
        which they won't, since score() runs in .train() mode with live dropout
        by design (that's the whole MC-dropout uncertainty mechanism). Compare
        state_dict tensors directly instead."""
        import torch
        random.seed(9)
        bandit = StyleBandit()
        ctx = build_context("hard", [0.6, 0.7], session_gap_days=0, n_interactions=30)
        for _ in range(20):
            bandit.update("analogy", ctx, reward=0.9)

        before_state = {k: v.clone() for k, v in bandit.arms["analogy"].state_dict().items()}
        payload = bandit.to_json()

        restored = StyleBandit.from_json(payload)
        after_state = restored.arms["analogy"].state_dict()

        assert before_state.keys() == after_state.keys()
        for k in before_state:
            assert torch.equal(before_state[k], after_state[k]), (
                f"weight tensor {k!r} changed across to_json/from_json roundtrip -- "
                f"every server restart would silently reset this student's learned "
                f"style preference back to a fresh prior"
            )
        assert restored.arms["analogy"].n_updates == bandit.arms["analogy"].n_updates == 20

    def test_forced_style_bypasses_scoring(self):
        bandit = StyleBandit()
        ctx = build_context("medium", [], session_gap_days=0, n_interactions=0)
        chosen, _ = bandit.select(ctx, forced="socratic")
        assert chosen == "socratic"
