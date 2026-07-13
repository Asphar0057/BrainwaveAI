
from __future__ import annotations

import functools
import logging
import os
from typing import Optional

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split

from dkt.model   import AKT
from dkt.dataset import (
    AKTDataset,
    build_vocab,
    collate_fn,
    get_user_sequences,
    save_vocab,
)

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "dkt_model.pt")

DEFAULTS = dict(
    d_model    = 64,
    n_heads    = 8,
    n_layers   = 2,
    dropout    = 0.2,
    epochs     = 40,
    batch_size = 32,
    lr         = 5e-4,
    max_seq    = 512,
    val_split  = 0.1,
)

def train(db_session_factory, **kwargs) -> dict:
    cfg    = {**DEFAULTS, **kwargs}
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"[AKT] Training on {device}")

    vocab = build_vocab(db_session_factory)
    if not vocab:
        return {"status": "error", "detail": "No concept vocabulary — run some quizzes first."}
    save_vocab(vocab)

    sequences = get_user_sequences(db_session_factory, vocab)
    if not sequences:
        return {"status": "error", "detail": "No interaction sequences in the database."}

    n_concepts = len(vocab)
    dataset    = AKTDataset(sequences, n_concepts, max_seq=cfg["max_seq"])

    if len(dataset) == 0:
        return {"status": "error", "detail": "All sequences are too short (need ≥2 interactions per user)."}

    val_size   = max(1, int(len(dataset) * cfg["val_split"]))
    train_size = len(dataset) - val_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size])

    _collate     = functools.partial(collate_fn, n_concepts=n_concepts)
    train_loader = DataLoader(train_ds, batch_size=cfg["batch_size"], shuffle=True,  collate_fn=_collate)
    val_loader   = DataLoader(val_ds,   batch_size=cfg["batch_size"], shuffle=False, collate_fn=_collate)

    model = AKT(
        n_concepts = n_concepts,
        d_model    = cfg["d_model"],
        n_heads    = cfg["n_heads"],
        n_layers   = cfg["n_layers"],
        dropout    = cfg["dropout"],
    ).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg["lr"], weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=cfg["epochs"])
    criterion = nn.BCELoss()

    best_val_loss = float("inf")
    best_state    = None
    history       = []

    for epoch in range(1, cfg["epochs"] + 1):
        model.train()
        train_loss = _run_epoch(model, train_loader, criterion, device, optimizer)

        model.eval()
        with torch.no_grad():
            val_loss = _run_epoch(model, val_loader, criterion, device, optimizer=None)

        scheduler.step()
        history.append({"epoch": epoch, "train": round(train_loss, 6), "val": round(val_loss, 6)})
        logger.info(f"[AKT] Epoch {epoch:3d}/{cfg['epochs']} | train={train_loss:.4f}  val={val_loss:.4f}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state    = {k: v.cpu().clone() for k, v in model.state_dict().items()}

    if best_state:
        model.load_state_dict(best_state)

    torch.save({
        "state_dict": model.state_dict(),
        "n_concepts": n_concepts,
        "d_model":    cfg["d_model"],
        "n_heads":    cfg["n_heads"],
        "n_layers":   cfg["n_layers"],
        "dropout":    cfg["dropout"],
    }, MODEL_PATH)

    logger.info(f"[AKT] Model saved (best_val_loss={best_val_loss:.4f})")
    return {
        "status":         "success",
        "n_concepts":     n_concepts,
        "n_sequences":    len(dataset),
        "epochs_trained": cfg["epochs"],
        "best_val_loss":  round(best_val_loss, 6),
        "history":        history[-5:],
    }

def _run_epoch(model, loader, criterion, device, optimizer):
    total_loss  = 0.0
    total_steps = 0

    for concept_ids, signals, elapsed_days, targets, padding_mask in loader:
        concept_ids  = concept_ids.to(device)
        signals      = signals.to(device)
        elapsed_days = elapsed_days.to(device)
        targets      = targets.to(device)
        padding_mask = padding_mask.to(device)

        preds = model(concept_ids, signals, elapsed_days, padding_mask)

        valid = ~padding_mask
        loss  = criterion(preds[valid], targets[valid])

        if optimizer is not None:
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

        total_loss  += loss.item()
        total_steps += 1

    return total_loss / total_steps if total_steps > 0 else 0.0

def load_model(device: Optional[torch.device] = None) -> Optional[tuple[AKT, dict]]:
    if not os.path.exists(MODEL_PATH):
        return None
    from dkt.dataset import load_vocab
    vocab = load_vocab()
    if vocab is None:
        return None

    ck = torch.load(MODEL_PATH, map_location="cpu", weights_only=True)
    model = AKT(
        n_concepts = ck["n_concepts"],
        d_model    = ck.get("d_model", 64),
        n_heads    = ck.get("n_heads", 8),
        n_layers   = ck.get("n_layers", 2),
        dropout    = ck.get("dropout", 0.2),
    )
    model.load_state_dict(ck["state_dict"])
    if device:
        model.to(device)
    model.eval()
    return model, vocab
