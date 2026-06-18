"""Evaluation batch router — Task 8.1.

Endpoints:
    POST /api/recruiter/evaluate/batch  — Run full evaluation pipeline per division
    GET  /api/recruiter/results/{application_id} — Get evaluation result for one app
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database import SessionLocal, get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.application import Application, Division
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import DocumentType
from backend.models.evaluation_job import (
    EvaluationJob,
    EvaluationJobStatus,
    NON_TERMINAL_JOB_STATUSES,
)
from backend.models.period import RecruitmentPeriod
from backend.models.rubric import Rubric
from backend.models.user import User, UserRole
from backend.services.evaluation_service import (
    run_evaluation_job,
    select_evaluation_targets,
)
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

# Phase 2: duplicate-trigger protection is enforced at the database level by
# the partial unique index on evaluation_jobs (one non-terminal job per
# division — see the evaluation_jobs migration). A duplicate insert raises
# IntegrityError, which we map to 409 below. The DB constraint is the source
# of truth (no TOCTOU race), superseding the Phase 1 in-process set.
_ALREADY_RUNNING_ERROR = (
    "Evaluation for this division is already running. "
    "Please wait until it finishes."
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
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(_recruiter_or_admin)],
)
async def evaluate_batch(
    payload: EvaluateBatchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an evaluation job for a division and run it in the background.

    Phase 2 contract change (200 + full result → **202 + job_id**): this
    endpoint no longer runs the pipeline inline. It validates the rubric,
    resolves the eligible application set + skip counters synchronously
    (DB-only, no LLM), inserts an ``evaluation_jobs`` row, schedules the
    pipeline as a FastAPI BackgroundTask, and returns **202 Accepted**.
    Progress is polled via ``GET /evaluate/jobs/{id}`` or
    ``GET /evaluate/jobs/active?division=``.

    Body: { division: str, application_ids: [int] | null, force: bool }

    If application_ids is null, evaluates all eligible applications in the
    division. By default (force=False) candidates whose Candidate row already
    carries a composite_score are skipped. With force=True the score filter is
    bypassed; the verified/screening eligibility filter still applies.

    Precondition: the division's rubric must have at least one dimension
    (else 400). Uniqueness: a partial unique index allows at most one
    non-terminal job per division — a duplicate trigger raises IntegrityError,
    mapped to **409**.

    Task 13.2.2 — Soft phase warning: when no active period exists or the
    active period is not in the EVALUATION phase, the job still runs (the
    recruiter retains override) but the response carries a ``warning`` field.
    """
    division_value = payload.division.value

    # 1. Validate + resolve the eligible set synchronously (DB-only, no LLM).
    try:
        targets = select_evaluation_targets(
            division=division_value,
            application_ids=payload.application_ids,
            db=db,
            force=payload.force,
        )
    except ValueError as exc:
        msg = str(exc)
        # Known ValueError shapes map to clean 4xx codes with their original
        # message — deterministic, recruiter-actionable errors.
        if "no dimensions configured" in msg.lower():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
        if "no rubric found" in msg.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
        if "rubric weights must sum" in msg.lower():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
        # Unrecognized — log full detail server-side, return a sanitized 500.
        logger.error(
            "Unrecognized ValueError in evaluate_batch: %s", msg, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_SANITIZED_ERROR,
        )

    # 2. Resolve the soft phase warning + active period_id (nullable).
    warning = _phase_warning(db)
    active_period = (
        db.query(RecruitmentPeriod)
        .filter(RecruitmentPeriod.is_active == True)  # noqa: E712
        .first()
    )
    period_id = active_period.id if active_period else None

    # 3. Insert the job row. The partial unique index ("one non-terminal job
    #    per division") is the source of truth — a duplicate insert raises
    #    IntegrityError, which we map to 409. No app-level "is there an active
    #    job?" pre-check is used as the primary guard (TOCTOU race).
    job = EvaluationJob(
        division=payload.division,
        period_id=period_id,
        status=EvaluationJobStatus.QUEUED,
        force=payload.force,
        total=targets["total"],
        triggered_by=current_user.id,
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.warning(
            "Evaluation job conflict: division=%s already has a non-terminal "
            "job; rejecting duplicate trigger with 409",
            division_value,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_ALREADY_RUNNING_ERROR,
        )
    job_id = job.id

    # 4. Schedule the background runner. It opens its own sessions from
    #    SessionLocal (mirroring run_submit_anonymization) — only plain IDs
    #    cross the boundary, never ORM instances bound to the request session.
    background_tasks.add_task(
        run_evaluation_job,
        job_id,
        division_value,
        targets["application_ids"],
        targets["rubric_id"],
        SessionLocal,
    )

    logger.info(
        "Evaluation job %d queued: division=%s force=%s total=%d "
        "(skipped_already_scored=%d, skipped_unverified=%d, skipped_correction=%d)",
        job_id,
        division_value,
        payload.force,
        targets["total"],
        targets["skipped_already_scored_count"],
        targets["skipped_unverified_count"],
        targets["skipped_correction_count"],
    )

    # 5. Respond 202 with the job id + skip breakdown. The envelope-level
    #    counters mirror the historical shape; `evaluated_count` is the number
    #    of eligible candidates queued (resolved at trigger time).
    return {
        "success": True,
        "data": {
            "job_id": job_id,
            "status": EvaluationJobStatus.QUEUED.value,
            "total": targets["total"],
        },
        "job_id": job_id,
        "status": EvaluationJobStatus.QUEUED.value,
        "total": targets["total"],
        "evaluated_count": targets["total"],
        "skipped_count": targets["skipped"],
        "skipped_already_scored_count": targets["skipped_already_scored_count"],
        "skipped_unverified_count": targets["skipped_unverified_count"],
        "skipped_correction_count": targets["skipped_correction_count"],
        "warning": warning,
        "error": None,
    }


def _serialize_job(job: EvaluationJob) -> dict:
    """Public job state for the polling endpoints."""
    return {
        "id": job.id,
        "division": job.division.value if hasattr(job.division, "value") else job.division,
        "status": job.status.value if hasattr(job.status, "value") else job.status,
        "total": job.total,
        "processed": job.processed,
        "succeeded": job.succeeded,
        "failed": job.failed,
        "errors": job.errors or [],
        "force": job.force,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "note": job.note,
    }


@router.get(
    "/evaluate/jobs/active",
    dependencies=[Depends(_recruiter_or_admin)],
)
def get_active_evaluation_job(
    division: Division,
    db: Session = Depends(get_db),
):
    """Return the active (non-terminal) job for a division, or null.

    ``GET /api/recruiter/evaluate/jobs/active?division=big_data``. The empty
    contract is an explicit ``{ data: null }`` with HTTP 200 — the frontend
    uses this on mount to resume polling after a refresh. Declared before the
    ``/{job_id}`` route so "active" is never parsed as an id.
    """
    job = (
        db.query(EvaluationJob)
        .filter(
            EvaluationJob.division == division,
            EvaluationJob.status.in_(list(NON_TERMINAL_JOB_STATUSES)),
        )
        .order_by(EvaluationJob.created_at.desc())
        .first()
    )
    return {
        "success": True,
        "data": _serialize_job(job) if job else None,
        "error": None,
    }


@router.get(
    "/evaluate/jobs/{job_id}",
    dependencies=[Depends(_recruiter_or_admin)],
)
def get_evaluation_job(
    job_id: int,
    db: Session = Depends(get_db),
):
    """Return a single evaluation job's state. 404 if not found."""
    job = db.query(EvaluationJob).filter(EvaluationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Evaluation job not found")
    return {
        "success": True,
        "data": _serialize_job(job),
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
