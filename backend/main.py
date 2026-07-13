import os
import sys
import logging
import warnings
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime, timezone
from env_loader import load_backend_env

load_backend_env()

_startup_secret_key = os.getenv("SECRET_KEY", "")
if not _startup_secret_key:
    raise RuntimeError("SECRET_KEY environment variable is not set")
if os.getenv("ENVIRONMENT", "development").strip().lower() == "production":
    weak_secret_markers = {"changeme", "change-me", "secret", "your-secret-key"}
    normalized_secret = _startup_secret_key.strip().lower()
    if len(_startup_secret_key.encode("utf-8")) < 32 or any(
        marker in normalized_secret for marker in weak_secret_markers
    ):
        raise RuntimeError("SECRET_KEY must be a random value of at least 32 bytes in production")

def _configure_langsmith_tracing() -> None:
    enabled = os.getenv("ENABLE_LANGSMITH_TRACING", "false").strip().lower() in {"1", "true", "yes", "on"}
    if enabled:
        return
    os.environ["LANGCHAIN_TRACING_V2"] = "false"
    os.environ["LANGSMITH_TRACING"] = "false"

_configure_langsmith_tracing()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text

from database import SessionLocal, engine
import models
from services.api_key_pool import ApiKeyPoolExhausted

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", category=RuntimeWarning)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("huggingface_hub").setLevel(logging.WARNING)
logging.getLogger("huggingface_hub.file_download").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./brainwave_tutor.db")
if os.getenv("ENVIRONMENT", "development") == "production" and "sqlite" in DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set to PostgreSQL in production. SQLite is not supported for production use.")

_RL_SCHEDULER_LOCK_ID = int(os.getenv("RL_SCHEDULER_ADVISORY_LOCK_ID", "941731"))


def _acquire_rl_scheduler_lock():
    mode = os.getenv("ENABLE_RL_SCHEDULER", "auto").strip().lower()
    if mode in {"0", "false", "no", "off", "disabled"}:
        logger.info("RL reward measurement scheduler disabled by env")
        return None

    if "postgres" in DATABASE_URL.lower():
        conn = engine.connect()
        try:
            acquired = conn.execute(
                text("SELECT pg_try_advisory_lock(:lock_id)"),
                {"lock_id": _RL_SCHEDULER_LOCK_ID},
            ).scalar()
            if acquired:
                logger.info("RL scheduler acquired PostgreSQL advisory lock %s", _RL_SCHEDULER_LOCK_ID)
                return {"kind": "postgres", "handle": conn}
        except Exception:
            conn.close()
            raise
        conn.close()
        logger.info("RL scheduler skipped; advisory lock already held by another worker/replica")
        return None

    if mode == "auto":
        logger.info("RL scheduler auto mode without PostgreSQL lock support; running in-process")
        return {"kind": "local", "handle": None}

    logger.info("RL scheduler enabled without PostgreSQL lock support via env override")
    return {"kind": "local", "handle": None}


def _release_rl_scheduler_lock(lock_state) -> None:
    if not lock_state:
        return
    if lock_state.get("kind") != "postgres":
        return
    conn = lock_state.get("handle")
    if conn is None:
        return
    try:
        conn.execute(
            text("SELECT pg_advisory_unlock(:lock_id)"),
            {"lock_id": _RL_SCHEDULER_LOCK_ID},
        )
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass

_DB_MIGRATION_LOCK_ID = int(os.getenv("DB_MIGRATION_ADVISORY_LOCK_ID", "941732"))
_ALEMBIC_BASELINE_REVISION = "1f7b7b570da8"


def _upgrade_db_to_head(cfg, command) -> None:
    """Upgrade a fresh or legacy database to the latest Alembic revision.

    Databases created before Alembic already contain the baseline tables but
    have no recorded revision. Running the baseline migration against one of
    those databases fails on its first CREATE TABLE. Mark the existing schema
    as the baseline first, then replay every migration added after it.

    ``create_all`` is intentionally limited to this one-time legacy bootstrap:
    it fills in any mapped tables that an older installation did not have,
    while the subsequent Alembic revisions remain responsible for data
    backfills, raw SQL tables, indexes, and newer columns.
    """
    from alembic.runtime.migration import MigrationContext
    from sqlalchemy import inspect

    with engine.connect() as conn:
        current_revision = MigrationContext.configure(conn).get_current_revision()
        existing_tables = set(inspect(conn).get_table_names()) - {"alembic_version"}

    if current_revision is None and existing_tables:
        logger.warning(
            "Detected an existing database without an Alembic revision; "
            "bootstrapping it at baseline %s before upgrading",
            _ALEMBIC_BASELINE_REVISION,
        )
        models.Base.metadata.create_all(bind=engine)
        command.stamp(cfg, _ALEMBIC_BASELINE_REVISION)

    command.upgrade(cfg, "head")


def _import_alembic_runtime():
    """Import Alembic's package, not backend/alembic migration scripts.

    Running `python main.py` from backend/ puts backend/ first on sys.path, so
    `import alembic` can resolve to the local migration directory.
    """
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    original_path = list(sys.path)
    existing_alembic = sys.modules.get("alembic")

    if existing_alembic is not None:
        locations = getattr(existing_alembic, "__path__", [])
        if any(os.path.abspath(str(path)) == os.path.join(backend_dir, "alembic") for path in locations):
            sys.modules.pop("alembic", None)

    try:
        sys.path = [
            path for path in sys.path
            if os.path.abspath(path or os.getcwd()) != backend_dir
        ]
        from alembic import command
        from alembic.config import Config
    finally:
        sys.path = original_path

    return command, Config


def _run_db_migrations() -> None:
    """Bring the schema to head via Alembic (see backend/alembic/versions/).
    Runs at import time, before routers/deps are imported below, so every
    request handler can assume the schema is already current.

    Postgres + gunicorn run 4 worker processes that each import this module
    and would otherwise race to run the same migration; a blocking advisory
    lock serializes them so only one worker does the work while the rest
    wait, then no-op once they see alembic_version is already at head.
    """
    command, Config = _import_alembic_runtime()

    cfg = Config(os.path.join(os.path.dirname(os.path.abspath(__file__)), "alembic.ini"))

    if "postgres" not in DATABASE_URL.lower():
        _upgrade_db_to_head(cfg, command)
        return

    conn = engine.connect()
    try:
        conn.execute(text("SELECT pg_advisory_lock(:lock_id)"), {"lock_id": _DB_MIGRATION_LOCK_ID})
        try:
            _upgrade_db_to_head(cfg, command)
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": _DB_MIGRATION_LOCK_ID})
    finally:
        conn.close()


_run_db_migrations()

def _sync_sequences():
    if "postgres" not in DATABASE_URL.lower():
        return
    try:
        sequences = [
            ("chat_messages_id_seq", "chat_messages"),
            ("chat_sessions_id_seq", "chat_sessions"),
            ("activities_id_seq", "activities"),
        ]
        with engine.connect() as conn:
            for seq, table in sequences:
                try:
                    exists = conn.execute(text("SELECT to_regclass(:s)"), {"s": seq}).scalar()
                    if not exists:
                        continue
                    conn.execute(
                        text(f"SELECT setval(:s, COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)"),
                        {"s": seq},
                    )
                except Exception:
                    continue
            conn.commit()
    except Exception as e:
        logger.error(f"Sequence sync error: {e}")

_sync_sequences()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Brainwave API v4.0.0")

    try:
        from activity_logger import ensure_activity_log_table
        if ensure_activity_log_table():
            logger.info("Activity log table ready")
    except Exception as e:
        logger.warning(f"Activity log table init failed: {e}")

    if "postgres" in DATABASE_URL:
        try:
            db = SessionLocal()
            tables = [
                "users", "chat_sessions", "notes", "activities",
                "flashcard_sets", "daily_learning_metrics", "user_stats",
                "folders", "question_sets", "learning_reviews", "uploaded_slides",
            ]
            for table in tables:
                try:
                    max_id = db.execute(text(f"SELECT COALESCE(MAX(id), 0) FROM {table}")).scalar()
                    db.execute(text(f"SELECT setval('{table}_id_seq', :n)"), {"n": max_id + 1})
                except Exception:
                    continue
            db.commit()
            db.close()
        except Exception as e:
            logger.warning(f"Sequence fix error: {e}")

    try:
        from deps import unified_ai, hs_context_ai as _hs_ai
        from tutor.graph import create_tutor
        create_tutor(unified_ai, SessionLocal, hs_ai_client=_hs_ai)
        logger.info("Tutor graph initialized")
    except Exception as e:
        logger.warning(f"Tutor init failed: {e}")

    try:
        from deps import unified_ai as _ai, hs_context_ai as _hs_ai
        from graphs.flashcard_graph import create_flashcard_graph
        create_flashcard_graph(_ai, SessionLocal, hs_ai_client=_hs_ai)
        logger.info("Flashcard graph initialized")
    except Exception as e:
        logger.warning(f"Flashcard graph init failed: {e}")

    try:
        from deps import unified_ai as _ai
        from graphs.learningpath_graph import create_learningpath_graph
        create_learningpath_graph(_ai, SessionLocal)
        logger.info("LearningPath graph initialized")
    except Exception as e:
        logger.warning(f"LearningPath graph init failed: {e}")

    try:
        from deps import unified_ai as _ai
        from graphs.searchhub_graph import create_searchhub_graph
        create_searchhub_graph(_ai, SessionLocal)
        logger.info("SearchHub graph initialized")
    except Exception as e:
        logger.warning(f"SearchHub graph init failed: {e}")

    try:
        from deps import unified_ai as _ai, hs_context_ai as _hs_ai
        from graphs.quiz_graph import create_quiz_graph
        create_quiz_graph(_ai, SessionLocal, hs_ai_client=_hs_ai)
        logger.info("Quiz graph initialized")
    except Exception as e:
        logger.warning(f"Quiz graph init failed: {e}")

    try:
        from deps import unified_ai as _ai, hs_context_ai as _hs_ai
        from graphs.note_graph import create_note_graph
        create_note_graph(_ai, SessionLocal, hs_ai_client=_hs_ai)
        logger.info("Note graph initialized")
    except Exception as e:
        logger.warning(f"Note graph init failed: {e}")

    startup_embeddings_enabled = os.getenv(
        "ENABLE_STARTUP_EMBEDDINGS",
        "false" if os.getenv("ENVIRONMENT", "development").strip().lower() == "production" else "true",
    ).strip().lower() in {"1", "true", "yes", "on"}

    if startup_embeddings_enabled:
        try:
            from sentence_transformers import SentenceTransformer
            try:
                _embed_model_inst = SentenceTransformer("BAAI/bge-small-en-v1.5")
                logger.info("Embedding model loaded: BAAI/bge-small-en-v1.5")
            except Exception:
                _embed_model_inst = SentenceTransformer("all-MiniLM-L6-v2")
                logger.info("Embedding model loaded: all-MiniLM-L6-v2 (fallback)")

            from services import vector_store
            vector_store.initialize(_embed_model_inst, db_url=DATABASE_URL)
            logger.info("vector_store (pgvector) initialized")

            try:
                from services import context_store
                subjects = context_store.list_hs_subjects()
                if subjects:
                    logger.info(
                        f"HS curriculum: {len(subjects)} subject(s) seeded: "
                        + ", ".join(f"{s['subject']} ({s['doc_count']} docs)" for s in subjects)
                    )
                else:
                    logger.info("HS curriculum collection is empty")
            except Exception as se:
                logger.warning(f"HS curriculum listing failed: {se}")
        except Exception as e:
            logger.warning(f"vector_store init failed: {e}")
    else:
        logger.info("Startup embeddings disabled; skipping vector_store warmup")

    try:
        from services import redis_cache
        connected = redis_cache.init_redis()
        if connected:
            logger.info("Redis cache connected")
            try:
                from middleware.rate_limiter import init_redis_for_rate_limiter
                init_redis_for_rate_limiter(redis_cache._redis_client)
            except Exception as rl_e:
                logger.warning(f"Rate limiter Redis init failed: {rl_e}")
        else:
            logger.info("Redis unavailable — using in-memory cache fallback")
    except Exception as e:
        logger.warning(f"Redis cache init failed: {e}")

    if startup_embeddings_enabled:
        try:
            from services.ml_pipeline import ModelRegistry
            from services import vector_store as _vs
            reg = ModelRegistry.get()
            if _vs.available() and _vs._embed_model and not reg._embed_model:
                reg._embed_model = _vs._embed_model
                reg._ready = True
                logger.info("ML ModelRegistry reused vector_store embedding model")
            else:
                reg.load()
                logger.info("ML ModelRegistry initialized (sentence-transformers)")
        except Exception as e:
            logger.warning(f"ModelRegistry init failed: {e}")
    else:
        logger.info("Startup embeddings disabled; skipping ModelRegistry warmup")

    try:
        from services import vector_store as _vs
        from services.memory_service import initialize_memory_service

        if _vs.available():
            def _embed_fn(text):
                try:
                    return _vs._embed_model.encode(text, normalize_embeddings=True)
                except Exception:
                    return [0.0] * 384
            initialize_memory_service(_embed_fn)
        else:
            logger.warning("MemoryService skipped — vector_store unavailable")
    except Exception as e:
        logger.warning(f"MemoryService init failed: {e}")

    try:
        from database import SessionLocal as _sl
        from services.memory_service import get_memory_service
        from services.context_agent import initialize_context_agent

        initialize_context_agent(_sl, get_memory_service())
    except Exception as e:
        logger.warning(f"ContextAgent init failed: {e}")

    _scheduler = None
    _scheduler_lock = None
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from services.rl_strategy_agent import get_bandit

        _scheduler_lock = _acquire_rl_scheduler_lock()
        if _scheduler_lock:
            _bandit_instance = get_bandit()
            _scheduler = AsyncIOScheduler()
            reward_interval_seconds = int(os.getenv("RL_REWARD_MEASUREMENT_INTERVAL_SECONDS", "300"))

            def _run_reward_measurement():
                _bandit_instance.measure_pending_rewards(SessionLocal)

            _scheduler.add_job(
                _run_reward_measurement,
                "interval",
                seconds=reward_interval_seconds,
                id="rl_reward_measurement",
                max_instances=1,
                coalesce=True,
            )
            _scheduler.start()
            logger.info("RL reward measurement scheduler started (%ss interval)", reward_interval_seconds)
    except ImportError:
        logger.warning("APScheduler not installed — RL reward measurement disabled. Add apscheduler>=3.10.0 to requirements.txt")
    except Exception as e:
        logger.warning(f"RL scheduler init failed: {e}")

    logger.info("Startup complete")
    yield

    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
        except Exception:
            pass
    _release_rl_scheduler_lock(_scheduler_lock)

_production_api = os.getenv("ENVIRONMENT", "development").strip().lower() == "production"
app = FastAPI(
    title="Brainwave Backend API",
    version="4.0.0",
    lifespan=lifespan,
    docs_url=None if _production_api else "/docs",
    redoc_url=None if _production_api else "/redoc",
    openapi_url=None if _production_api else "/openapi.json",
)


def _hours_from_seconds(seconds):
    if seconds is None:
        return None
    try:
        return round(max(0, int(seconds)) / 3600, 1)
    except Exception:
        return None


@app.exception_handler(ApiKeyPoolExhausted)
async def api_key_pool_exhausted_handler(request, exc: ApiKeyPoolExhausted):
    reset_after = exc.reset_after_seconds
    provider = exc.provider or "ai"
    content = {
        "detail": "You've reached your usage limit.",
        "code": "ai_provider_limit_exceeded",
        "provider": provider,
        "reset_at": exc.reset_at,
        "reset_after_seconds": reset_after,
        "reset_after_hours": _hours_from_seconds(reset_after),
    }
    headers = {"X-AI-Limit-Code": "ai_provider_limit_exceeded"}
    if exc.reset_at:
        headers["X-AI-Limit-Reset"] = str(exc.reset_at)
    if reset_after is not None:
        headers["Retry-After"] = str(max(1, int(reset_after)))
        headers["X-AI-Limit-Reset-After"] = str(max(0, int(reset_after)))
    return JSONResponse(status_code=429, content=content, headers=headers)

_env = os.getenv("ENVIRONMENT", "").strip().lower()
_is_dev = _env != "production"
if not _env:
    logger.warning(
        "ENVIRONMENT env var is not set — defaulting to DEVELOPMENT mode. "
        "Set ENVIRONMENT=production in production deployments."
    )
_dev_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
allowed_origins = [
    o.strip() for o in
    os.getenv("ALLOWED_ORIGINS", "https://cerbyl.com,https://www.cerbyl.com").split(",")
    if o.strip()
]
if _is_dev:
    allowed_origins.extend(_dev_origins)
if _env == "production" and "*" in allowed_origins:
    raise RuntimeError("Wildcard CORS origins cannot be used with credentials in production")
cors_origins = sorted(set(allowed_origins))
allow_vercel_previews = os.getenv("ALLOW_VERCEL_PREVIEW_ORIGINS", "false").strip().lower() in {
    "1", "true", "yes", "on",
}
cors_origin_regex = (
    r"^https://brainwave-[a-z0-9]+-[a-z0-9]+\.vercel\.app$"
    if allow_vercel_previews
    else None
)

from middleware.rate_limiter import RateLimitMiddleware
from middleware.token_limit import TokenLimitMiddleware
from middleware.security_headers import SecurityHeadersMiddleware
from middleware.body_limit import BodySizeLimitMiddleware
app.add_middleware(RateLimitMiddleware)
app.add_middleware(TokenLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1024)

try:
    from activity_middleware import log_request_activity
    app.middleware("http")(log_request_activity)
except ImportError:
    pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With", "X-User-Id"],
    expose_headers=[
        "X-TokenLimit-Limit",
        "X-TokenLimit-Used",
        "X-TokenLimit-Remaining",
        "X-TokenLimit-Plan",
        "X-TokenLimit-Reset",
        "X-TokenLimit-Reset-After",
        "X-TokenUsage-Delta",
        "X-AI-Limit-Code",
        "X-AI-Limit-Reset",
        "X-AI-Limit-Reset-After",
        "Retry-After",
    ],
)

from routes import (
    auth,
    subscription,
    chat,
    notes,
    flashcards,
    learningpath,
    questions,
    media,
    roadmaps,
    social,
    friends,
    battles,
    sharing,
    gamification,
    analytics,
    notifications,
    reminders,
    playlists,
    search,
    searchhub,
    reviews,
    weakness,
    imports,
    context as context_routes,
    knowledge_tracing,
    intelligence,
    rate_limits,
    ai_jobs,
    public_share,
)

app.include_router(auth.router)
app.include_router(subscription.router)
app.include_router(chat.router)
app.include_router(notes.router)
app.include_router(flashcards.router)
app.include_router(learningpath.router)
app.include_router(questions.router)
app.include_router(media.router)
app.include_router(roadmaps.router)
app.include_router(social.router)
app.include_router(social.ws_router)
app.include_router(friends.router)
app.include_router(battles.router)
app.include_router(sharing.router)
app.include_router(gamification.router)
app.include_router(analytics.router)
app.include_router(notifications.router)
app.include_router(reminders.router)
app.include_router(playlists.router)
app.include_router(search.router)
app.include_router(searchhub.router)
app.include_router(reviews.router)
app.include_router(weakness.router)
app.include_router(imports.router)
app.include_router(context_routes.router)
app.include_router(knowledge_tracing.router)
app.include_router(intelligence.router)
app.include_router(rate_limits.router)
app.include_router(ai_jobs.router)
app.include_router(public_share.router)

try:
    from flashcard_api_minimal import register_flashcard_api_minimal
    register_flashcard_api_minimal(app)
except ImportError:
    pass

try:
    from question_bank import register_question_bank_api
    from deps import unified_ai
    from database import get_db
    register_question_bank_api(app, unified_ai, get_db)
except ImportError:
    pass

def _application_health() -> tuple[dict[str, str], bool]:
    checks: dict[str, str] = {}
    ready = True

    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as _db_err:
        checks["database"] = "error"
        ready = False
        logger.error("Health check: DB error: %s", _db_err)

    try:
        from services import redis_cache as _rc
        if _rc._redis_client is not None:
            _rc._redis_client.ping()
            checks["redis"] = "ok"
        else:
            checks["redis"] = "fallback"
    except Exception:
        checks["redis"] = "error"

    _has_groq   = bool(os.getenv("GROQ_API_KEY"))
    _has_gemini = bool(os.getenv("GOOGLE_GENERATIVE_AI_KEY") or os.getenv("GEMINI_API_KEY"))
    checks["ai_groq"]   = "ok" if _has_groq   else "missing"
    checks["ai_gemini"] = "ok" if _has_gemini else "missing"
    return checks, ready


@app.get("/api/health/live")
def liveness_check():
    """Process-level check. It intentionally does not call external services."""
    return {
        "status": "alive",
        "version": "4.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/health/ready")
def readiness_check():
    """Traffic check used by Docker and the AWS target group."""
    checks, ready = _application_health()
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ready" if ready else "not_ready",
            "version": "4.0.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": checks,
        },
    )


@app.get("/api/health")
def health_check():
    """Detailed diagnostic endpoint retained for operators and dashboards."""
    checks, ready = _application_health()
    has_ai_provider = checks["ai_groq"] == "ok" or checks["ai_gemini"] == "ok"
    overall = "healthy" if ready and has_ai_provider else "degraded"

    status_code = 200 if overall == "healthy" else 207
    return JSONResponse(
        status_code=status_code,
        content={
            "status": overall,
            "version": "4.0.0",
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "checks": checks,
        },
    )

build_dir = Path(__file__).parent.parent / "build"

if build_dir.exists() and os.getenv("SERVE_REACT", "false").lower() == "true":
    app.mount("/static", StaticFiles(directory=build_dir / "static"), name="static")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        file_path = build_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(build_dir / "index.html")
else:
    @app.get("/")
    async def root():
        return {"message": "Brainwave Backend API v4.0.0", "status": "running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("RELOAD", "false").lower() == "true",
        log_level="info",
    )
