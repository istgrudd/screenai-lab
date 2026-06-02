"""Candidates router — list, detail, and score override.

Endpoints:
    GET  /api/candidates                      — List all candidates with scores
    GET  /api/candidates/{id}                  — Candidate detail with scores + justifications
    PUT  /api/candidates/{id}/scores/{dim_id}  — Override a dimension score
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.application import Application
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.rubric import Dimension, Rubric
from backend.models.user import User, UserRole
from backend.services.scoring import cefr_from_score, validate_rubric_weights

_recruiter_or_admin = require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN)
_candidate_only = require_role(UserRole.CANDIDATE)

router = APIRouter(prefix="/api/candidates", tags=["candidates"])

# Separate router for the candidate-owned view (GET /api/my-applications).
my_applications_router = APIRouter(
    prefix="/api/my-applications", tags=["my-applications"]
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ScoreOverride(BaseModel):
    score: float
    reason: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", dependencies=[Depends(_recruiter_or_admin)])
def list_candidates(
    rubric_id: int | None = Query(None, description="Filter by rubric ID"),
    db: Session = Depends(get_db),
):
    """List all candidates with their composite scores.

    Optionally filter by rubric_id to show candidates who applied to that rubric
    (both anonymized and scored). Returns candidates sorted by composite_score
    descending (ranked).
    """
    query = db.query(Candidate)

    if rubric_id is not None:
        # Show all candidates who applied to this rubric
        query = query.filter(Candidate.rubric_id == rubric_id)

    candidates = query.order_by(Candidate.composite_score.desc().nullslast()).all()

    results = []
    for rank, cand in enumerate(candidates, start=1):
        # Get document info
        doc = (
            db.query(CandidateDocument)
            .filter(CandidateDocument.candidate_id == cand.id, CandidateDocument.document_type == "cv")
            .first()
        )

        # Get dimension scores if rubric_id specified
        dim_scores = []
        if rubric_id is not None:
            scores = (
                db.query(DimensionScore)
                .filter(
                    DimensionScore.candidate_id == cand.id,
                    DimensionScore.rubric_id == rubric_id,
                )
                .all()
            )
            for s in scores:
                dim = db.query(Dimension).filter(Dimension.id == s.dimension_id).first()
                dim_scores.append({
                    "dimension_id": s.dimension_id,
                    "dimension_name": dim.name if dim else "Unknown",
                    "score": s.score,
                    "weighted_score": s.weighted_score,
                    "is_override": s.is_override,
                })

        cefr_level, _ = cefr_from_score(cand.language_score)
        results.append({
            "rank": rank if cand.composite_score is not None else None,
            "candidate_id": cand.id,
            "anonymous_id": cand.anonymous_id,
            "status": cand.status,
            "composite_score": cand.composite_score,
            "language_score": cand.language_score,
            "language_bonus": cand.language_bonus,
            "cefr_level": cefr_level,
            "document": {
                "filename": doc.filename if doc else None,
                "document_type": doc.document_type if doc else None,
                "page_count": doc.page_count if doc else None,
            } if doc else None,
            "dimension_scores": dim_scores if dim_scores else None,
        })

    return {
        "success": True,
        "data": results,
        "error": None,
    }


@router.get("/{candidate_id}", dependencies=[Depends(_recruiter_or_admin)])
def get_candidate(candidate_id: int, db: Session = Depends(get_db)):
    """Get detailed candidate info: scores, justifications, profile summary."""
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail=f"Candidate {candidate_id} not found")

    # Get documents
    documents = (
        db.query(CandidateDocument)
        .filter(CandidateDocument.candidate_id == candidate_id)
        .all()
    )

    # Get all dimension scores
    scores = (
        db.query(DimensionScore)
        .filter(DimensionScore.candidate_id == candidate_id)
        .all()
    )

    dimension_scores = []
    for s in scores:
        dim = db.query(Dimension).filter(Dimension.id == s.dimension_id).first()
        dimension_scores.append({
            "id": s.id,
            "dimension_id": s.dimension_id,
            "dimension_name": dim.name if dim else "Unknown",
            "rubric_id": s.rubric_id,
            "score": s.score,
            "weight": dim.weight if dim else 0,
            "weighted_score": s.weighted_score,
            "justification": s.justification,
            "evidence": s.evidence_json,
            "is_override": s.is_override,
            "override_reason": s.override_reason,
        })

    # Cross-link to the candidate's Phase-1 Application (and its user row).
    # Lets the recruiter detail view show uploaded-document completeness and
    # the candidate profile without a second round-trip. Recruiters may view
    # this identity for verification/decision-making; it is the anonymized
    # document text — not these fields — that is withheld from AI evaluation.
    app = None
    user = None
    if candidate.user_id:
        user = db.query(User).filter(User.id == candidate.user_id).first()
        app = (
            db.query(Application)
            .filter(Application.user_id == candidate.user_id)
            .order_by(Application.created_at.desc())
            .first()
        )

    cefr_level, _ = cefr_from_score(candidate.language_score)
    cert_doc = next(
        (d for d in documents if d.document_type == "certificate"), None
    )
    language_certificate = None
    if cert_doc or candidate.language_score is not None:
        language_certificate = {
            "filename": cert_doc.filename if cert_doc else None,
            "certificate_type": "EPrT" if candidate.language_score is not None else None,
            "raw_score": candidate.language_score,
            "cefr_level": cefr_level,
            "bonus": candidate.language_bonus or 0.0,
        }

    return {
        "success": True,
        "data": {
            "candidate_id": candidate.id,
            "anonymous_id": candidate.anonymous_id,
            "user_id": candidate.user_id,
            "status": candidate.status,
            "composite_score": candidate.composite_score,
            "language_score": candidate.language_score,
            "language_bonus": candidate.language_bonus,
            "cefr_level": cefr_level,
            "language_certificate": language_certificate,
            "profile_summary": candidate.profile_summary,
            "created_at": candidate.created_at.isoformat() if candidate.created_at else None,
            "application": {
                "id": app.id,
                "division": app.division.value if hasattr(app.division, "value") else str(app.division),
                "status": app.status.value if hasattr(app.status, "value") else str(app.status),
                "submitted_at": app.submitted_at.isoformat() if app.submitted_at else None,
            } if app else None,
            "user_profile": {
                "full_name": user.full_name,
                "email": user.email,
                "whatsapp": user.whatsapp,
                "nim": user.nim,
                "faculty": user.faculty,
                "major": user.major,
                "year": user.year,
                "ipk": user.ipk,
            } if user else None,
            "documents": [
                {
                    "id": d.id,
                    "filename": d.filename,
                    "document_type": d.document_type,
                    "page_count": d.page_count,
                    "file_size_kb": d.file_size_kb,
                    "sections_detected": (
                        [k for k, v in d.sections_json.items() if v.strip()]
                        if d.sections_json else []
                    ),
                    "entities": d.entities_json or [],
                }
                for d in documents
            ],
            "dimension_scores": dimension_scores,
        },
        "error": None,
    }


@router.put(
    "/{candidate_id}/scores/{dim_score_id}",
    dependencies=[Depends(_recruiter_or_admin)],
)
def override_score(
    candidate_id: int,
    dim_score_id: int,
    payload: ScoreOverride,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Override a dimension score for a candidate."""
    score_record = (
        db.query(DimensionScore)
        .filter(
            DimensionScore.id == dim_score_id,
            DimensionScore.candidate_id == candidate_id,
        )
        .first()
    )

    if not score_record:
        raise HTTPException(
            status_code=404,
            detail=f"Score record {dim_score_id} not found for candidate {candidate_id}",
        )

    # Get dimension for weight
    dim = db.query(Dimension).filter(Dimension.id == score_record.dimension_id).first()
    weight = dim.weight if dim else 0

    # Composite-score sanity: the recompute below assumes the rubric's
    # dimension weights sum to 1.0. Validate against the rubric this score
    # belongs to before mutating anything so a malformed rubric surfaces
    # as a clean 400 instead of silently producing an off-scale composite.
    rubric = (
        db.query(Rubric).filter(Rubric.id == score_record.rubric_id).first()
    )
    if rubric is not None:
        try:
            validate_rubric_weights(rubric)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    # Store old score for reference
    old_score = score_record.score

    # Update score
    score_record.score = max(0.0, min(100.0, payload.score))
    score_record.weighted_score = score_record.score * weight
    score_record.is_override = True
    score_record.override_reason = payload.reason

    # Recompute candidate composite score
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    all_scores = (
        db.query(DimensionScore)
        .filter(
            DimensionScore.candidate_id == candidate_id,
            DimensionScore.rubric_id == score_record.rubric_id,
        )
        .all()
    )
    candidate.composite_score = round(
        sum(s.weighted_score for s in all_scores) + (candidate.language_bonus or 0.0),
        2,
    )

    # Task 14.3 — audit log every override. AuditLog.candidate_id is a FK to
    # users.id (the human), so we record the candidate's user_id, not the
    # Candidate-row id. Written inside the same transaction so an override
    # without a matching audit row is impossible.
    db.add(
        AuditLog(
            recruiter_id=current_user.id,
            candidate_id=candidate.user_id,
            action_type="score_override",
            old_value=str(old_score) if old_score is not None else None,
            new_value=str(score_record.score),
            reason=payload.reason,
        )
    )

    db.commit()

    return {
        "success": True,
        "data": {
            "candidate_id": candidate_id,
            "dimension_score_id": dim_score_id,
            "old_score": old_score,
            "new_score": score_record.score,
            "new_weighted_score": score_record.weighted_score,
            "new_composite_score": candidate.composite_score,
            "reason": payload.reason,
        },
        "error": None,
    }


# ---------------------------------------------------------------------------
# Candidate-owned view
# ---------------------------------------------------------------------------

@my_applications_router.get("", dependencies=[Depends(_candidate_only)])
def list_my_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the current candidate's own uploaded applications.

    Returns the candidate rows owned by `current_user`, each with the
    position they applied to and — once evaluated — the composite score.
    Composite/language/CEFR fields are null while status != 'scored'.
    """
    candidates = (
        db.query(Candidate)
        .filter(Candidate.user_id == current_user.id)
        .order_by(Candidate.created_at.desc())
        .all()
    )

    results = []
    for cand in candidates:
        cv_doc = (
            db.query(CandidateDocument)
            .filter(
                CandidateDocument.candidate_id == cand.id,
                CandidateDocument.document_type == "cv",
            )
            .first()
        )
        rubric = (
            db.query(Rubric).filter(Rubric.id == cand.rubric_id).first()
            if cand.rubric_id
            else None
        )

        is_scored = cand.status == "scored"
        cefr_level, _ = cefr_from_score(cand.language_score)

        results.append({
            "candidate_id": cand.id,
            "anonymous_id": cand.anonymous_id,
            "status": cand.status,
            "position": rubric.position if rubric else None,
            "rubric_name": rubric.name if rubric else None,
            "composite_score": cand.composite_score if is_scored else None,
            "language_score": cand.language_score if is_scored else None,
            "cefr_level": cefr_level if is_scored else None,
            "filename": cv_doc.filename if cv_doc else None,
            "created_at": cand.created_at.isoformat() if cand.created_at else None,
        })

    return {
        "success": True,
        "data": results,
        "error": None,
    }
