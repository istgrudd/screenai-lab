"""Authentication router — register, login, logout, current user.

Endpoints:
    POST /api/auth/register             — Public; creates a candidate account.
    POST /api/auth/login                — Public; returns a JWT.
    GET  /api/auth/verify-email         — Public; verifies candidate email.
    POST /api/auth/resend-verification  — Public; resends verification.
    POST /api/auth/logout               — Auth; client-side token discard.
    GET  /api/auth/me                   — Auth; return current user's profile.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.middleware.rate_limit import limiter
from backend.models.audit import AuditLog
from backend.models.user import User, UserRole
from backend.services.auth_service import (
    AuthResult,
    authenticate_user,
    create_access_token,
)
from backend.services.email_verification_service import (
    GENERIC_RESEND_MESSAGE,
    VerifyEmailStatus,
    create_and_send_verification,
    resend_verification_if_allowed,
    verify_email_code,
)
from backend.services.password_reset_service import (
    GENERIC_FORGOT_PASSWORD_MESSAGE,
    ResetPasswordStatus,
    create_and_send_password_reset,
    request_password_reset_if_allowed,
    reset_password_with_code,
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


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    code: str = Field(..., max_length=512)
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
    email_verified_at: str | None

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
            email_verified_at=(
                user.email_verified_at.isoformat()
                if user.email_verified_at
                else None
            ),
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new candidate account and send email verification."""
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
        email_verified_at=None,
    )
    db.add(user)
    db.flush()

    verification = create_and_send_verification(db, user)
    if not verification.success:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification email could not be sent. Please try again later.",
        )

    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "data": {
            "message": "Account created. Please verify your email before signing in.",
            "email": user.email,
            "verification_required": True,
        },
        "error": None,
    }


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
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
    if user.role == UserRole.CANDIDATE and user.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "EMAIL_NOT_VERIFIED",
                "message": "Please verify your email before signing in.",
            },
        )

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


@router.get("/verify-email")
@limiter.limit("20/minute")
def verify_email(
    request: Request,
    code: str = Query(..., min_length=20, max_length=512),
    db: Session = Depends(get_db),
):
    """Verify a candidate email using a one-time code."""
    result = verify_email_code(db, code)
    if result.status in {
        VerifyEmailStatus.VERIFIED,
        VerifyEmailStatus.ALREADY_VERIFIED,
    }:
        db.commit()
        return {
            "success": True,
            "data": {
                "message": "Email verified. Please sign in.",
                "email": result.user.email if result.user else None,
            },
            "error": None,
        }

    db.rollback()
    error_map = {
        VerifyEmailStatus.INVALID: (
            "INVALID_VERIFICATION_CODE",
            "Verification code is invalid.",
        ),
        VerifyEmailStatus.EXPIRED: (
            "VERIFICATION_CODE_EXPIRED",
            "Verification code has expired. Please request a new one.",
        ),
        VerifyEmailStatus.USED: (
            "VERIFICATION_CODE_USED",
            "Verification code has already been used.",
        ),
    }
    code_value, message = error_map.get(
        result.status,
        ("INVALID_VERIFICATION_CODE", "Verification code is invalid."),
    )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": code_value, "message": message},
    )


@router.post("/resend-verification")
@limiter.limit("5/minute")
def resend_verification(
    request: Request,
    payload: ResendVerificationRequest,
    db: Session = Depends(get_db),
):
    """Resend verification email with a generic response."""
    result = resend_verification_if_allowed(db, payload.email)
    if result.attempted_send and result.email_result and not result.email_result.success:
        db.rollback()
    else:
        db.commit()

    return {
        "success": True,
        "data": {"message": GENERIC_RESEND_MESSAGE},
        "error": None,
    }


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """Request a password reset email with a generic response."""
    result = request_password_reset_if_allowed(db, payload.email)
    if result.attempted_send and result.email_result and not result.email_result.success:
        db.rollback()
    else:
        db.commit()

    return {
        "success": True,
        "data": {"message": GENERIC_FORGOT_PASSWORD_MESSAGE},
        "error": None,
    }


@router.post("/reset-password")
@limiter.limit("10/minute")
def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Reset a password using a one-time reset code."""
    result = reset_password_with_code(db, payload.code, payload.new_password)
    if result.status == ResetPasswordStatus.RESET:
        db.commit()
        return {
            "success": True,
            "data": {"message": "Password has been reset. Please sign in again."},
            "error": None,
        }

    db.rollback()
    error_map = {
        ResetPasswordStatus.INVALID: (
            "INVALID_RESET_CODE",
            "Password reset code is invalid.",
        ),
        ResetPasswordStatus.EXPIRED: (
            "RESET_CODE_EXPIRED",
            "Password reset code has expired. Please request a new one.",
        ),
        ResetPasswordStatus.USED: (
            "RESET_CODE_USED",
            "Password reset code has already been used.",
        ),
    }
    code_value, message = error_map.get(
        result.status,
        ("INVALID_RESET_CODE", "Password reset code is invalid."),
    )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": code_value, "message": message},
    )


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
    "/admin/users/{user_id}/send-password-reset",
)
def send_admin_password_reset_link(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Super-admin-only password reset link sender.

    The admin never chooses or sees a password. The target user receives the
    normal one-time reset link and changes their own password through the
    public reset flow.
    """
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if not target.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot send a password reset link to a deactivated account",
        )

    send_result = create_and_send_password_reset(db, target)
    if not send_result.success:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password reset email could not be sent. Please try again later.",
        )

    db.add(
        AuditLog(
            recruiter_id=current_user.id,
            candidate_id=target.id,
            action_type="admin_password_reset_requested",
            old_value=None,
            new_value="account_recovery_email_sent",
            reason="admin_initiated_account_recovery_email",
        )
    )
    db.commit()
    db.refresh(target)

    return {
        "success": True,
        "data": {
            "user_id": target.id,
            "email": target.email,
            "message": "Account recovery email has been sent.",
        },
        "error": None,
    }


@router.post(
    "/admin/reset-password",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
def deprecated_admin_reset_password():
    """Reject the legacy admin-set-password endpoint."""
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Direct admin password reset is deprecated. "
            "Send a password reset link instead."
        ),
    )
