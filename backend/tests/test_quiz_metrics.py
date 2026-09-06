from services.quiz_metrics import quiz_percentage


def test_normalizes_different_quiz_lengths_before_averaging():
    values = [quiz_percentage({'score': 8, 'total': 10}), quiz_percentage({'score': 16, 'total': 20}), quiz_percentage({'percentage': 80})]
    assert values == [80, 80, 80]
    assert sum(values) / len(values) == 80


def test_zero_invalid_and_legacy_percentages():
    assert quiz_percentage({'percentage': 0, 'score': 9, 'total': 10}) == 0
    assert quiz_percentage({'score': 75}) == 75
    assert quiz_percentage({'score': 'invalid'}) == 0
    assert quiz_percentage({'percentage': float('nan')}) == 0
    assert quiz_percentage({'score': 400, 'total': 10}) == 100
