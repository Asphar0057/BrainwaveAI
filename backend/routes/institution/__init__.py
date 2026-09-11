from fastapi import APIRouter, Depends

from deps import get_current_user
from .license_access import enforce_company_write_license

from . import (
    company,
    learning,
    announcements,
    assignments,
    attendance,
    classroom,
    communication,
    dashboards,
    materials,
    profile,
)

router = APIRouter(
    prefix="/api/institution",
    tags=["institution"],
    dependencies=[Depends(get_current_user), Depends(enforce_company_write_license)],
)

for _module in (
    dashboards,
    classroom,
    assignments,
    attendance,
    materials,
    company,
    learning,
    announcements,
    communication,
    profile,
):
    router.include_router(_module.router)
