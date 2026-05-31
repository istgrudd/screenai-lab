"""Documents router — per-application uploads + recruiter verification.

Endpoints:
    POST /api/documents/upload/{doc_type}   — Candidate; upload/replace document
    PUT  /api/documents/{doc_id}/replace    — Candidate; replace existing document
    GET  /api/documents/{application_id}    — Auth; list docs for an application
    GET  /api/documents/{doc_id}/file       — Auth; download/preview raw file
    PUT  /api/documents/{doc_id}/verify     — Recruiter+; toggle verified flag

Authorization:
    * Candidates can only touch their own application's documents.
    * Recruiters (and super_admin) can view any candidate's documents and
      toggle the ``is_verified`` flag (used for D-06 supporting_docs).
    * Once ``Application.status`` leaves ``draft``, candidate mutations are
      refused with 403. This is what "locks" the submission.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.application import Application, ApplicationStatus
from backend.models.document import Document, DocumentType, DocumentVerificationStatus
from backend.models.user import User, UserRole
from backend.services.document_review_service import (
    get_document_verification_status,
    replace_rejected_document,
    reset_document_review_state,
    review_document as review_document_service,
)
from backend.utils.file_storage import (
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE,
    delete_stored_file,
    save_upload,
)
from backend.utils.period_utils import assert_submission_phase

router = APIRouter(prefix="/api/documents", tags=["documents"])

_candidate_only = require_role(UserRole.CANDIDATE)
_recruiter_or_admin = require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN)


# ---------------------------------------------------------------------------
# Schemas & helpers
# ---------------------------------------------------------------------------

class VerifyRequest(BaseModel):
    is_verified: bool


class DocumentReviewRequest(BaseModel):
    status: str
    reason: str | None = None


def _serialize_document(
    doc: Document,
    *,
    viewer: User | None = None,
    application: Application | None = None,
) -> dict:
    doc_type_value = (
        doc.doc_type.value if hasattr(doc.doc_type, "value") else str(doc.doc_type)
    )
    verification_status = get_document_verification_status(doc)
    payload = {
        "id": doc.id,
        "application_id": doc.application_id,
        "doc_type": doc_type_value,
        "file_name": doc.file_name,
        "file_size": doc.file_size,
        "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
        "is_verified": doc.is_verified,
        "verification_status": verification_status,
        "rejection_reason": doc.rejection_reason,
        "reviewed_at": doc.reviewed_at.isoformat() if doc.reviewed_at else None,
        "reviewed_by_id": doc.reviewed_by_id,
        "review_visibility": "visible",
    }

    if (
        viewer is not None
        and viewer.role == UserRole.CANDIDATE
        and application is not None
        and application.status
        in {ApplicationStatus.SUBMITTED, ApplicationStatus.DOCUMENT_REVIEW}
    ):
        payload.update(
            {
                "is_verified": False,
                "verification_status": DocumentVerificationStatus.PENDING.value,
                "rejection_reason": None,
                "reviewed_at": None,
                "reviewed_by_id": None,
                "review_visibility": "hidden_until_finalized",
            }
        )

    return payload


def _assert_draft(app: Application) -> None:
    """Reject mutations once the application has been submitted."""
    if app.status != ApplicationStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Application has been submitted — documents are locked",
                "status": app.status.value
                if hasattr(app.status, "value")
                else str(app.status),
            },
        )


def _get_owned_application(db: Session, user: User) -> Application:
    app = (
        db.query(Application)
        .filter(Application.user_id == user.id)
        .order_by(Application.created_at.desc())
        .first()
    )
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No application found — create one first",
        )
    return app


def _authorize_view(app: Application, user: User) -> None:
    """Recruiters/admins see any; candidates only their own."""
    if user.role == UserRole.CANDIDATE and app.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your application",
        )


# ---------------------------------------------------------------------------
# Candidate: upload a document
# ---------------------------------------------------------------------------

@router.post(
    "/upload/{doc_type}",
    dependencies=[Depends(_candidate_only)],
    status_code=status.HTTP_201_CREATED,
)
def upload_document(
    doc_type: DocumentType,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload (or replace) the candidate's document for ``doc_type``.

    Behavior:
        * If no Document row exists for ``(my_application, doc_type)``, create one.
        * If one exists, replace it in place (same row, new file on disk).
        * Refused with 403 once the application is no longer in ``draft``.
    """
    app = _get_owned_application(db, current_user)
    existing = (
        db.query(Document)
        .filter(Document.application_id == app.id, Document.doc_type == doc_type)
        .first()
    )

    if app.status == ApplicationStatus.CORRECTION_REQUESTED:
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only rejected existing documents can be replaced in correction flow",
            )
        updated = replace_rejected_document(
            db,
            doc=existing,
            app=app,
            file=file,
            candidate=current_user,
        )
        return {"success": True, "data": _serialize_document(updated), "error": None}

    _assert_draft(app)
    assert_submission_phase(db)

    file_path, size_bytes = save_upload(app.id, doc_type, file)
    original_name = (file.filename or f"{doc_type.value}").strip() or f"{doc_type.value}"

    if existing:
        # Replace in place — save_upload already overwrote the disk file.
        existing.file_path = file_path
        existing.file_name = original_name
        existing.file_size = size_bytes
        reset_document_review_state(existing)
        db.commit()
        db.refresh(existing)
        return {"success": True, "data": _serialize_document(existing), "error": None}

    doc = Document(
        application_id=app.id,
        doc_type=doc_type,
        file_path=file_path,
        file_name=original_name,
        file_size=size_bytes,
        is_verified=False,
        verification_status=DocumentVerificationStatus.PENDING.value,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"success": True, "data": _serialize_document(doc), "error": None}


# ---------------------------------------------------------------------------
# Candidate: replace existing document (by doc_id)
# ---------------------------------------------------------------------------

@router.put(
    "/{doc_id}/replace",
    dependencies=[Depends(_candidate_only)],
)
def replace_document(
    doc_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace an already-uploaded document (before submission)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    app = db.query(Application).filter(Application.id == doc.application_id).first()
    if not app or app.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your document")

    if app.status == ApplicationStatus.CORRECTION_REQUESTED:
        updated = replace_rejected_document(
            db,
            doc=doc,
            app=app,
            file=file,
            candidate=current_user,
        )
        return {"success": True, "data": _serialize_document(updated), "error": None}

    _assert_draft(app)
    assert_submission_phase(db)

    # Remove old disk file, then save the new one.
    delete_stored_file(doc.file_path)
    file_path, size_bytes = save_upload(app.id, doc.doc_type, file)
    original_name = (file.filename or doc.file_name or f"{doc.doc_type.value}").strip()

    doc.file_path = file_path
    doc.file_name = original_name
    doc.file_size = size_bytes
    reset_document_review_state(doc)
    db.commit()
    db.refresh(doc)
    return {"success": True, "data": _serialize_document(doc), "error": None}


# ---------------------------------------------------------------------------
# Shared: list documents for an application
# ---------------------------------------------------------------------------

@router.get("/{application_id}")
def list_documents(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all documents belonging to ``application_id``.

    Candidates only see their own application; recruiters see any.
    """
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    _authorize_view(app, current_user)

    docs = (
        db.query(Document)
        .filter(Document.application_id == application_id)
        .order_by(Document.doc_type)
        .all()
    )
    return {
        "success": True,
        "data": {
            "application_id": application_id,
            "documents": [
                _serialize_document(d, viewer=current_user, application=app)
                for d in docs
            ],
            "required_types": [dt.value for dt in DocumentType],
            "limits": {
                dt.value: {
                    "max_bytes": MAX_FILE_SIZE[dt],
                    "allowed_mime": sorted(ALLOWED_MIME_TYPES[dt]),
                }
                for dt in DocumentType
            },
        },
        "error": None,
    }


# ---------------------------------------------------------------------------
# Shared: download/preview raw file
# ---------------------------------------------------------------------------

@router.get("/{doc_id}/file")
def download_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream the raw uploaded file (PDF / JPG / PNG)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    app = db.query(Application).filter(Application.id == doc.application_id).first()
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application missing")
    _authorize_view(app, current_user)

    path = Path(doc.file_path)
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Stored file is missing — please re-upload",
        )

    ext = path.suffix.lower().lstrip(".")
    media = {
        "pdf": "application/pdf",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
    }.get(ext, "application/octet-stream")

    return FileResponse(path=str(path), filename=doc.file_name, media_type=media)


# ---------------------------------------------------------------------------
# Recruiter: toggle verified flag (supporting_docs)
# ---------------------------------------------------------------------------

@router.put(
    "/{doc_id}/review",
    dependencies=[Depends(_recruiter_or_admin)],
)
def review_document(
    doc_id: int,
    payload: DocumentReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Review one document with a final status: verified or rejected."""
    doc = review_document_service(
        db,
        doc_id=doc_id,
        review_status=payload.status,
        reason=payload.reason,
        reviewer=current_user,
    )
    return {"success": True, "data": _serialize_document(doc), "error": None}


@router.put(
    "/{doc_id}/verify",
    dependencies=[Depends(_recruiter_or_admin)],
)
def verify_document(
    doc_id: int,
    payload: VerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle the ``is_verified`` flag — used for D-06 Dokumen Pendukung."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    app = db.query(Application).filter(Application.id == doc.application_id).first()
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application missing")

    if not payload.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use PUT /api/documents/{doc_id}/review instead.",
        )

    doc = review_document_service(
        db,
        doc_id=doc_id,
        review_status=DocumentVerificationStatus.VERIFIED.value,
        reason=None,
        reviewer=current_user,
    )
    return {"success": True, "data": _serialize_document(doc), "error": None}
