"""Smoke test for Phase 11 email notification lifecycle.

Run:
    python -m scripts.smoke_test_email_notifications
"""

from __future__ import annotations

import io
import json
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi.testclient import TestClient

import backend.services.notification_service as notification_service
from backend.config import settings
from backend.database import SessionLocal, init_db
from backend.main import app as fastapi_app
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
from backend.models.email_notification import EmailNotification
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole
from backend.services.email_service import (
    EmailSendResult,
    clear_disabled_email_outbox,
    get_disabled_email_outbox,
)
from backend.utils.file_storage import purge_application_dir
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"
TEST_PASSWORD = "hunter2secure"
EMAIL_PREFIX = "smoke+email_notifications_"
EMAIL_PREFIX_QUERY = quote(EMAIL_PREFIX, safe="")
PERIOD_NAME = "smoke+email notifications period"
REJECTION_REASON = "KHS tidak terbaca dengan jelas."


def _email(suffix: str) -> str:
    return f"{EMAIL_PREFIX}{suffix}@example.com"


def _minimal_pdf(text: str = "document") -> bytes:
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<<>>stream\n"
        + text.encode("utf-8")
        + b"\nendstream endobj\ntrailer<<>>\n%%EOF\n"
    )


def _check(condition: bool, message: str) -> int:
    print(f"{PASS if condition else FAIL} {message}")
    return 0 if condition else 1


def _cleanup() -> None:
    db = SessionLocal()
    try:
        db.query(EmailNotification).filter(
            EmailNotification.to_email.like(f"{EMAIL_PREFIX}%")
        ).delete(synchronize_session=False)

        users = db.query(User).filter(User.email.like(f"{EMAIL_PREFIX}%")).all()
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


def _create_user(
    db,
    *,
    suffix: str,
    role: UserRole,
    full_name: str,
    nim: str | None = None,
) -> User:
    now = datetime.now(timezone.utc)
    user = User(
        email=_email(suffix),
        password_hash=hash_password(TEST_PASSWORD),
        full_name=full_name,
        nim=nim,
        faculty="Fakultas Informatika" if role == UserRole.CANDIDATE else None,
        major="Data Science" if role == UserRole.CANDIDATE else None,
        year=2023 if role == UserRole.CANDIDATE else None,
        ipk=3.5 if role == UserRole.CANDIDATE else None,
        whatsapp="+6281234567890" if role == UserRole.CANDIDATE else None,
        role=role,
        is_active=True,
        email_verified_at=now,
    )
    db.add(user)
    db.flush()
    return user


def _seed_users_and_period() -> dict[str, int]:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        admin = _create_user(
            db,
            suffix="admin",
            role=UserRole.SUPER_ADMIN,
            full_name="Smoke Email Admin",
        )
        recruiter = _create_user(
            db,
            suffix="recruiter",
            role=UserRole.RECRUITER,
            full_name="Smoke Email Recruiter",
        )
        submit_candidate = _create_user(
            db,
            suffix="candidate_submit",
            role=UserRole.CANDIDATE,
            full_name="Smoke Email Submit Candidate",
            nim="1039900010001",
        )
        single_candidate = _create_user(
            db,
            suffix="candidate_single",
            role=UserRole.CANDIDATE,
            full_name="Smoke Email Single Candidate",
            nim="1039900010002",
        )
        bulk_pass_candidate = _create_user(
            db,
            suffix="candidate_bulk_pass",
            role=UserRole.CANDIDATE,
            full_name="Smoke Email Bulk Pass",
            nim="1039900010003",
        )
        bulk_fail_candidate = _create_user(
            db,
            suffix="candidate_bulk_fail",
            role=UserRole.CANDIDATE,
            full_name="Smoke Email Bulk Fail",
            nim="1039900010004",
        )
        failure_candidate = _create_user(
            db,
            suffix="candidate_failure",
            role=UserRole.CANDIDATE,
            full_name="Smoke Email Failure Candidate",
            nim="1039900010005",
        )

        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.is_active == True  # noqa: E712
        ).update({RecruitmentPeriod.is_active: False}, synchronize_session=False)
        period = RecruitmentPeriod(
            name=PERIOD_NAME,
            start_date=now - timedelta(hours=1),
            submission_end_date=now + timedelta(days=1),
            evaluation_end_date=now + timedelta(days=2),
            end_date=now + timedelta(days=3),
            is_active=True,
            threshold_n=1,
            created_by=admin.id,
        )
        db.add(period)
        db.flush()

        direct_apps = {
            "single_app": Application(
                user_id=single_candidate.id,
                division=Division.CYBER_SECURITY,
                status=ApplicationStatus.SCREENING,
                period_id=period.id,
                submitted_at=now,
            ),
            "bulk_pass_app": Application(
                user_id=bulk_pass_candidate.id,
                division=Division.GIS,
                status=ApplicationStatus.SCREENING,
                period_id=period.id,
                submitted_at=now,
            ),
            "bulk_fail_app": Application(
                user_id=bulk_fail_candidate.id,
                division=Division.GIS,
                status=ApplicationStatus.SCREENING,
                period_id=period.id,
                submitted_at=now,
            ),
            "failure_app": Application(
                user_id=failure_candidate.id,
                division=Division.GAME_TECH,
                status=ApplicationStatus.SCREENING,
                period_id=period.id,
                submitted_at=now,
            ),
        }
        db.add_all(direct_apps.values())
        db.commit()

        ids = {
            "admin_id": admin.id,
            "recruiter_id": recruiter.id,
            "submit_candidate_id": submit_candidate.id,
            "period_id": period.id,
        }
        for name, app in direct_apps.items():
            ids[f"{name}_id"] = app.id
        return ids
    finally:
        db.close()


def _login(client: TestClient, suffix: str) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"email": _email(suffix), "password": TEST_PASSWORD},
    )
    if response.status_code != 200:
        raise AssertionError(
            f"login {suffix} failed: {response.status_code} {response.text}"
        )
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
        if response.status_code != 201:
            raise AssertionError(
                f"upload {doc_type.value} failed: {response.status_code} {response.text}"
            )


def _notification_count(
    notification_type: str,
    *,
    related_application_id: int | None = None,
) -> int:
    db = SessionLocal()
    try:
        query = db.query(EmailNotification).filter(
            EmailNotification.to_email.like(f"{EMAIL_PREFIX}%"),
            EmailNotification.notification_type == notification_type,
        )
        if related_application_id is not None:
            query = query.filter(
                EmailNotification.related_application_id == related_application_id
            )
        return query.count()
    finally:
        db.close()


def _latest_notification(
    notification_type: str,
    *,
    related_application_id: int | None = None,
) -> EmailNotification | None:
    db = SessionLocal()
    try:
        query = db.query(EmailNotification).filter(
            EmailNotification.to_email.like(f"{EMAIL_PREFIX}%"),
            EmailNotification.notification_type == notification_type,
        )
        if related_application_id is not None:
            query = query.filter(
                EmailNotification.related_application_id == related_application_id
            )
        row = query.order_by(EmailNotification.created_at.desc()).first()
        if row is None:
            return None
        db.expunge(row)
        return row
    finally:
        db.close()


def _set_period_to_announcement(period_id: int) -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        period = db.query(RecruitmentPeriod).filter(RecruitmentPeriod.id == period_id).first()
        period.start_date = now - timedelta(days=14)
        period.submission_end_date = now - timedelta(days=7)
        period.evaluation_end_date = now - timedelta(days=1)
        period.end_date = now + timedelta(days=7)
        db.commit()
    finally:
        db.close()


def _assert_no_sensitive_notification_storage() -> int:
    failures = 0
    db = SessionLocal()
    try:
        rows = db.query(EmailNotification).filter(
            EmailNotification.to_email.like(f"{EMAIL_PREFIX}%")
        ).all()
        serialized = json.dumps(
            [
                {
                    "type": row.notification_type,
                    "to_email": row.to_email,
                    "subject": row.subject,
                    "provider": row.provider,
                    "provider_message_id": row.provider_message_id,
                    "status": row.status,
                    "error_message": row.error_message,
                }
                for row in rows
            ],
            default=str,
        ).lower()
        for marker in ["password", "jwt", "secret", "token", "reset link", "verification link"]:
            failures += _check(marker not in serialized, f"notification logs omit {marker}")

        model_columns = set(EmailNotification.__table__.columns.keys())
        for forbidden_column in ["body", "html", "text", "raw_payload"]:
            failures += _check(
                forbidden_column not in model_columns,
                f"email_notifications has no {forbidden_column} column",
            )
    finally:
        db.close()
    return failures


def main() -> int:
    init_db()
    settings.email_enabled = False
    settings.environment = "development"
    clear_disabled_email_outbox()
    _cleanup()
    ids = _seed_users_and_period()

    client = TestClient(fastapi_app)
    admin_auth = _login(client, "admin")
    recruiter_auth = _login(client, "recruiter")
    candidate_auth = _login(client, "candidate_submit")
    failures = 0

    response = client.post(
        "/api/applications",
        headers=candidate_auth,
        json={"division": "big_data"},
    )
    failures += _check(response.status_code == 201, "candidate creates application")
    app_id = response.json()["data"]["id"] if response.status_code == 201 else None
    failures += _check(
        app_id is not None
        and _notification_count(
            "application_submitted",
            related_application_id=app_id,
        )
        == 0,
        "draft application creation does not log application_submitted",
    )
    failures += _check(
        len(get_disabled_email_outbox()) == 0,
        "draft application creation does not capture submit email",
    )

    _upload_all_documents(client, candidate_auth)
    response = client.post(f"/api/applications/{app_id}/submit", headers=candidate_auth)
    failures += _check(response.status_code == 200, "application submit still succeeds")
    failures += _check(
        response.json()["data"]["status"] == "document_review",
        "submitted application enters document_review",
    )
    submitted_notification = _latest_notification(
        "application_submitted",
        related_application_id=app_id,
    )
    failures += _check(
        _notification_count(
            "application_submitted",
            related_application_id=app_id,
        )
        == 1,
        "exactly one application_submitted notification logged after final submit",
    )
    failures += _check(
        submitted_notification is not None,
        "application_submitted notification logged after final submit",
    )
    failures += _check(
        submitted_notification
        and submitted_notification.to_email == _email("candidate_submit"),
        "application_submitted notification targets submitting candidate",
    )
    failures += _check(
        submitted_notification and submitted_notification.status == "captured",
        "application_submitted status is captured in disabled dev mode",
    )
    submit_outbox = get_disabled_email_outbox()
    failures += _check(
        len(submit_outbox) == 1,
        "disabled dev outbox captured one application_submitted email",
    )
    failures += _check(
        bool(submit_outbox)
        and submit_outbox[0].get("to") == _email("candidate_submit")
        and submit_outbox[0].get("subject") == "Your ScreenAI Lab application was received",
        "disabled dev outbox captured application_submitted email for candidate",
    )

    response = client.post(f"/api/applications/{app_id}/submit", headers=candidate_auth)
    failures += _check(response.status_code == 409, "resubmitting submitted application -> 409")
    failures += _check(
        _notification_count(
            "application_submitted",
            related_application_id=app_id,
        )
        == 1,
        "resubmitting submitted application does not duplicate notification",
    )

    response = client.get(f"/api/documents/{app_id}", headers=recruiter_auth)
    docs = response.json()["data"]["documents"] if response.status_code == 200 else []
    docs_by_type = {doc["doc_type"]: doc for doc in docs}
    khs_doc = docs_by_type["khs"]
    response = client.put(
        f"/api/documents/{khs_doc['id']}/review",
        headers=recruiter_auth,
        json={"status": "rejected", "reason": REJECTION_REASON},
    )
    failures += _check(response.status_code == 200, "individual document rejection succeeds")
    failures += _check(
        _notification_count("document_rejected", related_application_id=app_id) == 0,
        "document_rejected is not sent before finalize",
    )

    for doc in docs:
        if doc["doc_type"] == "khs":
            continue
        response = client.put(
            f"/api/documents/{doc['id']}/review",
            headers=recruiter_auth,
            json={"status": "verified"},
        )
        failures += _check(response.status_code == 200, f"verify {doc['doc_type']} succeeds")

    response = client.post(
        f"/api/applications/{app_id}/finalize-document-review",
        headers=recruiter_auth,
    )
    failures += _check(response.status_code == 200, "finalize rejected review succeeds")
    failures += _check(
        response.json()["data"]["status"] == "correction_requested",
        "finalized rejected review requests correction",
    )
    rejected_notification = _latest_notification(
        "document_rejected",
        related_application_id=app_id,
    )
    failures += _check(
        rejected_notification is not None,
        "document_rejected notification logged after finalize",
    )
    failures += _check(
        rejected_notification and rejected_notification.status == "captured",
        "document_rejected status is captured",
    )

    response = client.post(
        "/api/announcements",
        headers=recruiter_auth,
        json={
            "application_id": ids["single_app_id"],
            "result": "pass",
            "notes": "Selamat, lanjutkan instruksi dari portal.",
        },
    )
    failures += _check(response.status_code == 200, "single announcement succeeds")
    single_notification = _latest_notification(
        "announcement_published",
        related_application_id=ids["single_app_id"],
    )
    failures += _check(
        single_notification is not None,
        "single announcement notification logged",
    )
    failures += _check(
        single_notification and single_notification.status == "captured",
        "single announcement status is captured",
    )

    original_send_email = notification_service.send_email

    def failing_send_email(**_kwargs):
        return EmailSendResult(
            success=False,
            provider="mock",
            error="Email provider request failed.",
        )

    notification_service.send_email = failing_send_email
    try:
        response = client.post(
            "/api/announcements",
            headers=recruiter_auth,
            json={
                "application_id": ids["failure_app_id"],
                "result": "fail",
                "notes": "Hasil resmi tersedia di portal.",
            },
        )
    finally:
        notification_service.send_email = original_send_email

    failures += _check(
        response.status_code == 200,
        "announcement main workflow succeeds when email provider fails",
    )
    failed_notification = _latest_notification(
        "announcement_published",
        related_application_id=ids["failure_app_id"],
    )
    failures += _check(
        failed_notification is not None and failed_notification.status == "failed",
        "failed provider result is logged as failed",
    )

    _set_period_to_announcement(ids["period_id"])
    response = client.post(
        "/api/announcements/bulk",
        headers=recruiter_auth,
        json={
            "division": "gis",
            "period_id": ids["period_id"],
            "passed_application_ids": [ids["bulk_pass_app_id"]],
        },
    )
    failures += _check(response.status_code == 200, "bulk announcement succeeds")
    failures += _check(
        _notification_count(
            "announcement_published",
            related_application_id=ids["bulk_pass_app_id"],
        )
        == 1,
        "bulk pass candidate gets one notification",
    )
    failures += _check(
        _notification_count(
            "announcement_published",
            related_application_id=ids["bulk_fail_app_id"],
        )
        == 1,
        "bulk fail candidate gets one notification",
    )

    outbox = get_disabled_email_outbox()
    failures += _check(len(outbox) == 5, "disabled dev outbox captured five successful emails")
    failures += _check(
        all(item.get("provider") == "disabled" for item in outbox),
        "captured outbox uses disabled provider",
    )

    response = client.get("/api/admin/email-notifications", headers=recruiter_auth)
    failures += _check(response.status_code == 403, "recruiter email log access -> 403")

    response = client.get("/api/admin/email-notifications", headers=candidate_auth)
    failures += _check(response.status_code == 403, "candidate email log access -> 403")

    response = client.get(
        f"/api/admin/email-notifications?to_email={EMAIL_PREFIX_QUERY}",
        headers=admin_auth,
    )
    failures += _check(response.status_code == 200, "super admin email log access -> 200")
    admin_data = response.json()["data"] if response.status_code == 200 else {}
    failures += _check(admin_data.get("total") == 6, "admin endpoint returns all six seeded logs")

    response = client.get(
        f"/api/admin/email-notifications?to_email={EMAIL_PREFIX_QUERY}&limit=2&page=1",
        headers=admin_auth,
    )
    page_one = response.json()["data"] if response.status_code == 200 else {}
    failures += _check(response.status_code == 200, "email log pagination page 1 -> 200")
    failures += _check(page_one.get("total") == 6, "email log pagination keeps total")
    failures += _check(len(page_one.get("items", [])) == 2, "email log limit=2 returns two rows")

    response = client.get(
        (
            f"/api/admin/email-notifications?to_email={EMAIL_PREFIX_QUERY}"
            "&notification_type=application_submitted"
        ),
        headers=admin_auth,
    )
    filtered = response.json()["data"] if response.status_code == 200 else {}
    failures += _check(response.status_code == 200, "notification_type filter -> 200")
    failures += _check(filtered.get("total") == 1, "notification_type filter total")

    response = client.get(
        f"/api/admin/email-notifications?to_email={EMAIL_PREFIX_QUERY}&status=captured",
        headers=admin_auth,
    )
    status_filtered = response.json()["data"] if response.status_code == 200 else {}
    failures += _check(response.status_code == 200, "status filter -> 200")
    failures += _check(status_filtered.get("total") == 5, "captured status filter total")

    failures += _assert_no_sensitive_notification_storage()

    serialized_admin = json.dumps(admin_data, default=str).lower()
    for marker in ["password", "jwt", "secret", "token", "reset link", "verification link"]:
        failures += _check(marker not in serialized_admin, f"admin response omits {marker}")

    print()
    if failures == 0:
        print("Email notification lifecycle smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    clear_disabled_email_outbox()
    return failures


if __name__ == "__main__":
    sys.exit(main())
