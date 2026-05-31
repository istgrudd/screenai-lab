"""Phase derivation helpers for ``RecruitmentPeriod`` — Task 13.1.

A period is divided into four explicit phase boundaries:

    UPCOMING     : now < start_date
    SUBMISSION   : start_date          ≤ now < submission_end_date
    EVALUATION   : submission_end_date ≤ now < evaluation_end_date
    ANNOUNCEMENT : evaluation_end_date ≤ now < end_date
    CLOSED       : end_date            ≤ now

Periods created before Task 13.1 may not have ``submission_end_date`` or
``evaluation_end_date`` set. We treat a missing intermediate boundary as
collapsed onto ``end_date``, so a legacy period reads as one continuous
SUBMISSION window followed by CLOSED — preserving previous semantics.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, TYPE_CHECKING

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from backend.models.period import RecruitmentPeriod


PhaseLiteral = Literal["UPCOMING", "SUBMISSION", "EVALUATION", "ANNOUNCEMENT", "CLOSED"]

_SUBMISSION_PHASE_MESSAGES = {
    "UPCOMING": "Periode rekrutasi belum dibuka.",
    "EVALUATION": "Masa pendaftaran telah ditutup.",
    "ANNOUNCEMENT": "Masa pendaftaran telah ditutup.",
    "CLOSED": "Periode rekrutasi telah berakhir.",
}


def _ensure_aware(dt: datetime | None) -> datetime | None:
    """Treat naive datetimes (DB round-trip on SQLite) as UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def get_current_phase(
    period: "RecruitmentPeriod",
    now: datetime,
) -> PhaseLiteral:
    """Pure function: derive the current phase from a period and ``now``.

    Both ``now`` and the period dates are normalized to tz-aware UTC for
    comparison. The function never reads ``is_active`` — phase is purely
    a function of the calendar.
    """
    now_aware = _ensure_aware(now)
    start = _ensure_aware(period.start_date)
    end = _ensure_aware(period.end_date)
    sub_end = _ensure_aware(period.submission_end_date) or end
    eval_end = _ensure_aware(period.evaluation_end_date) or end

    if now_aware < start:
        return "UPCOMING"
    if now_aware < sub_end:
        return "SUBMISSION"
    if now_aware < eval_end:
        return "EVALUATION"
    if now_aware < end:
        return "ANNOUNCEMENT"
    return "CLOSED"


def get_active_period_or_403(db: Session) -> "RecruitmentPeriod":
    """Return the active period or reject candidate workflow mutations."""
    from backend.models.period import RecruitmentPeriod

    period = (
        db.query(RecruitmentPeriod)
        .filter(RecruitmentPeriod.is_active == True)  # noqa: E712
        .order_by(RecruitmentPeriod.created_at.desc())
        .first()
    )
    if period is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tidak ada periode rekrutasi yang aktif saat ini.",
        )
    return period


def assert_submission_phase(db: Session) -> "RecruitmentPeriod":
    """Require an active recruitment period currently in SUBMISSION phase."""
    period = get_active_period_or_403(db)
    phase = get_current_phase(period, datetime.now(timezone.utc))
    if phase != "SUBMISSION":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_SUBMISSION_PHASE_MESSAGES.get(
                phase,
                "Pendaftaran tidak diperbolehkan saat ini.",
            ),
        )
    return period
