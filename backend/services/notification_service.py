"""Workflow email notification orchestration.

Recruitment notifications are best-effort: delivery failures are logged in
``email_notifications`` but never cancel the application, review, or
announcement transaction that already succeeded.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import logging

from sqlalchemy.orm import Session

from backend.config import settings
from backend.models.application import Application
from backend.models.email_notification import EmailNotification
from backend.models.user import User
from backend.services.email_service import EmailSendResult, send_email
from backend.services.email_templates import (
    EmailTemplate,
    announcement_published_email,
    application_submitted_email,
    document_rejected_email,
)

logger = logging.getLogger(__name__)

APPLICATION_SUBMITTED = "application_submitted"
DOCUMENT_REJECTED = "document_rejected"
ANNOUNCEMENT_PUBLISHED = "announcement_published"

_SENSITIVE_ERROR_MARKERS = (
    "password",
    "jwt",
    "token",
    "secret",
    "verification",
    "reset",
    "authorization",
    "bearer",
    "traceback",
    "stack trace",
)


@dataclass(frozen=True)
class NotificationSendResult:
    notification_id: int | None
    status: str | None
    email_result: EmailSendResult | None = None
    error: str | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _portal_url(path: str = "/application/status") -> str:
    base_url = (settings.public_frontend_url or settings.frontend_url).strip().rstrip("/")
    return f"{base_url}{path}"


def _safe_error(value: str | None) -> str | None:
    if not value:
        return None
    compact = " ".join(str(value).split())
    lowered = compact.lower()
    if any(marker in lowered for marker in _SENSITIVE_ERROR_MARKERS):
        return "[redacted]"
    return compact[:500]


def _status_from_result(result: EmailSendResult) -> str:
    if not result.success:
        return "failed"
    if result.captured:
        return "captured"
    if result.disabled:
        return "disabled"
    return "sent"


def _send_notification(
    db: Session,
    *,
    user: User,
    notification_type: str,
    template: EmailTemplate,
    related_application_id: int | None = None,
    related_audit_log_id: int | None = None,
) -> NotificationSendResult:
    notification: EmailNotification | None = None
    try:
        notification = EmailNotification(
            user_id=user.id,
            notification_type=notification_type,
            to_email=user.email,
            subject=template.subject,
            status="pending",
            created_at=_utcnow(),
            related_application_id=related_application_id,
            related_audit_log_id=related_audit_log_id,
        )
        db.add(notification)
        db.flush()

        try:
            email_result = send_email(
                to_email=user.email,
                subject=template.subject,
                html=template.html,
                text=template.text,
            )
        except Exception as exc:  # pragma: no cover - defensive provider guard
            logger.warning(
                "Workflow notification send crashed for %s: %s",
                notification_type,
                exc.__class__.__name__,
            )
            email_result = EmailSendResult(
                success=False,
                provider="unknown",
                error="Email provider request failed.",
            )

        notification.provider = email_result.provider
        notification.provider_message_id = email_result.message_id
        notification.status = _status_from_result(email_result)
        notification.error_message = (
            _safe_error(email_result.error) if not email_result.success else None
        )
        if email_result.success:
            notification.sent_at = _utcnow()

        db.commit()
        db.refresh(notification)
        return NotificationSendResult(
            notification_id=notification.id,
            status=notification.status,
            email_result=email_result,
            error=notification.error_message,
        )
    except Exception as exc:  # pragma: no cover - protects primary workflow
        db.rollback()
        logger.warning(
            "Workflow notification logging failed for %s: %s",
            notification_type,
            exc.__class__.__name__,
        )
        return NotificationSendResult(
            notification_id=notification.id if notification else None,
            status="failed",
            error="Email notification could not be logged.",
        )


def send_application_submitted_notification(
    db: Session,
    *,
    application: Application,
    user: User,
) -> NotificationSendResult:
    """Notify a candidate that their application entered document review."""
    template = application_submitted_email(
        recipient_name=user.full_name,
        division=_enum_value(application.division),
        portal_url=_portal_url(),
    )
    return _send_notification(
        db,
        user=user,
        notification_type=APPLICATION_SUBMITTED,
        template=template,
        related_application_id=application.id,
    )


def send_document_rejected_notification(
    db: Session,
    *,
    application: Application,
    user: User,
    rejected_document_types: list[str],
    rejection_reasons: dict[str, str | None],
) -> NotificationSendResult | None:
    """Notify a candidate after finalized review requests corrections."""
    if not rejected_document_types:
        return None
    template = document_rejected_email(
        recipient_name=user.full_name,
        rejected_document_types=rejected_document_types,
        rejection_reasons=rejection_reasons,
        portal_url=_portal_url("/documents"),
    )
    return _send_notification(
        db,
        user=user,
        notification_type=DOCUMENT_REJECTED,
        template=template,
        related_application_id=application.id,
    )


def send_announcement_published_notification(
    db: Session,
    *,
    application: Application,
    user: User,
    result: str,
    notes: str | None = None,
    related_audit_log_id: int | None = None,
) -> NotificationSendResult:
    """Notify a candidate that their published result is available."""
    template = announcement_published_email(
        recipient_name=user.full_name,
        result=result,
        notes=notes,
        portal_url=_portal_url(),
    )
    return _send_notification(
        db,
        user=user,
        notification_type=ANNOUNCEMENT_PUBLISHED,
        template=template,
        related_application_id=application.id,
        related_audit_log_id=related_audit_log_id,
    )
