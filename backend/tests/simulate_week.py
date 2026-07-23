"""
Week-long simulation harness for the ML/RL system (StrategyBandit + BKT +
affect scoring via MessageMLPipeline, and ContentDifficultyBandit).

Goals (per user request 2026-07-23):
  1. Exercise the REAL production code paths (not mocks) across a realistic
     week of usage volume, on an isolated scratch DB.
  2. Measure whether the bandits actually learn anything at realistic usage
     volume (regret reduction, convergence, selection-method mix over time).
  3. Quantify the concrete difference between a "plain" API call and one with
     the full ML pipeline embedded: latency overhead + prompt content added.
  4. Surface structural issues that limit real-world learning (state-space
     sparsity, cold-start thresholds vs realistic per-user volume, reward
     resolution health).

This writes to an isolated scratch sqlite file -- NEVER the developer's real
brainwave_tutor.db. Output: a JSON results file + printed summary tables.

Run:  cd backend && python tests/simulate_week.py
"""

from __future__ import annotations

import os
import sys
import json
import time
import random
import uuid
import tempfile
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta

_SCRATCH_DIR = Path(tempfile.gettempdir()) / "brainwave_bandit_tests"
_SCRATCH_DIR.mkdir(exist_ok=True)
_SCRATCH_DB = _SCRATCH_DIR / f"week_sim_{uuid.uuid4().hex[:8]}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_SCRATCH_DB.as_posix()}"
os.environ.setdefault("STARTUP_EMBEDDINGS_ENABLED", "true")

sys.path.insert(0, str(Path(__file__).parent.parent))

import database  # noqa: E402
import models  # noqa: E402

database.Base.metadata.create_all(bind=database.engine)

from services.ml_pipeline import MessageMLPipeline, SessionContext, ModelRegistry  # noqa: E402
from services.rl_strategy_agent import STRATEGY_IDS  # noqa: E402
from services.content_bandit import get_content_bandit, is_auto_difficulty  # noqa: E402

random.seed(20260723)

print("Loading embedding model (ModelRegistry)...")
_t0 = time.time()
ModelRegistry.get().load()
print(f"  loaded in {time.time() - _t0:.1f}s\n")

# ---------------------------------------------------------------------------
# Synthetic population
# ---------------------------------------------------------------------------

ARCHETYPES = ["Kinetiq", "Logicor", "Flowist", "default"]
TOPICS = ["photosynthesis", "linear_algebra", "thermodynamics", "cell_biology", "calculus_limits"]

MESSAGE_BANK = {
    "confused": [
        "I don't get how this works at all",
        "this doesn't make sense to me, can you explain again",
        "I'm confused about what happens next in this process",
        "wait, why does that happen? I'm lost",
    ],
    "stuck": [
        "still not getting it, tried again and same result",
        "I keep failing this, same issue as before",
        "ok I tried what you said but I'm still stuck",
    ],
    "emotional": [
        "ugh this is so hard, I give up",
        "I'm so stressed about this exam I hate this topic",
        "this feels impossible, I'm never going to understand it",
    ],
    "question": [
        "what is the relationship between these two variables?",
        "why do we use this formula instead of the other one?",
        "can you walk me through this step by step?",
        "how does this connect to what we covered yesterday?",
    ],
    "exploration": [
        "what should I study next for this subject?",
        "can you give me an overview of this topic?",
        "where should I start with this chapter?",
    ],
    "confident": [
        "ok I think I understand now, let me try an example",
        "got it, that makes sense, what's next?",
        "nice, I solved it, can we try a harder one?",
    ],
}


class SyntheticStudent:
    def __init__(self, user_id: int, name: str, archetype: str, power_user: bool):
        self.user_id = user_id
        self.name = name
        self.archetype = archetype
        self.power_user = power_user
        # Hidden ground truth the bandit is trying to discover: this student
        # actually responds best to ONE particular strategy (higher continuation +
        # mastery gain when the bandit happens to pick it), mimicking a real
        # unobserved learning-style effect.
        self.true_best_strategy = random.choice(STRATEGY_IDS)
        # Hidden per-topic true accuracy-by-difficulty curve for content bandit.
        self.topic_true_accuracy = {}
        for topic in random.sample(TOPICS, k=3):
            # Some students genuinely do better at "hard" (ready to be pushed),
            # some do worse (need easier content) -- randomize per student so
            # the "does the bandit find the right difficulty" question is real.
            base = random.uniform(0.4, 0.7)
            skew = random.choice([-1, 0, 1])  # -1: easy is best, 1: hard is best
            self.topic_true_accuracy[topic] = {
                "easy": min(0.97, base + (0.25 if skew <= 0 else -0.05)),
                "medium": min(0.97, base),
                "hard": min(0.97, base + (0.25 if skew >= 1 else -0.15)),
            }
        self.session_msg_count = 0
        self.session_id = random.randint(100000, 999999)


def make_students(db, n_normal=8, n_power=2):
    students = []
    for i in range(n_normal + n_power):
        email = f"simstudent{i}_{uuid.uuid4().hex[:6]}@test.local"
        u = models.User(email=email, username=email.split("@")[0], hashed_password="x")
        db.add(u)
        db.flush()
        archetype = ARCHETYPES[i % len(ARCHETYPES)]
        if archetype != "default":
            db.add(models.ComprehensiveUserProfile(user_id=u.id, primary_archetype=archetype))
        students.append(SyntheticStudent(u.id, email, archetype, power_user=(i >= n_normal)))
    db.commit()
    return students


# ---------------------------------------------------------------------------
# Chat simulation (StrategyBandit + BKT + affect, via the REAL pipeline)
# ---------------------------------------------------------------------------

def pick_message(prev_reward_was_good: bool | None) -> tuple[str, str]:
    if prev_reward_was_good is None:
        bucket = random.choice(["confused", "question", "exploration"])
    elif prev_reward_was_good:
        bucket = random.choices(
            ["confident", "question", "confused"], weights=[0.5, 0.35, 0.15]
        )[0]
    else:
        bucket = random.choices(
            ["stuck", "emotional", "confused"], weights=[0.45, 0.25, 0.3]
        )[0]
    return random.choice(MESSAGE_BANK[bucket]), bucket


async def run_chat_turn(db, pipeline, student, sim_clock, latency_log):
    session = SessionContext(
        session_id=student.session_id,
        message_count=student.session_msg_count,
        current_concept_id=None,
        messages_on_concept=random.choice([1, 1, 2, 3, 4]),
        response_latency_s=random.uniform(2, 40),
    )
    prev = getattr(student, "_last_turn_good", None)
    message, intent_bucket = pick_message(prev)

    t0 = time.perf_counter()
    out = await pipeline.process(message, str(student.user_id), session, db)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # process() -> queue_reward_measurement() stamps response_sent_at using REAL
    # wall-clock datetime.now(), not our simulated `sim_clock`. Backdate that
    # queue row to sim_clock (same fix the unit test needed) so that when we
    # call measure_pending_rewards() moments later in REAL time, it treats the
    # simulated "2 minutes later" as already elapsed instead of waiting on an
    # actual future measure_after that's still ~2 real minutes away.
    if out.rl_episode_id:
        q_row = (
            db.query(models.BanditRewardQueue)
            .filter_by(student_id=str(student.user_id), state_hash=out.rl_state_hash)
            .order_by(models.BanditRewardQueue.response_sent_at.desc())
            .first()
        )
        if q_row is not None:
            q_row.response_sent_at = sim_clock
            q_row.measure_after = sim_clock + timedelta(minutes=2)
            db.commit()

    # "Plain" baseline: what an equivalent call WITHOUT the ML pipeline would
    # cost -- essentially zero backend compute (no BKT, no affect, no bandit,
    # no embedding call), just the raw system prompt with no addendum.
    plain_addendum = ""
    ml_addendum = pipeline.build_system_prompt_addendum(out)

    latency_log.append({
        "ms": round(elapsed_ms, 2),
        "ml_addendum_chars": len(ml_addendum),
        "ml_addendum_words": len(ml_addendum.split()),
        "plain_addendum_chars": len(plain_addendum),
        "strategy": out.response_strategy,
        "selection_method": out.rl_selection_method,
    })

    matched_hidden_best = out.response_strategy == student.true_best_strategy
    student._last_turn_good = matched_hidden_best

    ml_log = models.MessageMLLog(
        session_id=None,
        user_id=student.user_id,
        message_text=message[:500],
        timestamp=sim_clock,
        intent_class=out.intent,
        concept_ids=out.detected_concepts,
        frustration_score=out.frustration_score,
        engagement_score=out.engagement_score,
        cognitive_state=out.cognitive_state,
        archetype=out.archetype,
        response_strategy=out.response_strategy,
        kt_delta=out.kt_after,
        memories_used=out.memories_used,
        messages_this_session=student.session_msg_count + 1,
    )
    db.add(ml_log)
    db.commit()

    student.session_msg_count += 1

    # Simulate whether the student "continues" the conversation within the
    # bandit's 2-minute attribution window, and how their next real message
    # (if any) evolves, biased by whether we hit their hidden best strategy.
    continues = random.random() < (0.85 if matched_hidden_best else 0.45)
    gap = timedelta(seconds=random.uniform(20, 100)) if continues else timedelta(minutes=random.uniform(3, 30))

    return out, elapsed_ms, matched_hidden_best, continues, gap


async def simulate_chat_week(db, students, pipeline, base_clock, days=7, log=None):
    daily_stats = []
    latency_log = []
    for day in range(days):
        day_clock = base_clock + timedelta(days=day)
        method_counts = {}
        matched = 0
        total = 0
        for student in students:
            n_turns = random.randint(3, 7) if not student.power_user else random.randint(15, 25)
            t = day_clock + timedelta(hours=random.uniform(8, 21))
            for _ in range(n_turns):
                out, ms, good, continues, gap = await run_chat_turn(db, pipeline, student, t, latency_log)
                method_counts[out.rl_selection_method] = method_counts.get(out.rl_selection_method, 0) + 1
                matched += int(good)
                total += 1
                t = t + gap
                if not continues:
                    student.session_id = random.randint(100000, 999999)
                    student.session_msg_count = 0

        # Resolve today's queued rewards against the MessageMLLog rows we just
        # wrote (mirrors the real APScheduler job -- measure_after is already
        # in the past relative to *real* now, since sim_clock runs behind).
        get_content_bandit()  # no-op warmup
        from services.rl_strategy_agent import get_bandit
        get_bandit().measure_pending_rewards(database.SessionLocal)

        resolved = db.query(models.BanditEpisodeLog).filter(
            models.BanditEpisodeLog.reward_received.isnot(None)
        ).count()
        total_episodes = db.query(models.BanditEpisodeLog).count()

        daily_stats.append({
            "day": day + 1,
            "turns": total,
            "match_hidden_best_rate": round(matched / total, 3) if total else None,
            "selection_methods": method_counts,
            "episodes_resolved_cumulative": resolved,
            "episodes_total_cumulative": total_episodes,
        })
        if log:
            log(f"  day {day+1}: {total} turns, hidden-best match rate={matched/total:.2f}, "
                f"methods={method_counts}, resolved={resolved}/{total_episodes}")

    return daily_stats, latency_log


# ---------------------------------------------------------------------------
# Content-difficulty bandit simulation (flashcards/quiz)
# ---------------------------------------------------------------------------

def simulate_content_week(db, students, base_clock, days=7, log=None):
    bandit = get_content_bandit()
    daily_stats = []
    for day in range(days):
        method_counts = {}
        regret_samples = []
        for student in students:
            n_attempts = 1 if not student.power_user else random.randint(2, 4)
            for _ in range(n_attempts):
                topic = random.choice(list(student.topic_true_accuracy.keys()))
                domain = random.choice(["flashcard", "quiz"])
                sel = bandit.select_difficulty(db, str(student.user_id), domain, topic)
                method_counts[sel.selection_method] = method_counts.get(sel.selection_method, 0) + 1

                true_acc_by_diff = student.topic_true_accuracy[topic]
                chosen_true_acc = true_acc_by_diff[sel.difficulty]
                best_possible_acc = max(true_acc_by_diff.values())
                regret_samples.append(best_possible_acc - chosen_true_acc)

                observed_correct = random.random() < chosen_true_acc
                accuracy = 1.0 if observed_correct else random.uniform(0.0, 0.4)
                bandit.resolve_reward(
                    db,
                    str(student.user_id),
                    domain,
                    topic,
                    accuracy,
                    episode_id=sel.episode_id,
                )

        db.commit()
        daily_stats.append({
            "day": day + 1,
            "selection_methods": method_counts,
            "avg_regret": round(sum(regret_samples) / len(regret_samples), 4) if regret_samples else None,
        })
        if log:
            log(f"  day {day+1}: methods={method_counts}, avg_regret={daily_stats[-1]['avg_regret']}")
    return daily_stats


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    db = database.SessionLocal()
    students = make_students(db)
    pipeline = MessageMLPipeline(database.SessionLocal, memory_svc=None)

    base_clock = datetime.now(timezone.utc) - timedelta(days=9)

    print("=" * 70)
    print("CHAT / STRATEGY-BANDIT SIMULATION (7 simulated days)")
    print("=" * 70)
    chat_daily, latency_log = await simulate_chat_week(db, students, pipeline, base_clock, log=print)

    print()
    print("=" * 70)
    print("CONTENT-DIFFICULTY-BANDIT SIMULATION (7 simulated days)")
    print("=" * 70)
    content_daily = simulate_content_week(db, students, base_clock, log=print)

    # --- state-space sparsity check -----------------------------------
    print()
    print("=" * 70)
    print("STATE-SPACE SPARSITY (chat)")
    print("=" * 70)
    sparsity = []
    for student in students:
        rows = (
            db.query(models.BanditEpisodeLog.state_hash)
            .filter_by(student_id=str(student.user_id))
            .all()
        )
        total_pulls = len(rows)
        unique_states = len(set(r[0] for r in rows))
        avg_pulls_per_state = round(total_pulls / unique_states, 2) if unique_states else 0
        sparsity.append({
            "student": student.name,
            "power_user": student.power_user,
            "total_interactions": total_pulls,
            "unique_state_hashes": unique_states,
            "avg_pulls_per_exact_state": avg_pulls_per_state,
        })
        print(f"  {student.name[:24]:24s} power_user={student.power_user!s:5s} "
              f"total={total_pulls:4d} unique_states={unique_states:4d} "
              f"avg_pulls/state={avg_pulls_per_state}")

    # --- latency / "plain vs ML-embedded" comparison --------------------
    print()
    print("=" * 70)
    print("PLAIN API CALL vs ML-EMBEDDED CALL")
    print("=" * 70)
    ms_values = [x["ms"] for x in latency_log]
    words_added = [x["ml_addendum_words"] for x in latency_log]
    chars_added = [x["ml_addendum_chars"] for x in latency_log]
    ms_values.sort()

    def pct(vals, p):
        idx = min(len(vals) - 1, int(len(vals) * p))
        return vals[idx]

    comparison = {
        "n_samples": len(ms_values),
        "pipeline_overhead_ms": {
            "p50": round(pct(ms_values, 0.50), 2),
            "p90": round(pct(ms_values, 0.90), 2),
            "p99": round(pct(ms_values, 0.99), 2),
            "max": round(max(ms_values), 2),
        },
        "system_prompt_addendum": {
            "plain_call_words": 0,
            "ml_embedded_avg_words": round(sum(words_added) / len(words_added), 1),
            "ml_embedded_avg_chars": round(sum(chars_added) / len(chars_added), 1),
        },
        "note": (
            "pipeline_overhead_ms is backend compute added BEFORE the LLM call even "
            "starts (intent+concept embedding, BKT update, affect scoring, Thompson "
            "sampling, memory retrieval, 2x DB commits). It does NOT include the LLM "
            "generation call itself. The system-prompt addendum adds "
            f"~{round(sum(words_added)/len(words_added))} words / "
            f"~{round(sum(chars_added)/len(chars_added))} chars to EVERY chat request "
            "sent to the LLM, which the LLM must additionally process and pay for on "
            "every single turn regardless of whether the strategy/mastery info changes "
            "the reply."
        ),
    }
    print(f"  pipeline overhead:  p50={comparison['pipeline_overhead_ms']['p50']}ms  "
          f"p90={comparison['pipeline_overhead_ms']['p90']}ms  "
          f"p99={comparison['pipeline_overhead_ms']['p99']}ms  "
          f"max={comparison['pipeline_overhead_ms']['max']}ms")
    print(f"  system prompt addendum: plain=0 words vs ML-embedded="
          f"{comparison['system_prompt_addendum']['ml_embedded_avg_words']} words/call "
          f"({comparison['system_prompt_addendum']['ml_embedded_avg_chars']} chars/call)")

    results = {
        "scratch_db": str(_SCRATCH_DB),
        "students": [{"name": s.name, "archetype": s.archetype, "power_user": s.power_user,
                      "true_best_strategy": s.true_best_strategy} for s in students],
        "chat_daily": chat_daily,
        "content_daily": content_daily,
        "state_space_sparsity": sparsity,
        "latency_comparison": comparison,
    }
    out_path = Path(__file__).parent / "simulate_week_results.json"
    out_path.write_text(json.dumps(results, indent=2, default=str))
    print(f"\nFull results written to {out_path}")

    db.close()


if __name__ == "__main__":
    asyncio.run(main())
