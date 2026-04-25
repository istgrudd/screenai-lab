"""Announcements router — Task 9.1 & 9.2.

Endpoints:
    POST /api/announcements       — Recruiter publishes pass/fail for a candidate
    GET  /api/announcements/my    — Candidate checks their announcement status
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.application import Application, ApplicationStatus
from backend.models.audit import AuditLog
from backend.models.user import User, UserRole

router = APIRouter(prefix="/api/announcements", tags=["announcements"])

_recruiter_or_admin = require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN)
_candidate_only = require_role(UserRole.CANDIDATE)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AnnouncementRequest(BaseModel):
    application_id: int
    result: str  # "pass" or "fail"
    notes: str | None = None


# ---------------------------------------------------------------------------
# Recruiter: publish an announcement
# ---------------------------------------------------------------------------

@router.post("")
def create_announcement(
    payload: AnnouncementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_recruiter_or_admin),
):
    """Publish a pass/fail announcement for a candidate application.

    - result must be "pass" or "fail"
    - Updates application.status to announced_pass or announced_fail
    - Logs to audit_logs
    """
    if payload.result not in ("pass", "fail"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="result must be 'pass' or 'fail'",
        )

    app = db.query(Application).filter(Application.id == payload.application_id).first()
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )

    # Only allow announcing if status is submitted or screening
    if app.status not in (
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.SCREENING,
        ApplicationStatus.ANNOUNCED_PASS,
        ApplicationStatus.ANNOUNCED_FAIL,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot announce — application status is '{app.status.value if hasattr(app.status, 'value') else app.status}'",
        )

    old_status = app.status.value if hasattr(app.status, "value") else str(app.status)
    new_status = (
        ApplicationStatus.ANNOUNCED_PASS
        if payload.result == "pass"
        else ApplicationStatus.ANNOUNCED_FAIL
    )

    app.status = new_status
    db.flush()

    # Audit log
    audit = AuditLog(
        recruiter_id=current_user.id,
        candidate_id=app.user_id,
        action_type="announcement",
        old_value=old_status,
        new_value=new_status.value,
        reason=payload.notes,
    )
    db.add(audit)
    db.commit()
    db.refresh(app)

    return {
        "success": True,
        "data": {
            "application_id": app.id,
            "status": new_status.value,
            "result": payload.result,
            "notes": payload.notes,
            "announced_at": _utcnow().isoformat(),
        },
        "error": None,
    }


# ---------------------------------------------------------------------------
# Candidate: check my announcement
# ---------------------------------------------------------------------------

@router.get("/my")
def get_my_announcement(
    db: Session = Depends(get_db),
    current_user: User = Depends(_candidate_only),
):
    """Get the candidate's announcement status.

    Returns { status, result, notes, announced_at } if announced,
    or { status: "pending", result: null } if not yet announced.
    """
    app = (
        db.query(Application)
        .filter(Application.user_id == current_user.id)
        .order_by(Application.created_at.desc())
        .first()
    )

    if not app:
        return {
            "success": True,
            "data": {
                "status": "no_application",
                "result": None,
                "notes": None,
                "announced_at": None,
            },
            "error": None,
        }

    app_status = app.status.value if hasattr(app.status, "value") else str(app.status)

    if app_status in ("announced_pass", "announced_fail"):
        # Look up the audit log for the announcement details
        audit = (
            db.query(AuditLog)
            .filter(
                AuditLog.candidate_id == app.user_id,
                AuditLog.action_type == "announcement",
            )
            .order_by(AuditLog.timestamp.desc())
            .first()
        )

        result = "pass" if app_status == "announced_pass" else "fail"
        return {
            "success": True,
            "data": {
                "status": app_status,
                "result": result,
                "notes": audit.reason if audit else None,
                "announced_at": audit.timestamp.isoformat() if audit else None,
            },
            "error": None,
        }

    # Not announced yet
    return {
        "success": True,
        "data": {
            "status": "pending",
            "result": None,
            "notes": None,
            "announced_at": None,
        },
        "error": None,
    }
