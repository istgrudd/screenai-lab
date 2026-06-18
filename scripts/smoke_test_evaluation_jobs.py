"""Smoke test for Phase 2 evaluation background jobs + polling.

Covers the Phase 2 work from docs/reports/EVALUATION_FREEZE_AUDIT_REPORT.md
(Phase 2) and the Phase 2 implementation plan:

  1. POST /api/recruiter/evaluate/batch -> 202 with a job_id, status queued,
     correct total.
  2. Duplicate POST for the same division while a job is active -> 409
     (DB-level partial unique index).
  3. POST for a different division while the first is active -> 202.
  4. GET /evaluate/jobs/{id} reflects progress + the terminal state; finished_at
     and started_at set.
  5. GET /evaluate/jobs/active?division returns the running job; null when none.
  6. Real pipeline, 3 candidates, middle one's LLM call raises: total=3,
     succeeded=2, failed=1, errors has exactly 1 entry; the two successes are
     SCREENING + composite_score persisted; the failure stays VERIFIED with no
     partial Candidate/CandidateDocument/DimensionScore rows.
  7. Job transitions queued -> running -> completed (started_at set).
  8. Startup recovery: a seeded running job becomes failed("interrupted by
     restart") with finished_at set.
  9. Two concurrent POSTs, same division -> exactly one 202, one 409.
 10. Slot released when a job reaches a terminal (failed) state -> a subsequent
     POST for the same division succeeds.
 11. /api/health stays responsive while a real job runs.

Uses httpx.ASGITransport so no live server is needed. Note: Starlette runs a
request's BackgroundTasks to completion before the ASGI app coroutine returns,
so after a 202 the job is already terminal under this transport — the tests
poll the job state regardless so they are robust either way.

Run:
    python -m scripts.smoke_test_evaluation_jobs
"""

from __future__ import annotations

import asyncio
import math
import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone

os.environ["EMAIL_ENABLED"] = "false"
os.environ["EMAIL_RESEND_COOLDOWN_SECONDS"] = "0"
os.environ["ENVIRONMENT"] = "development"
os.environ["PUBLIC_FRONTEND_URL"] = "http://testserver"

import fitz
import httpx

import backend.routers.evaluate_batch as evaluate_batch_router
import backend.services.evaluation_service as evaluation_service
from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
from backend.models.evaluation_job import EvaluationJob, EvaluationJobStatus
from backend.models.rubric import Dimension, Rubric
from backend.models.user import User, UserRole
from backend.services.evaluation_service import recover_interrupted_jobs
from backend.utils.security import hash_password

PASS = "[PASS]"
FAIL = "[FAIL]"

REC_EMAIL = "smoke+jobs_recruiter@example.com"
CAND_EMAILS = [
    "smoke+jobs_cand1@example.com",
    "smoke+jobs_cand2@example.com",
    "smoke+jobs_cand3@example.com",
]
CAND_NIMS = ["1039876700001", "1039876700002", "1039876700003"]
TEST_PASSWORD = "hunter2secure"
SMOKE_DIM_NAMES = ["Smoke Jobs Dim A", "Smoke Jobs Dim B"]
# Actual dimension names of the big_data rubric, captured at setup. The mock
# evaluation must return these names so store_evaluation_results (which matches
# DimensionScore rows by dimension name) can persist them — the rubric may
# already carry differently-named dims from another suite's run.
RUBRIC_DIM_NAMES: list[str] = []
FAIL_MARKER = "SMOKE_JOBS_FAIL_MARKER"
PRIMARY_DIVISION = "big_data"
OTHER_DIVISION = "cyber_security"

ANON_SLEEP_SECONDS = 1.5
HEALTH_MAX_LATENCY_SECONDS = 1.0

SMOKE_PARSED_KHS = {
    "ipk_final": 3.5,
    "total_sks_final": 100,
    "ips_history": [{"term_label": "Semester 5", "ips": 3.5, "total_sks": 20}],
    "courses": [],
    "ongoing_courses": [],
    "parse_warning": None,
    "parser_version": "telkom_khs_llm_v1",
    "ipk": 3.5,
    "total_sks": 100,
    "relevant_courses": [],
}


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
# Pipeline stage fakes (patched onto evaluation_service module globals)
# ---------------------------------------------------------------------------

def _fake_anonymize(text: str) -> dict:
    time.sleep(ANON_SLEEP_SECONDS)  # heavy sync work — must stay off the loop
    return {"anonymized_text": text, "entities_found": []}


def _fake_parse_khs(file_path: str) -> dict:
    return dict(SMOKE_PARSED_KHS)


async def _fake_evaluate_candidate(*args, **kwargs) -> dict:
    payload = args[0] if args else kwargs.get("anonymized_cv")
    text = (payload or {}).get("anonymized_text", "")
    if FAIL_MARKER in text:
        raise RuntimeError("smoke: intentional candidate failure")
    names = RUBRIC_DIM_NAMES or SMOKE_DIM_NAMES
    weight = round(1.0 / len(names), 4) if names else 0.0
    return {
        "composite_score": 82.0,
        "profile_summary": "Smoke jobs profile summary.",
        "dimension_scores": [
            {
                "dimension": name,
                "score": 80,
                "weight": weight,
                "weighted_score": round(80 * weight, 2),
                "justification": "Strong evidence.",
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
    """Remove every evaluation_jobs row this test created (by triggered_by)."""
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
    """Ensure the division rubric has a valid (sum=1.0) dimension pair."""
    db = SessionLocal()
    try:
        rubric = db.query(Rubric).filter(Rubric.division == division).first()
        if rubric is None:
            rubric = Rubric(
                name=division,
                position="Smoke Jobs Position",
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
                    f"({total_weight}); fix the rubric before running this smoke test"
                )
            for name in SMOKE_DIM_NAMES:
                db.add(
                    Dimension(
                        rubric_id=rubric.id,
                        name=name,
                        weight=0.5,
                        description="Smoke jobs dimension",
                        indicators=["smoke"],
                    )
                )
            db.commit()
        # Capture the primary division's actual dimension names so the mock
        # returns matching names (store_evaluation_results matches by name).
        if division == PRIMARY_DIVISION:
            dims = (
                db.query(Dimension).filter(Dimension.rubric_id == rubric.id).all()
            )
            RUBRIC_DIM_NAMES.clear()
            RUBRIC_DIM_NAMES.extend(d.name for d in dims)
    finally:
        db.close()


def _create_candidates(doc_dir: str) -> list[int]:
    """Create 3 users + VERIFIED big_data applications + document rows."""
    app_ids: list[int] = []
    db = SessionLocal()
    try:
        for i, (email, nim) in enumerate(zip(CAND_EMAILS, CAND_NIMS)):
            user = User(
                email=email,
                password_hash=hash_password(TEST_PASSWORD),
                full_name=f"Smoke Jobs Candidate {i + 1}",
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
                division=PRIMARY_DIVISION,
                status=ApplicationStatus.VERIFIED,
            )
            db.add(app)
            db.flush()
            app_ids.append(app.id)

            cv_text = f"CV content for smoke jobs candidate {i + 1}"
            if i == 1:  # the middle candidate's evaluation must fail
                cv_text += f" {FAIL_MARKER}"
            files = {
                DocumentType.CV: (f"cv_{i}.pdf", cv_text),
                DocumentType.KTM: (
                    f"ktm_{i}.pdf",
                    f"KARTU TANDA MAHASISWA\nNIM: {nim}\n",
                ),
                DocumentType.KHS: (
                    f"khs_{i}.pdf",
                    f"TRANSKRIP AKADEMIK\nNIM: {nim}\nIPK: 3.50\n",
                ),
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


def _create_recruiter() -> None:
    db = SessionLocal()
    try:
        db.add(
            User(
                email=REC_EMAIL,
                password_hash=hash_password(TEST_PASSWORD),
                full_name="Smoke Jobs Recruiter",
                role=UserRole.RECRUITER,
                is_active=True,
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_running_job(division: str) -> int:
    """Insert a non-terminal (running) job directly, bypassing the endpoint."""
    rec_id = _recruiter_id()
    db = SessionLocal()
    try:
        job = EvaluationJob(
            division=Division(division),
            status=EvaluationJobStatus.RUNNING,
            force=False,
            total=1,
            processed=0,
            succeeded=0,
            failed=0,
            errors=[],
            triggered_by=rec_id,
            started_at=datetime.now(timezone.utc),
        )
        db.add(job)
        db.commit()
        return job.id
    finally:
        db.close()


async def _await_job_terminal(
    client: httpx.AsyncClient, rec_auth: dict, job_id: int, timeout: float = 30.0
) -> dict | None:
    """Poll GET /jobs/{id} until the job is terminal or the timeout elapses."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        r = await client.get(
            f"/api/recruiter/evaluate/jobs/{job_id}", headers=rec_auth
        )
        if r.status_code == 200:
            data = r.json()["data"]
            if data and data["status"] in ("completed", "failed"):
                return data
        await asyncio.sleep(0.1)
    return None


# ---------------------------------------------------------------------------
# Test parts
# ---------------------------------------------------------------------------

async def test_startup_recovery() -> int:
    """A seeded running job becomes failed('interrupted by restart')."""
    failures = 0
    job_id = _seed_running_job(PRIMARY_DIVISION)
    recovered = recover_interrupted_jobs(SessionLocal)
    failures += _assert(recovered >= 1, f"recover_interrupted_jobs returned >=1 (got {recovered})")

    db = SessionLocal()
    try:
        job = db.get(EvaluationJob, job_id)
        status = job.status.value if hasattr(job.status, "value") else job.status
        failures += _assert(status == "failed", f"interrupted job -> failed (got {status})")
        failures += _assert(
            job.note == "interrupted by restart",
            f"interrupted job note set (got {job.note!r})",
        )
        failures += _assert(job.finished_at is not None, "interrupted job finished_at set")
    finally:
        db.close()
    _delete_test_jobs()
    return failures


async def test_active_endpoint_and_409(
    client: httpx.AsyncClient, rec_auth: dict
) -> int:
    """active endpoint + DB-level 409 + different-division acceptance."""
    failures = 0
    seeded_id = _seed_running_job(PRIMARY_DIVISION)
    try:
        # active endpoint returns the running job
        r = await client.get(
            f"/api/recruiter/evaluate/jobs/active?division={PRIMARY_DIVISION}",
            headers=rec_auth,
        )
        body = r.json()
        failures += _assert(
            r.status_code == 200 and body["data"] and body["data"]["id"] == seeded_id,
            f"active endpoint returns running job (got {body.get('data')})",
        )

        # active endpoint returns null for a division with no active job
        r = await client.get(
            "/api/recruiter/evaluate/jobs/active?division=game_tech",
            headers=rec_auth,
        )
        failures += _assert(
            r.status_code == 200 and r.json()["data"] is None,
            "active endpoint returns null when no job (HTTP 200)",
        )

        # duplicate trigger for the same division -> 409
        r = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": PRIMARY_DIVISION},
        )
        failures += _assert(
            r.status_code == 409,
            f"duplicate trigger same division -> 409 (got {r.status_code})",
        )
        if r.status_code == 409:
            failures += _assert(
                "already running" in r.json().get("detail", "").lower(),
                "409 detail mentions 'already running'",
            )

        # different division while the first is active -> 202
        r = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": OTHER_DIVISION},
        )
        failures += _assert(
            r.status_code == 202,
            f"different division during active job -> 202 (got {r.status_code})",
        )
        if r.status_code == 202:
            failures += _assert(
                isinstance(r.json().get("job_id"), int),
                "different-division 202 carries a job_id",
            )
    finally:
        _delete_test_jobs()
    return failures


async def test_concurrent_triggers(
    client: httpx.AsyncClient, rec_auth: dict, app_ids: list[int]
) -> int:
    """Two concurrent POSTs, same division -> exactly one 202, one 409."""
    failures = 0
    original = evaluate_batch_router.run_evaluation_job
    started = asyncio.Event()
    release = asyncio.Event()

    async def _held_runner(job_id, division, application_ids, rubric_id, session_factory):
        # The job row is already queued (slot taken) before this runs; hold it
        # non-terminal so a concurrent duplicate trigger hits the index.
        started.set()
        await release.wait()

    evaluate_batch_router.run_evaluation_job = _held_runner
    try:
        task_a = asyncio.create_task(
            client.post(
                "/api/recruiter/evaluate/batch",
                headers=rec_auth,
                json={"division": PRIMARY_DIVISION, "application_ids": app_ids},
            )
        )
        await asyncio.wait_for(started.wait(), timeout=10)

        rb = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": PRIMARY_DIVISION, "application_ids": app_ids},
        )
        failures += _assert(
            rb.status_code == 409,
            f"concurrent duplicate -> 409 (got {rb.status_code})",
        )

        release.set()
        ra = await task_a
        failures += _assert(
            ra.status_code == 202,
            f"first concurrent trigger -> 202 (got {ra.status_code})",
        )
    finally:
        release.set()
        evaluate_batch_router.run_evaluation_job = original
        _delete_test_jobs()
    return failures


async def test_slot_released_on_failure(
    client: httpx.AsyncClient, rec_auth: dict
) -> int:
    """A terminal (failed) job frees the slot: a later same-division POST -> 202."""
    failures = 0
    original = evaluate_batch_router.run_evaluation_job

    async def _failing_runner(job_id, division, application_ids, rubric_id, session_factory):
        sess = session_factory()
        try:
            j = sess.get(EvaluationJob, job_id)
            j.status = EvaluationJobStatus.FAILED
            j.finished_at = datetime.now(timezone.utc)
            j.note = "smoke: forced failure"
            sess.commit()
        finally:
            sess.close()

    evaluate_batch_router.run_evaluation_job = _failing_runner
    try:
        r = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": PRIMARY_DIVISION},
        )
        failures += _assert(
            r.status_code == 202, f"trigger (will fail) -> 202 (got {r.status_code})"
        )
        job_id = r.json().get("job_id")
        final = await _await_job_terminal(client, rec_auth, job_id, timeout=10)
        failures += _assert(
            final is not None and final["status"] == "failed",
            "failing job reaches terminal 'failed' state",
        )

        r = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": PRIMARY_DIVISION},
        )
        failures += _assert(
            r.status_code == 202,
            f"slot released on failure: next trigger -> 202 (got {r.status_code})",
        )
    finally:
        evaluate_batch_router.run_evaluation_job = original
        _delete_test_jobs()
    return failures


async def test_real_pipeline_run(
    client: httpx.AsyncClient, rec_auth: dict, app_ids: list[int]
) -> int:
    """202 contract, transitions, isolation, counters, health responsiveness."""
    failures = 0
    saved = {
        "anonymize_text": evaluation_service.anonymize_text,
        "parse_khs": evaluation_service.parse_khs,
        "evaluate_candidate": evaluation_service.evaluate_candidate,
    }
    evaluation_service.anonymize_text = _fake_anonymize
    evaluation_service.parse_khs = _fake_parse_khs
    evaluation_service.evaluate_candidate = _fake_evaluate_candidate

    health_samples: list[float] = []
    done = asyncio.Event()

    async def _poll_health() -> None:
        while not done.is_set():
            t0 = time.perf_counter()
            r = await client.get("/api/health")
            health_samples.append(time.perf_counter() - t0)
            if r.status_code != 200:
                health_samples.append(float("inf"))
            await asyncio.sleep(0.1)

    try:
        poller = asyncio.create_task(_poll_health())
        r = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": PRIMARY_DIVISION, "application_ids": app_ids},
            timeout=120,
        )
        failures += _assert(
            r.status_code == 202, f"real pipeline trigger -> 202 (got {r.status_code})"
        )
        if r.status_code != 202:
            done.set()
            await poller
            return failures + 1

        body = r.json()
        failures += _assert(
            isinstance(body.get("job_id"), int), "202 carries an integer job_id"
        )
        failures += _assert(
            body.get("status") == "queued",
            f"202 status == 'queued' (got {body.get('status')})",
        )
        failures += _assert(
            body.get("total") == 3, f"202 total == 3 (got {body.get('total')})"
        )
        job_id = body["job_id"]

        final = await _await_job_terminal(client, rec_auth, job_id, timeout=60)
        done.set()
        await poller

        failures += _assert(final is not None, "job reached a terminal state")
        if final is None:
            return failures + 1

        failures += _assert(
            final["status"] == "completed",
            f"job status == completed (got {final['status']})",
        )
        failures += _assert(final["total"] == 3, f"job total == 3 (got {final['total']})")
        failures += _assert(
            final["succeeded"] == 2, f"job succeeded == 2 (got {final['succeeded']})"
        )
        failures += _assert(
            final["failed"] == 1, f"job failed == 1 (got {final['failed']})"
        )
        failures += _assert(
            final["processed"] == 3, f"job processed == 3 (got {final['processed']})"
        )
        failures += _assert(
            len(final["errors"]) == 1
            and final["errors"][0]["application_id"] == app_ids[1],
            f"exactly the middle candidate errored (errors={final['errors']})",
        )
        failures += _assert(
            final["started_at"] is not None and final["finished_at"] is not None,
            "job started_at + finished_at set (queued -> running -> completed)",
        )

        worst = max(health_samples) if health_samples else float("inf")
        failures += _assert(
            len(health_samples) >= 3 and worst < HEALTH_MAX_LATENCY_SECONDS,
            f"/api/health responsive during run (samples={len(health_samples)}, "
            f"worst={worst:.3f}s, sync stage sleep={ANON_SLEEP_SECONDS}s)",
        )

        # --- DB state: successes committed, failure left no partial rows ---
        db = SessionLocal()
        try:
            apps = {
                a.id: a
                for a in db.query(Application)
                .filter(Application.id.in_(app_ids))
                .all()
            }
            failures += _assert(
                apps[app_ids[0]].status == ApplicationStatus.SCREENING
                and apps[app_ids[2]].status == ApplicationStatus.SCREENING,
                "successful candidates committed to SCREENING",
            )
            failures += _assert(
                apps[app_ids[1]].status == ApplicationStatus.VERIFIED,
                f"failed candidate stays VERIFIED (got {apps[app_ids[1]].status})",
            )
            for idx in (0, 2):
                cand = (
                    db.query(Candidate)
                    .filter(Candidate.user_id == apps[app_ids[idx]].user_id)
                    .first()
                )
                failures += _assert(
                    cand is not None and cand.composite_score == 82.0,
                    f"candidate {idx + 1} has committed composite_score 82.0",
                )
                dim_count = (
                    db.query(DimensionScore)
                    .filter(DimensionScore.candidate_id == cand.id)
                    .count()
                    if cand
                    else 0
                )
                expected_dims = len(RUBRIC_DIM_NAMES)
                failures += _assert(
                    dim_count == expected_dims,
                    f"candidate {idx + 1} has {expected_dims} dimension scores (got {dim_count})",
                )
            failed_user_id = apps[app_ids[1]].user_id
            orphan = (
                db.query(Candidate)
                .filter(Candidate.user_id == failed_user_id)
                .count()
            )
            failures += _assert(
                orphan == 0,
                f"failed candidate left no partial Candidate rows (got {orphan})",
            )
        finally:
            db.close()
    finally:
        done.set()
        for name, fn in saved.items():
            setattr(evaluation_service, name, fn)
        _delete_test_jobs()
    return failures


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def _amain() -> int:
    failures = 0
    _cleanup()
    doc_dir = tempfile.mkdtemp(prefix="smoke_jobs_")
    try:
        _ensure_rubric_with_dimensions(PRIMARY_DIVISION)
        _ensure_rubric_with_dimensions(OTHER_DIVISION)
        _create_recruiter()
        app_ids = _create_candidates(doc_dir)

        # Startup recovery does not need an HTTP client.
        failures += await test_startup_recovery()

        transport = httpx.ASGITransport(app=fastapi_app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver", timeout=120
        ) as client:
            r = await client.post(
                "/api/auth/login",
                json={"email": REC_EMAIL, "password": TEST_PASSWORD},
            )
            failures += _assert(
                r.status_code == 200, f"recruiter login -> 200 (got {r.status_code})"
            )
            rec_auth = {
                "Authorization": f"Bearer {r.json()['data']['access_token']}"
            }

            failures += await test_active_endpoint_and_409(client, rec_auth)
            failures += await test_concurrent_triggers(client, rec_auth, app_ids)
            failures += await test_slot_released_on_failure(client, rec_auth)
            failures += await test_real_pipeline_run(client, rec_auth, app_ids)
    finally:
        _cleanup()
        shutil.rmtree(doc_dir, ignore_errors=True)

    print()
    if failures == 0:
        print("All Phase 2 evaluation-jobs smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")
    return failures


def main() -> int:
    return asyncio.run(_amain())


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
