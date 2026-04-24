"""Screening bridge — converts submitted portal applications into AI pipeline candidates.

When a recruiter clicks "Run Evaluation", this service is called as a
pre-processing step.  It finds submitted applications whose division
matches the selected rubric, then for each one:

1. Extracts text from the candidate's CV and Motivation Letter PDFs.
2. Normalises and segments the text.
3. Anonymises the text (IndoBERT NER + regex) — **blind screening**.
4. Creates ``Candidate`` + ``CandidateDocument`` records so the existing
   RAG evaluation pipeline can pick them up.

The bridge is **idempotent**: if a ``Candidate`` already exists for a
given ``(user_id, rubric_id)`` pair, the application is skipped.
"""

from __future__ import annotations

import traceback
from typing import Sequence

from sqlalchemy.orm import Session

from backend.models.application import Application, ApplicationStatus, Division
from backend.models.candidate import Candidate, CandidateDocument
from backend.models.document import Document, DocumentType
from backend.models.rubric import Rubric
from backend.services.anonymizer import anonymize_text
from backend.services.extractor import extract_text_from_pdf
from backend.services.normalizer import normalize_and_segment


def _division_enum(value: str) -> Division | None:
    """Convert a raw division string to the Division enum, or None."""
    try:
        return Division(value)
    except (ValueError, KeyError):
        return None


def _process_document(
    doc: Document,
    candidate: Candidate,
    doc_type_label: str,
    db: Session,
) -> CandidateDocument | None:
    """Run the extract → normalise → anonymise pipeline on one document.

    Returns the newly-created ``CandidateDocument``, or ``None`` if
    processing failed (the error is printed but not raised so the
    batch can continue).
    """
    try:
        extraction = extract_text_from_pdf(doc.file_path)
    except (FileNotFoundError, ValueError) as exc:
        print(
            f"[BRIDGE] Skipping {doc_type_label} for candidate "
            f"{candidate.anonymous_id}: extraction failed — {exc}"
        )
        return None

    normalization = normalize_and_segment(extraction["raw_text"])
    anonymization = anonymize_text(normalization["normalized_text"])

    candidate_doc = CandidateDocument(
        candidate_id=candidate.id,
        filename=doc.file_name,
        file_path=doc.file_path,
        document_type=doc_type_label,
        raw_text=extraction["raw_text"],
        normalized_text=normalization["normalized_text"],
        sections_json=normalization["sections"],
        anonymized_text=anonymization["anonymized_text"],
        entities_json=anonymization["entities_found"],
        page_count=extraction["metadata"]["page_count"],
        file_size_kb=extraction["metadata"]["file_size_kb"],
    )
    db.add(candidate_doc)
    return candidate_doc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def prepare_candidates_for_evaluation(
    rubric_id: int,
    db: Session,
) -> list[int]:
    """Bridge submitted portal applications into AI pipeline candidates.

    Args:
        rubric_id: The rubric selected by the recruiter for evaluation.
        db: Active database session (caller manages the transaction).

    Returns:
        List of newly-created ``Candidate.id`` values.

    Raises:
        ValueError: If the rubric does not exist or has no division.
    """
    # ── 1. Validate rubric ──────────────────────────────────────────────
    rubric = db.query(Rubric).filter(Rubric.id == rubric_id).first()
    if not rubric:
        raise ValueError(f"Rubric {rubric_id} not found")

    if not rubric.division:
        raise ValueError(
            f"Rubric {rubric_id} ('{rubric.name}') has no division set. "
            "Assign a division to the rubric before running evaluation."
        )

    target_division = rubric.division  # e.g. "big_data"

    # ── 2. Find submitted applications in this division ─────────────────
    #    Only process applications that do NOT already have a corresponding
    #    Candidate record for this rubric (idempotency).
    already_bridged_user_ids = (
        db.query(Candidate.user_id)
        .filter(Candidate.rubric_id == rubric_id)
        .subquery()
    )

    applications: Sequence[Application] = (
        db.query(Application)
        .filter(
            Application.division == target_division,
            Application.status.in_([
                ApplicationStatus.SUBMITTED,
                ApplicationStatus.SCREENING,
            ]),
            ~Application.user_id.in_(already_bridged_user_ids),
        )
        .all()
    )

    if not applications:
        return []

    # ── 3. Process each application ─────────────────────────────────────
    created_ids: list[int] = []

    for app in applications:
        # Fetch the candidate's portal documents
        portal_docs = (
            db.query(Document)
            .filter(Document.application_id == app.id)
            .all()
        )
        doc_by_type: dict[str, Document] = {
            (d.doc_type.value if hasattr(d.doc_type, "value") else str(d.doc_type)): d
            for d in portal_docs
        }

        cv_doc = doc_by_type.get(DocumentType.CV.value)
        ml_doc = doc_by_type.get(DocumentType.MOTIVATION_LETTER.value)

        if not cv_doc:
            print(
                f"[BRIDGE] Skipping application {app.id} (user {app.user_id}): "
                "no CV document uploaded"
            )
            continue

        # ── Create Candidate record ────────────────────────────────────
        candidate = Candidate(
            user_id=app.user_id,
            rubric_id=rubric_id,
            status="anonymized",
        )
        db.add(candidate)
        db.flush()  # populate candidate.id + anonymous_id

        try:
            # ── Process CV (required) ──────────────────────────────────
            cv_result = _process_document(cv_doc, candidate, "cv", db)
            if not cv_result:
                # CV processing failed — remove the candidate stub
                db.delete(candidate)
                db.flush()
                continue

            # ── Process Motivation Letter (optional for bridge) ────────
            if ml_doc:
                _process_document(ml_doc, candidate, "motivation_letter", db)

            # ── Update application status ──────────────────────────────
            app.status = ApplicationStatus.SCREENING

            created_ids.append(candidate.id)
            print(
                f"[BRIDGE] Created candidate {candidate.anonymous_id} "
                f"(id={candidate.id}) from application {app.id} "
                f"[division={target_division}]"
            )

        except Exception:
            traceback.print_exc()
            print(
                f"[BRIDGE] Error processing application {app.id} — "
                "rolling back this candidate"
            )
            # Remove partially-created records for this candidate
            db.query(CandidateDocument).filter(
                CandidateDocument.candidate_id == candidate.id
            ).delete()
            db.delete(candidate)
            db.flush()

    if created_ids:
        db.flush()

    return created_ids
