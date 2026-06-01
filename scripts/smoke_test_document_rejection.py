"""Smoke test for Phase 7 document rejection and correction flow.

Run:
    python -m scripts.smoke_test_document_rejection
"""

from __future__ import annotations

import io
import sys
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

import backend.routers.applications as applications_router
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


REC_EMAIL = "smoke+doc_reject_recruiter@example.com"
CAND_EMAIL = "smoke+doc_reject_candidate@example.com"
CAND_NIM = "1039876510002"
TEST_PASSWORD = "hunter2secure"
PERIOD_NAME = "smoke+document rejection period"
REJECTION_REASON = "KHS tidak terbaca dengan jelas."
NER_CALLS: list[int] = []


def _minimal_pdf(text: str = "document") -> bytes:
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<<>>stream\n"
        + text.encode("utf-8")
        + b"\nendstream endobj\ntrailer<<>>\n%%EOF\n"
    )


def _check(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(f"[FAIL] {msg}")
    print(f"[PASS] {msg}")


def _cleanup() -> None:
    db = SessionLocal()
    try:
        db.query(EmailNotification).filter(
            EmailNotification.to_email.in_([REC_EMAIL, CAND_EMAIL])
        ).delete(synchronize_session=False)
        users = (
            db.query(User)
            .filter(
                (User.email.in_([REC_EMAIL, CAND_EMAIL]))
                | (User.nim == CAND_NIM)
            )
            .all()
        )
        user_ids = [user.id for user in users]
        if user_ids:
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

            db.query(AuditLog).filter(
                (AuditLog.recruiter_id.in_(user_ids))
                | (AuditLog.candidate_id.in_(user_ids))
            ).delete(synchronize_session=False)

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


def _seed_users_and_period() -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        recruiter = User(
            email=REC_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Document Rejection Recruiter",
            role=UserRole.RECRUITER,
            is_active=True,
            email_verified_at=now,
        )
        candidate = User(
            email=CAND_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Document Rejection Candidate",
            nim=CAND_NIM,
            faculty="Fakultas Informatika",
            major="Data Science",
            year=2023,
            whatsapp="+6281234567890",
            role=UserRole.CANDIDATE,
            is_active=True,
            email_verified_at=now,
        )
        db.add_all([recruiter, candidate])
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


def _fake_run_submit_anonymization(application_id: int, session_factory) -> None:
    NER_CALLS.append(application_id)
    db = session_factory()
    try:
        app = db.query(Application).filter(Application.id == application_id).first()
        candidate = db.query(Candidate).filter(Candidate.user_id == app.user_id).first()
        if candidate is None:
            candidate = Candidate(
                anonymous_id=f"CAND-RJ{application_id:06d}"[-13:],
                user_id=app.user_id,
                rubric_id=None,
                status="anonymized",
            )
            db.add(candidate)
            db.flush()
        db.add(
            CandidateDocument(
                candidate_id=candidate.id,
                filename="cv.pdf",
                file_path="fake",
                document_type="cv",
                raw_text="raw cv",
                normalized_text="normalized cv",
                anonymized_text="[NAME] has relevant experience.",
                entities_json=[],
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
    _check(response.status_code == 200, f"login {email} -> 200")
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


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
        _check(response.status_code == 201, f"upload {doc_type.value} -> 201")


def main() -> int:
    init_db()
    _cleanup()
    _seed_users_and_period()
    NER_CALLS.clear()
    applications_router.run_submit_anonymization = _fake_run_submit_anonymization

    client = TestClient(fastapi_app)
    recruiter_auth = _login(client, REC_EMAIL)
    candidate_auth = _login(client, CAND_EMAIL)

    response = client.post(
        "/api/applications",
        headers=candidate_auth,
        json={"division": "big_data"},
    )
    _check(response.status_code == 201, "candidate creates application")
    app_id = response.json()["data"]["id"]

    _upload_all_documents(client, candidate_auth)

    response = client.post(f"/api/applications/{app_id}/submit", headers=candidate_auth)
    _check(response.status_code == 200, "candidate submits application")
    _check(response.json()["data"]["status"] == "document_review", "status is document_review")

    response = client.get(f"/api/documents/{app_id}", headers=recruiter_auth)
    docs = response.json()["data"]["documents"]
    by_type = {doc["doc_type"]: doc for doc in docs}
    khs_doc = by_type["khs"]
    cv_doc = by_type["cv"]

    response = client.put(
        f"/api/documents/{khs_doc['id']}/review",
        headers=recruiter_auth,
        json={"status": "rejected"},
    )
    _check(response.status_code == 400, "reject without reason fails")

    response = client.put(
        f"/api/documents/{khs_doc['id']}/review",
        headers=recruiter_auth,
        json={"status": "rejected", "reason": REJECTION_REASON},
    )
    _check(response.status_code == 200, "recruiter rejects KHS with reason")
    _check(
        response.json()["data"]["rejection_reason"] == REJECTION_REASON,
        "rejected document stores reason",
    )

    response = client.get(f"/api/documents/{app_id}", headers=candidate_auth)
    candidate_docs_before_finalize = response.json()["data"]["documents"]
    hidden_khs = next(doc for doc in candidate_docs_before_finalize if doc["doc_type"] == "khs")
    _check(
        hidden_khs["verification_status"] == "pending",
        "candidate cannot see rejected status before finalize",
    )
    _check(
        hidden_khs["rejection_reason"] is None,
        "candidate cannot see rejection reason before finalize",
    )

    for doc in docs:
        if doc["doc_type"] == "khs":
            continue
        response = client.put(
            f"/api/documents/{doc['id']}/review",
            headers=recruiter_auth,
            json={"status": "verified"},
        )
        _check(response.status_code == 200, f"recruiter verifies {doc['doc_type']}")

    response = client.post(
        f"/api/applications/{app_id}/finalize-document-review",
        headers=recruiter_auth,
    )
    _check(response.status_code == 200, "finalize with rejected document -> 200")
    _check(
        response.json()["data"]["status"] == "correction_requested",
        "application status becomes correction_requested",
    )
    _check(NER_CALLS == [], "NER does not run when correction is requested")

    response = client.get(f"/api/documents/{app_id}", headers=candidate_auth)
    candidate_docs = response.json()["data"]["documents"]
    rejected_doc = next(doc for doc in candidate_docs if doc["doc_type"] == "khs")
    _check(rejected_doc["verification_status"] == "rejected", "candidate sees rejected status")
    _check(rejected_doc["rejection_reason"] == REJECTION_REASON, "candidate sees rejection reason")

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        period = db.query(RecruitmentPeriod).filter(RecruitmentPeriod.name == PERIOD_NAME).first()
        period.start_date = now - timedelta(days=5)
        period.submission_end_date = now - timedelta(days=1)
        period.evaluation_end_date = now + timedelta(days=2)
        period.end_date = now + timedelta(days=5)
        db.commit()
    finally:
        db.close()

    response = client.put(
        f"/api/documents/{cv_doc['id']}/replace",
        headers=candidate_auth,
        files={
            "file": (
                "cv_replacement.pdf",
                io.BytesIO(_minimal_pdf("replacement cv")),
                "application/pdf",
            )
        },
    )
    _check(response.status_code == 403, "candidate cannot replace verified document")

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
    _check(response.status_code == 200, "candidate replaces rejected document after submission phase ended")
    replacement = response.json()["data"]
    _check(replacement["verification_status"] == "pending", "replacement resets status pending")
    _check(replacement["rejection_reason"] is None, "replacement clears rejection reason")

    response = client.get("/api/applications/my", headers=candidate_auth)
    _check(
        response.json()["data"]["status"] == "document_review",
        "application returns to document_review after replacement",
    )

    response = client.put(
        f"/api/documents/{khs_doc['id']}/review",
        headers=recruiter_auth,
        json={"status": "verified"},
    )
    _check(response.status_code == 200, "recruiter verifies replaced KHS")

    response = client.post(
        f"/api/applications/{app_id}/finalize-document-review",
        headers=recruiter_auth,
    )
    _check(response.status_code == 200, "finalize after correction -> 200")
    _check(response.json()["data"]["status"] == "verified", "application becomes verified")
    _check(NER_CALLS == [app_id], "NER runs after final approval")

    db = SessionLocal()
    try:
        candidate_user = db.query(User).filter(User.email == CAND_EMAIL).first()
        audit_count = (
            db.query(AuditLog)
            .filter(
                AuditLog.candidate_id == candidate_user.id,
                AuditLog.action_type.in_(
                    [
                        "document_verification",
                        "document_review_finalized",
                        "document_replacement",
                    ]
                ),
            )
            .count()
        )
        _check(audit_count >= 4, "review/rejection/replacement audit rows were written")
    finally:
        db.close()

    _cleanup()
    print("\nDocument rejection correction smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
