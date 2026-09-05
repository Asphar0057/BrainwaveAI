import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import text

from activity_context import add_provider_usage_delta
from database import engine

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ApiKeyLease:
    provider: str
    fingerprint: str
    token: str
    reserved_tokens: int


@dataclass(frozen=True)
class ApiKeyEntry:
    provider: str
    fingerprint: str
    token: str
    daily_limit: int


class ApiKeyPoolExhausted(Exception):
    def __init__(
        self,
        message: str,
        *,
        provider: str | None = None,
        reset_at: str | None = None,
        reset_after_seconds: int | None = None,
    ):
        super().__init__(message)
        self.provider = provider
        self.reset_at = reset_at
        self.reset_after_seconds = reset_after_seconds


class ApiKeyPool:
    def __init__(self, provider: str, keys: Iterable[str], daily_limit: int = 1_000_000):
        self.provider = provider
        self.entries = [
            ApiKeyEntry(
                provider=provider,
                fingerprint=_fingerprint(provider, token),
                token=token,
                daily_limit=daily_limit,
            )
            for token in _dedupe_keys(keys)
        ]
        self.enabled = bool(self.entries)
        if self.enabled:
            _ensure_usage_table()

    def reserve(self, estimated_tokens: int) -> ApiKeyLease:
        if not self.entries:
            raise ApiKeyPoolExhausted(
                f"No {self.provider} API keys are configured",
                provider=self.provider,
            )

        today = _today()
        now = _now()
        reserve_tokens = max(1, int(estimated_tokens or 1))

        for entry in self.entries:
            _ensure_usage_row(entry, today)
            with engine.begin() as conn:
                result = conn.execute(
                    text(
                        """
                        UPDATE api_key_pool_usage
                        SET used_tokens = used_tokens + :reserve_tokens,
                            updated_at = :now
                        WHERE provider = :provider
                          AND key_fingerprint = :fingerprint
                          AND usage_day = :usage_day
                          AND used_tokens + :reserve_tokens <= daily_limit
                          AND (
                            exhausted_until IS NULL
                            OR exhausted_until <= :now
                          )
                        """
                    ),
                    {
                        "reserve_tokens": reserve_tokens,
                        "now": now,
                        "provider": entry.provider,
                        "fingerprint": entry.fingerprint,
                        "usage_day": today,
                    },
                )
                if result.rowcount:
                    return ApiKeyLease(
                        provider=entry.provider,
                        fingerprint=entry.fingerprint,
                        token=entry.token,
                        reserved_tokens=reserve_tokens,
                    )

        reset_at = self.next_available_at(reserve_tokens)
        raise ApiKeyPoolExhausted(
            f"All {self.provider} API keys are over daily quota",
            provider=self.provider,
            reset_at=reset_at,
            reset_after_seconds=_seconds_until(reset_at),
        )

    def next_available_at(self, estimated_tokens: int = 1) -> str:
        reserve_tokens = max(1, int(estimated_tokens or 1))
        if not self.entries:
            return _next_utc_midnight()

        today = _today()
        now_iso = _now()
        next_times: list[str] = []

        for entry in self.entries:
            _ensure_usage_row(entry, today)
            with engine.connect() as conn:
                row = conn.execute(
                    text(
                        """
                        SELECT daily_limit, used_tokens, exhausted_until
                        FROM api_key_pool_usage
                        WHERE provider = :provider
                          AND key_fingerprint = :fingerprint
                          AND usage_day = :usage_day
                        """
                    ),
                    {
                        "provider": entry.provider,
                        "fingerprint": entry.fingerprint,
                        "usage_day": today,
                    },
                ).mappings().first()

            daily_limit = int((row or {}).get("daily_limit") or entry.daily_limit)
            used_tokens = int((row or {}).get("used_tokens") or 0)
            exhausted_until = (row or {}).get("exhausted_until")
            candidates = [now_iso]
            if used_tokens + reserve_tokens > daily_limit:
                candidates.append(_next_utc_midnight())
            if exhausted_until and str(exhausted_until) > now_iso:
                candidates.append(str(exhausted_until))
            next_times.append(max(candidates))

        return min(next_times) if next_times else _next_utc_midnight()

    def record_success(self, lease: ApiKeyLease, actual_tokens: Optional[int]) -> None:
        if not lease:
            return
        actual = max(0, int(actual_tokens or lease.reserved_tokens))
        adjustment = actual - lease.reserved_tokens
        if adjustment == 0:
            add_provider_usage_delta(actual)
            return
        with engine.begin() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT used_tokens
                    FROM api_key_pool_usage
                    WHERE provider = :provider
                      AND key_fingerprint = :fingerprint
                      AND usage_day = :usage_day
                    """
                ),
                {
                    "provider": lease.provider,
                    "fingerprint": lease.fingerprint,
                    "usage_day": _today(),
                },
            ).first()
            used_tokens = row[0] if row else 0
            conn.execute(
                text(
                    """
                    UPDATE api_key_pool_usage
                    SET used_tokens = :used_tokens,
                        updated_at = :now
                    WHERE provider = :provider
                      AND key_fingerprint = :fingerprint
                      AND usage_day = :usage_day
                    """
                ),
                {
                    "used_tokens": max(0, used_tokens + adjustment),
                    "now": _now(),
                    "provider": lease.provider,
                    "fingerprint": lease.fingerprint,
                    "usage_day": _today(),
                },
            )
        add_provider_usage_delta(actual)

    def release(self, lease: ApiKeyLease) -> None:
        if not lease:
            return
        with engine.begin() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT used_tokens
                    FROM api_key_pool_usage
                    WHERE provider = :provider
                      AND key_fingerprint = :fingerprint
                      AND usage_day = :usage_day
                    """
                ),
                {
                    "provider": lease.provider,
                    "fingerprint": lease.fingerprint,
                    "usage_day": _today(),
                },
            ).first()
            used_tokens = row[0] if row else 0
            conn.execute(
                text(
                    """
                    UPDATE api_key_pool_usage
                    SET used_tokens = :used_tokens,
                        updated_at = :now
                    WHERE provider = :provider
                      AND key_fingerprint = :fingerprint
                      AND usage_day = :usage_day
                    """
                ),
                {
                    "used_tokens": max(0, used_tokens - lease.reserved_tokens),
                    "now": _now(),
                    "provider": lease.provider,
                    "fingerprint": lease.fingerprint,
                    "usage_day": _today(),
                },
            )

    # Called whenever a provider response merely LOOKS quota/rate-limit-shaped
    # (see UnifiedAIClient._is_quota_error's "429"/"quota"/"rate limit" string
    # match) -- that heuristic can't tell a genuine full-day quota exhaustion
    # apart from a transient per-minute rate-limit burst. A 24h cooldown here
    # used to mean ANY single rate-limit blip locked out the only configured
    # key (there's just one Gemini key in production) for the rest of the
    # day, even though the provider itself had already recovered within
    # seconds -- reproduced live 2026-09-04: this table showed exhausted_until
    # ~24h out while a direct call to the same Gemini key succeeded normally.
    # The daily token-budget check (used_tokens vs daily_limit, reset at UTC
    # midnight via usage_day) is the real, correctly-scoped guard against
    # genuine daily exhaustion; this cooldown only needs to ride out a burst.
    def mark_exhausted(self, lease: ApiKeyLease, cooldown_seconds: int = 120) -> None:
        if not lease:
            return
        exhausted_until = (
            datetime.now(timezone.utc) + timedelta(seconds=cooldown_seconds)
        ).isoformat()
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    UPDATE api_key_pool_usage
                    SET exhausted_until = :exhausted_until,
                        updated_at = :now
                    WHERE provider = :provider
                      AND key_fingerprint = :fingerprint
                      AND usage_day = :usage_day
                    """
                ),
                {
                    "exhausted_until": exhausted_until,
                    "now": _now(),
                    "provider": lease.provider,
                    "fingerprint": lease.fingerprint,
                    "usage_day": _today(),
                },
            )


def build_key_pool(
    provider: str,
    env_names: Iterable[str],
    # A single vision request costs roughly 3,000-6,000 tokens (image + Gemini's
    # internal "thinking" + answer), so a low cap here throttles real production
    # traffic, not just abuse. 1,000,000/day/key supports ~150-300 image
    # analyses/day/key plus ordinary text-chat traffic; override per-provider
    # via GEMINI_DAILY_TOKEN_LIMIT / GROQ_DAILY_TOKEN_LIMIT / etc, or globally
    # via AI_KEY_DAILY_TOKEN_LIMIT (see _get_daily_limit).
    default_daily_limit: int = 1_000_000,
) -> ApiKeyPool:
    keys: list[str] = []
    for env_name in env_names:
        keys.extend(_split_env_keys(os.getenv(env_name)))

    limit = _get_daily_limit(provider, default_daily_limit)
    return ApiKeyPool(provider=provider, keys=keys, daily_limit=limit)


def record_provider_usage(provider: str, actual_tokens: Optional[int]) -> None:
    """Add already-completed provider usage to the admin API key totals.

    Some legacy call sites use a direct SDK client instead of reserving a key
    through ApiKeyPool. They still receive exact provider usage metadata and log
    that to the user's token usage. This helper keeps the admin API key page in
    lockstep for those direct calls without changing their request flow.
    """
    actual = max(0, int(actual_tokens or 0))
    if actual <= 0:
        return

    env_names_by_provider = {
        "gemini": ("GEMINI_API_KEYS", "GOOGLE_GENERATIVE_AI_KEYS", "GOOGLE_GENERATIVE_AI_KEY", "GEMINI_API_KEY"),
        "groq": ("GROQ_API_KEYS", "GROQ_API_KEY"),
        "hs_context": ("HS_CONTEXT_API_KEYS",),
    }
    env_names = env_names_by_provider.get(provider)
    if not env_names:
        return

    pool = build_key_pool(provider, env_names)
    if not pool.entries:
        return

    today = _today()
    now = _now()
    entry = pool.entries[0]
    _ensure_usage_row(entry, today)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE api_key_pool_usage
                SET used_tokens = used_tokens + :actual_tokens,
                    updated_at = :now
                WHERE provider = :provider
                  AND key_fingerprint = :fingerprint
                  AND usage_day = :usage_day
                """
            ),
            {
                "actual_tokens": actual,
                "now": now,
                "provider": entry.provider,
                "fingerprint": entry.fingerprint,
                "usage_day": today,
            },
        )
    add_provider_usage_delta(actual)


def provider_limit_exhausted(
    provider: str,
    message: Optional[str] = None,
    cooldown_seconds: Optional[int] = None,
) -> ApiKeyPoolExhausted:
    if cooldown_seconds is not None:
        reset_at = (datetime.now(timezone.utc) + timedelta(seconds=cooldown_seconds)).isoformat()
    else:
        reset_at = _next_utc_midnight()
    return ApiKeyPoolExhausted(
        message or f"{provider} API usage limit exhausted",
        provider=provider,
        reset_at=reset_at,
        reset_after_seconds=_seconds_until(reset_at),
    )


def get_provider_daily_reset(provider: str = "groq") -> dict:
    reset_at = _next_utc_midnight()
    return {
        "provider": provider,
        "reset_at": reset_at,
        "reset_after_seconds": _seconds_until(reset_at),
        "usage_day": _today(),
        "timezone": "UTC",
    }


def is_provider_quota_error(error: Exception) -> bool:
    text_value = str(error).lower()
    return (
        "429" in text_value
        or "rate_limit" in text_value
        or "rate limit" in text_value
        or "tokens per day" in text_value
        or "tpd" in text_value
        or "tpm" in text_value
        or "quota" in text_value
        or "insufficient_quota" in text_value
    )


def get_usage_snapshot() -> dict:
    _ensure_usage_table()
    today = _today()
    configured_pools = [
        ("gemini", ("GEMINI_API_KEYS", "GOOGLE_GENERATIVE_AI_KEYS", "GOOGLE_GENERATIVE_AI_KEY", "GEMINI_API_KEY")),
        ("groq", ("GROQ_API_KEYS", "GROQ_API_KEY")),
    ]
    if os.getenv("HS_CONTEXT_API_KEYS"):
        configured_pools.append(("hs_context", ("HS_CONTEXT_API_KEYS",)))

    entries = []
    for provider, env_names in configured_pools:
        pool = build_key_pool(provider, env_names)
        for index, entry in enumerate(pool.entries, start=1):
            _ensure_usage_row(entry, today)
            entries.append((index, entry))

    rows_by_key = {}
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT provider, key_fingerprint, usage_day, daily_limit, used_tokens, exhausted_until, updated_at
                FROM api_key_pool_usage
                WHERE usage_day = :usage_day
                ORDER BY provider, key_fingerprint
                """
            ),
            {"usage_day": today},
        ).mappings().all()
    for row in rows:
        rows_by_key[(row["provider"], row["key_fingerprint"])] = dict(row)

    seen = set()
    key_usage = []
    provider_totals = {}

    for index, entry in entries:
        row = rows_by_key.get((entry.provider, entry.fingerprint), {})
        item = _format_usage_item(
            provider=entry.provider,
            key_index=index,
            fingerprint=entry.fingerprint,
            daily_limit=int(row.get("daily_limit") or entry.daily_limit),
            used_tokens=int(row.get("used_tokens") or 0),
            exhausted_until=row.get("exhausted_until"),
            updated_at=row.get("updated_at"),
            configured=True,
        )
        key_usage.append(item)
        _add_provider_total(provider_totals, item)
        seen.add((entry.provider, entry.fingerprint))

    return {
        "usage_day": today,
        "generated_at": _now(),
        "keys": key_usage,
        "providers": sorted(provider_totals.values(), key=lambda item: item["provider"]),
        "totals": _total_usage(provider_totals.values()),
    }


def _ensure_usage_table() -> None:
    """Verify api_key_pool_usage exists. Schema is owned by Alembic
    (alembic/versions/8daf5b6d92ed_raw_analytics_tables_activity_log_and_.py),
    not created here. Non-fatal: this runs at import time (via build_key_pool),
    which can happen before the startup migration has run on a brand-new
    database — by the time any request actually uses the pool, migrations
    have completed and the table exists."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1 FROM api_key_pool_usage LIMIT 1"))
    except Exception as e:
        logger.warning("api_key_pool_usage not yet available (%s) — will exist after migrations run", e)


def _format_usage_item(
    provider: str,
    key_index: Optional[int],
    fingerprint: str,
    daily_limit: int,
    used_tokens: int,
    exhausted_until: Optional[str],
    updated_at: Optional[str],
    configured: bool,
) -> dict:
    remaining_tokens = max(0, daily_limit - used_tokens)
    usage_percent = round((used_tokens / daily_limit) * 100, 1) if daily_limit else 0
    return {
        "provider": provider,
        "key_label": f"Key {key_index}" if key_index else "Removed key",
        "fingerprint": fingerprint,
        "short_fingerprint": fingerprint[-8:],
        "daily_limit": daily_limit,
        "used_tokens": used_tokens,
        "remaining_tokens": remaining_tokens,
        "usage_percent": min(100, usage_percent),
        "exhausted_until": exhausted_until,
        "is_exhausted": bool(exhausted_until and exhausted_until > _now()),
        "updated_at": updated_at,
        "configured": configured,
    }


def _add_provider_total(provider_totals: dict, item: dict) -> None:
    provider = item["provider"]
    total = provider_totals.setdefault(
        provider,
        {
            "provider": provider,
            "key_count": 0,
            "daily_limit": 0,
            "used_tokens": 0,
            "remaining_tokens": 0,
            "exhausted_keys": 0,
        },
    )
    total["key_count"] += 1
    total["daily_limit"] += item["daily_limit"]
    total["used_tokens"] += item["used_tokens"]
    total["remaining_tokens"] += item["remaining_tokens"]
    if item["is_exhausted"]:
        total["exhausted_keys"] += 1
    total["usage_percent"] = (
        round((total["used_tokens"] / total["daily_limit"]) * 100, 1)
        if total["daily_limit"]
        else 0
    )


def _total_usage(provider_totals: Iterable[dict]) -> dict:
    totals = {
        "key_count": 0,
        "daily_limit": 0,
        "used_tokens": 0,
        "remaining_tokens": 0,
        "exhausted_keys": 0,
    }
    for provider in provider_totals:
        totals["key_count"] += provider["key_count"]
        totals["daily_limit"] += provider["daily_limit"]
        totals["used_tokens"] += provider["used_tokens"]
        totals["remaining_tokens"] += provider["remaining_tokens"]
        totals["exhausted_keys"] += provider["exhausted_keys"]
    totals["usage_percent"] = (
        round((totals["used_tokens"] / totals["daily_limit"]) * 100, 1)
        if totals["daily_limit"]
        else 0
    )
    return totals


def _ensure_usage_row(entry: ApiKeyEntry, usage_day: str) -> None:
    now = _now()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO api_key_pool_usage (
                    provider, key_fingerprint, usage_day, daily_limit, used_tokens, updated_at
                )
                VALUES (
                    :provider, :fingerprint, :usage_day, :daily_limit, 0, :now
                )
                ON CONFLICT (provider, key_fingerprint, usage_day) DO NOTHING
                """
            ),
            {
                "provider": entry.provider,
                "fingerprint": entry.fingerprint,
                "usage_day": usage_day,
                "daily_limit": entry.daily_limit,
                "now": now,
            },
        )


def _get_daily_limit(provider: str, default_daily_limit: int) -> int:
    names = [
        f"{provider.upper()}_DAILY_TOKEN_LIMIT",
        "AI_KEY_DAILY_TOKEN_LIMIT",
    ]
    for name in names:
        value = os.getenv(name)
        if value:
            try:
                return max(1, int(value))
            except ValueError:
                logger.warning("Invalid %s=%s; using %s", name, value, default_daily_limit)
    return default_daily_limit


def _split_env_keys(value: Optional[str]) -> list[str]:
    if not value:
        return []
    return [
        part.strip()
        for part in value.split(",")
        if part.strip() and not _is_placeholder_key(part.strip())
    ]


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


def _dedupe_keys(keys: Iterable[str]) -> list[str]:
    seen = set()
    deduped = []
    for key in keys:
        if key in seen:
            continue
        seen.add(key)
        deduped.append(key)
    return deduped


def _fingerprint(provider: str, token: str) -> str:
    return hashlib.sha256(f"{provider}:{token}".encode("utf-8")).hexdigest()[:24]


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _next_utc_midnight() -> str:
    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).date()
    return datetime(tomorrow.year, tomorrow.month, tomorrow.day, tzinfo=timezone.utc).isoformat()


def _seconds_until(reset_at: str | None) -> int | None:
    if not reset_at:
        return None
    try:
        target = datetime.fromisoformat(str(reset_at).replace("Z", "+00:00"))
        if target.tzinfo is None:
            target = target.replace(tzinfo=timezone.utc)
        return max(0, int((target.astimezone(timezone.utc) - datetime.now(timezone.utc)).total_seconds()))
    except Exception:
        return None
