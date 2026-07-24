
from __future__ import annotations

import json
import logging
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)

STYLES = [
    "Exemplar",
    "Cadence",
    "Bridge",
    "Axiom",
    "Catalyst",
    "Forge",
]

# Legacy generic names this bandit used before styles were given unique
# names. Old StudentStyleModel.bandit_state rows persisted under these keys
# are translated in StyleBandit.from_json so already-trained per-student
# weights aren't silently discarded on this rename.
_LEGACY_STYLE_ALIASES: dict[str, str] = {
    "example_first":   "Exemplar",
    "step_by_step":    "Cadence",
    "analogy":         "Bridge",
    "conceptual":      "Axiom",
    "socratic":        "Catalyst",
    "problem_solving": "Forge",
}

N_FEATURES = 12
ALPHA      = 1.0
MC_SAMPLES = 30
_HIDDEN    = 32

STYLE_INSTRUCTIONS: dict[str, str] = {
    "Exemplar": (
        "TEACHING FORMAT — EXAMPLES FIRST:\n"
        "• Open with exactly 2 concrete, real-world examples before any theory.\n"
        "• Make examples specific and tangible — numbers, names, scenarios.\n"
        "• After both examples, explain the underlying principle in one paragraph.\n"
        "• Show explicitly how each example maps to the theory.\n"
        "DO NOT open with a definition or abstract statement."
    ),
    "Cadence": (
        "TEACHING FORMAT — STEP BY STEP:\n"
        "• Structure your entire response as exactly 3–5 numbered steps.\n"
        "• Each step = one sentence maximum.\n"
        "• No paragraphs between steps.\n"
        "• End with a single bold 'Key point:' line.\n"
        "DO NOT use prose paragraphs."
    ),
    "Bridge": (
        "TEACHING FORMAT — ANALOGY FIRST:\n"
        "• Open with one vivid, real-world analogy the student can immediately picture.\n"
        "• Explicitly map each component of the analogy to the technical concept.\n"
        "• Then state the formal principle.\n"
        "• Close by noting where the analogy breaks down (honesty builds trust).\n"
        "DO NOT skip the explicit analogy-to-concept mapping."
    ),
    "Axiom": (
        "TEACHING FORMAT — CONCEPTUAL:\n"
        "• State the formal definition in one precise sentence.\n"
        "• Explain the intuition behind it in plain language.\n"
        "• State why it matters and what it lets us do.\n"
        "• Skip examples unless clarity absolutely requires one.\n"
        "DO NOT pad with examples or analogies."
    ),
    "Catalyst": (
        "TEACHING FORMAT — SOCRATIC:\n"
        "• Do NOT give the answer directly.\n"
        "• Ask 1–2 guiding questions that scaffold toward the answer.\n"
        "• After each question, wait — indicate you want their response.\n"
        "• When they respond, build on their answer rather than replacing it.\n"
        "DO NOT state the conclusion for them."
    ),
    "Forge": (
        "TEACHING FORMAT — PROBLEM SOLVING:\n"
        "• Present one concrete, worked problem directly related to the concept.\n"
        "• Walk through the solution step by step, narrating each decision.\n"
        "• Highlight the key insight at the moment it appears.\n"
        "• End with: 'Now try this simpler variation: [variant problem]'\n"
        "DO NOT explain theory before the problem."
    ),
}

class _NeuralArm(nn.Module):

    def __init__(self, d_in: int = N_FEATURES, hidden: int = _HIDDEN, dropout: float = 0.2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_in, hidden),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden, hidden // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden // 2, 1),
        )
        nn.init.xavier_uniform_(self.net[0].weight)
        nn.init.xavier_uniform_(self.net[3].weight)
        # Small non-zero output weights keep fresh arms near the same prior mean
        # while allowing MC-dropout to express uncertainty from the first turn.
        nn.init.normal_(self.net[6].weight, mean=0.0, std=0.05)
        nn.init.zeros_(self.net[6].bias)
        self.optimizer = torch.optim.Adam(self.parameters(), lr=5e-3)
        self.n_updates = 0

    def score(self, x: np.ndarray, alpha: float = ALPHA) -> float:
        xt = torch.FloatTensor(x).unsqueeze(0)
        self.train()
        with torch.no_grad():
            preds = torch.cat([self.net(xt) for _ in range(MC_SAMPLES)], dim=0)
        mu  = float(preds.mean())
        std = float(preds.std())
        return mu + alpha * std

    def update(self, x: np.ndarray, reward: float):
        xt = torch.FloatTensor(x).unsqueeze(0)
        rt = torch.tensor([[reward]], dtype=torch.float32)
        self.train()
        self.optimizer.zero_grad()
        F.mse_loss(self.net(xt), rt).backward()
        self.optimizer.step()
        self.n_updates += 1

    def to_dict(self) -> dict:
        return {
            "type":  "neural",
            "state": {k: v.tolist() for k, v in self.state_dict().items()},
            "n":     self.n_updates,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "_NeuralArm":
        arm = cls()
        if d.get("state"):
            state = {k: torch.tensor(v) for k, v in d["state"].items()}
            arm.load_state_dict(state)
        arm.n_updates = d.get("n", 0)
        return arm

class StyleBandit:
    def __init__(self, alpha: float = ALPHA):
        self.alpha = alpha
        self.arms: dict[str, _NeuralArm] = {s: _NeuralArm() for s in STYLES}

    def select(
        self,
        context: np.ndarray,
        forced: Optional[str] = None,
    ) -> tuple[str, dict[str, float]]:
        scores = {s: arm.score(context, self.alpha) for s, arm in self.arms.items()}
        if forced and forced in self.arms:
            return forced, scores
        return max(scores, key=scores.__getitem__), scores

    def update(self, style: str, context: np.ndarray, reward: float):
        if style in self.arms:
            self.arms[style].update(context, reward)
            logger.info(f"[BANDIT] updated arm={style!r} reward={reward:+.3f} n={self.arms[style].n_updates}")

    def to_json(self) -> str:
        return json.dumps({s: arm.to_dict() for s, arm in self.arms.items()})

    @classmethod
    def from_json(cls, payload: str, alpha: float = ALPHA) -> "StyleBandit":
        bandit = cls(alpha=alpha)
        data   = json.loads(payload)
        for raw_style, arm_data in data.items():
            style = _LEGACY_STYLE_ALIASES.get(raw_style, raw_style)
            if style not in bandit.arms:
                continue
            if arm_data.get("type") != "neural":
                logger.info(f"[BANDIT] Old LinUCB state for arm={style!r} discarded — using fresh NeuralArm.")
                continue
            try:
                bandit.arms[style] = _NeuralArm.from_dict(arm_data)
            except Exception as e:
                logger.warning(f"[BANDIT] Failed to load arm={style!r}: {e} — using fresh arm.")
        return bandit

def build_context(
    difficulty_level:  str,
    recent_signals:    list[float],
    session_gap_days:  Optional[float],
    n_interactions:    int,
    concept_mastery:   float = 0.5,
    mastery_dict:      Optional[dict[str, float]] = None,
    n_decayed:         int   = 0,
) -> np.ndarray:
    diff_map   = {"easy": 0.0, "beginner": 0.0, "intermediate": 0.5, "hard": 1.0, "advanced": 1.0}
    difficulty = diff_map.get((difficulty_level or "intermediate").lower(), 0.5)

    last5          = recent_signals[-5:] if recent_signals else []
    recent_avg     = float(np.mean(last5)) if last5 else 0.0

    last10         = recent_signals[-10:] if recent_signals else []
    confusion_rate = sum(1 for s in last10 if s < 0) / max(len(last10), 1)

    gap_norm       = min((session_gap_days or 0.0) / 30.0, 1.0)
    count_norm     = min(n_interactions / 100.0, 1.0)

    if mastery_dict and len(mastery_dict) > 0:
        vals           = list(mastery_dict.values())
        mastery_mean   = float(np.mean(vals))
        mastery_std    = float(np.std(vals))
        top_weak_m     = float(np.min(vals))
        top_strong_m   = float(np.max(vals))
    else:
        mastery_mean   = float(np.clip(concept_mastery, 0.0, 1.0))
        mastery_std    = 0.1
        top_weak_m     = max(0.0, mastery_mean - 0.2)
        top_strong_m   = min(1.0, mastery_mean + 0.2)

    n_decayed_norm = min(n_decayed / 10.0, 1.0)

    last_sig       = recent_signals[-1] if recent_signals else 0.0
    recent_trend   = float(np.clip(last_sig - recent_avg, -1.0, 1.0))

    return np.array([
        difficulty,
        recent_avg,
        confusion_rate,
        gap_norm,
        count_norm,
        mastery_mean,
        mastery_std,
        top_weak_m,
        top_strong_m,
        n_decayed_norm,
        recent_trend,
        1.0,
    ], dtype=np.float64)

# ProfileQuiz.js's Q1 ("which approach helps you understand fastest") and Q4
# ("what feedback style helps you improve quickest") are the two questions
# whose options map onto teaching format, not just subject/goal metadata.
# Weights are heuristic (the quiz predates StyleBandit's 6 arms), so this is
# a cold-start prior, not a claim of measured correlation.
_QUIZ_STYLE_WEIGHTS: dict[str, dict[str, dict[str, float]]] = {
    "q1": {
        "A": {"Cadence": 2.0},                       # step-by-step logic/definitions
        "B": {"Exemplar": 2.0, "Forge": 1.0},        # worked examples, infer the rule
        "C": {"Axiom": 2.0},                         # diagrams/relationships
        "D": {"Forge": 2.0, "Bridge": 1.0},          # real-world applications/case studies
    },
    "q4": {
        "A": {"Cadence": 1.0},                       # exact step + corrected steps
        "B": {"Catalyst": 2.0},                      # hints that guide without revealing
        "C": {"Axiom": 1.0, "Catalyst": 1.0},         # "why this works" + follow-up
        "D": {"Cadence": 1.0},                       # summary of mistake patterns + plan
    },
}

def derive_style_from_quiz(learning_preferences: Optional[dict]) -> Optional[str]:
    """Cold-start teaching-style prior from the onboarding ProfileQuiz, used
    in place of an essentially-random early StyleBandit pick (fresh neural
    arms are near-identical until they've seen real reward). Returns None
    when there isn't enough signal to prefer one style, so the caller can
    fall back to letting the bandit cold-start normally."""
    if not learning_preferences:
        return None
    scores = {s: 0.0 for s in STYLES}
    for qid, option_weights in _QUIZ_STYLE_WEIGHTS.items():
        selected = learning_preferences.get(qid) or []
        if isinstance(selected, str):
            selected = [selected]
        for option in selected:
            for style, weight in option_weights.get(option, {}).items():
                scores[style] += weight
    best_style = max(scores, key=scores.__getitem__)
    return best_style if scores[best_style] > 0 else None

def load_bandit(user_id: int, db) -> StyleBandit:
    try:
        from models import StudentStyleModel
        row = db.query(StudentStyleModel).filter(StudentStyleModel.user_id == user_id).first()
        if row and row.bandit_state:
            return StyleBandit.from_json(row.bandit_state)
    except Exception as e:
        logger.warning(f"[BANDIT] load failed for user={user_id}: {e}")
    return StyleBandit()

def save_bandit(user_id: int, bandit: StyleBandit, db):
    try:
        from models import StudentStyleModel
        from datetime import datetime, timezone
        row     = db.query(StudentStyleModel).filter(StudentStyleModel.user_id == user_id).first()
        payload = bandit.to_json()
        now     = datetime.now(timezone.utc)
        if row:
            row.bandit_state = payload
            row.updated_at   = now
        else:
            db.add(StudentStyleModel(user_id=user_id, bandit_state=payload, updated_at=now))
        db.commit()
    except Exception as e:
        logger.warning(f"[BANDIT] save failed for user={user_id}: {e}")

def get_recent_signals(user_id: int, db, limit: int = 20) -> list[float]:
    try:
        from models import ChatConceptSignal
        rows = (
            db.query(ChatConceptSignal.knowledge_signal)
            .filter(ChatConceptSignal.user_id == user_id)
            .order_by(ChatConceptSignal.created_at.desc())
            .limit(limit)
            .all()
        )
        return [float(r[0]) for r in reversed(rows)]
    except Exception as e:
        logger.warning(f"[BANDIT] recent signals fetch failed: {e}")
        return []

def get_pending_update(user_id: int, db) -> Optional[dict]:
    try:
        from models import StudentStyleModel
        row = db.query(StudentStyleModel).filter(StudentStyleModel.user_id == user_id).first()
        if row and row.pending_style and row.pending_context:
            return {
                "style":   row.pending_style,
                "context": np.array(json.loads(row.pending_context), dtype=np.float64),
            }
    except Exception as e:
        logger.warning(f"[BANDIT] pending update fetch failed: {e}")
    return None

def set_pending_update(user_id: int, style: str, context: np.ndarray, db):
    try:
        from models import StudentStyleModel
        from datetime import datetime, timezone
        row     = db.query(StudentStyleModel).filter(StudentStyleModel.user_id == user_id).first()
        payload = json.dumps(context.tolist())
        now     = datetime.now(timezone.utc)
        if row:
            row.pending_style   = style
            row.pending_context = payload
            row.updated_at      = now
        else:
            db.add(StudentStyleModel(
                user_id         = user_id,
                pending_style   = style,
                pending_context = payload,
                updated_at      = now,
            ))
        db.commit()
    except Exception as e:
        logger.warning(f"[BANDIT] set_pending_update failed: {e}")
