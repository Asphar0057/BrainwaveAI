"""Archetype scoring from ProfileQuiz answers.

Kinetiq/Logicor/Flowist are the only archetypes with real backend behavior
wired to them (services/rl_strategy_agent.py's _rule_based_fallback,
services/ml_pipeline.py's STRATEGY_MAP/archetype_p_learn, routes/analytics.py's
archetype_p_learn). The extra archetype names in src/pages/ProfileNew.js's
ARCHETYPE_INFO (Synth, Dreamweaver, Anchor, Spark, Empathion, Seeker, Resonant)
are display-only with no backend logic anywhere, so scoring targets only these 3.

Mirrors dkt/style_bandit.py::derive_style_from_quiz's shape (same
ProfileQuiz.js learning_preferences payload, same "return None when there's
no real signal" contract) but scores a different axis: archetype is a
persisted, slow-changing learner classification (BKT p_learn priors, chat
strategy rule-fallback), while StyleBandit's derivation is a fast-changing
per-turn teaching-format cold start.
"""

from __future__ import annotations

from typing import Dict, Optional

ARCHETYPES = ["Logicor", "Flowist", "Kinetiq"]

ARCHETYPE_DESCRIPTIONS: Dict[str, str] = {
    "Logicor": "You excel at logical analysis and breaking down complex problems into manageable parts.",
    "Flowist": "You thrive through hands-on experiences and adapt easily to new challenges.",
    "Kinetiq": "You learn best through physical engagement and kinesthetic experiences.",
}

# A (structured/step-by-step) -> Logicor. B (example-driven/adaptive) -> Flowist.
# C/D (practical, relational, or performance-driven) -> Kinetiq, with partial
# credit to a neighboring archetype where an option blends traits.
_QUIZ_ARCHETYPE_WEIGHTS: Dict[str, Dict[str, Dict[str, float]]] = {
    "q1": {  # fastest way to understand something new
        "A": {"Logicor": 2.0},                  # step-by-step logic/definitions
        "B": {"Flowist": 2.0},                  # worked examples, infer the pattern
        "C": {"Logicor": 1.0, "Kinetiq": 1.0},  # diagrams/relationships
        "D": {"Kinetiq": 2.0},                  # real-world applications/case studies
    },
    "q3": {  # practice type with the biggest exam score jump
        "A": {"Logicor": 2.0},                  # topic-wise, one concept at a time
        "B": {"Flowist": 2.0},                  # mixed practice
        "C": {"Kinetiq": 2.0},                  # timed mocks under exam conditions
        "D": {"Logicor": 1.0, "Flowist": 1.0},  # error-focused drills
    },
    "q5": {  # how the learning path should be structured
        "A": {"Logicor": 2.0},                  # strict linear path
        "B": {"Flowist": 2.0},                  # adaptive path
        "C": {"Kinetiq": 2.0},                  # goal-based, jump to what's needed
        "D": {"Logicor": 1.0, "Flowist": 1.0},  # concept-map path
    },
}


def derive_archetype_from_quiz(learning_preferences: Optional[dict]) -> Optional[dict]:
    """Score ProfileQuiz's Q1/Q3/Q5 (multi-select) answers into the 3
    archetypes the backend actually branches on. Returns None when there
    isn't enough signal (e.g. nothing selected), so the caller leaves
    primary_archetype unset rather than fabricate a pick -- every consumer
    already treats a blank/missing archetype as "default".
    """
    if not learning_preferences:
        return None

    scores = {a: 0.0 for a in ARCHETYPES}
    for qid, option_weights in _QUIZ_ARCHETYPE_WEIGHTS.items():
        selected = learning_preferences.get(qid) or []
        if isinstance(selected, str):
            selected = [selected]
        for option in selected:
            for archetype, weight in option_weights.get(option, {}).items():
                scores[archetype] += weight

    ranked = sorted(ARCHETYPES, key=lambda a: (-scores[a], ARCHETYPES.index(a)))
    primary = ranked[0]
    if scores[primary] <= 0:
        return None

    secondary = ranked[1] if scores[ranked[1]] > 0 else ""

    return {
        "primary_archetype": primary,
        "secondary_archetype": secondary,
        "archetype_scores": scores,
        "archetype_description": ARCHETYPE_DESCRIPTIONS[primary],
    }
