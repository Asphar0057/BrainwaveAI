from fastapi import APIRouter, Depends

from deps import enforce_request_user_scope

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
    dependencies=[Depends(enforce_request_user_scope)],
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
