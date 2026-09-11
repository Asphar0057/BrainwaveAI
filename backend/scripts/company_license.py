"""Operator tool for an agreed company contract. Dry-run unless --apply is supplied.
No card charge or Stripe subscription is created by this tool.
"""
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--organization-id',type=int,required=True)
    parser.add_argument('--seats',type=int,required=True)
    parser.add_argument('--expires',required=True,help='ISO date YYYY-MM-DD, access renewal deadline')
    parser.add_argument('--plan',default='cohort',choices=['pilot','cohort','annual'])
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    if args.seats<1 or args.seats>100000:parser.error('Seats must be between 1 and 100000.')
    expires=datetime.fromisoformat(args.expires).replace(tzinfo=None)
    if expires<=datetime.now(timezone.utc).replace(tzinfo=None):parser.error('Expiry must be in the future.')
    from env_loader import load_backend_env
    load_backend_env()
    from database import SessionLocal
    import models
    db=SessionLocal()
    try:
        org=db.query(models.Organization).filter_by(id=args.organization_id).with_for_update().first()
        if not org:parser.error('Company not found.')
        active=db.query(models.OrganizationMembership).filter_by(organization_id=org.id,status='active').count()
        reserved=db.query(models.OrganizationInvite).filter_by(organization_id=org.id,status='pending').filter(models.OrganizationInvite.expires_at>datetime.now(timezone.utc).replace(tzinfo=None)).count()
        if args.seats<active+reserved:parser.error('Seat limit cannot be below active people plus pending invitations.')
        print(f'{org.name}: {args.seats} seats, {args.plan}, until {expires.date()}. Active {active}, reserved {reserved}.')
        if not args.apply:print('Dry run. Use --apply after recording the agreed contract/payment.');return
        row=db.get(models.OrganizationLicense,org.id)
        if not row:row=models.OrganizationLicense(organization_id=org.id);db.add(row)
        row.seat_limit=args.seats;row.plan=args.plan;row.expires_at=expires
        db.add(models.OrganizationAudit(organization_id=org.id,action='license_updated',detail=f'Operator set {args.seats} seats, {args.plan}, expiry {expires.date()}. No payment processed by this tool.'))
        db.commit();print('Company licence updated.')
    finally:db.close()
if __name__=='__main__':main()
