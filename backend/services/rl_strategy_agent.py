from __future__ import annotations

import hashlib
import logging
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

try:
    import numpy as np
    _np_available = True
except ImportError:
    _np_available = False
    np = None

logger = logging.getLogger(__name__)

def _clip(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))

STRATEGY_IDS: List[str] = [
    "GUIDED_DISCOVERY",
    "DIRECT_EXPLANATION",
    "WORKED_EXAMPLE",
    "ANALOGICAL",
    "SCAFFOLDED",
    "REASSURANCE_FIRST",
    "CHALLENGE_PUSH",
    "REANCHOR",
    "METACOGNITIVE",
]

@dataclass
class StateFeatures:
    archetype: str = "default"
    cognitive_state: str = "processing"
    intent: str = "question"
    p_mastery: float = 0.1
    frustration_score: float = 0.0
    session_depth: str = "early"

    @property
    def p_mastery_bucket(self) -> str:
        p = self.p_mastery
        if p < 0.30:  return "novice"
        if p < 0.55:  return "learning"
        if p < 0.75:  return "familiar"
        if p < 0.88:  return "proficient"
        return "mastered"

    @property
    def frustration_bucket(self) -> str:
        f = self.frustration_score
        if f < 0.25:  return "calm"
        if f < 0.50:  return "mild"
        if f < 0.75:  return "stressed"
        return "crisis"

    def as_dict(self) -> dict:
        return {
            "archetype": self.archetype,
            "cognitive_state": self.cognitive_state,
            "intent": self.intent,
            "p_mastery_bucket": self.p_mastery_bucket,
            "frustration_bucket": self.frustration_bucket,
            "session_depth": self.session_depth,
        }

@dataclass
class StrategySelection:
    strategy_id: str
    state_hash: str
    selection_method: str
    exploration_flag: bool = False
    thompson_samples: Dict[str, float] = field(default_factory=dict)
    episode_id: Optional[str] = None

def encode_state(state: StateFeatures) -> str:
    state_str = (
        f"{state.archetype}|{state.cognitive_state}|{state.intent}|"
        f"{state.p_mastery_bucket}|{state.frustration_bucket}|{state.session_depth}"
    )
    return hashlib.sha256(state_str.encode()).hexdigest()[:32]

def session_depth_from_count(message_count: int) -> str:
    if message_count <= 5:   return "early"
    if message_count <= 15:  return "mid"
    return "deep"

class StrategyBandit:

    def select_strategy(
        self,
        db,
        student_id: str,
        state: StateFeatures,
        interaction_count: int,
        session_id: Optional[int] = None,
        p_mastery_before: float = 0.1,
        frustration_before: float = 0.0,
        engagement_before: float = 0.5,
    ) -> StrategySelection:

        state_hash = encode_state(state)
        exploration_flag = False
        thompson_samples: Dict[str, float] = {}

        if interaction_count < 20:
            strategy = self._rule_based_fallback(state)
            method = "rule"

        elif interaction_count < 100:
            blend_weight = (interaction_count - 20) / 80.0
            bandit_strategy, thompson_samples = self._thompson_sample(db, student_id, state_hash)
            rule_strategy = self._rule_based_fallback(state)
            if random.random() < blend_weight:
                strategy = bandit_strategy
                method = "blend_bandit"
            else:
                strategy = rule_strategy
                method = "blend_rule"

        else:
            if random.random() < 0.10:
                strategy = random.choice(STRATEGY_IDS)
                method = "explore"
                exploration_flag = True
            else:
                strategy, thompson_samples = self._thompson_sample(db, student_id, state_hash)
                method = "bandit"

        episode_id = self._log_episode(
            db, student_id, session_id, state_hash, state,
            strategy, method, exploration_flag, thompson_samples, p_mastery_before,
        )

        logger.info(
            "[RL] user=%-8s method=%-14s strategy=%-22s state=%s|%s|%s interactions=%d",
            student_id, method, strategy,
            state.cognitive_state, state.p_mastery_bucket, state.frustration_bucket,
            interaction_count,
        )

        return StrategySelection(
            strategy_id=strategy,
            state_hash=state_hash,
            selection_method=method,
            exploration_flag=exploration_flag,
            thompson_samples=thompson_samples,
            episode_id=episode_id,
        )

    def _thompson_sample(
        self, db, student_id: str, state_hash: str
    ) -> Tuple[str, Dict[str, float]]:
        import models

        rows = (
            db.query(models.BanditState)
            .filter_by(student_id=student_id, state_hash=state_hash)
            .all()
        )

        params: Dict[str, Dict[str, float]] = {
            s: {"alpha": 1.0, "beta": 1.0} for s in STRATEGY_IDS
        }
        for row in rows:
            if row.strategy_id in params:
                params[row.strategy_id] = {
                    "alpha": max(row.alpha, 0.01),
                    "beta": max(row.beta_param, 0.01),
                }

        samples: Dict[str, float] = {}
        for sid, p in params.items():
            if _np_available:
                samples[sid] = float(np.random.beta(p["alpha"], p["beta"]))
            else:
                import random as _rnd
                samples[sid] = _rnd.betavariate(p["alpha"], p["beta"])

        best = max(samples, key=lambda k: samples[k])
        return best, samples

    def _rule_based_fallback(self, state: StateFeatures) -> str:
        if state.intent == "off_topic":
            return "REANCHOR"
        if state.cognitive_state == "stuck" and state.frustration_bucket in ("stressed", "crisis"):
            return "REASSURANCE_FIRST"
        if state.intent == "emotional" and state.frustration_bucket in ("stressed", "crisis"):
            return "REASSURANCE_FIRST"
        if state.cognitive_state == "confused":
            mapping = {
                "Kinetiq": "ANALOGICAL",
                "Logicor": "DIRECT_EXPLANATION",
                "Flowist": "WORKED_EXAMPLE",
            }
            return mapping.get(state.archetype, "SCAFFOLDED")
        if state.intent == "exploration" and state.p_mastery_bucket in ("novice", "learning"):
            return "GUIDED_DISCOVERY"
        if state.p_mastery_bucket in ("proficient", "mastered"):
            return "CHALLENGE_PUSH"
        if state.p_mastery_bucket == "novice":
            return "WORKED_EXAMPLE"
        return "GUIDED_DISCOVERY"

    def _log_episode(
        self,
        db,
        student_id: str,
        session_id: Optional[int],
        state_hash: str,
        state: StateFeatures,
        strategy: str,
        method: str,
        exploration_flag: bool,
        thompson_samples: Dict[str, float],
        p_mastery_before: float,
    ) -> str:
        import models

        episode_id = str(uuid4())
        try:
            episode = models.BanditEpisodeLog(
                id=episode_id,
                student_id=student_id,
                session_id=session_id,
                timestamp=datetime.now(timezone.utc),
                state_hash=state_hash,
                state_features=state.as_dict(),
                strategy_selected=strategy,
                selection_method=method,
                thompson_samples={k: round(v, 4) for k, v in thompson_samples.items()},
                exploration_flag=exploration_flag,
                p_mastery_before=p_mastery_before,
            )
            db.add(episode)
            db.flush()
        except Exception as e:
            logger.warning(f"[RL] Episode log failed: {e}")
            try:
                db.rollback()
            except Exception:
                pass
        return episode_id

    def queue_reward_measurement(
        self,
        db,
        student_id: str,
        session_id: Optional[int],
        message_id: Optional[int],
        state_hash: str,
        strategy_id: str,
        p_mastery_before: float,
        frustration_before: float,
        engagement_before: float,
    ) -> None:
        import models

        try:
            now = datetime.now(timezone.utc)
            entry = models.BanditRewardQueue(
                id=str(uuid4()),
                student_id=student_id,
                session_id=session_id,
                message_id=message_id,
                state_hash=state_hash,
                strategy_id=strategy_id,
                response_sent_at=now,
                measure_after=now + timedelta(minutes=2),
                p_mastery_before=p_mastery_before,
                frustration_before=frustration_before,
                engagement_before=engagement_before,
            )
            db.add(entry)
            db.flush()
        except Exception as e:
            logger.warning(f"[RL] Queue insertion failed: {e}")
            try:
                db.rollback()
            except Exception:
                pass

    def measure_pending_rewards(self, db_factory) -> None:
        import models

        db = db_factory()
        try:
            now = datetime.now(timezone.utc)
            pending = (
                db.query(models.BanditRewardQueue)
                .filter(
                    models.BanditRewardQueue.reward_measured == False,
                    models.BanditRewardQueue.measure_after <= now,
                )
                .limit(100)
                .all()
            )

            processed = 0
            for item in pending:
                try:
                    reward_data = self._compute_reward(db, item)
                    if reward_data is not None:
                        self._update_bandit_params(
                            db,
                            item.student_id,
                            item.state_hash,
                            item.strategy_id,
                            reward_data["total_reward"],
                        )
                        item.reward_measured = True
                        item.reward_value = reward_data["total_reward"]
                        item.reward_components = reward_data["components"]

                        episode = (
                            db.query(models.BanditEpisodeLog)
                            .filter(
                                models.BanditEpisodeLog.student_id == item.student_id,
                                models.BanditEpisodeLog.state_hash == item.state_hash,
                                models.BanditEpisodeLog.strategy_selected == item.strategy_id,
                                models.BanditEpisodeLog.timestamp >= item.response_sent_at - timedelta(seconds=30),
                                models.BanditEpisodeLog.reward_received.is_(None),
                            )
                            .order_by(models.BanditEpisodeLog.timestamp.desc())
                            .first()
                        )
                        if episode:
                            episode.reward_received = reward_data["total_reward"]
                        processed += 1
                except Exception as e:
                    logger.warning(f"[RL] Reward measurement failed for {item.id}: {e}")
                    continue

            if processed:
                db.commit()
                logger.info(f"[RL] Measured rewards for {processed}/{len(pending)} queue entries")

        except Exception as e:
            logger.warning(f"[RL] measure_pending_rewards error: {e}")
            try:
                db.rollback()
            except Exception:
                pass
        finally:
            db.close()

    def _compute_reward(self, db, item) -> Optional[dict]:
        import models

        student_id_int = int(item.student_id)
        components: Dict[str, float] = {}

        next_msg = (
            db.query(models.MessageMLLog)
            .filter(
                models.MessageMLLog.user_id == student_id_int,
                models.MessageMLLog.timestamp > item.response_sent_at,
            )
            .order_by(models.MessageMLLog.timestamp.asc())
            .first()
        )

        continuation_window = item.response_sent_at + timedelta(minutes=2)
        continued = next_msg is not None and next_msg.timestamp <= continuation_window
        cont_component = 1.0 if continued else -0.5
        components["session_continuation"] = cont_component

        if next_msg is None:
            total = 0.20 * cont_component
            return {
                "total_reward": _clip(total, -1.0, 1.0),
                "components": components,
            }

        p_mastery_after = 0.0
        if next_msg.kt_delta and isinstance(next_msg.kt_delta, dict):
            vals = [v for v in next_msg.kt_delta.values() if isinstance(v, (int, float))]
            p_mastery_after = sum(vals) / len(vals) if vals else 0.0
        p_before = item.p_mastery_before or 0.1
        mastery_delta = p_mastery_after - p_before
        mastery_component = _clip(mastery_delta * 5, -1.0, 1.0)
        components["p_mastery_delta"] = mastery_component

        eng_before = item.engagement_before or 0.5
        eng_after = next_msg.engagement_score or 0.5
        eng_component = _clip((eng_after - eng_before) * 2, -1.0, 1.0)
        components["engagement_delta"] = eng_component

        frust_before = item.frustration_before or 0.0
        frust_after = next_msg.frustration_score or 0.0
        frust_component = _clip(-(frust_after - frust_before) * 2, -1.0, 1.0)
        components["frustration_delta"] = frust_component

        # Reweighted 2026-07-23 (see backend/tests/simulate_week.py + the ML/bandit audit).
        # mastery_delta was previously the largest term (0.40) despite the BKT update it comes
        # from depending only on message intent + fixed per-concept p_learn/p_slip/p_guess --
        # it never reads which response_strategy was selected, so it's the weakest-attributed
        # signal here w.r.t. "was THIS strategy good," and its noise was swamping the terms that
        # actually reflect the student's reaction to the response just sent. A week-long
        # simulation with a synthetic per-student "true best strategy" showed match-rate
        # DECLINING (21% -> 3%, below the ~11% random floor for 9 arms) under the old weights.
        # session_continuation and frustration/engagement deltas are measured on the very next
        # message following this response, so they're the most directly attributable signals to
        # "did the student react well to this reply" -- they now carry the majority of the
        # weight. mastery_delta keeps a small non-zero weight rather than being zeroed out: over
        # many turns a genuinely effective strategy should still show up there too, just more
        # slowly and noisily than the behavioral signals.
        total = (
            0.15 * mastery_component
            + 0.30 * eng_component
            + 0.35 * cont_component
            + 0.20 * frust_component
        )
        return {
            "total_reward": _clip(total, -1.0, 1.0),
            "components": components,
        }

    def _update_bandit_params(
        self,
        db,
        student_id: str,
        state_hash: str,
        strategy_id: str,
        reward: float,
    ) -> None:
        import models

        normalized = (reward + 1.0) / 2.0
        alpha_inc = normalized
        beta_inc = 1.0 - normalized
        now = datetime.now(timezone.utc)

        bind = db.get_bind()
        if bind is not None and bind.dialect.name == "sqlite":
            from sqlalchemy.dialects.sqlite import insert as sqlite_insert

            table = models.BanditState.__table__
            stmt = sqlite_insert(table).values(
                student_id=student_id,
                state_hash=state_hash,
                strategy_id=strategy_id,
                pulls=1,
                total_reward=reward,
                avg_reward=reward,
                alpha=1.0 + alpha_inc,
                beta_param=1.0 + beta_inc,
                last_updated=now,
            )
            updated_pulls = table.c.pulls + 1
            updated_total_reward = table.c.total_reward + reward
            stmt = stmt.on_conflict_do_update(
                index_elements=["student_id", "state_hash", "strategy_id"],
                set_={
                    "pulls": updated_pulls,
                    "total_reward": updated_total_reward,
                    "avg_reward": updated_total_reward / updated_pulls,
                    "alpha": table.c.alpha + alpha_inc,
                    "beta_param": table.c.beta_param + beta_inc,
                    "last_updated": now,
                },
            )
            db.execute(stmt)
            return

        existing = (
            db.query(models.BanditState)
            .filter_by(
                student_id=student_id,
                state_hash=state_hash,
                strategy_id=strategy_id,
            )
            .first()
        )
        if existing:
            existing.pulls += 1
            existing.total_reward += reward
            existing.avg_reward = existing.total_reward / existing.pulls
            existing.alpha += alpha_inc
            existing.beta_param += beta_inc
            existing.last_updated = now
        else:
            new_row = models.BanditState(
                student_id=student_id,
                state_hash=state_hash,
                strategy_id=strategy_id,
                pulls=1,
                total_reward=reward,
                avg_reward=reward,
                alpha=1.0 + alpha_inc,
                beta_param=1.0 + beta_inc,
                last_updated=now,
            )
            db.add(new_row)

_bandit: Optional[StrategyBandit] = None

def get_bandit() -> StrategyBandit:
    global _bandit
    if _bandit is None:
        _bandit = StrategyBandit()
    return _bandit
