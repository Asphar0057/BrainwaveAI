import asyncio
import json
import random
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy import and_
from sqlalchemy.orm import Session

import models
from database import get_db
from deps import get_current_user, call_ai, get_user_by_username, get_user_by_email, verify_token
from services.ai_json_parser import parse_json_array_response
from services.websocket_manager import manager, notify_battle_challenge, notify_battle_accepted, notify_battle_declined, notify_battle_started, notify_battle_completed

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["battles"])

QUESTION_GENERATION_LOCKS: dict[int, asyncio.Lock] = {}


def _build_question_from_answer_snapshot(answer: dict, index: int) -> Optional[dict]:
    if not isinstance(answer, dict):
        return None

    question_text = str(answer.get("question") or "").strip()
    options = answer.get("options")
    if isinstance(options, str):
        options = _safe_json_list(options)

    if not question_text or not isinstance(options, list) or not options:
        return None

    try:
        correct_answer = int(answer.get("correct_answer", 0))
    except (TypeError, ValueError):
        correct_answer = 0

    correct_answer = max(0, min(correct_answer, len(options) - 1))

    return {
        "id": answer.get("question_id") or index,
        "question": question_text,
        "options": [str(option) for option in options],
        "correct_answer": correct_answer,
        "explanation": str(answer.get("explanation") or ""),
    }


def _question_snapshots_from_answers(*answer_lists: list) -> list[dict]:
    snapshots = []
    seen_questions = set()

    for answers in answer_lists:
        if not isinstance(answers, list):
            continue

        for index, answer in enumerate(answers):
            snapshot = _build_question_from_answer_snapshot(answer, index)
            if not snapshot:
                continue

            key = (snapshot["question"], json.dumps(snapshot["options"], sort_keys=True))
            if key in seen_questions:
                continue
            seen_questions.add(key)
            snapshots.append(snapshot)

    return snapshots


def _safe_json_list(value) -> list:
    if isinstance(value, list):
        return value
    if not isinstance(value, str) or not value.strip():
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


@router.post("/create_quiz_battle")
async def create_quiz_battle(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        opponent_id = payload.get("opponent_id")
        subject = payload.get("subject")
        difficulty = payload.get("difficulty", "intermediate")
        question_count = payload.get("question_count", 10)
        time_limit = payload.get("time_limit_seconds", 300)

        if not opponent_id or not subject:
            raise HTTPException(status_code=400, detail="opponent_id and subject are required")

        friendship = db.query(models.Friendship).filter(
            and_(
                models.Friendship.user_id == current_user.id,
                models.Friendship.friend_id == opponent_id
            )
        ).first()

        if not friendship:
            raise HTTPException(status_code=400, detail="Can only battle with friends")

        battle = models.QuizBattle(
            challenger_id=current_user.id,
            opponent_id=opponent_id,
            subject=subject,
            difficulty=difficulty,
            question_count=question_count,
            time_limit_seconds=time_limit,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7)
        )

        db.add(battle)
        db.commit()
        db.refresh(battle)

        logger.info(f"Battle created: ID={battle.id}")

        battle_notification = models.Notification(
            user_id=opponent_id,
            title="Quiz Battle Challenge",
            message=f"{current_user.username} has challenged you to a quiz battle on {subject}!",
            notification_type="battle_challenge",
            is_read=False
        )
        db.add(battle_notification)
        db.commit()

        your_answers = []
        opponent_answers = []

        battle_data = {
            "id": battle.id,
            "subject": battle.subject,
            "difficulty": battle.difficulty,
            "question_count": battle.question_count,
            "time_limit_seconds": battle.time_limit_seconds,
            "challenger": {
                "id": current_user.id,
                "username": current_user.username,
                "first_name": current_user.first_name or "",
                "last_name": current_user.last_name or "",
                "picture_url": current_user.picture_url or ""
            },
            "is_challenger": False
        }

        notification_sent = await notify_battle_challenge(opponent_id, battle_data)

        if notification_sent:
            logger.info(f"Notification sent to opponent {opponent_id}")
        else:
            logger.warning(f"Opponent {opponent_id} not connected to WebSocket - notification not sent")

        logger.info(f"Active WebSocket connections: {list(manager.active_connections.keys())}")

        return {
            "status": "success",
            "battle_id": battle.id,
            "message": "Quiz battle created",
            "notification_sent": notification_sent,
            "opponent_connected": notification_sent
        }

    except Exception as e:
        logger.error(f"Error creating battle: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/quiz_battles")
async def get_quiz_battles(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
    status: str = Query("active", pattern="^(pending|active|completed|all)$")
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        query = db.query(models.QuizBattle).filter(
            (models.QuizBattle.challenger_id == current_user.id) |
            (models.QuizBattle.opponent_id == current_user.id)
        )

        if status != "all":
            query = query.filter(models.QuizBattle.status == status)

        battles = query.order_by(models.QuizBattle.created_at.desc()).all()

        result = []
        for battle in battles:
            is_challenger = battle.challenger_id == current_user.id
            opponent = battle.opponent if is_challenger else battle.challenger

            result.append({
                "id": battle.id,
                "opponent": {
                    "id": opponent.id,
                    "username": opponent.username,
                    "first_name": opponent.first_name or "",
                    "last_name": opponent.last_name or "",
                    "picture_url": opponent.picture_url or ""
                },
                "subject": battle.subject,
                "difficulty": battle.difficulty,
                "status": battle.status,
                "question_count": battle.question_count,
                "time_limit_seconds": battle.time_limit_seconds,
                "your_score": battle.challenger_score if is_challenger else battle.opponent_score,
                "opponent_score": battle.opponent_score if is_challenger else battle.challenger_score,
                "your_completed": battle.challenger_completed if is_challenger else battle.opponent_completed,
                "opponent_completed": battle.opponent_completed if is_challenger else battle.challenger_completed,
                "is_challenger": is_challenger,
                "created_at": battle.created_at.isoformat() + "Z",
                "expires_at": battle.expires_at.isoformat() + "Z" if battle.expires_at else None
            })

        return {"battles": result}

    except Exception as e:
        logger.error(f"Error fetching quiz battles: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/complete_quiz_battle")
async def complete_quiz_battle(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        battle_id = payload.get("battle_id")
        score = payload.get("score")
        answers = payload.get("answers", [])

        if not battle_id or score is None:
            raise HTTPException(status_code=400, detail="battle_id and score are required")

        battle = db.query(models.QuizBattle).filter(
            models.QuizBattle.id == battle_id
        ).first()

        if not battle:
            raise HTTPException(status_code=404, detail="Battle not found")

        if current_user.id not in (battle.challenger_id, battle.opponent_id):
            raise HTTPException(status_code=403, detail="You are not a participant in this battle")

        existing_question = db.query(models.BattleQuestion).filter(
            models.BattleQuestion.battle_id == battle_id
        ).first()

        if not existing_question:
            for snapshot in _question_snapshots_from_answers(answers):
                battle_question = models.BattleQuestion(
                    battle_id=battle_id,
                    question=snapshot["question"],
                    options=json.dumps(snapshot["options"]),
                    correct_answer=snapshot["correct_answer"],
                    explanation=snapshot.get("explanation", ""),
                )
                db.add(battle_question)

        is_challenger = battle.challenger_id == current_user.id
        if is_challenger:
            battle.challenger_score = score
            battle.challenger_completed = True
            battle.challenger_answers = json.dumps(answers)
        else:
            battle.opponent_score = score
            battle.opponent_completed = True
            battle.opponent_answers = json.dumps(answers)

        opponent_id = battle.opponent_id if is_challenger else battle.challenger_id

        is_tie = False
        winner_id = None
        if battle.challenger_completed and battle.opponent_completed:
            battle.status = "completed"
            battle.completed_at = datetime.now(timezone.utc)
            is_tie = battle.challenger_score == battle.opponent_score
            total_questions = battle.question_count or 10

            if is_tie:
                tie_percentage = round((battle.challenger_score / total_questions) * 100) if total_questions > 0 else 0
                for participant, opponent in (
                    (battle.challenger, battle.opponent),
                    (battle.opponent, battle.challenger),
                ):
                    db.add(models.Notification(
                        user_id=participant.id,
                        title="Battle Tied",
                        message=f"It's a tie against {opponent.username}! You both scored {battle.challenger_score}/{total_questions} ({tie_percentage}%).",
                        notification_type="battle_tied"
                    ))
            else:
                winner_id = battle.challenger_id if battle.challenger_score > battle.opponent_score else battle.opponent_id
                winner = battle.challenger if winner_id == battle.challenger_id else battle.opponent
                loser = battle.opponent if winner_id == battle.challenger_id else battle.challenger

                winner_score = battle.challenger_score if winner_id == battle.challenger_id else battle.opponent_score
                loser_score = battle.opponent_score if winner_id == battle.challenger_id else battle.challenger_score

                activity = models.FriendActivity(
                    user_id=winner_id,
                    activity_type="quiz_battle_won",
                    title="Won Quiz Battle!",
                    description=f"Defeated {loser.username} in {battle.subject}",
                    icon="Swords",
                    activity_data=json.dumps({
                        "winner_score": winner_score,
                        "loser_score": loser_score,
                        "subject": battle.subject
                    })
                )
                db.add(activity)

                winner_percentage = round((winner_score / total_questions) * 100) if total_questions > 0 else 0
                loser_percentage = round((loser_score / total_questions) * 100) if total_questions > 0 else 0

                winner_notification = models.Notification(
                    user_id=winner_id,
                    title="Battle Victory",
                    message=f"You won the quiz battle against {loser.username}! Score: {winner_score}/{total_questions} ({winner_percentage}%)",
                    notification_type="battle_won"
                )
                db.add(winner_notification)

                loser_notification = models.Notification(
                    user_id=loser.id,
                    title="Battle Complete",
                    message=f"Good effort! You scored {loser_score}/{total_questions} ({loser_percentage}%) against {winner.username}. Practice and challenge them again!",
                    notification_type="battle_lost"
                )
                db.add(loser_notification)
        elif battle.status == "pending":
            battle.status = "active"
            battle.started_at = datetime.now(timezone.utc)

        db.commit()

        await manager.send_personal_message({
            "type": "battle_opponent_completed",
            "battle_id": battle.id,
            "opponent_completed": True
        }, opponent_id)

        if battle.challenger_completed and battle.opponent_completed:
            await notify_battle_completed(
                [battle.challenger_id, battle.opponent_id],
                battle.id,
                winner_id
            )

        return {
            "status": "success",
            "battle_status": battle.status,
            "message": "Score submitted",
            "both_completed": battle.challenger_completed and battle.opponent_completed
        }

    except Exception as e:
        logger.error(f"Error completing quiz battle: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/create_challenge")
async def create_challenge(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        challenge = models.Challenge(
            creator_id=current_user.id,
            title=payload.get("title"),
            description=payload.get("description", ""),
            challenge_type=payload.get("challenge_type"),
            subject=payload.get("subject"),
            target_metric=payload.get("target_metric"),
            target_value=payload.get("target_value"),
            time_limit_minutes=payload.get("time_limit_minutes"),
            starts_at=datetime.now(timezone.utc),
            ends_at=datetime.now(timezone.utc) + timedelta(minutes=payload.get("time_limit_minutes", 60))
        )

        db.add(challenge)
        db.commit()

        return {
            "status": "success",
            "challenge_id": challenge.id
        }

    except Exception as e:
        logger.error(f"Error creating challenge: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/challenges")
async def get_challenges(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
    filter_type: str = Query("active", pattern="^(active|completed|my_challenges|all)$")
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        query = db.query(models.Challenge)

        if filter_type == "my_challenges":
            query = query.filter(models.Challenge.creator_id == current_user.id)
        elif filter_type != "all":
            query = query.filter(models.Challenge.status == filter_type)

        challenges = query.order_by(models.Challenge.created_at.desc()).all()

        result = []
        for challenge in challenges:
            participation = db.query(models.ChallengeParticipation).filter(
                and_(
                    models.ChallengeParticipation.challenge_id == challenge.id,
                    models.ChallengeParticipation.user_id == current_user.id
                )
            ).first()

            result.append({
                "id": challenge.id,
                "creator": {
                    "id": challenge.creator.id,
                    "username": challenge.creator.username,
                    "first_name": challenge.creator.first_name or "",
                    "last_name": challenge.creator.last_name or ""
                },
                "title": challenge.title,
                "description": challenge.description or "",
                "challenge_type": challenge.challenge_type,
                "subject": challenge.subject or "",
                "target_metric": challenge.target_metric,
                "target_value": challenge.target_value,
                "time_limit_minutes": challenge.time_limit_minutes,
                "status": challenge.status,
                "participant_count": challenge.participant_count,
                "is_participating": participation is not None,
                "user_progress": participation.progress if participation else 0,
                "user_completed": participation.completed if participation else False,
                "created_at": challenge.created_at.isoformat() + "Z",
                "ends_at": challenge.ends_at.isoformat() + "Z" if challenge.ends_at else None
            })

        return {"challenges": result}

    except Exception as e:
        logger.error(f"Error fetching challenges: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/join_challenge")
async def join_challenge(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        challenge_id = payload.get("challenge_id")
        if not challenge_id:
            raise HTTPException(status_code=400, detail="challenge_id is required")

        existing = db.query(models.ChallengeParticipation).filter(
            and_(
                models.ChallengeParticipation.challenge_id == challenge_id,
                models.ChallengeParticipation.user_id == current_user.id
            )
        ).first()

        if existing:
            raise HTTPException(status_code=400, detail="Already participating in this challenge")

        participation = models.ChallengeParticipation(
            challenge_id=challenge_id,
            user_id=current_user.id
        )

        db.add(participation)

        challenge = db.query(models.Challenge).filter(models.Challenge.id == challenge_id).first()
        if challenge:
            challenge.participant_count += 1
            if challenge.creator_id != current_user.id:
                join_notification = models.Notification(
                    user_id=challenge.creator_id,
                    title="Challenge Joined",
                    message=f"{current_user.username} joined your challenge '{challenge.title}'.",
                    notification_type="challenge_joined",
                    is_read=False
                )
                db.add(join_notification)

        db.commit()

        return {"status": "success", "message": "Joined challenge"}

    except Exception as e:
        logger.error(f"Error joining challenge: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/quiz_battle/{battle_id}")
async def get_quiz_battle_detail(
    battle_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        battle = db.query(models.QuizBattle).filter(
            models.QuizBattle.id == battle_id
        ).first()

        if not battle:
            raise HTTPException(status_code=404, detail="Battle not found")

        if battle.challenger_id != current_user.id and battle.opponent_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this battle")

        questions = db.query(models.BattleQuestion).filter(
            models.BattleQuestion.battle_id == battle_id
        ).all()

        question_list = []
        for q in questions:
            question_list.append({
                "id": q.id,
                "question": q.question,
                "options": _safe_json_list(q.options),
                "correct_answer": q.correct_answer,
                "explanation": q.explanation
            })

        is_challenger = battle.challenger_id == current_user.id

        try:
            opponent_id = battle.opponent_id if is_challenger else battle.challenger_id
            opponent = db.query(models.User).filter(models.User.id == opponent_id).first()
            if not opponent:
                raise HTTPException(status_code=404, detail="Opponent not found")
        except Exception as e:
            logger.error(f"Error getting opponent: {str(e)}")
            raise HTTPException(status_code=500, detail="Error loading battle opponent")

        your_answers = []
        opponent_answers = []

        battle_data = {
            "id": battle.id,
            "subject": battle.subject,
            "difficulty": battle.difficulty,
            "status": battle.status,
            "question_count": battle.question_count,
            "time_limit_seconds": battle.time_limit_seconds,
            "your_score": battle.challenger_score if is_challenger else battle.opponent_score,
            "opponent_score": battle.opponent_score if is_challenger else battle.challenger_score,
            "your_completed": battle.challenger_completed if is_challenger else battle.opponent_completed,
            "opponent_completed": battle.opponent_completed if is_challenger else battle.challenger_completed,
            "is_challenger": is_challenger,
            "opponent": {
                "id": opponent.id,
                "username": opponent.username,
                "first_name": opponent.first_name or "",
                "last_name": opponent.last_name or "",
                "picture_url": opponent.picture_url or ""
            }
        }

        if battle.challenger_completed and battle.opponent_completed:
            try:
                your_answers_raw = battle.challenger_answers if is_challenger else battle.opponent_answers
                opponent_answers_raw = battle.opponent_answers if is_challenger else battle.challenger_answers
                your_answers = json.loads(your_answers_raw) if your_answers_raw else []
                opponent_answers = json.loads(opponent_answers_raw) if opponent_answers_raw else []
                battle_data["your_answers"] = your_answers
                battle_data["opponent_answers"] = opponent_answers
            except Exception:
                pass

        if not question_list:
            question_list = _question_snapshots_from_answers(your_answers, opponent_answers)

        return {
            "battle": battle_data,
            "questions": question_list
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting battle detail: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/generate_battle_questions")
async def generate_battle_questions(
    payload: dict,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        battle_id = payload.get("battle_id")
        subject = payload.get("subject")
        difficulty = payload.get("difficulty", "intermediate")
        question_count = payload.get("question_count", 10)
        difficulty = {
            "easy": "beginner",
            "medium": "intermediate",
            "hard": "advanced",
        }.get(str(difficulty).lower(), str(difficulty).lower())
        try:
            question_count = max(1, min(int(question_count), 50))
        except (TypeError, ValueError):
            question_count = 10

        battle = db.query(models.QuizBattle).filter(
            models.QuizBattle.id == battle_id
        ).first()

        if not battle:
            raise HTTPException(status_code=404, detail="Battle not found")

        if battle.challenger_id != current_user.id and battle.opponent_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")

        lock_key = int(battle_id)
        generation_lock = QUESTION_GENERATION_LOCKS.setdefault(lock_key, asyncio.Lock())
        generation_lock_acquired = False
        await generation_lock.acquire()
        generation_lock_acquired = True

        existing = db.query(models.BattleQuestion).filter(
            models.BattleQuestion.battle_id == battle_id
        ).first()

        if existing:
            questions = db.query(models.BattleQuestion).filter(
                models.BattleQuestion.battle_id == battle_id
            ).all()

            generation_lock.release()
            generation_lock_acquired = False
            return {
                "questions": [{
                    "id": q.id,
                    "question": q.question,
                    "options": _safe_json_list(q.options),
                    "correct_answer": q.correct_answer,
                    "explanation": q.explanation
                } for q in questions]
            }

        difficulty_profiles = {
            "beginner": {
                "label": "BEGINNER / EASY",
                "description": (
                    "Ask direct recall and basic concept questions. Use familiar wording, "
                    "avoid obscure details, and make distractors clearly wrong to a learner "
                    "who understands the topic basics."
                ),
            },
            "intermediate": {
                "label": "INTERMEDIATE / MEDIUM",
                "description": (
                    "Ask applied understanding questions. Include cause-effect, chronology, "
                    "comparisons, and moderately plausible distractors that require more than "
                    "memorizing a single fact."
                ),
            },
            "advanced": {
                "label": "ADVANCED / HARD",
                "description": (
                    "Ask high-quality analytical questions. Require nuanced reasoning, "
                    "context, consequences, historiographical or conceptual distinctions, "
                    "and strong plausible distractors. Avoid simple one-fact recall."
                ),
            },
        }
        difficulty_profile = difficulty_profiles.get(difficulty, difficulty_profiles["intermediate"])

        prompt = f"""Generate exactly {question_count} multiple choice questions about {subject}.
Difficulty target: {difficulty_profile["label"]}.
Difficulty rules: {difficulty_profile["description"]}

Return ONLY a valid JSON array with this exact structure:
[
  {{
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": 0,
    "difficulty": "{difficulty}",
    "explanation": "Brief explanation of the correct answer"
  }}
]

Requirements:
- Each question must have exactly 4 options
- correct_answer must be 0, 1, 2, or 3 (index of the correct option)
- Every question MUST match the requested difficulty target: {difficulty_profile["label"]}
- Include "difficulty": "{difficulty}" on every question
- Questions should be clear and unambiguous
- Do not repeat the same question stem with slightly different options
- Distractors must be plausible, but exactly one option must be clearly correct
- Explanations should be concise (1-2 sentences)
- Make questions engaging and educational
- Return ONLY the JSON array, no additional text"""

        content = call_ai(prompt, max_tokens=4000, temperature=0.7)

        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        questions_data = parse_json_array_response(content)
        if not questions_data:
            raise ValueError("AI returned empty or invalid questions list")
        questions_data = questions_data[:question_count]

        for q_data in questions_data:
            question_text = str(q_data.get("question") or "").strip()
            if not question_text:
                raise ValueError("AI returned a question without question text")
            options = q_data.get("options") or []
            if isinstance(options, str):
                options = _safe_json_list(options)
            options = [str(option).strip() for option in options if str(option).strip()]
            if len(options) != 4:
                raise ValueError("AI returned a question without exactly 4 options")
            try:
                correct_index = int(q_data.get("correct_answer", 0))
            except (TypeError, ValueError):
                correct_index = 0
            correct_index = max(0, min(correct_index, len(options) - 1))
            correct_answer_text = options[correct_index]
            random.shuffle(options)
            new_correct_index = options.index(correct_answer_text)
            q_data["options"] = options
            q_data["correct_answer"] = new_correct_index
            q_data["difficulty"] = difficulty
            q_data["question"] = question_text

        saved_questions = []
        for q_data in questions_data:
            battle_question = models.BattleQuestion(
                battle_id=battle_id,
                question=str(q_data.get("question") or "").strip(),
                options=json.dumps(q_data["options"]),
                correct_answer=q_data["correct_answer"],
                explanation=q_data.get("explanation", "")
            )
            db.add(battle_question)
            db.flush()

            saved_questions.append({
                "id": battle_question.id,
                "question": battle_question.question,
                "options": q_data["options"],
                "correct_answer": battle_question.correct_answer,
                "explanation": battle_question.explanation
            })

        if battle.status == "pending":
            battle.status = "active"
            battle.started_at = datetime.now(timezone.utc)

        db.commit()

        generation_lock.release()
        generation_lock_acquired = False
        return {"questions": saved_questions}

    except json.JSONDecodeError as e:
        if locals().get("generation_lock_acquired"):
            generation_lock.release()
        logger.error(f"JSON decode error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except Exception as e:
        if locals().get("generation_lock_acquired"):
            generation_lock.release()
        db.rollback()
        logger.error(f"Error generating battle questions: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/challenge/{challenge_id}")
async def get_challenge_detail(
    challenge_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        challenge = db.query(models.Challenge).filter(
            models.Challenge.id == challenge_id
        ).first()

        if not challenge:
            raise HTTPException(status_code=404, detail="Challenge not found")

        participation = db.query(models.ChallengeParticipation).filter(
            and_(
                models.ChallengeParticipation.challenge_id == challenge_id,
                models.ChallengeParticipation.user_id == current_user.id
            )
        ).first()

        if not participation:
            raise HTTPException(status_code=403, detail="Not participating in this challenge")

        questions = db.query(models.ChallengeQuestion).filter(
            models.ChallengeQuestion.challenge_id == challenge_id
        ).all()

        question_list = []
        for q in questions:
            question_list.append({
                "id": q.id,
                "question": q.question,
                "options": _safe_json_list(q.options),
                "correct_answer": q.correct_answer,
                "explanation": q.explanation
            })

        return {
            "challenge": {
                "id": challenge.id,
                "title": challenge.title,
                "description": challenge.description,
                "challenge_type": challenge.challenge_type,
                "subject": challenge.subject,
                "target_metric": challenge.target_metric,
                "target_value": challenge.target_value,
                "time_limit_minutes": challenge.time_limit_minutes,
                "status": challenge.status,
                "progress": participation.progress,
                "completed": participation.completed
            },
            "questions": question_list
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting challenge detail: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/generate_challenge_questions")
async def generate_challenge_questions(
    payload: dict,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        challenge_id = payload.get("challenge_id")
        subject = payload.get("subject", "General Knowledge")
        challenge_type = payload.get("challenge_type", "speed")
        question_count = payload.get("question_count", 10)

        challenge = db.query(models.Challenge).filter(
            models.Challenge.id == challenge_id
        ).first()

        if not challenge:
            raise HTTPException(status_code=404, detail="Challenge not found")

        participation = db.query(models.ChallengeParticipation).filter(
            and_(
                models.ChallengeParticipation.challenge_id == challenge_id,
                models.ChallengeParticipation.user_id == current_user.id
            )
        ).first()

        if not participation:
            raise HTTPException(status_code=403, detail="Not participating in this challenge")

        existing = db.query(models.ChallengeQuestion).filter(
            models.ChallengeQuestion.challenge_id == challenge_id
        ).first()

        if existing:
            questions = db.query(models.ChallengeQuestion).filter(
                models.ChallengeQuestion.challenge_id == challenge_id
            ).all()

            return {
                "questions": [{
                    "id": q.id,
                    "question": q.question,
                    "options": _safe_json_list(q.options),
                    "correct_answer": q.correct_answer,
                    "explanation": q.explanation
                } for q in questions]
            }

        type_descriptions = {
            "speed": "fast-paced questions that can be answered quickly",
            "accuracy": "precise questions requiring careful consideration",
            "topic_mastery": "comprehensive questions testing deep understanding",
            "streak": "progressively challenging questions"
        }

        prompt = f"""Generate exactly {question_count} multiple choice questions about {subject}.
Challenge type: {challenge_type} - {type_descriptions.get(challenge_type, '')}.

Return ONLY a valid JSON array with this exact structure:
[
  {{
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": 0,
    "explanation": "Brief explanation of the correct answer"
  }}
]

Requirements:
- Each question must have exactly 4 options
- correct_answer must be 0, 1, 2, or 3 (index of the correct option)
- Questions should be clear and educational
- Explanations should be concise (1-2 sentences)
- Return ONLY the JSON array, no additional text"""

        content = call_ai(prompt, max_tokens=4000, temperature=0.7)

        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        questions_data = parse_json_array_response(content)
        if not questions_data:
            raise ValueError("AI returned empty or invalid questions list")

        for q_data in questions_data:
            options = q_data.get("options") or []
            if isinstance(options, str):
                options = _safe_json_list(options)
            options = [str(option).strip() for option in options if str(option).strip()]
            if len(options) != 4:
                raise ValueError("AI returned a challenge question without exactly 4 options")
            try:
                correct_index = int(q_data.get("correct_answer", 0))
            except (TypeError, ValueError):
                correct_index = 0
            correct_index = max(0, min(correct_index, len(options) - 1))
            correct_answer_text = options[correct_index]
            random.shuffle(options)
            new_correct_index = options.index(correct_answer_text)
            q_data["options"] = options
            q_data["correct_answer"] = new_correct_index

        saved_questions = []
        for q_data in questions_data:
            challenge_question = models.ChallengeQuestion(
                challenge_id=challenge_id,
                question=q_data["question"],
                options=json.dumps(q_data["options"]),
                correct_answer=q_data["correct_answer"],
                explanation=q_data.get("explanation", "")
            )
            db.add(challenge_question)
            db.flush()

            saved_questions.append({
                "id": challenge_question.id,
                "question": challenge_question.question,
                "options": q_data["options"],
                "correct_answer": challenge_question.correct_answer,
                "explanation": challenge_question.explanation
            })

        db.commit()

        return {"questions": saved_questions}

    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except Exception as e:
        db.rollback()
        logger.error(f"Error generating challenge questions: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/update_challenge_progress")
async def update_challenge_progress(
    payload: dict,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        challenge_id = payload.get("challenge_id")
        questions_answered = payload.get("questions_answered", 0)
        accuracy_percentage = payload.get("accuracy_percentage", 0)
        answers = payload.get("answers", [])

        challenge = db.query(models.Challenge).filter(
            models.Challenge.id == challenge_id
        ).first()

        if not challenge:
            raise HTTPException(status_code=404, detail="Challenge not found")

        participation = db.query(models.ChallengeParticipation).filter(
            and_(
                models.ChallengeParticipation.challenge_id == challenge_id,
                models.ChallengeParticipation.user_id == current_user.id
            )
        ).first()

        if not participation:
            raise HTTPException(status_code=404, detail="Participation not found")

        for answer_data in answers:
            battle_answer = models.ChallengeAnswer(
                challenge_id=challenge_id,
                user_id=current_user.id,
                question_id=answer_data["question_id"],
                selected_answer=answer_data["selected_answer"],
                is_correct=answer_data["is_correct"]
            )
            db.add(battle_answer)

        progress = 0
        score = questions_answered if challenge.target_metric == "questions_answered" else accuracy_percentage

        if challenge.target_metric == "questions_answered":
            progress = min((questions_answered / challenge.target_value) * 100, 100)
            participation.score = questions_answered
        elif challenge.target_metric == "accuracy_percentage":
            progress = min((accuracy_percentage / challenge.target_value) * 100, 100)
            participation.score = accuracy_percentage

        participation.progress = progress

        if progress >= 100:
            participation.completed = True
            participation.completed_at = datetime.now(timezone.utc)

            activity = models.FriendActivity(
                user_id=current_user.id,
                activity_type="challenge_completed",
                title=f"Completed Challenge: {challenge.title}",
                description=f"Achieved {progress:.1f}% progress",
                icon="trophy",
                activity_data=json.dumps({
                    "challenge_id": challenge.id,
                    "score": float(score),
                    "progress": float(progress)
                })
            )
            db.add(activity)

            notification = models.Notification(
                user_id=current_user.id,
                title="Challenge Completed",
                message=f"Congratulations! You've completed the challenge '{challenge.title}' with {progress:.0f}% progress!",
                notification_type="challenge_completed",
                is_read=False
            )
            db.add(notification)

            if challenge.creator_id != current_user.id:
                creator_notification = models.Notification(
                    user_id=challenge.creator_id,
                    title="Challenge Completed",
                    message=f"{current_user.username} completed your challenge '{challenge.title}'.",
                    notification_type="challenge_completed",
                    is_read=False
                )
                db.add(creator_notification)

        db.commit()

        return {
            "message": "Progress updated successfully",
            "progress": progress,
            "completed": participation.completed
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error updating challenge progress: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/accept_quiz_battle")
async def accept_quiz_battle(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        battle_id = payload.get("battle_id")
        if not battle_id:
            raise HTTPException(status_code=400, detail="battle_id is required")

        battle = db.query(models.QuizBattle).filter(
            models.QuizBattle.id == battle_id
        ).first()

        if not battle:
            raise HTTPException(status_code=404, detail="Battle not found")

        if battle.opponent_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")

        if battle.status != "pending":
            raise HTTPException(status_code=400, detail=f"Battle is {battle.status}")

        battle.status = "active"
        battle.started_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(battle)

        logger.info(f"Battle {battle_id} accepted by user {current_user.id}")

        challenger_name = battle.challenger.first_name or battle.challenger.username
        opponent_name = current_user.first_name or current_user.username

        notification = models.Notification(
            user_id=battle.challenger_id,
            title="Battle Accepted",
            message=f"{opponent_name} accepted your quiz battle challenge. It's on!",
            notification_type="battle_accepted",
            is_read=False
        )
        db.add(notification)

        start_notification = models.Notification(
            user_id=current_user.id,
            title="Battle Started",
            message=f"You're now in a live quiz battle against {challenger_name}. Good luck!",
            notification_type="battle_started",
            is_read=False
        )
        db.add(start_notification)
        db.commit()

        await notify_battle_accepted(battle.challenger_id, battle.id)
        await notify_battle_started([battle.challenger_id, battle.opponent_id], battle.id)

        return {
            "status": "success",
            "message": "Battle accepted!",
            "battle_id": battle.id,
            "redirect_to": f"/quiz-battle/{battle.id}"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting battle: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/decline_quiz_battle")
async def decline_quiz_battle(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        battle_id = payload.get("battle_id")
        if not battle_id:
            raise HTTPException(status_code=400, detail="battle_id is required")

        battle = db.query(models.QuizBattle).filter(
            models.QuizBattle.id == battle_id
        ).first()

        if not battle:
            raise HTTPException(status_code=404, detail="Battle not found")

        if battle.opponent_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")

        if battle.status != "pending":
            raise HTTPException(status_code=400, detail=f"Battle is {battle.status}")

        battle.status = "expired"
        battle.completed_at = datetime.now(timezone.utc)

        db.commit()

        logger.info(f"Battle {battle_id} declined by user {current_user.id}")

        opponent_name = f"{current_user.first_name} {current_user.last_name}" if current_user.first_name else current_user.username
        decline_notification = models.Notification(
            user_id=battle.challenger_id,
            title="Battle Declined",
            message=f"{opponent_name} declined your quiz battle challenge.",
            notification_type="battle_declined",
            is_read=False
        )
        db.add(decline_notification)
        db.commit()

        await notify_battle_declined(battle.challenger_id, battle.id, opponent_name)

        return {
            "status": "success",
            "message": "Battle declined",
            "battle_id": battle.id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error declining battle: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/submit_battle_answer")
async def submit_battle_answer(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        battle_id = payload.get("battle_id")
        question_index = payload.get("question_index")
        is_correct = payload.get("is_correct")

        if battle_id is None or question_index is None or is_correct is None:
            raise HTTPException(status_code=400, detail="Missing required fields")

        battle = db.query(models.QuizBattle).filter(
            models.QuizBattle.id == battle_id
        ).first()

        if not battle:
            raise HTTPException(status_code=404, detail="Battle not found")

        if current_user.id not in (battle.challenger_id, battle.opponent_id):
            raise HTTPException(status_code=403, detail="You are not a participant in this battle")

        is_challenger = battle.challenger_id == current_user.id
        opponent_id = battle.opponent_id if is_challenger else battle.challenger_id

        logger.info(f"Sending answer notification to opponent {opponent_id}: Battle {battle_id}, Q{question_index}, Correct: {is_correct}")
        logger.info(f"Active WebSocket connections: {list(manager.active_connections.keys())}")

        success = await manager.send_personal_message({
            "type": "battle_answer_submitted",
            "battle_id": battle_id,
            "question_index": question_index,
            "is_correct": is_correct,
            "is_opponent": True
        }, opponent_id)

        if success:
            logger.info(f"Answer notification delivered to opponent {opponent_id}")
        else:
            logger.warning(f"Failed to deliver notification - opponent {opponent_id} not connected")

        return {
            "status": "success",
            "message": "Answer submitted"
        }

    except Exception as e:
        logger.error(f"Error submitting answer: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
