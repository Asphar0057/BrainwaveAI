import json
import random
from typing import Optional


def _json_list(value) -> list:
    if isinstance(value, list):
        return value
    if not isinstance(value, str) or not value.strip():
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except (TypeError, ValueError):
        return []


def completion_seconds(answers) -> Optional[float]:
    answers = _json_list(answers)
    if not answers:
        return None
    values = []
    for answer in answers:
        if not isinstance(answer, dict):
            continue
        try:
            if answer.get("time_taken_ms") is not None:
                value = float(answer.get("time_taken_ms")) / 1000
            else:
                value = float(answer.get("time_taken"))
        except (TypeError, ValueError):
            continue
        if value >= 0:
            values.append(value)
    return max(values) if values else None


def winner_id_for_battle(battle) -> Optional[int]:
    if not battle.challenger_completed or not battle.opponent_completed:
        return None
    if battle.challenger_score != battle.opponent_score:
        return battle.challenger_id if battle.challenger_score > battle.opponent_score else battle.opponent_id
    if getattr(battle, "game_mode", "classic") != "speed":
        return None

    challenger_seconds = completion_seconds(battle.challenger_answers)
    opponent_seconds = completion_seconds(battle.opponent_answers)
    if challenger_seconds is None or opponent_seconds is None or challenger_seconds == opponent_seconds:
        return None
    return battle.challenger_id if challenger_seconds < opponent_seconds else battle.opponent_id


def prepare_generated_questions(questions_data, question_count: int, difficulty: str) -> list[dict]:
    if not isinstance(questions_data, list) or len(questions_data) < question_count:
        raise ValueError("AI returned fewer questions than requested")

    prepared = questions_data[:question_count]
    seen_question_texts = set()
    for question_data in prepared:
        if not isinstance(question_data, dict):
            raise ValueError("AI returned a question that is not an object")
        question_text = str(question_data.get("question") or "").strip()
        if not question_text:
            raise ValueError("AI returned a question without question text")
        normalized_question = " ".join(question_text.lower().split())
        if normalized_question in seen_question_texts:
            raise ValueError("AI returned duplicate questions")
        seen_question_texts.add(normalized_question)

        options = [str(option).strip() for option in _json_list(question_data.get("options")) if str(option).strip()]
        if len(options) != 4:
            raise ValueError("AI returned a question without exactly 4 options")
        if len({option.casefold() for option in options}) != 4:
            raise ValueError("AI returned duplicate answer options")
        try:
            correct_index = int(question_data["correct_answer"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("AI returned an invalid correct answer index")
        if correct_index not in range(4):
            raise ValueError("AI returned an invalid correct answer index")

        correct_answer_text = options[correct_index]
        declared_correct_text = str(question_data.get("correct_answer_text") or "").strip()
        if declared_correct_text.casefold() != correct_answer_text.casefold():
            raise ValueError("AI returned a contradictory correct answer key")
        explanation = str(question_data.get("explanation") or "").strip()
        if not explanation:
            raise ValueError("AI returned a question without an explanation")

        random.shuffle(options)
        question_data.update({
            "question": question_text,
            "options": options,
            "correct_answer": options.index(correct_answer_text),
            "correct_answer_text": correct_answer_text,
            "difficulty": difficulty,
            "explanation": explanation,
        })
    return prepared


def validate_and_score_answers(questions, answers, game_mode: str) -> tuple[int, list[dict]]:
    if not isinstance(answers, list):
        raise ValueError("answers must be a list")

    question_by_id = {question.id: question for question in questions}
    ordered_questions = list(questions)
    seen_ids = set()
    verified_answers = []
    score = 0
    sudden_death_ended = False

    for position, answer in enumerate(answers):
        if not isinstance(answer, dict):
            raise ValueError("each answer must be an object")
        submitted_question_id = answer.get("question_id")
        question = question_by_id.get(submitted_question_id)
        if submitted_question_id is None and position < len(ordered_questions):
            question = ordered_questions[position]
        if question is None or question.id in seen_ids:
            raise ValueError("answer references an invalid or duplicate question")
        if sudden_death_ended:
            raise ValueError("sudden death ends after the first incorrect answer")

        try:
            selected = int(answer.get("selected_answer"))
        except (TypeError, ValueError):
            selected = -1
        options = _json_list(question.options)
        if selected < -1 or selected >= len(options):
            raise ValueError("selected answer is outside the available options")

        is_correct = selected == question.correct_answer
        score += int(is_correct)
        seen_ids.add(question.id)
        verified = dict(answer)
        verified.update({
            "question_id": question.id,
            "question": question.question,
            "options": options,
            "correct_answer": question.correct_answer,
            "explanation": question.explanation or "",
            "selected_answer": selected,
            "is_correct": is_correct,
        })
        verified_answers.append(verified)
        sudden_death_ended = game_mode == "sudden_death" and not is_correct

    return score, verified_answers
