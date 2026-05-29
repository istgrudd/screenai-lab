"""Smoke test for Phase 4 JWT invalidation after password changes.

Run:
    python -m scripts.smoke_test_token_invalidation
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
from backend.models.email_verification import EmailVerificationLink
from backend.models.password_reset import PasswordResetLink
from backend.models.user import User, UserRole
from backend.services.email_service import (
    clear_disabled_email_outbox,
    get_disabled_email_outbox,
)
from backend.utils.security import hash_password


RESET_EMAIL = "smoke+token_reset@example.com"
RESET_NIM = "1031234600001"
ADMIN_EMAIL = "smoke+token_admin@example.com"
TARGET_EMAIL = "smoke+token_target@example.com"
TARGET_NIM = "1031234600002"
OLD_PASSWORD = "oldpasswordsecure"
RESET_NEW_PASSWORD = "resetnewsecure"
PROFILE_NEW_PASSWORD = "profilenewsecure"
ADMIN_NEW_PASSWORD = "adminnewsecure"


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
                (User.email.in_([RESET_EMAIL, ADMIN_EMAIL, TARGET_EMAIL]))
                | (User.nim.in_([RESET_NIM, TARGET_NIM]))
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
    password: str = OLD_PASSWORD,
    role: UserRole = UserRole.CANDIDATE,
    nim: str | None = None,
) -> int:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=f"Smoke Token {email}",
            nim=nim,
            faculty="Fakultas Informatika" if role == UserRole.CANDIDATE else None,
            major="Informatika" if role == UserRole.CANDIDATE else None,
            year=2023 if role == UserRole.CANDIDATE else None,
            role=role,
            is_active=True,
            email_verified_at=now,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.id
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


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    _check(response.status_code == 200, f"login {email} -> 200")
    token = response.json()["data"]["access_token"]
    _check(bool(token), f"login {email} returns token")
    return token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def main() -> int:
    init_db()
    _cleanup()
    clear_disabled_email_outbox()
    reset_user_id = _create_user(email=RESET_EMAIL, nim=RESET_NIM)
    admin_id = _create_user(
        email=ADMIN_EMAIL,
        role=UserRole.SUPER_ADMIN,
    )
    target_id = _create_user(email=TARGET_EMAIL, nim=TARGET_NIM)

    client = TestClient(app)

    old_token = _login(client, RESET_EMAIL, OLD_PASSWORD)
    response = client.get("/api/auth/me", headers=_auth(old_token))
    _check(response.status_code == 200, "old token can access /me before reset")

    forgot_response = client.post(
        "/api/auth/forgot-password",
        json={"email": RESET_EMAIL},
    )
    _check(forgot_response.status_code == 200, "forgot-password request -> 200")
    reset_code = _latest_reset_code_for(RESET_EMAIL)
    reset_response = client.post(
        "/api/auth/reset-password",
        json={"code": reset_code, "new_password": RESET_NEW_PASSWORD},
    )
    _check(reset_response.status_code == 200, "reset-password request -> 200")

    response = client.get("/api/auth/me", headers=_auth(old_token))
    _check(response.status_code == 401, "old token is rejected after password reset")

    new_token = _login(client, RESET_EMAIL, RESET_NEW_PASSWORD)
    response = client.get("/api/auth/me", headers=_auth(new_token))
    _check(response.status_code == 200, "new token can access /me after reset")

    profile_password_update = client.put(
        "/api/users/me",
        headers=_auth(new_token),
        json={"password": PROFILE_NEW_PASSWORD},
    )
    _check(profile_password_update.status_code == 200, "profile password update -> 200")
    response = client.get("/api/auth/me", headers=_auth(new_token))
    _check(response.status_code == 401, "token rejected after profile password change")
    profile_token = _login(client, RESET_EMAIL, PROFILE_NEW_PASSWORD)
    response = client.get("/api/auth/me", headers=_auth(profile_token))
    _check(response.status_code == 200, "profile-change token can access /me")

    admin_token = _login(client, ADMIN_EMAIL, OLD_PASSWORD)
    target_old_token = _login(client, TARGET_EMAIL, OLD_PASSWORD)
    response = client.get("/api/auth/me", headers=_auth(target_old_token))
    _check(response.status_code == 200, "target old token works before admin reset")

    admin_reset = client.post(
        "/api/auth/admin/reset-password",
        headers=_auth(admin_token),
        json={"user_id": target_id, "new_password": ADMIN_NEW_PASSWORD},
    )
    _check(
        admin_reset.status_code == 200,
        f"admin reset password -> 200, got {admin_reset.status_code}: {admin_reset.text}",
    )

    response = client.get("/api/auth/me", headers=_auth(target_old_token))
    _check(response.status_code == 401, "target old token rejected after admin reset")

    target_new_token = _login(client, TARGET_EMAIL, ADMIN_NEW_PASSWORD)
    response = client.get("/api/auth/me", headers=_auth(target_new_token))
    _check(response.status_code == 200, "target new token can access /me")

    db = SessionLocal()
    try:
        reset_user = db.query(User).filter(User.id == reset_user_id).first()
        admin = db.query(User).filter(User.id == admin_id).first()
        target = db.query(User).filter(User.id == target_id).first()
        _check(reset_user.password_changed_at is not None, "reset user has password_changed_at")
        _check(admin.password_changed_at is None, "admin token issuer is unchanged")
        _check(target.password_changed_at is not None, "admin reset target has password_changed_at")
    finally:
        db.close()

    print("\nAll token invalidation smoke checks passed.")
    _cleanup()
    clear_disabled_email_outbox()
    return 0


if __name__ == "__main__":
    sys.exit(main())
