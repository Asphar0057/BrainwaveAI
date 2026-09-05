from __future__ import annotations

import asyncio
import logging
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_KEYWORD_PATTERN_CACHE: Dict[str, "re.Pattern"] = {}

def _keyword_hit(text: str, keyword: str) -> bool:
    """Word-boundary keyword match.

    Plain `kw in text` substring checks misfire constantly: the off_topic
    keyword "hi" matches inside "this", "which", "white", "history"; the
    frustration keyword "help" matches inside "helpful"/"helping". Those
    false hits used to flip intent to off_topic (or inflate frustration) on
    ordinary academic messages, which then fed a wrong BKT observation onto
    whatever concept was last discussed.
    """
    pattern = _KEYWORD_PATTERN_CACHE.get(keyword)
    if pattern is None:
        pattern = re.compile(r"(?<!\w)" + re.escape(keyword) + r"(?!\w)")
        _KEYWORD_PATTERN_CACHE[keyword] = pattern
    return bool(pattern.search(text))

_FILLER_WORDS = {
    "hi", "hello", "hey", "yo", "sup",
    "thanks", "thank", "ty", "thx",
    "ok", "okay", "k", "sure", "yep", "yeah", "yup", "no", "nope", "nah",
    "cool", "nice", "great", "awesome", "lol", "haha", "lmao",
    "bye", "goodbye", "later", "brb", "np", "welcome",
}

def _is_filler_message(msg_lower: str) -> bool:
    words = re.findall(r"[a-z']+", msg_lower)
    if not words or len(words) > 5:
        return False
    return all(w in _FILLER_WORDS for w in words)

FRUSTRATION_KEYWORDS = [
    "don't get", "confused", "lost", "ugh", "doesn't make sense",
    "still don't", "what even", "impossible", "give up", "hate this",
    "so hard", "not getting it", "makes no sense", "keep failing",
    "never understand", "too hard", "stuck", "help", "can't understand",
    "don't understand", "totally lost",
]

INTENT_KEYWORDS = {
    # Checked first: without this category, no intent ever mapped to a
    # CONFIDENCE value above the obs > 0.5 threshold in _layer2_bkt_update,
    # so the "correct answer" BKT branch was structurally unreachable and
    # mastery could never rise from genuine understanding -- only settle
    # toward a low floor no matter how well the conversation was going.
    "confident": [
        "got it", "that makes sense", "makes sense now", "i get it now",
        "i solved", "solved it", "figured it out", "that clicked",
        "understood now", "nailed it", "makes total sense", "i see now",
        "makes sense", "understand now", "i understand", "got this",
    ],
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
    ("confusion", None, None, "Kinetiq", "ANALOGICAL"),
    ("confusion", None, None, "Logicor", "DIRECT_EXPLANATION"),
    ("confusion", None, None, "Flowist", "WORKED_EXAMPLE"),
    ("confusion", None, None, None, "SCAFFOLDED"),
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
    dkt_mastery: Optional[float] = None
    mastery_source: str = "bkt"
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

        # Pure filler/acknowledgments ("thanks!", "lol ok", "sure") carry no
        # evidence about any concept and short-circuit straight to off_topic,
        # bypassing the turn-count "stuck" seed and the keyword loop below.
        # The off_topic entry in INTENT_KEYWORDS alone ("weather", "hi", ...)
        # is too narrow to catch these -- widening it with bare short words
        # like "ok"/"sure" would misfire on real questions that merely start
        # with them ("ok so how does osmosis work?"), so this only fires when
        # the ENTIRE message is short filler, not merely contains it.
        if _is_filler_message(msg_lower):
            logger.info("[ML L1] intent=off_topic     concepts=(none)  (pure filler message)")
            return "off_topic", []

        intent = "question"
        if session.messages_on_concept >= 3:
            intent = "stuck"

        for kw in INTENT_KEYWORDS.get("emotional", []):
            if _keyword_hit(msg_lower, kw):
                intent = "emotional"
                break

        # Only "emotional" is locked in above. A turn-count-seeded "stuck"
        # default must still be able to yield to what the message actually
        # says -- e.g. a breakthrough ("oh wait, that makes sense now!")
        # after 3+ confused turns on the same concept, or a plain topic
        # change -- otherwise a student who finally understands something
        # can never get credit for it once the turn-count threshold trips.
        if intent != "emotional":
            matched = False
            for intent_name, keywords in INTENT_KEYWORDS.items():
                for kw in keywords:
                    if _keyword_hit(msg_lower, kw):
                        intent = intent_name
                        matched = True
                        break
                if matched:
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

        # No fallback to session.current_concept_id here: this return value
        # feeds out.detected_concepts, which chat.py uses to bump
        # session_state.messages_on_concept. Silently re-stamping the stale
        # concept onto every turn (including off-topic chit-chat) inflated
        # that counter and tripped the >=3 "stuck" override on turns that
        # never actually engaged the concept. Callers that want a same-concept
        # fallback for BKT scoring apply it themselves, gated on intent.

        logger.info(
            "[ML L1] intent=%-12s  concepts=%s  embed_model=%s",
            intent,
            concepts or ["(none)"],
            "ready" if self._registry._embed_model else "missing",
        )
        return intent, concepts

    @staticmethod
    def _decayed_mastery(p_mastery: float, last_updated: Optional[datetime], interaction_count: int) -> float:
        """Applies forgetting since `last_updated`, reusing dkt/temporal_decay.py's
        retrievability curve so BKT and DKT share one decay model instead of BKT
        silently assuming perfect retention forever. Stability grows with practice
        count on this concept (more repetitions -> slower forgetting), same spirit
        as temporal_decay._estimate_stability's count term, without needing that
        function's full interaction-history query for a per-message BKT update."""
        if not last_updated:
            return p_mastery
        from dkt.temporal_decay import compute_decay
        now = datetime.now(timezone.utc)
        last = last_updated if last_updated.tzinfo else last_updated.replace(tzinfo=timezone.utc)
        days_elapsed = (now - last).total_seconds() / 86400
        if days_elapsed <= 0:
            return p_mastery
        stability = min(60.0, 7.0 + interaction_count * 2.0)
        return compute_decay(p_mastery, days_elapsed, stability)

    async def _layer2_bkt_update(
        self, db, user_id: int, concept_ids: List[str], intent: str,
        *, verified_correct: Optional[bool] = None
    ) -> Tuple[float, float, Dict, Dict]:
        import models

        # Intent is affect/self-report, not evidence of a correct or wrong answer.
        # Callers must provide a server-graded outcome to change mastery.
        if verified_correct is None:
            before = {}
            for cid in concept_ids[:2]:
                state = db.query(models.StudentKnowledgeState).filter_by(
                    user_id=user_id, concept_id=cid
                ).first()
                if state:
                    before[cid] = state.p_mastery
            average = sum(before.values()) / len(before) if before else 0.1
            return average, 0.0, before, dict(before)

        archetype_p_learn = {"Logicor": 0.12, "Kinetiq": 0.08, "Flowist": 0.10}

        kt_before: Dict[str, float] = {}
        kt_after: Dict[str, float] = {}
        p_mastery_avg = 0.1
        p_mastery_delta = 0.0

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
                p = self._decayed_mastery(state.p_mastery, state.last_updated, state.interaction_count or 0)

                kt_before[cid] = p

                if verified_correct:
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
                    cid[:30], kt_before[cid], state.p_mastery, float(verified_correct),
                )

            db.commit()
            p_mastery_avg = sum(masteries) / len(masteries) if masteries else 0.1
            p_mastery_delta = p_mastery_avg - (sum(kt_before.values()) / len(kt_before) if kt_before else 0.1)
        except Exception as e:
            logger.warning(f"[ML] BKT update failed: {e}")
            db.rollback()

        return p_mastery_avg, p_mastery_delta, kt_before, kt_after

    async def _layer3_affect(
        self, message: str, session: SessionContext
    ) -> Tuple[float, float, str]:
        msg_lower = message.lower()

        lexical = sum(1 for kw in FRUSTRATION_KEYWORDS if _keyword_hit(msg_lower, kw))
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
            # own output).
            intent, concepts = await self._layer1_intent_concept(message, db, user_id, session)
            # Read existing mastery for personalization. Conversational intent
            # never counts as an attempt; grading updates mastery separately.
            concept_ids_for_bkt = [] if intent == "off_topic" else (
                concepts or ([session.current_concept_id] if session.current_concept_id else [])
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

            # Reconcile BKT's just-updated real-time estimate with DKT's
            # holistic, decay-aware one (services/mastery_reconciliation.py)
            # so the number shown to the LLM and used for strategy selection
            # is the same evidence-weighted blend StyleBandit already uses
            # DKT alone for, instead of two independently-computed figures
            # that can silently disagree for the same concept.
            if concept_ids_for_bkt:
                try:
                    from services.mastery_reconciliation import get_concept_mastery
                    reconciled = get_concept_mastery(user_id, concept_ids_for_bkt[0], db)
                    out.p_mastery = reconciled["mastery"]
                    out.dkt_mastery = reconciled["dkt_mastery"]
                    out.mastery_source = reconciled["source"]
                    # StateFeatures/select_strategy below key off the local
                    # `p_mastery` var, not `out.p_mastery` -- sync it so
                    # strategy selection also sees the reconciled figure.
                    p_mastery = reconciled["mastery"]
                    if reconciled["source"] == "blend":
                        logger.info(
                            "[ML] mastery reconciled  concept=%s  bkt=%.3f  dkt=%.3f  blended=%.3f",
                            concept_ids_for_bkt[0], reconciled["bkt_mastery"],
                            reconciled["dkt_mastery"], reconciled["mastery"],
                        )
                except Exception as e:
                    logger.debug(f"[ML] mastery reconciliation skipped: {e}")

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

    def build_weak_concept_profile(self, db, user_id: int, max_concepts: int = 3) -> Dict:
        """Real per-concept weak-area evidence for the chat addendum.

        Previously `build_system_prompt_addendum`'s `profile` argument was never
        populated by any caller (chat.py always called it with the default
        `None`), so the "Weak areas" line never appeared in the system prompt
        regardless of how much weakness data existed -- chat looked
        unpersonalized even when the DB had real signal. This builds that
        profile from UserWeakArea (open-vocabulary concept names, extracted by
        dkt/language_analyzer's phrase extractor, so it also catches concepts
        never seen before -- unlike this pipeline's own embedding-similarity
        concept cache) plus a real quoted snippet from ChatConceptSignal as
        evidence, so the model sees the actual moment the struggle showed up.

        Anti-nagging: rows are excluded once weakness_score decays below 0.15
        (already decremented on correct signals elsewhere -- see
        tutor/nodes.py::persist_updates) or once last_updated is >30 days old
        with no reinforcement, so an old, resolved, or since-forgotten mention
        does not get repeated forever. Long-dormant concepts are instead
        surfaced once at session start via dkt/temporal_decay.get_decayed_concepts
        (a separate, complementary "let's review this" nudge), not on every turn.
        """
        try:
            import models
            from datetime import timedelta

            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            weak_areas = (
                db.query(models.UserWeakArea)
                .filter(
                    models.UserWeakArea.user_id == user_id,
                    models.UserWeakArea.weakness_score >= 0.15,
                    models.UserWeakArea.last_updated >= cutoff,
                )
                .order_by(models.UserWeakArea.weakness_score.desc())
                .limit(max_concepts)
                .all()
            )

            from sqlalchemy import func as _func
            topics = [wa.topic for wa in weak_areas if wa.topic]
            evidence_by_topic: Dict[str, str] = {}
            if topics:
                signals = (
                    db.query(models.ChatConceptSignal)
                    .filter(
                        models.ChatConceptSignal.user_id == user_id,
                        _func.lower(models.ChatConceptSignal.concept).in_([t.lower() for t in topics]),
                    )
                    .order_by(models.ChatConceptSignal.created_at.desc())
                    .all()
                )
                for sig in signals:
                    key = (sig.concept or "").lower()
                    if key and key not in evidence_by_topic:
                        evidence_by_topic[key] = sig.message_snippet

            weak_concepts = []
            for wa in weak_areas:
                evidence_snippet = evidence_by_topic.get((wa.topic or "").lower())
                weak_concepts.append({
                    "concept_name": wa.topic,
                    "weakness_score": round(wa.weakness_score or 0.0, 2),
                    "evidence": evidence_snippet,
                    "last_updated": wa.last_updated,
                })

            return {"weak_concepts": weak_concepts}
        except Exception as e:
            logger.warning(f"[ML] weak concept profile fetch failed: {e}")
            return {"weak_concepts": []}

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
        lines.append(f"Current mastery: {out.p_mastery:.0%}")
        lines.append(f"Detected intent: {out.intent}")

        if profile:
            weak = profile.get("weak_concepts", [])
            if weak:
                lines.append("Weak areas (with evidence — reference these specifically, don't just say 'weak areas'):")
                for w in weak[:3]:
                    name = w.get("concept_name", "")
                    score = w.get("weakness_score")
                    entry = f"- {name}" + (f" (struggle signal {score:.2f})" if score is not None else "")
                    evidence = w.get("evidence")
                    if evidence:
                        entry += f' — student said: "{evidence}"'
                    lines.append(entry)

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
