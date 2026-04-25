"""RecruitmentPeriod router — Phase 2B (Task 11).

Endpoints:
    POST  /api/periods            — Super Admin; create a period (auto-active)
    GET   /api/periods/active     — Public; returns the active period or 404
    GET   /api/periods            — Super Admin; list all periods + app counts
    PUT   /api/periods/{id}       — Super Admin; edit name/end_date/threshold/is_active
    PUT   /api/periods/{id}/close — Super Admin; close a period early

Single-active-period invariant is enforced application-side: every write
that flips ``is_active`` to True deactivates all other periods inside the
same transaction.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.application import Application
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole

router = APIRouter(prefix="/api/periods", tags=["periods"])

_super_admin_only = require_role(UserRole.SUPER_ADMIN)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PeriodCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    start_date: datetime
    end_date: datetime
    threshold_n: int | None = Field(default=None, ge=1)


class PeriodUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    end_date: datetime | None = None
    threshold_n: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class PeriodOut(BaseModel):
    id: int
    name: str
    start_date: str
    end_date: str
    is_active: bool
    threshold_n: int | None
    created_by: int
    created_at: str | None
    application_count: int | None = None

    @classmethod
    def from_period(
        cls, p: RecruitmentPeriod, application_count: int | None = None
    ) -> "PeriodOut":
        return cls(
            id=p.id,
            name=p.name,
            start_date=p.start_date.isoformat() if p.start_date else None,
            end_date=p.end_date.isoformat() if p.end_date else None,
            is_active=bool(p.is_active),
            threshold_n=p.threshold_n,
            created_by=p.created_by,
            created_at=p.created_at.isoformat() if p.created_at else None,
            application_count=application_count,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(dt: datetime) -> datetime:
    """Pydantic accepts naive ISO strings; treat them as UTC for comparison."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _deactivate_others(db: Session, exclude_id: int | None = None) -> None:
    """Set is_active=False on all periods except the optional ``exclude_id``."""
    q = db.query(RecruitmentPeriod).filter(RecruitmentPeriod.is_active == True)  # noqa: E712
    if exclude_id is not None:
        q = q.filter(RecruitmentPeriod.id != exclude_id)
    q.update({RecruitmentPeriod.is_active: False}, synchronize_session=False)


def _get_period_or_404(db: Session, period_id: int) -> RecruitmentPeriod:
    p = db.query(RecruitmentPeriod).filter(RecruitmentPeriod.id == period_id).first()
    if not p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recruitment period not found",
        )
    return p


def _count_applications(db: Session, period_id: int) -> int:
    return (
        db.query(Application).filter(Application.period_id == period_id).count()
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_super_admin_only)],
)
def create_period(
    payload: PeriodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new RecruitmentPeriod and make it the only active one."""
    start = _ensure_aware(payload.start_date)
    end = _ensure_aware(payload.end_date)

    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date harus setelah start_date",
        )
    if start <= _now_utc():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date harus di masa depan",
        )

    # Single-active invariant: deactivate every existing active period
    # before inserting the new active one, in the same transaction.
    _deactivate_others(db)

    period = RecruitmentPeriod(
        name=payload.name.strip(),
        start_date=start,
        end_date=end,
        is_active=True,
        threshold_n=payload.threshold_n,
        created_by=current_user.id,
    )
    db.add(period)
    db.commit()
    db.refresh(period)

    return {
        "success": True,
        "data": PeriodOut.from_period(period, application_count=0).model_dump(),
        "error": None,
    }


@router.get("/active")
def get_active_period(db: Session = Depends(get_db)):
    """Return the currently active period (public — used by candidate countdown)."""
    period = (
        db.query(RecruitmentPeriod)
        .filter(RecruitmentPeriod.is_active == True)  # noqa: E712
        .order_by(RecruitmentPeriod.created_at.desc())
        .first()
    )
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tidak ada periode rekrutasi yang aktif",
        )
    return {
        "success": True,
        "data": PeriodOut.from_period(
            period, application_count=_count_applications(db, period.id)
        ).model_dump(),
        "error": None,
    }


@router.get("", dependencies=[Depends(_super_admin_only)])
def list_periods(db: Session = Depends(get_db)):
    """List all periods (Super Admin), newest first, with application counts."""
    rows = (
        db.query(RecruitmentPeriod)
        .order_by(RecruitmentPeriod.created_at.desc())
        .all()
    )
    items = [
        PeriodOut.from_period(p, application_count=_count_applications(db, p.id)).model_dump()
        for p in rows
    ]
    return {"success": True, "data": items, "error": None}


@router.put("/{period_id}", dependencies=[Depends(_super_admin_only)])
def update_period(
    period_id: int,
    payload: PeriodUpdate,
    db: Session = Depends(get_db),
):
    """Edit a period — name, end_date, threshold_n, is_active.

    ``start_date`` is intentionally not editable after creation.
    Flipping ``is_active`` to True deactivates every other period.
    """
    period = _get_period_or_404(db, period_id)

    if payload.name is not None:
        period.name = payload.name.strip()
    if payload.threshold_n is not None:
        period.threshold_n = payload.threshold_n
    if payload.end_date is not None:
        new_end = _ensure_aware(payload.end_date)
        start = _ensure_aware(period.start_date)
        if new_end <= start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="end_date harus setelah start_date",
            )
        period.end_date = new_end
    if payload.is_active is True:
        _deactivate_others(db, exclude_id=period.id)
        period.is_active = True
    elif payload.is_active is False:
        period.is_active = False

    db.commit()
    db.refresh(period)
    return {
        "success": True,
        "data": PeriodOut.from_period(
            period, application_count=_count_applications(db, period.id)
        ).model_dump(),
        "error": None,
    }


@router.put("/{period_id}/close", dependencies=[Depends(_super_admin_only)])
def close_period(period_id: int, db: Session = Depends(get_db)):
    """Close a period early — sets is_active=False and end_date=now."""
    period = _get_period_or_404(db, period_id)
    if not period.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Periode sudah ditutup",
        )

    period.is_active = False
    period.end_date = _now_utc()
    db.commit()
    db.refresh(period)
    return {
        "success": True,
        "data": PeriodOut.from_period(
            period, application_count=_count_applications(db, period.id)
        ).model_dump(),
        "error": None,
    }
