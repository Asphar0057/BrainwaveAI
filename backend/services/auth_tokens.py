"""Versioned, immutable session identity. Legacy username tokens must sign in again."""
from datetime import datetime, timedelta, timezone
import os
from fastapi import HTTPException
from jose import jwt, JWTError


def create_user_access_token(user, expires_delta=None):
    now = datetime.now(timezone.utc)
    return jwt.encode({
        "sub": str(user.id), "auth_version": 2,
        "session_version": user.session_version or 0,
        "iat": now, "exp": now + (expires_delta or timedelta(hours=8)),
        "iss": "brainwave-backend", "aud": "brainwave-client",
    }, os.environ["SECRET_KEY"], algorithm="HS256")


def resolve_access_token(token, db):
    import models
    try:
        payload = jwt.decode(token, os.environ["SECRET_KEY"], algorithms=["HS256"],
                             audience="brainwave-client", issuer="brainwave-backend", options={"require_exp": True, "require_iat": True, "require_sub": True})
        if payload.get("auth_version") != 2 or not str(payload.get("sub", "")).isdigit():
            raise ValueError("Legacy session")
        user = db.query(models.User).filter(models.User.id == int(payload["sub"])).first()
        if not user or payload.get("session_version") != (user.session_version or 0):
            raise ValueError("Revoked session")
        return user
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Your session expired. Please sign in again.")


class AuthSubject(str):
    """Preserve legacy username route inputs while keeping an immutable identity."""
    def __new__(cls, user):
        value = super().__new__(cls, user.username)
        value.user_id = user.id
        return value

    def __int__(self):
        return self.user_id
