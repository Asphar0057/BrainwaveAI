from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
from deps import enforce_request_user_scope, get_user_by_email, get_user_by_username, verify_token
from services.admin_analytics import check_admin

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/intelligence",
    tags=["intelligence"],
    dependencies=[Depends(enforce_request_user_scope)],
)

def _resolve_user(db: Session, user_id: str) -> models.User:
    user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def _safe_isoformat(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

@router.get("/status")
def intelligence_status():
    from services.memory_service import get_memory_service
    from services.context_agent import get_context_agent
    from services.ml_pipeline import ModelRegistry

    reg = ModelRegistry.get()
    return {
        "memory_service": get_memory_service() is not None,
        "context_agent": get_context_agent() is not None,
        "embedding_model": reg._embed_model is not None,
        "cross_encoder": reg._cross_encoder is not None,
    }

@router.get("/weakness/profile")
async def get_weakness_profile(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        user = _resolve_user(db, user_id)
        student_id = user.id

        from services.context_agent import get_context_agent

        agent = get_context_agent()
        profile = agent.get_student_profile(db, student_id) if agent else None

        gstats = db.query(models.UserGamificationStats).filter_by(user_id=student_id).first()
        achievements = (
            db.query(models.UserAchievement, models.Achievement)
            .join(models.Achievement, models.UserAchievement.achievement_id == models.Achievement.id)
            .filter(models.UserAchievement.user_id == student_id)
            .all()
        )

        topic_masteries = (
            db.query(models.TopicMastery)
            .filter_by(user_id=student_id)
            .order_by(models.TopicMastery.mastery_level.asc())
            .all()
        )

        bkt_states = (
            db.query(models.StudentKnowledgeState)
            .filter_by(user_id=student_id)
            .order_by(models.StudentKnowledgeState.p_mastery.asc())
            .all()
        )

        today = date.today()
        daily_metrics = (
            db.query(models.DailyLearningMetrics)
            .filter(
                models.DailyLearningMetrics.user_id == student_id,
                models.DailyLearningMetrics.date >= today - timedelta(days=30),
            )
            .order_by(models.DailyLearningMetrics.date.asc())
            .all()
        )

        weekly_activity = []
        for i in range(7):
            day = today - timedelta(days=6 - i)
            m = next((x for x in daily_metrics if x.date == day), None)
            weekly_activity.append({
                "date": day.isoformat(),
                "interactions": m.questions_answered if m else 0,
                "chat": m.sessions_completed if m else 0,
                "quiz": 0,
                "flashcard": 0,
                "roadmap": 0,
            })

        mastery_over_time = [
            {
                "date": m.date.isoformat() if hasattr(m.date, "isoformat") else str(m.date),
                "avg_p_mastery": round(m.accuracy_rate, 3),
            }
            for m in daily_metrics
        ]

        weak_out = []
        if profile:
            for wc in (profile.weak_concepts or [])[:10]:
                weak_out.append({
                    "concept_id": wc.concept_id,
                    "concept_name": wc.concept_name,
                    "p_mastery": round(wc.p_mastery, 3),
                    "mastery_trend": round(wc.trend, 3),
                    "mastery_trend_label": wc.trend_label,
                    "struggle_sources": wc.struggle_sources,
                    "interaction_count": wc.interaction_count,
                    "last_seen": _safe_isoformat(wc.last_seen),
                    "recommended_action": wc.recommended_action,
                    "evidence": wc.evidence,
                })
        else:
            from services.context_agent import _get_evidence_snippets_bulk
            top_states = bkt_states[:10]
            evidence_by_concept = _get_evidence_snippets_bulk(db, student_id, [s.concept_name for s in top_states])
            for s in top_states:
                hist = s.mastery_history or []
                trend = (hist[-1] - hist[-2]) if len(hist) >= 2 else 0.0
                trend_label = "improving" if trend > 0.02 else ("declining" if trend < -0.02 else "stable")
                weak_out.append({
                    "concept_id": s.concept_id,
                    "concept_name": s.concept_name,
                    "p_mastery": round(s.p_mastery, 3),
                    "mastery_trend": round(trend, 3),
                    "mastery_trend_label": trend_label,
                    "struggle_sources": [],
                    "interaction_count": s.interaction_count,
                    "last_seen": _safe_isoformat(s.last_updated),
                    "recommended_action": "review_flashcards" if s.p_mastery < 0.4 else "try_a_quiz",
                    "evidence": evidence_by_concept.get((s.concept_name or "").lower()),
                })

        total_pts = gstats.total_points if gstats else 0
        weekly_pts = gstats.weekly_points if gstats else 0
        streak = gstats.current_streak if gstats else 0
        mastered_count = len([s for s in bkt_states if s.p_mastery > 0.85])
        in_progress = len([s for s in bkt_states if 0.3 < s.p_mastery <= 0.85])

        total_mins = sum(m.time_spent_minutes for m in daily_metrics)
        total_study_hours = round(total_mins / 60.0, 1)
        sessions_total = sum(m.sessions_completed for m in daily_metrics)
        avg_session_min = round(total_mins / sessions_total, 1) if sessions_total > 0 else 0.0

        topic_sorted = sorted(topic_masteries, key=lambda t: t.mastery_level)
        weakest_subject = topic_sorted[0].topic_name if topic_sorted else "N/A"
        strongest_subject = topic_sorted[-1].topic_name if topic_sorted else "N/A"

        improvement_rate = 0.0
        if bkt_states:
            deltas = []
            for s in bkt_states:
                h = s.mastery_history or []
                if len(h) >= 2:
                    deltas.append(h[-1] - h[0])
            if deltas:
                improvement_rate = round(sum(deltas) / len(deltas), 3)

        badges_out = []
        earned_ids = {ua.achievement_id for ua, _ in achievements}
        for ua, ach in achievements:
            badges_out.append({
                "badge_id": ach.name,
                "name": ach.name,
                "description": ach.description,
                "icon": ach.icon or "🏅",
                "earned": True,
                "earned_at": _safe_isoformat(ua.earned_at),
            })
        all_achs = db.query(models.Achievement).all()
        for ach in all_achs:
            if ach.id not in earned_ids:
                badges_out.append({
                    "badge_id": ach.name,
                    "name": ach.name,
                    "description": ach.description,
                    "icon": ach.icon or "🏅",
                    "earned": False,
                    "earned_at": None,
                })

        heatmap = [
            {
                "concept_id": s.concept_id,
                "concept_name": s.concept_name,
                "p_mastery": round(s.p_mastery, 3),
                "color": _mastery_color(s.p_mastery),
            }
            for s in bkt_states
        ]

        return JSONResponse(content={
            "status": "success",
            "student_id": student_id,
            "weak_concepts": weak_out,
            "heatmap": heatmap,
            "stats": {
                "total_points": total_pts,
                "weekly_points": weekly_pts,
                "daily_streak": streak,
                "concepts_mastered": mastered_count,
                "concepts_in_progress": in_progress,
                "concepts_not_started": 0,
                "strongest_subject": strongest_subject,
                "weakest_subject": weakest_subject,
                "avg_session_length_min": avg_session_min,
                "total_study_time_hours": total_study_hours,
                "improvement_rate": improvement_rate,
            },
            "badges": badges_out,
            "weekly_activity": weekly_activity,
            "mastery_over_time": mastery_over_time,
            "session_brief": profile.session_brief if profile else "",
            "struggling_today": profile.struggling_today if profile else [],
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Intelligence] weakness profile failed: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"status": "error", "error": "Internal server error"})

@router.get("/weakness/recommendations")
async def get_weakness_recommendations(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        user = _resolve_user(db, user_id)

        bkt_states = (
            db.query(models.StudentKnowledgeState)
            .filter_by(user_id=user.id)
            .order_by(models.StudentKnowledgeState.p_mastery.asc())
            .limit(10)
            .all()
        )

        recommendations = []
        for s in bkt_states[:3]:
            hist = s.mastery_history or []
            trend = (hist[-1] - hist[-2]) if len(hist) >= 2 else 0.0
            p = s.p_mastery
            resource = "ask_tutor" if p < 0.3 else ("review_flashcards" if p < 0.6 else "try_a_quiz")
            recommendations.append({
                "concept_id": s.concept_id,
                "concept_name": s.concept_name,
                "p_mastery": round(p, 3),
                "priority_score": round((1 - p) * (1 + abs(trend)), 3),
                "estimated_time_minutes": int((1 - p) * 30),
                "recommended_resource": resource,
                "trend_label": "improving" if trend > 0.02 else ("declining" if trend < -0.02 else "stable"),
            })

        recommendations.sort(key=lambda x: x["priority_score"], reverse=True)

        return JSONResponse(content={
            "status": "success",
            "student_id": user.id,
            "recommendations": recommendations,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Intelligence] recommendations failed: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": "Internal server error"})

class RecordEventRequest(BaseModel):
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

@router.post("/events/record")
async def record_event(
    request: RecordEventRequest,
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        from services.context_agent import get_context_agent, LearningEvent

        agent = get_context_agent()
        if not agent:
            return JSONResponse(content={"status": "ok", "message": "agent not ready"})

        event = LearningEvent(
            student_id=request.student_id,
            source=request.source,
            event_type=request.event_type,
            concept_id=request.concept_id,
            concept_name=request.concept_name,
            session_id=request.session_id,
            correct=request.correct,
            score=request.score,
            wrong_questions=request.wrong_questions,
            time_seconds=request.time_seconds,
            frustration=request.frustration,
            intent=request.intent,
            message=request.message,
        )

        decision = agent.record_event(db, event)

        return JSONResponse(content={
            "status": "success",
            "triggers_fired": decision.triggers_fired,
            "inject_concept_to_chat": decision.inject_concept_to_chat,
            "add_flashcard_reps": decision.add_flashcard_reps,
            "flashcard_reps_count": decision.flashcard_reps_count,
            "dim_roadmap_concept": decision.dim_roadmap_concept,
            "milestone_notification": decision.milestone_notification,
        })

    except Exception as e:
        logger.error(f"[Intelligence] record event failed: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": "Internal server error"})

@router.get("/session/brief")
async def get_session_brief(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        user = _resolve_user(db, user_id)
        from services.context_agent import get_context_agent

        agent = get_context_agent()
        if agent:
            agent.apply_forgetting_curve(db, user.id)
            profile = agent.get_student_profile(db, user.id)
            return JSONResponse(content={
                "status": "success",
                "session_brief": profile.session_brief,
                "weak_concepts": [
                    {"concept_id": w.concept_id, "concept_name": w.concept_name, "p_mastery": w.p_mastery}
                    for w in (profile.weak_concepts or [])[:3]
                ],
                "struggling_today": profile.struggling_today,
            })
        return JSONResponse(content={"status": "ok", "session_brief": ""})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Intelligence] session brief failed: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": "Internal server error"})

@router.get("/memory")
async def get_student_memories(
    user_id: str = Query(...),
    limit: int = Query(default=10, le=50),
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        user = _resolve_user(db, user_id)
        rows = (
            db.query(models.StudentMemory)
            .filter_by(user_id=user.id)
            .order_by(models.StudentMemory.created_at.desc())
            .limit(limit)
            .all()
        )
        return JSONResponse(content={
            "status": "success",
            "memories": [
                {
                    "memory_hash": r.memory_hash,
                    "memory_type": r.memory_type,
                    "concept_name": r.concept_name,
                    "source": r.source,
                    "content": r.content,
                    "importance_score": r.importance_score,
                    "access_count": r.access_count,
                    "created_at": _safe_isoformat(r.created_at),
                }
                for r in rows
            ],
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Intelligence] memory list failed: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": "Internal server error"})

class WriteMemoryRequest(BaseModel):
    student_id: str
    source: str
    concept_id: str = ""
    concept_name: str = ""
    correct: Optional[bool] = None
    score: float = 0.0
    frustration: float = 0.0
    intent: str = ""
    message: str = ""
    time_seconds: int = 0
    p_mastery: float = 0.0

@router.post("/memory/write")
async def write_memory(
    request: WriteMemoryRequest,
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    try:
        from services.memory_service import get_memory_service, MemoryEvent

        svc = get_memory_service()
        if not svc:
            return JSONResponse(content={"status": "ok", "message": "memory service not ready"})

        event = MemoryEvent(
            source=request.source,
            concept_id=request.concept_id,
            concept_name=request.concept_name,
            correct=request.correct,
            score=request.score,
            frustration=request.frustration,
            intent=request.intent,
            message=request.message,
            time_seconds=request.time_seconds,
            p_mastery=request.p_mastery,
        )
        mem = svc.write_memory(db, request.student_id, event)

        if mem:
            return JSONResponse(content={
                "status": "success",
                "memory_hash": mem.memory_hash,
                "memory_type": mem.memory_type,
                "importance_score": mem.importance_score,
            })
        return JSONResponse(content={"status": "ok", "message": "write skipped"})

    except Exception as e:
        logger.error(f"[Intelligence] memory write failed: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "error": "Internal server error"})

def _mastery_color(p: float) -> str:
    if p < 0.3:
        return "deep_red"
    if p < 0.5:
        return "orange"
    if p < 0.7:
        return "yellow"
    if p < 0.85:
        return "light_green"
    return "bright_green"

@router.get("/rl/strategy-performance/{user_id_param}")
async def get_rl_strategy_performance(
    user_id_param: str,
    db: Session = Depends(get_db),
    token: str = Depends(verify_token),
):
    user = _resolve_user(db, user_id_param)
    student_id = str(user.id)

    episode_rows = (
        db.query(models.BanditEpisodeLog)
        .filter_by(student_id=student_id)
        .order_by(models.BanditEpisodeLog.timestamp.asc())
        .all()
    )

    bandit_rows = (
        db.query(models.BanditState)
        .filter_by(student_id=student_id)
        .all()
    )

    from services.rl_strategy_agent import STRATEGY_IDS

    strategy_agg: dict = {s: {"pulls": 0, "total_reward": 0.0, "rewards": []} for s in STRATEGY_IDS}
    for ep in episode_rows:
        sid = ep.strategy_selected
        if sid in strategy_agg:
            strategy_agg[sid]["pulls"] += 1
            if ep.reward_received is not None:
                strategy_agg[sid]["total_reward"] += ep.reward_received
                strategy_agg[sid]["rewards"].append(ep.reward_received)

    state_hash_features: dict = {}
    for ep in episode_rows:
        if ep.state_hash not in state_hash_features and ep.state_features:
            f = ep.state_features
            state_hash_features[ep.state_hash] = (
                f"{f.get('cognitive_state','?').title()} "
                f"{f.get('archetype','?')}, "
                f"{f.get('p_mastery_bucket','?')}"
            )

    bandit_by_strategy: dict = {}
    for row in bandit_rows:
        if row.strategy_id not in bandit_by_strategy:
            bandit_by_strategy[row.strategy_id] = []
        bandit_by_strategy[row.strategy_id].append({
            "state_hash": row.state_hash,
            "avg_reward": row.avg_reward,
            "confidence": row.alpha / (row.alpha + row.beta_param),
            "pulls": row.pulls,
        })

    strategy_stats = []
    for sid in STRATEGY_IDS:
        agg = strategy_agg[sid]
        rewards = agg["rewards"]
        avg_r = sum(rewards) / len(rewards) if rewards else 0.0
        win_rate = sum(1 for r in rewards if r > 0) / len(rewards) if rewards else 0.0

        state_rows = sorted(
            bandit_by_strategy.get(sid, []), key=lambda x: x["avg_reward"], reverse=True
        )
        best_states = [
            state_hash_features.get(r["state_hash"], r["state_hash"])
            for r in state_rows[:3]
        ]
        worst_states = [
            state_hash_features.get(r["state_hash"], r["state_hash"])
            for r in reversed(state_rows[-3:]) if state_rows
        ]

        strategy_stats.append({
            "strategy_id": sid,
            "total_pulls": agg["pulls"],
            "avg_reward": round(avg_r, 4),
            "win_rate": round(win_rate, 4),
            "best_states": best_states,
            "worst_states": worst_states,
        })

    top_policy = []
    state_best: dict = {}
    for row in bandit_rows:
        if row.state_hash not in state_best or row.avg_reward > state_best[row.state_hash]["avg"]:
            confidence = row.alpha / (row.alpha + row.beta_param)
            state_best[row.state_hash] = {
                "avg": row.avg_reward,
                "strategy": row.strategy_id,
                "confidence": confidence,
                "pulls": row.pulls,
            }

    for sh, info in sorted(state_best.items(), key=lambda x: -x[1]["avg"])[:20]:
        if info["pulls"] >= 3:
            top_policy.append({
                "state_description": state_hash_features.get(sh, sh),
                "best_strategy": info["strategy"],
                "confidence": round(info["confidence"], 4),
                "pulls": info["pulls"],
            })

    from collections import defaultdict

    weekly_rewards: dict = defaultdict(list)
    for ep in episode_rows:
        if ep.reward_received is not None and ep.timestamp:
            ts = ep.timestamp.replace(tzinfo=timezone.utc) if ep.timestamp.tzinfo is None else ep.timestamp
            week_key = ts.strftime("%Y-W%W")
            weekly_rewards[week_key].append(ep.reward_received)

    explore_total = sum(1 for ep in episode_rows if ep.exploration_flag)
    explore_rate = explore_total / len(episode_rows) if episode_rows else 0.0

    learning_curve = {
        "avg_reward_by_week": [
            {"week": wk, "avg_reward": round(sum(v) / len(v), 4)}
            for wk, v in sorted(weekly_rewards.items())
        ],
        "exploration_rate": round(explore_rate, 4),
    }

    all_rewards = [ep.reward_received for ep in episode_rows if ep.reward_received is not None]
    rule_rewards = [ep.reward_received for ep in episode_rows
                    if ep.selection_method == "rule" and ep.reward_received is not None]
    bandit_rewards = [ep.reward_received for ep in episode_rows
                      if ep.selection_method in ("bandit", "blend_bandit") and ep.reward_received is not None]

    rule_avg = sum(rule_rewards) / len(rule_rewards) if rule_rewards else 0.0
    bandit_avg = sum(bandit_rewards) / len(bandit_rewards) if bandit_rewards else 0.0

    method_counts: dict = defaultdict(int)
    for ep in episode_rows:
        method_counts[ep.selection_method] += 1
    most_used_strategy = max(strategy_stats, key=lambda x: x["total_pulls"])["strategy_id"] if strategy_stats else ""
    most_effective_strategy = max(strategy_stats, key=lambda x: x["avg_reward"])["strategy_id"] if strategy_stats else ""

    overall_stats = {
        "total_interactions_with_rl": len(episode_rows),
        "avg_reward_all_time": round(sum(all_rewards) / len(all_rewards), 4) if all_rewards else 0.0,
        "most_used_strategy": most_used_strategy,
        "most_effective_strategy": most_effective_strategy,
        "improvement_vs_rules": round(bandit_avg - rule_avg, 4),
        "selection_method_breakdown": dict(method_counts),
    }

    return {
        "strategy_stats": strategy_stats,
        "top_policy": top_policy,
        "learning_curve": learning_curve,
        "overall_stats": overall_stats,
    }

@router.get("/rl/strategy-efficacy")
async def get_rl_strategy_efficacy(
    db: Session = Depends(get_db),
    _: str = Depends(check_admin),
):
    """Platform-wide: does StrategyBandit picking something other than the
    rule-based baseline actually correlate with better reward, or is the
    personalization axis not (yet) paying off? Complements
    /rl/strategy-performance's per-user rule-vs-bandit split (which conflates
    "early in the relationship" with "rule-based" since cold start always uses
    rule) with a same-state, per-episode matched-vs-diverged comparison."""
    from services.rl_strategy_agent import get_strategy_efficacy_report

    return get_strategy_efficacy_report(db)

@router.get("/rl/platform-insights")
async def get_rl_platform_insights(
    db: Session = Depends(get_db),
    _: str = Depends(check_admin),
):
    from services.rl_strategy_agent import STRATEGY_IDS
    from collections import defaultdict

    all_episodes = (
        db.query(models.BanditEpisodeLog)
        .filter(models.BanditEpisodeLog.reward_received.isnot(None))
        .order_by(models.BanditEpisodeLog.id.desc())
        .limit(50000)
        .all()
    )

    global_strategy: dict = {s: {"rewards": [], "pulls": 0} for s in STRATEGY_IDS}
    for ep in all_episodes:
        sid = ep.strategy_selected
        if sid in global_strategy:
            global_strategy[sid]["pulls"] += 1
            if ep.reward_received is not None:
                global_strategy[sid]["rewards"].append(ep.reward_received)

    strategy_performance = []
    for sid in STRATEGY_IDS:
        rewards = global_strategy[sid]["rewards"]
        avg_r = sum(rewards) / len(rewards) if rewards else 0.0
        strategy_performance.append({
            "strategy_id": sid,
            "total_pulls": global_strategy[sid]["pulls"],
            "avg_reward": round(avg_r, 4),
            "win_rate": round(sum(1 for r in rewards if r > 0) / len(rewards), 4) if rewards else 0.0,
        })

    archetype_strategy: dict = defaultdict(lambda: defaultdict(list))
    for ep in all_episodes:
        sf = ep.state_features or {}
        arch = sf.get("archetype", "default")
        sid = ep.strategy_selected
        if ep.reward_received is not None:
            archetype_strategy[arch][sid].append(ep.reward_received)

    archetype_heatmap = {}
    for arch, strategies in archetype_strategy.items():
        archetype_heatmap[arch] = {
            sid: round(sum(v) / len(v), 4) for sid, v in strategies.items() if v
        }

    state_rewards: dict = defaultdict(list)
    state_features_map: dict = {}
    for ep in all_episodes:
        if ep.reward_received is not None:
            state_rewards[ep.state_hash].append(ep.reward_received)
            if ep.state_hash not in state_features_map and ep.state_features:
                f = ep.state_features
                state_features_map[ep.state_hash] = (
                    f"{f.get('cognitive_state','?')} {f.get('archetype','?')}, "
                    f"{f.get('p_mastery_bucket','?')}, {f.get('frustration_bucket','?')}"
                )

    hardest_states = sorted(
        [
            {
                "state": state_features_map.get(sh, sh),
                "avg_reward": round(sum(v) / len(v), 4),
                "interactions": len(v),
            }
            for sh, v in state_rewards.items() if len(v) >= 5
        ],
        key=lambda x: x["avg_reward"],
    )[:10]

    recommendations = []
    for sid in STRATEGY_IDS:
        rewards = global_strategy[sid]["rewards"]
        if len(rewards) >= 10:
            avg_r = sum(rewards) / len(rewards)
            if avg_r > 0.3:
                recommendations.append(f"{sid}: high effectiveness (avg={avg_r:.2f}) — use more")
            elif avg_r < -0.1:
                recommendations.append(f"{sid}: underperforming (avg={avg_r:.2f}) — review when used")

    total_students = db.query(models.BanditEpisodeLog.student_id).distinct().count()

    return {
        "strategy_performance": sorted(strategy_performance, key=lambda x: -x["avg_reward"]),
        "archetype_heatmap": archetype_heatmap,
        "hardest_states": hardest_states,
        "recommendations": recommendations,
        "platform_stats": {
            "total_students_with_rl": total_students,
            "total_strategy_selections": len(all_episodes),
        },
    }
