"""Smoke test for Phase 7.5 recruitment period safety.

Run:
    python -m scripts.smoke_test_period_safety
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.audit import AuditLog
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"

ADMIN_EMAIL = "smoke+period_safety_admin@example.com"
TEST_PASSWORD = "hunter2secure"
PERIOD_1 = "smoke+period safety active"
PERIOD_2 = "smoke+period safety conflict"
PERIOD_3 = "smoke+period safety inactive"
PERIOD_4 = "smoke+period safety after close"
CONFLICT_MESSAGE = (
    "Masih ada periode rekrutasi aktif. Tutup atau selesaikan periode aktif "
    "terlebih dahulu sebelum membuat periode baru."
)


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _cleanup() -> None:
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if admin:
            db.query(AuditLog).filter(AuditLog.recruiter_id == admin.id).delete(
                synchronize_session=False
            )
            db.query(RecruitmentPeriod).filter(
                RecruitmentPeriod.created_by == admin.id
            ).delete(synchronize_session=False)
            db.delete(admin)
        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.name.in_([PERIOD_1, PERIOD_2, PERIOD_3, PERIOD_4])
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _deactivate_all_periods() -> None:
    db = SessionLocal()
    try:
        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.is_active == True  # noqa: E712
        ).update({RecruitmentPeriod.is_active: False}, synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _future_payload(name: str, offset_minutes: int) -> dict:
    now = datetime.now(timezone.utc)
    start = now + timedelta(minutes=offset_minutes)
    return {
        "name": name,
        "start_date": start.isoformat(),
        "submission_end_date": (start + timedelta(days=3)).isoformat(),
        "evaluation_end_date": (start + timedelta(days=5)).isoformat(),
        "end_date": (start + timedelta(days=7)).isoformat(),
        "threshold_n": 5,
    }


def main() -> int:
    _cleanup()
    _deactivate_all_periods()
    failures = 0
    client = TestClient(fastapi_app)

    db = SessionLocal()
    try:
        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Period Safety Admin",
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        admin_id = admin.id
    finally:
        db.close()

    response = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": TEST_PASSWORD},
    )
    failures += _assert(response.status_code == 200, "admin login -> 200")
    auth = {"Authorization": f"Bearer {response.json()['data']['access_token']}"}

    response = client.post("/api/periods", headers=auth, json=_future_payload(PERIOD_1, 5))
    failures += _assert(response.status_code == 201, "create period with no active period -> 201")
    period1 = response.json()["data"]
    failures += _assert(period1["is_active"] is True, "new period is active")

    response = client.post("/api/periods", headers=auth, json=_future_payload(PERIOD_2, 10))
    failures += _assert(response.status_code == 409, "create while active period exists -> 409")
    failures += _assert(
        response.json().get("detail") == CONFLICT_MESSAGE,
        "409 message explains explicit close requirement",
    )

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        inactive = RecruitmentPeriod(
            name=PERIOD_3,
            start_date=now + timedelta(minutes=20),
            submission_end_date=now + timedelta(days=3),
            evaluation_end_date=now + timedelta(days=5),
            end_date=now + timedelta(days=7),
            is_active=False,
            threshold_n=None,
            created_by=admin_id,
        )
        db.add(inactive)
        db.commit()
        db.refresh(inactive)
        inactive_id = inactive.id
    finally:
        db.close()

    response = client.put(
        f"/api/periods/{inactive_id}",
        headers=auth,
        json={"is_active": True},
    )
    failures += _assert(response.status_code == 409, "activate inactive period while another active -> 409")

    response = client.put(f"/api/periods/{period1['id']}/close", headers=auth)
    failures += _assert(response.status_code == 200, "explicit close active period -> 200")
    failures += _assert(response.json()["data"]["is_active"] is False, "closed period inactive")

    response = client.post("/api/periods", headers=auth, json=_future_payload(PERIOD_4, 30))
    failures += _assert(response.status_code == 201, "create after closing active period -> 201")

    print()
    if failures == 0:
        print("Period safety smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    return failures


if __name__ == "__main__":
    sys.exit(main())
