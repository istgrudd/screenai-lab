"""Super-admin audit log listing endpoint."""

from __future__ import annotations

from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.middleware.auth_middleware import require_role
from backend.models.audit import AuditLog
from backend.models.user import User, UserRole

router = APIRouter(prefix="/api/admin", tags=["admin-audit-logs"])

_super_admin_only = require_role(UserRole.SUPER_ADMIN)
_SENSITIVE_TEXT_MARKERS = (
    "password",
    "password_hash",
    "jwt",
    "token",
    "secret",
    "verification_code",
    "reset_code",
    "reset_token",
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


def _actor_payload(user: User | None, user_id: int | None) -> dict | None:
    if user is None and user_id is None:
        return None
    return {
        "user_id": user.id if user else user_id,
        "full_name": user.full_name if user else None,
        "email": user.email if user else None,
        "role": _enum_value(user.role) if user else None,
    }


def _affected_user_payload(user: User | None, user_id: int | None) -> dict | None:
    if user is None and user_id is None:
        return None
    return {
        "user_id": user.id if user else user_id,
        "full_name": user.full_name if user else None,
        "email": user.email if user else None,
        "nim": user.nim if user else None,
    }


def _audit_log_payload(row: AuditLog) -> dict:
    return {
        "id": row.id,
        "action_type": row.action_type,
        "actor": _actor_payload(row.recruiter, row.recruiter_id),
        "affected_user": _affected_user_payload(row.candidate, row.candidate_id),
        "old_value": _safe_text(row.old_value),
        "new_value": _safe_text(row.new_value),
        "reason": _safe_text(row.reason),
        "timestamp": _utc_iso(row.timestamp),
    }


@router.get("/audit-logs", dependencies=[Depends(_super_admin_only)])
def list_audit_logs(
    page: int = Query(1, ge=1, description="1-indexed page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page (1-100)"),
    action_type: str | None = Query(None, max_length=50),
    recruiter_id: int | None = Query(None, ge=1),
    candidate_id: int | None = Query(
        None,
        ge=1,
        description="Affected user id stored in AuditLog.candidate_id",
    ),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Return audit logs for super-admin oversight.

    ``candidate_id`` intentionally means the affected user's ``users.id``.
    The endpoint is read-only and only returns selected, non-sensitive user
    summary fields.
    """
    parsed_from = _parse_datetime_bound(date_from)
    parsed_to = _parse_datetime_bound(date_to, end_of_day=True)
    if parsed_from and parsed_to and parsed_from > parsed_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must be before or equal to date_to",
        )

    query = db.query(AuditLog)

    if action_type and action_type.strip():
        query = query.filter(AuditLog.action_type == action_type.strip())
    if recruiter_id is not None:
        query = query.filter(AuditLog.recruiter_id == recruiter_id)
    if candidate_id is not None:
        query = query.filter(AuditLog.candidate_id == candidate_id)
    if parsed_from is not None:
        query = query.filter(AuditLog.timestamp >= parsed_from)
    if parsed_to is not None:
        query = query.filter(AuditLog.timestamp <= parsed_to)

    total = query.count()
    rows = (
        query.options(
            joinedload(AuditLog.recruiter),
            joinedload(AuditLog.candidate),
        )
        .order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
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
            "items": [_audit_log_payload(row) for row in rows],
        },
        "error": None,
    }
