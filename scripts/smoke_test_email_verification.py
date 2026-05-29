"""Smoke test for Phase 3 candidate email verification.

Uses FastAPI's TestClient and forces EMAIL_ENABLED=false before importing the
app, so no real email is sent. Verification URLs are read from the local
disabled-mode outbox.

Run:
    python -m scripts.smoke_test_email_verification
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
import re
import sys
from urllib.parse import unquote

os.environ["EMAIL_ENABLED"] = "false"
os.environ["EMAIL_RESEND_COOLDOWN_SECONDS"] = "0"
os.environ["ENVIRONMENT"] = "development"
os.environ["PUBLIC_FRONTEND_URL"] = "http://testserver"

from fastapi.testclient import TestClient

from backend.config import settings
from backend.database import SessionLocal, init_db
from backend.main import app
from backend.models.email_verification import EmailVerificationLink
from backend.models.user import User
from backend.services.email_service import (
    clear_disabled_email_outbox,
    get_disabled_email_outbox,
)
from backend.services.email_verification_service import (
    GENERIC_RESEND_MESSAGE,
    hash_verification_secret,
)


TEST_EMAIL = "smoke+emailverify@example.com"
TEST_NIM = "1031234567001"
TEST_PASSWORD = "hunter2secure"
MISSING_EMAIL = "smoke+emailverify_missing@example.com"


def _check(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(f"[FAIL] {msg}")
    print(f"[PASS] {msg}")


def _cleanup() -> None:
    db = SessionLocal()
    try:
        users = (
            db.query(User)
            .filter((User.email == TEST_EMAIL) | (User.nim == TEST_NIM))
            .all()
        )
        user_ids = [user.id for user in users]
        if user_ids:
            db.query(EmailVerificationLink).filter(
                EmailVerificationLink.user_id.in_(user_ids)
            ).delete(synchronize_session=False)
            db.query(User).filter(User.id.in_(user_ids)).delete(
                synchronize_session=False
            )
        db.query(EmailVerificationLink).filter(
            EmailVerificationLink.sent_to_email.in_([TEST_EMAIL, MISSING_EMAIL])
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _latest_code_for(email: str) -> str:
    for message in reversed(get_disabled_email_outbox()):
        if message.get("to") != email:
            continue
        text = f"{message.get('text', '')}\n{message.get('html', '')}"
        match = re.search(r"code=([A-Za-z0-9_\-%]+)", text)
        if match:
            return unquote(match.group(1))
    raise AssertionError(f"[FAIL] no captured verification email for {email}")


def _expire_code(code: str) -> None:
    db = SessionLocal()
    try:
        link = (
            db.query(EmailVerificationLink)
            .filter(
                EmailVerificationLink.link_secret_hash
                == hash_verification_secret(code)
            )
            .first()
        )
        if link is None:
            raise AssertionError("[FAIL] verification link record not found")
        link.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()


def main() -> int:
    init_db()
    _cleanup()
    clear_disabled_email_outbox()

    client = TestClient(app)

    register_response = client.post(
        "/api/auth/register",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "full_name": "Smoke Email Verification",
            "nim": TEST_NIM,
            "faculty": "Fakultas Informatika",
            "major": "Informatika",
            "year": 2023,
        },
    )
    _check(
        register_response.status_code == 201,
        f"register -> 201, got {register_response.status_code}: {register_response.text}",
    )
    register_body = register_response.json()
    _check(register_body["success"] is True, "register response.success is True")
    _check(
        "access_token" not in register_body["data"],
        "register response does not include access_token",
    )
    _check(
        register_body["data"]["verification_required"] is True,
        "register marks verification_required=True",
    )

    register_code = _latest_code_for(TEST_EMAIL)
    _check(settings.email_enabled is False, "EMAIL_ENABLED is false in smoke test")
    _check(
        get_disabled_email_outbox()[-1]["provider"] == "disabled",
        "verification email captured in disabled outbox",
    )

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == TEST_EMAIL).first()
        _check(user is not None, "register creates candidate user")
        _check(user.email_verified_at is None, "candidate starts unverified")
        link = (
            db.query(EmailVerificationLink)
            .filter(EmailVerificationLink.user_id == user.id)
            .first()
        )
        _check(link is not None, "register creates verification link record")
        _check(
            link.link_secret_hash != register_code,
            "raw verification code is not stored in database",
        )
        _check(
            bool(re.fullmatch(r"[0-9a-f]{64}", link.link_secret_hash)),
            "verification secret hash is stored as SHA-256 hex",
        )
    finally:
        db.close()

    login_response = client.post(
        "/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    _check(
        login_response.status_code == 403,
        f"login before verification -> 403, got {login_response.status_code}",
    )
    _check(
        login_response.json()["detail"]["code"] == "EMAIL_NOT_VERIFIED",
        "login before verification returns EMAIL_NOT_VERIFIED",
    )

    invalid_response = client.get(
        "/api/auth/verify-email",
        params={"code": "invalid-code-that-will-not-match-000"},
    )
    _check(
        invalid_response.status_code == 400,
        f"invalid verification code -> 400, got {invalid_response.status_code}",
    )
    _check(
        invalid_response.json()["detail"]["code"] == "INVALID_VERIFICATION_CODE",
        "invalid verification code returns structured error",
    )

    _expire_code(register_code)
    expired_response = client.get(
        "/api/auth/verify-email",
        params={"code": register_code},
    )
    _check(
        expired_response.status_code == 400,
        f"expired verification code -> 400, got {expired_response.status_code}",
    )
    _check(
        expired_response.json()["detail"]["code"] == "VERIFICATION_CODE_EXPIRED",
        "expired verification code returns structured error",
    )

    resend_response = client.post(
        "/api/auth/resend-verification",
        json={"email": TEST_EMAIL},
    )
    _check(
        resend_response.status_code == 200,
        f"resend verification -> 200, got {resend_response.status_code}",
    )
    _check(
        resend_response.json()["data"]["message"] == GENERIC_RESEND_MESSAGE,
        "resend verification returns generic message",
    )
    valid_code = _latest_code_for(TEST_EMAIL)
    _check(valid_code != register_code, "resend creates a new verification code")

    verify_response = client.get(
        "/api/auth/verify-email",
        params={"code": valid_code},
    )
    _check(
        verify_response.status_code == 200,
        f"valid verification code -> 200, got {verify_response.status_code}: {verify_response.text}",
    )
    _check(
        verify_response.json()["data"]["email"] == TEST_EMAIL,
        "valid verification response returns candidate email",
    )

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == TEST_EMAIL).first()
        _check(user.email_verified_at is not None, "valid code marks user verified")
        used_link = (
            db.query(EmailVerificationLink)
            .filter(
                EmailVerificationLink.link_secret_hash
                == hash_verification_secret(valid_code)
            )
            .first()
        )
        _check(used_link.used_at is not None, "valid code marks link used")
    finally:
        db.close()

    login_response = client.post(
        "/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    _check(
        login_response.status_code == 200,
        f"login after verification -> 200, got {login_response.status_code}",
    )
    _check(
        bool(login_response.json()["data"]["access_token"]),
        "login after verification returns access_token",
    )
    token = login_response.json()["data"]["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    same_email_response = client.put(
        "/api/users/me",
        headers=auth_headers,
        json={"email": TEST_EMAIL},
    )
    _check(
        same_email_response.status_code == 200,
        f"candidate same-email profile update -> 200, got {same_email_response.status_code}",
    )
    _check(
        same_email_response.json()["data"]["email"] == TEST_EMAIL,
        "candidate same-email profile update preserves email",
    )

    changed_email_response = client.put(
        "/api/users/me",
        headers=auth_headers,
        json={"email": "smoke+emailverify_changed@example.com"},
    )
    _check(
        changed_email_response.status_code == 403,
        f"candidate changed-email profile update -> 403, got {changed_email_response.status_code}",
    )
    _check(
        changed_email_response.json()["detail"]["code"]
        == "CANDIDATE_EMAIL_CHANGE_REQUIRES_VERIFICATION_FLOW",
        "candidate changed-email profile update returns structured block code",
    )

    reused_response = client.get(
        "/api/auth/verify-email",
        params={"code": valid_code},
    )
    _check(
        reused_response.status_code == 400,
        f"reusing verification code -> 400, got {reused_response.status_code}",
    )
    _check(
        reused_response.json()["detail"]["code"] == "VERIFICATION_CODE_USED",
        "reusing verification code returns structured error",
    )

    existing_generic = client.post(
        "/api/auth/resend-verification",
        json={"email": TEST_EMAIL},
    )
    missing_generic = client.post(
        "/api/auth/resend-verification",
        json={"email": MISSING_EMAIL},
    )
    _check(existing_generic.status_code == 200, "resend verified user -> 200")
    _check(missing_generic.status_code == 200, "resend missing user -> 200")
    _check(
        existing_generic.json() == missing_generic.json(),
        "resend response does not leak account existence",
    )

    print("\nAll email verification smoke checks passed.")
    _cleanup()
    clear_disabled_email_outbox()
    return 0


if __name__ == "__main__":
    sys.exit(main())
