"""FastAPI auth dependencies: extract current user from JWT, enforce roles."""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.user import User, UserRole
from backend.services.auth_service import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _ensure_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _issued_at_from_payload(payload: dict) -> datetime | None:
    issued_at = payload.get("issued_at")
    if isinstance(issued_at, str):
        try:
            return _ensure_aware(datetime.fromisoformat(issued_at.replace("Z", "+00:00")))
        except ValueError:
            pass

    iat = payload.get("iat")
    if isinstance(iat, (int, float)):
        return datetime.fromtimestamp(iat, tz=timezone.utc)
    if isinstance(iat, str):
        try:
            return datetime.fromtimestamp(float(iat), tz=timezone.utc)
        except ValueError:
            try:
                return _ensure_aware(datetime.fromisoformat(iat.replace("Z", "+00:00")))
            except ValueError:
                return None
    return None


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the authenticated user from the Authorization header.

    Raises 401 if the token is missing, invalid, or the user is inactive.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    payload = decode_access_token(token)
    if not payload:
        raise credentials_exception

    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exception

    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id_int).first()
    if not user or not user.is_active:
        raise credentials_exception

    password_changed_at = _ensure_aware(user.password_changed_at)
    if password_changed_at is not None:
        token_issued_at = _issued_at_from_payload(payload)
        if token_issued_at is None or token_issued_at < password_changed_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired due to password change. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    return user


def require_role(*allowed_roles: UserRole):
    """Build a FastAPI dependency that enforces role membership.

    Usage:
        @router.post("/evaluate", dependencies=[Depends(require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN))])
    """

    def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this action",
            )
        return current_user

    return _checker
