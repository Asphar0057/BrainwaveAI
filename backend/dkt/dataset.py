
from __future__ import annotations

import json
import logging
import os
from datetime import timezone
from typing import Optional

import torch
from torch.utils.data import Dataset

logger = logging.getLogger(__name__)

VOCAB_PATH = os.path.join(os.path.dirname(__file__), "concept_vocab.json")
MIN_TOPIC_LEN = 2

def build_vocab(db_session_factory) -> dict[str, int]:
    from models import Question
    db = db_session_factory()
    try:
        topics = db.query(Question.topic).filter(
            Question.topic != None,
            Question.topic != "",
        ).distinct().all()
    finally:
        db.close()

    vocab: dict[str, int] = {}
    idx = 1
    for (raw,) in topics:
        if not raw:
            continue
        key = raw.strip().lower()
        if len(key) < MIN_TOPIC_LEN or key in vocab:
            continue
        vocab[key] = idx
        idx += 1

    logger.info(f"[AKT] Concept vocab built: {len(vocab)} unique topics")
    return vocab

def save_vocab(vocab: dict[str, int]):
    with open(VOCAB_PATH, "w") as f:
        json.dump(vocab, f)

def load_vocab() -> Optional[dict[str, int]]:
    if not os.path.exists(VOCAB_PATH):
        return None
    with open(VOCAB_PATH) as f:
        return json.load(f)

def _to_unix(ts) -> float:
    if ts is None:
        return 0.0
    try:
        if hasattr(ts, "timestamp"):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            return ts.timestamp()
        return float(ts)
    except Exception:
        return 0.0

def get_user_sequences(
    db_session_factory,
    vocab: dict[str, int],
    user_id: int | None = None,
) -> dict[int, list[tuple[int, float, float]]]:
    from models import QuestionAttempt, QuestionResult, Question, ChatConceptSignal

    db = db_session_factory()
    try:
        quiz_query = (
            db.query(
                QuestionAttempt.user_id,
                Question.topic,
                QuestionResult.is_correct,
                QuestionAttempt.submitted_at,
            )
            .join(QuestionResult, QuestionResult.attempt_id == QuestionAttempt.id)
            .join(Question, QuestionResult.question_id == Question.id)
            .filter(Question.topic != None, Question.topic != "")
        )
        chat_query = (
            db.query(
                ChatConceptSignal.user_id,
                ChatConceptSignal.concept,
                ChatConceptSignal.knowledge_signal,
                ChatConceptSignal.created_at,
            )
            .filter(ChatConceptSignal.concept != None, ChatConceptSignal.concept != "")
        )
        if user_id is not None:
            quiz_query = quiz_query.filter(QuestionAttempt.user_id == user_id)
            chat_query = chat_query.filter(ChatConceptSignal.user_id == user_id)

        quiz_rows = quiz_query.order_by(
            QuestionAttempt.user_id, QuestionAttempt.submitted_at, QuestionResult.id
        ).all()
        chat_rows = chat_query.order_by(
            ChatConceptSignal.user_id, ChatConceptSignal.created_at
        ).all()
    finally:
        db.close()

    timed: dict[int, list[tuple[float, int, float]]] = {}

    for user_id, topic, is_correct, ts in quiz_rows:
        key = (topic or "").strip().lower()
        cid = vocab.get(key)
        if cid is None:
            continue
        ks = 0.65 if is_correct else -0.65
        timed.setdefault(user_id, []).append((_to_unix(ts), cid, ks))

    for user_id, concept, ks, ts in chat_rows:
        ks = float(ks or 0.0)
        if abs(ks) < 0.15:
            continue
        key = (concept or "").strip().lower()
        cid = vocab.get(key)
        if cid is None:
            continue
        timed.setdefault(user_id, []).append((_to_unix(ts), cid, ks))

    sequences: dict[int, list[tuple[int, float, float]]] = {}
    total = 0
    for user_id, events in timed.items():
        events.sort(key=lambda x: x[0])
        sequences[user_id] = [(cid, ks, unix_ts) for unix_ts, cid, ks in events]
        total += len(events)

    logger.info(
        f"[AKT] Sequences: {len(sequences)} users, {total} interactions "
        f"({len(quiz_rows)} quiz + {len(chat_rows)} chat signals)"
    )
    return sequences

def _compute_elapsed(timestamps: list[float]) -> list[float]:
    elapsed = [0.0]
    for i in range(1, len(timestamps)):
        delta = max(0.0, (timestamps[i] - timestamps[i - 1]) / 86400.0)
        elapsed.append(min(delta, 365.0))
    return elapsed

class AKTDataset(Dataset):

    def __init__(
        self,
        sequences: dict[int, list[tuple[int, float, float]]],
        n_concepts: int,
        max_seq: int = 512,
    ):
        self.n_concepts = n_concepts
        self.max_seq    = max_seq
        self.samples: list[tuple[list, list, list, list]] = []

        for seq in sequences.values():
            if len(seq) < 2:
                continue
            seq = seq[:max_seq]
            cids      = [s[0] for s in seq]
            sigs      = [s[1] for s in seq]
            tss       = [s[2] for s in seq]
            elapsed   = _compute_elapsed(tss)

            inp_cids    = cids[:-1]
            inp_sigs    = sigs[:-1]
            inp_elapsed = elapsed[:-1]
            targets     = [(cids[i + 1], sigs[i + 1] > 0) for i in range(len(cids) - 1)]

            self.samples.append((inp_cids, inp_sigs, inp_elapsed, targets))

        logger.info(f"[AKT] Dataset: {len(self.samples)} training sequences")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return self.samples[idx]

def collate_fn(batch, n_concepts: int):
    cids_list, sigs_list, elapsed_list, targets_list = zip(*batch)
    max_len = max(len(c) for c in cids_list)
    B = len(batch)

    concept_ids  = torch.zeros(B, max_len, dtype=torch.long)
    signals      = torch.zeros(B, max_len, dtype=torch.float32)
    elapsed_days = torch.zeros(B, max_len, dtype=torch.float32)
    target_t     = torch.zeros(B, max_len, n_concepts, dtype=torch.float32)
    padding_mask = torch.ones(B, max_len, dtype=torch.bool)

    for i, (cids, sigs, elap, tgts) in enumerate(
        zip(cids_list, sigs_list, elapsed_list, targets_list)
    ):
        L = len(cids)
        concept_ids[i, :L]  = torch.tensor(cids, dtype=torch.long)
        signals[i, :L]      = torch.tensor(sigs, dtype=torch.float32)
        elapsed_days[i, :L] = torch.tensor(elap, dtype=torch.float32)
        padding_mask[i, :L] = False

        for t, (cid, correct) in enumerate(tgts):
            if 1 <= cid <= n_concepts:
                target_t[i, t, cid - 1] = 1.0 if correct else 0.0

    return concept_ids, signals, elapsed_days, target_t, padding_mask
