"""Normalize mixed historical quiz metadata to one display unit."""
def quiz_percentage(metadata):
    total = metadata.get("total", metadata.get("num_questions", metadata.get("total_questions", 0)))
    try:
        if metadata.get("percentage") is not None:
            value = float(metadata["percentage"])
        else:
            score = float(metadata.get("score", metadata.get("correct", 0)) or 0)
            value = score / float(total) * 100 if float(total or 0) > 0 else score
        import math
        return max(0.0, min(100.0, value)) if math.isfinite(value) else 0.0
    except (TypeError, ValueError, ZeroDivisionError):
        return 0.0
