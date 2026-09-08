from fastapi import APIRouter, Depends

from deps import get_current_user

from . import (
    announcements,
    assignments,
    attendance,
    classroom,
    communication,
    dashboards,
    materials,
)

router = APIRouter(
    prefix="/api/institution",
    tags=["institution"],
    dependencies=[Depends(get_current_user)],
)

for _module in (
    dashboards,
    classroom,
    assignments,
    attendance,
    materials,
    announcements,
    communication,
):
    router.include_router(_module.router)
