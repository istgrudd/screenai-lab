"""Candidate email verification orchestration."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from urllib.parse import urlencode

from sqlalchemy.orm import Session

from backend.config import settings
from backend.models.email_verification import EmailVerificationLink
from backend.models.user import User, UserRole
from backend.services.email_service import EmailSendResult, send_email
from backend.services.email_templates import verification_email


GENERIC_RESEND_MESSAGE = (
    "If an unverified candidate account exists for this email, "
    "a verification email has been sent."
)


class VerifyEmailStatus:
    VERIFIED = "verified"
    ALREADY_VERIFIED = "already_verified"
    INVALID = "invalid"
    EXPIRED = "expired"
    USED = "used"


@dataclass(frozen=True)
class VerificationSendResult:
    success: bool
    email_result: EmailSendResult
    error: str | None = None


@dataclass(frozen=True)
class VerificationResult:
    status: str
    user: User | None = None


@dataclass(frozen=True)
class ResendResult:
    message: str = GENERIC_RESEND_MESSAGE
    attempted_send: bool = False
    email_result: EmailSendResult | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_verification_secret(secret: str) -> str:
    """Hash a verification secret with the app secret key."""
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        secret.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def build_verification_url(secret: str) -> str:
    """Build the public frontend verification URL from trusted settings."""
    base_url = (settings.public_frontend_url or settings.frontend_url).strip().rstrip("/")
    return f"{base_url}/verify-email?{urlencode({'code': secret})}"


def create_and_send_verification(
    db: Session,
    user: User,
) -> VerificationSendResult:
    """Create a one-time verification link and send it via email service.

    The caller owns commit/rollback so register can keep user creation and
    verification-record creation in one transaction.
    """
    now = _utcnow()
    secret = secrets.token_urlsafe(32)
    expires_at = now + timedelta(minutes=settings.email_verification_expire_minutes)
    link = EmailVerificationLink(
        user_id=user.id,
        link_secret_hash=hash_verification_secret(secret),
        expires_at=expires_at,
        sent_to_email=user.email.lower(),
        created_at=now,
    )
    user.email_verification_sent_at = now
    db.add(link)
    db.flush()

    template = verification_email(
        recipient_name=user.full_name,
        verification_url=build_verification_url(secret),
        expires_minutes=settings.email_verification_expire_minutes,
    )
    send_result = send_email(
        to_email=user.email,
        subject=template.subject,
        html=template.html,
        text=template.text,
    )
    if not send_result.success:
        return VerificationSendResult(
            success=False,
            email_result=send_result,
            error=send_result.error or "Verification email could not be sent.",
        )
    return VerificationSendResult(success=True, email_result=send_result)


def verify_email_code(db: Session, code: str) -> VerificationResult:
    """Mark a candidate email verified when the submitted code is valid."""
    normalized_code = code.strip()
    if not normalized_code:
        return VerificationResult(status=VerifyEmailStatus.INVALID)

    link_hash = hash_verification_secret(normalized_code)
    link = (
        db.query(EmailVerificationLink)
        .filter(EmailVerificationLink.link_secret_hash == link_hash)
        .first()
    )
    if link is None:
        return VerificationResult(status=VerifyEmailStatus.INVALID)

    now = _utcnow()
    if link.used_at is not None:
        return VerificationResult(status=VerifyEmailStatus.USED, user=link.user)
    if _ensure_aware(link.expires_at) <= now:
        return VerificationResult(status=VerifyEmailStatus.EXPIRED, user=link.user)

    user = link.user
    if user is None or user.role != UserRole.CANDIDATE:
        return VerificationResult(status=VerifyEmailStatus.INVALID)
    if user.email.lower() != link.sent_to_email.lower():
        return VerificationResult(status=VerifyEmailStatus.INVALID, user=user)

    link.used_at = now
    if user.email_verified_at is None:
        user.email_verified_at = now
        db.flush()
        return VerificationResult(status=VerifyEmailStatus.VERIFIED, user=user)

    db.flush()
    return VerificationResult(status=VerifyEmailStatus.ALREADY_VERIFIED, user=user)


def resend_verification_if_allowed(db: Session, email: str) -> ResendResult:
    """Issue a new candidate verification email without leaking account state."""
    normalized_email = email.lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    if user is None:
        return ResendResult()
    if user.role != UserRole.CANDIDATE:
        return ResendResult()
    if user.email_verified_at is not None:
        return ResendResult()

    now = _utcnow()
    sent_at = _ensure_aware(user.email_verification_sent_at)
    cooldown = max(settings.email_resend_cooldown_seconds, 0)
    if sent_at and cooldown and (now - sent_at).total_seconds() < cooldown:
        return ResendResult()

    send_result = create_and_send_verification(db, user)
    return ResendResult(
        attempted_send=True,
        email_result=send_result.email_result,
    )
