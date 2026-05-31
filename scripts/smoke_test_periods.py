"""Regression smoke test for RecruitmentPeriod management.

Run:
    python -m scripts.smoke_test_periods
"""

from __future__ import annotations

import io
import sys
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.application import Application
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
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
PERIOD_NAMES = [
    "smoke+periods cycle 1",
    "smoke+periods cycle 2",
    "smoke+periods submission",
    "smoke+periods submit ok",
]


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _minimal_pdf() -> bytes:
    return b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def _cleanup() -> None:
    db = SessionLocal()
    try:
        users = (
            db.query(User)
            .filter(
                (User.email == ADMIN_EMAIL)
                | (User.email == CAND_EMAIL)
                | (User.nim == CAND_NIM)
            )
            .all()
        )
        user_ids = [user.id for user in users]
        if user_ids:
            db.query(AuditLog).filter(
                (AuditLog.recruiter_id.in_(user_ids))
                | (AuditLog.candidate_id.in_(user_ids))
            ).delete(synchronize_session=False)

            for candidate in db.query(Candidate).filter(Candidate.user_id.in_(user_ids)).all():
                db.query(DimensionScore).filter(
                    DimensionScore.candidate_id == candidate.id
                ).delete(synchronize_session=False)
                db.query(CandidateDocument).filter(
                    CandidateDocument.candidate_id == candidate.id
                ).delete(synchronize_session=False)
                db.delete(candidate)

            for app in db.query(Application).filter(Application.user_id.in_(user_ids)).all():
                db.query(Document).filter(Document.application_id == app.id).delete(
                    synchronize_session=False
                )
                purge_application_dir(app.id)
                db.delete(app)

            db.query(RecruitmentPeriod).filter(
                RecruitmentPeriod.created_by.in_(user_ids)
            ).delete(synchronize_session=False)

            for user in users:
                db.delete(user)

        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.name.in_(PERIOD_NAMES)
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _deactivate_all_periods() -> None:
    db = SessionLocal()
    try:
        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.is_active == True  # noqa: E712
        ).update({RecruitmentPeriod.is_active: False}, synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _future_payload(name: str, offset_minutes: int) -> dict:
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=offset_minutes)
    return {
        "name": name,
        "start_date": start.isoformat(),
        "submission_end_date": (start + timedelta(days=3)).isoformat(),
        "evaluation_end_date": (start + timedelta(days=5)).isoformat(),
        "end_date": (start + timedelta(days=7)).isoformat(),
        "threshold_n": 10,
    }


def _seed_submission_period(name: str, created_by: int) -> int:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        period = RecruitmentPeriod(
            name=name,
            start_date=now - timedelta(hours=1),
            submission_end_date=now + timedelta(days=1),
            evaluation_end_date=now + timedelta(days=2),
            end_date=now + timedelta(days=3),
            is_active=True,
            threshold_n=5,
            created_by=created_by,
        )
        db.add(period)
        db.commit()
        db.refresh(period)
        return period.id
    finally:
        db.close()


def main() -> int:
    _cleanup()
    _deactivate_all_periods()
    failures = 0
    client = TestClient(fastapi_app)

    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Periods Admin",
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        candidate = User(
            email=CAND_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Periods Candidate",
            nim=CAND_NIM,
            faculty="Fakultas Informatika",
            major="Informatika",
            year=2023,
            whatsapp="+6281234567890",
            role=UserRole.CANDIDATE,
            is_active=True,
            email_verified_at=now,
        )
        db.add_all([admin, candidate])
        db.commit()
        db.refresh(admin)
        admin_id = admin.id
    finally:
        db.close()

    def _login(email: str) -> dict:
        response = client.post(
            "/api/auth/login",
            json={"email": email, "password": TEST_PASSWORD},
        )
        failures_local = _assert(response.status_code == 200, f"login {email} -> 200")
        if failures_local:
            raise AssertionError(response.text)
        return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}

    admin_auth = _login(ADMIN_EMAIL)
    cand_auth = _login(CAND_EMAIL)

    response = client.get("/api/periods/active")
    failures += _assert(response.status_code == 404, "GET active with none -> 404")

    response = client.post("/api/periods", headers=cand_auth, json=_future_payload(PERIOD_NAMES[0], 5))
    failures += _assert(response.status_code == 403, "candidate cannot create period -> 403")

    response = client.post("/api/periods", headers=admin_auth, json=_future_payload(PERIOD_NAMES[0], 5))
    failures += _assert(response.status_code == 201, "admin creates first active period -> 201")
    period1 = response.json()["data"]

    response = client.get("/api/periods/active")
    failures += _assert(response.status_code == 200, "GET active -> 200")
    failures += _assert(response.json()["data"]["id"] == period1["id"], "active endpoint returns period1")

    response = client.post("/api/periods", headers=admin_auth, json=_future_payload(PERIOD_NAMES[1], 10))
    failures += _assert(response.status_code == 409, "second create while active -> 409")

    response = client.put(f"/api/periods/{period1['id']}/close", headers=admin_auth)
    failures += _assert(response.status_code == 200, "close active period -> 200")
    response = client.put(f"/api/periods/{period1['id']}/close", headers=admin_auth)
    failures += _assert(response.status_code == 400, "re-close closed period -> 400")

    response = client.post("/api/applications", headers=cand_auth, json={"division": "big_data"})
    failures += _assert(response.status_code == 403, "candidate cannot create app with no active period -> 403")

    period_submission_id = _seed_submission_period(PERIOD_NAMES[2], admin_id)
    response = client.post("/api/applications", headers=cand_auth, json={"division": "big_data"})
    failures += _assert(response.status_code == 201, "candidate creates app during SUBMISSION -> 201")
    app_id = response.json()["data"]["id"]

    for doc_type in DocumentType:
        response = client.post(
            f"/api/documents/upload/{doc_type.value}",
            headers=cand_auth,
            files={"file": (f"{doc_type.value}.pdf", io.BytesIO(_minimal_pdf()), "application/pdf")},
        )
        failures += _assert(response.status_code == 201, f"upload {doc_type.value} during SUBMISSION -> 201")

    response = client.put(f"/api/periods/{period_submission_id}/close", headers=admin_auth)
    failures += _assert(response.status_code == 200, "close submission period before submit -> 200")
    response = client.post(f"/api/applications/{app_id}/submit", headers=cand_auth)
    failures += _assert(response.status_code == 403, "submit with no active period -> 403")

    period_submit_ok_id = _seed_submission_period(PERIOD_NAMES[3], admin_id)
    response = client.post(f"/api/applications/{app_id}/submit", headers=cand_auth)
    failures += _assert(response.status_code == 200, "submit during active SUBMISSION -> 200")

    db = SessionLocal()
    try:
        app = db.query(Application).filter(Application.id == app_id).first()
        failures += _assert(
            app is not None and app.period_id == period_submit_ok_id,
            "application.period_id stamped to active submission period",
        )
    finally:
        db.close()

    print()
    if failures == 0:
        print("All recruitment period smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    return failures


if __name__ == "__main__":
    sys.exit(main())
