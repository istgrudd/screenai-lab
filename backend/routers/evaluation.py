"""Evaluation router — batch processing trigger.

Endpoints:
    POST /api/evaluate          — Trigger batch evaluation for a rubric
    GET  /api/evaluate/status   — Check latest evaluation status
"""

import asyncio
import traceback

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import require_role
from backend.models.candidate import Candidate, CandidateDocument
from backend.models.rubric import Rubric
from backend.models.user import UserRole
from backend.services.rag_pipeline import evaluate_candidate
from backend.services.scoring import cefr_from_score, store_evaluation_results

router = APIRouter(prefix="/api", tags=["evaluation"])


class EvaluateRequest(BaseModel):
    rubric_id: int


@router.post(
    "/evaluate",
    dependencies=[Depends(require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN))],
)
async def run_batch_evaluation(
    payload: EvaluateRequest,
    db: Session = Depends(get_db),
):
    """Evaluate all candidates with anonymized text against a rubric.

    Processes candidates sequentially (MVP — no async worker queue).
    Only processes candidates with status 'anonymized' (not yet scored)
    or re-evaluates candidates already scored with a different rubric.
    """
    # --- Validate rubric ---
    rubric = db.query(Rubric).filter(Rubric.id == payload.rubric_id).first()
    if not rubric:
        raise HTTPException(
            status_code=404,
            detail=f"Rubric {payload.rubric_id} not found",
        )

    # --- Find candidates with status 'anonymized' for this rubric ---
    candidates = (
        db.query(Candidate)
        .filter(
            Candidate.rubric_id == payload.rubric_id,
            Candidate.status == "anonymized",
        )
        .all()
    )

    if not candidates:
        return {
            "success": True,
            "data": {
                "message": "No candidates ready for evaluation",
                "evaluated_count": 0,
                "results": [],
            },
            "error": None,
        }

    results = []
    errors = []

    for candidate in candidates:
        # Get the candidate's CV document with anonymized text
        document = (
            db.query(CandidateDocument)
            .filter(
                CandidateDocument.candidate_id == candidate.id,
                CandidateDocument.document_type == "cv",
                CandidateDocument.anonymized_text.isnot(None),
            )
            .first()
        )

        if not document:
            errors.append({
                "candidate_id": candidate.id,
                "anonymous_id": candidate.anonymous_id,
                "error": "No anonymized CV document found",
            })
            continue

        try:
            print(f"[EVAL] Evaluating candidate {candidate.anonymous_id}...")

            # Build the anonymized_cv dict
            anonymized_cv = {
                "anonymized_text": document.anonymized_text,
            }

            # Certificates are intentionally NOT passed to the RAG pipeline.
            # They bypass anonymization and only contribute a CEFR bonus
            # applied downstream by store_evaluation_results.
            evaluation = await evaluate_candidate(
                anonymized_cv=anonymized_cv,
                rubric_id=payload.rubric_id,
                db=db,
                certificate_data=None,
            )

            # Store results
            store_evaluation_results(
                candidate_id=candidate.id,
                rubric_id=payload.rubric_id,
                evaluation=evaluation,
                db=db,
            )

            cefr_level, _ = cefr_from_score(candidate.language_score)
            results.append({
                "candidate_id": candidate.id,
                "anonymous_id": candidate.anonymous_id,
                "composite_score": candidate.composite_score,
                "weighted_score": evaluation["composite_score"],
                "language_score": candidate.language_score,
                "language_bonus": candidate.language_bonus,
                "cefr_level": cefr_level,
                "dimension_scores": [
                    {
                        "dimension": ds["dimension"],
                        "score": ds["score"],
                        "weighted_score": ds["weighted_score"],
                    }
                    for ds in evaluation["dimension_scores"]
                ],
                "status": "scored",
            })

            print(
                f"[EVAL] {candidate.anonymous_id}: weighted={evaluation['composite_score']} "
                f"+ lang_bonus={candidate.language_bonus or 0} = {candidate.composite_score}"
            )

        except Exception as e:
            traceback.print_exc()
            errors.append({
                "candidate_id": candidate.id,
                "anonymous_id": candidate.anonymous_id,
                "error": str(e),
            })

    db.commit()

    return {
        "success": True,
        "data": {
            "rubric_id": payload.rubric_id,
            "rubric_name": rubric.name,
            "evaluated_count": len(results),
            "error_count": len(errors),
            "results": results,
            "errors": errors,
        },
        "error": None,
    }
