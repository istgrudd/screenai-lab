"""Smoke test: document verification writes an audit log.

Run:
    python -m scripts.smoke_test_document_verification_audit
"""

from __future__ import annotations

import sys

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.audit import AuditLog
from backend.models.document import Document, DocumentType
from backend.models.user import User, UserRole
from backend.utils.security import hash_password


REC_EMAIL = "smoke+doc_verify_recruiter@example.com"
CAND_EMAIL = "smoke+doc_verify_candidate@example.com"
CAND_NIM = "1039876500777"
TEST_PASSWORD = "hunter2secure"


def _check(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(f"[FAIL] {msg}")
    print(f"[PASS] {msg}")


def _cleanup() -> None:
    db = SessionLocal()
    try:
        users = (
            db.query(User)
            .filter(
                (User.email == REC_EMAIL)
                | (User.email == CAND_EMAIL)
                | (User.nim == CAND_NIM)
            )
            .all()
        )
        user_ids = [u.id for u in users]
        if user_ids:
            db.query(AuditLog).filter(
                (AuditLog.recruiter_id.in_(user_ids))
                | (AuditLog.candidate_id.in_(user_ids))
            ).delete(synchronize_session=False)

            app_ids = [
                app_id
                for (app_id,) in db.query(Application.id)
                .filter(Application.user_id.in_(user_ids))
                .all()
            ]
            if app_ids:
                db.query(Document).filter(
                    Document.application_id.in_(app_ids)
                ).delete(synchronize_session=False)
                db.query(Application).filter(
                    Application.id.in_(app_ids)
                ).delete(synchronize_session=False)

            for user in users:
                db.delete(user)

        db.commit()
    finally:
        db.close()


def main() -> int:
    _cleanup()
    client = TestClient(fastapi_app)

    db = SessionLocal()
    try:
        recruiter = User(
            email=REC_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Doc Verify Recruiter",
            role=UserRole.RECRUITER,
            is_active=True,
        )
        candidate = User(
            email=CAND_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Doc Verify Candidate",
            nim=CAND_NIM,
            faculty="Fakultas Informatika",
            major="Data Science",
            year=2023,
            role=UserRole.CANDIDATE,
            is_active=True,
        )
        db.add_all([recruiter, candidate])
        db.commit()
        db.refresh(recruiter)
        db.refresh(candidate)

        app = Application(
            user_id=candidate.id,
            division=Division.BIG_DATA,
            status=ApplicationStatus.DOCUMENT_REVIEW,
        )
        db.add(app)
        db.commit()
        db.refresh(app)

        doc = Document(
            application_id=app.id,
            doc_type=DocumentType.SUPPORTING_DOCS,
            file_path="uploads/smoke-doc-verify/supporting_docs.pdf",
            file_name="supporting_docs.pdf",
            file_size=123,
            is_verified=False,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        recruiter_id = recruiter.id
        candidate_user_id = candidate.id
        doc_id = doc.id
    finally:
        db.close()

    r = client.post(
        "/api/auth/login",
        json={"email": REC_EMAIL, "password": TEST_PASSWORD},
    )
    _check(r.status_code == 200, f"recruiter login -> 200 (got {r.status_code})")
    auth = {"Authorization": f"Bearer {r.json()['data']['access_token']}"}

    r = client.put(
        f"/api/documents/{doc_id}/verify",
        headers=auth,
        json={"is_verified": True},
    )
    _check(r.status_code == 200, f"verify document -> 200 (got {r.status_code}: {r.text})")
    body = r.json()
    _check(body["success"] is True and body["error"] is None, "response envelope unchanged")
    _check(body["data"]["id"] == doc_id, "response contains document id")
    _check(body["data"]["is_verified"] is True, "response shows is_verified=true")

    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        _check(doc is not None and doc.is_verified is True, "document row is verified")

        audits = (
            db.query(AuditLog)
            .filter(
                AuditLog.action_type == "document_verification",
                AuditLog.recruiter_id == recruiter_id,
                AuditLog.candidate_id == candidate_user_id,
            )
            .all()
        )
        _check(len(audits) == 1, f"exactly one audit row created (got {len(audits)})")

        audit = audits[0]
        _check(audit.old_value == "pending", f"audit old_value is pending (got {audit.old_value})")
        _check(audit.new_value == "verified", f"audit new_value is verified (got {audit.new_value})")
        _check(f"doc_id={doc_id}" in (audit.reason or ""), "audit reason includes doc id")
        _check("doc_type=supporting_docs" in (audit.reason or ""), "audit reason includes doc type")
    finally:
        db.close()
        _cleanup()

    print("\nDocument verification audit smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
