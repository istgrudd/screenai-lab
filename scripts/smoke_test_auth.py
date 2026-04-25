"""Smoke test for Phase 1 auth backend: register -> login -> /me -> negative.

Uses FastAPI's TestClient so no live server is needed. Creates a temporary
in-process user, exercises the full JWT flow, then exits.

Run:
    python -m scripts.smoke_test_auth
"""

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app
from backend.models.user import User


TEST_EMAIL = "smoke+candidate@example.com"
TEST_NIM = "1031234567890"  # 13 digits — valid under relaxed regex (10+ digits)


def _cleanup() -> None:
    """Remove any prior smoke-test user so the script is rerunnable."""
    db = SessionLocal()
    try:
        (
            db.query(User)
            .filter((User.email == TEST_EMAIL) | (User.nim == TEST_NIM))
            .delete(synchronize_session=False)
        )
        db.commit()
    finally:
        db.close()


def _check(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(f"[FAIL] {msg}")
    print(f"[PASS] {msg}")


def main() -> int:
    _cleanup()
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
    _check("access_token" in body["data"], "register returns access_token")
    _check(body["data"]["user"]["role"] == "candidate", "new user role is 'candidate'")
    _check(body["data"]["user"]["nim"] == TEST_NIM, "new user has the submitted NIM")

    # --- 2. Login ---
    r = client.post(
        "/api/auth/login",
        json={"email": TEST_EMAIL, "password": "hunter2secure"},
    )
    _check(r.status_code == 200, f"login -> 200, got {r.status_code}")
    token = r.json()["data"]["access_token"]
    _check(bool(token), "login returns access_token")

    # --- 3. /me with valid token ---
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    _check(r.status_code == 200, f"/me with token -> 200, got {r.status_code}")
    me = r.json()["data"]
    _check(me["email"] == TEST_EMAIL, "/me returns correct email")
    _check(me["faculty"] == "Fakultas Informatika", "/me returns faculty")
    _check(me["year"] == 2023, "/me returns year")

    # --- 4. /me without token -> 401 ---
    r = client.get("/api/auth/me")
    _check(r.status_code == 401, f"/me without token -> 401, got {r.status_code}")

    # --- 5. /me with garbage token -> 401 ---
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    _check(r.status_code == 401, f"/me with bad token -> 401, got {r.status_code}")

    # --- 6. Bad login -> 401 ---
    r = client.post(
        "/api/auth/login",
        json={"email": TEST_EMAIL, "password": "wrongpassword"},
    )
    _check(r.status_code == 401, f"wrong password -> 401, got {r.status_code}")

    # --- 7. Duplicate email -> 409 ---
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

    # --- 8. Malformed NIM -> 422 ---
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

    # --- 9. Guarded route rejects candidate ---
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
