"""Smoke test for Phase 8 NER and evaluation flow adjustment.

Run:
    python -m scripts.smoke_test_ner_evaluation_flow
"""

from __future__ import annotations

import io
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ["EMAIL_ENABLED"] = "false"
os.environ["EMAIL_RESEND_COOLDOWN_SECONDS"] = "0"
os.environ["ENVIRONMENT"] = "development"
os.environ["PUBLIC_FRONTEND_URL"] = "http://testserver"

from fastapi.testclient import TestClient

import backend.routers.applications as applications_router
import backend.services.evaluation_service as evaluation_service
import backend.services.submit_anonymization as submit_anonymization
from backend.database import SessionLocal, init_db
from backend.main import app as fastapi_app
from backend.models.application import Application
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
from backend.models.email_notification import EmailNotification
from backend.models.period import RecruitmentPeriod
from backend.models.rubric import Dimension, Rubric
from backend.models.user import User, UserRole
from backend.utils.file_storage import purge_application_dir
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"

REC_EMAIL = "smoke+phase8_recruiter@example.com"
TEST_PASSWORD = "hunter2secure"
PERIOD_NAME = "smoke+phase8 ner evaluation period"
DIVISION = "gis"

CANDIDATES = {
    "cache": ("smoke+phase8_cache@example.com", "1039876580001"),
    "fallback": ("smoke+phase8_fallback@example.com", "1039876580002"),
    "ml_fallback": ("smoke+phase8_ml_fallback@example.com", "1039876580005"),
    "review": ("smoke+phase8_review@example.com", "1039876580003"),
    "correction": ("smoke+phase8_correction@example.com", "1039876580004"),
}

SUBMIT_NER_CALLS: list[int] = []
SUBMIT_EXTRACT_CALLS: Counter[str] = Counter()
EVAL_EXTRACT_CALLS: Counter[str] = Counter()
EVAL_PAYLOADS: list[str] = []


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _minimal_pdf(text: str = "document") -> bytes:
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<<>>stream\n"
        + text.encode("utf-8")
        + b"\nendstream endobj\ntrailer<<>>\n%%EOF\n"
    )


def _doc_type_from_path(pdf_path: str) -> str:
    name = Path(pdf_path).name.lower()
    for doc_type in (
        "motivation_letter",
        "supporting_docs",
        "cv",
        "khs",
        "ktm",
        "swot",
    ):
        if name.startswith(doc_type):
            return doc_type
    return "unknown"


def _fake_extract(counter: Counter[str], pdf_path: str) -> dict:
    doc_type = _doc_type_from_path(pdf_path)
    counter[doc_type] += 1
    file_size_kb = round(os.path.getsize(pdf_path) / 1024.0, 2)
    return {
        "raw_text": f"{doc_type} raw text from {Path(pdf_path).name}",
        "pages": [f"{doc_type} page"],
        "metadata": {"page_count": 1, "file_size_kb": file_size_kb},
    }


def _fake_submit_extract(pdf_path: str) -> dict:
    return _fake_extract(SUBMIT_EXTRACT_CALLS, pdf_path)


def _fake_eval_extract(pdf_path: str) -> dict:
    return _fake_extract(EVAL_EXTRACT_CALLS, pdf_path)


def _fake_normalize(raw_text: str) -> dict:
    return {
        "normalized_text": f"normalized {raw_text}",
        "sections": {"other": raw_text},
    }


def _fake_anonymize(text: str) -> dict:
    return {
        "anonymized_text": f"ANON {text}",
        "entities_found": [
            {"text": "Smoke Candidate", "label": "PERSON", "replacement": "[PERSON_1]"}
        ],
    }


def _fake_validate_ktm(*args, **kwargs) -> dict:
    return {"valid": True, "warning": None}


def _fake_parse_khs(*args, **kwargs) -> dict:
    return {"ipk": 3.7, "total_sks": 100, "relevant_courses": ["Machine Learning"]}


def _fake_format_khs_summary(khs_result: dict) -> str:
    return f"IPK: {khs_result['ipk']}; SKS: {khs_result['total_sks']}"


async def _fake_evaluate_candidate(*args, **kwargs) -> dict:
    anonymized_cv = kwargs.get("anonymized_cv") or args[0]
    rubric_id = kwargs.get("rubric_id") or args[1]
    db = kwargs.get("db") or args[2]
    dimensions = (
        db.query(Dimension)
        .filter(Dimension.rubric_id == rubric_id)
        .order_by(Dimension.id)
        .all()
    )
    EVAL_PAYLOADS.append(anonymized_cv.get("anonymized_text", ""))
    return {
        "composite_score": 88.0,
        "profile_summary": "Phase 8 smoke profile.",
        "dimension_scores": [
            {
                "dimension": dimension.name,
                "score": 88,
                "weight": dimension.weight,
                "weighted_score": 88 * dimension.weight,
                "justification": "Smoke-test evidence.",
                "evidence": ["CV project"],
            }
            for dimension in dimensions
        ],
    }


def _tracking_run_submit_anonymization(application_id: int, session_factory) -> None:
    SUBMIT_NER_CALLS.append(application_id)
    submit_anonymization.run_submit_anonymization(application_id, session_factory)


def _install_fakes() -> None:
    submit_anonymization.extract_text_from_pdf = _fake_submit_extract
    submit_anonymization.normalize_and_segment = _fake_normalize
    submit_anonymization.anonymize_text = _fake_anonymize
    applications_router.run_submit_anonymization = _tracking_run_submit_anonymization

    evaluation_service.extract_text_from_pdf = _fake_eval_extract
    evaluation_service.normalize_and_segment = _fake_normalize
    evaluation_service.anonymize_text = _fake_anonymize
    evaluation_service.validate_ktm = _fake_validate_ktm
    evaluation_service.parse_khs = _fake_parse_khs
    evaluation_service.format_khs_summary = _fake_format_khs_summary
    evaluation_service.evaluate_candidate = _fake_evaluate_candidate


def _cleanup() -> None:
    db = SessionLocal()
    try:
        emails = [REC_EMAIL] + [email for email, _nim in CANDIDATES.values()]
        nims = [nim for _email, nim in CANDIDATES.values()]
        db.query(EmailNotification).filter(
            EmailNotification.to_email.in_(emails)
        ).delete(synchronize_session=False)
        users = db.query(User).filter((User.email.in_(emails)) | (User.nim.in_(nims))).all()
        user_ids = [user.id for user in users]

        if user_ids:
            for candidate in db.query(Candidate).filter(Candidate.user_id.in_(user_ids)).all():
                db.query(DimensionScore).filter(
                    DimensionScore.candidate_id == candidate.id
                ).delete(synchronize_session=False)
                db.query(CandidateDocument).filter(
                    CandidateDocument.candidate_id == candidate.id
                ).delete(synchronize_session=False)
                db.delete(candidate)

            for application in db.query(Application).filter(
                Application.user_id.in_(user_ids)
            ).all():
                db.query(Document).filter(
                    Document.application_id == application.id
                ).delete(synchronize_session=False)
                purge_application_dir(application.id)
                db.delete(application)

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
        for rubric in db.query(Rubric).filter(Rubric.name == "Smoke Phase 8 Rubric").all():
            db.query(Dimension).filter(Dimension.rubric_id == rubric.id).delete(
                synchronize_session=False
            )
            db.delete(rubric)
        db.commit()
    finally:
        db.close()


def _seed_data() -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        recruiter = User(
            email=REC_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke Phase 8 Recruiter",
            role=UserRole.RECRUITER,
            is_active=True,
            email_verified_at=now,
        )
        db.add(recruiter)
        db.flush()

        for label, (email, nim) in CANDIDATES.items():
            db.add(
                User(
                    email=email,
                    password_hash=hash_password(TEST_PASSWORD),
                    full_name=f"Smoke Phase 8 {label.title()} Candidate",
                    nim=nim,
                    faculty="Fakultas Informatika",
                    major="Data Science",
                    year=2023,
                    ipk=3.46,
                    whatsapp="+6281234567890",
                    role=UserRole.CANDIDATE,
                    is_active=True,
                    email_verified_at=now,
                )
            )

        db.query(RecruitmentPeriod).filter(
            RecruitmentPeriod.is_active == True  # noqa: E712
        ).update({RecruitmentPeriod.is_active: False}, synchronize_session=False)
        db.add(
            RecruitmentPeriod(
                name=PERIOD_NAME,
                start_date=now - timedelta(hours=1),
                submission_end_date=now + timedelta(days=1),
                evaluation_end_date=now + timedelta(days=2),
                end_date=now + timedelta(days=3),
                is_active=True,
                threshold_n=None,
                created_by=recruiter.id,
            )
        )

        rubric = Rubric(
            name="Smoke Phase 8 Rubric",
            position="Lab Assistant",
            division=DIVISION,
        )
        db.add(rubric)
        db.flush()
        db.add_all(
            [
                Dimension(
                    rubric_id=rubric.id,
                    name="Technical Skills",
                    weight=0.5,
                    description="Technical fit",
                    indicators=["Python", "data"],
                ),
                Dimension(
                    rubric_id=rubric.id,
                    name="Soft Skills",
                    weight=0.5,
                    description="Communication fit",
                    indicators=["motivation", "teamwork"],
                ),
            ]
        )
        db.commit()
    finally:
        db.close()


def _login(client: TestClient, email: str) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": TEST_PASSWORD},
    )
    if response.status_code != 200:
        raise AssertionError(f"Login failed for {email}: {response.status_code} {response.text}")
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


def _upload_all_documents(client: TestClient, auth: dict, label: str) -> None:
    for doc_type in DocumentType:
        response = client.post(
            f"/api/documents/upload/{doc_type.value}",
            headers=auth,
            files={
                "file": (
                    f"{doc_type.value}_{label}.pdf",
                    io.BytesIO(_minimal_pdf(f"{label} {doc_type.value}")),
                    "application/pdf",
                )
            },
        )
        if response.status_code != 201:
            raise AssertionError(
                f"Upload {doc_type.value} failed: {response.status_code} {response.text}"
            )


def _create_submitted_application(client: TestClient, auth: dict, label: str) -> int:
    response = client.post(
        "/api/applications",
        headers=auth,
        json={"division": DIVISION},
    )
    if response.status_code != 201:
        raise AssertionError(f"Create app failed: {response.status_code} {response.text}")
    app_id = response.json()["data"]["id"]
    _upload_all_documents(client, auth, label)
    response = client.post(f"/api/applications/{app_id}/submit", headers=auth)
    if response.status_code != 200:
        raise AssertionError(f"Submit app failed: {response.status_code} {response.text}")
    if response.json()["data"]["status"] != "document_review":
        raise AssertionError("Submitted application did not enter document_review")
    return app_id


def _docs_by_type(client: TestClient, app_id: int, auth: dict) -> dict[str, dict]:
    response = client.get(f"/api/documents/{app_id}", headers=auth)
    if response.status_code != 200:
        raise AssertionError(f"List docs failed: {response.status_code} {response.text}")
    return {doc["doc_type"]: doc for doc in response.json()["data"]["documents"]}


def _review_document(
    client: TestClient,
    doc_id: int,
    auth: dict,
    review_status: str,
    reason: str | None = None,
) -> None:
    payload = {"status": review_status}
    if reason:
        payload["reason"] = reason
    response = client.put(
        f"/api/documents/{doc_id}/review",
        headers=auth,
        json=payload,
    )
    if response.status_code != 200:
        raise AssertionError(f"Review doc failed: {response.status_code} {response.text}")


def _verify_all_documents(client: TestClient, app_id: int, auth: dict) -> None:
    for doc in _docs_by_type(client, app_id, auth).values():
        _review_document(client, doc["id"], auth, "verified")


def _candidate_document_snapshot(email: str) -> dict[str, dict]:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        candidate = db.query(Candidate).filter(Candidate.user_id == user.id).first()
        if candidate is None:
            return {}
        docs = (
            db.query(CandidateDocument)
            .filter(CandidateDocument.candidate_id == candidate.id)
            .all()
        )
        return {
            doc.document_type: {
                "filename": doc.filename,
                "file_path": doc.file_path,
                "raw_text": doc.raw_text,
                "anonymized_text": doc.anonymized_text,
            }
            for doc in docs
        }
    finally:
        db.close()


def _clear_candidate_documents(email: str) -> None:
    _delete_candidate_document(email, None)


def _delete_candidate_document(email: str, document_type: str | None) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        candidate = db.query(Candidate).filter(Candidate.user_id == user.id).first()
        if candidate:
            query = db.query(CandidateDocument).filter(
                CandidateDocument.candidate_id == candidate.id
            )
            if document_type:
                query = query.filter(CandidateDocument.document_type == document_type)
            query.delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _create_stale_cv_cache(email: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        candidate = db.query(Candidate).filter(Candidate.user_id == user.id).first()
        if candidate is None:
            candidate = Candidate(
                anonymous_id="CAND-PH8STALE",
                user_id=user.id,
                rubric_id=None,
                status="anonymized",
            )
            db.add(candidate)
            db.flush()
        db.add(
            CandidateDocument(
                candidate_id=candidate.id,
                filename="old_cv.pdf",
                file_path="old/path/cv.pdf",
                document_type="cv",
                raw_text="old raw",
                normalized_text="old normalized",
                anonymized_text="STALE CV CACHE",
                entities_json=[],
            )
        )
        db.commit()
    finally:
        db.close()


def main() -> int:
    init_db()
    _cleanup()
    _seed_data()
    _install_fakes()
    SUBMIT_NER_CALLS.clear()
    SUBMIT_EXTRACT_CALLS.clear()
    EVAL_EXTRACT_CALLS.clear()
    EVAL_PAYLOADS.clear()

    failures = 0
    client = TestClient(fastapi_app)
    recruiter_auth = _login(client, REC_EMAIL)
    candidate_auth = {
        label: _login(client, email) for label, (email, _nim) in CANDIDATES.items()
    }

    # 1. Submit and individual review do not run NER.
    cache_app_id = _create_submitted_application(client, candidate_auth["cache"], "cache")
    cache_email = CANDIDATES["cache"][0]
    failures += _assert(SUBMIT_NER_CALLS == [], "submit does not queue NER")
    failures += _assert(
        _candidate_document_snapshot(cache_email) == {},
        "submit does not create CandidateDocument cache",
    )

    cache_docs = _docs_by_type(client, cache_app_id, recruiter_auth)
    _review_document(client, cache_docs["cv"]["id"], recruiter_auth, "verified")
    failures += _assert(SUBMIT_NER_CALLS == [], "individual document review does not queue NER")
    failures += _assert(
        _candidate_document_snapshot(cache_email) == {},
        "individual document review does not create NER cache",
    )

    for doc_type, doc in cache_docs.items():
        if doc_type == "cv":
            continue
        _review_document(client, doc["id"], recruiter_auth, "verified")

    response = client.post(
        f"/api/applications/{cache_app_id}/finalize-document-review",
        headers=recruiter_auth,
    )
    failures += _assert(response.status_code == 200, "finalize accepted review -> 200")
    if response.status_code == 200:
        body = response.json()["data"]
        failures += _assert(body["status"] == "verified", "finalize accepted -> verified")
        failures += _assert(body["anonymization_queued"] is True, "finalize accepted queues NER")
    failures += _assert(SUBMIT_NER_CALLS == [cache_app_id], "NER runs only after finalize accepted")

    cache_snapshot = _candidate_document_snapshot(cache_email)
    failures += _assert(
        bool(cache_snapshot.get("cv", {}).get("anonymized_text")),
        "post-finalize NER creates CV anonymized cache",
    )
    failures += _assert(
        bool(cache_snapshot.get("motivation_letter", {}).get("anonymized_text")),
        "post-finalize NER creates motivation letter anonymized cache",
    )
    failures += _assert(
        bool(cache_snapshot.get("swot", {}).get("raw_text")),
        "post-finalize NER creates SWOT raw-text cache",
    )

    EVAL_EXTRACT_CALLS.clear()
    response = client.post(
        "/api/recruiter/evaluate/batch",
        headers=recruiter_auth,
        json={"division": DIVISION, "application_ids": [cache_app_id]},
    )
    failures += _assert(response.status_code == 200, "evaluation with cache -> 200")
    if response.status_code == 200:
        failures += _assert(response.json()["evaluated_count"] == 1, "verified app with cache is evaluated")
    failures += _assert(
        EVAL_EXTRACT_CALLS["cv"] == 0,
        "evaluation uses cached CV without inline CV extraction",
    )
    failures += _assert(
        EVAL_EXTRACT_CALLS["motivation_letter"] == 0,
        "evaluation uses cached motivation letter without inline extraction",
    )
    failures += _assert(
        "=== SURAT MOTIVASI ===" in (EVAL_PAYLOADS[-1] if EVAL_PAYLOADS else ""),
        "evaluation payload includes cached motivation letter context",
    )

    # 2. CV cache hit still falls back inline when motivation-letter cache is missing.
    ml_fallback_app_id = _create_submitted_application(
        client, candidate_auth["ml_fallback"], "ml_fallback"
    )
    _verify_all_documents(client, ml_fallback_app_id, recruiter_auth)
    response = client.post(
        f"/api/applications/{ml_fallback_app_id}/finalize-document-review",
        headers=recruiter_auth,
    )
    failures += _assert(response.status_code == 200, "ML fallback app finalize -> 200")
    _delete_candidate_document(CANDIDATES["ml_fallback"][0], "motivation_letter")

    EVAL_EXTRACT_CALLS.clear()
    response = client.post(
        "/api/recruiter/evaluate/batch",
        headers=recruiter_auth,
        json={"division": DIVISION, "application_ids": [ml_fallback_app_id]},
    )
    failures += _assert(response.status_code == 200, "evaluation with missing ML cache -> 200")
    if response.status_code == 200:
        failures += _assert(
            response.json()["evaluated_count"] == 1,
            "verified app with missing ML cache is evaluated",
        )
    failures += _assert(
        EVAL_EXTRACT_CALLS["cv"] == 0,
        "missing ML cache path still uses cached CV",
    )
    failures += _assert(
        EVAL_EXTRACT_CALLS["motivation_letter"] >= 1,
        "missing ML cache path falls back to inline ML extraction",
    )
    ml_snapshot = _candidate_document_snapshot(CANDIDATES["ml_fallback"][0])
    failures += _assert(
        bool(ml_snapshot.get("motivation_letter", {}).get("anonymized_text")),
        "missing ML cache path rebuilds motivation letter cache",
    )

    # 3. Verified app with missing cache falls back inline and stores cache.
    fallback_app_id = _create_submitted_application(
        client, candidate_auth["fallback"], "fallback"
    )
    _verify_all_documents(client, fallback_app_id, recruiter_auth)
    response = client.post(
        f"/api/applications/{fallback_app_id}/finalize-document-review",
        headers=recruiter_auth,
    )
    failures += _assert(response.status_code == 200, "fallback app finalize -> 200")
    _clear_candidate_documents(CANDIDATES["fallback"][0])

    EVAL_EXTRACT_CALLS.clear()
    response = client.post(
        "/api/recruiter/evaluate/batch",
        headers=recruiter_auth,
        json={"division": DIVISION, "application_ids": [fallback_app_id]},
    )
    failures += _assert(response.status_code == 200, "evaluation fallback without cache -> 200")
    if response.status_code == 200:
        failures += _assert(response.json()["evaluated_count"] == 1, "verified app without cache is evaluated")
    failures += _assert(EVAL_EXTRACT_CALLS["cv"] >= 1, "fallback extracts CV inline")
    failures += _assert(
        EVAL_EXTRACT_CALLS["motivation_letter"] >= 1,
        "fallback extracts motivation letter inline",
    )
    fallback_snapshot = _candidate_document_snapshot(CANDIDATES["fallback"][0])
    failures += _assert(
        bool(fallback_snapshot.get("cv", {}).get("anonymized_text")),
        "fallback stores rebuilt CV cache",
    )
    failures += _assert(
        bool(fallback_snapshot.get("motivation_letter", {}).get("anonymized_text")),
        "fallback stores rebuilt motivation letter cache",
    )

    # 4. document_review apps are skipped by evaluation and do not run NER.
    review_app_id = _create_submitted_application(client, candidate_auth["review"], "review")
    response = client.post(
        "/api/recruiter/evaluate/batch",
        headers=recruiter_auth,
        json={"division": DIVISION, "application_ids": [review_app_id]},
    )
    failures += _assert(response.status_code == 200, "document_review evaluation request -> 200")
    if response.status_code == 200:
        body = response.json()
        failures += _assert(body["evaluated_count"] == 0, "document_review app is not evaluated")
        failures += _assert(
            body["skipped_unverified_count"] == 1,
            "document_review app counted as skipped unverified",
        )
    failures += _assert(
        review_app_id not in SUBMIT_NER_CALLS,
        "document_review app never queues NER before finalize",
    )

    # 5. correction_requested does not run NER/evaluation; replacement clears stale cache.
    correction_app_id = _create_submitted_application(
        client, candidate_auth["correction"], "correction"
    )
    correction_email = CANDIDATES["correction"][0]
    correction_docs = _docs_by_type(client, correction_app_id, recruiter_auth)
    _review_document(
        client,
        correction_docs["cv"]["id"],
        recruiter_auth,
        "rejected",
        reason="CV tidak sesuai format.",
    )
    for doc_type, doc in correction_docs.items():
        if doc_type == "cv":
            continue
        _review_document(client, doc["id"], recruiter_auth, "verified")

    response = client.post(
        f"/api/applications/{correction_app_id}/finalize-document-review",
        headers=recruiter_auth,
    )
    failures += _assert(response.status_code == 200, "finalize rejected review -> 200")
    if response.status_code == 200:
        body = response.json()["data"]
        failures += _assert(
            body["status"] == "correction_requested",
            "rejected finalize -> correction_requested",
        )
        failures += _assert(
            body["anonymization_queued"] is False,
            "rejected finalize does not queue NER",
        )
    failures += _assert(
        correction_app_id not in SUBMIT_NER_CALLS,
        "correction_requested app has no NER call",
    )

    response = client.post(
        "/api/recruiter/evaluate/batch",
        headers=recruiter_auth,
        json={"division": DIVISION, "application_ids": [correction_app_id]},
    )
    failures += _assert(response.status_code == 200, "correction evaluation request -> 200")
    if response.status_code == 200:
        body = response.json()
        failures += _assert(body["evaluated_count"] == 0, "correction app is not evaluated")
        failures += _assert(
            body["skipped_correction_count"] == 1,
            "correction app counted as skipped correction",
        )

    _create_stale_cv_cache(correction_email)
    failures += _assert(
        _candidate_document_snapshot(correction_email).get("cv", {}).get("anonymized_text")
        == "STALE CV CACHE",
        "test seeded stale CV cache before replacement",
    )

    response = client.put(
        f"/api/documents/{correction_docs['cv']['id']}/replace",
        headers=candidate_auth["correction"],
        files={
            "file": (
                "cv_replacement.pdf",
                io.BytesIO(_minimal_pdf("replacement cv")),
                "application/pdf",
            )
        },
    )
    failures += _assert(response.status_code == 200, "candidate replaces rejected CV")
    failures += _assert(
        "cv" not in _candidate_document_snapshot(correction_email),
        "replacement invalidates stale CV cache",
    )

    _review_document(client, correction_docs["cv"]["id"], recruiter_auth, "verified")
    response = client.post(
        f"/api/applications/{correction_app_id}/finalize-document-review",
        headers=recruiter_auth,
    )
    failures += _assert(response.status_code == 200, "finalize after replacement -> 200")
    if response.status_code == 200:
        failures += _assert(
            response.json()["data"]["status"] == "verified",
            "replacement flow finalizes to verified",
        )
    failures += _assert(
        correction_app_id in SUBMIT_NER_CALLS,
        "replacement flow queues fresh NER after final accepted review",
    )
    correction_snapshot = _candidate_document_snapshot(correction_email)
    failures += _assert(
        correction_snapshot.get("cv", {}).get("filename") == "cv_replacement.pdf",
        "fresh CV cache uses replacement file metadata",
    )
    failures += _assert(
        correction_snapshot.get("cv", {}).get("anonymized_text") != "STALE CV CACHE",
        "fresh CV cache is not stale content",
    )

    print()
    if failures == 0:
        print("Phase 8 NER/evaluation smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    return failures


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
