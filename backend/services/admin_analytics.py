from fastapi import Depends, HTTPException, Header, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import csv
import io
import json
from datetime import datetime, timedelta, timezone
import os
from typing import Optional
from jose import JWTError, jwt
from sqlalchemy import text
from database import engine
from activity_logger import ensure_activity_log_table

def _safe_json_loads(value):
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value)
    except Exception:
        return {}

def _parse_timestamp(value):
    if not value:
        return None
    try:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str) and value.endswith('Z'):
            value = value.replace('Z', '+00:00')
        return datetime.fromisoformat(value)
    except Exception:
        return None

def _is_ai_activity(tool_name: str, action: str, metadata: dict) -> bool:
    if metadata.get('token_source') == 'none':
        return False
    if metadata.get('prompt_tokens') or metadata.get('completion_tokens'):
        return True
    if metadata.get('token_source') == 'model_usage':
        return True
    if action == 'ai_generate':
        return True
    if tool_name and (tool_name.startswith('ai_') or tool_name.endswith('_ai') or 'ai' in tool_name):
        return True
    return False

_admin_bearer = HTTPBearer()

ADMIN_EMAILS = frozenset(os.getenv("ADMIN_EMAILS", "").split(",")) - {""}

def _get_secret_key():
    key = os.getenv("SECRET_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="Server configuration error")
    return key

def _db_fetch_one(query: str, params: Optional[dict] = None):
    with engine.connect() as conn:
        row = conn.execute(text(query), params or {}).mappings().first()
    return dict(row) if row else None

def _db_fetch_all(query: str, params: Optional[dict] = None):
    with engine.connect() as conn:
        rows = conn.execute(text(query), params or {}).mappings().all()
    return [dict(row) for row in rows]

def check_admin(credentials: HTTPAuthorizationCredentials = Depends(_admin_bearer)):
    try:
        payload = jwt.decode(
            credentials.credentials,
            _get_secret_key(),
            algorithms=["HS256"],
            audience="brainwave-client",
            issuer="brainwave-backend",
        )
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=403, detail="Admin access required")
    except JWTError:
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        row = _db_fetch_one(
            "SELECT email FROM users WHERE username = :subject OR email = :subject LIMIT 1",
            {"subject": sub},
        )
        if row and row.get("email") in ADMIN_EMAILS:
            return row["email"]
    except Exception:
        pass

    raise HTTPException(status_code=403, detail="Admin access required")

def get_analytics_overview(days: int = 30):
    try:
        ensure_activity_log_table()
        
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        total_users_row = _db_fetch_one("SELECT COUNT(*) as count FROM users")
        total_users = int((total_users_row or {}).get("count") or 0)

        try:
            new_users_row = _db_fetch_one(
                "SELECT COUNT(*) as count FROM users WHERE created_at >= :start_date",
                {"start_date": start_date},
            )
            new_users = int((new_users_row or {}).get("count") or 0)
        except Exception:
            new_users = 0

        rows = _db_fetch_all("""
            SELECT * FROM user_activity_log
            WHERE timestamp >= :start_date
        """, {"start_date": start_date})

        total_requests = 0
        active_users = len({row['user_id'] for row in rows if row.get('user_id')})

        total_tokens = 0
        ai_tokens = 0
        ai_prompt_tokens = 0
        ai_completion_tokens = 0
        ai_requests = 0
        ai_requests_with_usage = 0

        latency_sum = 0
        latency_count = 0
        ai_latency_sum = 0
        ai_latency_count = 0
        error_count = 0
        ai_error_count = 0

        token_sources = {}
        tool_stats = {}
        model_stats = {}
        provider_stats = {}
        endpoint_stats = {}
        action_stats = {}
        status_codes = {}
        status_buckets = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, "unknown": 0}
        hourly_usage = {}
        user_rollups = {}
        request_event_seen = False

        today = datetime.now(timezone.utc).date()
        daily_usage = {}
        for i in range(days - 1, -1, -1):
            day = today - timedelta(days=i)
            daily_usage[day.isoformat()] = {
                "date": day.isoformat(),
                "total_tokens": 0,
                "ai_tokens": 0,
                "requests": 0,
                "ai_requests": 0,
                "errors": 0
            }

        for hour in range(24):
            hourly_usage[hour] = {
                "hour": hour,
                "requests": 0,
                "ai_requests": 0,
                "total_tokens": 0,
                "ai_tokens": 0,
                "errors": 0
            }

        for row in rows:
            metadata = _safe_json_loads(row.get('metadata'))
            tool_name = row.get('tool_name') or 'unknown'
            action = row.get('action')
            tokens_used = row.get('tokens_used') or 0
            total_tokens += tokens_used

            is_request_event = metadata.get('event_type') == 'request'
            if is_request_event:
                total_requests += 1
                request_event_seen = True

            token_source = metadata.get('token_source') or 'unknown'
            token_sources[token_source] = token_sources.get(token_source, 0) + 1

            prompt_tokens = metadata.get('prompt_tokens') or 0
            completion_tokens = metadata.get('completion_tokens') or 0

            is_ai = _is_ai_activity(tool_name, action, metadata)
            if is_ai:
                ai_requests += 1
                ai_tokens += tokens_used
                ai_prompt_tokens += prompt_tokens
                ai_completion_tokens += completion_tokens
                if prompt_tokens or completion_tokens or token_source == 'model_usage':
                    ai_requests_with_usage += 1

            duration = metadata.get('duration_seconds')
            if isinstance(duration, (int, float)):
                latency_sum += duration
                latency_count += 1
                if is_ai:
                    ai_latency_sum += duration
                    ai_latency_count += 1

            status_code = metadata.get('status_code')
            if isinstance(status_code, int) and status_code >= 400:
                error_count += 1
                if is_ai:
                    ai_error_count += 1

            if isinstance(status_code, int):
                status_codes[status_code] = status_codes.get(status_code, 0) + 1
                if 200 <= status_code < 300:
                    status_buckets["2xx"] += 1
                elif 300 <= status_code < 400:
                    status_buckets["3xx"] += 1
                elif 400 <= status_code < 500:
                    status_buckets["4xx"] += 1
                elif 500 <= status_code < 600:
                    status_buckets["5xx"] += 1
                else:
                    status_buckets["unknown"] += 1
            else:
                status_buckets["unknown"] += 1

            ts = _parse_timestamp(row.get('timestamp'))
            if ts:
                key = ts.date().isoformat()
                if key in daily_usage:
                    daily_usage[key]["total_tokens"] += tokens_used
                    daily_usage[key]["requests"] += 1
                    if is_ai:
                        daily_usage[key]["ai_tokens"] += tokens_used
                        daily_usage[key]["ai_requests"] += 1
                    if isinstance(status_code, int) and status_code >= 400:
                        daily_usage[key]["errors"] += 1

                hour_key = ts.hour
                if hour_key in hourly_usage:
                    hourly_usage[hour_key]["total_tokens"] += tokens_used
                    hourly_usage[hour_key]["requests"] += 1
                    if is_ai:
                        hourly_usage[hour_key]["ai_tokens"] += tokens_used
                        hourly_usage[hour_key]["ai_requests"] += 1
                    if isinstance(status_code, int) and status_code >= 400:
                        hourly_usage[hour_key]["errors"] += 1

            tool = tool_stats.setdefault(tool_name, {
                "tool_name": tool_name,
                "usage_count": 0,
                "total_tokens": 0,
                "ai_tokens": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "ai_requests": 0,
                "latency_sum": 0,
                "latency_count": 0,
                "error_count": 0,
                "last_activity": None
            })
            tool["usage_count"] += 1
            tool["total_tokens"] += tokens_used
            if is_ai:
                tool["ai_tokens"] += tokens_used
                tool["ai_requests"] += 1
            tool["prompt_tokens"] += prompt_tokens
            tool["completion_tokens"] += completion_tokens
            if isinstance(duration, (int, float)):
                tool["latency_sum"] += duration
                tool["latency_count"] += 1
            if isinstance(status_code, int) and status_code >= 400:
                tool["error_count"] += 1
            if row.get('timestamp'):
                current = _parse_timestamp(tool.get("last_activity"))
                candidate = _parse_timestamp(row.get('timestamp'))
                if candidate and (current is None or candidate > current):
                    tool["last_activity"] = row.get('timestamp')

            provider = metadata.get('provider')
            if provider:
                provider_stat = provider_stats.setdefault(provider, {
                    "provider": provider,
                    "usage_count": 0,
                    "total_tokens": 0,
                    "ai_tokens": 0,
                    "latency_sum": 0,
                    "latency_count": 0,
                    "error_count": 0
                })
                provider_stat["usage_count"] += 1
                provider_stat["total_tokens"] += tokens_used
                if is_ai:
                    provider_stat["ai_tokens"] += tokens_used
                if isinstance(duration, (int, float)):
                    provider_stat["latency_sum"] += duration
                    provider_stat["latency_count"] += 1
                if isinstance(status_code, int) and status_code >= 400:
                    provider_stat["error_count"] += 1

            endpoint = metadata.get('endpoint')
            method = metadata.get('method') or ''
            if endpoint:
                endpoint_key = f"{method} {endpoint}".strip()
                endpoint_stat = endpoint_stats.setdefault(endpoint_key, {
                    "endpoint": endpoint,
                    "method": method,
                    "usage_count": 0,
                    "total_tokens": 0,
                    "ai_tokens": 0,
                    "ai_requests": 0,
                    "latency_sum": 0,
                    "latency_count": 0,
                    "error_count": 0
                })
                endpoint_stat["usage_count"] += 1
                endpoint_stat["total_tokens"] += tokens_used
                if is_ai:
                    endpoint_stat["ai_tokens"] += tokens_used
                    endpoint_stat["ai_requests"] += 1
                if isinstance(duration, (int, float)):
                    endpoint_stat["latency_sum"] += duration
                    endpoint_stat["latency_count"] += 1
                if isinstance(status_code, int) and status_code >= 400:
                    endpoint_stat["error_count"] += 1

            if action:
                action_stat = action_stats.setdefault(action, {
                    "action": action,
                    "usage_count": 0,
                    "total_tokens": 0,
                    "ai_tokens": 0
                })
                action_stat["usage_count"] += 1
                action_stat["total_tokens"] += tokens_used
                if is_ai:
                    action_stat["ai_tokens"] += tokens_used

            model_name = metadata.get('model')
            if model_name:
                model = model_stats.setdefault(model_name, {
                    "model": model_name,
                    "total_tokens": 0,
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "requests": 0
                })
                model["total_tokens"] += tokens_used
                model["prompt_tokens"] += prompt_tokens
                model["completion_tokens"] += completion_tokens
                if is_ai:
                    model["requests"] += 1

            uid = row.get('user_id')
            if uid is not None:
                user_stat = user_rollups.setdefault(uid, {
                    "activity_count": 0,
                    "request_count": 0,
                    "total_tokens": 0,
                    "ai_tokens": 0,
                    "ai_requests": 0,
                    "error_count": 0,
                    "last_activity": None
                })
                user_stat["activity_count"] += 1
                if is_request_event:
                    user_stat["request_count"] += 1
                user_stat["total_tokens"] += tokens_used
                if is_ai:
                    user_stat["ai_tokens"] += tokens_used
                    user_stat["ai_requests"] += 1
                if isinstance(status_code, int) and status_code >= 400:
                    user_stat["error_count"] += 1
                if row.get('timestamp'):
                    current = _parse_timestamp(user_stat.get("last_activity"))
                    candidate = _parse_timestamp(row.get('timestamp'))
                    if candidate and (current is None or candidate > current):
                        user_stat["last_activity"] = row.get('timestamp')

        tool_usage = []
        for tool in tool_stats.values():
            avg_tokens = 0
            if tool["ai_requests"] > 0:
                avg_tokens = tool["ai_tokens"] / tool["ai_requests"]
            avg_latency = 0
            if tool["latency_count"] > 0:
                avg_latency = tool["latency_sum"] / tool["latency_count"]
            error_rate = 0
            if tool["usage_count"] > 0:
                error_rate = tool["error_count"] / tool["usage_count"]

            tool_usage.append({
                "tool_name": tool["tool_name"],
                "usage_count": tool["usage_count"],
                "total_tokens": tool["total_tokens"],
                "ai_tokens": tool["ai_tokens"],
                "prompt_tokens": tool["prompt_tokens"],
                "completion_tokens": tool["completion_tokens"],
                "ai_requests": tool["ai_requests"],
                "avg_tokens": avg_tokens,
                "avg_latency": avg_latency,
                "error_rate": error_rate,
                "last_activity": tool["last_activity"]
            })

        tool_usage.sort(key=lambda t: (t["ai_tokens"], t["usage_count"]), reverse=True)

        provider_usage = []
        for provider in provider_stats.values():
            avg_latency = 0
            if provider["latency_count"] > 0:
                avg_latency = provider["latency_sum"] / provider["latency_count"]
            error_rate = 0
            if provider["usage_count"] > 0:
                error_rate = provider["error_count"] / provider["usage_count"]
            provider_usage.append({
                "provider": provider["provider"],
                "usage_count": provider["usage_count"],
                "total_tokens": provider["total_tokens"],
                "ai_tokens": provider["ai_tokens"],
                "avg_latency": avg_latency,
                "error_rate": error_rate
            })
        provider_usage.sort(key=lambda p: (p["ai_tokens"], p["usage_count"]), reverse=True)

        endpoint_usage = []
        for endpoint in endpoint_stats.values():
            avg_latency = 0
            if endpoint["latency_count"] > 0:
                avg_latency = endpoint["latency_sum"] / endpoint["latency_count"]
            error_rate = 0
            if endpoint["usage_count"] > 0:
                error_rate = endpoint["error_count"] / endpoint["usage_count"]
            endpoint_usage.append({
                "endpoint": endpoint["endpoint"],
                "method": endpoint["method"],
                "usage_count": endpoint["usage_count"],
                "total_tokens": endpoint["total_tokens"],
                "ai_tokens": endpoint["ai_tokens"],
                "ai_requests": endpoint["ai_requests"],
                "avg_latency": avg_latency,
                "error_rate": error_rate,
                "error_count": endpoint["error_count"]
            })
        endpoint_usage.sort(key=lambda e: (e["usage_count"], e["ai_tokens"]), reverse=True)

        action_usage = []
        for action in action_stats.values():
            action_usage.append({
                "action": action["action"],
                "usage_count": action["usage_count"],
                "total_tokens": action["total_tokens"],
                "ai_tokens": action["ai_tokens"]
            })
        action_usage.sort(key=lambda a: (a["usage_count"], a["ai_tokens"]), reverse=True)

        status_code_breakdown = [
            {"status_code": code, "count": count}
            for code, count in status_codes.items()
        ]
        status_code_breakdown.sort(key=lambda s: s["count"], reverse=True)

        hourly_usage_list = list(hourly_usage.values())
        hourly_usage_list.sort(key=lambda h: h["hour"])

        ai_token_coverage = 0
        if ai_requests > 0:
            ai_token_coverage = round((ai_requests_with_usage / ai_requests) * 100, 1)

        if total_requests == 0:
            total_requests = len(rows)

        top_users = []
        if user_rollups:
            user_ids = list(user_rollups.keys())
            user_lookup = {}
            try:
                params = {f"user_id_{i}": uid for i, uid in enumerate(user_ids)}
                placeholders = ", ".join(f":user_id_{i}" for i in range(len(user_ids)))
                lookup_rows = _db_fetch_all(
                    f"SELECT id, username, email FROM users WHERE id IN ({placeholders})",
                    params,
                )
                for row in lookup_rows:
                    user_lookup[row["id"]] = {"username": row.get("username"), "email": row.get("email")}
            except Exception:
                user_lookup = {}

            for uid, stats in user_rollups.items():
                user_info = user_lookup.get(uid, {})
                request_count = stats["request_count"] if request_event_seen else stats["activity_count"]
                error_rate_user = 0
                if request_count:
                    error_rate_user = stats["error_count"] / request_count
                top_users.append({
                    "id": uid,
                    "username": user_info.get("username", f"user_{uid}"),
                    "email": user_info.get("email", ""),
                    "requests": request_count,
                    "ai_requests": stats["ai_requests"],
                    "total_tokens": stats["total_tokens"],
                    "ai_tokens": stats["ai_tokens"],
                    "error_rate": error_rate_user,
                    "last_activity": stats.get("last_activity")
                })

            top_users.sort(key=lambda u: (u["ai_tokens"], u["total_tokens"]), reverse=True)
            top_users = top_users[:10]

        avg_latency = round(latency_sum / latency_count, 2) if latency_count else 0
        avg_ai_latency = round(ai_latency_sum / ai_latency_count, 2) if ai_latency_count else 0
        error_rate = round((error_count / total_requests) * 100, 2) if total_requests else 0
        ai_error_rate = round((ai_error_count / ai_requests) * 100, 2) if ai_requests else 0

        return {
            'total_users': total_users,
            'new_users': new_users,
            'active_users': active_users,
            'total_requests': total_requests,
            'total_tokens': total_tokens,
            'ai_requests': ai_requests,
            'ai_tokens': ai_tokens,
            'ai_prompt_tokens': ai_prompt_tokens,
            'ai_completion_tokens': ai_completion_tokens,
            'ai_token_coverage': ai_token_coverage,
            'avg_latency': avg_latency,
            'avg_ai_latency': avg_ai_latency,
            'error_rate': error_rate,
            'ai_error_rate': ai_error_rate,
            'token_sources': token_sources,
            'tool_usage': tool_usage,
            'daily_usage': list(daily_usage.values()),
            'model_usage': list(model_stats.values()),
            'provider_usage': provider_usage,
            'endpoint_usage': endpoint_usage,
            'action_usage': action_usage,
            'status_code_breakdown': status_code_breakdown,
            'status_bucket_breakdown': status_buckets,
            'hourly_usage': hourly_usage_list,
            'top_users': top_users,
            'date_range': days
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

def get_user_analytics(days: int = 30):
    try:
        ensure_activity_log_table()
        
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

        users = _db_fetch_all("""
            SELECT id, username, email, created_at
            FROM users
            ORDER BY created_at DESC
        """)

        rows = _db_fetch_all("""
            SELECT * FROM user_activity_log
            WHERE timestamp >= :start_date
        """, {"start_date": start_date})

        user_stats = {}
        for row in rows:
            uid = row.get('user_id')
            if uid is None:
                continue
            metadata = _safe_json_loads(row.get('metadata'))
            tool_name = row.get('tool_name') or 'unknown'
            action = row.get('action')
            tokens_used = row.get('tokens_used') or 0
            prompt_tokens = metadata.get('prompt_tokens') or 0
            completion_tokens = metadata.get('completion_tokens') or 0
            token_source = metadata.get('token_source')
            is_ai = _is_ai_activity(tool_name, action, metadata)

            stats = user_stats.setdefault(uid, {
                "total_activities": 0,
                "total_tokens": 0,
                "ai_tokens": 0,
                "ai_requests": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "last_activity": None,
                "tools_used": set(),
                "error_count": 0,
                "latency_sum": 0,
                "latency_count": 0,
                "ai_requests_with_usage": 0
            })

            stats["total_activities"] += 1
            stats["total_tokens"] += tokens_used
            stats["tools_used"].add(tool_name)

            if is_ai:
                stats["ai_requests"] += 1
                stats["ai_tokens"] += tokens_used
                stats["prompt_tokens"] += prompt_tokens
                stats["completion_tokens"] += completion_tokens
                if prompt_tokens or completion_tokens or token_source == 'model_usage':
                    stats["ai_requests_with_usage"] += 1

            ts = _parse_timestamp(row.get('timestamp'))
            if ts:
                current = _parse_timestamp(stats.get("last_activity"))
                if current is None or ts > current:
                    stats["last_activity"] = row.get('timestamp')

            status_code = metadata.get('status_code')
            if isinstance(status_code, int) and status_code >= 400:
                stats["error_count"] += 1

            duration = metadata.get('duration_seconds')
            if isinstance(duration, (int, float)):
                stats["latency_sum"] += duration
                stats["latency_count"] += 1

        enriched_users = []
        for user in users:
            stats = user_stats.get(user["id"], {})
            ai_requests = stats.get("ai_requests", 0)
            ai_token_coverage = 0
            if ai_requests:
                ai_token_coverage = round((stats.get("ai_requests_with_usage", 0) / ai_requests) * 100, 1)

            avg_latency = 0
            if stats.get("latency_count", 0):
                avg_latency = stats.get("latency_sum", 0) / stats.get("latency_count", 0)

            enriched_users.append({
                **user,
                "total_activities": stats.get("total_activities", 0),
                "total_tokens": stats.get("total_tokens", 0),
                "ai_tokens": stats.get("ai_tokens", 0),
                "ai_requests": ai_requests,
                "prompt_tokens": stats.get("prompt_tokens", 0),
                "completion_tokens": stats.get("completion_tokens", 0),
                "ai_token_coverage": ai_token_coverage,
                "last_activity": stats.get("last_activity"),
                "tools_used": ", ".join(sorted(list(stats.get("tools_used", set())))) if stats else "",
                "error_rate": round((stats.get("error_count", 0) / stats.get("total_activities", 1)) * 100, 2) if stats else 0,
                "avg_latency": round(avg_latency, 2)
            })

        enriched_users.sort(key=lambda u: (u.get("ai_tokens", 0), u.get("total_tokens", 0)), reverse=True)

        return {'users': enriched_users}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

def get_user_detail(target_user_id: int):
    try:
        ensure_activity_log_table()
        
        user_row = _db_fetch_one(
            "SELECT * FROM users WHERE id = :target_user_id",
            {"target_user_id": target_user_id},
        )
        if not user_row:
            raise HTTPException(status_code=404, detail='User not found')
        user = dict(user_row)
        
        raw_activities = _db_fetch_all("""
            SELECT * FROM user_activity_log 
            WHERE user_id = :target_user_id
            ORDER BY timestamp DESC
            LIMIT 1000
        """, {"target_user_id": target_user_id})

        activities = []
        tool_stats = {}
        ai_requests = 0
        ai_requests_with_usage = 0
        ai_tokens = 0
        prompt_tokens_total = 0
        completion_tokens_total = 0

        for row in raw_activities:
            metadata = _safe_json_loads(row.get('metadata'))
            tool_name = row.get('tool_name') or 'unknown'
            action = row.get('action')
            tokens_used = row.get('tokens_used') or 0
            prompt_tokens = metadata.get('prompt_tokens') or 0
            completion_tokens = metadata.get('completion_tokens') or 0
            token_source = metadata.get('token_source')
            is_ai = _is_ai_activity(tool_name, action, metadata)

            if is_ai:
                ai_requests += 1
                ai_tokens += tokens_used
                prompt_tokens_total += prompt_tokens
                completion_tokens_total += completion_tokens
                if prompt_tokens or completion_tokens or token_source == 'model_usage':
                    ai_requests_with_usage += 1

            activity = {
                **row,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "model": metadata.get('model'),
                "provider": metadata.get('provider'),
                "endpoint": metadata.get('endpoint'),
                "method": metadata.get('method'),
                "status_code": metadata.get('status_code'),
                "duration_seconds": metadata.get('duration_seconds'),
                "token_source": token_source,
                "is_ai": is_ai,
            }
            activities.append(activity)

            stats = tool_stats.setdefault(tool_name, {
                "tool_name": tool_name,
                "usage_count": 0,
                "total_tokens": 0,
                "ai_tokens": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "ai_requests": 0,
                "latency_sum": 0,
                "latency_count": 0,
                "error_count": 0,
                "last_activity": None
            })
            stats["usage_count"] += 1
            stats["total_tokens"] += tokens_used
            if is_ai:
                stats["ai_tokens"] += tokens_used
                stats["ai_requests"] += 1
            stats["prompt_tokens"] += prompt_tokens
            stats["completion_tokens"] += completion_tokens

            duration = metadata.get('duration_seconds')
            if isinstance(duration, (int, float)):
                stats["latency_sum"] += duration
                stats["latency_count"] += 1
            status_code = metadata.get('status_code')
            if isinstance(status_code, int) and status_code >= 400:
                stats["error_count"] += 1
            if row.get('timestamp'):
                current = _parse_timestamp(stats.get("last_activity"))
                candidate = _parse_timestamp(row.get('timestamp'))
                if candidate and (current is None or candidate > current):
                    stats["last_activity"] = row.get('timestamp')

        tool_summary = []
        for stats in tool_stats.values():
            avg_tokens = 0
            if stats["ai_requests"] > 0:
                avg_tokens = stats["ai_tokens"] / stats["ai_requests"]
            avg_latency = 0
            if stats["latency_count"] > 0:
                avg_latency = stats["latency_sum"] / stats["latency_count"]
            error_rate = 0
            if stats["usage_count"] > 0:
                error_rate = stats["error_count"] / stats["usage_count"]

            tool_summary.append({
                "tool_name": stats["tool_name"],
                "usage_count": stats["usage_count"],
                "total_tokens": stats["total_tokens"],
                "ai_tokens": stats["ai_tokens"],
                "prompt_tokens": stats["prompt_tokens"],
                "completion_tokens": stats["completion_tokens"],
                "ai_requests": stats["ai_requests"],
                "avg_tokens": avg_tokens,
                "avg_latency": avg_latency,
                "error_rate": error_rate,
                "last_activity": stats["last_activity"]
            })

        tool_summary.sort(key=lambda t: (t["ai_tokens"], t["usage_count"]), reverse=True)

        ai_token_coverage = 0
        if ai_requests:
            ai_token_coverage = round((ai_requests_with_usage / ai_requests) * 100, 1)

        return {
            'user': user,
            'activities': activities,
            'tool_summary': tool_summary,
            'ai_summary': {
                'ai_requests': ai_requests,
                'ai_tokens': ai_tokens,
                'prompt_tokens': prompt_tokens_total,
                'completion_tokens': completion_tokens_total,
                'ai_token_coverage': ai_token_coverage
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

def export_analytics_csv(days: int = 30):
    try:
        ensure_activity_log_table()
        
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        rows = _db_fetch_all("""
            SELECT 
                u.id as user_id,
                u.username,
                u.email,
                a.tool_name,
                a.action,
                a.tokens_used,
                a.timestamp,
                a.metadata
            FROM user_activity_log a
            JOIN users u ON a.user_id = u.id
            WHERE a.timestamp >= :start_date
            ORDER BY a.timestamp DESC
        """, {"start_date": start_date})
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow([
            'User ID', 'Username', 'Email', 'Tool Name',
            'Action', 'Tokens Used', 'Prompt Tokens', 'Completion Tokens',
            'Model', 'Token Source', 'Timestamp', 'Duration (seconds)',
            'Endpoint', 'Method', 'Status Code'
        ])
        
        for row in rows:
            metadata = _safe_json_loads(row['metadata'])
            
            writer.writerow([
                row['user_id'],
                row['username'],
                row['email'],
                row['tool_name'],
                row['action'],
                row['tokens_used'],
                metadata.get('prompt_tokens', ''),
                metadata.get('completion_tokens', ''),
                metadata.get('model', ''),
                metadata.get('token_source', ''),
                row['timestamp'],
                metadata.get('duration_seconds', ''),
                metadata.get('endpoint', ''),
                metadata.get('method', ''),
                metadata.get('status_code', '')
            ])
        
        output.seek(0)
        
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename=analytics_export_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.csv'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

def export_user_csv(target_user_id: int):
    try:
        ensure_activity_log_table()
        
        user = _db_fetch_one(
            "SELECT * FROM users WHERE id = :target_user_id",
            {"target_user_id": target_user_id},
        )
        
        if not user:
            raise HTTPException(status_code=404, detail='User not found')
        
        rows = _db_fetch_all("""
            SELECT 
                tool_name,
                action,
                tokens_used,
                timestamp,
                metadata
            FROM user_activity_log
            WHERE user_id = :target_user_id
            ORDER BY timestamp DESC
        """, {"target_user_id": target_user_id})
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow([
            'Tool Name', 'Action', 'Tokens Used', 'Prompt Tokens', 'Completion Tokens',
            'Model', 'Token Source', 'Timestamp', 'Duration (seconds)', 'Endpoint', 'Method', 'Status Code'
        ])
        
        for row in rows:
            metadata = _safe_json_loads(row['metadata'])
                
            writer.writerow([
                row['tool_name'],
                row['action'],
                row['tokens_used'],
                metadata.get('prompt_tokens', ''),
                metadata.get('completion_tokens', ''),
                metadata.get('model', ''),
                metadata.get('token_source', ''),
                row['timestamp'],
                metadata.get('duration_seconds', ''),
                metadata.get('endpoint', ''),
                metadata.get('method', ''),
                metadata.get('status_code', '')
            ])
        
        output.seek(0)
        
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename=user_{user["username"]}_analytics_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.csv'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

def init_activity_log_table():
    ensure_activity_log_table()
