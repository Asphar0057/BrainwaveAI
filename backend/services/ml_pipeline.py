from __future__ import annotations

import asyncio
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

FRUSTRATION_KEYWORDS = [
    "don't get", "confused", "lost", "ugh", "doesn't make sense",
    "still don't", "what even", "impossible", "give up", "hate this",
    "so hard", "not getting it", "makes no sense", "keep failing",
    "never understand", "too hard", "stuck", "help", "can't understand",
    "don't understand", "totally lost",
]

INTENT_KEYWORDS = {
    "confusion": [
        "what is", "what are", "why", "don't get", "confused", "lost",
        "doesn't make sense", "not sure", "unclear", "explain",
    ],
    "stuck": [
        "still", "again", "keep", "still don't", "keep failing", "same",
    ],
    "emotional": [
        "ugh", "hate", "impossible", "give up", "frustrated", "anxious",
        "stressed", "scared", "worried", "hopeless",
    ],
    "off_topic": [
        "weather", "sports", "movies", "jokes", "hi", "hello", "hey",
    ],
    "exploration": [
        "what should", "recommend", "suggest", "what to", "where to start",
        "overview", "summary",
    ],
}

STRATEGY_MAP = [
    ("off_topic", None, None, None, "REANCHOR"),
    ("stuck", None, 0.6, None, "REASSURANCE_FIRST"),
    ("emotional", None, 0.4, None, "REASSURANCE_FIRST"),
    ("confused", None, None, "Kinetiq", "ANALOGICAL"),
    ("confused", None, None, "Logicor", "DIRECT_EXPLANATION"),
    ("confused", None, None, "Flowist", "WORKED_EXAMPLE"),
    ("confused", None, None, None, "SCAFFOLDED"),
    ("exploration", None, None, None, "GUIDED_DISCOVERY"),
    ("question", 0.7, None, None, "CHALLENGE_PUSH"),
    ("question", None, None, None, "WORKED_EXAMPLE"),
]

STRATEGY_INSTRUCTIONS = {
    "GUIDED_DISCOVERY":   "Surface weak areas using Socratic questions. Ask what they already know.",
    "DIRECT_EXPLANATION": "Give a clear, structured explanation of the concept. Use precise language.",
    "WORKED_EXAMPLE":     "Walk through a step-by-step solved example. Show every step.",
    "ANALOGICAL":         "Use a real-world analogy to explain the concept. Make it concrete and relatable.",
    "SCAFFOLDED":         "Break the concept into smaller sub-problems. Address each part in sequence.",
    "REASSURANCE_FIRST":  "Acknowledge the student's frustration with empathy first. Then address the concept gently.",
    "CHALLENGE_PUSH":     "The student is ready for harder content. Push them with a challenging follow-up.",
    "REANCHOR":           "Kindly redirect the conversation back to their learning goals.",
    "METACOGNITIVE":      "Invite the student to reflect on their learning process. Ask what helped or confused them and how they might approach it differently next time.",
}

class ModelRegistry:

    _instance: Optional["ModelRegistry"] = None

    def __init__(self):
        self._embed_model = None
        self._cross_encoder = None
        self._ready = False

    @classmethod
    def get(cls) -> "ModelRegistry":
        if cls._instance is None:
            cls._instance = ModelRegistry()
        return cls._instance

    def load(self):
        if self._ready:
            return
        try:
            from sentence_transformers import SentenceTransformer
            self._embed_model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("[ML] all-MiniLM-L6-v2 loaded")
        except Exception as e:
            logger.warning(f"[ML] Embedding model unavailable: {e}")

        try:
            from sentence_transformers import CrossEncoder
            self._cross_encoder = CrossEncoder("cross-encoder/nli-deberta-v3-small")
            logger.info("[ML] cross-encoder/nli-deberta-v3-small loaded")
        except Exception as e:
            logger.warning(f"[ML] Cross-encoder unavailable: {e}")

        self._ready = True

    def embed(self, text: str) -> Optional[List[float]]:
        if not self._embed_model:
            return None
        try:
            vec = self._embed_model.encode(text, normalize_embeddings=True)
            return vec.tolist()
        except Exception as e:
            logger.warning(f"[ML] embed failed: {e}")
            return None

    def embed_fn(self):
        def _fn(text: str):
            if not self._embed_model:
                return [0.0] * 384
            try:
                return self._embed_model.encode(text, normalize_embeddings=True)
            except Exception:
                return [0.0] * 384
        return _fn

@dataclass
class SessionContext:
    session_id: Optional[int] = None
    message_count: int = 0
    current_concept_id: Optional[str] = None
    messages_on_concept: int = 0
    frustration_trend: List[float] = field(default_factory=list)
    engagement_trend: List[float] = field(default_factory=list)
    last_message_at: Optional[datetime] = None
    response_latency_s: float = 0.0

@dataclass
class MLOutput:
    intent: str = "question"
    detected_concepts: List[str] = field(default_factory=list)
    p_mastery: float = 0.1
    p_mastery_delta: float = 0.0
    frustration_score: float = 0.0
    engagement_score: float = 0.5
    cognitive_state: str = "processing"
    response_strategy: str = "DIRECT_EXPLANATION"
    archetype: str = "default"
    memory_context: str = ""
    memories_used: List[str] = field(default_factory=list)
    kt_before: Dict[str, float] = field(default_factory=dict)
    kt_after: Dict[str, float] = field(default_factory=dict)
    rl_state_hash: str = ""
    rl_selection_method: str = "rule"
    rl_episode_id: str = ""
    rl_exploration_flag: bool = False

class MessageMLPipeline:

    def __init__(self, db_factory, memory_svc=None):
        self._db_factory = db_factory
        self._memory_svc = memory_svc
        self._registry = ModelRegistry.get()
        self._concept_cache: Dict[str, List[float]] = {}

    def _load_concept_cache(self, db) -> None:
        if self._concept_cache:
            return
        try:
            import models
            rows = db.query(models.StudentKnowledgeState.concept_id,
                            models.StudentKnowledgeState.concept_name).distinct().limit(500).all()
            for cid, cname in rows:
                if cname and cid not in self._concept_cache:
                    vec = self._registry.embed(cname)
                    if vec:
                        self._concept_cache[cid] = vec
        except Exception as e:
            logger.debug(f"[ML] concept cache load partial: {e}")

        # Bootstrap seed: StudentKnowledgeState rows only ever get created once
        # this cache already has entries (layer1 needs a hit to set current_concept_id,
        # which is what layer2 needs to create the first row) -- a circular dependency
        # that can never resolve on its own. Break it by also seeding from topics that
        # already exist independently via quiz activity (TopicMastery / UserWeakArea),
        # so layer1 has something real to match against from message 1.
        try:
            import models
            topic_names = set(
                t for (t,) in db.query(models.TopicMastery.topic_name).distinct().limit(300).all() if t
            )
            topic_names |= set(
                t for (t,) in db.query(models.UserWeakArea.topic).distinct().limit(300).all() if t
            )
            for topic in topic_names:
                cid = topic.strip().lower().replace(" ", "_")
                if cid and cid not in self._concept_cache:
                    vec = self._registry.embed(topic)
                    if vec:
                        self._concept_cache[cid] = vec
        except Exception as e:
            logger.debug(f"[ML] concept cache topic-seed partial: {e}")

    def _get_archetype(self, db, user_id: int) -> str:
        try:
            import models
            profile = db.query(models.ComprehensiveUserProfile).filter_by(
                user_id=user_id
            ).first()
            if profile and profile.primary_archetype:
                return profile.primary_archetype
        except Exception:
            pass
        return "default"

    async def _layer1_intent_concept(
        self, message: str, db, user_id: int, session: SessionContext
    ) -> Tuple[str, List[str]]:
        msg_lower = message.lower()

        intent = "question"
        if session.messages_on_concept >= 3:
            intent = "stuck"

        for kw in INTENT_KEYWORDS.get("emotional", []):
            if kw in msg_lower:
                intent = "emotional"
                break

        if intent not in ("stuck", "emotional"):
            for intent_name, keywords in INTENT_KEYWORDS.items():
                for kw in keywords:
                    if kw in msg_lower:
                        intent = intent_name
                        break
                if intent != "question":
                    break

        concepts: List[str] = []
        msg_vec = self._registry.embed(message)
        if msg_vec and self._concept_cache:
            import numpy as np
            scored: List[Tuple[float, str]] = []
            for cid, cvec in list(self._concept_cache.items())[:200]:
                sim = float(np.dot(msg_vec, cvec))
                if sim >= 0.45:
                    scored.append((sim, cid))
            scored.sort(reverse=True)
            concepts = [cid for _, cid in scored[:3]]

        if not concepts and session.current_concept_id:
            concepts = [session.current_concept_id]

        logger.info(
            "[ML L1] intent=%-12s  concepts=%s  embed_model=%s",
            intent,
            concepts or ["(none)"],
            "ready" if self._registry._embed_model else "missing",
        )
        return intent, concepts

    async def _layer2_bkt_update(
        self, db, user_id: int, concept_ids: List[str], intent: str
    ) -> Tuple[float, float, Dict, Dict]:
        import models

        CONFIDENCE = {
            "exploration": 0.5,
            "question": 0.4,
            "confusion": 0.1,
            "confused": 0.1,
            "stuck": 0.05,
            "emotional": 0.1,
            "off_topic": 0.5,
        }
        obs = CONFIDENCE.get(intent, 0.4)

        archetype_p_learn = {"Logicor": 0.12, "Kinetiq": 0.08, "Flowist": 0.10}

        kt_before: Dict[str, float] = {}
        kt_after: Dict[str, float] = {}
        p_mastery_avg = 0.1

        if not concept_ids:
            return p_mastery_avg, 0.0, kt_before, kt_after

        try:
            archetype = self._get_archetype(db, user_id)
            p_learn_default = archetype_p_learn.get(archetype, 0.09)

            masteries: List[float] = []
            for cid in concept_ids[:2]:
                state = db.query(models.StudentKnowledgeState).filter_by(
                    user_id=user_id, concept_id=cid
                ).first()
                if not state:
                    state = models.StudentKnowledgeState(
                        user_id=user_id,
                        concept_id=cid,
                        concept_name=cid,
                        p_mastery=0.1,
                        p_learn=p_learn_default,
                        p_slip=0.1,
                        p_guess=0.2,
                    )
                    db.add(state)
                    db.flush()

                pl = state.p_learn
                ps = state.p_slip
                pg = state.p_guess
                p = state.p_mastery

                kt_before[cid] = p

                if obs > 0.5:
                    p_update = (p * (1 - ps)) / (p * (1 - ps) + (1 - p) * pg)
                else:
                    p_update = (p * ps) / (p * ps + (1 - p) * (1 - pg))
                p_next = p_update + (1 - p_update) * pl

                state.p_mastery = min(max(p_next, 0.01), 0.99)
                state.interaction_count += 1
                state.last_updated = datetime.now(timezone.utc)

                history = state.mastery_history or []
                history.append(round(p_next, 3))
                if len(history) > 30:
                    history = history[-30:]
                state.mastery_history = history

                kt_after[cid] = state.p_mastery
                masteries.append(state.p_mastery)
                logger.info(
                    "[ML L2] BKT  concept=%-30s  before=%.3f → after=%.3f  obs=%.2f",
                    cid[:30], kt_before[cid], state.p_mastery, obs,
                )

            db.commit()
            p_mastery_avg = sum(masteries) / len(masteries) if masteries else 0.1
            p_mastery_delta = p_mastery_avg - (sum(kt_before.values()) / len(kt_before) if kt_before else 0.1)
        except Exception as e:
            logger.warning(f"[ML] BKT update failed: {e}")
            db.rollback()

        return p_mastery_avg, 0.0, kt_before, kt_after

    async def _layer3_affect(
        self, message: str, session: SessionContext
    ) -> Tuple[float, float, str]:
        msg_lower = message.lower()

        lexical = sum(1 for kw in FRUSTRATION_KEYWORDS if kw in msg_lower)
        lexical_score = min(lexical / 3.0, 1.0)

        behavioral = 0.0
        if session.messages_on_concept > 3:
            behavioral += 0.4
        if session.response_latency_s > 60:
            behavioral += 0.2
        elif session.response_latency_s < 3 and session.response_latency_s > 0:
            behavioral += 0.15
        if session.message_count > 20:
            behavioral += 0.1
        behavioral = min(behavioral, 1.0)

        trend = session.frustration_trend[-5:] if session.frustration_trend else []
        trajectory = (sum(trend) / len(trend)) if trend else 0.0
        if len(trend) >= 2 and trend[-1] > trend[0]:
            trajectory *= 1.2

        frustration = min(0.4 * lexical_score + 0.35 * behavioral + 0.25 * trajectory, 1.0)

        engagement = 0.5
        if session.message_count in range(2, 6):
            engagement += 0.15
        if 5 <= session.response_latency_s <= 30:
            engagement += 0.15
        if session.message_count > 20:
            engagement -= 0.2
        if session.response_latency_s > 120:
            engagement -= 0.2
        engagement = min(max(engagement, 0.0), 1.0)

        if frustration > 0.6 and session.messages_on_concept >= 3:
            cognitive_state = "stuck"
        elif frustration > 0.4:
            cognitive_state = "confused"
        elif engagement > 0.7:
            cognitive_state = "confident"
        else:
            cognitive_state = "processing"

        logger.info(
            "[ML L3] affect  frustration=%.2f (lex=%.2f beh=%.2f traj=%.2f)  "
            "engagement=%.2f  state=%s",
            frustration, lexical_score, behavioral, trajectory,
            engagement, cognitive_state,
        )
        return frustration, engagement, cognitive_state

    def _select_strategy(
        self,
        intent: str,
        frustration: float,
        p_mastery: float,
        archetype: str,
        engagement: float,
    ) -> str:
        for rule_intent, rule_mastery, rule_frustration, rule_archetype, strategy in STRATEGY_MAP:
            if intent != rule_intent:
                continue
            if rule_frustration is not None and frustration <= rule_frustration:
                continue
            if rule_mastery is not None and p_mastery <= rule_mastery:
                continue
            if rule_archetype is not None and archetype != rule_archetype:
                continue
            return strategy
        return "DIRECT_EXPLANATION"

    def _get_interaction_count(self, db, user_id: int) -> int:
        try:
            import models
            return db.query(models.MessageMLLog).filter_by(user_id=user_id).count()
        except Exception:
            return 0

    async def process(
        self,
        message: str,
        student_id: str,
        session: SessionContext,
        db,
    ) -> MLOutput:
        out = MLOutput()
        user_id = int(student_id)

        try:
            self._load_concept_cache(db)
            archetype = self._get_archetype(db, user_id)
            out.archetype = archetype

            # Layer1 must run before layer2: layer2's concept update needs the
            # concept(s) layer1 just detected in THIS message, not the previous
            # turn's stale session.current_concept_id (they used to run
            # concurrently via asyncio.gather, so layer2 could never see layer1's
            # own output). Fall back to the prior turn's concept only if layer1
            # found nothing new to talk about.
            intent, concepts = await self._layer1_intent_concept(message, db, user_id, session)
            concept_ids_for_bkt = concepts or (
                [session.current_concept_id] if session.current_concept_id else []
            )

            (p_mastery, delta, kt_before, kt_after), (frustration, engagement, cognitive) = (
                await asyncio.gather(
                    self._layer2_bkt_update(db, user_id, concept_ids_for_bkt, intent),
                    self._layer3_affect(message, session),
                )
            )

            out.intent = intent
            out.detected_concepts = concepts
            out.p_mastery = p_mastery
            out.p_mastery_delta = delta
            out.frustration_score = frustration
            out.engagement_score = engagement
            out.cognitive_state = cognitive
            out.kt_before = kt_before
            out.kt_after = kt_after

            try:
                from services.rl_strategy_agent import (
                    StateFeatures, get_bandit, session_depth_from_count
                )
                state = StateFeatures(
                    archetype=archetype,
                    cognitive_state=cognitive,
                    intent=intent,
                    p_mastery=p_mastery,
                    frustration_score=frustration,
                    session_depth=session_depth_from_count(session.message_count),
                )
                interaction_count = self._get_interaction_count(db, user_id)
                bandit = get_bandit()
                selection = bandit.select_strategy(
                    db=db,
                    student_id=student_id,
                    state=state,
                    interaction_count=interaction_count,
                    session_id=session.session_id,
                    p_mastery_before=p_mastery,
                    frustration_before=frustration,
                    engagement_before=engagement,
                )
                out.response_strategy = selection.strategy_id
                out.rl_state_hash = selection.state_hash
                out.rl_selection_method = selection.selection_method
                out.rl_episode_id = selection.episode_id or ""
                out.rl_exploration_flag = selection.exploration_flag

                bandit.queue_reward_measurement(
                    db=db,
                    student_id=student_id,
                    session_id=session.session_id,
                    message_id=None,
                    state_hash=selection.state_hash,
                    strategy_id=selection.strategy_id,
                    p_mastery_before=p_mastery,
                    frustration_before=frustration,
                    engagement_before=engagement,
                )
                db.commit()
            except Exception as rl_err:
                logger.warning(f"[ML] RL strategy selection failed, using rule fallback: {rl_err}")
                out.response_strategy = self._select_strategy(
                    intent, frustration, p_mastery, archetype, engagement
                )
                out.rl_selection_method = "rule"

            if self._memory_svc:
                try:
                    memories = self._memory_svc.retrieve_relevant_memories(
                        db, student_id, message, top_k=5
                    )
                    out.memory_context = self._memory_svc.format_memory_context(memories)
                    out.memories_used = [m.memory_hash for m in memories]
                    logger.info("[ML L5] memory  retrieved=%d  hashes=%s", len(memories), out.memories_used[:3])
                except Exception as e:
                    logger.warning(f"[ML] memory retrieval failed: {e}")

            logger.info(
                "[ML  ✓] DONE  user=%-10s  strategy=%-22s  method=%-14s  mastery=%.0f%%  "
                "frustration=%.2f  memories=%d  msg=%.40r",
                student_id,
                out.response_strategy,
                out.rl_selection_method,
                out.p_mastery * 100,
                out.frustration_score,
                len(out.memories_used),
                message,
            )

        except Exception as e:
            logger.error(f"[ML] pipeline error: {e}")

        return out

    def build_system_prompt_addendum(
        self,
        out: MLOutput,
        profile: Optional[Dict] = None,
        session_brief: str = "",
        require_follow_up: bool = True,
    ) -> str:
        lines: List[str] = []

        lines.append("[STUDENT INTELLIGENCE STATE]")
        lines.append(f"Archetype: {out.archetype}")
        lines.append(f"Cognitive state: {out.cognitive_state}")
        lines.append(f"Frustration: {out.frustration_score:.2f} | Engagement: {out.engagement_score:.2f}")
        lines.append(f"Current mastery (BKT): {out.p_mastery:.0%}")
        lines.append(f"Detected intent: {out.intent}")

        if profile:
            weak = profile.get("weak_concepts", [])
            if weak:
                names = [w.get("concept_name", "") for w in weak[:3]]
                lines.append(f"Weak areas: {', '.join(names)}")

        if session_brief:
            lines.append(f"Session context: {session_brief}")

        if out.memory_context:
            lines.append("")
            lines.append(out.memory_context)

        strategy_instr = STRATEGY_INSTRUCTIONS.get(out.response_strategy, "")
        lines.append("")
        lines.append(f"[RESPONSE STRATEGY: {out.response_strategy}]")
        lines.append(strategy_instr)

        lines.append("")
        lines.append("[CONSTRAINTS]")
        lines.append("- Never mention the system, strategy, or memory to the student.")
        lines.append("- Max 150 words unless strategy is WORKED_EXAMPLE.")
        if require_follow_up and out.intent not in ("off_topic", "emotional", "exploration") and out.frustration_score < 0.5:
            lines.append("- End with ONE short follow-up question directly related to the student's topic.")
        lines.append("- NEVER introduce unrelated problems or examples unless explicitly asked.")

        return "\n".join(lines)
