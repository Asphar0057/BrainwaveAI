import logging
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool, NullPool

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./brainwave_tutor.db")

def _is_sqlite_corruption_error(err: Exception) -> bool:
    msg = str(err).lower()
    return (
        "database disk image is malformed" in msg
        or "file is not a database" in msg
        or "malformed database schema" in msg
        or "quick_check failed" in msg
    )

def _resolve_sqlite_path(database_url: str) -> Optional[Path]:
    try:
        db_path = make_url(database_url).database
    except Exception:
        return None
    if not db_path or db_path == ":memory:":
        return None
    path = Path(db_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()

def _quarantine_file(path: Path, stamp: str) -> Optional[Path]:
    if not path.exists():
        return None
    quarantined = path.with_name(f"{path.name}.corrupt-{stamp}")
    path.replace(quarantined)
    return quarantined

def _ensure_sqlite_database_usable(database_url: str) -> None:
    db_path = _resolve_sqlite_path(database_url)
    if db_path is None:
        return

    db_path.parent.mkdir(parents=True, exist_ok=True)
    if not db_path.exists():
        return

    try:
        with sqlite3.connect(str(db_path)) as conn:
            result = conn.execute("PRAGMA quick_check").fetchone()
            if not result or result[0] != "ok":
                raise sqlite3.DatabaseError(f"quick_check failed: {result}")
    except sqlite3.DatabaseError as err:
        if not _is_sqlite_corruption_error(err):
            raise

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        quarantined_files = []

        try:
            renamed_db = _quarantine_file(db_path, stamp)
            if renamed_db:
                quarantined_files.append(str(renamed_db))
            for suffix in ("-wal", "-shm"):
                renamed_sidecar = _quarantine_file(Path(f"{db_path}{suffix}"), stamp)
                if renamed_sidecar:
                    quarantined_files.append(str(renamed_sidecar))
        except OSError as move_err:
            raise RuntimeError(f"Failed to quarantine corrupted SQLite files: {move_err}") from move_err

        with sqlite3.connect(str(db_path)):
            pass

        logger.error(
            "Detected corrupted SQLite DB at %s. Quarantined files: %s. "
            "Created a fresh DB so startup can continue.",
            db_path,
            quarantined_files or "[none]",
        )

if "postgresql" in DATABASE_URL or "postgres" in DATABASE_URL:
    if ":5432/" in DATABASE_URL and os.getenv("SUPABASE_POOLER", "false").lower() in ("1", "true", "yes"):
        DATABASE_URL = DATABASE_URL.replace(":5432/", ":6543/")
        logger.info("Switched to Supabase transaction-mode pooler (port 6543)")

if DATABASE_URL.startswith("sqlite"):
    _ensure_sqlite_database_usable(DATABASE_URL)
    connect_args = {"check_same_thread": False}
    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_pre_ping=True,
        echo=False
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    logger.info("Using SQLite database (WAL mode)")
    
else:
    pool_size = int(os.getenv("DB_POOL_SIZE", "5"))
    max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "5"))
    pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    pool_recycle = int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800"))
    connect_timeout = int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "10"))
    application_name = os.getenv("DB_APPLICATION_NAME", "brainwave_api")
    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=pool_size,
        max_overflow=max_overflow,
        pool_timeout=pool_timeout,
        pool_recycle=pool_recycle,
        pool_pre_ping=True,
        connect_args={
            "connect_timeout": connect_timeout,
            "application_name": application_name,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5
        },
        echo=False
    )
    logger.info(
        "Using PostgreSQL with connection pooling pool_size=%s max_overflow=%s pool_timeout=%s",
        pool_size,
        max_overflow,
        pool_timeout,
    )
    
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
