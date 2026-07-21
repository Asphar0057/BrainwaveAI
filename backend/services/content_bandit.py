"""Thompson-sampling difficulty bandit for flashcard/quiz generation.

Mirrors services.rl_strategy_agent.StrategyBandit (same Beta-Bernoulli Thompson
sampling, same BanditState/BanditEpisodeLog tables) but chooses a CONTENT
difficulty (easy/medium/hard) per (student, domain, topic) instead of a chat
response strategy. Reuses the bandit_state table directly -- state_hash here is
built from a distinct input string (see encode_content_state), so it can never
collide with a chat state_hash even though both live in the same table.

Unlike chat (which has no explicit "did that help" signal and must wait ~2min
to infer one from the next message), flashcard/quiz completion IS an explicit
event with a real accuracy number attached. So instead of the queue-and-poll
pattern chat uses, this resolves reward synchronously at that completion event
against the most recent unresolved BanditEpisodeLog row for the same state.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

try:
    import numpy as np
    _np_available = True
except ImportError:
    _np_available = False
    np = None

logger = logging.getLogger(__name__)

DIFFICULTY_ARMS = ["easy", "medium", "hard"]
AUTO_SENTINELS = {"auto", "adaptive"}

COLD_START_INTERACTIONS = 5


def _clip(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def is_auto_difficulty(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in AUTO_SENTINELS


def encode_content_state(domain: str, topic: str) -> str:
    """domain = 'flashcard' | 'quiz'. Distinct input string from
    rl_strategy_agent.encode_state, so the resulting hash never collides even
    though both share the bandit_state table."""
    key = f"content::{domain}::{(topic or '').strip().lower()}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


@dataclass
class DifficultySelection:
    difficulty: str
    state_hash: str
    selection_method: str
    thompson_samples: Dict[str, float] = field(default_factory=dict)
    episode_id: Optional[str] = None


class ContentDifficultyBandit:

    def select_difficulty(
        self,
        db,
        student_id: str,
        domain: str,
        topic: str,
        arms: Optional[List[str]] = None,
    ) -> DifficultySelection:
        """`arms` lets each domain use its own vocabulary (flashcards/quiz use
        easy/medium/hard; solo quiz uses beginner/intermediate/advanced) -- the
        bandit itself doesn't care what the labels mean, only that they're the
        same set every time for a given domain so priors line up."""
        arm_ids = arms or DIFFICULTY_ARMS
        default_arm = arm_ids[len(arm_ids) // 2]
        state_hash = encode_content_state(domain, topic)
        interaction_count = self._get_interaction_count(db, student_id, state_hash)

        if interaction_count < COLD_START_INTERACTIONS:
            difficulty, method, samples = default_arm, "rule", {}
        else:
            difficulty, samples = self._thompson_sample(db, student_id, state_hash, arm_ids)
            method = "bandit"

        episode_id = self._log_episode(
            db, student_id, state_hash, domain, topic, difficulty, method, samples,
        )

        logger.info(
            "[ContentBandit] user=%-8s domain=%-9s topic=%-25s method=%-6s difficulty=%s",
            student_id, domain, topic[:25], method, difficulty,
        )

        return DifficultySelection(difficulty, state_hash, method, samples, episode_id)

    def _get_interaction_count(self, db, student_id: str, state_hash: str) -> int:
        try:
            import models
            return (
                db.query(models.BanditEpisodeLog)
                .filter_by(student_id=student_id, state_hash=state_hash)
                .count()
            )
        except Exception:
            return 0

    def _thompson_sample(
        self, db, student_id: str, state_hash: str, arm_ids: List[str],
    ) -> Tuple[str, Dict[str, float]]:
        import models

        rows = (
            db.query(models.BanditState)
            .filter_by(student_id=student_id, state_hash=state_hash)
            .all()
        )

        params: Dict[str, Dict[str, float]] = {
            a: {"alpha": 1.0, "beta": 1.0} for a in arm_ids
        }
        for row in rows:
            if row.strategy_id in params:
                params[row.strategy_id] = {
                    "alpha": max(row.alpha, 0.01),
                    "beta": max(row.beta_param, 0.01),
                }

        samples: Dict[str, float] = {}
        for aid, p in params.items():
            if _np_available:
                samples[aid] = float(np.random.beta(p["alpha"], p["beta"]))
            else:
                import random as _rnd
                samples[aid] = _rnd.betavariate(p["alpha"], p["beta"])

        best = max(samples, key=lambda k: samples[k])
        return best, samples

    def _log_episode(
        self,
        db,
        student_id: str,
        state_hash: str,
        domain: str,
        topic: str,
        difficulty: str,
        method: str,
        samples: Dict[str, float],
    ) -> str:
        import models

        episode_id = str(uuid4())
        try:
            db.add(models.BanditEpisodeLog(
                id=episode_id,
                student_id=student_id,
                session_id=None,
                timestamp=datetime.now(timezone.utc),
                state_hash=state_hash,
                state_features={"domain": domain, "topic": topic},
                strategy_selected=difficulty,
                selection_method=method,
                thompson_samples={k: round(v, 4) for k, v in samples.items()},
                exploration_flag=False,
            ))
            db.flush()
        except Exception as e:
            logger.warning(f"[ContentBandit] episode log failed: {e}")
            try:
                db.rollback()
            except Exception:
                pass
        return episode_id

    def resolve_reward(
        self,
        db,
        student_id: str,
        domain: str,
        topic: str,
        accuracy: float,
    ) -> None:
        """Call at quiz-completion / flashcard-review time with a real 0..1
        accuracy figure for this (student, domain, topic). Attaches the reward
        to the most recent unresolved selection for that state (if the bandit
        made the choice) and always updates BanditState so future auto-picks
        for this topic have real priors, even if the user explicitly picked
        the difficulty this round."""
        import models

        state_hash = encode_content_state(domain, topic)
        reward = _clip((accuracy - 0.5) * 2, -1.0, 1.0)

        try:
            episode = (
                db.query(models.BanditEpisodeLog)
                .filter_by(student_id=student_id, state_hash=state_hash)
                .filter(models.BanditEpisodeLog.reward_received.is_(None))
                .order_by(models.BanditEpisodeLog.timestamp.desc())
                .first()
            )
            if not episode:
                # No prior selection to attribute this outcome to (e.g. the bandit
                # never got a chance to choose for this exact topic key) -- nothing
                # sane to credit/blame, so skip rather than guess an arm label that
                # may not even exist in this domain's vocabulary.
                logger.debug(
                    f"[ContentBandit] no pending episode for {domain}/{topic!r}, skipping reward"
                )
                return

            difficulty = episode.strategy_selected
            episode.reward_received = reward

            self._update_bandit_params(db, student_id, state_hash, difficulty, reward)
            db.commit()

            logger.info(
                "[ContentBandit] resolved user=%-8s domain=%-9s topic=%-25s "
                "accuracy=%.2f reward=%.2f difficulty=%s",
                student_id, domain, topic[:25], accuracy, reward, difficulty,
            )
        except Exception as e:
            logger.warning(f"[ContentBandit] resolve_reward failed: {e}")
            try:
                db.rollback()
            except Exception:
                pass

    def _update_bandit_params(
        self, db, student_id: str, state_hash: str, strategy_id: str, reward: float,
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
            .filter_by(student_id=student_id, state_hash=state_hash, strategy_id=strategy_id)
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
            db.add(models.BanditState(
                student_id=student_id,
                state_hash=state_hash,
                strategy_id=strategy_id,
                pulls=1,
                total_reward=reward,
                avg_reward=reward,
                alpha=1.0 + alpha_inc,
                beta_param=1.0 + beta_inc,
                last_updated=now,
            ))


_content_bandit: Optional[ContentDifficultyBandit] = None


def get_content_bandit() -> ContentDifficultyBandit:
    global _content_bandit
    if _content_bandit is None:
        _content_bandit = ContentDifficultyBandit()
    return _content_bandit
