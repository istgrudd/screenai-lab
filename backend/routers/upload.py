"""Upload router — handles PDF file uploads.

Endpoint:
    POST /api/upload — receive one or more PDF files, extract text,
                       normalize/segment, anonymize (NER + regex),
                       save candidate + document to DB, and persist
                       extracted/anonymized JSON to data/.
"""

import json
import os
import shutil
import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.candidate import Candidate, CandidateDocument
from backend.models.user import User, UserRole
from backend.services.extractor import (
    detect_certificate_type,
    extract_eprt_score,
    extract_text_from_pdf,
)
from backend.services.normalizer import normalize_and_segment
from backend.services.anonymizer import anonymize_text
from backend.services.scoring import cefr_from_score

router = APIRouter(prefix="/api", tags=["upload"])


def _is_certificate_content(text: str) -> bool:
    """Return True if the extracted text looks like a language certificate.

    Content-based detection: looks for EPrT / TOTAL SCORE / English
    Proficiency Test markers. Falls back to CV otherwise.
    """
    if not text:
        return False
    lower = text.lower()
    return (
        "eprt" in lower
        or "total score" in lower
        or "english proficiency test" in lower
    )


@router.post("/upload", dependencies=[Depends(require_role(UserRole.CANDIDATE))])
def upload_documents(
    files: list[UploadFile] = File(...),
    rubric_id: int | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload one or more PDF files.

    For each file:
    1. Validate it is a PDF.
    2. Save to data/raw_pdfs/ with a unique filename.
    3. Extract text using PyMuPDF.
    4. Normalize and segment the text.
    5. Anonymize using IndoBERT NER + regex fallback.
    6. Create Candidate + Document records in the database.
    7. Save extracted JSON to data/extracted/.
    8. Save anonymized JSON to data/anonymized/.

    Returns a list of created candidates with their document details.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    # --- Stage 1: save each file and extract text so we can classify ---
    staged: list[dict] = []
    for upload_file in files:
        if not upload_file.filename:
            raise HTTPException(status_code=400, detail="File has no filename.")
        if not upload_file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"File '{upload_file.filename}' is not a PDF.",
            )

        file_uuid = uuid.uuid4().hex[:12]
        safe_name = f"{file_uuid}_{upload_file.filename}"
        save_path = os.path.join(settings.raw_pdfs_dir, safe_name)
        try:
            with open(save_path, "wb") as f:
                shutil.copyfileobj(upload_file.file, f)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save file '{upload_file.filename}': {e}",
            )

        try:
            extraction = extract_text_from_pdf(save_path)
        except (FileNotFoundError, ValueError) as e:
            raise HTTPException(
                status_code=422,
                detail=f"Failed to extract text from '{upload_file.filename}': {e}",
            )

        doc_type = (
            "certificate"
            if _is_certificate_content(extraction["raw_text"])
            else "cv"
        )
        staged.append({
            "filename": upload_file.filename,
            "save_path": save_path,
            "extraction": extraction,
            "doc_type": doc_type,
        })

    # --- Stage 2: group all files under one Candidate per upload request ---
    # Rationale: CV + language certificate typically arrive together for
    # the same applicant. Callers who want separate candidates should
    # issue separate upload requests.
    candidate = Candidate(
        status="anonymized",
        rubric_id=rubric_id,
        user_id=current_user.id,
    )
    db.add(candidate)
    db.flush()

    results: list[dict] = []
    extracted_bundle: list[dict] = []
    anonymized_bundle: list[dict] = []

    for item in staged:
        filename = item["filename"]
        save_path = item["save_path"]
        extraction = item["extraction"]
        doc_type = item["doc_type"]

        if doc_type == "certificate":
            # Certificates skip normalization + NER. Only the TOTAL SCORE
            # is extracted and applied to the candidate as a language bonus.
            cert_kind = detect_certificate_type(extraction["raw_text"])
            eprt_score = (
                extract_eprt_score(extraction["raw_text"])
                if cert_kind == "eprt"
                else None
            )
            cefr_level, bonus = cefr_from_score(eprt_score)
            if eprt_score is not None:
                candidate.language_score = eprt_score
                candidate.language_bonus = bonus

            document = CandidateDocument(
                candidate_id=candidate.id,
                filename=filename,
                file_path=save_path,
                document_type="certificate",
                raw_text=extraction["raw_text"],
                page_count=extraction["metadata"]["page_count"],
                file_size_kb=extraction["metadata"]["file_size_kb"],
            )
            db.add(document)
            db.flush()

            results.append({
                "candidate_id": candidate.id,
                "anonymous_id": candidate.anonymous_id,
                "status": candidate.status,
                "document": {
                    "id": document.id,
                    "filename": filename,
                    "document_type": "certificate",
                    "page_count": extraction["metadata"]["page_count"],
                    "file_size_kb": extraction["metadata"]["file_size_kb"],
                    "certificate_kind": cert_kind,
                    "language_score": eprt_score,
                    "cefr_level": cefr_level,
                    "language_bonus": bonus,
                },
                "anonymization": None,
            })
            continue

        # --- CV path: normalize + anonymize ---
        normalization = normalize_and_segment(extraction["raw_text"])
        anonymization = anonymize_text(normalization["normalized_text"])

        document = CandidateDocument(
            candidate_id=candidate.id,
            filename=filename,
            file_path=save_path,
            document_type="cv",
            raw_text=extraction["raw_text"],
            normalized_text=normalization["normalized_text"],
            sections_json=normalization["sections"],
            anonymized_text=anonymization["anonymized_text"],
            entities_json=anonymization["entities_found"],
            page_count=extraction["metadata"]["page_count"],
            file_size_kb=extraction["metadata"]["file_size_kb"],
        )
        db.add(document)
        db.flush()

        extracted_bundle.append({
            "filename": filename,
            "extraction": extraction,
            "normalization": normalization,
        })
        anonymized_bundle.append({
            "filename": filename,
            "anonymized_text": anonymization["anonymized_text"],
            "entities_found": anonymization["entities_found"],
            "entity_count": anonymization["entity_count"],
        })

        results.append({
            "candidate_id": candidate.id,
            "anonymous_id": candidate.anonymous_id,
            "status": candidate.status,
            "document": {
                "id": document.id,
                "filename": filename,
                "document_type": "cv",
                "page_count": extraction["metadata"]["page_count"],
                "file_size_kb": extraction["metadata"]["file_size_kb"],
                "sections_detected": [
                    k for k, v in normalization["sections"].items() if v.strip()
                ],
            },
            "anonymization": {
                "entity_count": anonymization["entity_count"],
                "entities_found": anonymization["entities_found"],
            },
        })

    # --- Persist bundle JSONs (CV-only content) ---
    if extracted_bundle:
        json_path = os.path.join(
            settings.extracted_dir, f"{candidate.anonymous_id}.json"
        )
        with open(json_path, "w", encoding="utf-8") as jf:
            json.dump(
                {
                    "candidate_id": candidate.id,
                    "anonymous_id": candidate.anonymous_id,
                    "documents": extracted_bundle,
                },
                jf,
                ensure_ascii=False,
                indent=2,
            )

    if anonymized_bundle:
        anon_json_path = os.path.join(
            settings.anonymized_dir, f"{candidate.anonymous_id}.json"
        )
        with open(anon_json_path, "w", encoding="utf-8") as af:
            json.dump(
                {
                    "candidate_id": candidate.id,
                    "anonymous_id": candidate.anonymous_id,
                    "documents": anonymized_bundle,
                },
                af,
                ensure_ascii=False,
                indent=2,
            )

    db.commit()

    return {
        "success": True,
        "data": {
            "uploaded_count": len(results),
            "candidates": results,
        },
        "error": None,
    }
