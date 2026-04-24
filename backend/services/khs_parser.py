"""KHS (academic transcript) parser for Telkom University.

Extracts IPK (cumulative GPA), total SKS (credits), and relevant course
rows from a student's uploaded KHS PDF. The output is fed into the RAG
context as a structured summary block:

    IPK: 3.75 | Total SKS: 120 | Relevant Courses: Machine Learning (A, sem 5), ...

The parser is defensive: transcript layouts vary between academic years and
between the university's two main report formats (per-semester KHS and
cumulative transkrip). On any parse failure we return a populated-but-empty
payload with ``parse_error`` set so the caller can fall back to CV-only RAG
without crashing the pipeline.
"""

from __future__ import annotations

import re
from typing import TypedDict

import fitz  # PyMuPDF


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class CourseRow(TypedDict):
    name: str
    grade: str
    semester: int | None


class KhsResult(TypedDict, total=False):
    ipk: float | None
    total_sks: int | None
    relevant_courses: list[CourseRow]
    parse_error: str


# ---------------------------------------------------------------------------
# Regexes
# ---------------------------------------------------------------------------

# IPK — matches:
#   "IPK: 3.75", "IPK 3,75", "Indeks Prestasi Kumulatif : 3.75"
#   Accepts both "." and "," as decimal separator (ID locale uses ",").
_IPK_RE = re.compile(
    r"(?:IPK|Indeks\s+Prestasi\s+Kumulatif)\s*[:\-]?\s*([0-4](?:[.,]\d{1,3})?)",
    re.IGNORECASE,
)

# Total SKS — matches:
#   "Total SKS: 120", "Jumlah SKS  120", "SKS Ditempuh: 120"
_TOTAL_SKS_RE = re.compile(
    r"(?:Total\s+SKS|Jumlah\s+SKS|SKS\s+Ditempuh|Total\s+Credits)\s*[:\-]?\s*(\d{1,3})",
    re.IGNORECASE,
)

# Course row — Telkom KHS printouts tend to list rows like:
#   "CII3A3   Machine Learning         3   A    5"
#   course_code  course_name (multi-word)  sks  grade  semester
# Grade is A / AB / B / BC / C / D / E (Telkom's letter scale).
# Semester is 1..14 (tolerant).
_GRADE_SET = r"A|AB|B\+|B|BC|C\+|C|D\+|D|E|T|K"
_COURSE_ROW_RE = re.compile(
    # optional course code (letter+digits), then course name words, SKS (1-6),
    # grade, semester
    r"^\s*(?:[A-Z]{2,5}\d[A-Z0-9]{2,5}\s+)?"  # optional code
    r"([A-Za-z][A-Za-z0-9\s\-&/().,]{3,60}?)\s+"  # course name
    r"(?:[1-6])\s+"  # sks
    rf"({_GRADE_SET})\s+"  # grade
    r"([1-9]|1[0-4])\s*$",  # semester 1..14
    re.MULTILINE,
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_khs(file_path: str) -> KhsResult:
    """Parse a KHS PDF and return a structured summary.

    Returns a populated-but-empty result + ``parse_error`` on any failure so
    the RAG pipeline can proceed without the KHS block rather than crashing.
    """
    import os

    if not os.path.exists(file_path):
        return _empty_result("file not found")

    try:
        text = _extract_pdf_text(file_path)
    except Exception as exc:  # noqa: BLE001 — PyMuPDF raises diverse exceptions
        return _empty_result(f"pdf extraction failed: {exc.__class__.__name__}")

    if not text or not text.strip():
        return _empty_result("empty pdf text")

    ipk = _parse_ipk(text)
    total_sks = _parse_total_sks(text)
    courses = _parse_courses(text)

    # Heuristic: if we recognised nothing at all, the layout didn't match.
    if ipk is None and total_sks is None and not courses:
        return _empty_result("unrecognized format")

    return {
        "ipk": ipk,
        "total_sks": total_sks,
        "relevant_courses": courses,
    }


def format_khs_summary(result: KhsResult) -> str:
    """Render a KHS result as a one-line structured block for the RAG prompt.

    Format matches the Task 7 clarification:
        "IPK: 3.75 | Total SKS: 120 | Relevant Courses: Machine Learning (A, sem 5), ..."
    """
    ipk = result.get("ipk")
    sks = result.get("total_sks")
    courses = result.get("relevant_courses") or []

    ipk_part = f"IPK: {ipk:.2f}" if isinstance(ipk, (int, float)) else "IPK: -"
    sks_part = f"Total SKS: {sks}" if sks else "Total SKS: -"

    if courses:
        course_parts = []
        for c in courses:
            sem = c.get("semester")
            sem_str = f"sem {sem}" if sem else "sem -"
            course_parts.append(f"{c['name']} ({c['grade']}, {sem_str})")
        courses_part = "Relevant Courses: " + ", ".join(course_parts)
    else:
        courses_part = "Relevant Courses: -"

    return f"{ipk_part} | {sks_part} | {courses_part}"


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _empty_result(error: str) -> KhsResult:
    return {
        "ipk": None,
        "total_sks": None,
        "relevant_courses": [],
        "parse_error": error,
    }


def _extract_pdf_text(file_path: str) -> str:
    """Concatenated text from every page. Empty string if the PDF has none."""
    with fitz.open(file_path) as doc:
        return "\n".join(page.get_text("text") for page in doc)


def _parse_ipk(text: str) -> float | None:
    m = _IPK_RE.search(text)
    if not m:
        return None
    raw = m.group(1).replace(",", ".")
    try:
        value = float(raw)
    except ValueError:
        return None
    if value < 0.0 or value > 4.0:
        return None
    return round(value, 2)


def _parse_total_sks(text: str) -> int | None:
    m = _TOTAL_SKS_RE.search(text)
    if not m:
        return None
    try:
        value = int(m.group(1))
    except ValueError:
        return None
    if value <= 0 or value > 300:
        return None
    return value


def _parse_courses(text: str) -> list[CourseRow]:
    """Extract course rows, deduplicating by (name, semester)."""
    seen: set[tuple[str, int | None]] = set()
    out: list[CourseRow] = []
    for m in _COURSE_ROW_RE.finditer(text):
        name = _clean_course_name(m.group(1))
        if not name:
            continue
        grade = m.group(2).strip().upper()
        try:
            semester = int(m.group(3))
        except (TypeError, ValueError):
            semester = None
        key = (name.lower(), semester)
        if key in seen:
            continue
        seen.add(key)
        out.append({"name": name, "grade": grade, "semester": semester})
    return out


def _clean_course_name(raw: str) -> str:
    """Collapse whitespace + strip trailing punctuation from a captured name."""
    cleaned = re.sub(r"\s+", " ", raw).strip(" .,-")
    # Reject obviously-wrong matches (e.g. column header fragments).
    if len(cleaned) < 4:
        return ""
    lowered = cleaned.lower()
    noise = {"nama mata kuliah", "mata kuliah", "course name", "nilai"}
    if lowered in noise:
        return ""
    return cleaned
