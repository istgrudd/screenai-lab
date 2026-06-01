"""Smoke test for Phase 2C Task 12.4: POST /api/announcements/bulk.

Covers:
  * POST /api/announcements/bulk with valid payload → 200
  * passed_application_ids get announced_pass
  * remaining evaluated apps get announced_fail
  * SUBMITTED apps are NOT touched
  * audit_logs entries created for each status change
  * invalid division → 422
  * invalid app_id for division → 400
  * candidate cannot call bulk announce → 403
  * GET /api/announcements/my returns correct result for both pass and fail

Run:
    python -m scripts.smoke_test_bulk_announce
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.audit import AuditLog
from backend.models.email_notification import EmailNotification
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"

ADMIN_EMAIL = "smoke+bulk_admin@example.com"
RECRUITER_EMAIL = "smoke+bulk_recruiter@example.com"
PASS_EMAIL = "smoke+bulk_pass@example.com"
FAIL_EMAIL = "smoke+bulk_fail@example.com"
PEND_EMAIL = "smoke+bulk_pending@example.com"
OTHER_DIV_EMAIL = "smoke+bulk_other@example.com"
TEST_PASSWORD = "hunter2secure"
PERIOD_NAME = "smoke+bulk cycle"


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _cleanup() -> None:
    db = SessionLocal()
    try:
        emails = (
            ADMIN_EMAIL,
            RECRUITER_EMAIL,
            PASS_EMAIL,
            FAIL_EMAIL,
            PEND_EMAIL,
            OTHER_DIV_EMAIL,
        )
        db.query(EmailNotification).filter(
            EmailNotification.to_email.in_(emails)
        ).delete(synchronize_session=False)
        users = db.query(User).filter(User.email.in_(emails)).all()
        user_ids = [u.id for u in users]

        if user_ids:
            db.query(AuditLog).filter(
                (AuditLog.recruiter_id.in_(user_ids))
                | (AuditLog.candidate_id.in_(user_ids))
            ).delete(synchronize_session=False)

            db.query(Application).filter(
                Application.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.query(RecruitmentPeriod).filter(
                RecruitmentPeriod.created_by.in_(user_ids)
            ).delete(synchronize_session=False)

            for u in users:
                db.delete(u)

        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.name == PERIOD_NAME
        ).delete(synchronize_session=False)

        db.commit()
    finally:
        db.close()


def main() -> int:
    _cleanup()
    failures = 0
    client = TestClient(fastapi_app)

    # ------------------------------------------------------------------
    # Setup: super admin, recruiter, period, 4 candidates.
    # ------------------------------------------------------------------
    db = SessionLocal()
    admin = User(
        email=ADMIN_EMAIL,
        password_hash=hash_password(TEST_PASSWORD),
        full_name="Bulk Admin",
        role=UserRole.SUPER_ADMIN,
        is_active=True,
    )
    recruiter = User(
        email=RECRUITER_EMAIL,
        password_hash=hash_password(TEST_PASSWORD),
        full_name="Bulk Recruiter",
        role=UserRole.RECRUITER,
        is_active=True,
    )
    candidates_seed = [
        (PASS_EMAIL, "Bulk Pass Candidate", "1039876600001"),
        (FAIL_EMAIL, "Bulk Fail Candidate", "1039876600002"),
        (PEND_EMAIL, "Bulk Pending Candidate", "1039876600003"),
        (OTHER_DIV_EMAIL, "Bulk Other Div", "1039876600004"),
    ]
    seed_now = datetime.now(timezone.utc)
    cand_users = [
        User(
            email=email,
            password_hash=hash_password(TEST_PASSWORD),
            full_name=name,
            nim=nim,
            faculty="Fakultas Informatika",
            major="Informatika",
            year=2023,
            role=UserRole.CANDIDATE,
            is_active=True,
            email_verified_at=seed_now,
        )
        for email, name, nim in candidates_seed
    ]
    db.add_all([admin, recruiter, *cand_users])
    db.commit()
    for u in [admin, recruiter, *cand_users]:
        db.refresh(u)

    # Active period (deactivate any existing first).
    # Task 13.2.3 — bulk announce requires current_phase == ANNOUNCEMENT for
    # non-super-admin recruiters, so set submission_end_date and
    # evaluation_end_date in the past.
    db.query(RecruitmentPeriod).filter(
        RecruitmentPeriod.is_active == True  # noqa: E712
    ).update({RecruitmentPeriod.is_active: False}, synchronize_session=False)
    now = datetime.now(timezone.utc)
    period = RecruitmentPeriod(
        name=PERIOD_NAME,
        start_date=now - timedelta(days=14),
        submission_end_date=now - timedelta(days=7),
        evaluation_end_date=now - timedelta(days=1),
        end_date=now + timedelta(days=7),
        is_active=True,
        threshold_n=2,
        created_by=admin.id,
    )
    db.add(period)
    db.commit()
    db.refresh(period)
    period_id = period.id  # capture scalars before session close
    recruiter_id = recruiter.id
    pass_user_id = cand_users[0].id
    fail_user_id = cand_users[1].id
    pend_user_id = cand_users[2].id
    other_user_id = cand_users[3].id

    # 3 apps in big_data + 1 in cyber_security (other division).
    apps = {
        "pass": Application(
            user_id=pass_user_id,
            division=Division.BIG_DATA,
            status=ApplicationStatus.SCREENING,
            period_id=period_id,
            submitted_at=now,
        ),
        "fail": Application(
            user_id=fail_user_id,
            division=Division.BIG_DATA,
            status=ApplicationStatus.SCREENING,
            period_id=period_id,
            submitted_at=now,
        ),
        "pend": Application(
            user_id=pend_user_id,
            division=Division.BIG_DATA,
            status=ApplicationStatus.SUBMITTED,
            period_id=period_id,
            submitted_at=now,
        ),
        "other": Application(
            user_id=other_user_id,
            division=Division.CYBER_SECURITY,
            status=ApplicationStatus.SCREENING,
            period_id=period_id,
            submitted_at=now,
        ),
    }
    db.add_all(apps.values())
    db.commit()
    for a in apps.values():
        db.refresh(a)
    pass_app_id = apps["pass"].id
    fail_app_id = apps["fail"].id
    pend_app_id = apps["pend"].id
    other_app_id = apps["other"].id
    db.close()

    # Login each role.
    def _login(email: str) -> dict:
        r = client.post(
            "/api/auth/login",
            json={"email": email, "password": TEST_PASSWORD},
        )
        return {"Authorization": f"Bearer {r.json()['data']['access_token']}"}

    rec_auth = _login(RECRUITER_EMAIL)
    pass_auth = _login(PASS_EMAIL)
    fail_auth = _login(FAIL_EMAIL)

    # ------------------------------------------------------------------
    # T1: candidate cannot call bulk announce → 403
    # ------------------------------------------------------------------
    r = client.post(
        "/api/announcements/bulk",
        headers=pass_auth,
        json={
            "division": "big_data",
            "period_id": period_id,
            "passed_application_ids": [pass_app_id],
        },
    )
    failures += _assert(
        r.status_code == 403,
        f"candidate POST /announcements/bulk -> 403 (got {r.status_code})",
    )

    # ------------------------------------------------------------------
    # T2: invalid division (not in enum) → 422
    # ------------------------------------------------------------------
    r = client.post(
        "/api/announcements/bulk",
        headers=rec_auth,
        json={
            "division": "not_a_division",
            "period_id": period_id,
            "passed_application_ids": [pass_app_id],
        },
    )
    failures += _assert(
        r.status_code == 422,
        f"invalid division -> 422 (got {r.status_code})",
    )

    # ------------------------------------------------------------------
    # T3: app id from another division → 400
    # ------------------------------------------------------------------
    r = client.post(
        "/api/announcements/bulk",
        headers=rec_auth,
        json={
            "division": "big_data",
            "period_id": period_id,
            "passed_application_ids": [other_app_id],
        },
    )
    failures += _assert(
        r.status_code == 400,
        f"out-of-scope app id -> 400 (got {r.status_code}: {r.text})",
    )

    # SUBMITTED app id (not yet evaluated) is also out-of-scope → 400.
    r = client.post(
        "/api/announcements/bulk",
        headers=rec_auth,
        json={
            "division": "big_data",
            "period_id": period_id,
            "passed_application_ids": [pend_app_id],
        },
    )
    failures += _assert(
        r.status_code == 400,
        f"SUBMITTED app id rejected -> 400 (got {r.status_code})",
    )

    # ------------------------------------------------------------------
    # T4: valid payload → 200, correct counts
    # ------------------------------------------------------------------
    r = client.post(
        "/api/announcements/bulk",
        headers=rec_auth,
        json={
            "division": "big_data",
            "period_id": period_id,
            "passed_application_ids": [pass_app_id],
        },
    )
    failures += _assert(
        r.status_code == 200,
        f"bulk announce valid -> 200 (got {r.status_code}: {r.text})",
    )
    body = r.json()["data"]
    failures += _assert(
        body["announced_pass"] == 1,
        f"announced_pass count == 1 (got {body['announced_pass']})",
    )
    failures += _assert(
        body["announced_fail"] == 1,
        f"announced_fail count == 1 (got {body['announced_fail']})",
    )

    # ------------------------------------------------------------------
    # T5: DB state — pass/fail/pending/other-div verified.
    # ------------------------------------------------------------------
    db = SessionLocal()
    try:
        pass_app = db.query(Application).filter(Application.id == pass_app_id).first()
        fail_app = db.query(Application).filter(Application.id == fail_app_id).first()
        pend_app = db.query(Application).filter(Application.id == pend_app_id).first()
        other_app = db.query(Application).filter(Application.id == other_app_id).first()

        failures += _assert(
            pass_app.status == ApplicationStatus.ANNOUNCED_PASS,
            f"pass app -> announced_pass (got {pass_app.status})",
        )
        failures += _assert(
            fail_app.status == ApplicationStatus.ANNOUNCED_FAIL,
            f"fail app -> announced_fail (got {fail_app.status})",
        )
        failures += _assert(
            pend_app.status == ApplicationStatus.SUBMITTED,
            f"SUBMITTED app untouched (got {pend_app.status})",
        )
        failures += _assert(
            other_app.status == ApplicationStatus.SCREENING,
            f"other-division app untouched (got {other_app.status})",
        )

        # ------------------------------------------------------------------
        # T6: audit logs — one bulk_announcement entry per status change.
        # ------------------------------------------------------------------
        bulk_logs = (
            db.query(AuditLog)
            .filter(AuditLog.action_type == "bulk_announcement")
            .filter(AuditLog.candidate_id.in_([pass_user_id, fail_user_id]))
            .all()
        )
        failures += _assert(
            len(bulk_logs) == 2,
            f"audit_logs has 2 bulk_announcement entries (got {len(bulk_logs)})",
        )
        log_by_candidate = {l.candidate_id: l for l in bulk_logs}
        pass_log = log_by_candidate.get(pass_user_id)
        fail_log = log_by_candidate.get(fail_user_id)
        failures += _assert(
            pass_log is not None
            and pass_log.new_value == "announced_pass"
            and pass_log.old_value == "screening"
            and pass_log.recruiter_id == recruiter_id,
            "audit_log for pass candidate has correct fields",
        )
        failures += _assert(
            fail_log is not None
            and fail_log.new_value == "announced_fail"
            and fail_log.old_value == "screening"
            and fail_log.recruiter_id == recruiter_id,
            "audit_log for fail candidate has correct fields",
        )
    finally:
        db.close()

    # ------------------------------------------------------------------
    # T7: GET /api/announcements/my for the pass candidate.
    # ------------------------------------------------------------------
    r = client.get("/api/announcements/my", headers=pass_auth)
    failures += _assert(
        r.status_code == 200,
        f"pass GET /announcements/my -> 200 (got {r.status_code})",
    )
    pdata = r.json()["data"]
    failures += _assert(
        pdata["status"] == "announced_pass" and pdata["result"] == "pass",
        f"pass candidate sees pass result (got {pdata})",
    )

    # ------------------------------------------------------------------
    # T8: GET /api/announcements/my for the fail candidate.
    # ------------------------------------------------------------------
    r = client.get("/api/announcements/my", headers=fail_auth)
    failures += _assert(
        r.status_code == 200,
        f"fail GET /announcements/my -> 200 (got {r.status_code})",
    )
    fdata = r.json()["data"]
    failures += _assert(
        fdata["status"] == "announced_fail" and fdata["result"] == "fail",
        f"fail candidate sees fail result (got {fdata})",
    )

    # ------------------------------------------------------------------
    # T9: re-running with the same payload should be idempotent — no new
    # status changes, so no new audit_log entries.
    # ------------------------------------------------------------------
    r = client.post(
        "/api/announcements/bulk",
        headers=rec_auth,
        json={
            "division": "big_data",
            "period_id": period_id,
            "passed_application_ids": [pass_app_id],
        },
    )
    failures += _assert(
        r.status_code == 200,
        f"idempotent re-publish -> 200 (got {r.status_code})",
    )
    db = SessionLocal()
    try:
        bulk_logs = (
            db.query(AuditLog)
            .filter(AuditLog.action_type == "bulk_announcement")
            .filter(AuditLog.candidate_id.in_([pass_user_id, fail_user_id]))
            .all()
        )
        failures += _assert(
            len(bulk_logs) == 2,
            f"no extra audit_logs on idempotent re-publish (got {len(bulk_logs)})",
        )
    finally:
        db.close()

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
