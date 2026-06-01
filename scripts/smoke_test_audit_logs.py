"""Smoke test for Phase 10 audit log listing.

Run:
    python -m scripts.smoke_test_audit_logs
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.database import SessionLocal, init_db
from backend.main import app as fastapi_app
from backend.models.audit import AuditLog
from backend.models.user import User, UserRole
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"
TEST_PASSWORD = "hunter2secure"
EMAIL_PREFIX = "smoke+audit_logs_"
SEEDED_DATE_RANGE = "date_from=2099-01-01&date_to=2099-01-10"


def _assert(condition: bool, message: str) -> int:
    print(f"{PASS if condition else FAIL} {message}")
    return 0 if condition else 1


def _email(suffix: str) -> str:
    return f"{EMAIL_PREFIX}{suffix}@example.com"


def _cleanup() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.email.like(f"{EMAIL_PREFIX}%")).all()
        user_ids = [user.id for user in users]
        if user_ids:
            db.query(AuditLog).filter(
                (AuditLog.recruiter_id.in_(user_ids))
                | (AuditLog.candidate_id.in_(user_ids))
            ).delete(synchronize_session=False)
            for user in users:
                db.delete(user)
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
    user = User(
        email=_email(suffix),
        password_hash=hash_password(TEST_PASSWORD),
        full_name=full_name,
        nim=nim,
        faculty="Fakultas Informatika" if role == UserRole.CANDIDATE else None,
        major="Data Science" if role == UserRole.CANDIDATE else None,
        year=2023 if role == UserRole.CANDIDATE else None,
        whatsapp="+6281234567890" if role == UserRole.CANDIDATE else None,
        role=role,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()
    return user


def _seed_data() -> dict[str, int]:
    db = SessionLocal()
    try:
        admin = _create_user(
            db,
            suffix="admin",
            role=UserRole.SUPER_ADMIN,
            full_name="Smoke Audit Admin",
        )
        recruiter = _create_user(
            db,
            suffix="recruiter",
            role=UserRole.RECRUITER,
            full_name="Smoke Audit Recruiter",
        )
        candidate_access = _create_user(
            db,
            suffix="candidate_access",
            role=UserRole.CANDIDATE,
            full_name="Smoke Audit Candidate Access",
            nim="1039800000001",
        )
        affected_one = _create_user(
            db,
            suffix="affected_one",
            role=UserRole.CANDIDATE,
            full_name="Smoke Audit Affected One",
            nim="1039800000002",
        )
        affected_two = _create_user(
            db,
            suffix="affected_two",
            role=UserRole.CANDIDATE,
            full_name="Smoke Audit Affected Two",
            nim="1039800000003",
        )

        base = datetime(2099, 1, 1, tzinfo=timezone.utc)
        logs = [
            AuditLog(
                recruiter_id=recruiter.id,
                candidate_id=affected_one.id,
                action_type="bulk_announcement",
                old_value="screening",
                new_value="announced_fail",
                reason=None,
                timestamp=base + timedelta(days=1),
            ),
            AuditLog(
                recruiter_id=recruiter.id,
                candidate_id=affected_one.id,
                action_type="document_verification",
                old_value="False",
                new_value="True",
                reason="doc_id=101; doc_type=cv",
                timestamp=base + timedelta(days=2),
            ),
            AuditLog(
                recruiter_id=recruiter.id,
                candidate_id=affected_two.id,
                action_type="document_review_finalized",
                old_value="document_review",
                new_value="verified",
                reason="all required documents accepted",
                timestamp=base + timedelta(days=3),
            ),
            AuditLog(
                recruiter_id=recruiter.id,
                candidate_id=affected_two.id,
                action_type="announcement",
                old_value="screening",
                new_value="announced_pass",
                reason="passed final selection",
                timestamp=base + timedelta(days=4),
            ),
            AuditLog(
                recruiter_id=admin.id,
                candidate_id=affected_one.id,
                action_type="score_override",
                old_value="72.0",
                new_value="80.0",
                reason="Manual review found stronger portfolio evidence.",
                timestamp=base + timedelta(days=5),
            ),
            AuditLog(
                recruiter_id=admin.id,
                candidate_id=affected_two.id,
                action_type="document_verification",
                old_value="password_hash=$2b$example",
                new_value="token=raw-secret",
                reason="reset_token=abc123",
                timestamp=base + timedelta(days=6),
            ),
        ]
        db.add_all(logs)
        db.commit()
        return {
            "admin_id": admin.id,
            "recruiter_id": recruiter.id,
            "candidate_access_id": candidate_access.id,
            "affected_one_id": affected_one.id,
            "affected_two_id": affected_two.id,
            "newest_log_id": logs[-1].id,
        }
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


def main() -> int:
    init_db()
    _cleanup()
    ids = _seed_data()
    client = TestClient(fastapi_app)
    failures = 0

    admin_auth = _login(client, "admin")
    recruiter_auth = _login(client, "recruiter")
    candidate_auth = _login(client, "candidate_access")

    response = client.get("/api/admin/audit-logs", headers=recruiter_auth)
    failures += _assert(response.status_code == 403, "recruiter audit log access -> 403")

    response = client.get("/api/admin/audit-logs", headers=candidate_auth)
    failures += _assert(response.status_code == 403, "candidate audit log access -> 403")

    response = client.get("/api/admin/audit-logs", headers=admin_auth)
    failures += _assert(response.status_code == 200, "super admin audit log access -> 200")

    response = client.get(
        f"/api/admin/audit-logs?{SEEDED_DATE_RANGE}",
        headers=admin_auth,
    )
    failures += _assert(response.status_code == 200, "seeded date range filter -> 200")
    data = response.json()["data"] if response.status_code == 200 else {}
    items = data.get("items", [])
    failures += _assert(data.get("total") == 6, "seeded range total is correct")
    failures += _assert(len(items) == 6, "seeded range returns all seeded rows")

    expected_actions = {
        "document_verification",
        "document_review_finalized",
        "announcement",
        "bulk_announcement",
        "score_override",
    }
    response_actions = {item.get("action_type") for item in items}
    failures += _assert(
        expected_actions.issubset(response_actions),
        "known audited actions are present",
    )

    timestamps = [item.get("timestamp") for item in items]
    failures += _assert(
        timestamps == sorted(timestamps, reverse=True),
        "default sorting is newest first",
    )

    newest = items[0] if items else {}
    failures += _assert(
        newest.get("id") == ids["newest_log_id"],
        "date-filtered list starts with newest seeded row",
    )
    failures += _assert(
        newest.get("actor", {}).get("user_id") == ids["admin_id"],
        "actor summary uses recruiter_id as actor",
    )
    failures += _assert(
        newest.get("affected_user", {}).get("user_id") == ids["affected_two_id"],
        "affected_user summary uses AuditLog.candidate_id as user id",
    )
    failures += _assert(
        newest.get("old_value") == "[redacted]"
        and newest.get("new_value") == "[redacted]"
        and newest.get("reason") == "[redacted]",
        "sensitive audit text is redacted",
    )

    serialized = json.dumps(data).lower()
    for marker in ["password_hash", "raw-secret", "reset_token", "$2b$example"]:
        failures += _assert(marker not in serialized, f"response omits sensitive marker {marker}")

    response = client.get(
        f"/api/admin/audit-logs?{SEEDED_DATE_RANGE}&limit=2&page=1",
        headers=admin_auth,
    )
    page_one = response.json()["data"] if response.status_code == 200 else {}
    failures += _assert(response.status_code == 200, "pagination page 1 -> 200")
    failures += _assert(page_one.get("total") == 6, "pagination keeps total count")
    failures += _assert(len(page_one.get("items", [])) == 2, "pagination limit=2 returns 2 rows")

    response = client.get(
        f"/api/admin/audit-logs?{SEEDED_DATE_RANGE}&limit=2&page=2",
        headers=admin_auth,
    )
    page_two = response.json()["data"] if response.status_code == 200 else {}
    failures += _assert(response.status_code == 200, "pagination page 2 -> 200")
    failures += _assert(page_two.get("page") == 2, "pagination echoes page=2")
    failures += _assert(len(page_two.get("items", [])) == 2, "pagination page 2 returns 2 rows")
    if page_one.get("items") and page_two.get("items"):
        failures += _assert(
            page_one["items"][0]["id"] != page_two["items"][0]["id"],
            "pagination pages are distinct",
        )

    response = client.get(
        f"/api/admin/audit-logs?{SEEDED_DATE_RANGE}&action_type=document_verification",
        headers=admin_auth,
    )
    filtered = response.json()["data"] if response.status_code == 200 else {}
    failures += _assert(response.status_code == 200, "action_type filter -> 200")
    failures += _assert(filtered.get("total") == 2, "action_type filter total")
    failures += _assert(
        all(item.get("action_type") == "document_verification" for item in filtered.get("items", [])),
        "action_type filter scopes every item",
    )

    response = client.get(
        f"/api/admin/audit-logs?{SEEDED_DATE_RANGE}&recruiter_id={ids['recruiter_id']}",
        headers=admin_auth,
    )
    actor_filtered = response.json()["data"] if response.status_code == 200 else {}
    failures += _assert(response.status_code == 200, "actor id filter -> 200")
    failures += _assert(actor_filtered.get("total") == 4, "actor id filter total")
    failures += _assert(
        all(
            item.get("actor", {}).get("user_id") == ids["recruiter_id"]
            for item in actor_filtered.get("items", [])
        ),
        "actor id filter scopes every item",
    )

    response = client.get(
        f"/api/admin/audit-logs?{SEEDED_DATE_RANGE}&candidate_id={ids['affected_one_id']}",
        headers=admin_auth,
    )
    affected_filtered = response.json()["data"] if response.status_code == 200 else {}
    failures += _assert(response.status_code == 200, "affected user id filter -> 200")
    failures += _assert(affected_filtered.get("total") == 3, "affected user id filter total")
    failures += _assert(
        all(
            item.get("affected_user", {}).get("user_id") == ids["affected_one_id"]
            for item in affected_filtered.get("items", [])
        ),
        "affected user id filter scopes every item",
    )

    print()
    if failures == 0:
        print("Audit log smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    return failures


if __name__ == "__main__":
    sys.exit(main())
