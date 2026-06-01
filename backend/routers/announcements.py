"""Announcements router — Task 9.1, 9.2 & Task 12.4.

Endpoints:
    POST /api/announcements       — Recruiter publishes pass/fail for a candidate
    POST /api/announcements/bulk  — Recruiter bulk-announces a whole division
    GET  /api/announcements/my    — Candidate checks their announcement status
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.middleware.rate_limit import limiter, user_or_ip_key
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.audit import AuditLog
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole
from backend.services.notification_service import send_announcement_published_notification
from backend.utils.period_utils import get_current_phase

router = APIRouter(prefix="/api/announcements", tags=["announcements"])

_recruiter_or_admin = require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN)
_candidate_only = require_role(UserRole.CANDIDATE)

# Statuses that count as "evaluated" — only these are touched by bulk announce.
_EVALUATED_STATUSES = (
    ApplicationStatus.SCREENING,
    ApplicationStatus.ANNOUNCED_PASS,
    ApplicationStatus.ANNOUNCED_FAIL,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AnnouncementRequest(BaseModel):
    application_id: int
    result: str  # "pass" or "fail"
    notes: str | None = None


class BulkAnnounceRequest(BaseModel):
    division: Division
    period_id: int
    passed_application_ids: list[int]


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

    # Only allow announcing after evaluation/screening.
    if app.status not in (
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

    candidate_user = db.query(User).filter(User.id == app.user_id).first()
    if candidate_user:
        send_announcement_published_notification(
            db,
            application=app,
            user=candidate_user,
            result=payload.result,
            notes=payload.notes,
            related_audit_log_id=audit.id,
        )

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
# Recruiter: bulk announce per division (Task 12.4)
# ---------------------------------------------------------------------------

@router.post("/bulk")
@limiter.limit("10/minute", key_func=user_or_ip_key)
def bulk_announce(
    request: Request,
    payload: BulkAnnounceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_recruiter_or_admin),
):
    """Bulk-publish pass/fail for an entire (division, period) cohort.

    Logic:
      * Scope = applications WHERE division = X AND period_id = Y AND status
        in (screening, announced_pass, announced_fail). SUBMITTED is never
        touched (those still need evaluation).
      * Every id in ``passed_application_ids`` must belong to that scope —
        otherwise 400.
      * Within scope: id ∈ passed → announced_pass; else → announced_fail.
      * One audit_log entry per *actual* status change.
      * Single ``db.commit()`` at the end (transactional).
    """
    period = (
        db.query(RecruitmentPeriod)
        .filter(RecruitmentPeriod.id == payload.period_id)
        .first()
    )
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"RecruitmentPeriod {payload.period_id} not found",
        )

    # Task 13.2.3 — bulk publish is only allowed inside the ANNOUNCEMENT
    # phase. Super Admins bypass this lock so they can manually correct
    # results outside the official window.
    if current_user.role != UserRole.SUPER_ADMIN:
        phase = get_current_phase(period, datetime.now(timezone.utc))
        if phase != "ANNOUNCEMENT":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Pengumuman hanya dapat dipublikasikan pada fase Pengumuman.",
            )

    scope = (
        db.query(Application)
        .filter(
            Application.division == payload.division,
            Application.period_id == payload.period_id,
            Application.status.in_(_EVALUATED_STATUSES),
        )
        .all()
    )
    scope_ids = {app.id for app in scope}

    invalid_ids = [aid for aid in payload.passed_application_ids if aid not in scope_ids]
    if invalid_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Application(s) {invalid_ids} do not belong to division "
                f"'{payload.division.value}' / period {payload.period_id} or are "
                f"not yet evaluated"
            ),
        )

    passed_set = set(payload.passed_application_ids)
    pass_count = 0
    fail_count = 0
    notifications_to_send: list[tuple[int, int, str, AuditLog]] = []

    for app in scope:
        new_status = (
            ApplicationStatus.ANNOUNCED_PASS
            if app.id in passed_set
            else ApplicationStatus.ANNOUNCED_FAIL
        )
        old_status = app.status.value if hasattr(app.status, "value") else str(app.status)

        if app.status != new_status:
            app.status = new_status
            audit = AuditLog(
                recruiter_id=current_user.id,
                candidate_id=app.user_id,
                action_type="bulk_announcement",
                old_value=old_status,
                new_value=new_status.value,
                reason=None,
            )
            db.add(audit)
            notifications_to_send.append(
                (
                    app.id,
                    app.user_id,
                    "pass" if new_status == ApplicationStatus.ANNOUNCED_PASS else "fail",
                    audit,
                )
            )

        if new_status == ApplicationStatus.ANNOUNCED_PASS:
            pass_count += 1
        else:
            fail_count += 1

    db.flush()
    db.commit()

    for app_id, user_id, result_value, audit in notifications_to_send:
        app = db.query(Application).filter(Application.id == app_id).first()
        candidate_user = db.query(User).filter(User.id == user_id).first()
        if app and candidate_user:
            send_announcement_published_notification(
                db,
                application=app,
                user=candidate_user,
                result=result_value,
                notes=None,
                related_audit_log_id=audit.id,
            )

    return {
        "success": True,
        "data": {
            "announced_pass": pass_count,
            "announced_fail": fail_count,
            "division": payload.division.value,
            "period_id": payload.period_id,
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
        # Look up the most recent announcement audit row for this candidate.
        # Bulk announces use action_type="bulk_announcement" and per-app uses
        # "announcement" — fall back to either so the candidate sees their
        # notes/announced_at regardless of which path the recruiter took.
        audit = (
            db.query(AuditLog)
            .filter(
                AuditLog.candidate_id == app.user_id,
                AuditLog.action_type.in_(("announcement", "bulk_announcement")),
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
