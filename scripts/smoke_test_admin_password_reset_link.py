"""Smoke test for admin-assisted password reset link flow.

Run:
    python -m scripts.smoke_test_admin_password_reset_link
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
import re
import sys
from urllib.parse import unquote

os.environ["EMAIL_ENABLED"] = "false"
os.environ["ENVIRONMENT"] = "development"
os.environ["PUBLIC_FRONTEND_URL"] = "http://testserver"
os.environ["PASSWORD_RESET_COOLDOWN_SECONDS"] = "0"

from fastapi.testclient import TestClient

from backend.database import SessionLocal, init_db
from backend.main import app
from backend.models.audit import AuditLog
from backend.models.password_reset import PasswordResetLink
from backend.models.user import User, UserRole
from backend.services.email_service import (
    clear_disabled_email_outbox,
    get_disabled_email_outbox,
)
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"
EMAIL_PREFIX = "smoke+admin_reset_link_"
OLD_PASSWORD = "oldpasswordsecure"
DIRECT_PASSWORD = "directadminnewsecure"
NEW_PASSWORD = "userchosennewsecure"


def _check(condition: bool, message: str) -> int:
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
            db.query(PasswordResetLink).filter(
                PasswordResetLink.user_id.in_(user_ids)
            ).delete(synchronize_session=False)
            db.query(User).filter(User.id.in_(user_ids)).delete(
                synchronize_session=False
            )
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
    is_active: bool = True,
) -> User:
    now = datetime.now(timezone.utc)
    user = User(
        email=_email(suffix),
        password_hash=hash_password(OLD_PASSWORD),
        full_name=full_name,
        nim=nim,
        faculty="Fakultas Informatika" if role == UserRole.CANDIDATE else None,
        major="Data Science" if role == UserRole.CANDIDATE else None,
        year=2023 if role == UserRole.CANDIDATE else None,
        whatsapp="+6281234567890" if role == UserRole.CANDIDATE else None,
        role=role,
        is_active=is_active,
        email_verified_at=now,
    )
    db.add(user)
    db.flush()
    return user


def _seed_users() -> dict[str, int]:
    db = SessionLocal()
    try:
        admin = _create_user(
            db,
            suffix="admin",
            role=UserRole.SUPER_ADMIN,
            full_name="Smoke Admin Reset Link Admin",
        )
        recruiter = _create_user(
            db,
            suffix="recruiter",
            role=UserRole.RECRUITER,
            full_name="Smoke Admin Reset Link Recruiter",
        )
        candidate = _create_user(
            db,
            suffix="candidate",
            role=UserRole.CANDIDATE,
            full_name="Smoke Admin Reset Link Candidate",
            nim="1039810000001",
        )
        target = _create_user(
            db,
            suffix="target",
            role=UserRole.CANDIDATE,
            full_name="Smoke Admin Reset Link Target",
            nim="1039810000002",
        )
        inactive = _create_user(
            db,
            suffix="inactive",
            role=UserRole.CANDIDATE,
            full_name="Smoke Admin Reset Link Inactive",
            nim="1039810000003",
            is_active=False,
        )
        db.commit()
        return {
            "admin": admin.id,
            "recruiter": recruiter.id,
            "candidate": candidate.id,
            "target": target.id,
            "inactive": inactive.id,
        }
    finally:
        db.close()


def _login(client: TestClient, suffix: str, password: str = OLD_PASSWORD) -> str:
    response = client.post(
        "/api/auth/login",
        json={"email": _email(suffix), "password": password},
    )
    if response.status_code != 200:
        raise AssertionError(
            f"login {suffix} failed: {response.status_code} {response.text}"
        )
    return response.json()["data"]["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _latest_reset_code_for(email: str) -> str:
    for message in reversed(get_disabled_email_outbox()):
        if message.get("to") != email:
            continue
        text = f"{message.get('text', '')}\n{message.get('html', '')}"
        match = re.search(r"code=([A-Za-z0-9_\-%]+)", text)
        if match:
            return unquote(match.group(1))
    raise AssertionError(f"[FAIL] no captured reset email for {email}")


def _contains_sensitive_marker(value: object) -> bool:
    text = str(value or "").lower()
    markers = [
        "http://",
        "https://",
        "code=",
        "token",
        "secret",
        "password",
        "password_hash",
        "jwt",
        "$2b$",
        "traceback",
    ]
    return any(marker in text for marker in markers)


def main() -> int:
    init_db()
    _cleanup()
    clear_disabled_email_outbox()
    ids = _seed_users()
    failures = 0
    client = TestClient(app)

    admin_token = _login(client, "admin")
    recruiter_token = _login(client, "recruiter")
    candidate_token = _login(client, "candidate")
    target_old_token = _login(client, "target")

    endpoint = f"/api/auth/admin/users/{ids['target']}/send-password-reset"

    response = client.post(endpoint, headers=_auth(recruiter_token))
    failures += _check(response.status_code == 403, "recruiter send reset link -> 403")

    response = client.post(endpoint, headers=_auth(candidate_token))
    failures += _check(response.status_code == 403, "candidate send reset link -> 403")

    response = client.post(
        f"/api/auth/admin/users/{ids['inactive']}/send-password-reset",
        headers=_auth(admin_token),
    )
    failures += _check(response.status_code == 409, "inactive target send reset link -> 409")

    direct_response = client.post(
        "/api/auth/admin/reset-password",
        headers=_auth(admin_token),
        json={"user_id": ids["target"], "new_password": DIRECT_PASSWORD},
    )
    failures += _check(
        direct_response.status_code == 410,
        "legacy direct admin-set-password endpoint -> 410",
    )

    direct_login = client.post(
        "/api/auth/login",
        json={"email": _email("target"), "password": DIRECT_PASSWORD},
    )
    failures += _check(
        direct_login.status_code == 401,
        "legacy direct admin-set-password does not change password",
    )

    old_login = client.post(
        "/api/auth/login",
        json={"email": _email("target"), "password": OLD_PASSWORD},
    )
    failures += _check(
        old_login.status_code == 200,
        "target old password still works after rejected direct reset",
    )

    response = client.post(endpoint, headers=_auth(admin_token))
    failures += _check(response.status_code == 200, "super admin sends reset link -> 200")
    body = response.json() if response.status_code == 200 else {}
    failures += _check(
        "new_password" not in str(body).lower(),
        "admin reset-link request does not require new_password",
    )
    failures += _check(
        not _contains_sensitive_marker(body),
        "admin reset-link response does not expose reset secrets",
    )
    failures += _check(
        len(get_disabled_email_outbox()) == 1,
        "admin reset link email captured in disabled outbox",
    )

    response = client.get("/api/auth/me", headers=_auth(target_old_token))
    failures += _check(
        response.status_code == 200,
        "target old token still works before user completes reset",
    )

    still_old_login = client.post(
        "/api/auth/login",
        json={"email": _email("target"), "password": OLD_PASSWORD},
    )
    failures += _check(
        still_old_login.status_code == 200,
        "target old password still works before user completes reset",
    )

    reset_code = _latest_reset_code_for(_email("target"))
    reset_response = client.post(
        "/api/auth/reset-password",
        json={"code": reset_code, "new_password": NEW_PASSWORD},
    )
    failures += _check(reset_response.status_code == 200, "target uses reset code -> 200")

    response = client.get("/api/auth/me", headers=_auth(target_old_token))
    failures += _check(
        response.status_code == 401,
        "target old token rejected after user completes reset",
    )

    old_password_login = client.post(
        "/api/auth/login",
        json={"email": _email("target"), "password": OLD_PASSWORD},
    )
    failures += _check(
        old_password_login.status_code == 401,
        "target old password rejected after reset",
    )

    new_password_login = client.post(
        "/api/auth/login",
        json={"email": _email("target"), "password": NEW_PASSWORD},
    )
    failures += _check(
        new_password_login.status_code == 200,
        "target new password works after reset",
    )

    db = SessionLocal()
    try:
        audit = (
            db.query(AuditLog)
            .filter(
                AuditLog.action_type == "admin_password_reset_requested",
                AuditLog.recruiter_id == ids["admin"],
                AuditLog.candidate_id == ids["target"],
            )
            .first()
        )
        failures += _check(audit is not None, "admin password reset request audit row written")
        if audit is not None:
            failures += _check(audit.old_value is None, "audit old_value is null")
            failures += _check(
                audit.new_value == "account_recovery_email_sent",
                "audit new_value is non-sensitive",
            )
            failures += _check(
                audit.reason == "admin_initiated_account_recovery_email",
                "audit reason is non-sensitive",
            )
            audit_text = f"{audit.old_value} {audit.new_value} {audit.reason}"
            failures += _check(
                not _contains_sensitive_marker(audit_text),
                "audit text fields contain no reset secrets",
            )

        target = db.query(User).filter(User.id == ids["target"]).first()
        admin = db.query(User).filter(User.id == ids["admin"]).first()
        failures += _check(
            target.password_changed_at is not None,
            "target has password_changed_at after completing reset",
        )
        failures += _check(
            admin.password_changed_at is None,
            "admin token issuer password_changed_at is unchanged",
        )
    finally:
        db.close()

    print()
    if failures == 0:
        print("Admin password reset link smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    clear_disabled_email_outbox()
    return failures


if __name__ == "__main__":
    sys.exit(main())
