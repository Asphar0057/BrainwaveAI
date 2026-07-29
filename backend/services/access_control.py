from collections.abc import Callable

from fastapi import Depends, HTTPException, status

import models
from deps import get_current_user


VALID_ACCOUNT_ROLES = frozenset({"learner", "student", "educator"})
ROLE_LANDING_ROUTES = {
    "learner": "/dashboard",
    "student": "/student",
    "educator": "/educator",
}


def normalize_account_role(role: str | None) -> str:
    return role if role in VALID_ACCOUNT_ROLES else "learner"


def landing_route_for_role(role: str | None) -> str:
    return ROLE_LANDING_ROUTES[normalize_account_role(role)]


def require_account_role(*allowed_roles: str) -> Callable:
    invalid_roles = set(allowed_roles) - VALID_ACCOUNT_ROLES
    if invalid_roles:
        raise ValueError(f"Unknown account roles: {sorted(invalid_roles)}")

    def dependency(
        current_user: models.User = Depends(get_current_user),
    ) -> models.User:
        role = normalize_account_role(current_user.account_role)
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This workspace is not available for your account role.",
            )
        return current_user

    return dependency
