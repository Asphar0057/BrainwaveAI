from services.answer_validation import (
    answers_equivalent,
    canonical_answer,
    sanitize_generated_questions,
)


def test_equivalent_math_answers_ignore_display_only_differences():
    assert answers_equivalent(r"\\(5 \\text{ m/s}^2\\)", "5 m/s²")
    assert canonical_answer("C) 5 m/s²") == canonical_answer("5 m/s^2")


def test_multiple_choice_letter_resolves_to_the_option_text():
    options = ["1 m/s²", "3 m/s²", "5 m/s²", "7 m/s²"]
    assert answers_equivalent("C", "5 m/s²", options)


def test_generated_questions_require_four_options_and_a_matching_answer():
    questions = [
        {
            "question_text": "What is 2 + 2?",
            "question_type": "multiple_choice",
            "options": ["2", "3", "4", "5"],
            "correct_answer": "C",
            "difficulty": "hard",
        },
        {
            "question_text": "Invalid question",
            "question_type": "multiple_choice",
            "options": ["1", "2", "3", "4"],
            "correct_answer": "9",
        },
    ]

    sanitized = sanitize_generated_questions(questions, question_count=4, difficulty="easy")

    assert len(sanitized) == 1
    assert sanitized[0]["correct_answer"] == "4"
    assert sanitized[0]["difficulty"] == "easy"


def test_math_processing_cannot_corrupt_question_type_enum():
    questions = [{
        "question_text": "Which law describes inertia?",
        "question_type": "$multiple_choice$",
        "options": ["First", "Second", "Third", "Zeroth"],
        "correct_answer": "First",
    }]

    sanitized = sanitize_generated_questions(questions, question_count=1, difficulty="easy")

    assert sanitized[0]["question_type"] == "multiple_choice"
