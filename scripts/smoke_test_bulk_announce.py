"""Smoke test for POST /api/announcements/bulk (screening-only scope).

Covers the hardened bulk-publish behavior:
  * Only `screening` applications are in scope. Already-announced
    (announced_pass / announced_fail) and not-yet-evaluated (submitted) apps
    are never touched.
  * Within scope: passed IDs -> announced_pass, the rest -> announced_fail.
  * Empty passed_application_ids is valid (everyone in scope -> announced_fail).
  * Passing an already-announced or not-evaluated id -> 400 (not ready).
  * Auth: candidate -> 403; invalid division -> 422.

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

TEST_PASSWORD = "hunter2secure"
EMAIL_PREFIX = "smoke+bulk_"
PERIOD_NAME = "smoke+bulk cycle"


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _email(suffix: str) -> str:
    return f"{EMAIL_PREFIX}{suffix}@example.com"


def _cleanup() -> None:
    db = SessionLocal()
    try:
        db.query(EmailNotification).filter(
            EmailNotification.to_email.like(f"{EMAIL_PREFIX}%")
        ).delete(synchronize_session=False)
        users = db.query(User).filter(User.email.like(f"{EMAIL_PREFIX}%")).all()
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


def _make_user(db, *, suffix: str, role: UserRole, nim: str | None = None) -> User:
    user = User(
        email=_email(suffix),
        password_hash=hash_password(TEST_PASSWORD),
        full_name=f"Bulk {suffix}",
        nim=nim,
        faculty="Fakultas Informatika" if role == UserRole.CANDIDATE else None,
        major="Informatika" if role == UserRole.CANDIDATE else None,
        year=2023 if role == UserRole.CANDIDATE else None,
        role=role,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    return user


def main() -> int:
    _cleanup()
    failures = 0
    client = TestClient(fastapi_app)

    db = SessionLocal()
    admin = _make_user(db, suffix="admin", role=UserRole.SUPER_ADMIN)
    _make_user(db, suffix="recruiter", role=UserRole.RECRUITER)

    # Candidates across three divisions to isolate scenarios.
    seeds = [
        ("bd_pass", "1039877700001"),
        ("bd_fail", "1039877700002"),
        ("bd_already_pass", "1039877700003"),
        ("bd_already_fail", "1039877700004"),
        ("bd_pend", "1039877700005"),
        ("cy_z1", "1039877700006"),
        ("cy_z2", "1039877700007"),
        ("gis_s", "1039877700008"),
    ]
    cand_users = {suffix: _make_user(db, suffix=suffix, role=UserRole.CANDIDATE, nim=nim) for suffix, nim in seeds}
    db.commit()
    for u in [admin, *cand_users.values()]:
        db.refresh(u)

    # Active period in ANNOUNCEMENT phase (submission + evaluation ended).
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
    period_id = period.id

    def _seed_app(suffix: str, division: Division, app_status: ApplicationStatus) -> Application:
        app = Application(
            user_id=cand_users[suffix].id,
            division=division,
            status=app_status,
            period_id=period_id,
            submitted_at=now,
        )
        db.add(app)
        return app

    bd_pass = _seed_app("bd_pass", Division.BIG_DATA, ApplicationStatus.SCREENING)
    bd_fail = _seed_app("bd_fail", Division.BIG_DATA, ApplicationStatus.SCREENING)
    bd_already_pass = _seed_app("bd_already_pass", Division.BIG_DATA, ApplicationStatus.ANNOUNCED_PASS)
    bd_already_fail = _seed_app("bd_already_fail", Division.BIG_DATA, ApplicationStatus.ANNOUNCED_FAIL)
    bd_pend = _seed_app("bd_pend", Division.BIG_DATA, ApplicationStatus.SUBMITTED)
    cy_z1 = _seed_app("cy_z1", Division.CYBER_SECURITY, ApplicationStatus.SCREENING)
    cy_z2 = _seed_app("cy_z2", Division.CYBER_SECURITY, ApplicationStatus.SCREENING)
    gis_s = _seed_app("gis_s", Division.GIS, ApplicationStatus.SCREENING)
    db.commit()
    for a in (bd_pass, bd_fail, bd_already_pass, bd_already_fail, bd_pend, cy_z1, cy_z2, gis_s):
        db.refresh(a)
    bd_pass_id = bd_pass.id
    bd_fail_id = bd_fail.id
    bd_already_pass_id = bd_already_pass.id
    bd_already_fail_id = bd_already_fail.id
    bd_pend_id = bd_pend.id
    cy_z1_id = cy_z1.id
    cy_z2_id = cy_z2.id
    gis_s_id = gis_s.id
    db.close()

    def _login(suffix: str) -> dict:
        r = client.post(
            "/api/auth/login",
            json={"email": _email(suffix), "password": TEST_PASSWORD},
        )
        return {"Authorization": f"Bearer {r.json()['data']['access_token']}"}

    rec_auth = _login("recruiter")
    cand_auth = _login("bd_pass")

    def _bulk(headers, division, passed_ids):
        return client.post(
            "/api/announcements/bulk",
            headers=headers,
            json={
                "division": division,
                "period_id": period_id,
                "passed_application_ids": passed_ids,
            },
        )

    # T1: candidate cannot bulk announce -> 403
    r = _bulk(cand_auth, "big_data", [bd_pass_id])
    failures += _assert(r.status_code == 403, f"candidate bulk announce -> 403 (got {r.status_code})")

    # T2: invalid division -> 422
    r = _bulk(rec_auth, "not_a_division", [bd_pass_id])
    failures += _assert(r.status_code == 422, f"invalid division -> 422 (got {r.status_code})")

    # T3a: app from another division -> 400
    r = _bulk(rec_auth, "big_data", [cy_z1_id])
    failures += _assert(r.status_code == 400, f"out-of-division id -> 400 (got {r.status_code})")

    # T3b: submitted (not evaluated) app -> 400
    r = _bulk(rec_auth, "big_data", [bd_pend_id])
    failures += _assert(r.status_code == 400, f"submitted id rejected -> 400 (got {r.status_code})")

    # T3c: already-announced app id is not ready to announce -> 400
    r = _bulk(rec_auth, "big_data", [bd_already_pass_id])
    failures += _assert(
        r.status_code == 400,
        f"already-announced id rejected -> 400 (got {r.status_code})",
    )
    if r.status_code == 400:
        detail = (r.json().get("detail") or "").lower()
        failures += _assert(
            "ready to announce" in detail or "screening" in detail,
            "400 message mentions ready-to-announce / screening",
        )

    # T4: valid publish — only screening apps in scope; pass=[bd_pass].
    r = _bulk(rec_auth, "big_data", [bd_pass_id])
    failures += _assert(r.status_code == 200, f"valid bulk publish -> 200 (got {r.status_code}: {r.text})")
    if r.status_code == 200:
        body = r.json()["data"]
        failures += _assert(body["announced_pass"] == 1, f"announced_pass == 1 (got {body['announced_pass']})")
        failures += _assert(body["announced_fail"] == 1, f"announced_fail == 1 (got {body['announced_fail']})")

    # T5: DB state — screening apps changed; already-announced + submitted untouched.
    db = SessionLocal()
    try:
        states = {
            a.id: a.status
            for a in db.query(Application).filter(
                Application.id.in_(
                    [bd_pass_id, bd_fail_id, bd_already_pass_id, bd_already_fail_id, bd_pend_id]
                )
            ).all()
        }
        failures += _assert(states[bd_pass_id] == ApplicationStatus.ANNOUNCED_PASS, "bd_pass -> announced_pass")
        failures += _assert(states[bd_fail_id] == ApplicationStatus.ANNOUNCED_FAIL, "bd_fail -> announced_fail")
        failures += _assert(
            states[bd_already_pass_id] == ApplicationStatus.ANNOUNCED_PASS,
            "already announced_pass untouched",
        )
        failures += _assert(
            states[bd_already_fail_id] == ApplicationStatus.ANNOUNCED_FAIL,
            "already announced_fail untouched",
        )
        failures += _assert(states[bd_pend_id] == ApplicationStatus.SUBMITTED, "submitted untouched")
    finally:
        db.close()

    # T6: candidate-facing results.
    pass_my = client.get("/api/announcements/my", headers=_login("bd_pass"))
    failures += _assert(
        pass_my.status_code == 200 and pass_my.json()["data"]["result"] == "pass",
        "bd_pass candidate sees pass",
    )
    fail_my = client.get("/api/announcements/my", headers=_login("bd_fail"))
    failures += _assert(
        fail_my.status_code == 200 and fail_my.json()["data"]["result"] == "fail",
        "bd_fail candidate sees fail",
    )

    # T7: re-publish big_data now that scope is empty (no screening left) ->
    # 200 with zero changes; already-announced rows stay put.
    r = _bulk(rec_auth, "big_data", [])
    failures += _assert(r.status_code == 200, f"re-publish empty scope -> 200 (got {r.status_code})")
    if r.status_code == 200:
        body = r.json()["data"]
        failures += _assert(
            body["announced_pass"] == 0 and body["announced_fail"] == 0,
            f"re-publish touches nothing (got {body})",
        )
    db = SessionLocal()
    try:
        failures += _assert(
            db.query(Application).filter(Application.id == bd_pass_id).first().status
            == ApplicationStatus.ANNOUNCED_PASS,
            "bd_pass still announced_pass after empty re-publish",
        )
    finally:
        db.close()

    # T8: zero-pass — two screening candidates, empty pass list -> both fail.
    r = _bulk(rec_auth, "cyber_security", [])
    failures += _assert(r.status_code == 200, f"zero-pass publish -> 200 (got {r.status_code})")
    if r.status_code == 200:
        body = r.json()["data"]
        failures += _assert(body["announced_pass"] == 0, f"zero-pass announced_pass == 0 (got {body['announced_pass']})")
        failures += _assert(body["announced_fail"] == 2, f"zero-pass announced_fail == 2 (got {body['announced_fail']})")
    db = SessionLocal()
    try:
        cy_states = {
            a.id: a.status
            for a in db.query(Application).filter(Application.id.in_([cy_z1_id, cy_z2_id])).all()
        }
        failures += _assert(
            cy_states[cy_z1_id] == ApplicationStatus.ANNOUNCED_FAIL
            and cy_states[cy_z2_id] == ApplicationStatus.ANNOUNCED_FAIL,
            "both cyber screening apps -> announced_fail",
        )
    finally:
        db.close()

    # T9: single screening candidate, empty pass list -> announced_fail.
    r = _bulk(rec_auth, "gis", [])
    failures += _assert(r.status_code == 200, f"single-fail publish -> 200 (got {r.status_code})")
    if r.status_code == 200:
        body = r.json()["data"]
        failures += _assert(
            body["announced_pass"] == 0 and body["announced_fail"] == 1,
            f"single-fail counts (got {body})",
        )
    db = SessionLocal()
    try:
        failures += _assert(
            db.query(Application).filter(Application.id == gis_s_id).first().status
            == ApplicationStatus.ANNOUNCED_FAIL,
            "single gis screening app -> announced_fail",
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
