"""
Reconciles BKT and DKT into one mastery number instead of two independent,
sometimes-disagreeing signals.

Before this: a student could see 80% "BKT mastery" in the live chat prompt
(services/ml_pipeline.py's per-turn Bayesian update, keyed off conversational
intent) while StyleBandit's context vector simultaneously used DKT's
effective_mastery (dkt/inference.py, a trained neural sequence model over the
real chat+quiz history) saying 40% for the exact same concept -- computed
from different evidence, never compared, both used unknowingly in the same
turn.

This module doesn't replace either system -- BKT stays the real-time,
always-available, cheap-to-update signal; DKT stays the slower, holistic,
periodically-retrained one. It blends them, weighting each by how much
evidence it actually has, so callers get one number that degrades gracefully
to whichever source has data when the other doesn't.
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def blend_mastery(
    bkt_mastery: Optional[float],
    bkt_interactions: int,
    dkt_mastery: Optional[float],
    dkt_interactions: int,
) -> float:
    """Evidence-weighted blend. Each source's weight scales with its own
    interaction count (more history = more trust), capped at 10 interactions
    so neither source is ever fully trusted off a single data point. DKT is
    weighted 1.5x BKT's cap once it has data, since it sees the full
    cross-source (chat + quiz) history rather than chat alone -- not a claim
    DKT is definitively more accurate, just that it integrates more evidence
    per interaction. Falls back to whichever source is actually available."""
    if bkt_mastery is None and dkt_mastery is None:
        return 0.5
    if dkt_mastery is None:
        return bkt_mastery
    if bkt_mastery is None:
        return dkt_mastery

    bkt_weight = min(max(bkt_interactions, 0) / 10.0, 1.0) * 1.0
    dkt_weight = min(max(dkt_interactions, 0) / 10.0, 1.0) * 1.5
    total = bkt_weight + dkt_weight
    if total <= 0:
        return (bkt_mastery + dkt_mastery) / 2.0
    return (bkt_mastery * bkt_weight + dkt_mastery * dkt_weight) / total


def get_concept_mastery(user_id: int, concept_id: str, db, db_factory=None) -> dict:
    """Single reconciled mastery view for one concept. `concept_id` is
    expected in BKT's convention (lowercase, spaces replaced with
    underscores -- see ml_pipeline.py::_load_concept_cache); DKT's vocab
    keys are lowercase with spaces preserved (dkt/dataset.py::build_vocab),
    so the two are translated here rather than silently never matching."""
    import models

    bkt_mastery: Optional[float] = None
    bkt_interactions = 0
    state = db.query(models.StudentKnowledgeState).filter_by(
        user_id=user_id, concept_id=concept_id
    ).first()
    if state:
        from services.ml_pipeline import MessageMLPipeline
        bkt_mastery = MessageMLPipeline._decayed_mastery(
            state.p_mastery, state.last_updated, state.interaction_count or 0
        )
        bkt_interactions = state.interaction_count or 0

    dkt_mastery: Optional[float] = None
    dkt_interactions = 0
    try:
        if db_factory is None:
            import database
            db_factory = database.SessionLocal
        from dkt.inference import get_mastery
        m = get_mastery(user_id, db_factory, apply_decay=True)
        if m.get("model_available") and m.get("n_interactions", 0) > 0:
            dkt_key = concept_id.replace("_", " ")
            eff = m.get("effective_mastery") or {}
            if dkt_key in eff:
                dkt_mastery = eff[dkt_key]
                dkt_interactions = m.get("n_interactions", 0)
    except Exception as e:
        logger.debug(f"[MASTERY] DKT lookup unavailable for concept={concept_id!r}: {e}")

    blended = blend_mastery(bkt_mastery, bkt_interactions, dkt_mastery, dkt_interactions)
    source = (
        "blend" if (bkt_mastery is not None and dkt_mastery is not None) else
        "bkt" if bkt_mastery is not None else
        "dkt" if dkt_mastery is not None else
        "none"
    )
    return {
        "mastery": blended,
        "bkt_mastery": bkt_mastery,
        "dkt_mastery": dkt_mastery,
        "source": source,
    }
