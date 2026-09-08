from datetime import datetime, timezone
from services.subscription_catalog import DEFAULT_PLAN_ID, normalize_plan_id


def effective_plan(profile, now=None):
    if not profile:
        return DEFAULT_PLAN_ID
    tier = normalize_plan_id(profile.subscription_tier)
    if tier == DEFAULT_PLAN_ID:
        return tier
    if tier == "unlimited":
        return DEFAULT_PLAN_ID
    end = profile.current_period_end
    if end and end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if profile.subscription_status not in {"active", "trial"} or not end or end <= (now or datetime.now(timezone.utc)):
        return DEFAULT_PLAN_ID
    return tier
