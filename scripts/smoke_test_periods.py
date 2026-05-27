"""Smoke test for Phase 2B Task 11: RecruitmentPeriod management.

Covers:
  * POST /api/periods  → creates active period
  * Single-active invariant (creating second deactivates first)
  * GET  /api/periods/active → returns active period
  * GET  /api/periods/active → 404 when none active
  * PUT  /api/periods/{id}/close → closes the period
  * Submit with no active period → 403
  * Submit with active period → 200 and period_id is stamped
  * Candidate cannot POST /api/periods → 403

Run:
    python -m scripts.smoke_test_periods
"""

from __future__ import annotations

import io
import sys
import time
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.application import Application
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole
from backend.utils.file_storage import purge_application_dir
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"

ADMIN_EMAIL = "smoke+periods_admin@example.com"
CAND_EMAIL = "smoke+periods_candidate@example.com"
CAND_NIM = "1039876511122"
TEST_PASSWORD = "hunter2secure"
PERIOD_NAME_1 = "smoke+periods cycle 1"
PERIOD_NAME_2 = "smoke+periods cycle 2"


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _minimal_pdf() -> bytes:
    return b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def _cleanup() -> None:
    """Remove smoke-test users, periods, applications, candidates."""
    db = SessionLocal()
    try:
        # Drop our test periods first by name (cheap).
        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.name.in_([PERIOD_NAME_1, PERIOD_NAME_2])
        ).delete(synchronize_session=False)

        users = (
            db.query(User)
            .filter(
                (User.email == ADMIN_EMAIL)
                | (User.email == CAND_EMAIL)
                | (User.nim == CAND_NIM)
            )
            .all()
        )
        for u in users:
            for c in db.query(Candidate).filter(Candidate.user_id == u.id).all():
                db.query(DimensionScore).filter(
                    DimensionScore.candidate_id == c.id
                ).delete(synchronize_session=False)
                db.query(CandidateDocument).filter(
                    CandidateDocument.candidate_id == c.id
                ).delete(synchronize_session=False)
                db.delete(c)

            for a in db.query(Application).filter(Application.user_id == u.id).all():
                db.query(Document).filter(
                    Document.application_id == a.id
                ).delete(synchronize_session=False)
                purge_application_dir(a.id)
                db.delete(a)

            db.query(AuditLog).filter(
                (AuditLog.recruiter_id == u.id)
                | (AuditLog.candidate_id == u.id)
            ).delete(synchronize_session=False)

            db.query(RecruitmentPeriod).filter(
                RecruitmentPeriod.created_by == u.id
            ).delete(synchronize_session=False)

            db.delete(u)
        db.commit()
    finally:
        db.close()


def _deactivate_all_periods() -> None:
    """Force every period inactive so we own the invariant for this run."""
    db = SessionLocal()
    try:
        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.is_active == True  # noqa: E712
        ).update(
            {RecruitmentPeriod.is_active: False}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def main() -> int:
    _cleanup()
    _deactivate_all_periods()
    failures = 0
    client = TestClient(fastapi_app)

    # -------------------------------------------------------------------
    # Setup: create super admin (directly in DB), login.
    # -------------------------------------------------------------------
    db = SessionLocal()
    admin = User(
        email=ADMIN_EMAIL,
        password_hash=hash_password(TEST_PASSWORD),
        full_name="Smoke Periods Admin",
        role=UserRole.SUPER_ADMIN,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    db.close()

    r = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": TEST_PASSWORD},
    )
    failures += _assert(r.status_code == 200, f"admin login -> 200 (got {r.status_code})")
    admin_token = r.json()["data"]["access_token"]
    admin_auth = {"Authorization": f"Bearer {admin_token}"}

    # -------------------------------------------------------------------
    # Setup: register candidate.
    # -------------------------------------------------------------------
    r = client.post(
        "/api/auth/register",
        json={
            "email": CAND_EMAIL,
            "password": TEST_PASSWORD,
            "full_name": "Smoke Periods Candidate",
            "nim": CAND_NIM,
            "faculty": "Fakultas Informatika",
            "major": "Informatika",
            "year": 2023,
        },
    )
    failures += _assert(r.status_code == 201, f"candidate register -> 201 (got {r.status_code})")
    cand_token = r.json()["data"]["access_token"]
    cand_auth = {"Authorization": f"Bearer {cand_token}"}

    # -------------------------------------------------------------------
    # Test 1: GET /api/periods/active -> 404 when none active.
    # -------------------------------------------------------------------
    r = client.get("/api/periods/active")
    failures += _assert(
        r.status_code == 404,
        f"GET /periods/active -> 404 when none (got {r.status_code})",
    )

    # -------------------------------------------------------------------
    # Test 2: Candidate POST /api/periods -> 403.
    # -------------------------------------------------------------------
    now = datetime.now(timezone.utc)
    payload_future = {
        "name": PERIOD_NAME_1,
        "start_date": (now + timedelta(seconds=5)).isoformat(),
        "end_date": (now + timedelta(days=7)).isoformat(),
        "threshold_n": 10,
    }
    r = client.post("/api/periods", headers=cand_auth, json=payload_future)
    failures += _assert(
        r.status_code == 403,
        f"candidate POST /periods -> 403 (got {r.status_code})",
    )

    # -------------------------------------------------------------------
    # Test 3: Admin POST /api/periods -> 201 active.
    # -------------------------------------------------------------------
    r = client.post("/api/periods", headers=admin_auth, json=payload_future)
    failures += _assert(
        r.status_code == 201,
        f"admin POST /periods -> 201 (got {r.status_code}: {r.text})",
    )
    period1 = r.json()["data"]
    failures += _assert(period1["is_active"] is True, "new period is_active=True")
    failures += _assert(period1["threshold_n"] == 10, "threshold_n persisted")

    # -------------------------------------------------------------------
    # Test 4: GET /api/periods/active -> returns this period.
    # -------------------------------------------------------------------
    r = client.get("/api/periods/active")
    failures += _assert(r.status_code == 200, f"GET /periods/active -> 200 (got {r.status_code})")
    failures += _assert(
        r.json()["data"]["id"] == period1["id"],
        "GET /periods/active returns the just-created period",
    )

    # -------------------------------------------------------------------
    # Test 5: Create a 2nd period -> first is deactivated.
    # -------------------------------------------------------------------
    payload_future_2 = {
        "name": PERIOD_NAME_2,
        "start_date": (now + timedelta(minutes=10)).isoformat(),
        "end_date": (now + timedelta(days=14)).isoformat(),
        "threshold_n": None,
    }
    r = client.post("/api/periods", headers=admin_auth, json=payload_future_2)
    failures += _assert(
        r.status_code == 201,
        f"create 2nd period -> 201 (got {r.status_code}: {r.text})",
    )
    period2 = r.json()["data"]
    failures += _assert(period2["is_active"] is True, "2nd period is_active=True")

    # Verify exactly one is active and it's period2.
    db = SessionLocal()
    active_rows = (
        db.query(RecruitmentPeriod)
        .filter(RecruitmentPeriod.is_active == True)  # noqa: E712
        .all()
    )
    failures += _assert(
        len(active_rows) == 1 and active_rows[0].id == period2["id"],
        f"single-active invariant holds (active={[p.id for p in active_rows]}, expected [{period2['id']}])",
    )
    db.close()

    # -------------------------------------------------------------------
    # Test 6: GET /api/periods returns both, newest first; admin only.
    # -------------------------------------------------------------------
    r = client.get("/api/periods", headers=admin_auth)
    failures += _assert(r.status_code == 200, f"GET /periods (admin) -> 200 (got {r.status_code})")
    items = r.json()["data"]
    failures += _assert(
        len(items) >= 2 and items[0]["id"] == period2["id"],
        "list returns periods, newest first",
    )

    r = client.get("/api/periods", headers=cand_auth)
    failures += _assert(
        r.status_code == 403,
        f"candidate GET /periods -> 403 (got {r.status_code})",
    )

    # -------------------------------------------------------------------
    # Test 7: PUT /api/periods/{id}/close on period2 -> closed.
    # -------------------------------------------------------------------
    r = client.put(f"/api/periods/{period2['id']}/close", headers=admin_auth)
    failures += _assert(
        r.status_code == 200,
        f"close active period -> 200 (got {r.status_code})",
    )
    failures += _assert(
        r.json()["data"]["is_active"] is False,
        "closed period has is_active=False",
    )

    # Re-closing -> 400.
    r = client.put(f"/api/periods/{period2['id']}/close", headers=admin_auth)
    failures += _assert(
        r.status_code == 400,
        f"re-close already-closed period -> 400 (got {r.status_code})",
    )

    # -------------------------------------------------------------------
    # Test 8: Submit with no active period -> 403.
    # -------------------------------------------------------------------
    # Create candidate's draft application first.
    r = client.post(
        "/api/applications",
        headers=cand_auth,
        json={"division": "big_data"},
    )
    failures += _assert(r.status_code == 201, f"create application -> 201 (got {r.status_code})")
    app_id = r.json()["data"]["id"]

    # Upload all 6 docs.
    for dt in ("cv", "khs", "ktm", "motivation_letter", "swot", "supporting_docs"):
        r = client.post(
            f"/api/documents/upload/{dt}",
            headers=cand_auth,
            files={"file": (f"{dt}.pdf", io.BytesIO(_minimal_pdf()), "application/pdf")},
        )
        failures += _assert(
            r.status_code == 201,
            f"upload {dt} -> 201 (got {r.status_code})",
        )

    # No period active right now.
    r = client.post(f"/api/applications/{app_id}/submit", headers=cand_auth)
    failures += _assert(
        r.status_code == 403,
        f"submit with no active period -> 403 (got {r.status_code})",
    )

    # -------------------------------------------------------------------
    # Test 9: Submit with active period -> 200, period_id stamped.
    # -------------------------------------------------------------------
    payload_future_3 = {
        "name": "smoke+periods cycle 3",
        "start_date": (now + timedelta(seconds=5)).isoformat(),
        "end_date": (now + timedelta(days=7)).isoformat(),
        "threshold_n": 5,
    }
    r = client.post("/api/periods", headers=admin_auth, json=payload_future_3)
    failures += _assert(
        r.status_code == 201,
        f"reopen with new period -> 201 (got {r.status_code}: {r.text})",
    )
    period3_id = r.json()["data"]["id"]

    # Task 13.2.1: submit is now gated on current_phase == SUBMISSION.
    # Wait until start_date passes so the phase transitions UPCOMING -> SUBMISSION.
    time.sleep(6)

    r = client.post(f"/api/applications/{app_id}/submit", headers=cand_auth)
    failures += _assert(
        r.status_code == 200,
        f"submit with active period -> 200 (got {r.status_code}: {r.text})",
    )

    db = SessionLocal()
    app = db.query(Application).filter(Application.id == app_id).first()
    failures += _assert(
        app is not None and app.period_id == period3_id,
        f"application.period_id stamped to active period (got {app.period_id if app else None}, want {period3_id})",
    )
    db.close()

    # Cleanup the cycle 3 period explicitly (its name doesn't match the
    # global cleanup constants, so handle it here).
    db = SessionLocal()
    try:
        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.name == "smoke+periods cycle 3"
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()

    # -------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------
    print(f"\n{'='*50}")
    if failures == 0:
        print("ALL TESTS PASSED")
    else:
        print(f"{failures} test(s) FAILED")
    print(f"{'='*50}")

    _cleanup()
    return failures


if __name__ == "__main__":
    sys.exit(main())
