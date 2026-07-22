from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_agent: Optional["CentralContextAgent"] = None

def get_context_agent() -> Optional["CentralContextAgent"]:
    return _agent

def initialize_context_agent(db_factory, memory_svc=None) -> "CentralContextAgent":
    global _agent
    _agent = CentralContextAgent(db_factory, memory_svc)
    logger.info("CentralContextAgent initialized")
    return _agent

@dataclass
class LearningEvent:
    student_id: str
    source: str
    event_type: str = "interaction"
    concept_id: str = ""
    concept_name: str = ""
    session_id: Optional[int] = None
    correct: Optional[bool] = None
    score: float = 0.0
    wrong_questions: int = 0
    time_seconds: int = 0
    frustration: float = 0.0
    intent: str = ""
    message: str = ""
    p_mastery: float = 0.0
    raw_data: Dict[str, Any] = field(default_factory=dict)

@dataclass
class AgentDecision:
    triggers_fired: List[str] = field(default_factory=list)
    inject_concept_to_chat: Optional[str] = None
    add_flashcard_reps: Optional[str] = None
    flashcard_reps_count: int = 0
    dim_roadmap_concept: Optional[str] = None
    unlock_roadmap_concepts: List[str] = field(default_factory=list)
    milestone_notification: Optional[str] = None
    session_brief: Optional[str] = None
    weak_concepts: List[str] = field(default_factory=list)

@dataclass
class WeakConcept:
    concept_id: str
    concept_name: str
    p_mastery: float
    trend: float
    trend_label: str
    struggle_sources: List[str]
    interaction_count: int
    last_seen: Optional[datetime]
    recommended_action: str
    importance_score: float
    evidence: Optional[str] = None

@dataclass
class StudentProfile:
    user_id: int
    archetype: str
    weak_concepts: List[WeakConcept]
    strong_concepts: List[WeakConcept]
    struggling_today: List[str]
    session_brief: str
    frustration_trend: List[float]
    total_interactions: int
    total_points: int
    weekly_points: int
    daily_streak: int
    concepts_mastered: int
    concepts_in_progress: int
    concepts_not_started: int
    weekly_stats: Dict[str, Any]

class CentralContextAgent:

    def __init__(self, db_factory, memory_svc=None):
        self._db_factory = db_factory
        self._memory_svc = memory_svc

    def record_event(self, db, event: LearningEvent) -> AgentDecision:
        decision = AgentDecision()

        try:
            self._update_bkt(db, event)
        except Exception as e:
            logger.warning(f"[Agent] BKT update failed: {e}")
            db.rollback()

        if self._memory_svc:
            try:
                from services.memory_service import MemoryEvent
                me = MemoryEvent(
                    source=event.source,
                    concept_id=event.concept_id,
                    concept_name=event.concept_name,
                    correct=event.correct,
                    wrong_count=event.wrong_questions,
                    difficulty=event.raw_data.get("difficulty", "medium"),
                    intent=event.intent,
                    frustration=event.frustration,
                    message=event.message,
                    score=event.score,
                    wrong_questions=event.wrong_questions,
                    time_seconds=event.time_seconds,
                    p_mastery=event.p_mastery,
                )
                self._memory_svc.write_memory(db, event.student_id, me)
            except Exception as e:
                logger.warning(f"[Agent] memory write failed: {e}")

        try:
            self._evaluate_triggers(db, event, decision)
        except Exception as e:
            logger.warning(f"[Agent] trigger evaluation failed: {e}")

        try:
            self._log_event(db, event, decision)
        except Exception as e:
            logger.warning(f"[Agent] event logging failed: {e}")
            db.rollback()

        return decision

    def _update_bkt(self, db, event: LearningEvent):
        if not event.concept_id:
            return
        import models

        user_id = int(event.student_id)
        state = db.query(models.StudentKnowledgeState).filter_by(
            user_id=user_id, concept_id=event.concept_id
        ).first()

        if not state:
            state = models.StudentKnowledgeState(
                user_id=user_id,
                concept_id=event.concept_id,
                concept_name=event.concept_name or event.concept_id,
                p_mastery=0.1,
            )
            db.add(state)
            db.flush()

        if event.source in ("flashcard", "quiz"):
            pl, ps, pg = state.p_learn, state.p_slip, state.p_guess
            p = state.p_mastery
            observed_correct = bool(event.correct)
            if event.source == "quiz" and event.correct is None:
                observed_correct = (event.score or 0.0) >= 0.65

            if observed_correct:
                p_update = (p * (1 - ps)) / max((p * (1 - ps) + (1 - p) * pg), 1e-9)
            else:
                p_update = (p * ps) / max((p * ps + (1 - p) * (1 - pg)), 1e-9)
            p_next = p_update + (1 - p_update) * pl
            state.p_mastery = min(max(p_next, 0.01), 0.99)

            if event.source == "quiz":
                score = max(0.0, min(float(event.score or 0.0), 1.0))
                score_target = 0.05 + (0.9 * score)
                blended = (state.p_mastery * 0.45) + (score_target * 0.55)
                state.p_mastery = min(max(blended, 0.01), 0.99)
                if score >= 0.8:
                    state.p_mastery = max(state.p_mastery, 0.78)
                elif score <= 0.45:
                    state.p_mastery = min(state.p_mastery, 0.45)
        elif event.source == "chat":
            delta = 0.01 if event.frustration < 0.3 else -0.005
            state.p_mastery = min(max(state.p_mastery + delta, 0.01), 0.99)

        state.interaction_count += 1
        state.last_updated = datetime.now(timezone.utc)
        hist = state.mastery_history or []
        hist.append(round(state.p_mastery, 3))
        state.mastery_history = hist[-30:]
        event.p_mastery = state.p_mastery
        db.commit()

    def _evaluate_triggers(self, db, event: LearningEvent, decision: AgentDecision):
        import models

        user_id = int(event.student_id)

        if event.source == "flashcard" and event.correct is False:
            wrong_today = (
                db.query(models.AgentEvent)
                .filter_by(user_id=user_id, concept_id=event.concept_id, source="flashcard")
                .filter(models.AgentEvent.correct == False)
                .filter(models.AgentEvent.timestamp >= _today_start())
                .count()
            )
            if wrong_today >= 2:
                chat_memory = None
                if self._memory_svc:
                    cross = self._memory_svc.get_cross_source_memories(
                        db, event.student_id, event.concept_id
                    )
                    chat_memory = cross.get("chat")
                if not chat_memory:
                    decision.inject_concept_to_chat = event.concept_id
                    decision.triggers_fired.append("rule1_flashcard_to_chat")

        if event.source == "chat" and event.frustration > 0.5 and event.concept_id:
            decision.add_flashcard_reps = event.concept_id
            decision.flashcard_reps_count = 5
            decision.triggers_fired.append("rule2_frustration_to_flashcards")

        if event.source == "quiz" and event.score < 0.5 and event.concept_id:
            decision.dim_roadmap_concept = event.concept_id
            decision.triggers_fired.append("rule3_quiz_fail_dim_roadmap")

        if event.source in ("flashcard", "quiz", "chat") and event.concept_id:
            state = db.query(models.StudentKnowledgeState).filter_by(
                user_id=user_id, concept_id=event.concept_id
            ).first()
            if state and state.p_mastery > 0.85 and state.interaction_count >= 3:
                already_notified = (
                    db.query(models.AgentEvent)
                    .filter_by(
                        user_id=user_id,
                        concept_id=event.concept_id,
                        event_type="mastery_milestone",
                    )
                    .count()
                )
                if not already_notified:
                    decision.milestone_notification = (
                        f"You've mastered {event.concept_name}! Keep it up!"
                    )
                    decision.triggers_fired.append("rule4_mastery_milestone")
                    try:
                        notif = models.Notification(
                            user_id=user_id,
                            title="Concept Mastered!",
                            message=decision.milestone_notification,
                            notification_type="milestone",
                        )
                        db.add(notif)
                        db.commit()
                    except Exception:
                        db.rollback()

    def _log_event(self, db, event: LearningEvent, decision: AgentDecision):
        import models

        row = models.AgentEvent(
            user_id=int(event.student_id),
            session_id=event.session_id,
            timestamp=datetime.now(timezone.utc),
            source=event.source,
            event_type=event.event_type,
            concept_id=event.concept_id or None,
            concept_name=event.concept_name or None,
            correct=event.correct,
            confidence_signal=event.score if event.source == "quiz" else None,
            triggers_fired=decision.triggers_fired,
            raw_data=event.raw_data,
        )
        db.add(row)
        db.commit()

    def get_student_profile(self, db, user_id: int) -> StudentProfile:
        import models

        archetype = "default"
        try:
            prof = db.query(models.ComprehensiveUserProfile).filter_by(user_id=user_id).first()
            if prof and prof.primary_archetype:
                archetype = prof.primary_archetype
        except Exception:
            pass

        weak_concepts: List[WeakConcept] = []
        strong_concepts: List[WeakConcept] = []
        try:
            states = (
                db.query(models.StudentKnowledgeState)
                .filter_by(user_id=user_id)
                .order_by(models.StudentKnowledgeState.p_mastery.asc())
                .limit(30)
                .all()
            )
            for s in states:
                hist = s.mastery_history or []
                trend = 0.0
                trend_label = "stable"
                if len(hist) >= 2:
                    trend = hist[-1] - hist[-2]
                    trend_label = "improving" if trend > 0.02 else ("declining" if trend < -0.02 else "stable")

                sources = _get_struggle_sources(db, user_id, s.concept_id)
                action = _recommend_action(s.p_mastery, sources)
                evidence = _get_evidence_snippet(db, user_id, s.concept_name)

                wc = WeakConcept(
                    concept_id=s.concept_id,
                    concept_name=s.concept_name,
                    p_mastery=s.p_mastery,
                    trend=trend,
                    trend_label=trend_label,
                    struggle_sources=sources,
                    interaction_count=s.interaction_count,
                    last_seen=s.last_updated,
                    recommended_action=action,
                    importance_score=min(1.0, (1 - s.p_mastery) + (0.1 if "chat" in sources else 0)),
                    evidence=evidence,
                )
                if s.p_mastery < 0.5:
                    weak_concepts.append(wc)
                else:
                    strong_concepts.append(wc)
        except Exception as e:
            logger.warning(f"[Agent] profile concepts failed: {e}")

        struggling_today: List[str] = []
        try:
            today_events = (
                db.query(models.AgentEvent)
                .filter(
                    models.AgentEvent.user_id == user_id,
                    models.AgentEvent.timestamp >= _today_start(),
                    models.AgentEvent.correct == False,
                )
                .all()
            )
            seen = set()
            for e in today_events:
                if e.concept_name and e.concept_name not in seen:
                    struggling_today.append(e.concept_name)
                    seen.add(e.concept_name)
        except Exception:
            pass

        total_pts = 0
        weekly_pts = 0
        streak = 0
        try:
            gstats = db.query(models.UserGamificationStats).filter_by(user_id=user_id).first()
            if gstats:
                total_pts = gstats.total_points or 0
                weekly_pts = gstats.weekly_points or 0
                streak = gstats.current_streak or 0
        except Exception:
            pass

        total_interactions = sum(w.interaction_count for w in weak_concepts + strong_concepts)
        concepts_mastered = len([w for w in strong_concepts if w.p_mastery > 0.85])
        concepts_in_progress = len([w for w in weak_concepts + strong_concepts if 0.3 <= w.p_mastery <= 0.85])
        concepts_not_started = 0

        session_brief = _generate_session_brief(weak_concepts, struggling_today)

        try:
            daily = (
                db.query(models.DailyLearningMetrics)
                .filter(
                    models.DailyLearningMetrics.user_id == user_id,
                    models.DailyLearningMetrics.date >= (date.today() - timedelta(days=7)),
                )
                .all()
            )
            weekly_stats = {
                "interactions": sum(m.questions_answered for m in daily),
                "study_minutes": sum(m.time_spent_minutes for m in daily),
                "accuracy": (
                    sum(m.accuracy_rate for m in daily) / len(daily) if daily else 0.0
                ),
            }
        except Exception:
            weekly_stats = {}

        return StudentProfile(
            user_id=user_id,
            archetype=archetype,
            weak_concepts=weak_concepts,
            strong_concepts=strong_concepts,
            struggling_today=struggling_today,
            session_brief=session_brief,
            frustration_trend=[],
            total_interactions=total_interactions,
            total_points=total_pts,
            weekly_points=weekly_pts,
            daily_streak=streak,
            concepts_mastered=concepts_mastered,
            concepts_in_progress=concepts_in_progress,
            concepts_not_started=concepts_not_started,
            weekly_stats=weekly_stats,
        )

    def apply_forgetting_curve(self, db, user_id: int):
        import models

        try:
            states = db.query(models.StudentKnowledgeState).filter_by(user_id=user_id).all()
            for s in states:
                if s.last_updated:
                    lu = s.last_updated.replace(tzinfo=timezone.utc) if s.last_updated.tzinfo is None else s.last_updated
                    days = max(0, (datetime.now(timezone.utc) - lu).days)
                    if days > 0:
                        s.p_mastery = max(s.p_mastery * (0.95 ** days), 0.1)
            db.commit()
        except Exception as e:
            logger.warning(f"[Agent] forgetting curve failed: {e}")
            db.rollback()

def _today_start() -> datetime:
    today = date.today()
    return datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

def _get_struggle_sources(db, user_id: int, concept_id: str) -> List[str]:
    import models

    sources: List[str] = []
    try:
        events = (
            db.query(models.AgentEvent)
            .filter_by(user_id=user_id, concept_id=concept_id)
            .filter(models.AgentEvent.correct == False)
            .distinct(models.AgentEvent.source)
            .all()
        )
        seen = set()
        for e in events:
            if e.source not in seen:
                sources.append(e.source)
                seen.add(e.source)
    except Exception:
        pass
    return sources

def _get_evidence_snippet(db, user_id: int, concept_name: str) -> Optional[str]:
    """A real quoted moment behind a weak-area label, not just a source-type tag.

    AgentEvent (the source of struggle_sources above) never persisted the
    actual message text -- only source/event_type/correctness -- so
    struggle_sources could say "chat" but never show what the student
    actually said. ChatConceptSignal stores that snippet already
    (tutor/nodes.py::persist_updates), so pull the most recent one here.
    """
    import models

    if not concept_name:
        return None
    try:
        sig = (
            db.query(models.ChatConceptSignal)
            .filter(
                models.ChatConceptSignal.user_id == user_id,
                models.ChatConceptSignal.concept.ilike(concept_name),
            )
            .order_by(models.ChatConceptSignal.created_at.desc())
            .first()
        )
        return sig.message_snippet if sig else None
    except Exception:
        return None

def _recommend_action(p_mastery: float, sources: List[str]) -> str:
    if p_mastery < 0.3:
        return "ask_tutor"
    if "quiz" in sources:
        return "review_flashcards"
    if "flashcard" in sources:
        return "try_a_quiz"
    if "chat" in sources:
        return "review_flashcards"
    return "try_a_quiz"

def _generate_session_brief(weak_concepts: List[WeakConcept], struggling_today: List[str]) -> str:
    parts: List[str] = []
    if struggling_today:
        parts.append(f"Struggling today with: {', '.join(struggling_today[:3])}.")
    if weak_concepts:
        names = [w.concept_name for w in weak_concepts[:3]]
        parts.append(f"Weakest concepts: {', '.join(names)}.")
    return " ".join(parts) if parts else "Fresh session — no prior struggle data."
