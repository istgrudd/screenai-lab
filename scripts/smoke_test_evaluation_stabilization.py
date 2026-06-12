"""Smoke test for Phase 1 evaluation stabilization.

Covers the Phase 1 fixes from docs/reports/EVALUATION_FREEZE_AUDIT_REPORT.md:
  1. LLM clients constructed with explicit timeout and max_retries=0.
  2. Per-division running lock: a concurrent evaluate for the same division
     returns 409; a different division is accepted while the first runs.
  3. The lock is released after a pipeline failure (next trigger is not 409).
  4. Per-candidate transaction isolation: one failing candidate does not
     prevent the others from committing, and leaves no partial rows behind.
  5. /api/health stays responsive while an evaluation with slow sync stages
     is running (event loop not blocked thanks to asyncio.to_thread).

Uses httpx.ASGITransport so no live server is needed.

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
from backend.models.application import Application, ApplicationStatus
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType
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
    return {
        "composite_score": 82.0,
        "profile_summary": "Smoke stabilization profile summary.",
        "dimension_scores": [
            {
                "dimension": SMOKE_DIM_NAMES[0],
                "score": 84,
                "weight": 0.5,
                "weighted_score": 42.0,
                "justification": "Strong evidence.",
                "evidence": ["CV project"],
            },
            {
                "dimension": SMOKE_DIM_NAMES[1],
                "score": 80,
                "weight": 0.5,
                "weighted_score": 40.0,
                "justification": "Clear motivation.",
                "evidence": ["Motivation letter"],
            },
        ],
    }


# ---------------------------------------------------------------------------
# Setup / cleanup
# ---------------------------------------------------------------------------

def _cleanup() -> None:
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


def _ensure_rubric_with_dimensions() -> tuple[int, bool]:
    """Return (rubric_id, created_dims) for big_data with valid weights."""
    db = SessionLocal()
    try:
        rubric = db.query(Rubric).filter(Rubric.division == "big_data").first()
        if rubric is None:
            rubric = Rubric(
                name="Big Data",
                position="Smoke Stab Position",
                division="big_data",
                description="",
            )
            db.add(rubric)
            db.flush()
        total_weight = sum(d.weight for d in rubric.dimensions)
        if rubric.dimensions and 0.99 <= total_weight <= 1.01:
            return rubric.id, False
        # Existing dims are absent or invalid — add this script's own pair.
        # (Existing invalid dims are left untouched; weights are re-checked
        # against the new total below only if none existed.)
        if rubric.dimensions:
            # Can't safely fix someone else's rubric — bail out loudly.
            raise RuntimeError(
                "big_data rubric has dimensions with invalid weight sum "
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
        return rubric.id, True
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
    """409 on duplicate trigger; other division OK; release on failure."""
    failures = 0
    original = evaluate_batch_router.run_evaluation_pipeline
    hold = asyncio.Event()
    release = asyncio.Event()

    async def _held_pipeline(*, division, application_ids, db, force=False):
        if division == "big_data":
            hold.set()
            await release.wait()
        return {"queued": 0, "results": [], "errors": []}

    evaluate_batch_router.run_evaluation_pipeline = _held_pipeline
    try:
        first = asyncio.create_task(
            client.post(
                "/api/recruiter/evaluate/batch",
                headers=rec_auth,
                json={"division": "big_data"},
            )
        )
        await asyncio.wait_for(hold.wait(), timeout=10)

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

        r = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": "cyber_security"},
        )
        failures += _assert(
            r.status_code == 200,
            f"different division during run -> 200 (got {r.status_code})",
        )

        t0 = time.perf_counter()
        r = await client.get("/api/health")
        health_elapsed = time.perf_counter() - t0
        failures += _assert(
            r.status_code == 200 and health_elapsed < HEALTH_MAX_LATENCY_SECONDS,
            f"/api/health responsive while evaluation held "
            f"({health_elapsed:.3f}s)",
        )

        release.set()
        r = await first
        failures += _assert(
            r.status_code == 200,
            f"held first request completes -> 200 (got {r.status_code})",
        )
    finally:
        release.set()
        evaluate_batch_router.run_evaluation_pipeline = original

    # --- Lock release after failure ---
    async def _raising_pipeline(**kwargs):
        raise RuntimeError("smoke: pipeline crash")

    evaluate_batch_router.run_evaluation_pipeline = _raising_pipeline
    try:
        r = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": "big_data"},
        )
        failures += _assert(
            r.status_code == 500,
            f"pipeline crash -> sanitized 500 (got {r.status_code})",
        )

        async def _quick_pipeline(**kwargs):
            return {"queued": 0, "results": [], "errors": []}

        evaluate_batch_router.run_evaluation_pipeline = _quick_pipeline
        r = await client.post(
            "/api/recruiter/evaluate/batch",
            headers=rec_auth,
            json={"division": "big_data"},
        )
        failures += _assert(
            r.status_code == 200,
            f"lock released after failure: next trigger -> 200 (got {r.status_code})",
        )
    finally:
        evaluate_batch_router.run_evaluation_pipeline = original
    return failures


async def test_real_pipeline_isolation(
    client: httpx.AsyncClient, rec_auth: dict, app_ids: list[int]
) -> int:
    """Real pipeline run: failing middle candidate, health responsiveness."""
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
        batch_done.set()
        await poller

        failures += _assert(
            r.status_code == 200,
            f"real pipeline batch -> 200 (got {r.status_code})",
        )
        if r.status_code != 200:
            return failures + 1

        data = r.json()["data"]
        failures += _assert(
            data["queued"] == 3, f"3 applications queued (got {data['queued']})"
        )
        failures += _assert(
            len(data["results"]) == 2,
            f"2 candidates succeed despite middle failure (got {len(data['results'])})",
        )
        failures += _assert(
            len(data["errors"]) == 1
            and data["errors"][0]["application_id"] == app_ids[1],
            f"exactly the middle candidate fails (errors={data['errors']})",
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
    return failures


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def _amain() -> int:
    failures = 0
    _cleanup()
    doc_dir = tempfile.mkdtemp(prefix="smoke_stab_")
    created_dims = False
    try:
        _, created_dims = _ensure_rubric_with_dimensions()
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
        if not created_dims:
            # _cleanup also removes SMOKE_DIM_NAMES; nothing extra to undo.
            pass
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
