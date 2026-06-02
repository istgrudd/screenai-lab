"""Smoke test for candidate IPK profile and KHS correction flow.

Run:
    python -m scripts.smoke_test_candidate_ipk_correction
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

REC_EMAIL = "smoke+ipk_recruiter@example.com"
CAND_EMAIL = "smoke+ipk_candidate@example.com"
OTHER_EMAIL = "smoke+ipk_other_candidate@example.com"
CAND_NIM = "1039876590001"
OTHER_NIM = "1039876590002"
TEST_PASSWORD = "hunter2secure"
PERIOD_NAME = "smoke+candidate ipk correction period"


def _check(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _minimal_pdf(text: str = "document") -> bytes:
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<<>>stream\n"
        + text.encode("utf-8")
        + b"\nendstream endobj\ntrailer<<>>\n%%EOF\n"
    )


def _cleanup() -> None:
    emails = [REC_EMAIL, CAND_EMAIL, OTHER_EMAIL]
    nims = [CAND_NIM, OTHER_NIM]
    db = SessionLocal()
    try:
        db.query(EmailNotification).filter(
            EmailNotification.to_email.in_(emails)
        ).delete(synchronize_session=False)
        users = (
            db.query(User)
            .filter((User.email.in_(emails)) | (User.nim.in_(nims)))
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


def _seed_recruiter_and_period() -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        recruiter = User(
            email=REC_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke IPK Recruiter",
            role=UserRole.RECRUITER,
            is_active=True,
            email_verified_at=now,
        )
        db.add(recruiter)
        db.flush()
        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.is_active == True  # noqa: E712
        ).update({RecruitmentPeriod.is_active: False}, synchronize_session=False)
        db.add(
            RecruitmentPeriod(
                name=PERIOD_NAME,
                start_date=now - timedelta(hours=1),
                submission_end_date=now + timedelta(days=1),
                evaluation_end_date=now + timedelta(days=2),
                end_date=now + timedelta(days=3),
                is_active=True,
                threshold_n=None,
                created_by=recruiter.id,
            )
        )
        db.commit()
    finally:
        db.close()


def _verify_candidate_email(email: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        user.email_verified_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


def _create_verified_candidate(email: str, nim: str, *, ipk: float) -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        db.add(
            User(
                email=email,
                password_hash=hash_password(TEST_PASSWORD),
                full_name="Smoke Other IPK Candidate",
                nim=nim,
                faculty="Fakultas Informatika",
                major="Data Science",
                year=2023,
                ipk=ipk,
                whatsapp="+6281234567890",
                role=UserRole.CANDIDATE,
                is_active=True,
                email_verified_at=now,
            )
        )
        db.commit()
    finally:
        db.close()


def _login(client: TestClient, email: str) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": TEST_PASSWORD},
    )
    if response.status_code != 200:
        raise AssertionError(f"login {email} failed: {response.status_code} {response.text}")
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


def _create_application(client: TestClient, auth: dict) -> int:
    response = client.post(
        "/api/applications",
        headers=auth,
        json={"division": "big_data"},
    )
    if response.status_code != 201:
        raise AssertionError(f"create application failed: {response.status_code} {response.text}")
    return response.json()["data"]["id"]


def _upload_all_documents(client: TestClient, auth: dict) -> None:
    for doc_type in DocumentType:
        response = client.post(
            f"/api/documents/upload/{doc_type.value}",
            headers=auth,
            files={
                "file": (
                    f"{doc_type.value}.pdf",
                    io.BytesIO(_minimal_pdf(doc_type.value)),
                    "application/pdf",
                )
            },
        )
        if response.status_code != 201:
            raise AssertionError(f"upload {doc_type.value} failed: {response.status_code} {response.text}")


def _documents_by_type(client: TestClient, app_id: int, auth: dict) -> dict[str, dict]:
    response = client.get(f"/api/documents/{app_id}", headers=auth)
    if response.status_code != 200:
        raise AssertionError(f"list documents failed: {response.status_code} {response.text}")
    return {doc["doc_type"]: doc for doc in response.json()["data"]["documents"]}


def _review_all_with_rejection(
    client: TestClient,
    app_id: int,
    recruiter_auth: dict,
    *,
    rejected_doc_type: str,
) -> None:
    docs = _documents_by_type(client, app_id, recruiter_auth)
    for doc_type, doc in docs.items():
        if doc_type == rejected_doc_type:
            payload = {
                "status": "rejected",
                "reason": f"{doc_type.upper()} perlu koreksi.",
            }
        else:
            payload = {"status": "verified"}
        response = client.put(
            f"/api/documents/{doc['id']}/review",
            headers=recruiter_auth,
            json=payload,
        )
        if response.status_code != 200:
            raise AssertionError(f"review {doc_type} failed: {response.status_code} {response.text}")

    response = client.post(
        f"/api/applications/{app_id}/finalize-document-review",
        headers=recruiter_auth,
    )
    if response.status_code != 200:
        raise AssertionError(f"finalize failed: {response.status_code} {response.text}")


def main() -> int:
    init_db()
    _cleanup()
    _seed_recruiter_and_period()
    failures = 0
    client = TestClient(fastapi_app)

    response = client.post(
        "/api/auth/register",
        json={
            "email": CAND_EMAIL,
            "password": TEST_PASSWORD,
            "full_name": "Smoke IPK Candidate",
            "nim": CAND_NIM,
            "faculty": "Fakultas Informatika",
            "major": "Data Science",
            "year": 2023,
        },
    )
    failures += _check(response.status_code == 201, "candidate can register without IPK -> 201")

    db = SessionLocal()
    try:
        candidate = db.query(User).filter(User.email == CAND_EMAIL).first()
        failures += _check(candidate is not None and candidate.ipk is None, "registered candidate IPK is null")
    finally:
        db.close()

    _verify_candidate_email(CAND_EMAIL)
    recruiter_auth = _login(client, REC_EMAIL)
    candidate_auth = _login(client, CAND_EMAIL)
    response = client.get("/api/auth/me", headers=candidate_auth)
    failures += _check(response.status_code == 200, "candidate can login without IPK -> 200")
    failures += _check(response.json()["data"]["ipk"] is None, "auth/me returns null IPK")

    app_id = _create_application(client, candidate_auth)
    _upload_all_documents(client, candidate_auth)

    response = client.put("/api/users/me", headers=candidate_auth, json={"whatsapp": "+6281234567890"})
    failures += _check(response.status_code == 200, "candidate fills WhatsApp while draft -> 200")

    response = client.post(f"/api/applications/{app_id}/submit", headers=candidate_auth)
    failures += _check(response.status_code == 400, "candidate without IPK cannot final submit -> 400")
    failures += _check(
        "ipk" in response.json().get("detail", {}).get("missing_fields", []),
        "submit missing_fields includes ipk",
    )

    response = client.put("/api/users/me", headers=candidate_auth, json={"ipk": 3.75})
    failures += _check(response.status_code == 200, "candidate can set IPK while draft -> 200")
    failures += _check(response.json()["data"]["ipk_editable"] is True, "IPK editable while draft")

    response = client.post(f"/api/applications/{app_id}/submit", headers=candidate_auth)
    failures += _check(response.status_code == 200, "candidate with IPK can final submit -> 200")
    failures += _check(
        response.json()["data"]["status"] == "document_review",
        "submit moves application to document_review",
    )

    response = client.put("/api/users/me", headers=candidate_auth, json={"ipk": 3.80})
    failures += _check(response.status_code == 403, "candidate cannot edit IPK during document_review -> 403")

    _review_all_with_rejection(
        client,
        app_id,
        recruiter_auth,
        rejected_doc_type=DocumentType.KHS.value,
    )
    response = client.get("/api/users/me", headers=candidate_auth)
    failures += _check(response.json()["data"]["application_status"] == "correction_requested", "KHS rejection enters correction_requested")
    failures += _check(response.json()["data"]["ipk_editable"] is True, "IPK opens when KHS is rejected")

    response = client.put("/api/users/me", headers=candidate_auth, json={"ipk": 3.90})
    failures += _check(response.status_code == 200, "candidate can update IPK when KHS is rejected -> 200")

    response = client.put("/api/users/me", headers=candidate_auth, json={"nim": "1039876599999"})
    failures += _check(response.status_code == 403, "NIM remains locked during correction_requested -> 403")

    docs = _documents_by_type(client, app_id, candidate_auth)
    khs_doc = docs[DocumentType.KHS.value]
    response = client.put(
        f"/api/documents/{khs_doc['id']}/replace",
        headers=candidate_auth,
        files={
            "file": (
                "khs_replacement.pdf",
                io.BytesIO(_minimal_pdf("replacement khs")),
                "application/pdf",
            )
        },
    )
    failures += _check(response.status_code == 200, "candidate replaces rejected KHS -> 200")

    response = client.get("/api/users/me", headers=candidate_auth)
    failures += _check(response.json()["data"]["application_status"] == "document_review", "KHS replacement returns app to document_review")
    failures += _check(response.json()["data"]["ipk_editable"] is False, "IPK locks again after KHS replacement")

    response = client.put("/api/users/me", headers=candidate_auth, json={"ipk": 4.00})
    failures += _check(response.status_code == 403, "candidate cannot edit IPK after app returns to review -> 403")

    _create_verified_candidate(OTHER_EMAIL, OTHER_NIM, ipk=3.40)
    other_auth = _login(client, OTHER_EMAIL)
    other_app_id = _create_application(client, other_auth)
    _upload_all_documents(client, other_auth)
    response = client.post(f"/api/applications/{other_app_id}/submit", headers=other_auth)
    failures += _check(response.status_code == 200, "second candidate submits with IPK -> 200")

    _review_all_with_rejection(
        client,
        other_app_id,
        recruiter_auth,
        rejected_doc_type=DocumentType.CV.value,
    )
    response = client.get("/api/users/me", headers=other_auth)
    failures += _check(response.json()["data"]["application_status"] == "correction_requested", "non-KHS rejection enters correction_requested")
    failures += _check(response.json()["data"]["ipk_editable"] is False, "IPK stays locked when rejected doc is not KHS")

    response = client.put("/api/users/me", headers=other_auth, json={"ipk": 3.60})
    failures += _check(response.status_code == 403, "candidate cannot edit IPK when KHS is not rejected -> 403")

    print()
    if failures == 0:
        print("Candidate IPK correction smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    return failures


if __name__ == "__main__":
    sys.exit(main())
