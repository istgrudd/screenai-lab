"""Local file storage for candidate-uploaded application documents.

Files live at:  ``{settings.upload_dir}/{application_id}/{doc_type}.{ext}``

Responsibilities:
    * Validate MIME type per document type (pdf everywhere, plus jpg/png for KTM).
    * Enforce per-document size limits (PRD Section 8).
    * Persist uploaded bytes to disk, replacing any prior file for the same
      ``(application_id, doc_type)`` pair.
    * Delete stored files when a document row is removed.

Size limits and allowed MIME types are the canonical source of truth for the
whole app — the documents router imports them directly.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from backend.config import settings
from backend.models.document import DocumentType


# ---------------------------------------------------------------------------
# Per-document constraints (PRD Section 8)
# ---------------------------------------------------------------------------

_MB = 1024 * 1024

MAX_FILE_SIZE: dict[DocumentType, int] = {
    DocumentType.CV: 5 * _MB,
    DocumentType.KHS: 5 * _MB,
    DocumentType.KTM: 2 * _MB,
    DocumentType.MOTIVATION_LETTER: 5 * _MB,
    DocumentType.SWOT: 5 * _MB,
    DocumentType.SUPPORTING_DOCS: 10 * _MB,
}

ALLOWED_MIME_TYPES: dict[DocumentType, set[str]] = {
    DocumentType.CV: {"application/pdf"},
    DocumentType.KHS: {"application/pdf"},
    DocumentType.KTM: {"application/pdf", "image/jpeg", "image/png"},
    DocumentType.MOTIVATION_LETTER: {"application/pdf"},
    DocumentType.SWOT: {"application/pdf"},
    DocumentType.SUPPORTING_DOCS: {"application/pdf"},
}

_MIME_TO_EXT: dict[str, str] = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
}

# Magic-byte signatures keyed by declared MIME type. We don't trust the client's
# Content-Type header alone — a renamed `.exe` posted with `application/pdf`
# would otherwise pass the MIME check and land on disk.
_MAGIC_BYTES: dict[str, bytes] = {
    "application/pdf": b"%PDF",
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _application_dir(application_id: int) -> Path:
    """Absolute path to one application's upload directory (created on demand)."""
    root = Path(settings.upload_dir).resolve()
    app_dir = root / str(application_id)
    app_dir.mkdir(parents=True, exist_ok=True)
    return app_dir


def _remove_existing_files(app_dir: Path, doc_type: DocumentType) -> None:
    """Delete any file for this doc_type (across all allowed extensions)."""
    for ext in {"pdf", "jpg", "png"}:
        candidate = app_dir / f"{doc_type.value}.{ext}"
        if candidate.exists():
            candidate.unlink()


def _validate_content_type(doc_type: DocumentType, content_type: str | None) -> str:
    """Return the client-reported MIME type or raise 415."""
    allowed = ALLOWED_MIME_TYPES[doc_type]
    normalized = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized not in allowed:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "doc_type": doc_type.value,
                "received_mime": normalized or None,
                "allowed_mime": sorted(allowed),
            },
        )
    return normalized


def _validate_magic_bytes(mime: str, data: bytes) -> None:
    """Verify the file signature matches the declared MIME type."""
    expected = _MAGIC_BYTES.get(mime)
    if expected is None:
        return
    if not data.startswith(expected):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match declared type",
        )


def _validate_size(doc_type: DocumentType, size_bytes: int) -> None:
    """Raise 413 if the payload exceeds the per-document limit."""
    limit = MAX_FILE_SIZE[doc_type]
    if size_bytes > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "doc_type": doc_type.value,
                "received_bytes": size_bytes,
                "max_bytes": limit,
                "max_mb": limit // _MB,
            },
        )
    if size_bytes <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def save_upload(
    application_id: int,
    doc_type: DocumentType,
    upload: UploadFile,
) -> tuple[str, int]:
    """Persist ``upload`` for the given application and doc_type.

    Replaces any previously stored file for the same ``(application_id,
    doc_type)`` pair. Validates MIME type and size first and raises an
    ``HTTPException`` (415 / 413 / 400) on any violation.

    Returns ``(absolute_file_path, size_bytes)``.
    """
    mime = _validate_content_type(doc_type, upload.content_type)
    ext = _MIME_TO_EXT[mime]

    # Read the uploaded bytes once so we can verify size before committing
    # anything to disk. Files are small (10 MB cap) so buffering is fine.
    upload.file.seek(0)
    data = upload.file.read()
    _validate_size(doc_type, len(data))
    _validate_magic_bytes(mime, data)
    upload.file.seek(0)

    app_dir = _application_dir(application_id)
    _remove_existing_files(app_dir, doc_type)

    target = app_dir / f"{doc_type.value}.{ext}"
    with open(target, "wb") as f:
        f.write(data)

    return str(target), len(data)


def delete_stored_file(file_path: str) -> None:
    """Delete a previously-stored file if it still exists.

    Silent no-op if the path is missing — callers invoke this on cleanup
    paths where the file may or may not have been persisted.
    """
    if not file_path:
        return
    try:
        p = Path(file_path)
        if p.exists() and p.is_file():
            p.unlink()
    except OSError:
        # Don't mask the real error the caller is reporting.
        pass


def purge_application_dir(application_id: int) -> None:
    """Remove an application's upload directory recursively (for test cleanup)."""
    root = Path(settings.upload_dir).resolve()
    app_dir = root / str(application_id)
    if app_dir.exists():
        shutil.rmtree(app_dir, ignore_errors=True)


def absolute_upload_root() -> str:
    """Absolute path to the uploads root — useful for path-containment checks."""
    return os.path.realpath(settings.upload_dir)
