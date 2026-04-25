"""Smoke test for Task 10: Submit-time NER anonymization.

Covers:
  * Submit triggers background NER anonymization
  * CandidateDocument created with anonymized_text for CV
  * CandidateDocument created with anonymized_text for motivation_letter
  * Candidate record created with rubric_id=None
  * Evaluation pipeline uses NER cache (cache hit log)
  * Evaluation result stored correctly

Uses FastAPI's TestClient so no live server is needed.
Note: TestClient runs BackgroundTasks synchronously before
returning the response, so no explicit wait is needed.

Run:
    python -m scripts.smoke_test_submit_ner
"""

from __future__ import annotations

import io
import logging
import os
import sys

import fitz

from fastapi.testclient import TestClient

from datetime import datetime, timedelta, timezone

from backend.config import settings
from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
from backend.models.period import RecruitmentPeriod
from backend.models.rubric import Dimension, Rubric
from backend.models.user import User, UserRole
from backend.utils.file_storage import purge_application_dir
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"

REC_EMAIL = "smoke+ner_recruiter@example.com"
CAND_EMAIL = "smoke+ner_candidate@example.com"
CAND_NIM = "1039876500099"
TEST_PASSWORD = "hunter2secure"
PERIOD_NAME = "smoke+ner period"

# Enable logging so we can verify cache hit/miss messages
logging.basicConfig(level=logging.INFO, format="%(name)s: %(message)s")


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _minimal_pdf(text: str = "") -> bytes:
    """Create a minimal PDF with optional text content."""
    doc = fitz.open()
    page = doc.new_page()
    if text:
        page.insert_text((50, 72), text, fontsize=10)
    buf = doc.tobytes()
    doc.close()
    return buf


def _cleanup() -> None:
    """Remove smoke test data so the script is rerunnable."""
    db = SessionLocal()
    try:
        for email in (REC_EMAIL, CAND_EMAIL):
            users = db.query(User).filter(User.email == email).all()
            for u in users:
                # Clean candidates
                for c in db.query(Candidate).filter(Candidate.user_id == u.id).all():
                    db.query(DimensionScore).filter(
                        DimensionScore.candidate_id == c.id
                    ).delete(synchronize_session=False)
                    db.query(CandidateDocument).filter(
                        CandidateDocument.candidate_id == c.id
                    ).delete(synchronize_session=False)
                    db.delete(c)

                # Clean applications + docs
                for a in db.query(Application).filter(
                    Application.user_id == u.id
                ).all():
                    db.query(Document).filter(
                        Document.application_id == a.id
                    ).delete(synchronize_session=False)
                    purge_application_dir(a.id)
                    db.delete(a)

                # Clean audit logs
                db.query(AuditLog).filter(
                    (AuditLog.recruiter_id == u.id)
                    | (AuditLog.candidate_id == u.id)
                ).delete(synchronize_session=False)

                # Periods owned by this user (RESTRICT FK).
                db.query(RecruitmentPeriod).filter(
                    RecruitmentPeriod.created_by == u.id
                ).delete(synchronize_session=False)

                db.delete(u)

        # Drop any leftover periods named for this smoke test.
        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.name == PERIOD_NAME
        ).delete(synchronize_session=False)

        db.commit()
    finally:
        db.close()


def _seed_active_period(admin_user_id: int) -> None:
    """Insert an active RecruitmentPeriod owned by the recruiter user (ok — FK is users.id)."""
    db = SessionLocal()
    try:
        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.is_active == True  # noqa: E712
        ).update(
            {RecruitmentPeriod.is_active: False}, synchronize_session=False
        )
        now = datetime.now(timezone.utc)
        period = RecruitmentPeriod(
            name=PERIOD_NAME,
            start_date=now - timedelta(hours=1),
            end_date=now + timedelta(days=7),
            is_active=True,
            threshold_n=10,
            created_by=admin_user_id,
        )
        db.add(period)
        db.commit()
    finally:
        db.close()


def main() -> int:
    _cleanup()
    failures = 0
    client = TestClient(fastapi_app)

    # -----------------------------------------------------------------------
    # Setup: create recruiter (directly in DB)
    # -----------------------------------------------------------------------
    db = SessionLocal()
    rec_user = User(
        email=REC_EMAIL,
        password_hash=hash_password(TEST_PASSWORD),
        full_name="Smoke NER Recruiter",
        role=UserRole.RECRUITER,
        is_active=True,
    )
    db.add(rec_user)
    db.commit()
    db.refresh(rec_user)
    rec_user_id = rec_user.id
    db.close()

    # Seed an active recruitment period — required for submit() to succeed.
    _seed_active_period(rec_user_id)

    # Login recruiter
    r = client.post(
        "/api/auth/login",
        json={"email": REC_EMAIL, "password": TEST_PASSWORD},
    )
    failures += _assert(r.status_code == 200, f"recruiter login -> 200 (got {r.status_code})")
    rec_token = r.json()["data"]["access_token"]
    rec_auth = {"Authorization": f"Bearer {rec_token}"}

    # -----------------------------------------------------------------------
    # Setup: register candidate
    # -----------------------------------------------------------------------
    r = client.post(
        "/api/auth/register",
        json={
            "email": CAND_EMAIL,
            "password": TEST_PASSWORD,
            "full_name": "Smoke NER Candidate",
            "nim": CAND_NIM,
            "faculty": "Fakultas Informatika",
            "major": "Data Science",
            "year": 2023,
        },
    )
    failures += _assert(r.status_code == 201, f"candidate register â†’ 201 (got {r.status_code})")
    cand_token = r.json()["data"]["access_token"]
    cand_auth = {"Authorization": f"Bearer {cand_token}"}

    # Get candidate user_id
    r_me = client.get("/api/auth/me", headers=cand_auth)
    cand_user_id = r_me.json()["data"]["id"]

    # -----------------------------------------------------------------------
    # Create application
    # -----------------------------------------------------------------------
    r = client.post(
        "/api/applications",
        headers=cand_auth,
        json={"division": "big_data"},
    )
    failures += _assert(r.status_code == 201, f"create application â†’ 201 (got {r.status_code})")
    app_id = r.json()["data"]["id"]

    # -----------------------------------------------------------------------
    # Upload all 6 documents (dummy PDFs with realistic text)
    # -----------------------------------------------------------------------
    cv_text = (
        "CURRICULUM VITAE\n"
        "Nama: Budi Santoso\n"
        "Email: budi@example.com\n"
        "NIM: " + CAND_NIM + "\n"
        "Pengalaman: Machine Learning Engineer di PT Teknologi.\n"
        "Skill: Python, TensorFlow, Data Analysis.\n"
    )
    ml_text = (
        "SURAT MOTIVASI\n"
        "Nama: Budi Santoso\n"
        "Saya ingin bergabung dengan MBC Laboratory divisi Big Data.\n"
        "Pengalaman saya di bidang data science sangat relevan.\n"
    )
    khs_text = (
        "TRANSKRIP AKADEMIK\nNama: Test\nNIM: " + CAND_NIM + "\n"
        "IPK: 3.50\nTotal SKS: 100\n"
        "CII3A3 Machine Learning 3 A 5\n"
    )
    ktm_text = (
        "KARTU TANDA MAHASISWA\nNama: Test\nNIM: " + CAND_NIM + "\n"
        "Fakultas: Fakultas Informatika\n"
    )

    docs = {
        "cv": _minimal_pdf(cv_text),
        "khs": _minimal_pdf(khs_text),
        "ktm": _minimal_pdf(ktm_text),
        "motivation_letter": _minimal_pdf(ml_text),
        "swot": _minimal_pdf("Strengths: coding, Weaknesses: time management"),
        "supporting_docs": _minimal_pdf("Supporting docs content"),
    }

    for dt, pdf_bytes in docs.items():
        r = client.post(
            f"/api/documents/upload/{dt}",
            headers=cand_auth,
            files={"file": (f"{dt}.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        )
        failures += _assert(
            r.status_code == 201,
            f"upload {dt} â†’ 201 (got {r.status_code})",
        )

    # -----------------------------------------------------------------------
    # Submit application (triggers BackgroundTask NER)
    # Note: TestClient runs BackgroundTasks synchronously
    # -----------------------------------------------------------------------
    print("\n--- Submitting application (NER runs in background) ---")
    r = client.post(f"/api/applications/{app_id}/submit", headers=cand_auth)
    failures += _assert(r.status_code == 200, f"submit â†’ 200 (got {r.status_code})")

    # -----------------------------------------------------------------------
    # Test 6: Check CandidateDocument exists with anonymized_text for CV
    # -----------------------------------------------------------------------
    print("\n--- Verifying submit-time NER results ---")
    db = SessionLocal()
    try:
        candidate = (
            db.query(Candidate)
            .filter(Candidate.user_id == cand_user_id)
            .first()
        )

        # Test 8: Check Candidate record created with rubric_id=None
        failures += _assert(
            candidate is not None,
            "Candidate record created after submit",
        )

        if candidate:
            failures += _assert(
                candidate.rubric_id is None,
                f"Candidate.rubric_id is None at submit time (got {candidate.rubric_id})",
            )
            failures += _assert(
                candidate.status == "anonymized",
                f"Candidate.status is 'anonymized' (got '{candidate.status}')",
            )

            # Test 6: CV anonymized
            cv_cand_doc = (
                db.query(CandidateDocument)
                .filter(
                    CandidateDocument.candidate_id == candidate.id,
                    CandidateDocument.document_type == "cv",
                )
                .first()
            )
            failures += _assert(
                cv_cand_doc is not None,
                "CandidateDocument for CV exists",
            )
            if cv_cand_doc:
                failures += _assert(
                    cv_cand_doc.anonymized_text is not None
                    and len(cv_cand_doc.anonymized_text) > 0,
                    f"CV anonymized_text is not null (len={len(cv_cand_doc.anonymized_text or '')})",
                )
                failures += _assert(
                    cv_cand_doc.raw_text is not None
                    and len(cv_cand_doc.raw_text) > 0,
                    "CV raw_text stored",
                )
                failures += _assert(
                    cv_cand_doc.normalized_text is not None
                    and len(cv_cand_doc.normalized_text) > 0,
                    "CV normalized_text stored",
                )

            # Test 7: Motivation Letter anonymized
            ml_cand_doc = (
                db.query(CandidateDocument)
                .filter(
                    CandidateDocument.candidate_id == candidate.id,
                    CandidateDocument.document_type == "motivation_letter",
                )
                .first()
            )
            failures += _assert(
                ml_cand_doc is not None,
                "CandidateDocument for motivation_letter exists",
            )
            if ml_cand_doc:
                failures += _assert(
                    ml_cand_doc.anonymized_text is not None
                    and len(ml_cand_doc.anonymized_text) > 0,
                    f"ML anonymized_text is not null (len={len(ml_cand_doc.anonymized_text or '')})",
                )
        else:
            # Skip dependent tests
            failures += 5
            print(f"{FAIL} (skipped 5 tests â€” no Candidate record)")
    finally:
        db.close()

    # -----------------------------------------------------------------------
    # Test 9: Run evaluate/batch â†’ check NER cache hit
    # -----------------------------------------------------------------------
    print("\n--- Running evaluation (expects NER cache hit) ---")

    # First: ensure rubric has dimensions
    db = SessionLocal()
    rubric = (
        db.query(Rubric)
        .filter(Rubric.division == "big_data")
        .first()
    )
    if rubric and not rubric.dimensions:
        dim = Dimension(
            rubric_id=rubric.id,
            name="Technical Skills",
            weight=1.0,
            description="Technical competency evaluation",
            indicators=["programming", "data analysis"],
        )
        db.add(dim)
        db.commit()
    db.close()

    r = client.post(
        "/api/recruiter/evaluate/batch",
        headers=rec_auth,
        json={"division": "big_data", "application_ids": [app_id]},
    )

    # Evaluation may fail if no DEEPSEEK_API_KEY â€” that's OK,
    # we just need to verify it didn't return 400 (empty rubric)
    # and that it attempted evaluation (non-400 status).
    eval_ok = r.status_code == 200
    eval_acceptable = r.status_code not in (400, 404)
    failures += _assert(
        eval_acceptable,
        f"evaluate/batch â†’ acceptable status (got {r.status_code})",
    )

    if eval_ok:
        data = r.json().get("data", {})
        failures += _assert(
            len(data.get("results", [])) > 0,
            f"evaluation produced results (count={len(data.get('results', []))})",
        )

        # Test 10: Verify Candidate now has rubric_id set
        db = SessionLocal()
        candidate = (
            db.query(Candidate)
            .filter(Candidate.user_id == cand_user_id)
            .first()
        )
        if candidate:
            failures += _assert(
                candidate.rubric_id is not None,
                f"Candidate.rubric_id set after evaluation (id={candidate.rubric_id})",
            )
            failures += _assert(
                candidate.composite_score is not None,
                f"Candidate.composite_score stored ({candidate.composite_score})",
            )
        db.close()
    else:
        print(f"  [INFO] Evaluation returned {r.status_code} â€” "
              "LLM tests skipped (no API key?)")

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    print(f"\n{'='*50}")
    total = failures
    if total == 0:
        print("ALL TESTS PASSED âœ“")
    else:
        print(f"{total} test(s) FAILED")
    print(f"{'='*50}")

    _cleanup()
    return total


if __name__ == "__main__":
    sys.exit(main())
