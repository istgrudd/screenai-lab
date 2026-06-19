"""Smoke test for Phase 3 W2 — cooperative evaluation-job cancellation.

Guards the W2 cancellation feature:

  1. POST /api/recruiter/evaluate/jobs/{id}/cancel on a running job -> 200,
     status flips to ``cancelling`` and ``cancel_requested`` is true.
  2. The endpoint is idempotent while non-terminal (a second cancel -> 200).
  3. Cooperative stop: the in-flight candidate finishes and commits, the
     remaining candidates are skipped (not evaluated), and the job reaches the
     terminal ``cancelled`` state with as-processed counters (processed < total).
  4. Partial progress is durable: the one committed candidate stays SCREENING
     with a composite_score; the skipped ones stay VERIFIED with no Candidate
     rows.
  5. The division slot frees on the cancelled finalize: a new same-division
     trigger -> 202.
  6. Cancelling an already-finished/cancelled job: 200 no-op when ``cancelled``.

Strategy: run a real (mocked-LLM) 3-candidate job and park the first candidate
inside the RAG stage. While it is parked, fetch the running job via the active
endpoint, request cancel, then release. The runner finishes candidate 1 and
skips the rest. Uses httpx.ASGITransport; the batch POST is driven as a task
because Starlette runs the BackgroundTask to completion before responding.

Run:
    python -m scripts.smoke_test_evaluation_cancel
"""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
import tempfile
import time

os.environ["EMAIL_ENABLED"] = "false"
os.environ["EMAIL_RESEND_COOLDOWN_SECONDS"] = "0"
os.environ["ENVIRONMENT"] = "development"
os.environ["PUBLIC_FRONTEND_URL"] = "http://testserver"

import fitz
import httpx

import backend.services.evaluation_service as evaluation_service
from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.application import Application, ApplicationStatus
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
from backend.models.evaluation_job import EvaluationJob
from backend.models.rubric import Dimension, Rubric
from backend.models.user import User, UserRole
from backend.utils.security import hash_password

PASS = "[PASS]"
FAIL = "[FAIL]"

REC_EMAIL = "smoke+cancel_recruiter@example.com"
CAND_EMAILS = [
    "smoke+cancel_cand1@example.com",
    "smoke+cancel_cand2@example.com",
    "smoke+cancel_cand3@example.com",
]
CAND_NIMS = ["1039876800001", "1039876800002", "1039876800003"]
TEST_PASSWORD = "hunter2secure"
DIVISION = "big_data"
SMOKE_DIM_NAMES = ["Smoke Cancel Dim A", "Smoke Cancel Dim B"]
RUBRIC_DIM_NAMES: list[str] = []

# Coordination between the parked first candidate and the test body.
_FIRST_PARKED = asyncio.Event()
_RELEASE = asyncio.Event()
_park_consumed = {"v": False}


def _assert(cond: bool, msg: str) -> int:
    print(f"{PASS if cond else FAIL} {msg}")
    return 0 if cond else 1


def _minimal_pdf(path: str, text: str) -> None:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text, fontsize=10)
    doc.save(path)
    doc.close()


# ---------------------------------------------------------------------------
# Pipeline stage fakes
# ---------------------------------------------------------------------------

def _fake_anonymize(text: str) -> dict:
    return {"anonymized_text": text, "entities_found": []}


def _fake_parse_khs(file_path: str) -> dict:
    return {"ipk": 3.5, "total_sks": 100, "relevant_courses": []}


async def _fake_evaluate_candidate(*args, **kwargs) -> dict:
    # Park the very first candidate to reach RAG so the test can request cancel
    # while the job is provably mid-run. Later candidates should be skipped
    # before they ever reach this mock.
    if not _park_consumed["v"]:
        _park_consumed["v"] = True
        _FIRST_PARKED.set()
        await _RELEASE.wait()
    names = RUBRIC_DIM_NAMES or SMOKE_DIM_NAMES
    weight = round(1.0 / len(names), 4) if names else 0.0
    return {
        "composite_score": 80.0,
        "profile_summary": "Smoke cancel profile.",
        "dimension_scores": [
            {
                "dimension": name,
                "score": 80,
                "weight": weight,
                "weighted_score": round(80 * weight, 2),
                "justification": "Evidence.",
                "evidence": ["CV project"],
            }
            for name in names
        ],
    }


# ---------------------------------------------------------------------------
# Setup / cleanup
# ---------------------------------------------------------------------------

def _recruiter_id() -> int | None:
    db = SessionLocal()
    try:
        rec = db.query(User).filter(User.email == REC_EMAIL).first()
        return rec.id if rec else None
    finally:
        db.close()


def _delete_test_jobs() -> None:
    rec_id = _recruiter_id()
    if rec_id is None:
        return
    db = SessionLocal()
    try:
        db.query(EvaluationJob).filter(
            EvaluationJob.triggered_by == rec_id
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _cleanup() -> None:
    _delete_test_jobs()
    db = SessionLocal()
    try:
        for email in [REC_EMAIL, *CAND_EMAILS]:
            for u in db.query(User).filter(User.email == email).all():
                for c in db.query(Candidate).filter(Candidate.user_id == u.id).all():
                    db.query(DimensionScore).filter(
                        DimensionScore.candidate_id == c.id
                    ).delete(synchronize_session=False)
                    db.query(CandidateDocument).filter(
                        CandidateDocument.candidate_id == c.id
                    ).delete(synchronize_session=False)
                    db.delete(c)
                for a in db.query(Application).filter(Application.user_id == u.id).all():
                    db.query(Document).filter(
                        Document.application_id == a.id
                    ).delete(synchronize_session=False)
                    db.delete(a)
                db.delete(u)
        smoke_dims = (
            db.query(Dimension).filter(Dimension.name.in_(SMOKE_DIM_NAMES)).all()
        )
        for dim in smoke_dims:
            db.query(DimensionScore).filter(
                DimensionScore.dimension_id == dim.id
            ).delete(synchronize_session=False)
            db.delete(dim)
        db.commit()
    finally:
        db.close()


def _ensure_rubric_with_dimensions(division: str) -> None:
    db = SessionLocal()
    try:
        rubric = db.query(Rubric).filter(Rubric.division == division).first()
        if rubric is None:
            rubric = Rubric(
                name=division,
                position="Smoke Cancel Position",
                division=division,
                description="",
            )
            db.add(rubric)
            db.flush()
        total_weight = sum(d.weight for d in rubric.dimensions)
        if not (rubric.dimensions and 0.99 <= total_weight <= 1.01):
            if rubric.dimensions:
                raise RuntimeError(
                    f"{division} rubric has dimensions with invalid weight sum "
                    f"({total_weight}); fix the rubric before running this test"
                )
            for name in SMOKE_DIM_NAMES:
                db.add(
                    Dimension(
                        rubric_id=rubric.id,
                        name=name,
                        weight=0.5,
                        description="Smoke cancel dimension",
                        indicators=["smoke"],
                    )
                )
            db.commit()
        dims = db.query(Dimension).filter(Dimension.rubric_id == rubric.id).all()
        RUBRIC_DIM_NAMES.clear()
        RUBRIC_DIM_NAMES.extend(d.name for d in dims)
    finally:
        db.close()


def _create_recruiter() -> None:
    db = SessionLocal()
    try:
        db.add(
            User(
                email=REC_EMAIL,
                password_hash=hash_password(TEST_PASSWORD),
                full_name="Smoke Cancel Recruiter",
                role=UserRole.RECRUITER,
                is_active=True,
            )
        )
        db.commit()
    finally:
        db.close()


def _create_candidates(doc_dir: str) -> list[int]:
    app_ids: list[int] = []
    db = SessionLocal()
    try:
        for i, (email, nim) in enumerate(zip(CAND_EMAILS, CAND_NIMS)):
            user = User(
                email=email,
                password_hash=hash_password(TEST_PASSWORD),
                full_name=f"Smoke Cancel Candidate {i + 1}",
                nim=nim,
                faculty="Fakultas Informatika",
                major="Data Science",
                year=2023,
                role=UserRole.CANDIDATE,
                is_active=True,
            )
            db.add(user)
            db.flush()

            app = Application(
                user_id=user.id,
                division=DIVISION,
                status=ApplicationStatus.VERIFIED,
            )
            db.add(app)
            db.flush()
            app_ids.append(app.id)

            files = {
                DocumentType.CV: (f"cv_{i}.pdf", f"CV content for smoke cancel candidate {i + 1}"),
                DocumentType.KTM: (f"ktm_{i}.pdf", f"KARTU TANDA MAHASISWA\nNIM: {nim}\n"),
                DocumentType.KHS: (f"khs_{i}.pdf", f"TRANSKRIP AKADEMIK\nNIM: {nim}\nIPK: 3.50\n"),
            }
            for doc_type, (fname, text) in files.items():
                fpath = os.path.join(doc_dir, fname)
                _minimal_pdf(fpath, text)
                db.add(
                    Document(
                        application_id=app.id,
                        doc_type=doc_type,
                        file_path=fpath,
                        file_name=fname,
                        file_size=os.path.getsize(fpath),
                    )
                )
        db.commit()
    finally:
        db.close()
    return app_ids


async def _await_job_status(
    client: httpx.AsyncClient,
    rec_auth: dict,
    job_id: int,
    statuses: tuple[str, ...],
    timeout: float = 30.0,
) -> dict | None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        r = await client.get(
            f"/api/recruiter/evaluate/jobs/{job_id}", headers=rec_auth
        )
        if r.status_code == 200:
            data = r.json()["data"]
            if data and data["status"] in statuses:
                return data
        await asyncio.sleep(0.05)
    return None


# ---------------------------------------------------------------------------
# Test body
# ---------------------------------------------------------------------------

async def test_cancel(
    client: httpx.AsyncClient, rec_auth: dict, app_ids: list[int]
) -> int:
    failures = 0
    saved = {
        "anonymize_text": evaluation_service.anonymize_text,
        "parse_khs": evaluation_service.parse_khs,
        "evaluate_candidate": evaluation_service.evaluate_candidate,
    }
    evaluation_service.anonymize_text = _fake_anonymize
    evaluation_service.parse_khs = _fake_parse_khs
    evaluation_service.evaluate_candidate = _fake_evaluate_candidate
    _FIRST_PARKED.clear()
    _RELEASE.clear()
    _park_consumed["v"] = False

    try:
        post_task = asyncio.create_task(
            client.post(
                "/api/recruiter/evaluate/batch",
                headers=rec_auth,
                json={"division": DIVISION, "application_ids": app_ids},
            )
        )

        # Candidate 1 parks inside RAG — the job is now provably running.
        try:
            await asyncio.wait_for(_FIRST_PARKED.wait(), timeout=15)
            parked = True
        except asyncio.TimeoutError:
            parked = False
        failures += _assert(parked, "first candidate reached the parked RAG stage")

        # Discover the running job via the active endpoint.
        r = await client.get(
            f"/api/recruiter/evaluate/jobs/active?division={DIVISION}",
            headers=rec_auth,
        )
        active = r.json().get("data") if r.status_code == 200 else None
        failures += _assert(
            active is not None and active["status"] == "running",
            f"active job is running while parked (got {active})",
        )
        job_id = active["id"] if active else None

        if job_id is not None:
            # --- Request cancel on the running job ---
            rc = await client.post(
                f"/api/recruiter/evaluate/jobs/{job_id}/cancel", headers=rec_auth
            )
            failures += _assert(
                rc.status_code == 200, f"cancel running job -> 200 (got {rc.status_code})"
            )
            cdata = rc.json().get("data") if rc.status_code == 200 else {}
            failures += _assert(
                cdata.get("status") == "cancelling",
                f"running job flips to 'cancelling' (got {cdata.get('status')})",
            )
            failures += _assert(
                cdata.get("cancel_requested") is True,
                "cancel_requested is true after cancel",
            )

            # --- Idempotent: a second cancel while non-terminal -> 200 ---
            rc2 = await client.post(
                f"/api/recruiter/evaluate/jobs/{job_id}/cancel", headers=rec_auth
            )
            failures += _assert(
                rc2.status_code == 200,
                f"second cancel (cancelling) is idempotent -> 200 (got {rc2.status_code})",
            )

        # Release the parked candidate; the runner finishes it and skips the rest.
        _RELEASE.set()
        rb = await post_task
        failures += _assert(rb.status_code == 202, f"batch -> 202 (got {rb.status_code})")

        final = None
        if job_id is not None:
            final = await _await_job_status(
                client, rec_auth, job_id, ("cancelled", "completed", "failed"), timeout=30
            )
        failures += _assert(
            final is not None and final["status"] == "cancelled",
            f"job reaches terminal 'cancelled' (got {final and final['status']})",
        )
        if final:
            failures += _assert(
                final["total"] == 3, f"total stays 3 (got {final['total']})"
            )
            failures += _assert(
                final["succeeded"] == 1,
                f"exactly the in-flight candidate succeeded (got {final['succeeded']})",
            )
            failures += _assert(
                final["failed"] == 0, f"no failures (got {final['failed']})"
            )
            failures += _assert(
                final["processed"] == 1,
                f"processing stopped early: processed=1 < total=3 (got {final['processed']})",
            )
            failures += _assert(
                final["note"] == "cancelled by recruiter",
                f"cancelled note set (got {final.get('note')!r})",
            )

        # --- Partial progress durable: exactly one committed, two untouched ---
        db = SessionLocal()
        try:
            apps = {
                a.id: a
                for a in db.query(Application).filter(Application.id.in_(app_ids)).all()
            }
            screening = [
                a for a in apps.values() if a.status == ApplicationStatus.SCREENING
            ]
            verified = [
                a for a in apps.values() if a.status == ApplicationStatus.VERIFIED
            ]
            failures += _assert(
                len(screening) == 1 and len(verified) == 2,
                f"one committed (SCREENING), two skipped (VERIFIED) "
                f"(screening={len(screening)}, verified={len(verified)})",
            )
            if len(screening) == 1:
                committed = (
                    db.query(Candidate)
                    .filter(Candidate.user_id == screening[0].user_id)
                    .first()
                )
                failures += _assert(
                    committed is not None and committed.composite_score is not None,
                    "committed candidate has a durable composite_score",
                )
            skipped_orphans = sum(
                db.query(Candidate).filter(Candidate.user_id == a.user_id).count()
                for a in verified
            )
            failures += _assert(
                skipped_orphans == 0,
                f"skipped candidates left no Candidate rows (got {skipped_orphans})",
            )
        finally:
            db.close()

        # --- Slot freed: a new same-division trigger -> 202 ---
        rn = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": DIVISION, "application_ids": app_ids, "force": True},
        )
        failures += _assert(
            rn.status_code == 202,
            f"division slot freed after cancel: new trigger -> 202 (got {rn.status_code})",
        )
        # Let that follow-up job settle so cleanup is clean (no parking now).
        if rn.status_code == 202:
            new_id = rn.json().get("job_id")
            if new_id:
                await _await_job_status(
                    client, rec_auth, new_id, ("completed", "failed", "cancelled"), timeout=30
                )

        # --- Cancelling an already-terminal cancelled job -> 200 no-op ---
        if job_id is not None:
            rt = await client.post(
                f"/api/recruiter/evaluate/jobs/{job_id}/cancel", headers=rec_auth
            )
            failures += _assert(
                rt.status_code == 200,
                f"cancel on already-cancelled job -> 200 no-op (got {rt.status_code})",
            )

        # --- 404 for an unknown job ---
        r404 = await client.post(
            "/api/recruiter/evaluate/jobs/99999999/cancel", headers=rec_auth
        )
        failures += _assert(
            r404.status_code == 404, f"cancel unknown job -> 404 (got {r404.status_code})"
        )
    finally:
        _RELEASE.set()
        for name, fn in saved.items():
            setattr(evaluation_service, name, fn)
        _delete_test_jobs()
    return failures


async def _amain() -> int:
    failures = 0
    _cleanup()
    doc_dir = tempfile.mkdtemp(prefix="smoke_cancel_")
    try:
        _ensure_rubric_with_dimensions(DIVISION)
        _create_recruiter()
        app_ids = _create_candidates(doc_dir)

        transport = httpx.ASGITransport(app=fastapi_app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver", timeout=60
        ) as client:
            r = await client.post(
                "/api/auth/login",
                json={"email": REC_EMAIL, "password": TEST_PASSWORD},
            )
            failures += _assert(
                r.status_code == 200, f"recruiter login -> 200 (got {r.status_code})"
            )
            rec_auth = {"Authorization": f"Bearer {r.json()['data']['access_token']}"}

            failures += await test_cancel(client, rec_auth, app_ids)
    finally:
        _cleanup()
        shutil.rmtree(doc_dir, ignore_errors=True)

    print()
    if failures == 0:
        print("W2 cancellation smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")
    return failures


def main() -> int:
    return asyncio.run(_amain())


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
