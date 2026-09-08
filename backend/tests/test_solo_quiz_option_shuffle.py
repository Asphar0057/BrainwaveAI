from services.quiz_options import shuffle_question_options


def test_shuffle_preserves_the_correct_answer_text(monkeypatch):
    monkeypatch.setattr("services.quiz_options.random.shuffle", lambda values: values.reverse())
    question = {
        "question": "Which one?",
        "options": ["Wrong 1", "Correct", "Wrong 2", "Wrong 3"],
        "correct_answer": "Correct",
    }

    shuffled = shuffle_question_options(question)

    assert shuffled["options"] == ["Wrong 3", "Wrong 2", "Correct", "Wrong 1"]
    assert shuffled["options"][shuffled["correct_answer"]] == "Correct"


def test_shuffle_rejects_a_missing_answer_instead_of_defaulting_to_a():
    question = {
        "question": "Malformed",
        "options": ["A value", "B value", "C value", "D value"],
        "correct_answer": "",
    }

    assert shuffle_question_options(question) is None
