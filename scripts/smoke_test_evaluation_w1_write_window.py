"""Smoke test for Phase 3 W1 — narrowed per-candidate write transaction.

Guards the W1 change in ``backend/services/evaluation_service.py``: the slow
per-candidate stages (KTM/KHS/NER/RAG) now run in a read/compute phase that
flushes no write, so the per-candidate session holds no write transaction
across them. Persistence is deferred to a short write block at the end. The
practical effect on the dev DB (SQLite, single writer) is that an unrelated
**write** — e.g. a recruiter verifying another candidate's document — is no
longer blocked for the batch's full duration; it commits while a candidate is
parked mid-pipeline.

How the test proves it:
  1. Start a real (mocked-LLM) single-candidate batch and park the candidate
     inside the RAG stage (``evaluate_candidate`` waits on an asyncio.Event).
     At that point the read phase is done and — under W1 — no write is held.
  2. While parked, run a document-verification write from a separate session
     in a worker thread and measure its commit latency. Under W1 it commits in
     a few ms; before W1 the per-candidate session held a write lock from the
     early ``_ensure_candidate`` flush, so this same write blocked on SQLite's
     busy timeout (~5 s) and then raised "database is locked".
  3. Release the park, let the job finish, and confirm the deferred persist
     still committed the candidate's score and flipped the app to SCREENING.

Uses httpx.ASGITransport (no live server). Starlette runs a request's
BackgroundTasks to completion before returning the response, so the batch POST
is driven as a task and only awaited after the park is released.

Run:
    python -m scripts.smoke_test_evaluation_w1_write_window
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
from backend.database import SessionLocal, engine
from backend.main import app as fastapi_app
from backend.models.application import Application, ApplicationStatus
from backend.models.candidate import Candidate, CandidateDocument, DimensionScore
from backend.models.document import Document, DocumentType, DocumentVerificationStatus
from backend.models.evaluation_job import EvaluationJob
from backend.models.rubric import Dimension, Rubric
from backend.models.user import User, UserRole
from backend.utils.security import hash_password

PASS = "[PASS]"
FAIL = "[FAIL]"

REC_EMAIL = "smoke+w1_recruiter@example.com"
CAND_EMAIL = "smoke+w1_cand@example.com"
CAND_NIM = "1039876700001"
TEST_PASSWORD = "hunter2secure"
DIVISION = "big_data"
SMOKE_DIM_NAMES = ["Smoke W1 Dim A", "Smoke W1 Dim B"]
RUBRIC_DIM_NAMES: list[str] = []

# A blocked probe (pre-W1 behaviour) waits on SQLite's busy timeout (~5 s);
# a free probe (W1) commits in single-digit ms. Park between the two.
PROBE_TIMEOUT_SECONDS = 4.0
PROBE_MAX_LATENCY_SECONDS = 2.0


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
# Pipeline stage fakes — fast, so the candidate reaches the parked RAG stage
# quickly. parse_khs/anonymize never sleep here (this test is about the write
# window, not event-loop offload, which the stabilization suite covers).
# ---------------------------------------------------------------------------

def _fake_anonymize(text: str) -> dict:
    return {"anonymized_text": text, "entities_found": []}


def _fake_parse_khs(file_path: str) -> dict:
    return {"ipk": 3.5, "total_sks": 100, "relevant_courses": []}


def _build_parked_evaluate(started: asyncio.Event, release: asyncio.Event):
    async def _parked_evaluate(*args, **kwargs) -> dict:
        # Reads are done by now and, under W1, no write is held. Park here so a
        # concurrent verification write can be timed against an in-flight job.
        started.set()
        await release.wait()
        names = RUBRIC_DIM_NAMES or SMOKE_DIM_NAMES
        weight = round(1.0 / len(names), 4) if names else 0.0
        return {
            "composite_score": 80.0,
            "profile_summary": "Smoke W1 profile.",
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

    return _parked_evaluate


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
        for email in (REC_EMAIL, CAND_EMAIL):
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
    """Ensure the division rubric has dimensions whose weights sum to 1.0."""
    db = SessionLocal()
    try:
        rubric = db.query(Rubric).filter(Rubric.division == division).first()
        if rubric is None:
            rubric = Rubric(
                name=division,
                position="Smoke W1 Position",
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
                        description="Smoke W1 dimension",
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
                full_name="Smoke W1 Recruiter",
                role=UserRole.RECRUITER,
                is_active=True,
            )
        )
        db.commit()
    finally:
        db.close()


def _create_candidate(doc_dir: str) -> tuple[int, int]:
    """Create one VERIFIED candidate app + docs. Returns (app_id, ktm_doc_id)."""
    db = SessionLocal()
    try:
        user = User(
            email=CAND_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            full_name="Smoke W1 Candidate",
            nim=CAND_NIM,
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
        app_id = app.id

        ktm_doc_id = None
        files = {
            DocumentType.CV: ("cv_w1.pdf", "CV content for smoke W1 candidate"),
            DocumentType.KTM: ("ktm_w1.pdf", f"KARTU TANDA MAHASISWA\nNIM: {CAND_NIM}\n"),
            DocumentType.KHS: ("khs_w1.pdf", f"TRANSKRIP AKADEMIK\nNIM: {CAND_NIM}\nIPK: 3.50\n"),
        }
        for doc_type, (fname, text) in files.items():
            fpath = os.path.join(doc_dir, fname)
            _minimal_pdf(fpath, text)
            doc = Document(
                application_id=app_id,
                doc_type=doc_type,
                file_path=fpath,
                file_name=fname,
                file_size=os.path.getsize(fpath),
                verification_status=DocumentVerificationStatus.PENDING.value,
            )
            db.add(doc)
            db.flush()
            if doc_type == DocumentType.KTM:
                ktm_doc_id = doc.id
        db.commit()
        return app_id, ktm_doc_id
    finally:
        db.close()


def _probe_verification_write(doc_id: int) -> dict:
    """A document-verification write from a fresh session (worker-thread safe).

    Represents a recruiter verifying a document while a batch runs. Returns the
    measured commit latency and any exception text.
    """
    t0 = time.perf_counter()
    db = SessionLocal()
    try:
        doc = db.get(Document, doc_id)
        doc.verification_status = DocumentVerificationStatus.VERIFIED.value
        db.commit()
        return {"elapsed": time.perf_counter() - t0, "error": None}
    except Exception as exc:  # noqa: BLE001 - the point is to observe blocking
        try:
            db.rollback()
        except Exception:
            pass
        return {"elapsed": time.perf_counter() - t0, "error": str(exc)}
    finally:
        db.close()


def _doc_status(doc_id: int) -> str | None:
    db = SessionLocal()
    try:
        doc = db.get(Document, doc_id)
        return doc.verification_status if doc else None
    finally:
        db.close()


async def _await_job_terminal(
    client: httpx.AsyncClient, rec_auth: dict, job_id: int, timeout: float = 30.0
) -> dict | None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        r = await client.get(
            f"/api/recruiter/evaluate/jobs/{job_id}", headers=rec_auth
        )
        if r.status_code == 200:
            data = r.json()["data"]
            if data and data["status"] in ("completed", "failed"):
                return data
        await asyncio.sleep(0.05)
    return None


# ---------------------------------------------------------------------------
# Test body
# ---------------------------------------------------------------------------

async def test_write_window(
    client: httpx.AsyncClient, rec_auth: dict, app_id: int, ktm_doc_id: int
) -> int:
    failures = 0
    started = asyncio.Event()
    release = asyncio.Event()

    saved = {
        "anonymize_text": evaluation_service.anonymize_text,
        "parse_khs": evaluation_service.parse_khs,
        "evaluate_candidate": evaluation_service.evaluate_candidate,
    }
    evaluation_service.anonymize_text = _fake_anonymize
    evaluation_service.parse_khs = _fake_parse_khs
    evaluation_service.evaluate_candidate = _build_parked_evaluate(started, release)

    try:
        # Schedule the batch; under ASGITransport the runner (a BackgroundTask)
        # runs to completion before the POST response, so drive it as a task.
        post_task = asyncio.create_task(
            client.post(
                "/api/recruiter/evaluate/batch",
                headers=rec_auth,
                json={"division": DIVISION, "application_ids": [app_id]},
            )
        )

        # Wait until the candidate is parked inside RAG (read phase complete).
        try:
            await asyncio.wait_for(started.wait(), timeout=15)
            parked = True
        except asyncio.TimeoutError:
            parked = False
        failures += _assert(parked, "candidate reached the parked RAG stage")

        # While parked, time an unrelated document-verification write.
        probe = {"elapsed": float("inf"), "error": "not run"}
        if parked:
            try:
                probe = await asyncio.wait_for(
                    asyncio.to_thread(_probe_verification_write, ktm_doc_id),
                    timeout=PROBE_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                probe = {
                    "elapsed": float("inf"),
                    "error": f"write blocked > {PROBE_TIMEOUT_SECONDS}s",
                }

        print(
            f"      probe: elapsed={probe['elapsed']:.4f}s error={probe['error']}"
        )
        failures += _assert(
            probe["error"] is None,
            "document-verification write succeeds mid-run (not blocked)",
        )
        failures += _assert(
            probe["elapsed"] < PROBE_MAX_LATENCY_SECONDS,
            f"verification write commits promptly while batch runs "
            f"({probe['elapsed']:.4f}s < {PROBE_MAX_LATENCY_SECONDS}s)",
        )

        # Release the park and let the deferred persist run to completion.
        release.set()
        rb = await post_task
        failures += _assert(
            rb.status_code == 202, f"batch -> 202 (got {rb.status_code})"
        )
        job_id = rb.json().get("job_id") if rb.status_code == 202 else None

        final = None
        if job_id is not None:
            final = await _await_job_terminal(client, rec_auth, job_id, timeout=30)
        failures += _assert(
            final is not None and final["status"] == "completed",
            "job completed after release",
        )
        failures += _assert(
            final is not None and final["succeeded"] == 1,
            "the candidate was scored (deferred persist committed)",
        )
    finally:
        release.set()
        for name, fn in saved.items():
            setattr(evaluation_service, name, fn)

    # --- DB state: probe write durable; deferred persist landed ---
    failures += _assert(
        _doc_status(ktm_doc_id) == DocumentVerificationStatus.VERIFIED.value,
        "probe verification write is durable",
    )
    db = SessionLocal()
    try:
        app = db.get(Application, app_id)
        failures += _assert(
            app.status == ApplicationStatus.SCREENING,
            f"evaluated app flipped to SCREENING (got {app.status})",
        )
        cand = (
            db.query(Candidate).filter(Candidate.user_id == app.user_id).first()
        )
        failures += _assert(
            cand is not None and cand.composite_score is not None,
            "candidate has a committed composite_score",
        )
    finally:
        db.close()
    return failures


async def _amain() -> int:
    if engine.dialect.name != "sqlite":
        print(
            f"[SKIP] write-window test targets the SQLite dev DB "
            f"(current dialect: {engine.dialect.name})"
        )
        return 0

    failures = 0
    _cleanup()
    doc_dir = tempfile.mkdtemp(prefix="smoke_w1_")
    try:
        _ensure_rubric_with_dimensions(DIVISION)
        _create_recruiter()
        app_id, ktm_doc_id = _create_candidate(doc_dir)

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

            failures += await test_write_window(client, rec_auth, app_id, ktm_doc_id)
    finally:
        _cleanup()
        shutil.rmtree(doc_dir, ignore_errors=True)

    print()
    if failures == 0:
        print("W1 write-window smoke checks passed.")
    else:
        print(f"{failures} check(s) failed.")
    return failures


def main() -> int:
    return asyncio.run(_amain())


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
