"""
Unit/statistical tests for the three bandit/RL subsystems:
  - services.rl_strategy_agent.StrategyBandit      (chat response strategy)
  - services.content_bandit.ContentDifficultyBandit (flashcard/quiz difficulty)
  - dkt.style_bandit.StyleBandit                    (neural teaching-style bandit)

These did not exist before (repo-wide grep found zero tests touching Bandit*
classes/tables). Written 2026-07-23 to close that gap and verify the actual
math (Thompson sampling convergence, alpha/beta updates, delayed-reward
resolution, neural-arm uncertainty/persistence) against a REAL sqlite db, not
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
    StrategyBandit, StateFeatures, encode_state, STRATEGY_IDS,
)
from dkt.style_bandit import StyleBandit, build_context  # noqa: E402
from services.difficulty_allocation import allocate_difficulty_counts  # noqa: E402
from services.content_bandit import resolve_flashcard_set_reward  # noqa: E402


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
            bandit.resolve_reward(
                db, sid, "flashcard", "algebra", accuracy=0.7,
                episode_id=sel.episode_id,
            )

    def test_switches_to_bandit_after_cold_start(self, db):
        bandit = ContentDifficultyBandit()
        sid = f"student-{uuid.uuid4().hex[:8]}"
        for _ in range(COLD_START_INTERACTIONS):
            sel = bandit.select_difficulty(db, sid, "flashcard", "algebra")
            bandit.resolve_reward(
                db, sid, "flashcard", "algebra", accuracy=0.7,
                episode_id=sel.episode_id,
            )
        sel = bandit.select_difficulty(db, sid, "flashcard", "algebra")
        assert sel.selection_method == "bandit"
        assert set(sel.thompson_samples.keys()) == {"easy", "medium", "hard"}
        db.commit()

    def test_abandoned_generations_do_not_end_cold_start(self, db):
        bandit = ContentDifficultyBandit()
        sid = f"student-{uuid.uuid4().hex[:8]}"
        for _ in range(COLD_START_INTERACTIONS + 3):
            sel = bandit.select_difficulty(db, sid, "quiz", "abandoned")
            assert sel.selection_method == "rule"
        db.commit()

        next_selection = bandit.select_difficulty(db, sid, "quiz", "abandoned")
        assert next_selection.selection_method == "rule"

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

    def test_exact_episode_resolution_handles_out_of_order_completion(self, db):
        bandit = ContentDifficultyBandit()
        sid = f"student-{uuid.uuid4().hex[:8]}"
        topic = "same-topic"
        older = bandit.select_difficulty(db, sid, "quiz", topic)
        newer = bandit.select_difficulty(db, sid, "quiz", topic)
        db.commit()

        resolved = bandit.resolve_reward(
            db, sid, "quiz", topic, accuracy=1.0, episode_id=older.episode_id,
        )
        assert resolved is True

        older_row = db.query(models.BanditEpisodeLog).filter_by(id=older.episode_id).one()
        newer_row = db.query(models.BanditEpisodeLog).filter_by(id=newer.episode_id).one()
        assert older_row.reward_received == pytest.approx(1.0)
        assert newer_row.reward_received is None

    @pytest.mark.parametrize(
        ("count", "mix", "expected"),
        [
            (10, {"easy": 3, "medium": 5, "hard": 2}, {"easy": 3, "medium": 5, "hard": 2}),
            (10, {"easy": 1, "medium": 0, "hard": 0}, {"easy": 10, "medium": 0, "hard": 0}),
            (10, {"easy": 0, "medium": 1, "hard": 0}, {"easy": 0, "medium": 10, "hard": 0}),
            (10, {"easy": 0, "medium": 0, "hard": 1}, {"easy": 0, "medium": 0, "hard": 10}),
            (1, {"easy": 3, "medium": 5, "hard": 2}, {"easy": 0, "medium": 1, "hard": 0}),
        ],
    )
    def test_difficulty_allocation_is_exact(self, count, mix, expected):
        allocated = allocate_difficulty_counts(count, mix)
        assert allocated == expected
        assert sum(allocated.values()) == count

    def test_all_quiz_surfaces_use_canonical_arm_vocabulary(self, db):
        bandit = ContentDifficultyBandit()
        selection = bandit.select_difficulty(
            db, f"student-{uuid.uuid4().hex[:8]}", "quiz", "shared-topic",
        )
        assert selection.difficulty in {"easy", "medium", "hard"}

    def test_flashcard_reward_waits_for_representative_set_evidence(self, db):
        bandit = ContentDifficultyBandit()
        user_id = _mk_user(db, f"user_{uuid.uuid4().hex[:8]}@test.local")
        topic = "cell biology"
        selection = bandit.select_difficulty(
            db, str(user_id), "flashcard", topic,
        )
        flashcard_set = models.FlashcardSet(
            user_id=user_id,
            title="Flashcards: Cell Biology",
            bandit_episode_id=selection.episode_id,
            bandit_topic_key=topic,
        )
        db.add(flashcard_set)
        db.flush()
        cards = [
            models.Flashcard(
                set_id=flashcard_set.id,
                question=f"Question {index}",
                answer=f"Answer {index}",
                times_reviewed=0,
                correct_count=0,
            )
            for index in range(3)
        ]
        db.add_all(cards)
        db.commit()

        for index, was_correct in enumerate((True, False)):
            cards[index].times_reviewed = 1
            cards[index].correct_count = int(was_correct)
            db.commit()
            assert resolve_flashcard_set_reward(
                db, flashcard_set, str(user_id), float(was_correct),
            ) is False

        cards[2].times_reviewed = 1
        cards[2].correct_count = 1
        db.commit()
        assert resolve_flashcard_set_reward(
            db, flashcard_set, str(user_id), 1.0,
        ) is True

        episode = db.query(models.BanditEpisodeLog).filter_by(
            id=selection.episode_id,
        ).one()
        assert episode.reward_received == pytest.approx((2 / 3 - 0.5) * 2)


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

    def test_mastery_and_frustration_buckets_coarsened_to_three(self):
        """Coarsened 2026-07-24 from 5/4 buckets to 3/3 to shrink the state-hash
        space (see encode_state's comment) -- lock the exact boundaries down."""
        assert self._state(p_mastery=0.0).p_mastery_bucket == "novice"
        assert self._state(p_mastery=0.34).p_mastery_bucket == "novice"
        assert self._state(p_mastery=0.35).p_mastery_bucket == "developing"
        assert self._state(p_mastery=0.69).p_mastery_bucket == "developing"
        assert self._state(p_mastery=0.70).p_mastery_bucket == "proficient"
        assert self._state(p_mastery=1.0).p_mastery_bucket == "proficient"

        assert self._state(frustration_score=0.0).frustration_bucket == "calm"
        assert self._state(frustration_score=0.34).frustration_bucket == "calm"
        assert self._state(frustration_score=0.35).frustration_bucket == "elevated"
        assert self._state(frustration_score=0.69).frustration_bucket == "elevated"
        assert self._state(frustration_score=0.70).frustration_bucket == "crisis"
        assert self._state(frustration_score=1.0).frustration_bucket == "crisis"

    def test_global_pooling_lets_a_brand_new_student_benefit_from_others(self, db):
        """Root sparsity fix (2026-07-24): a state that's common across the
        population should converge for a brand-new student from their very
        first bandit-eligible pull, not just their own (near-zero) history.
        Feed 300 DIFFERENT students through the same state, always rewarding
        CHALLENGE_PUSH highly and everything else near zero, then confirm one
        final never-before-seen student's Thompson sample favors it."""
        random.seed(101)
        bandit = StrategyBandit()
        state = self._state(cognitive_state="processing", p_mastery=0.9, frustration_score=0.0)
        state_hash = encode_state(state)

        for _ in range(300):
            sid = f"{random.randint(10**8, 10**9)}"
            for strategy in STRATEGY_IDS:
                reward = 0.9 if strategy == "CHALLENGE_PUSH" else -0.5
                bandit._update_bandit_params(db, sid, state_hash, strategy, reward)
        db.commit()

        new_student = f"{random.randint(10**8, 10**9)}"
        wins = {s: 0 for s in STRATEGY_IDS}
        for _ in range(200):
            choice, _ = bandit._thompson_sample(db, new_student, state_hash)
            wins[choice] += 1

        assert wins["CHALLENGE_PUSH"] / 200 > 0.5, (
            f"expected a brand-new student to inherit the population's preference "
            f"for CHALLENGE_PUSH in this state, got distribution={wins}"
        )

    def test_students_own_evidence_eventually_overrides_the_population_prior(self, db):
        """A student with enough of their OWN contradicting evidence in a state
        must not stay stuck on the population's preference -- the capped prior
        (GLOBAL_PRIOR_CAP) exists so personal data can outweigh it."""
        random.seed(202)
        bandit = StrategyBandit()
        state = self._state(cognitive_state="processing", p_mastery=0.5, frustration_score=0.1)
        state_hash = encode_state(state)

        for _ in range(300):
            sid = f"{random.randint(10**8, 10**9)}"
            for strategy in STRATEGY_IDS:
                reward = 0.9 if strategy == "WORKED_EXAMPLE" else -0.5
                bandit._update_bandit_params(db, sid, state_hash, strategy, reward)
        db.commit()

        contrarian = f"{random.randint(10**8, 10**9)}"
        for _ in range(80):
            # ANALOGICAL is this student's real best arm, contradicting the population.
            bandit._update_bandit_params(db, contrarian, state_hash, "ANALOGICAL", 0.9)
            bandit._update_bandit_params(db, contrarian, state_hash, "WORKED_EXAMPLE", -0.5)
        db.commit()

        wins = {s: 0 for s in STRATEGY_IDS}
        for _ in range(200):
            choice, _ = bandit._thompson_sample(db, contrarian, state_hash)
            wins[choice] += 1

        assert wins["ANALOGICAL"] / 200 > 0.5, (
            f"expected this student's 80 pulls of real contradicting evidence to "
            f"overcome the capped population prior, got distribution={wins}"
        )

    def test_select_strategy_records_the_rule_baseline_alongside_the_actual_pick(self, db):
        """Every episode should record what the rule fallback would have
        chosen, even when the bandit ends up picking something else -- this is
        what get_strategy_efficacy_report needs to exist at all."""
        bandit = StrategyBandit()
        sid = f"{random.randint(10**6, 10**7)}"
        state = self._state(intent="off_topic")  # rule baseline is deterministic: REANCHOR
        sel = bandit.select_strategy(db, sid, state, interaction_count=0)
        db.commit()

        episode = db.query(models.BanditEpisodeLog).filter_by(id=sel.episode_id).one()
        assert episode.baseline_strategy_id == "REANCHOR"
        assert episode.strategy_selected == "REANCHOR"  # method=rule, so they match

    def test_efficacy_report_splits_matched_vs_diverged_reward(self, db):
        """Runs on a fresh-per-file scratch DB before any other test in this
        module writes a reward-bearing bandit/blend_bandit/explore episode
        (confirmed: the other tests in this class either never call
        measure_pending_rewards, or do so only for method="rule" episodes,
        which this report excludes), so exact counts/averages are safe here."""
        from services.rl_strategy_agent import get_strategy_efficacy_report

        sid = f"{random.randint(10**6, 10**7)}"
        for i in range(25):
            db.add(models.BanditEpisodeLog(
                id=f"matched-{sid}-{i}", student_id=sid, timestamp=datetime.now(timezone.utc),
                state_hash="s1", strategy_selected="WORKED_EXAMPLE",
                baseline_strategy_id="WORKED_EXAMPLE", selection_method="bandit",
                reward_received=0.1,
            ))
        for i in range(25):
            db.add(models.BanditEpisodeLog(
                id=f"diverged-{sid}-{i}", student_id=sid, timestamp=datetime.now(timezone.utc),
                state_hash="s1", strategy_selected="ANALOGICAL",
                baseline_strategy_id="WORKED_EXAMPLE", selection_method="bandit",
                reward_received=0.7,
            ))
        db.commit()

        report = get_strategy_efficacy_report(db, min_episodes_for_signal=10)
        assert report["matched_baseline"]["n"] == 25
        assert report["diverged_from_baseline"]["n"] == 25
        assert report["matched_baseline"]["avg_reward"] == pytest.approx(0.1)
        assert report["diverged_from_baseline"]["avg_reward"] == pytest.approx(0.7)
        assert report["diverged_minus_matched_avg_reward"] == pytest.approx(0.6)
        assert report["sufficient_data"] is True
        assert "HIGHER" in report["interpretation"]

    def test_efficacy_report_ignores_rule_only_episodes(self, db):
        """'rule'/'blend_rule' episodes trivially match their own baseline by
        construction and would dilute the comparison, so they must be excluded.
        The report is platform-wide (not scoped to one student), and other
        tests in this module commit their own bandit/blend_bandit episodes, so
        this asserts the rule-only rows added no NEW episodes to the total
        rather than asserting an absolute total of 0."""
        from services.rl_strategy_agent import get_strategy_efficacy_report

        before_total = get_strategy_efficacy_report(db, min_episodes_for_signal=0)["total_episodes"]

        sid = f"{random.randint(10**6, 10**7)}"
        for i in range(30):
            db.add(models.BanditEpisodeLog(
                id=f"rule-only-{sid}-{i}", student_id=sid, timestamp=datetime.now(timezone.utc),
                state_hash="s2", strategy_selected="SCAFFOLDED",
                baseline_strategy_id="SCAFFOLDED", selection_method="rule",
                reward_received=0.9,
            ))
        db.commit()

        after_total = get_strategy_efficacy_report(db, min_episodes_for_signal=0)["total_episodes"]
        assert after_total == before_total

    def test_pooling_writes_a_shared_global_row_without_inflating_student_pulls(self, db):
        """_update_bandit_params must write both the per-student row and the
        GLOBAL_STUDENT_ID row on every reward, and the two must stay independent
        counters (a student's own `pulls` should not double-count the global write)."""
        from services.rl_strategy_agent import GLOBAL_STUDENT_ID

        bandit = StrategyBandit()
        sid = f"{random.randint(10**8, 10**9)}"
        state_hash = "deadbeef" * 4

        bandit._update_bandit_params(db, sid, state_hash, "SCAFFOLDED", 0.5)
        bandit._update_bandit_params(db, sid, state_hash, "SCAFFOLDED", 0.5)
        db.commit()

        student_row = db.query(models.BanditState).filter_by(
            student_id=sid, state_hash=state_hash, strategy_id="SCAFFOLDED",
        ).one()
        global_row = db.query(models.BanditState).filter_by(
            student_id=GLOBAL_STUDENT_ID, state_hash=state_hash, strategy_id="SCAFFOLDED",
        ).one()
        assert student_row.pulls == 2
        assert global_row.pulls == 2

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

        arm = "Cadence"
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

    def test_uncertainty_is_active_at_cold_start_and_after_updates(self):
        """MC-dropout must contribute a real exploration signal from turn one."""
        import torch
        random.seed(5)
        torch.manual_seed(5)
        bandit = StyleBandit()
        ctx = build_context("medium", [0.3, 0.4, 0.5], session_gap_days=1, n_interactions=10)
        arm = "Axiom"

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

        assert std_before > 1e-3, (
            f"expected non-trivial cold-start uncertainty, got {std_before:.4f}"
        )
        assert std_after > 1e-3, (
            f"expected uncertainty to remain measurable after training, got {std_after:.4f}"
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
            bandit.update("Bridge", ctx, reward=0.9)

        before_state = {k: v.clone() for k, v in bandit.arms["Bridge"].state_dict().items()}
        payload = bandit.to_json()

        restored = StyleBandit.from_json(payload)
        after_state = restored.arms["Bridge"].state_dict()

        assert before_state.keys() == after_state.keys()
        for k in before_state:
            assert torch.equal(before_state[k], after_state[k]), (
                f"weight tensor {k!r} changed across to_json/from_json roundtrip -- "
                f"every server restart would silently reset this student's learned "
                f"style preference back to a fresh prior"
            )
        assert restored.arms["Bridge"].n_updates == bandit.arms["Bridge"].n_updates == 20

    def test_forced_style_bypasses_scoring(self):
        bandit = StyleBandit()
        ctx = build_context("medium", [], session_gap_days=0, n_interactions=0)
        chosen, _ = bandit.select(ctx, forced="Catalyst")
        assert chosen == "Catalyst"

    def test_legacy_style_names_translated_on_load(self):
        """Styles were renamed from generic names (example_first, step_by_step,
        analogy, conceptual, socratic, problem_solving) to unique names
        (Exemplar, Cadence, Bridge, Axiom, Catalyst, Forge). Any
        StudentStyleModel.bandit_state JSON persisted before the rename must
        still load onto the correct (renamed) arm instead of being silently
        dropped for an unrecognized key."""
        import json as _json
        import torch
        bandit = StyleBandit()
        ctx = build_context("hard", [0.5], session_gap_days=0, n_interactions=10)
        for _ in range(15):
            bandit.update("Cadence", ctx, reward=0.9)
        legacy_payload = _json.dumps({
            "step_by_step": bandit.arms["Cadence"].to_dict(),
        })

        restored = StyleBandit.from_json(legacy_payload)
        assert restored.arms["Cadence"].n_updates == 15
        for k in bandit.arms["Cadence"].state_dict():
            assert torch.equal(
                bandit.arms["Cadence"].state_dict()[k],
                restored.arms["Cadence"].state_dict()[k],
            )
