"""Document review workflow service.

Owns the Phase 6/7 document gate:
candidate submit -> recruiter reviews each document -> recruiter finalizes one
application -> either correction is requested or NER is allowed to run.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.models.application import Application, ApplicationStatus
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument
from backend.models.document import (
    Document,
    DocumentType,
    DocumentVerificationStatus,
)
from backend.models.user import User, UserRole
from backend.utils.file_storage import delete_stored_file, save_upload


REVIEWABLE_APPLICATION_STATUSES = {
    ApplicationStatus.DOCUMENT_REVIEW.value,
    ApplicationStatus.SUBMITTED.value,
}

FINAL_DOCUMENT_STATUSES = {
    DocumentVerificationStatus.VERIFIED.value,
    DocumentVerificationStatus.REJECTED.value,
}

NER_CACHE_DOCUMENT_TYPES = {
    DocumentType.CV.value,
    DocumentType.MOTIVATION_LETTER.value,
    DocumentType.SWOT.value,
}


@dataclass(frozen=True)
class FinalizeDocumentReviewResult:
    application: Application
    trigger_anonymization: bool
    rejected_document_types: list[str]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _assert_reviewer(user: User) -> None:
    if user.role not in (UserRole.RECRUITER, UserRole.SUPER_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters or super admins can review documents",
        )


def _document_type(doc: Document) -> str:
    return _enum_value(doc.doc_type)


def get_document_verification_status(doc: Document) -> str:
    """Return normalized document review status with legacy fallback."""
    value = getattr(doc, "verification_status", None)
    value = _enum_value(value) if value else None
    if value in {
        DocumentVerificationStatus.PENDING.value,
        DocumentVerificationStatus.VERIFIED.value,
        DocumentVerificationStatus.REJECTED.value,
    }:
        return value
    return (
        DocumentVerificationStatus.VERIFIED.value
        if doc.is_verified
        else DocumentVerificationStatus.PENDING.value
    )


def reset_document_review_state(doc: Document) -> None:
    """Mark a document as awaiting review and clear previous review metadata."""
    doc.verification_status = DocumentVerificationStatus.PENDING.value
    doc.rejection_reason = None
    doc.reviewed_at = None
    doc.reviewed_by_id = None
    doc.is_verified = False


def sync_legacy_verification_flag(doc: Document) -> None:
    """Keep ``is_verified`` aligned for old frontend/API callers."""
    doc.is_verified = (
        get_document_verification_status(doc)
        == DocumentVerificationStatus.VERIFIED.value
    )


def invalidate_candidate_document_cache(
    db: Session,
    *,
    app: Application,
    doc_type: DocumentType | str,
) -> int:
    """Delete stale NER/cache rows for a replaced application document."""
    doc_type_value = _enum_value(doc_type)
    if doc_type_value not in NER_CACHE_DOCUMENT_TYPES:
        return 0

    candidate_ids = [
        candidate_id
        for (candidate_id,) in db.query(Candidate.id)
        .filter(Candidate.user_id == app.user_id)
        .all()
    ]
    if not candidate_ids:
        return 0

    return (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id.in_(candidate_ids),
            CandidateDocument.document_type == doc_type_value,
        )
        .delete(synchronize_session=False)
    )


def document_review_progress(documents: list[Document]) -> dict:
    """Count review progress over the required document set."""
    by_type = {_document_type(doc): doc for doc in documents}
    total_required = len(DocumentType)
    pending_count = 0
    verified_count = 0
    rejected_count = 0

    for doc_type in DocumentType:
        doc = by_type.get(doc_type.value)
        if doc is None:
            pending_count += 1
            continue
        doc_status = get_document_verification_status(doc)
        if doc_status == DocumentVerificationStatus.VERIFIED.value:
            verified_count += 1
        elif doc_status == DocumentVerificationStatus.REJECTED.value:
            rejected_count += 1
        else:
            pending_count += 1

    return {
        "total_required": total_required,
        "pending_count": pending_count,
        "verified_count": verified_count,
        "rejected_count": rejected_count,
        "all_verified": verified_count == total_required,
        "has_rejected": rejected_count > 0,
    }


def _load_document_and_application(
    db: Session,
    doc_id: int,
) -> tuple[Document, Application]:
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    app = db.query(Application).filter(Application.id == doc.application_id).first()
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application missing",
        )
    return doc, app


def review_document(
    db: Session,
    *,
    doc_id: int,
    review_status: str,
    reason: str | None,
    reviewer: User,
) -> Document:
    """Review one document as verified or rejected."""
    _assert_reviewer(reviewer)
    doc, app = _load_document_and_application(db, doc_id)

    app_status = _enum_value(app.status)
    if app_status not in REVIEWABLE_APPLICATION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Document can only be reviewed while the application is in document review",
                "status": app_status,
            },
        )

    normalized_status = (review_status or "").strip().lower()
    if normalized_status not in FINAL_DOCUMENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="status must be 'verified' or 'rejected'",
        )

    cleaned_reason = (reason or "").strip()
    if normalized_status == DocumentVerificationStatus.REJECTED.value and not cleaned_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="rejection reason is required when rejecting a document",
        )

    old_status = get_document_verification_status(doc)
    doc.verification_status = normalized_status
    doc.rejection_reason = (
        cleaned_reason
        if normalized_status == DocumentVerificationStatus.REJECTED.value
        else None
    )
    doc.reviewed_at = _utcnow()
    doc.reviewed_by_id = reviewer.id
    sync_legacy_verification_flag(doc)

    doc_type = _document_type(doc)
    audit_reason = f"doc_id={doc.id}; doc_type={doc_type}"
    if doc.rejection_reason:
        audit_reason = f"{audit_reason}; reason={doc.rejection_reason}"

    db.add(
        AuditLog(
            recruiter_id=reviewer.id,
            candidate_id=app.user_id,
            action_type="document_verification",
            old_value=old_status,
            new_value=normalized_status,
            reason=audit_reason,
        )
    )
    db.commit()
    db.refresh(doc)
    return doc


def finalize_document_review(
    db: Session,
    *,
    application_id: int,
    reviewer: User,
) -> FinalizeDocumentReviewResult:
    """Finalize review for exactly one application/candidate."""
    _assert_reviewer(reviewer)

    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )

    old_status = _enum_value(app.status)
    if old_status not in REVIEWABLE_APPLICATION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Application is not awaiting document review",
                "status": old_status,
            },
        )

    docs = db.query(Document).filter(Document.application_id == app.id).all()
    docs_by_type = {_document_type(doc): doc for doc in docs}
    required_types = [doc_type.value for doc_type in DocumentType]
    missing = [doc_type for doc_type in required_types if doc_type not in docs_by_type]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Cannot finalize document review because required documents are missing",
                "missing": missing,
                "required": required_types,
            },
        )

    pending = [
        doc_type
        for doc_type in required_types
        if get_document_verification_status(docs_by_type[doc_type])
        not in FINAL_DOCUMENT_STATUSES
    ]
    if pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "All required documents must be verified or rejected before finalization",
                "pending": pending,
            },
        )

    rejected_types = [
        doc_type
        for doc_type in required_types
        if get_document_verification_status(docs_by_type[doc_type])
        == DocumentVerificationStatus.REJECTED.value
    ]

    if rejected_types:
        app.status = ApplicationStatus.CORRECTION_REQUESTED
        trigger_anonymization = False
    else:
        for doc in docs:
            doc.verification_status = DocumentVerificationStatus.VERIFIED.value
            sync_legacy_verification_flag(doc)
        app.status = ApplicationStatus.VERIFIED
        trigger_anonymization = True

    new_status = _enum_value(app.status)
    db.add(
        AuditLog(
            recruiter_id=reviewer.id,
            candidate_id=app.user_id,
            action_type="document_review_finalized",
            old_value=old_status,
            new_value=new_status,
            reason=(
                f"application_id={app.id}; rejected={','.join(rejected_types)}"
                if rejected_types
                else f"application_id={app.id}; all_required_documents_verified"
            ),
        )
    )
    db.commit()
    db.refresh(app)

    return FinalizeDocumentReviewResult(
        application=app,
        trigger_anonymization=trigger_anonymization,
        rejected_document_types=rejected_types,
    )


def replace_rejected_document(
    db: Session,
    *,
    doc: Document,
    app: Application,
    file: UploadFile,
    candidate: User,
) -> Document:
    """Replace a rejected document during the correction flow."""
    if candidate.role != UserRole.CANDIDATE or app.user_id != candidate.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your document",
        )
    if app.status != ApplicationStatus.CORRECTION_REQUESTED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Rejected documents can only be replaced after correction is requested",
                "status": _enum_value(app.status),
            },
        )
    if get_document_verification_status(doc) != DocumentVerificationStatus.REJECTED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only rejected documents can be replaced in correction flow",
        )

    old_file_name = doc.file_name
    old_status = get_document_verification_status(doc)

    delete_stored_file(doc.file_path)
    file_path, size_bytes = save_upload(app.id, doc.doc_type, file)
    original_name = (file.filename or doc.file_name or _document_type(doc)).strip()

    doc.file_path = file_path
    doc.file_name = original_name
    doc.file_size = size_bytes
    doc.uploaded_at = _utcnow()
    reset_document_review_state(doc)
    invalidated_cache_rows = invalidate_candidate_document_cache(
        db,
        app=app,
        doc_type=doc.doc_type,
    )

    remaining_rejected = (
        db.query(Document)
        .filter(
            Document.application_id == app.id,
            Document.id != doc.id,
            Document.verification_status == DocumentVerificationStatus.REJECTED.value,
        )
        .count()
    )
    if remaining_rejected == 0:
        app.status = ApplicationStatus.DOCUMENT_REVIEW

    db.add(
        AuditLog(
            recruiter_id=None,
            candidate_id=app.user_id,
            action_type="document_replacement",
            old_value=old_status,
            new_value=DocumentVerificationStatus.PENDING.value,
            reason=(
                f"application_id={app.id}; doc_id={doc.id}; "
                f"doc_type={_document_type(doc)}; old_file={old_file_name}; "
                f"cache_invalidated={invalidated_cache_rows}"
            ),
        )
    )
    db.commit()
    db.refresh(doc)
    return doc
