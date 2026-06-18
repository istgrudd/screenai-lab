"""Smoke test for Phase 6 document review gate.

Run:
    python -m scripts.smoke_test_document_review_flow
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
from backend.models.rubric import Dimension, Rubric
from backend.models.user import User, UserRole
from backend.utils.file_storage import purge_application_dir
from backend.utils.security import hash_password


REC_EMAIL = "smoke+doc_review_recruiter@example.com"
CAND_EMAIL = "smoke+doc_review_candidate@example.com"
CAND_NIM = "1039876510001"
TEST_PASSWORD = "hunter2secure"
PERIOD_NAME = "smoke+document review period"
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


def _ensure_big_data_rubric() -> None:
    db = SessionLocal()
    try:
        rubric = db.query(Rubric).filter(Rubric.division == "big_data").first()
        if rubric is None:
            rubric = Rubric(
                name="Smoke Big Data Rubric",
                position="Lab Assistant",
                division="big_data",
            )
            db.add(rubric)
            db.flush()
        if not rubric.dimensions:
            db.add(
                Dimension(
                    rubric_id=rubric.id,
                    name="General fit",
                    weight=1.0,
                    description="Smoke-test dimension",
                    indicators=["motivation"],
                )
            )
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
            full_name="Smoke Document Review Recruiter",
            role=UserRole.RECRUITER,
            is_active=True,
            email_verified_at=now,
        )
        candidate = User(
            email=CAND_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Document Review Candidate",
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
                anonymous_id=f"CAND-DR{application_id:06d}"[-13:],
                user_id=app.user_id,
                rubric_id=None,
                status="anonymized",
            )
            db.add(candidate)
            db.flush()
        cv_doc = (
            db.query(Document)
            .filter(Document.application_id == application_id, Document.doc_type == DocumentType.CV)
            .first()
        )
        db.add(
            CandidateDocument(
                candidate_id=candidate.id,
                filename=cv_doc.file_name if cv_doc else "cv.pdf",
                file_path=cv_doc.file_path if cv_doc else "fake",
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
    _ensure_big_data_rubric()
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
    _check(
        response.json()["data"]["status"] == "document_review",
        "submit moves application to document_review",
    )
    _check(NER_CALLS == [], "NER is not triggered at submit")

    db = SessionLocal()
    try:
        cand_user = db.query(User).filter(User.email == CAND_EMAIL).first()
        _check(
            db.query(Candidate).filter(Candidate.user_id == cand_user.id).count() == 0,
            "Candidate/NER cache is not created immediately",
        )
    finally:
        db.close()

    response = client.get(f"/api/documents/{app_id}", headers=candidate_auth)
    docs = response.json()["data"]["documents"]
    _check(
        all(doc["verification_status"] == "pending" for doc in docs),
        "all submitted documents start pending",
    )

    first_doc_id = docs[0]["id"]
    response = client.put(
        f"/api/documents/{first_doc_id}/review",
        headers=candidate_auth,
        json={"status": "verified"},
    )
    _check(response.status_code == 403, "candidate cannot review document")

    response = client.put(
        f"/api/documents/{first_doc_id}/verify",
        headers=candidate_auth,
        json={"is_verified": True},
    )
    _check(response.status_code == 403, "candidate cannot access legacy verify endpoint")

    response = client.post(
        "/api/recruiter/evaluate/batch",
        headers=recruiter_auth,
        json={"division": "big_data", "application_ids": [app_id]},
    )
    _check(response.status_code == 202, "evaluation request for document_review app -> 202")
    _check(
        response.json()["evaluated_count"] == 0,
        "evaluation excludes document_review application",
    )

    response = client.put(
        f"/api/documents/{first_doc_id}/review",
        headers=recruiter_auth,
        json={"status": "verified"},
    )
    _check(response.status_code == 200, "recruiter verifies first document before finalize")

    response = client.get(f"/api/documents/{app_id}", headers=candidate_auth)
    candidate_docs = response.json()["data"]["documents"]
    first_candidate_doc = next(doc for doc in candidate_docs if doc["id"] == first_doc_id)
    _check(
        first_candidate_doc["verification_status"] == "pending",
        "candidate cannot see verified status before finalize",
    )
    _check(
        first_candidate_doc["review_visibility"] == "hidden_until_finalized",
        "candidate document review visibility is hidden before finalize",
    )
    _check(
        first_candidate_doc["reviewed_at"] is None and first_candidate_doc["reviewed_by_id"] is None,
        "candidate cannot see reviewer metadata before finalize",
    )

    for doc in docs:
        if doc["id"] == first_doc_id:
            continue
        response = client.put(
            f"/api/documents/{doc['id']}/review",
            headers=recruiter_auth,
            json={"status": "verified"},
        )
        _check(response.status_code == 200, f"recruiter verifies {doc['doc_type']}")
        _check(
            response.json()["data"]["verification_status"] == "verified",
            f"{doc['doc_type']} status is verified",
        )

    response = client.post(
        f"/api/applications/{app_id}/finalize-document-review",
        headers=recruiter_auth,
    )
    _check(response.status_code == 200, "finalize all-verified review -> 200")
    body = response.json()["data"]
    _check(body["status"] == "verified", "application status becomes verified")
    _check(body["anonymization_queued"] is True, "final approval queues NER")
    _check(NER_CALLS == [app_id], "NER runs after verification")

    response = client.get(f"/api/documents/{app_id}", headers=candidate_auth)
    finalized_docs = response.json()["data"]["documents"]
    _check(
        all(doc["verification_status"] == "verified" for doc in finalized_docs),
        "candidate sees verified document state after finalize",
    )

    response = client.put(
        f"/api/documents/{first_doc_id}/verify",
        headers=recruiter_auth,
        json={"is_verified": True},
    )
    _check(
        response.status_code == 409,
        "legacy verify cannot bypass invalid finalized application status",
    )

    db = SessionLocal()
    try:
        cand_user = db.query(User).filter(User.email == CAND_EMAIL).first()
        candidate = db.query(Candidate).filter(Candidate.user_id == cand_user.id).first()
        _check(candidate is not None, "fake NER created Candidate row after approval")
        _check(
            db.query(CandidateDocument)
            .filter(CandidateDocument.candidate_id == candidate.id)
            .count()
            >= 1,
            "fake NER created CandidateDocument cache after approval",
        )
    finally:
        db.close()

    _cleanup()
    print("\nDocument review flow smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
