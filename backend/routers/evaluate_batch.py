"""Evaluation batch router — Task 8.1.

Endpoints:
    POST /api/recruiter/evaluate/batch  — Run full evaluation pipeline per division
    GET  /api/recruiter/results/{application_id} — Get evaluation result for one app
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.application import Application
from backend.models.candidate import Candidate, DimensionScore
from backend.models.period import RecruitmentPeriod
from backend.models.rubric import Rubric
from backend.models.user import User, UserRole
from backend.services.evaluation_service import run_evaluation_pipeline
from backend.utils.period_utils import get_current_phase

router = APIRouter(prefix="/api/recruiter", tags=["evaluation"])

_recruiter_or_admin = require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN)


class EvaluateBatchRequest(BaseModel):
    division: str
    application_ids: list[int] | None = None


@router.post(
    "/evaluate/batch",
    dependencies=[Depends(_recruiter_or_admin)],
)
async def evaluate_batch(
    payload: EvaluateBatchRequest,
    db: Session = Depends(get_db),
):
    """Run the full evaluation pipeline for a division.

    Body: { division: str, application_ids: [int] | null }

    If application_ids is null, evaluates all submitted applications
    in the given division.

    Precondition: the division's rubric must have at least one dimension.
    Returns 400 if the rubric has zero dimensions.

    Task 13.2.2 — Soft phase warning: when no active period exists or the
    active period is not currently in the EVALUATION phase, evaluation
    still runs (the recruiter always retains override) but the response
    carries a ``warning`` field so the frontend can flag the action.
    """
    try:
        result = await run_evaluation_pipeline(
            division=payload.division,
            application_ids=payload.application_ids,
            db=db,
        )
    except ValueError as exc:
        msg = str(exc)
        if "no dimensions configured" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=msg,
            )
        if "no rubric found" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=msg,
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=msg,
        )

    warning = _phase_warning(db)

    return {
        "success": True,
        "data": result,
        "warning": warning,
        "error": None,
    }


def _phase_warning(db: Session) -> str | None:
    """Return a soft-warn message if evaluation runs outside the EVALUATION phase.

    Returns ``None`` when an active period exists and ``current_phase`` is
    EVALUATION; otherwise returns the standard warning string. The message
    is the same in both "no active period" and "wrong phase" cases —
    Task 13.2.2 specifies a single soft-warn payload.
    """
    period = (
        db.query(RecruitmentPeriod)
        .filter(RecruitmentPeriod.is_active == True)  # noqa: E712
        .first()
    )
    if period is None:
        return "Evaluasi dijalankan di luar window evaluasi resmi."
    phase = get_current_phase(period, datetime.now(timezone.utc))
    if phase != "EVALUATION":
        return "Evaluasi dijalankan di luar window evaluasi resmi."
    return None


@router.get(
    "/results/{application_id}",
    dependencies=[Depends(_recruiter_or_admin)],
)
def get_evaluation_result(
    application_id: int,
    db: Session = Depends(get_db),
):
    """Get the evaluation result for a specific application.

    Returns the Candidate pipeline record linked to the application's user,
    including dimension scores, KHS summary, KTM status, and SWOT text.
    """
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    candidate = (
        db.query(Candidate)
        .filter(Candidate.user_id == app.user_id)
        .order_by(Candidate.created_at.desc())
        .first()
    )

    if not candidate:
        return {
            "success": True,
            "data": None,
            "error": None,
        }

    # Dimension scores
    dim_scores = (
        db.query(DimensionScore)
        .filter(DimensionScore.candidate_id == candidate.id)
        .all()
    )

    return {
        "success": True,
        "data": {
            "application_id": application_id,
            "candidate_id": candidate.id,
            "anonymous_id": candidate.anonymous_id,
            "composite_score": candidate.composite_score,
            "profile_summary": candidate.profile_summary,
            "status": candidate.status,
            "language_score": candidate.language_score,
            "language_bonus": candidate.language_bonus,
            "dimension_scores": [
                {
                    "id": ds.id,
                    "dimension_id": ds.dimension_id,
                    "dimension_name": ds.dimension.name if ds.dimension else None,
                    "score": ds.score,
                    "weighted_score": ds.weighted_score,
                    "weight": ds.dimension.weight if ds.dimension else None,
                    "justification": ds.justification,
                    "evidence": ds.evidence_json,
                    "is_override": ds.is_override,
                }
                for ds in dim_scores
            ],
        },
        "error": None,
    }
