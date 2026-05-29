"""Smoke test for Phase 4 forgot password flow.

Uses FastAPI's TestClient and forces EMAIL_ENABLED=false before importing the
app, so no real email is sent. Reset URLs are read from the local disabled-mode
outbox.

Run:
    python -m scripts.smoke_test_forgot_password
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
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
from backend.models.email_verification import EmailVerificationLink
from backend.models.password_reset import PasswordResetLink
from backend.models.user import User, UserRole
from backend.services.email_service import (
    clear_disabled_email_outbox,
    get_disabled_email_outbox,
)
from backend.services.password_reset_service import (
    GENERIC_FORGOT_PASSWORD_MESSAGE,
    hash_reset_secret,
)
from backend.utils.security import hash_password


ACTIVE_EMAIL = "smoke+forgot_active@example.com"
ACTIVE_NIM = "1031234500001"
INACTIVE_EMAIL = "smoke+forgot_inactive@example.com"
INACTIVE_NIM = "1031234500002"
UNVERIFIED_EMAIL = "smoke+forgot_unverified@example.com"
UNVERIFIED_NIM = "1031234500003"
UNKNOWN_EMAIL = "smoke+forgot_unknown@example.com"
OLD_PASSWORD = "oldpasswordsecure"
NEW_PASSWORD = "newpasswordsecure"
UNVERIFIED_NEW_PASSWORD = "unverifiednewsecure"


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
                (User.email.in_([ACTIVE_EMAIL, INACTIVE_EMAIL, UNVERIFIED_EMAIL]))
                | (User.nim.in_([ACTIVE_NIM, INACTIVE_NIM, UNVERIFIED_NIM]))
            )
            .all()
        )
        user_ids = [user.id for user in users]
        if user_ids:
            db.query(PasswordResetLink).filter(
                PasswordResetLink.user_id.in_(user_ids)
            ).delete(synchronize_session=False)
            db.query(EmailVerificationLink).filter(
                EmailVerificationLink.user_id.in_(user_ids)
            ).delete(synchronize_session=False)
            db.query(User).filter(User.id.in_(user_ids)).delete(
                synchronize_session=False
            )
        db.commit()
    finally:
        db.close()


def _create_user(
    *,
    email: str,
    nim: str,
    is_active: bool = True,
    is_verified: bool = True,
) -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        db.add(
            User(
                email=email,
                password_hash=hash_password(OLD_PASSWORD),
                full_name=f"Smoke Forgot {email}",
                nim=nim,
                faculty="Fakultas Informatika",
                major="Informatika",
                year=2023,
                role=UserRole.CANDIDATE,
                is_active=is_active,
                email_verified_at=now if is_verified else None,
            )
        )
        db.commit()
    finally:
        db.close()


def _latest_reset_code_for(email: str) -> str:
    for message in reversed(get_disabled_email_outbox()):
        if message.get("to") != email:
            continue
        text = f"{message.get('text', '')}\n{message.get('html', '')}"
        match = re.search(r"code=([A-Za-z0-9_\-%]+)", text)
        if match:
            return unquote(match.group(1))
    raise AssertionError(f"[FAIL] no captured reset email for {email}")


def _expire_code(code: str) -> None:
    db = SessionLocal()
    try:
        link = (
            db.query(PasswordResetLink)
            .filter(PasswordResetLink.link_secret_hash == hash_reset_secret(code))
            .first()
        )
        if link is None:
            raise AssertionError("[FAIL] password reset link record not found")
        link.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()


def _generic_forgot(client: TestClient, email: str):
    return client.post("/api/auth/forgot-password", json={"email": email})


def main() -> int:
    init_db()
    _cleanup()
    clear_disabled_email_outbox()
    _create_user(email=ACTIVE_EMAIL, nim=ACTIVE_NIM)
    _create_user(email=INACTIVE_EMAIL, nim=INACTIVE_NIM, is_active=False)
    _create_user(email=UNVERIFIED_EMAIL, nim=UNVERIFIED_NIM, is_verified=False)

    client = TestClient(app)

    unknown_response = _generic_forgot(client, UNKNOWN_EMAIL)
    _check(unknown_response.status_code == 200, "unknown email forgot-password -> 200")
    _check(
        unknown_response.json()["data"]["message"] == GENERIC_FORGOT_PASSWORD_MESSAGE,
        "unknown email receives generic response",
    )
    _check(len(get_disabled_email_outbox()) == 0, "unknown email sends no reset email")

    inactive_response = _generic_forgot(client, INACTIVE_EMAIL)
    _check(inactive_response.status_code == 200, "inactive user forgot-password -> 200")
    _check(
        inactive_response.json() == unknown_response.json(),
        "inactive user response matches unknown email response",
    )
    _check(len(get_disabled_email_outbox()) == 0, "inactive user sends no reset email")

    existing_response = _generic_forgot(client, ACTIVE_EMAIL)
    _check(existing_response.status_code == 200, "existing user forgot-password -> 200")
    _check(
        existing_response.json() == unknown_response.json(),
        "existing user response matches generic response",
    )
    _check(
        get_disabled_email_outbox()[-1]["provider"] == "disabled",
        "password reset email captured in disabled outbox",
    )
    expired_code = _latest_reset_code_for(ACTIVE_EMAIL)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == ACTIVE_EMAIL).first()
        link = (
            db.query(PasswordResetLink)
            .filter(PasswordResetLink.user_id == user.id)
            .order_by(PasswordResetLink.created_at.desc())
            .first()
        )
        _check(link is not None, "forgot-password creates reset link record")
        _check(
            link.link_secret_hash != expired_code,
            "raw reset code is not stored in database",
        )
        _check(
            bool(re.fullmatch(r"[0-9a-f]{64}", link.link_secret_hash)),
            "reset secret hash is stored as SHA-256 hex",
        )
    finally:
        db.close()

    invalid_response = client.post(
        "/api/auth/reset-password",
        json={
            "code": "invalid-reset-code-that-will-not-match-000",
            "new_password": NEW_PASSWORD,
        },
    )
    _check(invalid_response.status_code == 400, "invalid reset code -> 400")
    _check(
        invalid_response.json()["detail"]["code"] == "INVALID_RESET_CODE",
        "invalid reset code returns structured error",
    )

    short_invalid_response = client.post(
        "/api/auth/reset-password",
        json={"code": "bad", "new_password": NEW_PASSWORD},
    )
    _check(short_invalid_response.status_code == 400, "short invalid reset code -> 400")
    _check(
        short_invalid_response.json()["detail"]["code"] == "INVALID_RESET_CODE",
        "short invalid reset code returns structured error",
    )

    _expire_code(expired_code)
    expired_response = client.post(
        "/api/auth/reset-password",
        json={"code": expired_code, "new_password": NEW_PASSWORD},
    )
    _check(expired_response.status_code == 400, "expired reset code -> 400")
    _check(
        expired_response.json()["detail"]["code"] == "RESET_CODE_EXPIRED",
        "expired reset code returns structured error",
    )

    _generic_forgot(client, ACTIVE_EMAIL)
    valid_code = _latest_reset_code_for(ACTIVE_EMAIL)
    valid_response = client.post(
        "/api/auth/reset-password",
        json={"code": valid_code, "new_password": NEW_PASSWORD},
    )
    _check(valid_response.status_code == 200, "valid reset code -> 200")
    _check(
        "access_token" not in valid_response.json()["data"],
        "reset-password does not return access_token",
    )

    old_login = client.post(
        "/api/auth/login",
        json={"email": ACTIVE_EMAIL, "password": OLD_PASSWORD},
    )
    _check(old_login.status_code == 401, "old password no longer logs in")

    new_login = client.post(
        "/api/auth/login",
        json={"email": ACTIVE_EMAIL, "password": NEW_PASSWORD},
    )
    _check(new_login.status_code == 200, "new password logs in")

    reused_response = client.post(
        "/api/auth/reset-password",
        json={"code": valid_code, "new_password": "anothernewsecure"},
    )
    _check(reused_response.status_code == 400, "reusing reset code -> 400")
    _check(
        reused_response.json()["detail"]["code"] == "RESET_CODE_USED",
        "reusing reset code returns structured error",
    )

    _generic_forgot(client, UNVERIFIED_EMAIL)
    unverified_code = _latest_reset_code_for(UNVERIFIED_EMAIL)
    unverified_reset = client.post(
        "/api/auth/reset-password",
        json={"code": unverified_code, "new_password": UNVERIFIED_NEW_PASSWORD},
    )
    _check(unverified_reset.status_code == 200, "unverified candidate can reset password")
    unverified_login = client.post(
        "/api/auth/login",
        json={"email": UNVERIFIED_EMAIL, "password": UNVERIFIED_NEW_PASSWORD},
    )
    _check(
        unverified_login.status_code == 403,
        "unverified candidate remains blocked after password reset",
    )
    _check(
        unverified_login.json()["detail"]["code"] == "EMAIL_NOT_VERIFIED",
        "password reset does not verify candidate email",
    )

    print("\nAll forgot-password smoke checks passed.")
    _cleanup()
    clear_disabled_email_outbox()
    return 0


if __name__ == "__main__":
    sys.exit(main())
