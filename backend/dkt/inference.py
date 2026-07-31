
from __future__ import annotations

import logging
from typing import Optional

import torch
import numpy as np

from dkt.trainer import load_model
from dkt.dataset import get_user_sequences, _compute_elapsed

logger = logging.getLogger(__name__)

_cached: Optional[tuple] = None

def _get_model():
    global _cached
    if _cached is None:
        result = load_model()
        if result is None:
            return None, None, None
        model, vocab = result
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model.to(device)
        model.eval()
        _cached = (model, vocab, device)
    return _cached

def invalidate_cache():
    global _cached
    _cached = None

def _seq_to_tensors(
    user_seq: list[tuple[int, float, float]],
    device: torch.device,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    cids    = [s[0] for s in user_seq]
    sigs    = [s[1] for s in user_seq]
    tss     = [s[2] for s in user_seq]
    elapsed = _compute_elapsed(tss)

    concept_ids  = torch.tensor([cids],    dtype=torch.long,    device=device)
    signals      = torch.tensor([sigs],    dtype=torch.float32, device=device)
    elapsed_days = torch.tensor([elapsed], dtype=torch.float32, device=device)
    return concept_ids, signals, elapsed_days

def get_mastery(user_id: int, db_session_factory, apply_decay: bool = True) -> dict:
    model, vocab, device = _get_model()

    if model is None or vocab is None:
        return {
            "model_available":   False,
            "n_interactions":    0,
            "mastery":           {},
            "effective_mastery": {},
            "top_weak":          [],
            "top_strong":        [],
            "detail":            "Model not trained yet. Call POST /api/kt/train first.",
        }

    sequences  = get_user_sequences(db_session_factory, vocab, user_id=user_id)
    user_seq   = sequences.get(user_id, [])
    n_concepts = model.n_concepts
    id_to_topic = {v: k for k, v in vocab.items()}

    if len(user_seq) == 0:
        default = {topic: 0.5 for topic in vocab}
        return {
            "model_available":   True,
            "n_interactions":    0,
            "mastery":           default,
            "effective_mastery": default,
            "top_weak":          [],
            "top_strong":        [],
            "detail":            "No interaction history — showing prior (0.5 for all concepts).",
        }

    concept_ids, signals, elapsed_days = _seq_to_tensors(user_seq, device)

    with torch.no_grad():
        preds = model(concept_ids, signals, elapsed_days)

    final_probs = preds[0, -1, :].cpu().tolist()

    mastery: dict[str, float] = {
        id_to_topic[cid]: round(prob, 4)
        for cid, prob in enumerate(final_probs, start=1)
        if cid in id_to_topic
    }

    recency: dict[str, dict] = {}
    if apply_decay:
        try:
            from dkt.temporal_decay import get_concept_recency, compute_decay
            db = db_session_factory()
            try:
                recency = get_concept_recency(user_id, db)
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"[AKT] Decay computation failed: {e}")

    effective_mastery: dict[str, float] = {}
    for concept, raw_m in mastery.items():
        info = recency.get(concept)
        if info and apply_decay:
            from dkt.temporal_decay import compute_decay
            eff = compute_decay(raw_m, info["last_seen_days"], info["stability"])
        else:
            eff = raw_m
        effective_mastery[concept] = eff

    sorted_eff = sorted(effective_mastery.items(), key=lambda x: x[1])

    top_weak = []
    for t, eff in sorted_eff[:10]:
        info = recency.get(t, {})
        top_weak.append({
            "concept":           t,
            "mastery":           mastery.get(t, 0.5),
            "effective_mastery": eff,
            "days_since":        info.get("last_seen_days"),
            "retrievability":    info.get("retrievability"),
        })

    top_strong = []
    for t, eff in reversed(sorted_eff[-10:]):
        top_strong.append({
            "concept":           t,
            "mastery":           mastery.get(t, 0.5),
            "effective_mastery": eff,
        })

    return {
        "model_available":   True,
        "n_interactions":    len(user_seq),
        "mastery":           mastery,
        "effective_mastery": effective_mastery,
        "top_weak":          top_weak,
        "top_strong":        top_strong,
    }

def predict_next(user_id: int, concept: str, db_session_factory) -> dict:
    model, vocab, device = _get_model()
    if model is None:
        return {"model_available": False, "probability": 0.5}

    concept_id = vocab.get(concept.strip().lower())
    if concept_id is None:
        return {"model_available": True, "probability": 0.5, "detail": "Concept not in vocabulary."}

    sequences = get_user_sequences(db_session_factory, vocab, user_id=user_id)
    user_seq  = sequences.get(user_id, [])

    if not user_seq:
        return {"model_available": True, "probability": 0.5, "detail": "No history — returning prior."}

    concept_ids, signals, elapsed_days = _seq_to_tensors(user_seq, device)

    with torch.no_grad():
        preds = model(concept_ids, signals, elapsed_days)

    prob = float(preds[0, -1, concept_id - 1].cpu())
    return {
        "model_available": True,
        "concept":         concept,
        "probability":     round(prob, 4),
        "n_interactions":  len(user_seq),
    }

def get_akt_context_vector(
    user_id: int,
    db_session_factory,
    target_dim: int = 8,
) -> Optional[np.ndarray]:
    model, vocab, device = _get_model()
    if model is None or vocab is None:
        return None

    sequences = get_user_sequences(db_session_factory, vocab, user_id=user_id)
    user_seq  = sequences.get(user_id, [])
    if not user_seq:
        return None

    concept_ids, signals, elapsed_days = _seq_to_tensors(user_seq, device)

    with torch.no_grad():
        hidden = model.get_hidden(concept_ids, signals, elapsed_days)

    h = hidden[0].cpu().numpy()
    block = max(1, len(h) // target_dim)
    pooled = np.array([h[i * block:(i + 1) * block].mean() for i in range(target_dim)])
    return pooled.astype(np.float32)
