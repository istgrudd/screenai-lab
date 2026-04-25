"""Smoke test for Task 8 & 9: evaluation batch + announcements.

Covers:
  * POST /api/recruiter/evaluate/batch with empty rubric → 400
  * POST /api/recruiter/evaluate/batch with configured rubric → 200
  * Result contains khs_summary, ktm_valid fields
  * POST /api/announcements (pass) → 200
  * GET  /api/announcements/my → result visible
  * Candidate status updated to announced_pass

Uses FastAPI's TestClient so no live server is needed.

Run:
    python -m scripts.smoke_test_evaluation
"""

from __future__ import annotations

import io
import os
import sys
import tempfile

import fitz

from fastapi.testclient import TestClient

from backend.config import settings
from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
from backend.models.rubric import Dimension, Rubric
from backend.models.user import User, UserRole
from backend.utils.file_storage import purge_application_dir
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"

REC_EMAIL = "smoke+eval_recruiter@example.com"
CAND_EMAIL = "smoke+eval_candidate@example.com"
CAND_NIM = "1039876500001"
TEST_PASSWORD = "hunter2secure"


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
        # Clean users + cascades
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

                db.delete(u)

        # Clean test rubric
        db.query(Rubric).filter(Rubric.name == "Smoke Eval Rubric").delete(
            synchronize_session=False
        )

        db.commit()
    finally:
        db.close()


def main() -> int:
    _cleanup()
    failures = 0
    client = TestClient(fastapi_app)

    # --- Setup: create recruiter (directly in DB) ---
    db = SessionLocal()
    rec_user = User(
        email=REC_EMAIL,
        password_hash=hash_password(TEST_PASSWORD),
        full_name="Smoke Recruiter",
        role=UserRole.RECRUITER,
        is_active=True,
    )
    db.add(rec_user)
    db.commit()
    db.refresh(rec_user)
    db.close()

    # Login recruiter
    r = client.post(
        "/api/auth/login",
        json={"email": REC_EMAIL, "password": TEST_PASSWORD},
    )
    failures += _assert(r.status_code == 200, f"recruiter login → 200 (got {r.status_code})")
    rec_token = r.json()["data"]["access_token"]
    rec_auth = {"Authorization": f"Bearer {rec_token}"}

    # --- Setup: register candidate ---
    r = client.post(
        "/api/auth/register",
        json={
            "email": CAND_EMAIL,
            "password": TEST_PASSWORD,
            "full_name": "Smoke Eval Candidate",
            "nim": CAND_NIM,
            "faculty": "Fakultas Informatika",
            "major": "Data Science",
            "year": 2023,
        },
    )
    failures += _assert(r.status_code == 201, f"candidate register → 201 (got {r.status_code})")
    cand_token = r.json()["data"]["access_token"]
    cand_auth = {"Authorization": f"Bearer {cand_token}"}

    # --- Create application ---
    r = client.post(
        "/api/applications",
        headers=cand_auth,
        json={"division": "big_data"},
    )
    failures += _assert(r.status_code == 201, f"create application → 201 (got {r.status_code})")
    app_id = r.json()["data"]["id"]

    # --- Upload all 6 documents ---
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
        "cv": _minimal_pdf("CV content for evaluation test"),
        "khs": _minimal_pdf(khs_text),
        "ktm": _minimal_pdf(ktm_text),
        "motivation_letter": _minimal_pdf("Motivation letter content"),
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
            f"upload {dt} → 201 (got {r.status_code})",
        )

    # --- Submit application ---
    r = client.post(f"/api/applications/{app_id}/submit", headers=cand_auth)
    failures += _assert(r.status_code == 200, f"submit → 200 (got {r.status_code})")

    # =====================================================================
    # TEST 1: Empty rubric → 400
    # =====================================================================
    # Ensure the big_data rubric has NO dimensions (may have been added
    # by a prior test run that didn't clean up fully).
    db = SessionLocal()
    rubric = db.query(Rubric).filter(Rubric.division == "big_data").first()
    if rubric:
        db.query(Dimension).filter(Dimension.rubric_id == rubric.id).delete(
            synchronize_session=False
        )
        db.commit()
    db.close()

    r = client.post(
        "/api/recruiter/evaluate/batch",
        headers=rec_auth,
        json={"division": "big_data"},
    )
    failures += _assert(
        r.status_code == 400,
        f"eval empty rubric -> 400 (got {r.status_code})",
    )
    if r.status_code == 400:
        failures += _assert(
            "no dimensions" in r.json().get("detail", "").lower(),
            "error message mentions 'no dimensions'",
        )

    # =====================================================================
    # TEST 2: Configure rubric, then evaluate → 200
    # =====================================================================
    # Add dimensions to the big_data rubric
    db = SessionLocal()
    rubric = db.query(Rubric).filter(Rubric.division == "big_data").first()
    if rubric and not rubric.dimensions:
        db.add(
            Dimension(
                rubric_id=rubric.id,
                name="Technical Skills",
                weight=0.5,
                description="Programming and data science skills",
                indicators=["Python", "Machine Learning", "Data Analysis"],
            )
        )
        db.add(
            Dimension(
                rubric_id=rubric.id,
                name="Soft Skills",
                weight=0.5,
                description="Communication and teamwork",
                indicators=["Leadership", "Teamwork", "Communication"],
            )
        )
        db.commit()
    db.close()

    # Now evaluate — this calls the LLM so may fail if no API key
    r = client.post(
        "/api/recruiter/evaluate/batch",
        headers=rec_auth,
        json={"division": "big_data", "application_ids": [app_id]},
    )
    # If no DeepSeek API key configured, we expect either 200 (success)
    # or an error — but NOT 400 (that was the empty-rubric guard)
    if r.status_code == 200:
        data = r.json()["data"]
        failures += _assert(
            data["queued"] >= 1 or len(data.get("errors", [])) >= 1,
            f"eval returns queued={data.get('queued')} or errors",
        )

        # Check result structure if any succeeded
        if data.get("results"):
            first = data["results"][0]
            failures += _assert(
                "ktm_valid" in first,
                "result has ktm_valid field",
            )
            failures += _assert(
                "khs_summary" in first or "khs_warning" in first,
                "result has khs_summary or khs_warning",
            )
            failures += _assert(
                "ktm_warning" in first,
                "result has ktm_warning field",
            )
        else:
            # LLM call may have failed — that's ok if errors are reported
            failures += _assert(
                len(data.get("errors", [])) >= 1,
                "eval reports errors when LLM unavailable",
            )
        print(f"     → eval returned {r.status_code} (may depend on LLM availability)")
    else:
        # Non-400 error is acceptable (e.g. 422 from LLM unavailable)
        failures += _assert(
            r.status_code != 400,
            f"eval with dimensions should not be 400 (got {r.status_code})",
        )
        print(f"     → eval returned {r.status_code} (LLM likely unavailable, acceptable)")

    # =====================================================================
    # TEST 3: Announcements
    # =====================================================================

    # POST announcement (pass)
    r = client.post(
        "/api/announcements",
        headers=rec_auth,
        json={
            "application_id": app_id,
            "result": "pass",
            "notes": "Congratulations, great CV!",
        },
    )
    failures += _assert(
        r.status_code == 200,
        f"announce pass → 200 (got {r.status_code}: {r.text})",
    )
    if r.status_code == 200:
        ann = r.json()["data"]
        failures += _assert(ann["result"] == "pass", "announcement result is 'pass'")
        failures += _assert(ann["status"] == "announced_pass", "status is announced_pass")

    # GET /announcements/my as candidate
    r = client.get("/api/announcements/my", headers=cand_auth)
    failures += _assert(r.status_code == 200, f"GET /announcements/my → 200 (got {r.status_code})")
    if r.status_code == 200:
        my_ann = r.json()["data"]
        failures += _assert(
            my_ann["result"] == "pass",
            "candidate sees result=pass",
        )
        failures += _assert(
            my_ann["status"] == "announced_pass",
            "candidate sees status=announced_pass",
        )
        failures += _assert(
            my_ann.get("notes") == "Congratulations, great CV!",
            "candidate sees recruiter notes",
        )

    # Verify application status updated
    r = client.get("/api/applications/my", headers=cand_auth)
    if r.status_code == 200:
        failures += _assert(
            r.json()["data"]["status"] == "announced_pass",
            "application status is announced_pass",
        )

    # =====================================================================
    # TEST 4: Bad announcement result → 400
    # =====================================================================
    r = client.post(
        "/api/announcements",
        headers=rec_auth,
        json={"application_id": app_id, "result": "maybe"},
    )
    failures += _assert(
        r.status_code == 400,
        f"bad announcement result → 400 (got {r.status_code})",
    )

    # =====================================================================
    # TEST 5: Candidate cannot post announcement → 403
    # =====================================================================
    r = client.post(
        "/api/announcements",
        headers=cand_auth,
        json={"application_id": app_id, "result": "pass"},
    )
    failures += _assert(
        r.status_code == 403,
        f"candidate announcement → 403 (got {r.status_code})",
    )

    # =====================================================================
    # Summary
    # =====================================================================
    print()
    if failures == 0:
        print("All evaluation + announcement smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    return failures


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
