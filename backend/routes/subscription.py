import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional, Tuple
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

import models
from deps import get_current_user, get_db, get_user_by_email, get_user_by_username
from services.subscription_catalog import DEFAULT_PLAN_ID, get_plan_ids, normalize_plan_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["subscription"])

_VALID_BILLING_CYCLES = {"monthly", "yearly"}
_SUBSCRIPTION_STATUS_MAP = {
    "active": "active",
    "trialing": "trial",
    "past_due": "grace",
    "unpaid": "grace",
    "incomplete": "grace",
    "paused": "paused",
    "canceled": "cancelled",
    "incomplete_expired": "cancelled",
}
_VALID_PLAN_IDS = set(get_plan_ids())
_STRIPE_API_BASE = os.getenv("STRIPE_API_BASE", "https://api.stripe.com/v1").rstrip("/")
_WEBHOOK_TOLERANCE_SECONDS = max(
    30,
    int(os.getenv("STRIPE_WEBHOOK_TOLERANCE_SECONDS", "300")),
)


def _normalize_billing_cycle(raw: Optional[str]) -> str:
    candidate = (raw or "monthly").strip().lower()
    return candidate if candidate in _VALID_BILLING_CYCLES else "monthly"


def _normalize_optional_plan(raw: Optional[str]) -> Optional[str]:
    candidate = (raw or "").strip().lower()
    return candidate if candidate in _VALID_PLAN_IDS else None


def _resolve_price_id(plan_id: str, billing_cycle: str) -> Optional[str]:
    key = f"STRIPE_PRICE_{plan_id.upper()}_{billing_cycle.upper()}"
    value = os.getenv(key, "").strip()
    return value or None


def _checkout_app_base(request: Request) -> str:
    configured = (os.getenv("APP_BASE_URL") or "https://cerbyl.com").strip().rstrip("/")
    allowed = {
        configured,
        *{
            origin.strip().rstrip("/")
            for origin in os.getenv("ALLOWED_ORIGINS", "https://cerbyl.com,https://www.cerbyl.com").split(",")
            if origin.strip()
        },
    }
    request_origin = (request.headers.get("origin") or "").strip().rstrip("/")
    candidate = request_origin if request_origin in allowed else configured
    parsed = urlparse(candidate)
    is_production = os.getenv("ENVIRONMENT", "development").strip().lower() == "production"
    is_dev_http = (
        not is_production
        and parsed.scheme == "http"
        and parsed.hostname in {"localhost", "127.0.0.1"}
    )
    if parsed.username or parsed.password or not parsed.hostname or not (parsed.scheme == "https" or is_dev_http):
        raise HTTPException(status_code=500, detail="APP_BASE_URL is not configured securely")
    return candidate


def _resolve_plan_cycle_from_price_id(price_id: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not price_id:
        return None, None
    for plan_id in _VALID_PLAN_IDS:
        for cycle in ("monthly", "yearly"):
            if _resolve_price_id(plan_id, cycle) == price_id:
                return plan_id, cycle
    return None, None


def _get_profile(db: Session, user_id: int) -> models.ComprehensiveUserProfile:
    profile = db.query(models.ComprehensiveUserProfile).filter(
        models.ComprehensiveUserProfile.user_id == user_id
    ).first()
    if profile:
        return profile
    profile = models.ComprehensiveUserProfile(user_id=user_id)
    db.add(profile)
    db.flush()
    return profile


def _resolve_user_from_subject(db: Session, subject: Optional[str]) -> Optional[models.User]:
    if subject is None:
        return None
    value = str(subject).strip()
    if not value:
        return None

    if value.isdigit():
        user = db.query(models.User).filter(models.User.id == int(value)).first()
        if user:
            return user

    return None


def _resolve_user_for_event(
    db: Session,
    metadata: dict,
    client_reference_id: Optional[str],
    stripe_customer_id: Optional[str],
    stripe_subscription_id: Optional[str],
) -> Optional[models.User]:
    for key in ("user_pk",):
        user = _resolve_user_from_subject(db, metadata.get(key))
        if user:
            return user

    user = _resolve_user_from_subject(db, client_reference_id)
    if user:
        return user

    if stripe_subscription_id:
        profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.stripe_subscription_id == stripe_subscription_id
        ).first()
        if profile:
            return db.query(models.User).filter(models.User.id == profile.user_id).first()

    if stripe_customer_id:
        profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.stripe_customer_id == stripe_customer_id
        ).first()
        if profile:
            return db.query(models.User).filter(models.User.id == profile.user_id).first()

    return None


def _event_metadata(obj: dict) -> dict:
    metadata = obj.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def _stripe_status_to_local(raw: Optional[str]) -> str:
    return _SUBSCRIPTION_STATUS_MAP.get((raw or "").strip().lower(), "paused")


def _unix_to_datetime(value) -> Optional[datetime]:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _extract_price_info(subscription_obj: dict) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    items = ((subscription_obj or {}).get("items") or {}).get("data") or []
    if not items or not isinstance(items, list):
        return None, None, None

    first = items[0] or {}
    price = first.get("price") or {}
    price_id = price.get("id")
    recurring = (price.get("recurring") or {}).get("interval")

    billing_cycle = None
    if recurring == "year":
        billing_cycle = "yearly"
    elif recurring == "month":
        billing_cycle = "monthly"

    plan_from_price, cycle_from_price = _resolve_plan_cycle_from_price_id(price_id)
    if cycle_from_price:
        billing_cycle = cycle_from_price

    return price_id, plan_from_price, billing_cycle


def _require_stripe_secret_key() -> str:
    key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="Billing is not configured on the server.")
    return key


def _verify_webhook_signature(signature_header: str, payload: bytes, secret: str) -> bool:
    if not signature_header or not payload or not secret:
        return False

    parts = {}
    for chunk in signature_header.split(","):
        if "=" not in chunk:
            continue
        k, v = chunk.split("=", 1)
        parts.setdefault(k.strip(), []).append(v.strip())

    timestamp_raw = (parts.get("t") or [None])[0]
    signatures = parts.get("v1") or []
    if not timestamp_raw or not signatures:
        return False

    try:
        timestamp = int(timestamp_raw)
    except ValueError:
        return False

    signed_payload = f"{timestamp}.{payload.decode('utf-8')}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()

    if not any(hmac.compare_digest(expected, candidate) for candidate in signatures):
        return False

    age_seconds = abs(int(time.time()) - timestamp)
    if age_seconds > _WEBHOOK_TOLERANCE_SECONDS:
        return False

    return True


def _update_profile_from_subscription_event(db: Session, event_type: str, subscription_obj: dict) -> bool:
    metadata = _event_metadata(subscription_obj)
    stripe_subscription_id = subscription_obj.get("id")
    stripe_customer_id = subscription_obj.get("customer")

    user = _resolve_user_for_event(
        db=db,
        metadata=metadata,
        client_reference_id=None,
        stripe_customer_id=stripe_customer_id,
        stripe_subscription_id=stripe_subscription_id,
    )
    if not user:
        return False

    profile = _get_profile(db, user.id)
    now = datetime.now(timezone.utc)
    price_id, plan_from_price, cycle_from_price = _extract_price_info(subscription_obj)
    metadata_cycle = metadata.get("billing_cycle")
    next_plan = plan_from_price or DEFAULT_PLAN_ID
    next_cycle = cycle_from_price or (
        _normalize_billing_cycle(metadata_cycle) if metadata_cycle else (profile.billing_cycle or "monthly")
    )
    next_status = _stripe_status_to_local(subscription_obj.get("status"))

    if event_type == "customer.subscription.deleted":
        next_status = "cancelled"
        next_plan = DEFAULT_PLAN_ID
        next_cycle = "monthly"
        price_id = None
        profile.stripe_subscription_id = None
    else:
        profile.stripe_subscription_id = stripe_subscription_id or profile.stripe_subscription_id

    if next_plan:
        if profile.subscription_tier != next_plan or not profile.subscription_started_at:
            profile.subscription_started_at = now
        profile.subscription_tier = next_plan
    profile.billing_cycle = next_cycle
    profile.subscription_status = next_status
    profile.stripe_customer_id = stripe_customer_id or profile.stripe_customer_id
    profile.stripe_price_id = price_id
    profile.billing_currency = (subscription_obj.get("currency") or profile.billing_currency or "usd").lower()
    profile.current_period_end = _unix_to_datetime(subscription_obj.get("current_period_end") or next(iter((subscription_obj.get("items") or {}).get("data") or [{}])).get("current_period_end"))
    profile.cancel_at_period_end = bool(subscription_obj.get("cancel_at_period_end"))
    profile.updated_at = now
    return True


@router.post("/subscription/checkout")
async def create_subscription_checkout(
    request: Request,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        requested_user = payload.get("user_id") or payload.get("userId") or current_user.username
        user = get_user_by_username(db, requested_user) or get_user_by_email(db, requested_user)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        requested_tier = normalize_plan_id(payload.get("tier") or payload.get("subscriptionTier"))
        requested_cycle = _normalize_billing_cycle(payload.get("billingCycle"))

        profile = _get_profile(db, user.id)
        now = datetime.now(timezone.utc)

        if profile.stripe_subscription_id and profile.subscription_status not in {"cancelled", "canceled"}:
            raise HTTPException(status_code=409, detail="Manage your existing subscription in the billing portal before starting another plan.")
        if requested_tier == DEFAULT_PLAN_ID:
            previous_tier = normalize_plan_id(profile.subscription_tier)
            profile.subscription_tier = DEFAULT_PLAN_ID
            profile.billing_cycle = requested_cycle
            profile.subscription_status = "active"
            if previous_tier != DEFAULT_PLAN_ID or not profile.subscription_started_at:
                profile.subscription_started_at = now
            profile.stripe_subscription_id = None
            profile.stripe_price_id = None
            profile.current_period_end = None
            profile.cancel_at_period_end = False
            profile.updated_at = now
            db.commit()
            return {
                "status": "success",
                "mode": "free",
                "subscriptionTier": profile.subscription_tier,
                "billingCycle": profile.billing_cycle,
                "subscriptionStatus": profile.subscription_status,
            }

        price_id = _resolve_price_id(requested_tier, requested_cycle)
        if not price_id:
            raise HTTPException(status_code=503, detail="This paid plan is not configured for checkout.")

        stripe_secret_key = _require_stripe_secret_key()
        app_base = _checkout_app_base(request)
        success_url = f"{app_base}/profile?checkout=success"
        cancel_url = f"{app_base}/profile?checkout=cancelled"

        user_ref = str(user.id)
        form_payload = {
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": user_ref,
            "line_items[0][price]": price_id,
            "line_items[0][quantity]": "1",
            "allow_promotion_codes": "true",
            "metadata[user_ref]": user_ref,
            "metadata[user_pk]": str(user.id),
            "metadata[plan_id]": requested_tier,
            "metadata[billing_cycle]": requested_cycle,
            "subscription_data[metadata][user_ref]": user_ref,
            "subscription_data[metadata][user_pk]": str(user.id),
            "subscription_data[metadata][plan_id]": requested_tier,
            "subscription_data[metadata][billing_cycle]": requested_cycle,
        }
        if profile.stripe_customer_id:
            form_payload["customer"] = profile.stripe_customer_id
        elif user.email:
            form_payload["customer_email"] = user.email

        response = requests.post(
            f"{_STRIPE_API_BASE}/checkout/sessions",
            data=form_payload,
            headers={"Authorization": f"Bearer {stripe_secret_key}"},
            timeout=20,
        )
        if not response.ok:
            logger.error("Stripe checkout creation failed: %s", response.text)
            raise HTTPException(status_code=502, detail="Failed to create checkout session.")

        session_data = response.json()
        checkout_url = session_data.get("url")
        if not checkout_url:
            raise HTTPException(status_code=502, detail="Checkout session did not return a redirect URL.")

        profile.stripe_checkout_session_id = session_data.get("id") or profile.stripe_checkout_session_id
        profile.stripe_customer_id = session_data.get("customer") or profile.stripe_customer_id
        profile.updated_at = now
        from services.product_events import record_event
        record_event(db, "checkout_started", user.id, key=f"checkout:{session_data.get('id')}")
        db.commit()

        return {
            "status": "pending",
            "checkoutUrl": checkout_url,
            "sessionId": session_data.get("id"),
        }
    except HTTPException:
        db.rollback()
        raise
    except requests.RequestException:
        db.rollback()
        raise HTTPException(status_code=502, detail="Payment provider is currently unreachable.")
    except Exception as e:
        logger.error(f"Error creating subscription checkout: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create checkout session.")


@router.post("/subscription/webhook")
async def stripe_subscription_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
        if not webhook_secret:
            raise HTTPException(status_code=500, detail="Webhook secret is not configured.")

        payload = await request.body()
        signature_header = request.headers.get("Stripe-Signature", "")
        if not _verify_webhook_signature(signature_header, payload, webhook_secret):
            raise HTTPException(status_code=400, detail="Invalid webhook signature.")

        event = json.loads(payload.decode("utf-8"))
        event_type = event.get("type")
        event_object = ((event.get("data") or {}).get("object") or {})

        event_id = event.get("id")
        if not isinstance(event_id, str) or not event_id.startswith("evt_") or len(event_id) > 120:
            raise HTTPException(status_code=400, detail="Invalid event ID")
        if db.get(models.BillingEvent, event_id):
            return {"received": True, "handled": True, "duplicate": True}
        handled = False
        supported = {"checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
                     "customer.subscription.deleted", "invoice.payment_succeeded", "invoice.payment_failed"}
        if event_type in supported:
            sub_id = event_object.get("id") if event_type.startswith("customer.subscription.") else event_object.get("subscription")
            sub_id = sub_id or (((event_object.get("parent") or {}).get("subscription_details") or {}).get("subscription"))
            if not sub_id or not isinstance(sub_id, str) or not sub_id.startswith("sub_"):
                return {"received": True, "handled": False}
            user = _resolve_user_for_event(db, _event_metadata(event_object), event_object.get("client_reference_id"), event_object.get("customer"), sub_id)
            if not user:
                raise HTTPException(status_code=503, detail="Billing owner could not be reconciled; retry required.")
            # Serialize updates, then retrieve CURRENT state so delayed events cannot revive a cancelled plan.
            profile = _get_profile(db, user.id)
            db.query(models.ComprehensiveUserProfile).filter_by(id=profile.id).with_for_update().one()
            response = requests.get(f"{_STRIPE_API_BASE}/subscriptions/{sub_id}",
                headers={"Authorization": f"Bearer {_require_stripe_secret_key()}"}, timeout=20)
            if not response.ok:
                raise HTTPException(status_code=503, detail="Subscription reconciliation failed; retry required.")
            current = response.json()
            if current.get("id") != sub_id or current.get("customer") != event_object.get("customer"):
                raise HTTPException(status_code=400, detail="Subscription ownership mismatch")
            matched_checkout = event_type == "checkout.session.completed" and event_object.get("id") == profile.stripe_checkout_session_id
            replaces_cancelled = profile.subscription_status in {"cancelled", "canceled"} and current.get("status") in {"active", "trialing"}
            if profile.stripe_subscription_id and profile.stripe_subscription_id != sub_id and not (matched_checkout or replaces_cancelled):
                # An event for an old subscription must not overwrite the current subscription.
                handled = False
            else:
                current["metadata"] = {**_event_metadata(current), "user_pk": str(user.id)}
                handled = _update_profile_from_subscription_event(db, "customer.subscription.updated", current)
            amount = int(event_object.get("amount_paid") or 0) if event_type == "invoice.payment_succeeded" else 0
            db.add(models.BillingEvent(event_id=event_id, event_type=event_type, user_id=user.id,
                provider_created=int(event.get("created") or 0), amount_minor=amount,
                currency=(event_object.get("currency") or "").lower() or None))
            from services.product_events import record_event
            if amount > 0:
                record_event(db, "payment_received", user.id, key=event_id)
        db.commit()
        return {"received": True, "handled": handled}
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        if db.get(models.BillingEvent, event_id):
            return {"received": True, "handled": True, "duplicate": True}
        raise HTTPException(status_code=503, detail="Billing update conflicted; retry required.")
    except json.JSONDecodeError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")
    except Exception as e:
        logger.error(f"Stripe webhook processing failed: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to process webhook.")


@router.post("/subscription/portal")
def subscription_portal(request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    profile = _get_profile(db, current_user.id)
    if not profile.stripe_customer_id:
        raise HTTPException(status_code=404, detail="No billing account exists yet.")
    try:
        response = requests.post(f"{_STRIPE_API_BASE}/billing_portal/sessions",
            data={"customer": profile.stripe_customer_id, "return_url": f"{_checkout_app_base(request)}/profile"},
            headers={"Authorization": f"Bearer {_require_stripe_secret_key()}"}, timeout=20)
        if not response.ok or not response.json().get("url"):
            raise HTTPException(status_code=502, detail="The billing portal is unavailable. Please retry.")
        return {"url": response.json()["url"]}
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="The billing provider is unreachable. Please retry.")
