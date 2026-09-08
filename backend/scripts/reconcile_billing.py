"""One-time existing subscription reconciliation. Read-only unless --apply is supplied.
Run from backend: python scripts/reconcile_billing.py [--apply]
"""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from env_loader import load_backend_env
load_backend_env()
import requests
from database import SessionLocal
import models
from routes.subscription import _STRIPE_API_BASE, _require_stripe_secret_key, _update_profile_from_subscription_event


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    failures=0
    with SessionLocal() as db:
        profiles=db.query(models.ComprehensiveUserProfile).filter(models.ComprehensiveUserProfile.stripe_subscription_id.isnot(None)).all()
        for profile in profiles:
            try:
                response=requests.get(f'{_STRIPE_API_BASE}/subscriptions/{profile.stripe_subscription_id}', headers={'Authorization':f'Bearer {_require_stripe_secret_key()}'}, timeout=20)
                response.raise_for_status(); current=response.json()
                if current.get('customer') != profile.stripe_customer_id:
                    raise ValueError('Customer mismatch')
                print(f'Account {profile.user_id}: provider status={current.get("status")} mode={"apply" if args.apply else "dry-run"}')
                if args.apply:
                    current['metadata']={**(current.get('metadata') or {}),'user_pk':str(profile.user_id)}
                    if not _update_profile_from_subscription_event(db,'customer.subscription.updated',current):
                        raise ValueError('Account not found')
                    db.commit()
            except Exception:
                failures += 1
                db.rollback()
                print(f'Account {profile.user_id}: reconciliation failed; inspect provider/account mapping.',file=sys.stderr)
    raise SystemExit(1 if failures else 0)

if __name__=='__main__': main()
