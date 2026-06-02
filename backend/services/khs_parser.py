"""LLM-only KHS parser for Telkom University academic summaries.

Text-based KHS PDFs are extracted with PyMuPDF, redacted for PII, then parsed
by DeepSeek V4 Flash into strict structured JSON. Course extraction is not
rule-based: every course, grade, SKS, IPS, and final IPK/SKS field must come
from the LLM parser output and pass validation before it is cached.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, TypedDict

import fitz  # PyMuPDF

from backend.utils.llm_client import (
    EmptyLLMResponseError,
    LLMJsonError,
    call_khs_llm_parser,
)

logger = logging.getLogger(__name__)


KHS_PARSER_VERSION = "telkom_khs_llm_v1"
KHS_LLM_MODEL = "deepseek-v4-flash"
MACHINE_UNREADABLE_ERROR = (
    "KHS PDF has no extractable text; OCR/manual review required"
)

_GRADE_VALUES = {"A", "AB", "B", "BC", "C", "D", "E", "T", "K"}


class IpsHistoryRow(TypedDict, total=False):
    term_label: str | None
    ips: float | None
    total_sks: int | None


class CourseRow(TypedDict, total=False):
    code: str | None
    name_id: str | None
    name_en: str | None
    sks: int | None
    grade: str | None
    term_label: str | None
    status: str
    is_completed: bool
    # Backward-compatible aliases used by older callers/tests.
    name: str | None
    semester: int | None


class KhsResult(TypedDict, total=False):
    ipk_final: float | None
    total_sks_final: int | None
    ips_history: list[IpsHistoryRow]
    courses: list[CourseRow]
    ongoing_courses: list[CourseRow]
    parse_warning: str | None
    parse_error: str
    parser_version: str
    # Backward-compatible aliases.
    ipk: float | None
    total_sks: int | None
    relevant_courses: list[CourseRow]


KHS_LLM_SYSTEM_PROMPT = """Kamu adalah parser KHS Telkom University.

Tugasmu hanya mengubah teks KHS yang sudah direduksi PII menjadi JSON akademik
terstruktur. Jangan mengarang mata kuliah, nilai, SKS, IPS, IPK, atau data lain.
Ambil hanya data yang eksplisit tersedia pada teks.

ATURAN OUTPUT (WAJIB):
- Return only a valid JSON object.
- Do not include markdown.
- Do not include explanation.
- Do not use code fences.
- The first character of your response must be `{` and the last character must be `}`.

ATURAN:
1. Respons harus JSON valid saja, tanpa markdown, tanpa komentar, tanpa teks tambahan.
2. Jika nilai mata kuliah kosong, set grade=null, status="ongoing", is_completed=false.
3. Jika nilai A/AB/B/BC/C/D/E/T/K tersedia, set status="completed", is_completed=true.
4. Pisahkan nama mata kuliah Indonesia dan Inggris jika keduanya tersedia.
5. Angka pada nama mata kuliah seperti "FISIKA 1", "KALKULUS 1", atau "FISIKA 2" bukan SKS.
6. SKS adalah angka pada kolom SKS, bukan angka yang muncul di nama mata kuliah.
7. IPK final dan total SKS final harus diambil dari ringkasan akhir jika tersedia.
8. Jika suatu field tidak eksplisit tersedia, isi null atau array kosong.
9. ips_history hanya untuk semester yang punya IPS final eksplisit. Jika semester sedang berjalan atau belum punya nilai final, jangan masukkan ke ips_history dan jangan set ips=0.0 (gunakan null atau hilangkan barisnya).

Schema wajib:
{
  "ipk_final": number | null,
  "total_sks_final": number | null,
  "ips_history": [
    {
      "term_label": string,
      "ips": number | null,
      "total_sks": number | null
    }
  ],
  "courses": [
    {
      "code": string | null,
      "name_id": string | null,
      "name_en": string | null,
      "sks": number | null,
      "grade": "A" | "AB" | "B" | "BC" | "C" | "D" | "E" | "T" | "K" | null,
      "term_label": string | null,
      "status": "completed" | "ongoing",
      "is_completed": boolean
    }
  ],
  "ongoing_courses": [],
  "parse_warning": string | null,
  "parser_version": "telkom_khs_llm_v1"
}"""


def parse_khs(file_path: str) -> KhsResult:
    """Parse a text-based KHS PDF through the LLM parser."""
    if not os.path.exists(file_path):
        return _empty_result("file not found")

    try:
        text = _extract_pdf_text(file_path)
    except Exception as exc:  # noqa: BLE001 - PyMuPDF raises varied errors
        return _empty_result(f"pdf extraction failed: {exc.__class__.__name__}")

    return parse_khs_text(text)


def parse_khs_text(text: str | None) -> KhsResult:
    """Parse extracted KHS text through DeepSeek V4 Flash after PII redaction.

    Never raises: every failure mode maps to a ``parse_error`` (or
    ``machine_unreadable``) result so the background task can persist a clear
    ``processing_status`` instead of crashing.
    """
    raw_text = _normalize_text(text or "")
    if not raw_text.strip():
        # Guard: do not call the LLM when there is no extractable text.
        logger.info("KHS text empty; skipping LLM call (machine_unreadable)")
        return _empty_result(MACHINE_UNREADABLE_ERROR)

    redacted_text = redact_khs_pii(raw_text)

    try:
        llm_payload = call_khs_llm_parser(
            system_prompt=KHS_LLM_SYSTEM_PROMPT,
            user_prompt=_build_khs_user_prompt(redacted_text),
            model=KHS_LLM_MODEL,
            temperature=0.0,
            max_tokens=8192,
        )
    except EmptyLLMResponseError as exc:
        logger.warning("KHS LLM returned empty content: %s", exc)
        return _empty_result("LLM returned empty content")
    except LLMJsonError as exc:
        logger.warning("KHS LLM returned invalid JSON: %s", exc)
        return _empty_result(f"LLM returned invalid JSON: {exc}")
    except Exception as exc:  # noqa: BLE001 - parser must degrade gracefully
        logger.warning("KHS LLM parser call failed: %s: %s", exc.__class__.__name__, exc)
        return _empty_result(f"LLM parser call failed: {exc.__class__.__name__}: {exc}")

    try:
        return validate_khs_llm_result(llm_payload)
    except ValueError as exc:
        logger.warning("KHS LLM JSON failed validation: %s", exc)
        return _empty_result(f"LLM JSON failed validation: {exc}")


def redact_khs_pii(text: str) -> str:
    """Redact identity fields before sending KHS text to the LLM parser."""
    redacted = text
    redacted = re.sub(r"https?://\S+", "[REDACTED_URL]", redacted, flags=re.IGNORECASE)
    redacted = re.sub(r"\bwww\.\S+", "[REDACTED_URL]", redacted, flags=re.IGNORECASE)
    redacted = re.sub(r"\bigracias\S*", "[REDACTED_URL]", redacted, flags=re.IGNORECASE)

    line_patterns = [
        r"(?im)^(\s*(?:nama(?:\s+mahasiswa)?|student\s+name)\s*[:=]\s*).*$",
        r"(?im)^(\s*(?:nim|student\s+id|nomor\s+induk\s+mahasiswa)\s*[:=]\s*).*$",
        r"(?im)^(\s*(?:dosen\s+wali|wali\s+akademik|academic\s+advisor)\s*[:=]\s*).*$",
        r"(?im)^(\s*(?:tanggal\s+cetak|waktu\s+cetak|printed\s+at|print\s+date)\s*[:=]\s*).*$",
    ]
    for pattern in line_patterns:
        redacted = re.sub(pattern, r"\1[REDACTED]", redacted)

    redacted = re.sub(
        r"(?i)\b(?:nim|student\s+id)\s*[:=]?\s*\d{8,20}\b",
        "NIM: [REDACTED]",
        redacted,
    )
    redacted = re.sub(
        r"(?i)\b(token|session|sid|auth|signature|key|code)\s*[:=]\s*[A-Za-z0-9._~+/=-]{8,}",
        r"\1: [REDACTED_TOKEN]",
        redacted,
    )
    redacted = re.sub(
        r"\b[A-Za-z0-9_-]{24,}\b",
        "[REDACTED_TOKEN]",
        redacted,
    )
    redacted = re.sub(
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?\b",
        "[REDACTED_TIMESTAMP]",
        redacted,
    )
    redacted = re.sub(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        "[REDACTED_EMAIL]",
        redacted,
    )
    # Indonesian mobile numbers (e.g. 08xx, +628xx, 628xx). Kept narrow to the
    # mobile prefix so NIM/SKS numbers are not clobbered.
    redacted = re.sub(
        r"\b(?:\+?62|0)8\d{7,12}\b",
        "[REDACTED_PHONE]",
        redacted,
    )
    return redacted


def validate_khs_llm_result(payload: Any) -> KhsResult:
    """Validate and normalize a raw LLM JSON payload into ``KhsResult``."""
    if not isinstance(payload, dict):
        raise ValueError("LLM response must be a JSON object")

    parser_version = payload.get("parser_version")
    if parser_version != KHS_PARSER_VERSION:
        raise ValueError(
            f"parser_version must be {KHS_PARSER_VERSION}, got {parser_version!r}"
        )

    ipk_final = _number_or_null(payload.get("ipk_final"), "ipk_final", 0.0, 4.0)
    total_sks_final = _int_or_null(
        payload.get("total_sks_final"),
        "total_sks_final",
        0,
        300,
    )
    ips_history = _validate_ips_history(payload.get("ips_history"))
    courses = _validate_courses(payload.get("courses"))
    _validate_ongoing_subset(payload.get("ongoing_courses"), courses)
    ongoing_courses = [course for course in courses if course.get("grade") is None]
    parse_warning = _string_or_null(payload.get("parse_warning"), "parse_warning")

    result: KhsResult = {
        "ipk_final": ipk_final,
        "total_sks_final": total_sks_final,
        "ips_history": ips_history,
        "courses": courses,
        "ongoing_courses": ongoing_courses,
        "parse_warning": parse_warning,
        "parser_version": KHS_PARSER_VERSION,
        # Backward-compatible aliases.
        "ipk": ipk_final,
        "total_sks": total_sks_final,
        "relevant_courses": [course for course in courses if course.get("is_completed")],
    }
    return result


def format_khs_summary(result: KhsResult | None, *, max_courses: int = 12) -> str:
    """Render structured KHS data for the scoring prompt."""
    if not result or result.get("parse_error"):
        return "KHS tidak tersedia atau gagal diparse."

    ipk = result.get("ipk_final", result.get("ipk"))
    total_sks = result.get("total_sks_final", result.get("total_sks"))
    courses = result.get("courses") or []
    completed = [course for course in courses if course.get("is_completed")]
    ongoing = result.get("ongoing_courses") or [
        course for course in courses if not course.get("is_completed")
    ]

    lines = [
        f"IPK final: {_format_float(ipk)}",
        f"Total SKS final: {total_sks if total_sks is not None else '-'}",
    ]

    ips_history = result.get("ips_history") or []
    if ips_history:
        terms = []
        for row in ips_history[:8]:
            term = row.get("term_label") or "Term"
            ips = _format_float(row.get("ips"))
            sks = row.get("total_sks")
            sks_text = f", {sks} SKS" if sks is not None else ""
            terms.append(f"{term}: IPS {ips}{sks_text}")
        lines.append("Riwayat IPS: " + "; ".join(terms))
    else:
        lines.append("Riwayat IPS: -")

    if completed:
        course_parts = [_format_course_for_summary(course) for course in completed[:max_courses]]
        lines.append("Mata kuliah selesai: " + "; ".join(course_parts))
    else:
        lines.append("Mata kuliah selesai: -")

    if ongoing:
        ongoing_parts = [
            _format_course_for_summary(course, include_grade=False)
            for course in ongoing[:6]
        ]
        lines.append(
            "Mata kuliah ongoing/belum dinilai: "
            + "; ".join(ongoing_parts)
            + ". Nilai kosong/ongoing tidak boleh dihitung sebagai bukti performa."
        )

    if result.get("parse_warning"):
        lines.append(f"Catatan parser: {result['parse_warning']}")

    return "\n".join(lines)


def build_khs_cache_payload(
    parsed: KhsResult,
    *,
    processing_status: str | None = None,
    processing_error: str | None = None,
    source: str | None = None,
    scoring: dict | None = None,
) -> dict:
    """Build the JSON wrapper stored in CandidateDocument.sections_json."""
    payload = {
        "parsed_khs": parsed,
        "processing_status": processing_status or khs_processing_status(parsed),
        "processing_error": processing_error
        if processing_error is not None
        else parsed.get("parse_error"),
        "parser_version": KHS_PARSER_VERSION,
        "source": source or "llm_parser",
        "model": KHS_LLM_MODEL,
    }
    if scoring:
        payload["last_scoring"] = scoring
    return payload


def khs_processing_status(parsed: KhsResult | None) -> str:
    if not parsed:
        return "parse_error"
    error = parsed.get("parse_error")
    if not error:
        return "parsed"
    if error == MACHINE_UNREADABLE_ERROR or "machine_unreadable" in error.lower():
        return "machine_unreadable"
    return "parse_error"


def khs_parse_error(error: str) -> KhsResult:
    """Build a KHS parse-error payload for service-level failures."""
    return _empty_result(error)


def parsed_khs_from_cache(sections_json: dict | None) -> KhsResult | None:
    """Return parsed KHS from a CandidateDocument.sections_json payload."""
    if not isinstance(sections_json, dict):
        return None
    parsed = sections_json.get("parsed_khs")
    if isinstance(parsed, dict):
        return parsed
    if any(key in sections_json for key in ("ipk_final", "courses", "parse_error")):
        return sections_json
    return None


def khs_cache_scoring_metadata(sections_json: dict | None) -> dict:
    """Return last scoring metadata from cached KHS sections JSON."""
    if not isinstance(sections_json, dict):
        return {}
    metadata = sections_json.get("last_scoring")
    return metadata if isinstance(metadata, dict) else {}


def _extract_pdf_text(file_path: str) -> str:
    with fitz.open(file_path) as doc:
        return "\n".join(page.get_text("text") or "" for page in doc)


def _build_khs_user_prompt(redacted_text: str) -> str:
    return f"""Parse teks KHS berikut menjadi strict JSON sesuai schema.

TEKS KHS SUDAH DIREDAKSI PII:
{redacted_text}
"""


def _empty_result(error: str) -> KhsResult:
    return {
        "ipk_final": None,
        "total_sks_final": None,
        "ips_history": [],
        "courses": [],
        "ongoing_courses": [],
        "parse_error": error,
        "parser_version": KHS_PARSER_VERSION,
        # Backward-compatible aliases.
        "ipk": None,
        "total_sks": None,
        "relevant_courses": [],
    }


def _normalize_text(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    return text


def _validate_ips_history(raw_rows: Any) -> list[IpsHistoryRow]:
    if raw_rows is None:
        raise ValueError("ips_history must be an array")
    if not isinstance(raw_rows, list):
        raise ValueError("ips_history must be an array")

    rows: list[IpsHistoryRow] = []
    for index, raw in enumerate(raw_rows):
        if not isinstance(raw, dict):
            raise ValueError(f"ips_history[{index}] must be an object")
        ips = _number_or_null(
            raw.get("ips"),
            f"ips_history[{index}].ips",
            0.0,
            4.0,
        )
        # IPS history only carries semesters with an explicit final IPS. An
        # ongoing/not-yet-graded semester has no final IPS, and a literal 0.0 is
        # treated as a missing-value placeholder rather than a real final IPS.
        if ips is None or ips == 0.0:
            continue
        rows.append(
            {
                "term_label": _string_or_null(
                    raw.get("term_label"),
                    f"ips_history[{index}].term_label",
                ),
                "ips": ips,
                "total_sks": _int_or_null(
                    raw.get("total_sks"),
                    f"ips_history[{index}].total_sks",
                    0,
                    30,
                ),
            }
        )
    return rows


def _validate_courses(raw_courses: Any) -> list[CourseRow]:
    if raw_courses is None:
        raise ValueError("courses must be an array")
    if not isinstance(raw_courses, list):
        raise ValueError("courses must be an array")

    courses: list[CourseRow] = []
    for index, raw in enumerate(raw_courses):
        course = _validate_course(raw, f"courses[{index}]")
        if (
            course.get("code") is None
            and course.get("name_id") is None
            and course.get("name_en") is None
        ):
            continue
        courses.append(course)
    return courses


def _validate_course(raw: Any, path: str) -> CourseRow:
    if not isinstance(raw, dict):
        raise ValueError(f"{path} must be an object")

    grade = _grade_or_null(raw.get("grade"), f"{path}.grade")
    expected_completed = grade is not None
    is_completed = raw.get("is_completed")
    if not isinstance(is_completed, bool):
        raise ValueError(f"{path}.is_completed must be boolean")
    if is_completed is not expected_completed:
        raise ValueError(
            f"{path}.is_completed must be {expected_completed} when grade is {grade!r}"
        )

    status = raw.get("status")
    expected_status = "completed" if expected_completed else "ongoing"
    if status != expected_status:
        raise ValueError(f"{path}.status must be {expected_status!r}")

    name_id = _string_or_null(raw.get("name_id"), f"{path}.name_id")
    name_en = _string_or_null(raw.get("name_en"), f"{path}.name_en")
    code = _string_or_null(raw.get("code"), f"{path}.code")
    sks = _int_or_null(raw.get("sks"), f"{path}.sks", 1, 6)
    term_label = _string_or_null(raw.get("term_label"), f"{path}.term_label")

    return {
        "code": code,
        "name_id": name_id,
        "name_en": name_en,
        "sks": sks,
        "grade": grade,
        "term_label": term_label,
        "status": expected_status,
        "is_completed": expected_completed,
        "name": name_id or name_en,
        "semester": _semester_from_term(term_label),
    }


def _validate_ongoing_subset(raw_ongoing: Any, courses: list[CourseRow]) -> None:
    if raw_ongoing is None:
        raise ValueError("ongoing_courses must be an array")
    if not isinstance(raw_ongoing, list):
        raise ValueError("ongoing_courses must be an array")

    ongoing_keys = {
        _course_key(course)
        for course in courses
        if course.get("grade") is None
    }
    for index, raw in enumerate(raw_ongoing):
        course = _validate_course(raw, f"ongoing_courses[{index}]")
        if course.get("grade") is not None:
            raise ValueError(f"ongoing_courses[{index}] must have grade null")
        if _course_key(course) not in ongoing_keys:
            raise ValueError(f"ongoing_courses[{index}] must be a subset of courses")


def _course_key(course: CourseRow) -> tuple[str | None, str | None, str | None, str | None]:
    return (
        course.get("code"),
        course.get("name_id"),
        course.get("name_en"),
        course.get("term_label"),
    )


def _number_or_null(value: Any, path: str, minimum: float, maximum: float) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{path} must be a number or null")
    number = float(value)
    if number < minimum or number > maximum:
        raise ValueError(f"{path} must be between {minimum} and {maximum}")
    return round(number, 2)


def _int_or_null(value: Any, path: str, minimum: int, maximum: int) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{path} must be an integer or null")
    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"{path} must be an integer or null")
    integer = int(value)
    if integer < minimum or integer > maximum:
        raise ValueError(f"{path} must be between {minimum} and {maximum}")
    return integer


def _string_or_null(value: Any, path: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{path} must be a string or null")
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None


def _grade_or_null(value: Any, path: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{path} must be a grade string or null")
    grade = value.strip().upper()
    if grade == "":
        return None
    if grade not in _GRADE_VALUES:
        raise ValueError(f"{path} must be one of {sorted(_GRADE_VALUES)} or null")
    return grade


def _semester_from_term(term_label: str | None) -> int | None:
    if not term_label:
        return None
    match = re.search(r"\bsemester\s+([1-9]|1[0-4])\b", term_label, re.IGNORECASE)
    return int(match.group(1)) if match else None


def _format_float(value: float | int | None) -> str:
    if isinstance(value, (float, int)):
        return f"{float(value):.2f}"
    return "-"


def _format_course_for_summary(course: CourseRow, *, include_grade: bool = True) -> str:
    name = course.get("name_id") or course.get("name_en") or course.get("name") or "-"
    if course.get("name_id") and course.get("name_en"):
        name = f"{course['name_id']} / {course['name_en']}"
    parts = []
    if course.get("code"):
        parts.append(str(course["code"]))
    parts.append(name)
    if course.get("sks") is not None:
        parts.append(f"{course['sks']} SKS")
    if include_grade and course.get("grade"):
        parts.append(f"nilai {course['grade']}")
    if course.get("term_label"):
        parts.append(str(course["term_label"]))
    return " - ".join(parts)
