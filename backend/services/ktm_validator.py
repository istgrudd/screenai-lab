"""KTM (Telkom University student ID) validator.

Used as a pass/fail gate before the RAG pipeline runs. Extracts the NIM
from a PDF KTM and cross-checks it against the NIM the candidate supplied
at registration. Images (JPG/PNG) are out-of-scope for Phase 2 — we flag
them for manual recruiter verification.

Output shape matches the PRD contract:

    { valid, nim, name, faculty, major, error? }
"""

from __future__ import annotations

import os
import re
from typing import TypedDict

import fitz  # PyMuPDF


# Telkom University NIM: 13 digits starting with 103 (per PRD §9).
_TELKOM_NIM_RE = re.compile(r"\b(103\d{10})\b")

# Narrower patterns if the KTM labels fields explicitly.
_NAMED_NIM_RE = re.compile(
    r"(?:NIM|N\.I\.M\.)\s*[:\-]?\s*(\d{13})",
    re.IGNORECASE,
)
_NAME_RE = re.compile(
    r"(?:Nama|Name)\s*[:\-]?\s*([A-Z][A-Z\s.\-']{4,80})",
    re.IGNORECASE,
)
_FACULTY_RE = re.compile(
    r"(?:Fakultas|Faculty)\s*[:\-]?\s*([A-Za-z][A-Za-z\s&/]{4,80})",
    re.IGNORECASE,
)
_MAJOR_RE = re.compile(
    r"(?:Program\s+Studi|Prodi|Jurusan|Major)\s*[:\-]?\s*([A-Za-z][A-Za-z\s&/]{3,80})",
    re.IGNORECASE,
)


class KtmResult(TypedDict, total=False):
    valid: bool
    nim: str | None
    name: str | None
    faculty: str | None
    major: str | None
    error: str
    warning: str


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_ktm(file_path: str, expected_nim: str | None = None) -> KtmResult:
    r"""Validate a KTM file and optionally cross-check NIM against the user's.

    Rules:
      * Image files (JPG/PNG) cannot be text-extracted without OCR — return
        valid=false with a ``requires manual verification`` error. OCR is
        backlog per PRD §13.
      * PDF: extract text, run NIM regex. If NIM is missing or doesn't match
        /^103\d{10}$/, valid=false.
      * If ``expected_nim`` is supplied and differs from the KTM NIM, mark
        valid=false and include a warning — this is the "uploaded someone
        else's KTM" case called out in PRD §12.
    """
    ext = _suffix(file_path)

    if ext in {".jpg", ".jpeg", ".png"}:
        return {
            "valid": False,
            "nim": None,
            "name": None,
            "faculty": None,
            "major": None,
            "error": "image KTM requires manual verification",
        }

    if ext != ".pdf":
        return {
            "valid": False,
            "nim": None,
            "name": None,
            "faculty": None,
            "major": None,
            "error": f"unsupported KTM file type: {ext or 'unknown'}",
        }

    if not os.path.exists(file_path):
        return {
            "valid": False,
            "nim": None,
            "name": None,
            "faculty": None,
            "major": None,
            "error": "file not found",
        }

    try:
        text = _extract_pdf_text(file_path)
    except Exception as exc:  # noqa: BLE001 — PyMuPDF raises diverse exceptions
        return {
            "valid": False,
            "nim": None,
            "name": None,
            "faculty": None,
            "major": None,
            "error": f"pdf extraction failed: {exc.__class__.__name__}",
        }

    nim = _find_nim(text)
    if not nim:
        return {
            "valid": False,
            "nim": None,
            "name": _find_first(text, _NAME_RE),
            "faculty": _find_first(text, _FACULTY_RE),
            "major": _find_first(text, _MAJOR_RE),
            "error": "NIM not found or not in Telkom format (103XXXXXXXXXX)",
        }

    result: KtmResult = {
        "valid": True,
        "nim": nim,
        "name": _find_first(text, _NAME_RE),
        "faculty": _find_first(text, _FACULTY_RE),
        "major": _find_first(text, _MAJOR_RE),
    }

    if expected_nim and nim != expected_nim.strip():
        result["valid"] = False
        result["warning"] = (
            f"NIM on KTM ({nim}) does not match the NIM on record "
            f"({expected_nim}) — possible mis-upload, review manually"
        )

    return result


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _suffix(path: str) -> str:
    return os.path.splitext(path)[1].lower()


def _extract_pdf_text(file_path: str) -> str:
    with fitz.open(file_path) as doc:
        return "\n".join(page.get_text("text") for page in doc)


def _find_nim(text: str) -> str | None:
    """Prefer the labelled "NIM: …" match; fall back to any 103-prefixed 13-digit run."""
    m = _NAMED_NIM_RE.search(text)
    if m and m.group(1).startswith("103"):
        return m.group(1)
    m = _TELKOM_NIM_RE.search(text)
    return m.group(1) if m else None


def _find_first(text: str, pattern: re.Pattern[str]) -> str | None:
    m = pattern.search(text)
    if not m:
        return None
    return re.sub(r"\s+", " ", m.group(1)).strip(" .,-") or None
