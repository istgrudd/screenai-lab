"""Smoke test for Phase 2 Task 7 parsers.

Covers:
  * khs_parser.parse_khs + format_khs_summary — happy path, missing fields,
    graceful fallback on non-PDF / non-existent input.
  * ktm_validator.validate_ktm — image path, PDF with no NIM, PDF with a
    valid NIM, and NIM cross-check mismatch.
  * seed_division_rubrics — idempotency check against the live SQLite DB.

Uses PyMuPDF to synthesise the test PDFs so the test is self-contained
(no fixture files needed).
"""

from __future__ import annotations

import os
import sys
import tempfile

import fitz

# Make "backend.*" importable when run as a script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.models.application import Division
from backend.models.rubric import Rubric
from backend.services.khs_parser import format_khs_summary, parse_khs
from backend.services.ktm_validator import validate_ktm
from backend.services.rubric_seeding import seed_division_rubrics


PASS = "[PASS]"
FAIL = "[FAIL]"


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _make_pdf(path: str, text: str) -> None:
    """Write a single-page PDF containing the given text."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text, fontsize=10)
    doc.save(path)
    doc.close()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

KHS_TEXT = """\
TRANSKRIP AKADEMIK
Nama: [REDACTED]
NIM: 1031234567890
Fakultas: Fakultas Informatika
Program Studi: Data Science

CII3A3  Machine Learning            3   A    5
CII3B3  Big Data Analytics          3   B    6
CII2A3  Struktur Data               3   AB   3
CII1A2  Pemrograman Dasar           2   A    1

IPK: 3.75
Total SKS: 120
"""

KHS_UNRECOGNIZED_TEXT = """\
Just some random document with no KHS structure at all.
Lorem ipsum dolor sit amet.
"""

KTM_VALID_TEXT = """\
KARTU TANDA MAHASISWA
Telkom University
Nama: Budi Santoso
NIM: 1031234567890
Fakultas: Fakultas Informatika
Program Studi: Data Science
"""

KTM_NO_NIM_TEXT = """\
KARTU TANDA MAHASISWA
Telkom University
Nama: Tanpa NIM
Fakultas: Fakultas Informatika
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_khs(tmpdir: str) -> int:
    failures = 0
    khs_path = os.path.join(tmpdir, "khs_ok.pdf")
    _make_pdf(khs_path, KHS_TEXT)

    r = parse_khs(khs_path)
    print(f"     -> parse_khs(ok): {r}")
    failures += _assert(r.get("ipk") == 3.75, "khs happy path: IPK parsed as 3.75")
    failures += _assert(r.get("total_sks") == 120, "khs happy path: Total SKS parsed as 120")
    failures += _assert(
        len(r.get("relevant_courses", [])) >= 3,
        f"khs happy path: >=3 courses parsed (got {len(r.get('relevant_courses', []))})",
    )
    failures += _assert(
        "parse_error" not in r, "khs happy path: no parse_error on valid input"
    )

    summary = format_khs_summary(r)
    print(f"     -> format_khs_summary: {summary!r}")
    failures += _assert(
        summary.startswith("IPK: 3.75 | Total SKS: 120 | Relevant Courses:"),
        "khs summary: header format matches spec",
    )

    # Unrecognised layout — should return parse_error, not raise.
    unk_path = os.path.join(tmpdir, "khs_bad.pdf")
    _make_pdf(unk_path, KHS_UNRECOGNIZED_TEXT)
    r2 = parse_khs(unk_path)
    print(f"     -> parse_khs(unrecognized): {r2}")
    failures += _assert(
        r2.get("parse_error") == "unrecognized format",
        "khs graceful: unrecognized format returns parse_error",
    )
    failures += _assert(
        r2.get("ipk") is None and r2.get("relevant_courses") == [],
        "khs graceful: empty payload on bad layout",
    )

    # Missing file — no exception raised.
    r3 = parse_khs(os.path.join(tmpdir, "nope.pdf"))
    print(f"     -> parse_khs(missing): {r3}")
    failures += _assert(
        r3.get("parse_error") == "file not found",
        "khs graceful: missing file returns file-not-found",
    )
    return failures


def test_ktm(tmpdir: str) -> int:
    failures = 0

    # PDF with valid NIM
    valid = os.path.join(tmpdir, "ktm_valid.pdf")
    _make_pdf(valid, KTM_VALID_TEXT)

    r = validate_ktm(valid)
    print(f"     -> validate_ktm(valid): {r}")
    failures += _assert(r.get("valid") is True, "ktm valid: NIM detected, valid=true")
    failures += _assert(r.get("nim") == "1031234567890", "ktm valid: NIM extracted exactly")

    # Cross-check mismatch
    r2 = validate_ktm(valid, expected_nim="1039999999999")
    print(f"     -> validate_ktm(mismatch): {r2}")
    failures += _assert(r2.get("valid") is False, "ktm mismatch: valid=false on NIM mismatch")
    failures += _assert("warning" in r2, "ktm mismatch: warning message present")

    # PDF with no NIM
    no_nim = os.path.join(tmpdir, "ktm_no_nim.pdf")
    _make_pdf(no_nim, KTM_NO_NIM_TEXT)
    r3 = validate_ktm(no_nim)
    print(f"     -> validate_ktm(no NIM): {r3}")
    failures += _assert(r3.get("valid") is False, "ktm no NIM: valid=false")
    failures += _assert("error" in r3, "ktm no NIM: error message present")

    # Image path
    img_path = os.path.join(tmpdir, "ktm.jpg")
    with open(img_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0")  # fake JPG header — validator shouldn't even open it
    r4 = validate_ktm(img_path)
    print(f"     -> validate_ktm(image): {r4}")
    failures += _assert(r4.get("valid") is False, "ktm image: valid=false")
    failures += _assert(
        "manual verification" in (r4.get("error") or ""),
        "ktm image: error indicates manual verification required",
    )
    return failures


def test_seed() -> int:
    failures = 0
    db = SessionLocal()
    try:
        # Idempotency: running twice should not create duplicates.
        first = seed_division_rubrics(db)
        second = seed_division_rubrics(db)
        print(f"     -> seed pass 1 created: {first}")
        print(f"     -> seed pass 2 created: {second}")
        failures += _assert(second == [], "seed idempotent: second run creates nothing")

        for div in Division:
            count = db.query(Rubric).filter(Rubric.division == div.value).count()
            failures += _assert(count >= 1, f"seed coverage: at least one rubric for {div.value}")
    finally:
        db.close()
    return failures


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        print("\n-- KHS parser ----------------------------------------")
        failures += test_khs(tmp)
        print("\n-- KTM validator -------------------------------------")
        failures += test_ktm(tmp)
    print("\n-- Rubric seeding ------------------------------------")
    failures += test_seed()

    print()
    if failures == 0:
        print("All phase-2 parser smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")
    return failures


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
