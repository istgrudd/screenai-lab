"""Submit-time NER anonymization — Task 10.1.

Background task that runs NER anonymization on CV and Motivation Letter
immediately after a candidate submits their application.  Results are
cached in ``candidate_documents`` so the evaluation pipeline can skip
the NER step later (Task 10.3).

Called via FastAPI BackgroundTasks — must never raise.
"""

from __future__ import annotations

import logging
import os
import traceback
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session, sessionmaker

from backend.models.application import Application, ApplicationStatus
from backend.models.candidate import Candidate, CandidateDocument
from backend.models.document import Document, DocumentType
from backend.services.extractor import extract_text_from_pdf
from backend.services.normalizer import normalize_and_segment
from backend.services.anonymizer import anonymize_text

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _generate_anon_id() -> str:
    return f"CAND-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Public entry point (called by BackgroundTasks)
# ---------------------------------------------------------------------------

def run_submit_anonymization(
    application_id: int, session_factory: sessionmaker
) -> None:
    """Run NER anonymization on CV + Motivation Letter for a submitted application.

    Called as a FastAPI BackgroundTask after submit_application commits.
    Creates/updates Candidate (rubric_id=None) and CandidateDocument records
    with anonymized text for later use by the evaluation pipeline.

    On any exception: logs the error but does NOT raise — background tasks
    must never crash the server.

    Args:
        application_id: The Application.id to process.
        session_factory: SessionLocal — the task opens and closes its own
            session so the request-scoped session never leaks into the
            background context.
    """
    db = session_factory()
    try:
        _run_anonymization(application_id, db)
    except Exception:
        logger.error(
            "Submit-time NER failed for application %d:\n%s",
            application_id,
            traceback.format_exc(),
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Internal implementation
# ---------------------------------------------------------------------------

def _run_anonymization(application_id: int, db: Session) -> None:
    """Internal implementation — separated for cleaner error handling."""

    # 1. Load application
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        logger.warning("Application %d not found for submit-time NER", application_id)
        return

    if app.status != ApplicationStatus.VERIFIED:
        app_status = app.status.value if hasattr(app.status, "value") else str(app.status)
        logger.warning(
            "Skipping NER for application %d because status is %s",
            application_id,
            app_status,
        )
        return

    # 2. Create or update Candidate record (rubric_id=None at this stage)
    candidate = _ensure_candidate_for_submit(app, db)

    # 3. Process documents:
    #      CV + Motivation Letter → full pipeline (extract + normalize + NER)
    #      SWOT                   → raw-text extraction only (Perf 3 cache —
    #                               GET /swot-text reads from DB instead of
    #                               re-opening the PDF on every request)
    doc_types = [DocumentType.CV, DocumentType.MOTIVATION_LETTER]
    processed = 0

    for doc_type in doc_types:
        doc = (
            db.query(Document)
            .filter(
                Document.application_id == application_id,
                Document.doc_type == doc_type,
            )
            .first()
        )
        if not doc:
            logger.info(
                "No %s document found for application %d, skipping",
                doc_type.value, application_id,
            )
            continue

        if not os.path.exists(doc.file_path):
            logger.warning(
                "File not found for %s document (app %d): %s",
                doc_type.value, application_id, doc.file_path,
            )
            continue

        # a. Extract text via PyMuPDF
        extraction = extract_text_from_pdf(doc.file_path)
        raw_text = extraction.get("raw_text", "")

        if not raw_text.strip():
            logger.warning(
                "Empty text extracted from %s (app %d), skipping NER",
                doc_type.value, application_id,
            )
            continue

        # b. Normalize text
        normalised = normalize_and_segment(raw_text)

        # c. Anonymize via IndoBERT NER
        anonymised = anonymize_text(normalised["normalized_text"])

        # d. Store result in CandidateDocument
        _store_candidate_document(
            candidate=candidate,
            portal_doc=doc,
            doc_type_str=doc_type.value,
            raw_text=raw_text,
            normalised=normalised,
            anonymised=anonymised,
            db=db,
        )
        processed += 1

    # 4. SWOT — extract raw text only, no NER. Failures are non-fatal so a
    #    SWOT that fails to parse doesn't poison the rest of submit-time work.
    swot_processed = _store_swot_text(application_id, candidate, db)
    if swot_processed:
        processed += 1

    db.commit()

    # 5. Log completion
    logger.info(
        "NER completed for application %d: %d documents processed",
        application_id, processed,
    )


def _store_swot_text(
    application_id: int, candidate: Candidate, db: Session
) -> bool:
    """Extract SWOT raw text at submit time so the GET endpoint can serve from DB.

    Returns True if a SWOT CandidateDocument row was written.
    """
    swot_doc = (
        db.query(Document)
        .filter(
            Document.application_id == application_id,
            Document.doc_type == DocumentType.SWOT,
        )
        .first()
    )
    if not swot_doc:
        return False
    if not os.path.exists(swot_doc.file_path):
        logger.warning(
            "SWOT file missing for app %d: %s",
            application_id,
            swot_doc.file_path,
        )
        return False

    try:
        extraction = extract_text_from_pdf(swot_doc.file_path)
    except Exception:
        logger.warning(
            "SWOT extraction failed for app %d", application_id,
        )
        return False

    raw_text = (extraction.get("raw_text") or "").strip()
    page_count = (extraction.get("metadata") or {}).get("page_count")

    existing = (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id == candidate.id,
            CandidateDocument.document_type == DocumentType.SWOT.value,
        )
        .first()
    )
    if existing:
        existing.raw_text = raw_text
        existing.filename = swot_doc.file_name
        existing.file_path = swot_doc.file_path
        existing.page_count = page_count
        db.flush()
        return True

    cand_doc = CandidateDocument(
        candidate_id=candidate.id,
        filename=swot_doc.file_name,
        file_path=swot_doc.file_path,
        document_type=DocumentType.SWOT.value,
        raw_text=raw_text,
        page_count=page_count,
    )
    db.add(cand_doc)
    db.flush()
    return True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_candidate_for_submit(app: Application, db: Session) -> Candidate:
    """Find or create a Candidate record for submit-time NER (rubric_id=None)."""
    existing = (
        db.query(Candidate)
        .filter(Candidate.user_id == app.user_id)
        .first()
    )
    if existing:
        existing.status = "anonymized"
        db.flush()
        return existing

    candidate = Candidate(
        anonymous_id=_generate_anon_id(),
        user_id=app.user_id,
        rubric_id=None,
        status="anonymized",
    )
    db.add(candidate)
    db.flush()
    return candidate


def _store_candidate_document(
    candidate: Candidate,
    portal_doc: Document,
    doc_type_str: str,
    raw_text: str,
    normalised: dict,
    anonymised: dict,
    db: Session,
) -> CandidateDocument:
    """Create or update a CandidateDocument with anonymized text."""
    existing = (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id == candidate.id,
            CandidateDocument.document_type == doc_type_str,
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
        filename=portal_doc.file_name,
        file_path=portal_doc.file_path,
        document_type=doc_type_str,
        raw_text=raw_text,
        normalized_text=normalised.get("normalized_text", ""),
        sections_json=normalised.get("sections"),
        anonymized_text=anonymised.get("anonymized_text", ""),
        entities_json=anonymised.get("entities_found", []),
    )
    db.add(cand_doc)
    db.flush()
    return cand_doc
