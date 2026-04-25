"""Full evaluation pipeline service — Task 8.1.

Orchestrates per-candidate evaluation:
    KTM validate → KHS parse → NER anonymize →
    RAG retrieve (using division rubric) → LLM infer → store results

Bridges the Phase-1 Portal models (Application / Document) with the
Capstone pipeline models (Candidate / CandidateDocument).
"""

from __future__ import annotations

import logging
import os
import traceback
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.application import Application, ApplicationStatus, Division
from backend.models.candidate import Candidate, CandidateDocument
from backend.models.document import Document, DocumentType
from backend.models.rubric import Rubric
from backend.models.user import User
from backend.services.extractor import extract_text_from_pdf
from backend.services.khs_parser import KhsResult, format_khs_summary, parse_khs
from backend.services.ktm_validator import validate_ktm
from backend.services.normalizer import normalize_and_segment
from backend.services.anonymizer import anonymize_text
from backend.services.rag_pipeline import evaluate_candidate
from backend.services.scoring import store_evaluation_results

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _generate_anon_id() -> str:
    return f"CAND-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def run_evaluation_pipeline(
    division: str,
    application_ids: list[int] | None,
    db: Session,
) -> dict:
    """Run the full evaluation pipeline for applications in a division.

    Args:
        division: Division value string (e.g. "big_data").
        application_ids: Specific application IDs to evaluate, or None for all
            submitted applications in the division.
        db: Database session.

    Returns:
        { queued: int, results: [...], errors: [...] }
    """
    # --- 1. Find the rubric for the division ---
    rubric = (
        db.query(Rubric)
        .filter(Rubric.division == division)
        .first()
    )
    if not rubric:
        raise ValueError(f"No rubric found for division '{division}'")

    # --- 1b. Flag 4 guard: empty-dimension rubric ---
    if not rubric.dimensions:
        raise ValueError(
            f"Rubric for {division} has no dimensions configured. "
            f"Please set up the rubric first."
        )

    # --- 2. Find target applications ---
    # Application.division is stored as the enum name ("BIG_DATA") via
    # SQLAlchemy's Enum(..., native_enum=False); rubric.division uses the
    # enum value ("big_data"). Coerce the incoming value-string to the
    # Division enum so the WHERE clause emits the stored name correctly.
    try:
        division_enum = Division(division)
    except ValueError:
        raise ValueError(f"Invalid division '{division}'")

    q = db.query(Application).filter(
        Application.division == division_enum,
        Application.status.in_([
            ApplicationStatus.SUBMITTED,
            ApplicationStatus.SCREENING,
        ]),
    )
    if application_ids:
        q = q.filter(Application.id.in_(application_ids))

    applications = q.all()

    if not applications:
        return {"queued": 0, "results": [], "errors": []}

    results = []
    errors = []

    for app in applications:
        try:
            result = await _evaluate_one(app, rubric, db)
            results.append(result)

            # Update application status to screening
            app.status = ApplicationStatus.SCREENING
            db.flush()

        except Exception as exc:
            traceback.print_exc()
            errors.append({
                "application_id": app.id,
                "error": str(exc),
            })

    db.commit()

    return {
        "queued": len(applications),
        "results": results,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Per-candidate pipeline
# ---------------------------------------------------------------------------

async def _evaluate_one(
    app: Application,
    rubric: Rubric,
    db: Session,
) -> dict:
    """Run the full pipeline for one application."""
    user = db.query(User).filter(User.id == app.user_id).first()

    result: dict = {
        "application_id": app.id,
        "division": app.division.value if hasattr(app.division, "value") else str(app.division),
    }

    # --- KTM validation ---
    ktm_result = _run_ktm(app, user, db)
    result["ktm_valid"] = ktm_result.get("valid", False)
    result["ktm_warning"] = ktm_result.get("warning") or ktm_result.get("error")

    # --- KHS parsing ---
    khs_result = _run_khs(app, db)
    if "parse_error" in khs_result:
        result["khs_summary"] = None
        result["khs_warning"] = khs_result["parse_error"]
    else:
        result["khs_summary"] = {
            "ipk": khs_result.get("ipk"),
            "total_sks": khs_result.get("total_sks"),
            "relevant_courses": khs_result.get("relevant_courses", []),
        }
        result["khs_warning"] = None

    # --- Task 10.3/10.4: Ensure Candidate exists (moved up for cache check) ---
    candidate = _ensure_candidate(app, rubric, user, db)

    # --- Task 10.3: Check NER cache from submit-time anonymization ---
    cached_cv = (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id == candidate.id,
            CandidateDocument.document_type == "cv",
            CandidateDocument.anonymized_text != None,  # noqa: E711
        )
        .first()
    )

    if cached_cv and cached_cv.anonymized_text:
        # Cache hit — use pre-computed anonymized text
        logger.info(
            "NER cache hit for application %d, skipping anonymization", app.id
        )
        full_text = cached_cv.anonymized_text

        # Also check for cached motivation letter
        cached_ml = (
            db.query(CandidateDocument)
            .filter(
                CandidateDocument.candidate_id == candidate.id,
                CandidateDocument.document_type == "motivation_letter",
                CandidateDocument.anonymized_text != None,  # noqa: E711
            )
            .first()
        )
        ml_anon_text = cached_ml.anonymized_text if cached_ml else ""

        # We still need raw_text for _ensure_candidate_document bookkeeping
        cv_doc = _get_doc(app.id, DocumentType.CV, db)
        raw_text = cached_cv.raw_text or ""
        normalised = {"normalized_text": cached_cv.normalized_text or ""}
        anonymised = {
            "anonymized_text": cached_cv.anonymized_text,
            "entities_found": cached_cv.entities_json or [],
        }
    else:
        # Cache miss — run inline NER as fallback
        logger.info(
            "NER cache miss for application %d, running inline anonymization",
            app.id,
        )

        cv_doc = _get_doc(app.id, DocumentType.CV, db)
        if not cv_doc:
            raise ValueError(f"No CV document found for application {app.id}")

        extraction = extract_text_from_pdf(cv_doc.file_path)
        raw_text = extraction.get("raw_text", "")
        normalised = normalize_and_segment(raw_text)
        anonymised = anonymize_text(normalised["normalized_text"])
        full_text = anonymised.get("anonymized_text", "")

        # Also anonymize motivation letter if present
        ml_doc = _get_doc(app.id, DocumentType.MOTIVATION_LETTER, db)
        ml_anon_text = ""
        if ml_doc and os.path.exists(ml_doc.file_path):
            try:
                ml_extraction = extract_text_from_pdf(ml_doc.file_path)
                ml_norm = normalize_and_segment(ml_extraction.get("raw_text", ""))
                ml_anonymised = anonymize_text(ml_norm["normalized_text"])
                ml_anon_text = ml_anonymised.get("anonymized_text", "")
            except Exception:
                pass  # graceful fallback — ML is bonus context

    # --- Build full anonymized text with ML + KHS blocks ---
    if ml_anon_text:
        full_text += (
            "\n\n=== SURAT MOTIVASI ===\n"
            f"{ml_anon_text}\n"
            "=====================\n"
        )

    # Task 8.2: Prepend KHS data if successfully parsed
    if result["khs_summary"] is not None:
        khs_block = format_khs_summary(khs_result)
        full_text = (
            "=== DATA AKADEMIK ===\n"
            f"{khs_block}\n"
            "Gunakan data IPK dan mata kuliah sebagai sinyal "
            "kompetensi teknis kandidat.\n"
            "=====================\n\n"
            + full_text
        )

    # --- Bridge: update CandidateDocument ---
    cand_doc = _ensure_candidate_document(candidate, cv_doc, raw_text, normalised, anonymised, db)

    # --- RAG evaluation ---
    evaluation = await evaluate_candidate(
        anonymized_cv={"anonymized_text": full_text},
        rubric_id=rubric.id,
        db=db,
        certificate_data=None,
    )

    # --- Store results ---
    store_evaluation_results(
        candidate_id=candidate.id,
        rubric_id=rubric.id,
        evaluation=evaluation,
        db=db,
    )

    # --- SWOT text extraction (highlight only, not scored) ---
    swot_text = _extract_swot(app, db)
    result["swot_text"] = swot_text

    # --- Populate result ---
    result["candidate_id"] = candidate.id
    result["anonymous_id"] = candidate.anonymous_id
    result["composite_score"] = candidate.composite_score
    result["profile_summary"] = evaluation.get("profile_summary", "")
    result["dimension_scores"] = [
        {
            "dimension": ds["dimension"],
            "score": ds["score"],
            "weight": ds["weight"],
            "weighted_score": ds["weighted_score"],
            "justification": ds.get("justification", ""),
        }
        for ds in evaluation.get("dimension_scores", [])
    ]

    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_doc(application_id: int, doc_type: DocumentType, db: Session) -> Document | None:
    return (
        db.query(Document)
        .filter(
            Document.application_id == application_id,
            Document.doc_type == doc_type,
        )
        .first()
    )


def _run_ktm(app: Application, user: User | None, db: Session) -> dict:
    """Validate KTM — returns ktm_validator output or synthetic error."""
    ktm_doc = _get_doc(app.id, DocumentType.KTM, db)
    if not ktm_doc:
        return {"valid": False, "error": "No KTM document uploaded"}

    expected_nim = user.nim if user else None
    return validate_ktm(ktm_doc.file_path, expected_nim=expected_nim)


def _run_khs(app: Application, db: Session) -> KhsResult:
    """Parse KHS — returns khs_parser output."""
    khs_doc = _get_doc(app.id, DocumentType.KHS, db)
    if not khs_doc:
        return {"ipk": None, "total_sks": None, "relevant_courses": [], "parse_error": "No KHS document uploaded"}

    return parse_khs(khs_doc.file_path)


def _extract_swot(app: Application, db: Session) -> str | None:
    """Extract SWOT text — best effort."""
    swot_doc = _get_doc(app.id, DocumentType.SWOT, db)
    if not swot_doc or not os.path.exists(swot_doc.file_path):
        return None
    try:
        result = extract_text_from_pdf(swot_doc.file_path)
        return (result.get("raw_text") or "").strip() or None
    except Exception:
        return None


def _ensure_candidate(
    app: Application,
    rubric: Rubric | None,
    user: User | None,
    db: Session,
) -> Candidate:
    """Find or create a Candidate pipeline record linked to this application.

    Task 10.4: rubric is optional.  At submit-time the Candidate is created
    with rubric_id=None; the rubric_id is set when evaluation actually runs.
    """
    existing = (
        db.query(Candidate)
        .filter(Candidate.user_id == app.user_id)
        .first()
    )
    if existing:
        if rubric is not None:
            existing.rubric_id = rubric.id
        existing.status = "anonymized"
        db.flush()
        return existing

    candidate = Candidate(
        anonymous_id=_generate_anon_id(),
        user_id=app.user_id,
        rubric_id=rubric.id if rubric else None,
        status="anonymized",
    )
    db.add(candidate)
    db.flush()
    return candidate


def _ensure_candidate_document(
    candidate: Candidate,
    cv_doc: Document,
    raw_text: str,
    normalised: dict,
    anonymised: dict,
    db: Session,
) -> CandidateDocument:
    """Find or create a CandidateDocument for the CV."""
    existing = (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id == candidate.id,
            CandidateDocument.document_type == "cv",
        )
        .first()
    )

    if existing:
        existing.raw_text = raw_text
        existing.normalized_text = normalised.get("normalized_text", "")
        existing.sections_json = normalised.get("sections")
        existing.anonymized_text = anonymised.get("anonymized_text", "")
        existing.entities_json = anonymised.get("entities_found", [])
        db.flush()
        return existing

    cand_doc = CandidateDocument(
        candidate_id=candidate.id,
        filename=cv_doc.file_name,
        file_path=cv_doc.file_path,
        document_type="cv",
        raw_text=raw_text,
        normalized_text=normalised.get("normalized_text", ""),
        sections_json=normalised.get("sections"),
        anonymized_text=anonymised.get("anonymized_text", ""),
        entities_json=anonymised.get("entities_found", []),
    )
    db.add(cand_doc)
    db.flush()
    return cand_doc
