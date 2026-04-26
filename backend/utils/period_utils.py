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

if TYPE_CHECKING:
    from backend.models.period import RecruitmentPeriod


PhaseLiteral = Literal["UPCOMING", "SUBMISSION", "EVALUATION", "ANNOUNCEMENT", "CLOSED"]


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
