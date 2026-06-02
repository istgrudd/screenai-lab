"""Evaluation batch router — Task 8.1.

Endpoints:
    POST /api/recruiter/evaluate/batch  — Run full evaluation pipeline per division
    GET  /api/recruiter/results/{application_id} — Get evaluation result for one app
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.application import Application, Division
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import DocumentType
from backend.models.period import RecruitmentPeriod
from backend.models.rubric import Rubric
from backend.models.user import User, UserRole
from backend.services.evaluation_service import run_evaluation_pipeline
from backend.services.khs_parser import (
    khs_cache_scoring_metadata,
    khs_processing_status,
    parsed_khs_from_cache,
)
from backend.utils.period_utils import get_current_phase

router = APIRouter(prefix="/api/recruiter", tags=["evaluation"])
logger = logging.getLogger(__name__)

_recruiter_or_admin = require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN)

_SANITIZED_ERROR = (
    "Evaluation failed due to an internal error. "
    "Please contact the administrator."
)


class EvaluateBatchRequest(BaseModel):
    # Task 14.1: typed as Division so FastAPI rejects unknown values at the
    # schema layer with a clean 422 instead of letting them reach the
    # service and surface as a raw ValueError.
    division: Division
    application_ids: list[int] | None = None
    # Task 13.5.1 — when True, re-evaluate already-scored candidates.
    # The verified/screening eligibility filter still applies.
    force: bool = False


@router.post(
    "/evaluate/batch",
    dependencies=[Depends(_recruiter_or_admin)],
)
async def evaluate_batch(
    payload: EvaluateBatchRequest,
    db: Session = Depends(get_db),
):
    """Run the full evaluation pipeline for a division.

    Body: { division: str, application_ids: [int] | null, force: bool }

    If application_ids is null, evaluates all eligible applications in the
    given division. By default (force=False) candidates whose Candidate row
    already carries a composite_score are skipped to avoid recomputation.
    With force=True the score filter is bypassed; the verified/screening
    eligibility filter still applies regardless.

    Precondition: the division's rubric must have at least one dimension.
    Returns 400 if the rubric has zero dimensions.

    Task 13.2.2 — Soft phase warning: when no active period exists or the
    active period is not currently in the EVALUATION phase, evaluation
    still runs (the recruiter always retains override) but the response
    carries a ``warning`` field so the frontend can flag the action.
    """
    try:
        result = await run_evaluation_pipeline(
            division=payload.division.value,
            application_ids=payload.application_ids,
            db=db,
            force=payload.force,
        )
    except ValueError as exc:
        msg = str(exc)
        # Known ValueError shapes map to clean 4xx codes with their original
        # message — these are deterministic, recruiter-actionable errors.
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
        if "rubric weights must sum" in msg.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=msg,
            )
        # Unrecognized ValueError — log full detail server-side, return a
        # sanitized 500 so internal exception text never reaches the client.
        logger.error(
            "Unrecognized ValueError in evaluate_batch: %s",
            msg,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_SANITIZED_ERROR,
        )
    except HTTPException:
        # Preserve HTTPExceptions raised by inner code (or by us above) —
        # never let them fall through to the catch-all and get sanitized.
        raise
    except Exception as exc:  # pragma: no cover — defensive catch-all
        logger.error(
            "Unexpected error in evaluate_batch: %s", exc, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_SANITIZED_ERROR,
        )

    warning = _phase_warning(db)
    skipped_count = int(result.pop("skipped", 0))
    skipped_already_scored_count = int(result.pop("skipped_already_scored_count", 0))
    skipped_unverified_count = int(result.pop("skipped_unverified_count", 0))
    skipped_correction_count = int(result.pop("skipped_correction_count", 0))
    evaluated_count = int(result.get("queued", 0))

    return {
        "success": True,
        "data": result,
        "evaluated_count": evaluated_count,
        "skipped_count": skipped_count,
        "skipped_already_scored_count": skipped_already_scored_count,
        "skipped_unverified_count": skipped_unverified_count,
        "skipped_correction_count": skipped_correction_count,
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


def _khs_result_metadata(candidate: Candidate, db: Session) -> dict:
    """Return safe KHS metadata for recruiter result views.

    Raw KHS text is intentionally not exposed here. Recruiters can still use
    existing document preview/download endpoints for original files.
    """
    khs_doc = (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id == candidate.id,
            CandidateDocument.document_type == DocumentType.KHS.value,
        )
        .order_by(CandidateDocument.created_at.desc())
        .first()
    )
    if not khs_doc:
        return {
            "khs_summary": None,
            "khs_used_in_ai_scoring": False,
            "khs_source": "missing",
            "khs_warning": "No cached KHS found",
        }

    parsed = parsed_khs_from_cache(khs_doc.sections_json)
    scoring = khs_cache_scoring_metadata(khs_doc.sections_json)
    if not parsed:
        return {
            "khs_summary": None,
            "khs_used_in_ai_scoring": bool(scoring.get("khs_used_in_ai_scoring", False)),
            "khs_source": scoring.get("khs_source") or "missing",
            "khs_warning": scoring.get("khs_warning") or "KHS cache is empty",
        }

    warning = (
        scoring.get("khs_warning")
        or parsed.get("parse_error")
        or parsed.get("parse_warning")
    )
    summary = None
    if not parsed.get("parse_error"):
        summary = {
            "ipk_final": parsed.get("ipk_final", parsed.get("ipk")),
            "total_sks_final": parsed.get("total_sks_final", parsed.get("total_sks")),
            "ips_history": parsed.get("ips_history") or [],
            "courses": parsed.get("courses") or [],
            "ongoing_courses": parsed.get("ongoing_courses") or [],
            "parse_warning": parsed.get("parse_warning"),
            "parser_version": parsed.get("parser_version"),
        }

    return {
        "khs_summary": summary,
        "khs_used_in_ai_scoring": bool(scoring.get("khs_used_in_ai_scoring", False)),
        "khs_source": scoring.get("khs_source")
        or (khs_processing_status(parsed) if parsed.get("parse_error") else "cache"),
        "khs_warning": warning,
    }


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
    khs_metadata = _khs_result_metadata(candidate, db)

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
            "khs_summary": khs_metadata["khs_summary"],
            "khs_used_in_ai_scoring": khs_metadata["khs_used_in_ai_scoring"],
            "khs_source": khs_metadata["khs_source"],
            "khs_warning": khs_metadata["khs_warning"],
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
