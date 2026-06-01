"""Smoke test for Phase 9 analytics API.

Run:
    python -m scripts.smoke_test_analytics
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.database import SessionLocal, init_db
from backend.main import app as fastapi_app
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole
from backend.utils.file_storage import purge_application_dir
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"
TEST_PASSWORD = "hunter2secure"
EMAIL_PREFIX = "smoke+analytics_"
PERIOD_NAME = "smoke+analytics active period"


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _email(suffix: str) -> str:
    return f"{EMAIL_PREFIX}{suffix}@example.com"


def _cleanup() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.email.like(f"{EMAIL_PREFIX}%")).all()
        user_ids = [user.id for user in users]

        if user_ids:
            candidates = db.query(Candidate).filter(Candidate.user_id.in_(user_ids)).all()
            candidate_ids = [candidate.id for candidate in candidates]
            if candidate_ids:
                db.query(DimensionScore).filter(
                    DimensionScore.candidate_id.in_(candidate_ids)
                ).delete(synchronize_session=False)
                db.query(CandidateDocument).filter(
                    CandidateDocument.candidate_id.in_(candidate_ids)
                ).delete(synchronize_session=False)
            for candidate in candidates:
                db.delete(candidate)

            applications = (
                db.query(Application).filter(Application.user_id.in_(user_ids)).all()
            )
            for app in applications:
                db.query(Document).filter(Document.application_id == app.id).delete(
                    synchronize_session=False
                )
                purge_application_dir(app.id)
                db.delete(app)

            db.query(AuditLog).filter(
                (AuditLog.recruiter_id.in_(user_ids))
                | (AuditLog.candidate_id.in_(user_ids))
            ).delete(synchronize_session=False)
            db.query(RecruitmentPeriod).filter(
                RecruitmentPeriod.created_by.in_(user_ids)
            ).delete(synchronize_session=False)

            for user in users:
                db.delete(user)

        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.name == PERIOD_NAME
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


def _create_user(
    db,
    *,
    suffix: str,
    role: UserRole,
    full_name: str,
    nim: str | None = None,
    faculty: str | None = None,
    major: str | None = None,
) -> User:
    now = datetime.now(timezone.utc)
    user = User(
        email=_email(suffix),
        password_hash=hash_password(TEST_PASSWORD),
        full_name=full_name,
        nim=nim,
        faculty=(
            faculty
            if faculty is not None
            else ("Fakultas Informatika" if role == UserRole.CANDIDATE else None)
        ),
        major=(
            major
            if major is not None
            else ("Data Science" if role == UserRole.CANDIDATE else None)
        ),
        year=2023 if role == UserRole.CANDIDATE else None,
        whatsapp="+6281234567890" if role == UserRole.CANDIDATE else None,
        role=role,
        is_active=True,
        email_verified_at=now,
    )
    db.add(user)
    db.flush()
    return user


def _seed_access_users() -> None:
    db = SessionLocal()
    try:
        _create_user(
            db,
            suffix="recruiter",
            role=UserRole.RECRUITER,
            full_name="Smoke Analytics Recruiter",
        )
        _create_user(
            db,
            suffix="admin",
            role=UserRole.SUPER_ADMIN,
            full_name="Smoke Analytics Admin",
        )
        _create_user(
            db,
            suffix="candidate_access",
            role=UserRole.CANDIDATE,
            full_name="Smoke Analytics Candidate Access",
            nim="1039900000001",
        )
        db.commit()
    finally:
        db.close()


def _login(client: TestClient, suffix: str) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"email": _email(suffix), "password": TEST_PASSWORD},
    )
    if response.status_code != 200:
        raise AssertionError(f"login {suffix} failed: {response.status_code} {response.text}")
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


def _seed_active_period() -> int:
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == _email("admin")).first()
        now = datetime.now(timezone.utc)
        period = RecruitmentPeriod(
            name=PERIOD_NAME,
            start_date=now - timedelta(hours=1),
            submission_end_date=now + timedelta(days=1),
            evaluation_end_date=now + timedelta(days=2),
            end_date=now + timedelta(days=3),
            is_active=True,
            threshold_n=3,
            created_by=admin.id,
        )
        db.add(period)
        db.commit()
        db.refresh(period)
        return period.id
    finally:
        db.close()


def _add_documents(db, application_id: int, doc_types: list[DocumentType]) -> None:
    for doc_type in doc_types:
        db.add(
            Document(
                application_id=application_id,
                doc_type=doc_type,
                file_path=f"uploads/smoke-analytics/{application_id}/{doc_type.value}.pdf",
                file_name=f"{doc_type.value}.pdf",
                file_size=1234,
            )
        )


def _add_application(
    db,
    *,
    suffix: str,
    nim: str,
    period_id: int,
    division: Division,
    status: ApplicationStatus,
    doc_types: list[DocumentType],
    score: float | None = None,
    faculty: str | None = None,
    major: str | None = None,
) -> Application:
    user = _create_user(
        db,
        suffix=suffix,
        role=UserRole.CANDIDATE,
        full_name=f"Smoke Analytics {suffix}",
        nim=nim,
        faculty=faculty,
        major=major,
    )
    app = Application(
        user_id=user.id,
        division=division,
        status=status,
        period_id=period_id,
        submitted_at=(
            datetime.now(timezone.utc)
            if status not in {ApplicationStatus.DRAFT, ApplicationStatus.CANCELLED}
            else None
        ),
    )
    db.add(app)
    db.flush()
    _add_documents(db, app.id, doc_types)

    if score is not None:
        db.add(
            Candidate(
                anonymous_id=f"CAND-A{app.id:06d}",
                user_id=user.id,
                status="scored",
                composite_score=score,
            )
        )
    return app


def _seed_applications(period_id: int) -> None:
    all_docs = list(DocumentType)
    db = SessionLocal()
    try:
        _add_application(
            db,
            suffix="bd_draft",
            nim="1039900000101",
            period_id=period_id,
            division=Division.BIG_DATA,
            status=ApplicationStatus.DRAFT,
            doc_types=[],
        )
        _add_application(
            db,
            suffix="bd_review",
            nim="1039900000102",
            period_id=period_id,
            division=Division.BIG_DATA,
            status=ApplicationStatus.DOCUMENT_REVIEW,
            doc_types=[DocumentType.CV, DocumentType.KHS, DocumentType.KTM],
            faculty="Fakultas Informatika",
            major="Data Science",
        )
        _add_application(
            db,
            suffix="bd_correction",
            nim="1039900000103",
            period_id=period_id,
            division=Division.BIG_DATA,
            status=ApplicationStatus.CORRECTION_REQUESTED,
            doc_types=[
                DocumentType.CV,
                DocumentType.KHS,
                DocumentType.KTM,
                DocumentType.MOTIVATION_LETTER,
                DocumentType.SWOT,
            ],
            faculty="Fakultas Informatika",
            major="Software Engineering",
        )
        _add_application(
            db,
            suffix="bd_verified",
            nim="1039900000104",
            period_id=period_id,
            division=Division.BIG_DATA,
            status=ApplicationStatus.VERIFIED,
            doc_types=all_docs,
            faculty="Fakultas Rekayasa Industri",
            major="Industrial Engineering",
        )
        _add_application(
            db,
            suffix="bd_screening",
            nim="1039900000105",
            period_id=period_id,
            division=Division.BIG_DATA,
            status=ApplicationStatus.SCREENING,
            doc_types=all_docs,
            score=10.0,
            faculty="Fakultas Informatika",
            major="Data Science",
        )
        _add_application(
            db,
            suffix="cs_submitted",
            nim="1039900000201",
            period_id=period_id,
            division=Division.CYBER_SECURITY,
            status=ApplicationStatus.SUBMITTED,
            doc_types=[DocumentType.CV, DocumentType.KHS],
            faculty="Fakultas Informatika",
            major="Cyber Security",
        )
        _add_application(
            db,
            suffix="cs_screening",
            nim="1039900000202",
            period_id=period_id,
            division=Division.CYBER_SECURITY,
            status=ApplicationStatus.SCREENING,
            doc_types=all_docs,
            score=25.0,
            faculty="Fakultas Teknik Elektro",
            major="Computer Engineering",
        )
        _add_application(
            db,
            suffix="cs_announced_fail",
            nim="1039900000203",
            period_id=period_id,
            division=Division.CYBER_SECURITY,
            status=ApplicationStatus.ANNOUNCED_FAIL,
            doc_types=all_docs,
            score=45.0,
            faculty="",
            major="",
        )
        _add_application(
            db,
            suffix="gis_announced_pass",
            nim="1039900000301",
            period_id=period_id,
            division=Division.GIS,
            status=ApplicationStatus.ANNOUNCED_PASS,
            doc_types=all_docs,
            score=75.0,
            faculty="Fakultas Informatika",
            major="Data Science",
        )
        _add_application(
            db,
            suffix="game_screening",
            nim="1039900000401",
            period_id=period_id,
            division=Division.GAME_TECH,
            status=ApplicationStatus.SCREENING,
            doc_types=all_docs,
            score=95.0,
            faculty="Fakultas Industri Kreatif",
            major="Game Development",
        )
        _add_application(
            db,
            suffix="game_cancelled",
            nim="1039900000402",
            period_id=period_id,
            division=Division.GAME_TECH,
            status=ApplicationStatus.CANCELLED,
            doc_types=[DocumentType.CV],
        )
        db.commit()
    finally:
        db.close()


def main() -> int:
    init_db()
    _cleanup()
    _deactivate_all_periods()
    _seed_access_users()
    failures = 0
    client = TestClient(fastapi_app)

    recruiter_auth = _login(client, "recruiter")
    admin_auth = _login(client, "admin")
    candidate_auth = _login(client, "candidate_access")

    response = client.get("/api/recruiter/analytics", headers=candidate_auth)
    failures += _assert(response.status_code == 403, "candidate analytics access -> 403")

    response = client.get("/api/recruiter/analytics", headers=recruiter_auth)
    failures += _assert(response.status_code == 200, "recruiter no active period -> 200")
    if response.status_code == 200:
        data = response.json()["data"]
        failures += _assert(data["active_period"] is None, "no active period returns null period")
        failures += _assert(
            data["summary"]["total_applications"] == 0,
            "no active period returns zero summary",
        )

    response = client.get("/api/recruiter/analytics", headers=admin_auth)
    failures += _assert(response.status_code == 200, "super admin analytics access -> 200")

    period_id = _seed_active_period()

    response = client.get("/api/recruiter/analytics", headers=recruiter_auth)
    failures += _assert(response.status_code == 200, "empty active period -> 200")
    if response.status_code == 200:
        data = response.json()["data"]
        failures += _assert(data["active_period"]["id"] == period_id, "active period is returned")
        failures += _assert(
            data["summary"]["total_applications"] == 0,
            "empty active period has zero applications",
        )
        failures += _assert(
            all(item["total"] == 0 for item in data["applicants_per_division"]),
            "empty active period division counts are zero",
        )
        failures += _assert(
            data["demographics"]["faculty_distribution"] == [],
            "empty active period faculty distribution is empty",
        )
        failures += _assert(
            data["demographics"]["major_distribution"] == [],
            "empty active period major distribution is empty",
        )

    _seed_applications(period_id)

    response = client.get("/api/recruiter/analytics", headers=recruiter_auth)
    failures += _assert(response.status_code == 200, "seeded analytics -> 200")
    data = response.json()["data"] if response.status_code == 200 else {}

    summary = data.get("summary", {})
    failures += _assert(summary.get("total_applications") == 11, "summary total applications")
    failures += _assert(summary.get("submitted_or_later") == 9, "summary submitted_or_later excludes draft/cancelled")
    failures += _assert(summary.get("total_verified") == 1, "summary verified count")
    failures += _assert(summary.get("total_evaluated") == 5, "summary evaluated count")
    failures += _assert(summary.get("total_announced") == 2, "summary announced count")
    failures += _assert(summary.get("total_correction_requested") == 1, "summary correction count")
    failures += _assert(summary.get("average_score") == 50.0, "summary average score")

    by_division = {
        item["division"]: item for item in data.get("applicants_per_division", [])
    }
    failures += _assert(by_division["big_data"]["total"] == 5, "big_data division total")
    failures += _assert(by_division["big_data"]["submitted_or_later"] == 4, "big_data submitted_or_later")
    failures += _assert(by_division["cyber_security"]["total"] == 3, "cyber_security division total")
    failures += _assert(by_division["game_tech"]["total"] == 2, "game_tech division includes cancelled")
    failures += _assert(by_division["gis"]["announced_pass"] == 1, "gis announced pass count")

    funnel = data.get("funnel_counts", {})
    expected_funnel = {
        "draft": 1,
        "submitted": 1,
        "document_review": 1,
        "correction_requested": 1,
        "verified": 1,
        "screening": 3,
        "announced_pass": 1,
        "announced_fail": 1,
        "cancelled": 1,
    }
    for key, expected in expected_funnel.items():
        failures += _assert(funnel.get(key) == expected, f"funnel {key}={expected}")

    docs = data.get("document_completeness", {})
    failures += _assert(docs.get("required_count") == 6, "document required count")
    failures += _assert(docs.get("complete_count") == 6, "document complete count")
    failures += _assert(docs.get("incomplete_count") == 4, "document incomplete count")
    failures += _assert(
        docs.get("average_completion_pct") == 76.7,
        "document average completion percentage",
    )

    missing = {
        item["doc_type"]: item["missing_count"]
        for item in data.get("missing_documents_by_type", [])
    }
    expected_missing = {
        "cv": 1,
        "khs": 1,
        "ktm": 2,
        "motivation_letter": 3,
        "swot": 3,
        "supporting_docs": 4,
    }
    for key, expected in expected_missing.items():
        failures += _assert(missing.get(key) == expected, f"missing {key}={expected}")

    evaluation = data.get("evaluation_progress", {})
    failures += _assert(evaluation.get("eligible_for_evaluation") == 1, "eligible evaluation count")
    failures += _assert(evaluation.get("evaluated_count") == 5, "evaluated progress count")
    failures += _assert(evaluation.get("pending_evaluation_count") == 1, "pending evaluation count")
    failures += _assert(evaluation.get("correction_blocked_count") == 1, "correction blocked count")
    failures += _assert(evaluation.get("document_review_blocked_count") == 1, "document review blocked count")
    failures += _assert(evaluation.get("error_count") == 0, "evaluation error count")

    distribution = data.get("score_distribution", {})
    failures += _assert(distribution.get("count") == 5, "score distribution count")
    failures += _assert(distribution.get("average") == 50.0, "score distribution average")
    failures += _assert(distribution.get("min") == 10.0, "score distribution min")
    failures += _assert(distribution.get("max") == 95.0, "score distribution max")
    bucket_counts = {
        item["label"]: item["count"] for item in distribution.get("buckets", [])
    }
    for label in ["0-20", "21-40", "41-60", "61-80", "81-100"]:
        failures += _assert(bucket_counts.get(label) == 1, f"score bucket {label}=1")

    demographics = data.get("demographics", {})
    faculty_counts = {
        item["label"]: item["count"]
        for item in demographics.get("faculty_distribution", [])
    }
    expected_faculties = {
        "Fakultas Informatika": 5,
        "Fakultas Rekayasa Industri": 1,
        "Fakultas Teknik Elektro": 1,
        "Fakultas Industri Kreatif": 1,
        "Unknown": 1,
    }
    for label, expected in expected_faculties.items():
        failures += _assert(faculty_counts.get(label) == expected, f"faculty {label}={expected}")

    major_counts = {
        item["label"]: item["count"]
        for item in demographics.get("major_distribution", [])
    }
    expected_majors = {
        "Data Science": 3,
        "Software Engineering": 1,
        "Industrial Engineering": 1,
        "Cyber Security": 1,
        "Computer Engineering": 1,
        "Game Development": 1,
        "Unknown": 1,
    }
    for label, expected in expected_majors.items():
        failures += _assert(major_counts.get(label) == expected, f"major {label}={expected}")

    response = client.get(
        "/api/recruiter/analytics?division=big_data",
        headers=recruiter_auth,
    )
    failures += _assert(response.status_code == 200, "division filter big_data -> 200")
    filtered = response.json()["data"] if response.status_code == 200 else {}
    failures += _assert(
        filtered.get("filters", {}).get("division") == "big_data",
        "division filter is echoed",
    )
    failures += _assert(
        filtered.get("summary", {}).get("total_applications") == 5,
        "division filter scopes summary",
    )
    failures += _assert(
        filtered.get("funnel_counts", {}).get("screening") == 1,
        "division filter scopes funnel",
    )
    failures += _assert(
        filtered.get("score_distribution", {}).get("count") == 1,
        "division filter scopes score distribution",
    )
    filtered_demographics = filtered.get("demographics", {})
    filtered_faculty_counts = {
        item["label"]: item["count"]
        for item in filtered_demographics.get("faculty_distribution", [])
    }
    failures += _assert(
        filtered_faculty_counts.get("Fakultas Informatika") == 3,
        "division filter scopes faculty distribution",
    )
    failures += _assert(
        filtered_faculty_counts.get("Fakultas Rekayasa Industri") == 1,
        "division filter keeps matching non-informatics faculty",
    )
    filtered_major_counts = {
        item["label"]: item["count"]
        for item in filtered_demographics.get("major_distribution", [])
    }
    failures += _assert(
        filtered_major_counts.get("Data Science") == 2,
        "division filter scopes major distribution",
    )
    failures += _assert(
        filtered_major_counts.get("Software Engineering") == 1,
        "division filter keeps software major",
    )
    filtered_divisions = {
        item["division"]: item for item in filtered.get("applicants_per_division", [])
    }
    failures += _assert(
        filtered_divisions["cyber_security"]["total"] == 3,
        "applicants_per_division remains all-division overview",
    )

    response = client.get(
        "/api/recruiter/analytics?division=not_a_division",
        headers=recruiter_auth,
    )
    failures += _assert(response.status_code == 422, "invalid division -> 422")

    print()
    if failures == 0:
        print("Analytics smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    return failures


if __name__ == "__main__":
    sys.exit(main())
