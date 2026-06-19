"""Smoke test for the recruiter "Validasi Evaluasi AI" marker.

Covers PUT /api/candidates/{id}/ai-validation and the related response fields:
  * candidate without an AI result cannot be validated -> 400
  * recruiter can set "validated" without a note -> 200
  * recruiter can set "needs_discussion" with a note -> 200
  * "needs_discussion" without a note -> 400
  * invalid status -> 422
  * reset to "pending" clears validator / timestamp / note -> 200
  * candidate detail returns the ai_validation object
  * candidate list returns ai_validation_status
  * a candidate (non recruiter/admin) cannot update validation -> 403
  * candidate detail with a KHS document (nested LLM-parser sections_json,
    incl. a None field) returns 200, not 500 — regression for the old
    get_candidate `v.strip()` crash

Re-evaluation reset (validated -> pending after a fresh AI result) is verified
at the service layer in evaluation_service and recorded as a manual check; it
needs the full document/LLM pipeline so it is not exercised here.

Run:
    python -m scripts.smoke_test_ai_validation
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

os.environ.setdefault("EMAIL_ENABLED", "false")
os.environ.setdefault("ENVIRONMENT", "development")

from fastapi.testclient import TestClient

from backend.database import SessionLocal, init_db
from backend.main import app as fastapi_app
from backend.models.audit import AuditLog
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.user import User, UserRole
from backend.utils.security import hash_password


PASS = "[PASS]"
FAIL = "[FAIL]"
TEST_PASSWORD = "hunter2secure"
EMAIL_PREFIX = "smoke+aivalid_"

# Nested LLM-parser KHS payload — the real shape stored in
# CandidateDocument.sections_json for KHS docs. Its values are a dict
# (parsed_khs) and None (processing_error), which crashed the old
# get_candidate `v.strip()` with AttributeError -> 500.
KHS_SECTIONS_JSON = {
    "parsed_khs": {
        "ipk_final": 3.5,
        "total_sks_final": 100,
        "courses": [{"code": "CII3A3", "name": "Machine Learning", "grade": "A"}],
        "ongoing_courses": [],
        "parse_warning": None,
        "parser_version": "telkom_khs_llm_v1",
    },
    "processing_status": "completed",
    "processing_error": None,
    "source": "llm_parser",
}

# Flat {section: text} payload — the cv/motivation_letter shape. Mixed values
# verify the helper keeps only non-empty *string* sections.
CV_SECTIONS_JSON = {
    "education": "S1 Informatika, Telkom University",
    "experience": "Built an internal analytics dashboard.",
    "skills": "",       # empty string -> excluded
    "_meta": None,      # non-string -> excluded
}


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _email(suffix: str) -> str:
    return f"{EMAIL_PREFIX}{suffix}@example.com"


def _cleanup() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.email.like(f"{EMAIL_PREFIX}%")).all()
        user_ids = [u.id for u in users]
        if user_ids:
            candidates = (
                db.query(Candidate).filter(Candidate.user_id.in_(user_ids)).all()
            )
            candidate_ids = [c.id for c in candidates]
            if candidate_ids:
                db.query(DimensionScore).filter(
                    DimensionScore.candidate_id.in_(candidate_ids)
                ).delete(synchronize_session=False)
                db.query(CandidateDocument).filter(
                    CandidateDocument.candidate_id.in_(candidate_ids)
                ).delete(synchronize_session=False)
            for c in candidates:
                db.delete(c)
            db.query(AuditLog).filter(
                (AuditLog.recruiter_id.in_(user_ids))
                | (AuditLog.candidate_id.in_(user_ids))
            ).delete(synchronize_session=False)
            for u in users:
                db.delete(u)
        db.commit()
    finally:
        db.close()


def _create_user(db, *, suffix: str, role: UserRole, full_name: str) -> User:
    now = datetime.now(timezone.utc)
    user = User(
        email=_email(suffix),
        password_hash=hash_password(TEST_PASSWORD),
        full_name=full_name,
        role=role,
        is_active=True,
        email_verified_at=now,
    )
    db.add(user)
    db.flush()
    return user


def _seed() -> dict:
    """Create users + two candidate rows (one scored, one unscored)."""
    db = SessionLocal()
    try:
        _create_user(db, suffix="recruiter", role=UserRole.RECRUITER, full_name="AI Validation Recruiter")
        _create_user(db, suffix="admin", role=UserRole.SUPER_ADMIN, full_name="AI Validation Admin")
        cand_scored_user = _create_user(
            db, suffix="scored", role=UserRole.CANDIDATE, full_name="AI Validation Scored"
        )
        cand_unscored_user = _create_user(
            db, suffix="unscored", role=UserRole.CANDIDATE, full_name="AI Validation Unscored"
        )

        scored = Candidate(
            anonymous_id="CAND-AIVALS1",
            user_id=cand_scored_user.id,
            status="scored",
            composite_score=82.0,
        )
        unscored = Candidate(
            anonymous_id="CAND-AIVALU1",
            user_id=cand_unscored_user.id,
            status="anonymized",
            composite_score=None,
        )
        db.add_all([scored, unscored])
        db.flush()

        # Attach documents to the scored candidate so candidate-detail exercises
        # the sections_json rendering path. The KHS doc carries the nested
        # LLM-parser payload (the bug fixture); the CV doc carries flat sections.
        db.add_all([
            CandidateDocument(
                candidate_id=scored.id,
                filename="khs.pdf",
                file_path="data/raw_pdfs/smoke_aivalid_khs.pdf",
                document_type="khs",
                sections_json=KHS_SECTIONS_JSON,
            ),
            CandidateDocument(
                candidate_id=scored.id,
                filename="cv.pdf",
                file_path="data/raw_pdfs/smoke_aivalid_cv.pdf",
                document_type="cv",
                sections_json=CV_SECTIONS_JSON,
            ),
        ])
        db.flush()
        ids = {"scored_id": scored.id, "unscored_id": unscored.id}
        db.commit()
        return ids
    finally:
        db.close()


def _login(client: TestClient, suffix: str) -> dict:
    r = client.post(
        "/api/auth/login",
        json={"email": _email(suffix), "password": TEST_PASSWORD},
    )
    if r.status_code != 200:
        raise AssertionError(f"login {suffix} failed: {r.status_code} {r.text}")
    return {"Authorization": f"Bearer {r.json()['data']['access_token']}"}


def main() -> int:
    init_db()
    _cleanup()
    ids = _seed()
    scored_id = ids["scored_id"]
    unscored_id = ids["unscored_id"]
    failures = 0
    client = TestClient(fastapi_app)

    rec_auth = _login(client, "recruiter")
    admin_auth = _login(client, "admin")
    cand_auth = _login(client, "scored")

    # --- Default state: pending in detail + list; KHS doc must not 500 ---
    r = client.get(f"/api/candidates/{scored_id}", headers=rec_auth)
    failures += _assert(
        r.status_code == 200,
        f"candidate detail with KHS document -> 200, not 500 (got {r.status_code})",
    )
    if r.status_code == 200:
        data = r.json()["data"]
        failures += _assert("ai_validation" in data, "detail contains ai_validation object")
        failures += _assert(
            data.get("ai_validation", {}).get("status") == "pending",
            "default ai_validation status is pending",
        )
        # Regression: a KHS document's sections_json is the nested LLM-parser
        # payload (dict + None values), not flat strings. The old v.strip()
        # raised AttributeError and 500'd this whole response.
        docs = {d["document_type"]: d for d in data.get("documents", [])}
        failures += _assert(
            docs.get("khs", {}).get("sections_detected") == [],
            "KHS document sections_detected is [] (nested payload excluded)",
        )
        failures += _assert(
            sorted(docs.get("cv", {}).get("sections_detected", []))
            == ["education", "experience"],
            "CV document sections_detected keeps only non-empty string sections",
        )

    r = client.get("/api/candidates", headers=rec_auth)
    if r.status_code == 200:
        rows = {row["candidate_id"]: row for row in r.json()["data"]}
        failures += _assert(
            "ai_validation_status" in rows.get(scored_id, {}),
            "candidate list item contains ai_validation_status",
        )
        failures += _assert(
            rows.get(scored_id, {}).get("ai_validation_status") == "pending",
            "candidate list ai_validation_status defaults to pending",
        )

    # --- Cannot validate a candidate with no AI result -> 400 ---
    r = client.put(
        f"/api/candidates/{unscored_id}/ai-validation",
        headers=rec_auth,
        json={"status": "validated"},
    )
    failures += _assert(r.status_code == 400, "validate unscored candidate -> 400")

    # --- validated without note -> 200 ---
    r = client.put(
        f"/api/candidates/{scored_id}/ai-validation",
        headers=rec_auth,
        json={"status": "validated"},
    )
    failures += _assert(r.status_code == 200, "set validated without note -> 200")
    if r.status_code == 200:
        av = r.json()["data"]["ai_validation"]
        failures += _assert(av["status"] == "validated", "status is validated")
        failures += _assert(av["validated_by"] is not None, "validated_by recorded")
        failures += _assert(av["validated_at"] is not None, "validated_at recorded")
        failures += _assert(av["note"] is None, "validated note is null when omitted")

    # --- needs_discussion without note -> 400 ---
    r = client.put(
        f"/api/candidates/{scored_id}/ai-validation",
        headers=rec_auth,
        json={"status": "needs_discussion"},
    )
    failures += _assert(r.status_code == 400, "needs_discussion without note -> 400")

    # --- needs_discussion with note -> 200 ---
    r = client.put(
        f"/api/candidates/{scored_id}/ai-validation",
        headers=admin_auth,
        json={"status": "needs_discussion", "note": "Skor AI terlihat terlalu rendah."},
    )
    failures += _assert(r.status_code == 200, "needs_discussion with note -> 200")
    if r.status_code == 200:
        av = r.json()["data"]["ai_validation"]
        failures += _assert(av["status"] == "needs_discussion", "status is needs_discussion")
        failures += _assert(
            av["note"] == "Skor AI terlihat terlalu rendah.",
            "needs_discussion note stored",
        )

    # --- invalid status -> 422 (schema rejects) ---
    r = client.put(
        f"/api/candidates/{scored_id}/ai-validation",
        headers=rec_auth,
        json={"status": "approved"},
    )
    failures += _assert(r.status_code == 422, "invalid status 'approved' -> 422")

    # --- reset to pending clears validator/timestamp/note -> 200 ---
    r = client.put(
        f"/api/candidates/{scored_id}/ai-validation",
        headers=rec_auth,
        json={"status": "pending"},
    )
    failures += _assert(r.status_code == 200, "reset to pending -> 200")
    if r.status_code == 200:
        av = r.json()["data"]["ai_validation"]
        failures += _assert(av["status"] == "pending", "status reset to pending")
        failures += _assert(av["validated_by"] is None, "validator cleared on pending")
        failures += _assert(av["validated_at"] is None, "timestamp cleared on pending")
        failures += _assert(av["note"] is None, "note cleared on pending")

    # --- candidate (non recruiter/admin) cannot update -> 403 ---
    r = client.put(
        f"/api/candidates/{scored_id}/ai-validation",
        headers=cand_auth,
        json={"status": "validated"},
    )
    failures += _assert(r.status_code == 403, "candidate update validation -> 403")

    print()
    if failures == 0:
        print("AI validation smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")

    _cleanup()
    return failures


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
