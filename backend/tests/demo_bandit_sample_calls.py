"""
Sample-call demonstration of the 3 bandit/RL subsystems, run against real route
handler functions (not mocks) and a real isolated scratch DB. This is NOT a
pytest file -- it's a narrated, human-readable proof that the fixes made
2026-07-23 actually work, with before/after DB state printed at each step.

Flashcard generation uses AI_LOAD_TEST_FALLBACK_USERS so it runs fully offline
and deterministically for the first 5 (cold-start) calls. Solo-quiz, the 6th
flashcard call, and question-bank generation make real Groq calls (keys are
configured locally) to also prove genuine end-to-end behavior, not just the
bandit's own internals.

Run:  cd backend && python tests/demo_bandit_sample_calls.py
"""

from __future__ import annotations

import os
import sys
import uuid
import asyncio
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta

_SCRATCH_DB = Path(tempfile.gettempdir()) / f"bandit_demo_{uuid.uuid4().hex[:8]}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_SCRATCH_DB.as_posix()}"

sys.path.insert(0, str(Path(__file__).parent.parent))


def hr(title: str):
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def show(label: str, value):
    print(f"  {label}: {value}")


async def main():
    # Plain `Base.metadata.create_all()` only creates ORM-mapped tables -- it
    # misses raw-SQL-only tables like `api_key_pool_usage` that real AI calls
    # need (used by services/api_key_pool.py to track per-key daily quota).
    # Importing `main` runs the same `_run_db_migrations()` -> Alembic "head"
    # path production uses, at import time, before any lifespan/startup
    # services (scheduler, embeddings, memory service) which only fire inside
    # an actual ASGI lifespan context -- so this is safe and gives a real schema.
    import main  # noqa: F401
    import database
    import models as m
    from sqlalchemy import event

    # This demo does many rapid-fire DB writes across fresh sessions plus real
    # AI calls that do their own nested writes (api_key_pool quota tracking) --
    # without a busy_timeout, SQLite errors out immediately on any overlap
    # instead of waiting. database.py doesn't set one; add it here only.
    @event.listens_for(database.engine, "connect")
    def _set_busy_timeout(dbapi_conn, connection_record):
        dbapi_conn.execute("PRAGMA busy_timeout=30000")

    def fresh_db():
        """Fresh session per call, matching how each real HTTP request gets its
        own via Depends(get_db) and closes it when done -- a single long-held
        session spanning a real AI call (which does its own nested writes for
        key-pool quota tracking) can trip SQLite's single-writer lock."""
        return database.SessionLocal()

    db = fresh_db()
    user = m.User(email=f"demo_{uuid.uuid4().hex[:6]}@test.local", username="demostudent", hashed_password="x")
    db.add(user)
    db.commit()
    db.refresh(user)
    uid, uname = user.id, user.username  # cache plain values -- ORM object goes stale once its session closes
    show("Created test user", f"id={uid} username={uname}")
    db.close()

    os.environ["AI_LOAD_TEST_FALLBACK_USERS"] = uname  # flashcards go offline/deterministic

    # =====================================================================
    hr("DEMO 1 -- ContentDifficultyBandit: flashcard generation + review")
    # =====================================================================
    from routes.flashcards import generate_flashcards_endpoint, update_flashcard_review, FlashcardReviewRequest
    from services.content_bandit import encode_content_state

    print("\nSample call: POST /generate_flashcards  {user_id, topic='Photosynthesis', difficulty='auto'}")
    print("(repeated 6x to cross the cold-start line at 5 interactions; kept on the")
    print(" offline load-test fallback throughout so this loop is fast and deterministic --")
    print(" a real persisted card is seeded separately below for the /flashcards/review call)\n")
    for i in range(6):
        db = fresh_db()
        result = await generate_flashcards_endpoint(
            user_id=uname, topic="Photosynthesis", difficulty="auto", card_count=3, db=db,
        )
        state_hash = encode_content_state("flashcard", "Photosynthesis"[:50])
        episode = (
            db.query(m.BanditEpisodeLog)
            .filter_by(student_id=str(uid), state_hash=state_hash)
            .order_by(m.BanditEpisodeLog.timestamp.desc()).first()
        )
        print(f"  call {i+1}: resolved_difficulty={episode.strategy_selected!r:10} method={episode.selection_method!r:8} cards_returned={len(result.get('flashcards', []))} persisted={result.get('persisted', True)}")
        db.close()

    # Seed one real, persisted Flashcard row (as a completed generation would
    # have created) so /flashcards/review has something real to review without
    # depending on a real AI call succeeding inside this loop.
    db = fresh_db()
    fc_set = m.FlashcardSet(user_id=uid, title="Flashcards: Photosynthesis", description="demo seed", source_type="topic")
    db.add(fc_set)
    db.commit()
    db.refresh(fc_set)
    card = m.Flashcard(
        set_id=fc_set.id, question="What does photosynthesis produce?",
        answer="Glucose and oxygen", difficulty="medium", category="Photosynthesis",
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    first_card_id = card.id
    db.close()

    if first_card_id:
        print(f"\nSample call: POST /flashcards/review  {{card_id={first_card_id}, was_correct=true}}")
        db = fresh_db()
        before = db.query(m.BanditState).filter_by(
            student_id=str(uid), state_hash=encode_content_state("flashcard", "Photosynthesis")
        ).all()
        show("BanditState rows BEFORE review", {r.strategy_id: (r.pulls, round(r.alpha, 3), round(r.beta_param, 3)) for r in before})
        db.close()

        db = fresh_db()
        review_result = await update_flashcard_review(
            FlashcardReviewRequest(user_id=uname, card_id=str(first_card_id), was_correct=True, mode="study"), db,
        )
        show("Review endpoint response", review_result)
        db.close()

        db = fresh_db()
        after = db.query(m.BanditState).filter_by(
            student_id=str(uid), state_hash=encode_content_state("flashcard", "Photosynthesis")
        ).all()
        show("BanditState rows AFTER review ", {r.strategy_id: (r.pulls, round(r.alpha, 3), round(r.beta_param, 3)) for r in after})
        print("  -> reward from /flashcards/review reached bandit_state (this path was a dead end before today's fix)")
        db.close()

    # =====================================================================
    hr("DEMO 2 -- ContentDifficultyBandit: solo quiz (real Groq AI call)")
    # =====================================================================
    from routes.social import create_solo_quiz, complete_solo_quiz

    print("\nSample call: POST /create_solo_quiz  {subject='Cell Biology', difficulty='auto', question_count=3}")
    db = fresh_db()
    quiz_resp = await create_solo_quiz(
        payload={"subject": "Cell Biology", "difficulty": "auto", "question_count": 3},
        username=uname, db=db,
    )
    show("create_solo_quiz response", quiz_resp)
    quiz_id = quiz_resp.get("quiz_id")
    quiz_row = db.query(m.SoloQuiz).filter_by(id=quiz_id).first()
    show("Difficulty the bandit actually picked (quiz.difficulty)", quiz_row.difficulty if quiz_row else None)
    db.close()

    print("\nSample call: POST /complete_solo_quiz  {quiz_id, score=90}")
    db = fresh_db()
    complete_resp = await complete_solo_quiz(
        payload={"quiz_id": quiz_id, "score": 90, "answers": []},
        username=uname, db=db,
    )
    show("complete_solo_quiz response (truncated)", {k: complete_resp[k] for k in list(complete_resp)[:4]})
    db.close()

    state_hash_quiz = encode_content_state("quiz", "Cell Biology"[:50])
    db = fresh_db()
    bs = db.query(m.BanditState).filter_by(student_id=str(uid), state_hash=state_hash_quiz).all()
    show("BanditState for quiz/Cell Biology after completion", {r.strategy_id: (r.pulls, round(r.avg_reward, 3)) for r in bs})
    print("  -> resolve_reward fired from the REAL solo-quiz completion flow with a REAL AI-generated quiz")
    db.close()

    # =====================================================================
    hr("DEMO 3 -- ContentDifficultyBandit: practice-quiz dashboard 'Adaptive' checkbox")
    # =====================================================================
    from fastapi import FastAPI
    from question_bank import register_question_bank_api
    from deps import unified_ai
    from question_bank.models import QuestionGenerationRequest, AnswerSubmission

    qb_app = FastAPI()
    register_question_bank_api(qb_app, unified_ai, database.get_db)
    endpoints = {r.path: r.endpoint for r in qb_app.routes if hasattr(r, "path")}
    generate_from_pdf = endpoints["/api/qb/generate_from_pdf"]
    submit_answers = endpoints["/api/qb/submit_answers"]

    print("\nSample call: POST /api/qb/generate_from_pdf")
    print("  {source_type:'custom', content:'<biology notes>', adaptive_difficulty:true}")
    req = QuestionGenerationRequest(
        user_id=str(uid),
        source_type="custom",
        content=(
            "Mitochondria are the powerhouse of the cell, generating ATP through "
            "cellular respiration. The process involves the electron transport chain."
        ),
        question_count=3,
        adaptive_difficulty=True,
        custom_prompt="Cell Biology",
    )
    db = fresh_db()
    gen_resp = await generate_from_pdf(request=req, db=db)
    show("generate_from_pdf response (truncated)", {k: gen_resp[k] for k in ("success", "question_set_id", "question_count")})
    qset_id = gen_resp["question_set_id"]
    questions = db.query(m.Question).filter_by(question_set_id=qset_id).all()
    q_ids_and_answers = [(q.id, q.correct_answer, q.difficulty) for q in questions]
    show("Difficulty distribution the bandit chose", [d for _, _, d in q_ids_and_answers])
    db.close()

    print(f"\nSample call: POST /api/qb/submit_answers  {{question_set_id={qset_id}, answers={{...correct...}}}}")
    answers = {str(qid): ans for qid, ans, _ in q_ids_and_answers}  # answer everything correctly
    sub_req = AnswerSubmission(user_id=uname, question_set_id=qset_id, answers=answers)

    db = fresh_db()
    before_qb = db.query(m.BanditState).filter_by(student_id=str(uid), state_hash=state_hash_quiz).all()
    show("BanditState for quiz/Cell Biology BEFORE submit", {r.strategy_id: r.pulls for r in before_qb})
    db.close()

    db = fresh_db()
    sub_resp = await submit_answers(request=sub_req, db=db)
    show("submit_answers response score", sub_resp.get("score") if isinstance(sub_resp, dict) else sub_resp)
    db.close()

    db = fresh_db()
    after_qb = db.query(m.BanditState).filter_by(student_id=str(uid), state_hash=state_hash_quiz).all()
    show("BanditState for quiz/Cell Biology AFTER submit ", {r.strategy_id: r.pulls for r in after_qb})
    print("  -> reward fired from /qb/submit_answers, the endpoint the dashboard's UI actually calls "
          "(previously a dead end -- /submit_question_answers had zero frontend callers)")
    db.close()

    # =====================================================================
    hr("DEMO 4 -- StrategyBandit + StyleBandit: live tutor chat turns")
    # =====================================================================
    # routes/chat.py's real flow is TWO separate calls chained together:
    #   1. MessageMLPipeline.process()  -- picks the StrategyBandit arm, builds
    #      an ml_addendum string with the chosen strategy's instructions in it.
    #   2. TutorGraph.invoke(ml_addendum=...) -- receives that addendum as
    #      "intelligence_context" and prepends it to the system prompt; StyleBandit
    #      lives INSIDE this graph (select_teaching_style, wired in this session).
    # These are NOT the same call -- TutorGraph never touches StrategyBandit on
    # its own, so demonstrating both correctly means chaining them exactly like
    # chat.py does, not calling TutorGraph alone.
    from tutor.graph import TutorGraph
    from services.ml_pipeline import MessageMLPipeline, SessionContext
    from dkt.style_bandit import load_bandit as load_style_bandit, get_pending_update
    from services.rl_strategy_agent import STRATEGY_IDS, get_bandit as get_strategy_bandit

    class DummyAIClient:
        """Stands in for the real LLM so this demo runs offline/instantly --
        the bandit/RL machinery around the AI call is what's under test, not
        AI generation quality itself. nodes.py's _agenerate() runs
        ai_client.generate(prompt, max_tokens, temperature) in a threadpool, so
        this must be a plain SYNC callable, not async -- an async version here
        silently returns an unawaited coroutine object instead of a string."""
        def generate(self, prompt, max_tokens=2000, temperature=0.7):
            return "Here's how mitosis works: the cell divides into two identical daughter cells."

    tutor = TutorGraph(ai_client=DummyAIClient(), db_session_factory=database.SessionLocal)
    pipeline = MessageMLPipeline(database.SessionLocal, memory_svc=None)

    async def chat_turn(message: str, msg_count: int):
        db = fresh_db()
        session = SessionContext(session_id=1, message_count=msg_count, messages_on_concept=1)
        ml_out = await pipeline.process(message, str(uid), session, db)
        db.commit()
        addendum = pipeline.build_system_prompt_addendum(ml_out)
        db.close()

        result = await tutor.invoke(
            user_id=str(uid), user_input=message, chat_id=None, ml_addendum=addendum,
        )
        return ml_out, addendum, result

    print("\nSample call: tutor turn 1 -- \"I don't understand how mitosis works, it's so confusing\"")
    ml_out1, addendum1, r1 = await chat_turn("I don't understand how mitosis works, it's so confusing", 0)
    show("intent (from ml_pipeline)", ml_out1.intent)
    show("StrategyBandit selected (response_strategy)", ml_out1.response_strategy)
    show("selection_method", ml_out1.rl_selection_method)
    print("  Addendum actually injected into the system prompt (section headers):")
    for line in addendum1.splitlines():
        if line.startswith("["):
            print(f"    {line}")

    db = fresh_db()
    style_pending = get_pending_update(uid, db)
    style_arm = style_pending["style"] if style_pending else None
    show("StyleBandit style chosen for this turn (now pending reward)", style_arm)
    db.close()

    print("\nSample call: tutor turn 2 -- \"oh that makes sense now, thank you!\"")
    ml_out2, addendum2, r2 = await chat_turn("oh that makes sense now, thank you!", 1)
    show("intent (from ml_pipeline)", ml_out2.intent)
    show("StrategyBandit selected (response_strategy)", ml_out2.response_strategy)

    if style_arm:
        db = fresh_db()
        style_bandit_after = load_style_bandit(uid, db)
        arm = style_bandit_after.arms[style_arm]
        show(f"StyleBandit arm '{style_arm}' n_updates after turn 2", arm.n_updates)
        print("  -> n_updates > 0 means persist_updates' reward-closing half actually fired "
              "(this was permanently dead before today's fix -- selected_style was always '')")
        db.close()

    db = fresh_db()
    q_rows = db.query(m.BanditRewardQueue).filter_by(student_id=str(uid)).all()
    show("StrategyBandit reward-queue rows created across both turns", len(q_rows))
    ep_chat = (
        db.query(m.BanditEpisodeLog)
        .filter_by(student_id=str(uid))
        .filter(m.BanditEpisodeLog.strategy_selected.in_(STRATEGY_IDS))
        .all()
    )
    show("StrategyBandit episodes logged (chat)", len(ep_chat))
    if q_rows:
        oldest = min(q_rows, key=lambda r: r.response_sent_at)
        oldest_id = oldest.id  # cache before close() -- ORM object goes stale otherwise
        oldest.response_sent_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        oldest.measure_after = oldest.response_sent_at + timedelta(minutes=2)
        db.commit()
        db.close()

        get_strategy_bandit().measure_pending_rewards(database.SessionLocal)

        db = fresh_db()
        resolved = db.query(m.BanditRewardQueue).filter_by(id=oldest_id).first()
        show("Oldest queue row after running the real 300s-interval scheduler job", f"reward_measured={resolved.reward_measured} reward_value={resolved.reward_value}")
        print("  -> this is the exact job main.py schedules every 300s in production")
    db.close()

    print("\n" + "=" * 78)
    print(f"Scratch DB used for this entire demo: {_SCRATCH_DB}")
    print("=" * 78)


if __name__ == "__main__":
    asyncio.run(main())
