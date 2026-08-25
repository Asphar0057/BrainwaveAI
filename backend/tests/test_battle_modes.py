import json
import unittest
from types import SimpleNamespace

from services.battle_rules import prepare_generated_questions, validate_and_score_answers, winner_id_for_battle


def _question(question_id, correct=1):
    return SimpleNamespace(
        id=question_id,
        question=f"Question {question_id}",
        options=json.dumps(["Alpha", "Beta", "Gamma", "Delta"]),
        correct_answer=correct,
        explanation="Beta is correct.",
    )


def _answer(question_id, selected, elapsed):
    return {
        "question_id": question_id,
        "selected_answer": selected,
        "time_taken": elapsed,
        "is_correct": not selected,
        "correct_answer": 0,
    }


class BattleModeRulesTest(unittest.TestCase):
    def test_server_recomputes_scores_for_every_mode(self):
        for mode in ("classic", "speed", "blitz", "sudden_death"):
            with self.subTest(mode=mode):
                score, verified = validate_and_score_answers(
                    [_question(10), _question(11, correct=2)],
                    [_answer(10, 1, 4), _answer(11, 2, 9)],
                    mode,
                )
                self.assertEqual(score, 2)
                self.assertEqual([answer["is_correct"] for answer in verified], [True, True])
                self.assertEqual([answer["correct_answer"] for answer in verified], [1, 2])

    def test_sudden_death_rejects_answers_after_first_miss(self):
        with self.assertRaisesRegex(ValueError, "ends after"):
            validate_and_score_answers(
            [_question(1), _question(2)],
            [_answer(1, 0, 3), _answer(2, 1, 5)],
            "sudden_death",
        )

    def test_duplicate_question_answers_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "invalid or duplicate"):
            validate_and_score_answers(
                [_question(1), _question(2)],
                [_answer(1, 1, 2), _answer(1, 1, 4)],
                "classic",
            )

    def test_unknown_question_id_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "invalid or duplicate"):
            validate_and_score_answers([_question(1)], [_answer(999, 1, 2)], "classic")

    def test_generation_rejects_a_contradictory_answer_key(self):
        generated = [{
            "question": "Which value equals two plus two?",
            "options": ["Three", "Four", "Five", "Six"],
            "correct_answer": 0,
            "correct_answer_text": "Four",
            "explanation": "Two plus two equals four.",
        }]
        with self.assertRaisesRegex(ValueError, "contradictory"):
            prepare_generated_questions(generated, 1, "beginner")

    def test_generation_keeps_the_correct_key_after_shuffling(self):
        generated = [{
            "question": "Which value equals two plus two?",
            "options": ["Three", "Four", "Five", "Six"],
            "correct_answer": 1,
            "correct_answer_text": "Four",
            "explanation": "Two plus two equals four.",
        }]
        prepared = prepare_generated_questions(generated, 1, "beginner")
        self.assertEqual(prepared[0]["options"][prepared[0]["correct_answer"]], "Four")

    def test_speed_tie_is_won_by_faster_completion(self):
        battle = SimpleNamespace(
            challenger_id=1, opponent_id=2, challenger_score=4, opponent_score=4,
            challenger_completed=True, opponent_completed=True,
            challenger_answers=json.dumps([_answer(1, 1, 18)]),
            opponent_answers=json.dumps([_answer(1, 1, 27)]), game_mode="speed",
        )
        self.assertEqual(winner_id_for_battle(battle), 1)

    def test_equal_classic_scores_remain_a_draw(self):
        battle = SimpleNamespace(
            challenger_id=1, opponent_id=2, challenger_score=4, opponent_score=4,
            challenger_completed=True, opponent_completed=True,
            challenger_answers="[]", opponent_answers="[]", game_mode="classic",
        )
        self.assertIsNone(winner_id_for_battle(battle))


if __name__ == "__main__":
    unittest.main()
