"""Super-admin email notification delivery log listing endpoint."""

from __future__ import annotations

from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from backend.config import settings
from backend.database import get_db
from backend.middleware.auth_middleware import require_role
from backend.models.email_notification import EmailNotification
from backend.models.user import User, UserRole

router = APIRouter(prefix="/api/admin", tags=["admin-email-notifications"])

_super_admin_only = require_role(UserRole.SUPER_ADMIN)
_SENSITIVE_TEXT_MARKERS = (
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


def _enum_value(value) -> str | None:
    if value is None:
        return None
    return value.value if hasattr(value, "value") else str(value)


def _parse_datetime_bound(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if value is None or not value.strip():
        return None

    raw = value.strip()
    try:
        if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
            date_value = datetime.fromisoformat(raw).date()
            parsed = datetime.combine(
                date_value,
                time.max if end_of_day else time.min,
                tzinfo=timezone.utc,
            )
        else:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from and date_to must be ISO-8601 dates or datetimes",
        ) from exc

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _utc_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def _safe_text(value: str | None) -> str | None:
    if value is None:
        return None
    lowered = value.lower()
    if any(marker in lowered for marker in _SENSITIVE_TEXT_MARKERS):
        return "[redacted]"
    return value


def _user_payload(user: User | None, user_id: int | None) -> dict | None:
    if user is None and user_id is None:
        return None
    return {
        "id": user.id if user else user_id,
        "full_name": user.full_name if user else None,
        "email": user.email if user else None,
        "role": _enum_value(user.role) if user else None,
    }


def _notification_payload(row: EmailNotification) -> dict:
    return {
        "id": row.id,
        "notification_type": row.notification_type,
        "to_email": row.to_email,
        "subject": row.subject,
        "provider": row.provider,
        "provider_message_id": row.provider_message_id,
        "status": row.status,
        "error_message": _safe_text(row.error_message),
        "created_at": _utc_iso(row.created_at),
        "sent_at": _utc_iso(row.sent_at),
        "user": _user_payload(row.user, row.user_id),
        "related_application_id": row.related_application_id,
        "related_audit_log_id": row.related_audit_log_id,
    }


def _email_config_payload() -> dict:
    return {
        "provider": "resend" if settings.email_enabled else "disabled",
        "email_enabled": settings.email_enabled,
        "environment": settings.environment,
        "from_email": settings.email_from or None,
    }


@router.get("/email-notifications", dependencies=[Depends(_super_admin_only)])
def list_email_notifications(
    page: int = Query(1, ge=1, description="1-indexed page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page (1-100)"),
    notification_type: str | None = Query(None, max_length=80),
    status_filter: str | None = Query(None, alias="status", max_length=20),
    to_email: str | None = Query(None, max_length=255),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Return email notification logs for super-admin monitoring."""
    parsed_from = _parse_datetime_bound(date_from)
    parsed_to = _parse_datetime_bound(date_to, end_of_day=True)
    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must be before or equal to date_to",
        )

    query = db.query(EmailNotification)

    if notification_type and notification_type.strip():
        query = query.filter(
            EmailNotification.notification_type == notification_type.strip()
        )
    if status_filter and status_filter.strip():
        query = query.filter(EmailNotification.status == status_filter.strip())
    if to_email and to_email.strip():
        query = query.filter(
            EmailNotification.to_email.ilike(f"%{to_email.strip().lower()}%")
        )
    if parsed_from is not None:
        query = query.filter(EmailNotification.created_at >= parsed_from)
    if parsed_to is not None:
        query = query.filter(EmailNotification.created_at <= parsed_to)

    total = query.count()
    status_rows = (
        query.with_entities(EmailNotification.status, func.count(EmailNotification.id))
        .group_by(EmailNotification.status)
        .all()
    )
    summary = {
        "total": total,
        "sent": 0,
        "captured": 0,
        "failed": 0,
        "disabled": 0,
    }
    for status_value, count in status_rows:
        if status_value in summary:
            summary[status_value] = count

    rows = (
        query.options(joinedload(EmailNotification.user))
        .order_by(EmailNotification.created_at.desc(), EmailNotification.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "success": True,
        "data": {
            "page": page,
            "limit": limit,
            "total": total,
            "summary": summary,
            "config": _email_config_payload(),
            "items": [_notification_payload(row) for row in rows],
        },
        "error": None,
    }
