"""Smoke test for Phase 1 Task 4: application + document flow.

Register -> login -> create app -> upload all 6 docs -> submit -> verify locked.
Also covers: MIME rejection, size rejection, second-app 409, replace rejection
after submit.

Run:
    python -m scripts.smoke_test_applications
"""

from __future__ import annotations

import io
import os
import sys

os.environ["EMAIL_ENABLED"] = "false"
os.environ["EMAIL_RESEND_COOLDOWN_SECONDS"] = "0"
os.environ["ENVIRONMENT"] = "development"
os.environ["PUBLIC_FRONTEND_URL"] = "http://testserver"

from fastapi.testclient import TestClient

from datetime import datetime, timedelta, timezone

from backend.config import settings
from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.application import Application
from backend.models.document import Document, DocumentType
from backend.models.email_notification import EmailNotification
from backend.models.email_verification import EmailVerificationLink
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole
from backend.utils.file_storage import purge_application_dir
from backend.utils.security import hash_password


TEST_EMAIL = "smoke+apps@example.com"
TEST_NIM = "1039876543210"
TEST_PASSWORD = "hunter2secure"
PERIOD_NAME = "smoke+apps period"
PERIOD_ADMIN_EMAIL = "smoke+apps_admin@example.com"


def _minimal_pdf(size_bytes: int = 0) -> bytes:
    """Tiny valid PDF, padded with trailing spaces to reach ``size_bytes`` (if > base)."""
    body = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    if size_bytes <= len(body):
        return body
    return body + b" " * (size_bytes - len(body))


def _check(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(f"[FAIL] {msg}")
    print(f"[PASS] {msg}")


def _cleanup_user() -> None:
    db = SessionLocal()
    try:
        db.query(EmailNotification).filter(
            EmailNotification.to_email.in_([TEST_EMAIL, PERIOD_ADMIN_EMAIL])
        ).delete(synchronize_session=False)
        users = (
            db.query(User)
            .filter(
                (User.email == TEST_EMAIL)
                | (User.email == PERIOD_ADMIN_EMAIL)
                | (User.nim == TEST_NIM)
            )
            .all()
        )
        for u in users:
            db.query(EmailVerificationLink).filter(
                EmailVerificationLink.user_id == u.id
            ).delete(synchronize_session=False)
            for a in db.query(Application).filter(Application.user_id == u.id).all():
                # Clean disk files first.
                db.query(Document).filter(Document.application_id == a.id).delete(
                    synchronize_session=False
                )
                purge_application_dir(a.id)
                db.delete(a)
            # Periods owned by this admin (RESTRICT FK — must drop apps first).
            db.query(RecruitmentPeriod).filter(
                RecruitmentPeriod.created_by == u.id
            ).delete(synchronize_session=False)
            db.delete(u)
        # Also drop any leftover periods named for this smoke test.
        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.name == PERIOD_NAME
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _seed_active_period() -> None:
    """Insert an active RecruitmentPeriod so submit() is not 403'd."""
    db = SessionLocal()
    try:
        admin = User(
            email=PERIOD_ADMIN_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Apps Admin",
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        # Deactivate any pre-existing active periods so we own the invariant.
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
            threshold_n=None,
            created_by=admin.id,
        )
        db.add(period)
        db.commit()
    finally:
        db.close()


def main() -> int:
    _cleanup_user()
    _seed_active_period()
    client = TestClient(fastapi_app)

    # --- Register + login ---
    r = client.post(
        "/api/auth/register",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "full_name": "Smoke App Candidate",
            "nim": TEST_NIM,
            "faculty": "Fakultas Informatika",
            "major": "Data Science",
            "year": 2023,
        },
    )
    _check(r.status_code == 201, f"register -> 201 (got {r.status_code}: {r.text})")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == TEST_EMAIL).first()
        user.email_verified_at = datetime.now(timezone.utc)
        user.whatsapp = "+6281234567890"
        db.commit()
    finally:
        db.close()

    r = client.post(
        "/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    _check(r.status_code == 200, f"login -> 200 (got {r.status_code}: {r.text})")
    token = r.json()["data"]["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    # --- Create application ---
    r = client.post(
        "/api/applications", headers=auth, json={"division": "big_data"}
    )
    _check(r.status_code == 201, f"create app -> 201 (got {r.status_code}: {r.text})")
    app_id = r.json()["data"]["id"]
    _check(r.json()["data"]["status"] == "draft", "new application is draft")

    # --- Second create attempt -> 409 ---
    r = client.post(
        "/api/applications", headers=auth, json={"division": "cyber_security"}
    )
    _check(r.status_code == 409, f"second create -> 409 (got {r.status_code})")

    # --- GET my ---
    r = client.get("/api/applications/my", headers=auth)
    _check(r.status_code == 200 and r.json()["data"]["id"] == app_id, "/applications/my returns the app")

    # --- Submit with zero docs -> 400 with full missing list ---
    r = client.post(f"/api/applications/{app_id}/submit", headers=auth)
    _check(r.status_code == 400, f"submit empty -> 400 (got {r.status_code})")
    missing = r.json()["detail"]["missing"]
    _check(
        set(missing) == {dt.value for dt in DocumentType},
        f"submit empty lists all 6 missing types (got {missing})",
    )

    # --- Upload CV with wrong MIME -> 415 ---
    r = client.post(
        "/api/documents/upload/cv",
        headers=auth,
        files={"file": ("cv.pdf", io.BytesIO(_minimal_pdf()), "text/plain")},
    )
    _check(r.status_code == 415, f"wrong MIME -> 415 (got {r.status_code})")

    # --- Upload CV oversize (6 MB) -> 413 ---
    oversize = _minimal_pdf(6 * 1024 * 1024)
    r = client.post(
        "/api/documents/upload/cv",
        headers=auth,
        files={"file": ("cv.pdf", io.BytesIO(oversize), "application/pdf")},
    )
    _check(r.status_code == 413, f"oversize CV -> 413 (got {r.status_code})")

    # --- Upload CV valid ---
    r = client.post(
        "/api/documents/upload/cv",
        headers=auth,
        files={"file": ("my_cv.pdf", io.BytesIO(_minimal_pdf()), "application/pdf")},
    )
    _check(r.status_code == 201, f"upload CV -> 201 (got {r.status_code}: {r.text})")
    cv_doc = r.json()["data"]
    _check(cv_doc["doc_type"] == "cv" and cv_doc["file_name"] == "my_cv.pdf", "CV stored with filename")

    # --- KTM as JPEG (allowed for this doc_type) ---
    tiny_jpg = bytes.fromhex("FFD8FFDB00430003020202020203020202030303030405080505040404080B08080A0B0C0E0E0C0B0D0D0E11151211131413160D0F11181B1A15191416181515181516191A231D15161F26251D1F222020222020211F2023252526282922272D2728251DFFD9")
    r = client.post(
        "/api/documents/upload/ktm",
        headers=auth,
        files={"file": ("ktm.jpg", io.BytesIO(tiny_jpg), "image/jpeg")},
    )
    _check(r.status_code == 201, f"upload KTM jpg -> 201 (got {r.status_code}: {r.text})")

    # --- KTM oversize (3 MB) -> 413 ---
    r = client.post(
        "/api/documents/upload/ktm",
        headers=auth,
        files={"file": ("ktm.pdf", io.BytesIO(_minimal_pdf(3 * 1024 * 1024)), "application/pdf")},
    )
    _check(r.status_code == 413, f"KTM oversize -> 413 (got {r.status_code})")

    # --- Supporting docs large (allowed up to 10 MB) ---
    big = _minimal_pdf(8 * 1024 * 1024)
    r = client.post(
        "/api/documents/upload/supporting_docs",
        headers=auth,
        files={"file": ("support.pdf", io.BytesIO(big), "application/pdf")},
    )
    _check(r.status_code == 201, f"supporting_docs 8MB -> 201 (got {r.status_code})")

    # --- Fill remaining docs ---
    for dt in ("khs", "motivation_letter", "swot"):
        r = client.post(
            f"/api/documents/upload/{dt}",
            headers=auth,
            files={"file": (f"{dt}.pdf", io.BytesIO(_minimal_pdf()), "application/pdf")},
        )
        _check(r.status_code == 201, f"upload {dt} -> 201 (got {r.status_code})")

    # --- List documents ---
    r = client.get(f"/api/documents/{app_id}", headers=auth)
    _check(r.status_code == 200, "list documents -> 200")
    types_present = {d["doc_type"] for d in r.json()["data"]["documents"]}
    _check(types_present == {dt.value for dt in DocumentType}, f"all 6 types present (got {types_present})")

    # --- Replace CV in place ---
    r = client.post(
        "/api/documents/upload/cv",
        headers=auth,
        files={"file": ("cv_v2.pdf", io.BytesIO(_minimal_pdf()), "application/pdf")},
    )
    _check(
        r.status_code == 201 and r.json()["data"]["file_name"] == "cv_v2.pdf",
        "CV replace-in-place updates file_name",
    )

    # --- File download works ---
    cv_id = r.json()["data"]["id"]
    r = client.get(f"/api/documents/{cv_id}/file", headers=auth)
    _check(
        r.status_code == 200 and r.headers["content-type"] == "application/pdf",
        f"download CV -> 200 pdf (got {r.status_code}, ct={r.headers.get('content-type')})",
    )

    # --- Submit successfully ---
    r = client.post(f"/api/applications/{app_id}/submit", headers=auth)
    _check(r.status_code == 200, f"submit ok -> 200 (got {r.status_code}: {r.text})")
    _check(r.json()["data"]["status"] == "document_review", "status transitions to document_review")
    _check(r.json()["data"]["submitted_at"] is not None, "submitted_at timestamp set")

    # --- Submit again -> 409 ---
    r = client.post(f"/api/applications/{app_id}/submit", headers=auth)
    _check(r.status_code == 409, f"double submit -> 409 (got {r.status_code})")

    # --- Replace after submit -> 403 ---
    r = client.put(
        f"/api/documents/{cv_id}/replace",
        headers=auth,
        files={"file": ("cv_v3.pdf", io.BytesIO(_minimal_pdf()), "application/pdf")},
    )
    _check(r.status_code == 403, f"replace post-submit -> 403 (got {r.status_code})")

    # --- Upload after submit -> 403 ---
    r = client.post(
        "/api/documents/upload/cv",
        headers=auth,
        files={"file": ("cv_v4.pdf", io.BytesIO(_minimal_pdf()), "application/pdf")},
    )
    _check(r.status_code == 403, f"upload post-submit -> 403 (got {r.status_code})")

    # --- Files really live at uploads/{app_id}/ ---
    expected_dir = os.path.join(settings.upload_dir, str(app_id))
    _check(os.path.isdir(expected_dir), f"upload dir exists at {expected_dir}")
    files_on_disk = sorted(os.listdir(expected_dir))
    _check(
        set(files_on_disk) == {"cv.pdf", "khs.pdf", "ktm.jpg", "motivation_letter.pdf", "swot.pdf", "supporting_docs.pdf"},
        f"disk layout matches doc_type.ext convention (got {files_on_disk})",
    )

    print("\nAll backend application/document smoke checks passed.")
    _cleanup_user()
    return 0


if __name__ == "__main__":
    sys.exit(main())
