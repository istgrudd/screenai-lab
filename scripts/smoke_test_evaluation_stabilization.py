"""Smoke test for Phase 1 evaluation stabilization (Phase 2 async-job contract).

Guards the Phase 1 fixes from docs/reports/EVALUATION_FREEZE_AUDIT_REPORT.md,
re-verified through the Phase 2 background-job entry point. Phase 2 changed the
batch endpoint contract from an inline 200 to **202 + job_id** running the
pipeline as a FastAPI BackgroundTask, so the same invariants are now reached
through the job runner:

  1. LLM clients constructed with explicit timeout and max_retries=0.
  2. Division mutual-exclusion: while one division's job is non-terminal, a
     concurrent trigger for the same division returns 409 (DB-level partial
     unique index, not an in-process lock); a different division is accepted
     (202) at the same time.
  3. The division slot is released after a job fails: the next same-division
     trigger is accepted (202).
  4. Per-candidate transaction isolation: one failing candidate does not
     prevent the others from committing, and leaves no partial rows behind.
  5. /api/health stays responsive while an evaluation with slow sync stages
     is running (event loop not blocked thanks to asyncio.to_thread).

Uses httpx.ASGITransport so no live server is needed. Starlette runs a
request's BackgroundTasks to completion before the ASGI response returns, so
after a 202 the job is already terminal under this transport; the pipeline
test polls the job state either way.

Run:
    python -m scripts.smoke_test_evaluation_stabilization
"""

from __future__ import annotations

import asyncio
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
import backend.utils.llm_client as llm_client
from backend.config import settings
from backend.database import SessionLocal
from backend.main import app as fastapi_app
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
from backend.models.evaluation_job import EvaluationJob, EvaluationJobStatus
from backend.models.rubric import Dimension, Rubric
from backend.models.user import User, UserRole
from backend.utils.security import hash_password

PASS = "[PASS]"
FAIL = "[FAIL]"

REC_EMAIL = "smoke+stab_recruiter@example.com"
CAND_EMAILS = [
    "smoke+stab_cand1@example.com",
    "smoke+stab_cand2@example.com",
    "smoke+stab_cand3@example.com",
]
CAND_NIMS = ["1039876600001", "1039876600002", "1039876600003"]
TEST_PASSWORD = "hunter2secure"
SMOKE_DIM_NAMES = ["Smoke Stab Dim A", "Smoke Stab Dim B"]
# Actual dimension names of the big_data rubric, captured at setup. The mock
# evaluation must return these names so store_evaluation_results (which matches
# DimensionScore rows by dimension name) can persist them — the rubric may
# already carry differently-named dims from another suite's run.
RUBRIC_DIM_NAMES: list[str] = []
FAIL_MARKER = "SMOKE_STAB_FAIL_MARKER"

# Sleep inside the fake NER stage. With asyncio.to_thread this runs in a
# worker thread; if a regression puts it back on the event loop, the
# /api/health latency assertion below fails.
ANON_SLEEP_SECONDS = 1.5
HEALTH_MAX_LATENCY_SECONDS = 1.0

SMOKE_PARSED_KHS = {
    "ipk_final": 3.5,
    "total_sks_final": 100,
    "ips_history": [{"term_label": "Semester 5", "ips": 3.5, "total_sks": 20}],
    "courses": [
        {
            "code": "CII3A3",
            "name_id": "Machine Learning",
            "name_en": None,
            "sks": 3,
            "grade": "A",
            "term_label": "Semester 5",
            "status": "completed",
            "is_completed": True,
            "name": "Machine Learning",
            "semester": 5,
        }
    ],
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
        "profile_summary": "Smoke stabilization profile summary.",
        "dimension_scores": [
            {
                "dimension": name,
                "score": 82,
                "weight": weight,
                "weighted_score": round(82 * weight, 2),
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
    """Remove every evaluation_jobs row this test created (by triggered_by).

    Held/failing-runner tests leave non-terminal rows that would otherwise hold
    a division's partial-unique slot for later tests.
    """
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
        # Drop only the dimensions this script created.
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


def _ensure_rubric_with_dimensions(division: str) -> tuple[int, bool]:
    """Return (rubric_id, created_dims) for a division with valid weights."""
    db = SessionLocal()
    try:
        rubric = db.query(Rubric).filter(Rubric.division == division).first()
        if rubric is None:
            rubric = Rubric(
                name=division,
                position="Smoke Stab Position",
                division=division,
                description="",
            )
            db.add(rubric)
            db.flush()
        total_weight = sum(d.weight for d in rubric.dimensions)
        created = False
        if not (rubric.dimensions and 0.99 <= total_weight <= 1.01):
            # Existing dims are absent or invalid.
            if rubric.dimensions:
                # Can't safely fix someone else's rubric — bail out loudly.
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
                        description="Smoke stabilization dimension",
                        indicators=["smoke"],
                    )
                )
            db.commit()
            created = True
        # Capture the big_data rubric's actual dimension names so the mock
        # returns matching names (store_evaluation_results matches by name).
        if division == "big_data":
            dims = db.query(Dimension).filter(Dimension.rubric_id == rubric.id).all()
            RUBRIC_DIM_NAMES.clear()
            RUBRIC_DIM_NAMES.extend(d.name for d in dims)
        return rubric.id, created
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
                full_name=f"Smoke Stab Candidate {i + 1}",
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
                division="big_data",
                status=ApplicationStatus.VERIFIED,
            )
            db.add(app)
            db.flush()
            app_ids.append(app.id)

            cv_text = f"CV content for smoke candidate {i + 1}"
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
                full_name="Smoke Stab Recruiter",
                role=UserRole.RECRUITER,
                is_active=True,
            )
        )
        db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Test parts
# ---------------------------------------------------------------------------

def test_llm_client_config() -> int:
    """LLM clients carry explicit timeout and max_retries=0."""
    failures = 0
    saved_key = settings.deepseek_api_key
    saved_client = llm_client._client
    saved_async = llm_client._async_client
    try:
        settings.deepseek_api_key = settings.deepseek_api_key or "smoke-key"
        llm_client._client = None
        llm_client._async_client = None
        sync_client = llm_client.get_llm_client()
        async_client = llm_client.get_async_llm_client()
        failures += _assert(
            float(sync_client.timeout) == llm_client.LLM_TIMEOUT_SECONDS,
            f"sync client timeout == {llm_client.LLM_TIMEOUT_SECONDS}",
        )
        failures += _assert(
            sync_client.max_retries == 0, "sync client max_retries == 0"
        )
        failures += _assert(
            float(async_client.timeout) == llm_client.LLM_TIMEOUT_SECONDS,
            f"async client timeout == {llm_client.LLM_TIMEOUT_SECONDS}",
        )
        failures += _assert(
            async_client.max_retries == 0, "async client max_retries == 0"
        )
    finally:
        settings.deepseek_api_key = saved_key
        llm_client._client = saved_client
        llm_client._async_client = saved_async
    return failures


async def test_division_lock(client: httpx.AsyncClient, rec_auth: dict) -> int:
    """DB-level 409 on duplicate trigger; other division OK; slot freed on failure."""
    failures = 0
    original = evaluate_batch_router.run_evaluation_job
    started = asyncio.Event()
    release = asyncio.Event()

    async def _held_runner(job_id, division, application_ids, rubric_id, session_factory):
        # The job row is already queued (slot taken) before this runs; hold it
        # non-terminal so a concurrent same-division trigger hits the index.
        started.set()
        await release.wait()

    evaluate_batch_router.run_evaluation_job = _held_runner
    try:
        # Under ASGITransport, Starlette runs the BackgroundTask (here the held
        # runner) to completion before the POST response is delivered. So every
        # POST that schedules the runner must be driven as a task and only
        # awaited after release.set(); awaiting one inline would deadlock.
        first = asyncio.create_task(
            client.post(
                "/api/recruiter/evaluate/batch",
                headers=rec_auth,
                json={"division": "big_data"},
            )
        )
        await asyncio.wait_for(started.wait(), timeout=10)

        # Duplicate same-division trigger: the IntegrityError fires before the
        # runner is scheduled, so this POST returns its 409 immediately.
        r = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": "big_data"},
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

        # Different division is accepted while big_data is held. Its runner is
        # also held, so schedule it as a task and release both together.
        second = asyncio.create_task(
            client.post(
                "/api/recruiter/evaluate/batch",
                headers=rec_auth,
                json={"division": "cyber_security"},
            )
        )

        # The held runners await an asyncio.Event, not the loop, so /api/health
        # must stay responsive while both jobs are non-terminal.
        t0 = time.perf_counter()
        r = await client.get("/api/health")
        health_elapsed = time.perf_counter() - t0
        failures += _assert(
            r.status_code == 200 and health_elapsed < HEALTH_MAX_LATENCY_SECONDS,
            f"/api/health responsive while a job is held "
            f"({health_elapsed:.3f}s)",
        )

        release.set()
        ra = await first
        failures += _assert(
            ra.status_code == 202,
            f"held first request returns 202 (got {ra.status_code})",
        )
        rb = await second
        failures += _assert(
            rb.status_code == 202,
            f"different division during run -> 202 (got {rb.status_code})",
        )
    finally:
        release.set()
        evaluate_batch_router.run_evaluation_job = original
        _delete_test_jobs()

    # --- Slot release after a job failure ---
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
            json={"division": "big_data"},
        )
        failures += _assert(
            r.status_code == 202,
            f"trigger (job will fail) -> 202 (got {r.status_code})",
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
            json={"division": "big_data"},
        )
        failures += _assert(
            r.status_code == 202,
            f"slot released after failure: next trigger -> 202 (got {r.status_code})",
        )
    finally:
        evaluate_batch_router.run_evaluation_job = original
        _delete_test_jobs()
    return failures


async def test_real_pipeline_isolation(
    client: httpx.AsyncClient, rec_auth: dict, app_ids: list[int]
) -> int:
    """Real job run: failing middle candidate, isolation, health responsiveness."""
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
    batch_done = asyncio.Event()

    async def _poll_health() -> None:
        while not batch_done.is_set():
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
            json={"division": "big_data", "application_ids": app_ids},
            timeout=120,
        )
        failures += _assert(
            r.status_code == 202,
            f"real pipeline batch -> 202 (got {r.status_code})",
        )
        if r.status_code != 202:
            batch_done.set()
            await poller
            return failures + 1

        job_id = r.json()["job_id"]
        final = await _await_job_terminal(client, rec_auth, job_id, timeout=60)
        batch_done.set()
        await poller

        failures += _assert(final is not None, "job reached a terminal state")
        if final is None:
            return failures + 1

        failures += _assert(
            final["status"] == "completed",
            f"job completed (got {final['status']})",
        )
        failures += _assert(
            final["total"] == 3, f"3 applications queued (got {final['total']})"
        )
        failures += _assert(
            final["succeeded"] == 2,
            f"2 candidates succeed despite middle failure (got {final['succeeded']})",
        )
        failures += _assert(
            len(final["errors"]) == 1
            and final["errors"][0]["application_id"] == app_ids[1],
            f"exactly the middle candidate fails (errors={final['errors']})",
        )

        worst = max(health_samples) if health_samples else float("inf")
        failures += _assert(
            len(health_samples) >= 3 and worst < HEALTH_MAX_LATENCY_SECONDS,
            f"/api/health stayed responsive during real evaluation "
            f"(samples={len(health_samples)}, worst={worst:.3f}s, "
            f"sync stage sleep={ANON_SLEEP_SECONDS}s)",
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
        batch_done.set()
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
    doc_dir = tempfile.mkdtemp(prefix="smoke_stab_")
    try:
        _ensure_rubric_with_dimensions("big_data")
        _ensure_rubric_with_dimensions("cyber_security")
        _create_recruiter()
        app_ids = _create_candidates(doc_dir)

        failures += test_llm_client_config()

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

            failures += await test_division_lock(client, rec_auth)
            failures += await test_real_pipeline_isolation(client, rec_auth, app_ids)
    finally:
        _cleanup()
        shutil.rmtree(doc_dir, ignore_errors=True)

    print()
    if failures == 0:
        print("All Phase 1 stabilization smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")
    return failures


def main() -> int:
    return asyncio.run(_amain())


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
