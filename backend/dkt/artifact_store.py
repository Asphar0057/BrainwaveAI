
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def save_artifact(db_session_factory, name: str, data: bytes) -> None:
    """Upserts a trained-model blob into the DB so it survives container
    restarts/redeploys and can be picked up by other replicas."""
    from models.ml import DKTArtifact

    db = db_session_factory()
    try:
        row = db.query(DKTArtifact).filter(DKTArtifact.name == name).first()
        if row is None:
            row = DKTArtifact(name=name)
            db.add(row)
        row.data = data
        row.updated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


def load_artifact(db_session_factory, name: str) -> Optional[tuple[bytes, Optional[datetime]]]:
    from models.ml import DKTArtifact

    db = db_session_factory()
    try:
        row = db.query(DKTArtifact).filter(DKTArtifact.name == name).first()
        if row is None:
            return None
        return row.data, row.updated_at
    finally:
        db.close()
