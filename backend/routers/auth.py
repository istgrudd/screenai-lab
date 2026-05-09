"""Authentication router — register, login, logout, current user.

Endpoints:
    POST /api/auth/register  — Public; creates a candidate account.
    POST /api/auth/login     — Public; returns a JWT.
    POST /api/auth/logout    — Auth; client-side token discard.
    GET  /api/auth/me        — Auth; return current user's profile.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.user import User, UserRole
from backend.services.auth_service import (
    AuthResult,
    authenticate_user,
    create_access_token,
)
from backend.utils.security import hash_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


# NIM format: any numeric string of 10 or more digits.
# Relaxed from the original 103-prefix 13-digit Telkom format to support
# NIMs from different faculties/years.
_NIM_PATTERN = re.compile(r"^\d{10,}$")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    full_name: str = Field(..., min_length=1, max_length=255)
    nim: str = Field(..., min_length=10, max_length=20)
    faculty: str = Field(..., min_length=1, max_length=255)
    major: str = Field(..., min_length=1, max_length=255)
    year: int = Field(..., ge=2000, le=2100)

    @field_validator("nim")
    @classmethod
    def _validate_nim(cls, v: str) -> str:
        v = v.strip()
        if not _NIM_PATTERN.match(v):
            raise ValueError(
                "NIM must be a numeric string of at least 10 digits"
            )
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminResetPasswordRequest(BaseModel):
    """Super-admin assisted password reset (Phase 2 stop-gap).

    Self-service reset (email token) is Phase 3. Until then, a candidate
    who forgets their password contacts the lab; a super-admin uses this
    endpoint to set a new one.
    """

    user_id: int
    new_password: str = Field(..., min_length=8, max_length=72)


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    nim: str | None
    faculty: str | None
    major: str | None
    year: int | None
    whatsapp: str | None
    role: str
    is_active: bool

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            nim=user.nim,
            faculty=user.faculty,
            major=user.major,
            year=user.year,
            whatsapp=user.whatsapp,
            role=user.role.value if hasattr(user.role, "value") else str(user.role),
            is_active=user.is_active,
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new candidate account. Role is always 'candidate'."""
    email = payload.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        )
    if db.query(User).filter(User.nim == payload.nim).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="NIM is already registered",
        )

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        nim=payload.nim,
        faculty=payload.faculty.strip(),
        major=payload.major.strip(),
        year=payload.year,
        role=UserRole.CANDIDATE,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user)
    return {
        "success": True,
        "data": {
            "access_token": token,
            "token_type": "bearer",
            "user": UserOut.from_user(user).model_dump(),
        },
        "error": None,
    }


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate a user and return a JWT.

    Returns 401 for bad credentials and 403 for correct credentials against
    a deactivated account — the latter is an explicit admin decision and
    the candidate should know to contact support rather than retry.
    """
    result = authenticate_user(db, payload.email, payload.password)
    if result == AuthResult.INVALID:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if result == AuthResult.DEACTIVATED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    user = result
    token = create_access_token(user)
    return {
        "success": True,
        "data": {
            "access_token": token,
            "token_type": "bearer",
            "user": UserOut.from_user(user).model_dump(),
        },
        "error": None,
    }


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    """Logout endpoint.

    JWTs are stateless, so logout is handled client-side by discarding the
    token. This endpoint exists to let the client signal intent and to
    reserve a hook for future token-revocation (e.g. blacklist).
    """
    return {
        "success": True,
        "data": {"message": "Logged out"},
        "error": None,
    }


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return {
        "success": True,
        "data": UserOut.from_user(current_user).model_dump(),
        "error": None,
    }


@router.post(
    "/admin/reset-password",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
def admin_reset_password(
    payload: AdminResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Super-admin-only assisted password reset.

    Hashes the new password with bcrypt and replaces the target user's
    stored hash. Does not invalidate existing JWTs (that's Phase 3 +
    requires a token blacklist) — but the next login will require the
    new password.
    """
    target = db.query(User).filter(User.id == payload.user_id).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    target.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(target)

    return {
        "success": True,
        "data": {
            "user_id": target.id,
            "email": target.email,
            "message": "Password has been reset.",
        },
        "error": None,
    }
