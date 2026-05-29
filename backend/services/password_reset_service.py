"""Self-service password reset orchestration."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from urllib.parse import urlencode

from sqlalchemy.orm import Session

from backend.config import settings
from backend.models.password_reset import PasswordResetLink
from backend.models.user import User
from backend.services.email_service import EmailSendResult, send_email
from backend.services.email_templates import password_reset_email
from backend.utils.security import hash_password


GENERIC_FORGOT_PASSWORD_MESSAGE = (
    "If the account exists, a password reset email has been sent."
)


class ResetPasswordStatus:
    RESET = "reset"
    INVALID = "invalid"
    EXPIRED = "expired"
    USED = "used"


@dataclass(frozen=True)
class PasswordResetSendResult:
    success: bool
    email_result: EmailSendResult
    error: str | None = None


@dataclass(frozen=True)
class ForgotPasswordResult:
    message: str = GENERIC_FORGOT_PASSWORD_MESSAGE
    attempted_send: bool = False
    email_result: EmailSendResult | None = None


@dataclass(frozen=True)
class ResetPasswordResult:
    status: str
    user: User | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_reset_secret(secret: str) -> str:
    """Hash a password reset secret with the app secret key."""
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        secret.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def build_reset_url(secret: str) -> str:
    """Build the public reset URL reserved for the Phase 5 frontend page."""
    base_url = (settings.public_frontend_url or settings.frontend_url).strip().rstrip("/")
    return f"{base_url}/reset-password?{urlencode({'code': secret})}"


def create_and_send_password_reset(
    db: Session,
    user: User,
) -> PasswordResetSendResult:
    """Create a one-time reset link and send it via the email service.

    The caller owns commit/rollback so the reset record and email-send result
    can be treated atomically when needed.
    """
    now = _utcnow()
    secret = secrets.token_urlsafe(32)
    expires_at = now + timedelta(minutes=settings.password_reset_expire_minutes)
    link = PasswordResetLink(
        user_id=user.id,
        link_secret_hash=hash_reset_secret(secret),
        expires_at=expires_at,
        sent_to_email=user.email.lower(),
        created_at=now,
    )
    db.add(link)
    db.flush()

    template = password_reset_email(
        recipient_name=user.full_name,
        reset_url=build_reset_url(secret),
        expires_minutes=settings.password_reset_expire_minutes,
    )
    send_result = send_email(
        to_email=user.email,
        subject=template.subject,
        html=template.html,
        text=template.text,
    )
    if not send_result.success:
        return PasswordResetSendResult(
            success=False,
            email_result=send_result,
            error=send_result.error or "Password reset email could not be sent.",
        )
    return PasswordResetSendResult(success=True, email_result=send_result)


def request_password_reset_if_allowed(db: Session, email: str) -> ForgotPasswordResult:
    """Issue a password reset email without leaking account state."""
    normalized_email = email.lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    if user is None or not user.is_active:
        return ForgotPasswordResult()

    cooldown = max(settings.password_reset_cooldown_seconds, 0)
    if cooldown:
        latest_link = (
            db.query(PasswordResetLink)
            .filter(PasswordResetLink.user_id == user.id)
            .order_by(PasswordResetLink.created_at.desc())
            .first()
        )
        latest_created = _ensure_aware(latest_link.created_at if latest_link else None)
        if latest_created and (_utcnow() - latest_created).total_seconds() < cooldown:
            return ForgotPasswordResult()

    send_result = create_and_send_password_reset(db, user)
    return ForgotPasswordResult(
        attempted_send=True,
        email_result=send_result.email_result,
    )


def reset_password_with_code(
    db: Session,
    code: str,
    new_password: str,
) -> ResetPasswordResult:
    """Validate a reset code and change the user's password."""
    normalized_code = code.strip()
    if not normalized_code:
        return ResetPasswordResult(status=ResetPasswordStatus.INVALID)

    link_hash = hash_reset_secret(normalized_code)
    link = (
        db.query(PasswordResetLink)
        .filter(PasswordResetLink.link_secret_hash == link_hash)
        .first()
    )
    if link is None:
        return ResetPasswordResult(status=ResetPasswordStatus.INVALID)

    now = _utcnow()
    if link.used_at is not None:
        return ResetPasswordResult(status=ResetPasswordStatus.USED, user=link.user)
    if _ensure_aware(link.expires_at) <= now:
        return ResetPasswordResult(status=ResetPasswordStatus.EXPIRED, user=link.user)

    user = link.user
    if user is None or user.email.lower() != link.sent_to_email.lower():
        return ResetPasswordResult(status=ResetPasswordStatus.INVALID, user=user)
    if not user.is_active:
        return ResetPasswordResult(status=ResetPasswordStatus.INVALID, user=user)

    user.password_hash = hash_password(new_password)
    user.password_changed_at = now
    link.used_at = now
    db.flush()
    return ResetPasswordResult(status=ResetPasswordStatus.RESET, user=user)
