import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


def load_backend_env() -> None:
    if os.getenv("CERBYL_NO_ENV_FILES") == "1":
        return
    backend_dir = Path(__file__).resolve().parent
    load_dotenv()
    load_dotenv(backend_dir / ".env.ai.local", override=True)
    _set_single_key_from_pool("GROQ_API_KEY", "GROQ_API_KEYS")
    _set_single_key_from_pool("GOOGLE_GENERATIVE_AI_KEY", "GOOGLE_GENERATIVE_AI_KEYS", "GEMINI_API_KEYS")
    _set_single_key_from_pool("GEMINI_API_KEY", "GEMINI_API_KEYS", "GOOGLE_GENERATIVE_AI_KEYS")
    _set_single_key_from_pool("HS_CONTEXT_API_KEY", "HS_CONTEXT_API_KEYS")


def _set_single_key_from_pool(single_name: str, *pool_names: str) -> None:
    if os.getenv(single_name):
        return
    for pool_name in pool_names:
        first_key = _first_csv_value(os.getenv(pool_name))
        if first_key:
            os.environ[single_name] = first_key
            return


def _first_csv_value(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    for part in value.split(","):
        cleaned = part.strip()
        if cleaned and not _is_placeholder_key(cleaned):
            return cleaned
    return None


def _is_placeholder_key(value: str) -> bool:
    lowered = value.strip().lower()
    return (
        lowered.startswith("your-")
        or lowered.startswith("replace-")
        or lowered.startswith("example-")
        or lowered.startswith("gemini-key-")
        or lowered.startswith("groq-key-")
        or lowered in {"key-1", "key-2", "key-3", "api-key-1", "api-key-2", "api-key-3"}
    )
