"""Smoke test for Phase 7.5 candidate profile completion enforcement.

Run:
    python -m scripts.smoke_test_candidate_profile_completion
"""

from __future__ import annotations

import io
import sys
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.database import SessionLocal, init_db
from backend.main import app as fastapi_app
from backend.models.application import Application
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
from backend.models.email_notification import EmailNotification
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole
from backend.utils.file_storage import purge_application_dir
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"

ADMIN_EMAIL = "smoke+profile_admin@example.com"
CAND_EMAIL = "smoke+profile_candidate@example.com"
CAND_NIM = "1039876513333"
TEST_PASSWORD = "hunter2secure"
PERIOD_NAME = "smoke+profile completion period"


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _minimal_pdf() -> bytes:
    return b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def _cleanup() -> None:
    db = SessionLocal()
    try:
        db.query(EmailNotification).filter(
            EmailNotification.to_email.in_([ADMIN_EMAIL, CAND_EMAIL])
        ).delete(synchronize_session=False)
        users = (
            db.query(User)
            .filter(
                (User.email.in_([ADMIN_EMAIL, CAND_EMAIL]))
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
            RecruitmentPeriod.name == PERIOD_NAME
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


def main() -> int:
    init_db()
    _cleanup()
    _deactivate_all_periods()
    failures = 0
    client = TestClient(fastapi_app)

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Profile Admin",
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        candidate = User(
            email=CAND_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Profile Candidate",
            nim=CAND_NIM,
            faculty="Fakultas Informatika",
            major="Informatika",
            year=2023,
            ipk=None,
            whatsapp=None,
            role=UserRole.CANDIDATE,
            is_active=True,
            email_verified_at=now,
        )
        db.add_all([admin, candidate])
        db.flush()
        period = RecruitmentPeriod(
            name=PERIOD_NAME,
            start_date=now - timedelta(hours=1),
            submission_end_date=now + timedelta(days=1),
            evaluation_end_date=now + timedelta(days=2),
            end_date=now + timedelta(days=3),
            is_active=True,
            threshold_n=None,
            created_by=admin.id,
        )
        db.add(period)
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/api/auth/login",
        json={"email": CAND_EMAIL, "password": TEST_PASSWORD},
    )
    failures += _assert(response.status_code == 200, "candidate login -> 200")
    auth = {"Authorization": f"Bearer {response.json()['data']['access_token']}"}

    response = client.post(
        "/api/applications",
        headers=auth,
        json={"division": "big_data"},
    )
    failures += _assert(response.status_code == 201, "create draft application -> 201")
    app_id = response.json()["data"]["id"]

    for doc_type in DocumentType:
        response = client.post(
            f"/api/documents/upload/{doc_type.value}",
            headers=auth,
            files={"file": (f"{doc_type.value}.pdf", io.BytesIO(_minimal_pdf()), "application/pdf")},
        )
        failures += _assert(response.status_code == 201, f"upload {doc_type.value} -> 201")

    response = client.post(f"/api/applications/{app_id}/submit", headers=auth)
    failures += _assert(response.status_code == 400, "submit missing WhatsApp/IPK -> 400")
    detail = response.json().get("detail", {})
    failures += _assert(
        "whatsapp" in detail.get("missing_fields", []),
        "missing_fields includes whatsapp",
    )
    failures += _assert(
        "ipk" in detail.get("missing_fields", []),
        "missing_fields includes ipk",
    )

    response = client.put("/api/users/me", headers=auth, json={"whatsapp": "12345"})
    failures += _assert(response.status_code == 422, "invalid WhatsApp format -> 422")

    response = client.put("/api/users/me", headers=auth, json={"whatsapp": "+6281234567890"})
    failures += _assert(response.status_code == 200, "valid WhatsApp profile update -> 200")

    response = client.post(f"/api/applications/{app_id}/submit", headers=auth)
    failures += _assert(response.status_code == 400, "submit missing IPK -> 400")
    detail = response.json().get("detail", {})
    failures += _assert(
        detail.get("missing_fields", []) == ["ipk"],
        "missing_fields only includes ipk after WhatsApp is filled",
    )

    invalid_ipk_values = [-1, 4.01, 5, "abc", 3.999, "3.999"]
    for value in invalid_ipk_values:
        response = client.put("/api/users/me", headers=auth, json={"ipk": value})
        failures += _assert(
            response.status_code == 422,
            f"invalid IPK {value!r} -> 422",
        )

    for value in [0, "0.00", "3.75", "4.00"]:
        response = client.put("/api/users/me", headers=auth, json={"ipk": value})
        failures += _assert(
            response.status_code == 200,
            f"valid IPK {value!r} profile update -> 200",
        )

    response = client.put("/api/users/me", headers=auth, json={"ipk": 3.75})
    failures += _assert(response.status_code == 200, "final valid IPK profile update -> 200")

    response = client.post(f"/api/applications/{app_id}/submit", headers=auth)
    failures += _assert(response.status_code == 200, "submit complete profile with IPK -> 200")
    failures += _assert(
        response.json()["data"]["status"] == "document_review",
        "complete profile submit moves to document_review",
    )

    response = client.put("/api/users/me", headers=auth, json={"nim": "1039876519999"})
    failures += _assert(response.status_code == 403, "academic identity locked after submit -> 403")
    response = client.put("/api/users/me", headers=auth, json={"ipk": 3.80})
    failures += _assert(response.status_code == 403, "IPK locked during document_review -> 403")

    print()
    if failures == 0:
        print("Candidate profile completion smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    return failures


if __name__ == "__main__":
    sys.exit(main())
