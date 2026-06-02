"""Smoke test for Phase 2 parser utilities.

Covers:
  * khs_parser.parse_khs + format_khs_summary with mocked LLM parsing.
  * KHS PII redaction before the mocked LLM call.
  * strict KHS JSON validation and machine_unreadable handling.
  * ktm_validator.validate_ktm.
  * seed_division_rubrics idempotency.

Run:
    python -m scripts.smoke_test_phase2_parsers
"""

from __future__ import annotations

import copy
import os
import sys
import tempfile

import fitz

# Make "backend.*" importable when run as a script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import backend.services.khs_parser as khs_parser
import backend.utils.llm_client as llm_client
from backend.database import SessionLocal
from backend.models.application import Division
from backend.models.rubric import Rubric
from backend.services.khs_parser import (
    KHS_LLM_MODEL,
    MACHINE_UNREADABLE_ERROR,
    build_khs_cache_payload,
    format_khs_summary,
    parse_khs,
)
from backend.services.ktm_validator import validate_ktm
from backend.services.rubric_seeding import seed_division_rubrics
from backend.utils.llm_client import (
    EmptyLLMResponseError,
    LLMJsonError,
    call_khs_llm_parser,
)


PASS = "[PASS]"
FAIL = "[FAIL]"


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _make_pdf(path: str, text: str) -> None:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text, fontsize=10)
    doc.save(path)
    doc.close()


def _make_blank_pdf(path: str) -> None:
    doc = fitz.open()
    page = doc.new_page()
    page.draw_rect(fitz.Rect(50, 50, 250, 180), color=(0, 0, 0))
    doc.save(path)
    doc.close()


KHS_TEXT = """\
KARTU HASIL STUDI
Nama : Smoke Candidate
NIM : 1039876500001
Dosen Wali : Dr. Private Advisor
Program Studi : S1 Informatika
URL : https://igracias.telkomuniversity.ac.id/khs?token=abcdef1234567890abcdef
Tanggal Cetak : 01/06/2026 10:45:12

2024/2025 - GANJIL
Kode Mata Kuliah Nama Mata Kuliah SKS Nilai
AZK1BAB3 FISIKA 1 PHYSICS 1 3 A Lulus
AZK1AAB3 KALKULUS 1 CALCULUS 1 4 AB Lulus
AZK1DAB3 ALGORITMA DAN PEMROGRAMAN ALGORITHMS AND PROGRAMMING 3 B Lulus
AZK1GAB3 FISIKA 2 PHYSICS 2 3 Belum
Jumlah SKS : 13 SKS IPS 3.59

Ringkasan
Jumlah SKS : 105 SKS IPK : 3.46
"""

VALID_KHS_LLM_RESPONSE = {
    "ipk_final": 3.46,
    "total_sks_final": 105,
    "ips_history": [
        {"term_label": "2024/2025 - GANJIL", "ips": 3.59, "total_sks": 13}
    ],
    "courses": [
        {
            "code": "AZK1BAB3",
            "name_id": "FISIKA 1",
            "name_en": "PHYSICS 1",
            "sks": 3,
            "grade": "A",
            "term_label": "2024/2025 - GANJIL",
            "status": "completed",
            "is_completed": True,
        },
        {
            "code": "AZK1AAB3",
            "name_id": "KALKULUS 1",
            "name_en": "CALCULUS 1",
            "sks": 4,
            "grade": "AB",
            "term_label": "2024/2025 - GANJIL",
            "status": "completed",
            "is_completed": True,
        },
        {
            "code": "AZK1DAB3",
            "name_id": "ALGORITMA DAN PEMROGRAMAN",
            "name_en": "ALGORITHMS AND PROGRAMMING",
            "sks": 3,
            "grade": "B",
            "term_label": "2024/2025 - GANJIL",
            "status": "completed",
            "is_completed": True,
        },
        {
            "code": "AZK1GAB3",
            "name_id": "FISIKA 2",
            "name_en": "PHYSICS 2",
            "sks": 3,
            "grade": None,
            "term_label": "2024/2025 - GANJIL",
            "status": "ongoing",
            "is_completed": False,
        },
    ],
    "ongoing_courses": [
        {
            "code": "AZK1GAB3",
            "name_id": "FISIKA 2",
            "name_en": "PHYSICS 2",
            "sks": 3,
            "grade": None,
            "term_label": "2024/2025 - GANJIL",
            "status": "ongoing",
            "is_completed": False,
        }
    ],
    "parse_warning": None,
    "parser_version": "telkom_khs_llm_v1",
}

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


def test_khs(tmpdir: str) -> int:
    failures = 0
    khs_path = os.path.join(tmpdir, "khs_ok.pdf")
    _make_pdf(khs_path, KHS_TEXT)

    calls: list[dict] = []
    original_call_khs_llm_parser = khs_parser.call_khs_llm_parser

    def set_fake_llm(response_or_error) -> None:
        calls.clear()

        def fake_call_khs_llm_parser(**kwargs):
            calls.append(kwargs)
            if isinstance(response_or_error, Exception):
                raise response_or_error
            return copy.deepcopy(response_or_error)

        khs_parser.call_khs_llm_parser = fake_call_khs_llm_parser

    def mutate_valid(mutator):
        payload = copy.deepcopy(VALID_KHS_LLM_RESPONSE)
        mutator(payload)
        return payload

    try:
        set_fake_llm(VALID_KHS_LLM_RESPONSE)
        r = parse_khs(khs_path)
        print(f"     -> parse_khs(llm valid): {r}")
        failures += _assert(len(calls) == 1, "khs llm: text-based PDF calls LLM parser")
        failures += _assert(
            calls[0].get("model") == KHS_LLM_MODEL,
            "khs llm: uses DeepSeek V4 Flash model",
        )
        prompt = calls[0].get("user_prompt", "")
        failures += _assert(
            "Smoke Candidate" not in prompt
            and "1039876500001" not in prompt
            and "Private Advisor" not in prompt
            and "igracias" not in prompt.lower(),
            "khs llm: PII redacted before LLM parser call",
        )
        failures += _assert(
            r.get("ipk_final") == 3.46 and r.get("total_sks_final") == 105,
            "khs llm: final IPK and total SKS come from valid JSON",
        )
        by_code = {course.get("code"): course for course in r.get("courses", [])}
        failures += _assert(
            by_code.get("AZK1BAB3", {}).get("grade") == "A"
            and by_code.get("AZK1AAB3", {}).get("grade") == "AB"
            and by_code.get("AZK1DAB3", {}).get("grade") == "B",
            "khs llm: grades A/AB/B accepted from LLM JSON",
        )
        failures += _assert(
            by_code.get("AZK1BAB3", {}).get("sks") == 3
            and by_code.get("AZK1AAB3", {}).get("sks") == 4
            and by_code.get("AZK1GAB3", {}).get("sks") == 3,
            "khs llm: FISIKA 1/KALKULUS 1 digits do not alter SKS",
        )
        failures += _assert(
            by_code.get("AZK1BAB3", {}).get("name_id") == "FISIKA 1"
            and by_code.get("AZK1BAB3", {}).get("name_en") == "PHYSICS 1",
            "khs llm: Indonesian and English course names preserved separately",
        )
        failures += _assert(
            by_code.get("AZK1GAB3", {}).get("is_completed") is False
            and len(r.get("ongoing_courses", [])) == 1,
            "khs llm: only blank-grade course is ongoing",
        )
        failures += _assert(
            r.get("ips_history")
            and r["ips_history"][0].get("ips") == 3.59
            and r["ips_history"][0].get("total_sks") == 13,
            "khs llm: IPS history accepted from valid JSON",
        )

        def add_ongoing_ips_rows(payload):
            payload["ips_history"].append(
                {"term_label": "2025/2026 - GANJIL", "ips": 0.0, "total_sks": 9}
            )
            payload["ips_history"].append(
                {"term_label": "2025/2026 - GENAP", "ips": None, "total_sks": 6}
            )

        set_fake_llm(mutate_valid(add_ongoing_ips_rows))
        r_ips = parse_khs(khs_path)
        ips_terms = {row.get("term_label") for row in r_ips.get("ips_history", [])}
        failures += _assert(
            len(r_ips.get("ips_history", [])) == 1
            and "2024/2025 - GANJIL" in ips_terms,
            "khs llm: ips_history keeps only semesters with explicit final IPS",
        )
        failures += _assert(
            "2025/2026 - GANJIL" not in ips_terms
            and "2025/2026 - GENAP" not in ips_terms,
            "khs llm: ongoing/zero IPS semesters are dropped (no IPS=0.0)",
        )
        set_fake_llm(VALID_KHS_LLM_RESPONSE)
        r = parse_khs(khs_path)

        summary = format_khs_summary(r)
        print(f"     -> format_khs_summary: {summary!r}")
        failures += _assert(
            summary.startswith("IPK final: 3.46"),
            "khs summary: structured header format matches spec",
        )

        payload = build_khs_cache_payload(r)
        failures += _assert(
            payload.get("processing_status") == "parsed"
            and payload.get("source") == "llm_parser"
            and payload.get("model") == KHS_LLM_MODEL,
            "khs cache: valid JSON stored with parsed wrapper metadata",
        )

        blank_path = os.path.join(tmpdir, "khs_image_like.pdf")
        _make_blank_pdf(blank_path)
        r_blank = parse_khs(blank_path)
        print(f"     -> parse_khs(image-like): {r_blank}")
        failures += _assert(
            len(calls) == 1,
            "khs graceful: empty raw_text does not call LLM parser",
        )
        failures += _assert(
            r_blank.get("parse_error") == MACHINE_UNREADABLE_ERROR,
            "khs graceful: image-based/no-text-layer PDF returns machine_unreadable error",
        )
        failures += _assert(
            build_khs_cache_payload(r_blank).get("processing_status") == "machine_unreadable",
            "khs cache: image-based/no-text-layer PDF stores machine_unreadable status",
        )

        set_fake_llm(LLMJsonError("Response is not valid JSON. Preview: 'oops'"))
        r_invalid_json = parse_khs(khs_path)
        print(f"     -> parse_khs(invalid json): {r_invalid_json}")
        failures += _assert(
            "invalid JSON" in (r_invalid_json.get("parse_error") or ""),
            "khs validation: invalid JSON maps to parse_error",
        )
        failures += _assert(
            khs_parser.khs_processing_status(r_invalid_json) == "parse_error",
            "khs validation: invalid JSON status is parse_error",
        )

        set_fake_llm(EmptyLLMResponseError("LLM returned empty content. finish_reason='length'"))
        r_empty_llm = parse_khs(khs_path)
        print(f"     -> parse_khs(empty content): {r_empty_llm}")
        failures += _assert(
            r_empty_llm.get("parse_error") == "LLM returned empty content",
            "khs graceful: empty LLM content maps to parse_error (no crash)",
        )
        failures += _assert(
            khs_parser.khs_processing_status(r_empty_llm) == "parse_error",
            "khs graceful: empty LLM content status is parse_error",
        )

        set_fake_llm(mutate_valid(lambda payload: payload.update({"ipk_final": 4.5})))
        r_bad_ipk = parse_khs(khs_path)
        failures += _assert(
            "ipk_final" in (r_bad_ipk.get("parse_error") or ""),
            "khs validation: invalid IPK is rejected",
        )

        set_fake_llm(mutate_valid(lambda payload: payload["courses"][0].update({"sks": 9})))
        r_bad_sks = parse_khs(khs_path)
        failures += _assert(
            "sks" in (r_bad_sks.get("parse_error") or ""),
            "khs validation: invalid course SKS is rejected",
        )

        set_fake_llm(mutate_valid(lambda payload: payload["courses"][0].update({"grade": "A+"})))
        r_bad_grade = parse_khs(khs_path)
        failures += _assert(
            "grade" in (r_bad_grade.get("parse_error") or ""),
            "khs validation: invalid grade is rejected",
        )

        r_missing = parse_khs(os.path.join(tmpdir, "nope.pdf"))
        print(f"     -> parse_khs(missing): {r_missing}")
        failures += _assert(
            r_missing.get("parse_error") == "file not found",
            "khs graceful: missing file returns file-not-found",
        )
    finally:
        khs_parser.call_khs_llm_parser = original_call_khs_llm_parser

    return failures


class _FakeMessage:
    def __init__(self, content):
        self.content = content

    def __repr__(self):
        return f"_FakeMessage(content={self.content!r})"


class _FakeChoice:
    def __init__(self, content, finish_reason="stop"):
        self.message = _FakeMessage(content)
        self.finish_reason = finish_reason


class _FakeResponse:
    def __init__(self, content, finish_reason="stop"):
        self.choices = [_FakeChoice(content, finish_reason)]


class _FakeCompletions:
    def __init__(self, content, finish_reason, reject_thinking):
        self._content = content
        self._finish_reason = finish_reason
        self._reject_thinking = reject_thinking
        self.create_calls: list[dict] = []

    def create(self, **kwargs):
        self.create_calls.append(kwargs)
        if self._reject_thinking and "extra_body" in kwargs:
            raise Exception("Unknown parameter: 'thinking'")
        return _FakeResponse(self._content, self._finish_reason)


class _FakeChat:
    def __init__(self, completions):
        self.completions = completions


class _FakeClient:
    def __init__(self, content, finish_reason="stop", reject_thinking=False):
        self.completions = _FakeCompletions(content, finish_reason, reject_thinking)
        self.chat = _FakeChat(self.completions)


def test_khs_llm_client() -> int:
    """Exercise call_khs_llm_parser response handling with a fake client."""
    failures = 0
    original_get_client = llm_client.get_llm_client

    def use_client(client) -> None:
        llm_client.get_llm_client = lambda: client

    try:
        client = _FakeClient('{"ipk_final": 3.2, "courses": []}')
        use_client(client)
        result = call_khs_llm_parser("sys", "user", max_retries=1)
        failures += _assert(
            result == {"ipk_final": 3.2, "courses": []},
            "khs llm client: valid JSON string parsed to dict",
        )
        sent = client.completions.create_calls[0]
        failures += _assert(
            sent.get("response_format") == {"type": "json_object"},
            "khs llm client: response_format json_object is sent",
        )
        failures += _assert(
            sent.get("extra_body") == {"thinking": {"type": "disabled"}},
            "khs llm client: thinking disabled is sent",
        )
        failures += _assert(
            sent.get("max_tokens") == 8192 and sent.get("temperature") == 0.0,
            "khs llm client: max_tokens=8192 and temperature=0 are sent",
        )

        use_client(_FakeClient('```json\n{"ipk_final": 3.0, "courses": []}\n```'))
        result = call_khs_llm_parser("sys", "user", max_retries=1)
        failures += _assert(
            result.get("ipk_final") == 3.0,
            "khs llm client: markdown fenced JSON still parses",
        )

        use_client(_FakeClient('Here is the JSON:\n{"ipk_final": 2.5, "courses": []}\nThanks!'))
        result = call_khs_llm_parser("sys", "user", max_retries=1)
        failures += _assert(
            result.get("ipk_final") == 2.5,
            "khs llm client: JSON wrapped in stray text is extracted",
        )

        use_client(_FakeClient("", finish_reason="length"))
        try:
            call_khs_llm_parser("sys", "user", max_retries=1)
            failures += _assert(False, "khs llm client: empty content raises EmptyLLMResponseError")
        except EmptyLLMResponseError:
            failures += _assert(True, "khs llm client: empty content raises EmptyLLMResponseError")

        use_client(_FakeClient(None))
        try:
            call_khs_llm_parser("sys", "user", max_retries=1)
            failures += _assert(False, "khs llm client: None content raises EmptyLLMResponseError")
        except EmptyLLMResponseError:
            failures += _assert(True, "khs llm client: None content raises EmptyLLMResponseError")

        use_client(_FakeClient("not json at all"))
        try:
            call_khs_llm_parser("sys", "user", max_retries=1)
            failures += _assert(False, "khs llm client: non-JSON content raises LLMJsonError")
        except LLMJsonError:
            failures += _assert(True, "khs llm client: non-JSON content raises LLMJsonError")

        client = _FakeClient('{"ipk_final": 3.9, "courses": []}', reject_thinking=True)
        use_client(client)
        result = call_khs_llm_parser("sys", "user", max_retries=1)
        failures += _assert(
            result.get("ipk_final") == 3.9,
            "khs llm client: thinking rejection falls back and still parses",
        )
        failures += _assert(
            len(client.completions.create_calls) == 2,
            "khs llm client: fallback retries create() without thinking",
        )
        failures += _assert(
            "extra_body" not in client.completions.create_calls[1]
            and client.completions.create_calls[1].get("response_format")
            == {"type": "json_object"},
            "khs llm client: fallback drops thinking but keeps response_format",
        )
    finally:
        llm_client.get_llm_client = original_get_client

    return failures


def test_ktm(tmpdir: str) -> int:
    failures = 0

    valid = os.path.join(tmpdir, "ktm_valid.pdf")
    _make_pdf(valid, KTM_VALID_TEXT)

    r = validate_ktm(valid)
    print(f"     -> validate_ktm(valid): {r}")
    failures += _assert(r.get("valid") is True, "ktm valid: NIM detected, valid=true")
    failures += _assert(r.get("nim") == "1031234567890", "ktm valid: NIM extracted exactly")

    r2 = validate_ktm(valid, expected_nim="1039999999999")
    print(f"     -> validate_ktm(mismatch): {r2}")
    failures += _assert(r2.get("valid") is False, "ktm mismatch: valid=false on NIM mismatch")
    failures += _assert("warning" in r2, "ktm mismatch: warning message present")

    no_nim = os.path.join(tmpdir, "ktm_no_nim.pdf")
    _make_pdf(no_nim, KTM_NO_NIM_TEXT)
    r3 = validate_ktm(no_nim)
    print(f"     -> validate_ktm(no NIM): {r3}")
    failures += _assert(r3.get("valid") is False, "ktm no NIM: valid=false")
    failures += _assert("error" in r3, "ktm no NIM: error message present")

    img_path = os.path.join(tmpdir, "ktm.jpg")
    with open(img_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0")
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


def main() -> int:
    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        print("\n-- KHS parser ----------------------------------------")
        failures += test_khs(tmp)
        print("\n-- KHS LLM client ------------------------------------")
        failures += test_khs_llm_client()
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
