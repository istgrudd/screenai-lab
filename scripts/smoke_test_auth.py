"""Smoke test for auth backend: register -> verify email -> login -> /me.

Uses FastAPI's TestClient so no live server is needed. Creates a temporary
in-process user, exercises the full JWT flow, then exits.

Run:
    python -m scripts.smoke_test_auth
"""

from __future__ import annotations

import os
import re
from urllib.parse import unquote

os.environ["EMAIL_ENABLED"] = "false"
os.environ["EMAIL_RESEND_COOLDOWN_SECONDS"] = "0"
os.environ["ENVIRONMENT"] = "development"
os.environ["PUBLIC_FRONTEND_URL"] = "http://testserver"

from fastapi.testclient import TestClient

from backend.database import SessionLocal, init_db
from backend.main import app
from backend.models.email_verification import EmailVerificationLink
from backend.models.user import User
from backend.services.email_service import (
    clear_disabled_email_outbox,
    get_disabled_email_outbox,
)


TEST_EMAIL = "smoke+candidate@example.com"
TEST_NIM = "1031234567890"  # 13 digits — valid under relaxed regex (10+ digits)


def _cleanup() -> None:
    """Remove any prior smoke-test user so the script is rerunnable."""
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
            EmailVerificationLink.sent_to_email == TEST_EMAIL
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _check(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(f"[FAIL] {msg}")
    print(f"[PASS] {msg}")


def _latest_code_for(email: str) -> str:
    for message in reversed(get_disabled_email_outbox()):
        if message.get("to") != email:
            continue
        text = f"{message.get('text', '')}\n{message.get('html', '')}"
        match = re.search(r"code=([A-Za-z0-9_\-%]+)", text)
        if match:
            return unquote(match.group(1))
    raise AssertionError(f"[FAIL] no captured verification email for {email}")


def main() -> int:
    init_db()
    _cleanup()
    clear_disabled_email_outbox()
    client = TestClient(app)

    # --- 1. Register ---
    r = client.post(
        "/api/auth/register",
        json={
            "email": TEST_EMAIL,
            "password": "hunter2secure",
            "full_name": "Smoke Test Candidate",
            "nim": TEST_NIM,
            "faculty": "Fakultas Informatika",
            "major": "Data Science",
            "year": 2023,
        },
    )
    _check(r.status_code == 201, f"register -> 201, got {r.status_code} body={r.text}")
    body = r.json()
    _check(body["success"] is True, "register response.success is True")
    _check("access_token" not in body["data"], "register does not return access_token")
    _check(
        body["data"]["verification_required"] is True,
        "register requires email verification",
    )

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == TEST_EMAIL).first()
        _check(user is not None, "new user persisted")
        role = user.role.value if hasattr(user.role, "value") else str(user.role)
        _check(role == "candidate", "new user role is 'candidate'")
        _check(user.nim == TEST_NIM, "new user has the submitted NIM")
        _check(user.email_verified_at is None, "new user starts unverified")
    finally:
        db.close()

    # --- 2. Login before verification is blocked ---
    r = client.post(
        "/api/auth/login",
        json={"email": TEST_EMAIL, "password": "hunter2secure"},
    )
    _check(r.status_code == 403, f"pre-verify login -> 403, got {r.status_code}")
    _check(
        r.json()["detail"]["code"] == "EMAIL_NOT_VERIFIED",
        "pre-verify login returns EMAIL_NOT_VERIFIED",
    )

    # --- 3. Verify email using the disabled-mode email outbox ---
    code = _latest_code_for(TEST_EMAIL)
    r = client.get("/api/auth/verify-email", params={"code": code})
    _check(r.status_code == 200, f"verify email -> 200, got {r.status_code}: {r.text}")

    # --- 4. Login ---
    r = client.post(
        "/api/auth/login",
        json={"email": TEST_EMAIL, "password": "hunter2secure"},
    )
    _check(r.status_code == 200, f"login -> 200, got {r.status_code}")
    token = r.json()["data"]["access_token"]
    _check(bool(token), "login returns access_token")

    # --- 5. /me with valid token ---
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    _check(r.status_code == 200, f"/me with token -> 200, got {r.status_code}")
    me = r.json()["data"]
    _check(me["email"] == TEST_EMAIL, "/me returns correct email")
    _check(me["faculty"] == "Fakultas Informatika", "/me returns faculty")
    _check(me["year"] == 2023, "/me returns year")

    # --- 6. /me without token -> 401 ---
    r = client.get("/api/auth/me")
    _check(r.status_code == 401, f"/me without token -> 401, got {r.status_code}")

    # --- 7. /me with garbage token -> 401 ---
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    _check(r.status_code == 401, f"/me with bad token -> 401, got {r.status_code}")

    # --- 8. Bad login -> 401 ---
    r = client.post(
        "/api/auth/login",
        json={"email": TEST_EMAIL, "password": "wrongpassword"},
    )
    _check(r.status_code == 401, f"wrong password -> 401, got {r.status_code}")

    # --- 9. Duplicate email -> 409 ---
    r = client.post(
        "/api/auth/register",
        json={
            "email": TEST_EMAIL,
            "password": "hunter2secure",
            "full_name": "Dup",
            "nim": "1039999999999",
            "faculty": "X",
            "major": "Y",
            "year": 2024,
        },
    )
    _check(r.status_code == 409, f"duplicate email -> 409, got {r.status_code}")

    # --- 10. Malformed NIM -> 422 ---
    r = client.post(
        "/api/auth/register",
        json={
            "email": "nimtest+reject@example.com",
            "password": "hunter2secure",
            "full_name": "Nim Reject",
            "nim": "12345",
            "faculty": "X",
            "major": "Y",
            "year": 2024,
        },
    )
    _check(r.status_code == 422, f"bad NIM -> 422, got {r.status_code}")

    # --- 11. Guarded route rejects candidate ---
    r = client.get(
        "/api/rubrics",
        headers={"Authorization": f"Bearer {token}"},
    )
    _check(
        r.status_code == 403,
        f"candidate on recruiter-only route -> 403, got {r.status_code}",
    )

    print("\nAll smoke checks passed.")
    _cleanup()
    clear_disabled_email_outbox()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
