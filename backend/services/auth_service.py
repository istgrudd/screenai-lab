"""Authentication service: JWT creation/verification and user lookup."""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models.user import User
from backend.utils.security import verify_password


def create_access_token(user: User) -> str:
    """Create a signed JWT for the given user.

    Claims:
        sub:  user id (stringified)
        email, role: convenience claims for the client
        exp:  expiry (UTC)
        iat:  issued-at (UTC)
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns payload dict or None if invalid."""
    try:
        return jwt.decode(
            token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        return None


class AuthResult:
    """Discriminated result from ``authenticate_user``.

    Lets the router distinguish invalid credentials (401) from a valid login
    against a deactivated account (403) without coupling service-layer code
    to FastAPI response types.
    """

    INVALID = "invalid"
    DEACTIVATED = "deactivated"


def authenticate_user(
    db: Session, email: str, password: str
) -> User | str:
    """Verify credentials and return the User, or a sentinel describing why not.

    Returns:
        User          — credentials match and the account is active
        "invalid"     — email unknown OR password mismatch
        "deactivated" — credentials match, but User.is_active == False
    """
    user = db.query(User).filter(User.email == email.lower()).first()
    if not user or not verify_password(password, user.password_hash):
        return AuthResult.INVALID
    if not user.is_active:
        return AuthResult.DEACTIVATED
    return user
