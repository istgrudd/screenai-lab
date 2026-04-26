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
    submission_end_date: datetime | None = None
    evaluation_end_date: datetime | None = None
    threshold_n: int | None = Field(default=None, ge=1)


class PeriodUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    end_date: datetime | None = None
    submission_end_date: datetime | None = None
    evaluation_end_date: datetime | None = None
    threshold_n: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class PeriodOut(BaseModel):
    id: int
    name: str
    start_date: str
    submission_end_date: str | None
    evaluation_end_date: str | None
    end_date: str
    is_active: bool
    threshold_n: int | None
    created_by: int
    created_at: str | None
    application_count: int | None = None
    current_phase: str
    phases: dict

    @classmethod
    def from_period(
        cls, p: RecruitmentPeriod, application_count: int | None = None
    ) -> "PeriodOut":
        return cls(
            id=p.id,
            name=p.name,
            start_date=_utc_iso(p.start_date),
            submission_end_date=_utc_iso(p.submission_end_date),
            evaluation_end_date=_utc_iso(p.evaluation_end_date),
            end_date=_utc_iso(p.end_date),
            is_active=bool(p.is_active),
            threshold_n=p.threshold_n,
            created_by=p.created_by,
            created_at=_utc_iso(p.created_at),
            application_count=application_count,
            current_phase=p.current_phase,
            phases=_phases_dict(p),
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


def _utc_iso(dt: datetime | None) -> str | None:
    """Serialize a stored datetime as a tz-aware UTC ISO string.

    Why: the ``DateTime`` column strips tz info on round-trip (esp. SQLite),
    so a naive value here is always UTC by convention. Emit it with ``+00:00``
    so the browser parses it as UTC instead of local time.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _phases_dict(p: RecruitmentPeriod) -> dict:
    """Return phase boundaries as a structured object for the frontend.

    For legacy periods without ``submission_end_date`` / ``evaluation_end_date``,
    the missing boundaries collapse onto ``end_date`` — matching the
    fallback semantics in ``get_current_phase``.
    """
    sub_end = p.submission_end_date or p.end_date
    eval_end = p.evaluation_end_date or p.end_date
    return {
        "submission": {"start": _utc_iso(p.start_date), "end": _utc_iso(sub_end)},
        "evaluation": {"start": _utc_iso(sub_end), "end": _utc_iso(eval_end)},
        "announcement": {"start": _utc_iso(eval_end), "end": _utc_iso(p.end_date)},
    }


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


def _validate_phase_order(
    start: datetime,
    submission_end: datetime | None,
    evaluation_end: datetime | None,
    end: datetime,
) -> None:
    """Enforce ``start < submission_end_date < evaluation_end_date < end_date``.

    Either of the two intermediate boundaries may be ``None`` (back-compat
    for legacy periods) — only the boundaries that are actually present
    participate in the strict ordering check, but ``start < end`` is
    always enforced.
    """
    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date harus setelah start_date",
        )
    sub = submission_end
    ev = evaluation_end
    if sub is not None and not (start < sub):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="submission_end_date harus setelah start_date",
        )
    if ev is not None and not (ev < end):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="evaluation_end_date harus sebelum end_date",
        )
    if sub is not None and ev is not None and not (sub < ev):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="submission_end_date harus sebelum evaluation_end_date",
        )
    # Cross-check single-sided: if only one intermediate is set, it must
    # still sit strictly between start and end.
    if sub is not None and ev is None and not (sub < end):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="submission_end_date harus sebelum end_date",
        )
    if ev is not None and sub is None and not (start < ev):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="evaluation_end_date harus setelah start_date",
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
    sub_end = (
        _ensure_aware(payload.submission_end_date)
        if payload.submission_end_date is not None
        else None
    )
    eval_end = (
        _ensure_aware(payload.evaluation_end_date)
        if payload.evaluation_end_date is not None
        else None
    )

    _validate_phase_order(start, sub_end, eval_end, end)
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
        submission_end_date=sub_end,
        evaluation_end_date=eval_end,
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
    """Edit a period — name, end_date, phase boundaries, threshold_n, is_active.

    ``start_date`` is intentionally not editable after creation.
    Flipping ``is_active`` to True deactivates every other period.
    Phase boundaries (``submission_end_date``, ``evaluation_end_date``,
    ``end_date``) are validated together so the four-point ordering
    ``start < submission_end < evaluation_end < end`` always holds.
    """
    period = _get_period_or_404(db, period_id)

    if payload.name is not None:
        period.name = payload.name.strip()
    if payload.threshold_n is not None:
        period.threshold_n = payload.threshold_n

    # Resolve the proposed final state for date fields (incoming value or
    # the current stored value), then validate them as one set.
    incoming_end = (
        _ensure_aware(payload.end_date)
        if payload.end_date is not None
        else _ensure_aware(period.end_date)
    )
    incoming_sub = (
        _ensure_aware(payload.submission_end_date)
        if payload.submission_end_date is not None
        else _ensure_aware(period.submission_end_date)
    )
    incoming_eval = (
        _ensure_aware(payload.evaluation_end_date)
        if payload.evaluation_end_date is not None
        else _ensure_aware(period.evaluation_end_date)
    )
    start_aware = _ensure_aware(period.start_date)

    if (
        payload.end_date is not None
        or payload.submission_end_date is not None
        or payload.evaluation_end_date is not None
    ):
        _validate_phase_order(start_aware, incoming_sub, incoming_eval, incoming_end)

    if payload.end_date is not None:
        period.end_date = incoming_end
    if payload.submission_end_date is not None:
        period.submission_end_date = incoming_sub
    if payload.evaluation_end_date is not None:
        period.evaluation_end_date = incoming_eval

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
