"""Full evaluation pipeline service — Task 8.1.

Orchestrates per-candidate evaluation:
    KTM validate → KHS parse → NER anonymize →
    RAG retrieve (using division rubric) → LLM infer → store results

Bridges the Phase-1 Portal models (Application / Document) with the
Capstone pipeline models (Candidate / CandidateDocument).
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker

from backend.database import SessionLocal, engine
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.candidate import Candidate, CandidateDocument
from backend.models.document import Document, DocumentType
from backend.models.evaluation_job import (
    EvaluationJob,
    EvaluationJobStatus,
    NON_TERMINAL_JOB_STATUSES,
)
from backend.models.rubric import Rubric
from backend.models.user import User
from backend.services.extractor import extract_text_from_pdf
from backend.services.khs_parser import (
    KhsResult,
    build_khs_cache_payload,
    format_khs_summary,
    khs_parse_error,
    khs_processing_status,
    parse_khs,
    parsed_khs_from_cache,
)
from backend.services.ktm_validator import validate_ktm
from backend.services.normalizer import normalize_and_segment
from backend.services.anonymizer import anonymize_text
from backend.services.rag_pipeline import evaluate_candidate
from backend.services.scoring import store_evaluation_results, validate_rubric_weights

logger = logging.getLogger(__name__)

# Bound the number of in-flight DeepSeek calls inside a single batch. The LLM
# path is awaitable (AsyncOpenAI), so these round-trips can overlap. The sync
# SQLAlchemy work still runs in the non-await sections of each coroutine.
# Keep this small enough to stay under DeepSeek rate limits but large enough
# that batch wall-clock scales sub-linearly with N.
_LLM_CONCURRENCY = 5


def _effective_concurrency() -> int:
    """Per-batch candidate concurrency, adjusted for the DB backend.

    Each candidate evaluation holds its own write transaction for the whole
    candidate duration (per-candidate sessions). SQLite allows a single
    writer, so concurrent candidates would spin in sqlite3's busy-wait —
    on the event loop — until "database is locked". Serialize on SQLite
    (dev); Postgres (production) keeps the concurrent LLM overlap.
    """
    if engine.dialect.name == "sqlite":
        return 1
    return _LLM_CONCURRENCY

_ACADEMIC_EVIDENCE_KEYWORDS = (
    "ipk",
    "ips",
    "gpa",
    "cgpa",
    "academic",
    "akademik",
    "mata kuliah",
    "coursework",
    "course",
    "kuliah",
    "nilai",
    "transkrip",
    "khs",
    "sks",
    "academic readiness",
    "konsistensi ipk",
    "relevant course",
    "mata kuliah relevan",
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _generate_anon_id() -> str:
    return f"CAND-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def select_evaluation_targets(
    division: str,
    application_ids: list[int] | None,
    db: Session,
    force: bool = False,
) -> dict:
    """Resolve the eligible application set for a division (DB-only, no LLM).

    Phase 2: this is the synchronous selection/validation step run inside the
    POST request. It performs exactly the selection logic the inline pipeline
    used to do up front — rubric lookup/validation, eligible-status filter,
    already-scored skip — and returns the IDs to evaluate plus skip counters.
    The actual per-candidate pipeline runs later in the background job
    (``run_evaluation_job``); only plain IDs cross into it.

    Args:
        division: Division value string (e.g. "big_data").
        application_ids: Specific application IDs to evaluate, or None for all
            eligible applications in the division.
        db: Database session (request-scoped — used for selection only).
        force: When True, re-evaluate eligible already-scored candidates in
            VERIFIED or SCREENING status. Final, draft, document-review, and
            correction statuses are always skipped.

    Returns:
        {
            rubric_id: int,
            application_ids: [int],   # eligible IDs to evaluate
            total: int,               # len(application_ids)
            skipped: int,
            skipped_already_scored_count: int,
            skipped_unverified_count: int,
            skipped_correction_count: int,
        }

    Raises:
        ValueError: no rubric for the division, rubric has no dimensions, or
            rubric weights do not sum to 1.0 (mapped to 4xx by the router).
    """
    # --- 1. Find the rubric for the division ---
    rubric = (
        db.query(Rubric)
        .filter(Rubric.division == division)
        .first()
    )
    if not rubric:
        raise ValueError(f"No rubric found for division '{division}'")

    # --- 1b. Flag 4 guard: empty-dimension rubric ---
    if not rubric.dimensions:
        raise ValueError(
            f"Rubric for {division} has no dimensions configured. "
            f"Please set up the rubric first."
        )

    # --- 1c. Composite-score sanity: weights must sum to 1.0 ---
    validate_rubric_weights(rubric)

    # --- 2. Find target applications ---
    # Application.division is stored as the enum name ("BIG_DATA") via
    # SQLAlchemy's Enum(..., native_enum=False); rubric.division uses the
    # enum value ("big_data"). Coerce the incoming value-string to the
    # Division enum so the WHERE clause emits the stored name correctly.
    try:
        division_enum = Division(division)
    except ValueError:
        raise ValueError(f"Invalid division '{division}'")

    # Phase 7.5 status filter: VERIFIED normally, VERIFIED + SCREENING with force.
    # applications outside the eligible set are never evaluated.
    eligible_statuses = [ApplicationStatus.VERIFIED]
    if force:
        eligible_statuses.append(ApplicationStatus.SCREENING)

    q = db.query(Application).filter(Application.division == division_enum)
    if application_ids:
        q = q.filter(Application.id.in_(application_ids))

    scoped_apps = q.all()
    candidate_apps = [
        app for app in scoped_apps if app.status in eligible_statuses
    ]

    # Task 13.5.1 — when force=False, skip applications whose Candidate row
    # already has a stored composite_score. user_id links Application →
    # Candidate (one Candidate per user, see _ensure_candidate).
    user_ids_in_scope = [app.user_id for app in scoped_apps]
    scored_user_ids = set()
    if user_ids_in_scope:
        scored_user_ids = {
            uid
            for (uid,) in db.query(Candidate.user_id)
            .filter(
                Candidate.user_id.in_(user_ids_in_scope),
                Candidate.composite_score.isnot(None),
            )
            .all()
        }

    skipped_correction_count = sum(
        1 for app in scoped_apps if app.status == ApplicationStatus.CORRECTION_REQUESTED
    )
    skipped_unverified_count = sum(
        1
        for app in scoped_apps
        if app.status
        in {
            ApplicationStatus.DRAFT,
            ApplicationStatus.SUBMITTED,
            ApplicationStatus.DOCUMENT_REVIEW,
            ApplicationStatus.CANCELLED,
        }
    )
    skipped_already_scored_count = 0
    if not force:
        skipped_already_scored_count = sum(
            1
            for app in scoped_apps
            if app.user_id in scored_user_ids
            and app.status in {ApplicationStatus.VERIFIED, ApplicationStatus.SCREENING}
        )

    applications: list[Application] = []
    skipped = skipped_already_scored_count
    if force:
        applications = candidate_apps
    else:
        applications = [
            app for app in candidate_apps if app.user_id not in scored_user_ids
        ]

    counters = {
        "skipped": skipped,
        "skipped_already_scored_count": skipped_already_scored_count,
        "skipped_unverified_count": skipped_unverified_count,
        "skipped_correction_count": skipped_correction_count,
    }

    if not applications:
        logger.info(
            "Evaluation selection: division=%s force=%s — no eligible "
            "applications (skipped_already_scored=%d, skipped_unverified=%d, "
            "skipped_correction=%d)",
            division,
            force,
            skipped_already_scored_count,
            skipped_unverified_count,
            skipped_correction_count,
        )

    return {
        "rubric_id": rubric.id,
        "application_ids": [app.id for app in applications],
        "total": len(applications),
        **counters,
    }


# ---------------------------------------------------------------------------
# Background job runner (Phase 2)
#
# The POST handler resolves the targets above, inserts an ``evaluation_jobs``
# row, and schedules ``run_evaluation_job`` as a FastAPI BackgroundTask
# (mirroring ``run_submit_anonymization``'s session-factory pattern). The
# runner owns its whole lifecycle, reuses the Phase 1 per-candidate session
# model unchanged, and always drives the job to a terminal state — which also
# frees the division's slot in the partial unique index.
# ---------------------------------------------------------------------------


def _mark_job_running(session_factory: sessionmaker, job_id: int) -> str | None:
    """Flip the job to ``running`` and stamp ``started_at``.

    Returns the division value (for logging) or ``None`` if the job vanished.
    """
    session = session_factory()
    try:
        job = session.get(EvaluationJob, job_id)
        if job is None:
            return None
        job.status = EvaluationJobStatus.RUNNING
        job.started_at = _utcnow()
        division = (
            job.division.value if hasattr(job.division, "value") else str(job.division)
        )
        session.commit()
        return division
    finally:
        session.close()


def _increment_job_counter(
    session_factory: sessionmaker, job_id: int, *, succeeded: bool
) -> None:
    """Atomically bump the job's progress counters in its own tiny session.

    ``UPDATE evaluation_jobs SET processed = processed + 1, (succeeded|failed)
    = +1 WHERE id = :job_id``. Atomic SQL increments are commutative, so the
    concurrent candidate coroutines need no ``SELECT ... FOR UPDATE`` and
    cannot lose updates.
    """
    session = session_factory()
    try:
        values: dict = {"processed": EvaluationJob.processed + 1}
        if succeeded:
            values["succeeded"] = EvaluationJob.succeeded + 1
        else:
            values["failed"] = EvaluationJob.failed + 1
        session.execute(
            update(EvaluationJob).where(EvaluationJob.id == job_id).values(**values)
        )
        session.commit()
    except Exception:
        logger.exception(
            "Failed to increment progress counter for evaluation job %d", job_id
        )
        try:
            session.rollback()
        except Exception:
            pass
    finally:
        session.close()


def _is_cancel_requested(session_factory: sessionmaker, job_id: int) -> bool:
    """Fresh short read of the job's ``cancel_requested`` flag (W2).

    The runner polls this between candidates. A separate tiny session keeps the
    read off any per-candidate write transaction and always sees the latest
    committed value written by the cancel endpoint.
    """
    session = session_factory()
    try:
        job = session.get(EvaluationJob, job_id)
        return bool(job is not None and job.cancel_requested)
    finally:
        session.close()


def _finalize_job(
    session_factory: sessionmaker,
    job_id: int,
    *,
    status: EvaluationJobStatus,
    errors: list[dict] | None = None,
    succeeded: int | None = None,
    failed: int | None = None,
    note: str | None = None,
) -> None:
    """Drive the job to a terminal state and write the final error list once."""
    session = session_factory()
    try:
        job = session.get(EvaluationJob, job_id)
        if job is None:
            logger.error("Evaluation job %d vanished before finalize", job_id)
            return
        job.status = status
        job.finished_at = _utcnow()
        if errors is not None:
            job.errors = errors
        if succeeded is not None:
            job.succeeded = succeeded
        if failed is not None:
            job.failed = failed
        # Reconcile the running counter against the authoritative totals so a
        # missed live increment cannot leave processed out of step.
        if succeeded is not None and failed is not None:
            job.processed = succeeded + failed
        if note is not None:
            job.note = note
        session.commit()
    except Exception:
        logger.exception("Failed to finalize evaluation job %d", job_id)
        try:
            session.rollback()
        except Exception:
            pass
    finally:
        session.close()


async def _evaluate_candidate_in_session(
    app_id: int,
    rubric_id: int,
    division: str,
    session_factory: sessionmaker,
) -> tuple[str, dict]:
    """Evaluate one candidate in its own session (Phase 1 transaction model).

    Commits on success (after the SCREENING flip), rolls back on failure, and
    closes the session in ``finally``. Only plain IDs cross the boundary, so a
    failed candidate can never poison another's transaction and leaves no
    partial rows.
    """
    started = time.monotonic()
    logger.info("Evaluating application %d (division=%s)", app_id, division)
    session = session_factory()
    try:
        app = session.get(Application, app_id)
        if app is None:
            raise ValueError(f"Application {app_id} not found")
        rubric_row = session.get(Rubric, rubric_id)
        if rubric_row is None:
            raise ValueError(f"Rubric {rubric_id} not found")
        result = await _evaluate_one(app, rubric_row, session)
        app.status = ApplicationStatus.SCREENING
        session.commit()
        logger.info(
            "Application %d evaluated successfully in %.1fs",
            app_id,
            time.monotonic() - started,
        )
        return ("ok", result)
    except Exception as exc:
        try:
            session.rollback()
        except Exception:
            logger.exception("Rollback failed for application %d", app_id)
        logger.exception(
            "Evaluation failed for application %d after %.1fs",
            app_id,
            time.monotonic() - started,
        )
        return ("err", {"application_id": app_id, "error": str(exc)})
    finally:
        session.close()


async def _run_job_candidates(
    job_id: int,
    division: str,
    application_ids: list[int],
    rubric_id: int,
    session_factory: sessionmaker,
) -> tuple[list[dict], list[dict]]:
    """Run the bounded-concurrency candidate pipeline, bumping job counters.

    Identical concurrency/session model to Phase 1: an ``asyncio.Semaphore``
    of ``_effective_concurrency()`` over per-candidate sessions, sync heavy
    stages offloaded via ``asyncio.to_thread`` inside ``_evaluate_one``. After
    each candidate settles, its outcome advances the job's counters with an
    atomic increment. The detailed per-candidate error list is collected here
    and written once by the caller at completion (never appended
    concurrently).
    """
    if not application_ids:
        return [], []

    semaphore = asyncio.Semaphore(_effective_concurrency())

    async def _bounded(app_id: int) -> tuple[str, dict]:
        async with semaphore:
            # W2 cooperative cancel: check just before starting each candidate.
            # Candidates already past this point (in-flight) finish normally;
            # not-yet-started ones are skipped, so no new work is scheduled and
            # nothing is hard-killed mid-candidate.
            if _is_cancel_requested(session_factory, job_id):
                logger.info(
                    "Evaluation job %d cancel requested — skipping application %d",
                    job_id,
                    app_id,
                )
                return ("cancelled", {"application_id": app_id})
            outcome = await _evaluate_candidate_in_session(
                app_id, rubric_id, division, session_factory
            )
            _increment_job_counter(
                session_factory, job_id, succeeded=(outcome[0] == "ok")
            )
            return outcome

    outcomes = await asyncio.gather(*[_bounded(app_id) for app_id in application_ids])

    results: list[dict] = []
    errors: list[dict] = []
    for tag, item in outcomes:
        if tag == "ok":
            results.append(item)
        elif tag == "err":
            errors.append(item)
        # "cancelled" outcomes are skipped candidates — neither a success nor a
        # failure, and never counted in the progress totals.
    return results, errors


async def run_evaluation_job(
    job_id: int,
    division: str,
    application_ids: list[int],
    rubric_id: int,
    session_factory: sessionmaker,
) -> None:
    """Background runner for one evaluation job — owns its full lifecycle.

    Flips the job to ``running``, evaluates each candidate (Phase 1 model)
    while atomically advancing the progress counters, writes the complete
    ``errors`` list once at completion, and always reaches a terminal state.
    Never raises: it is a FastAPI BackgroundTask, and an unexpected failure
    must still free the division's partial-unique slot by marking the job
    ``failed``.
    """
    started = _mark_job_running(session_factory, job_id)
    if started is None:
        logger.error(
            "Evaluation job %d not found when starting runner; aborting", job_id
        )
        return

    batch_started = time.monotonic()
    logger.info(
        "Evaluation job %d started: division=%s candidates=%d",
        job_id,
        division,
        len(application_ids),
    )
    try:
        results, errors = await _run_job_candidates(
            job_id, division, application_ids, rubric_id, session_factory
        )
    except Exception:
        # _evaluate_candidate_in_session swallows per-candidate failures, so
        # reaching here means the orchestration itself failed.
        logger.exception(
            "Evaluation job %d crashed during candidate processing", job_id
        )
        _finalize_job(
            session_factory,
            job_id,
            status=EvaluationJobStatus.FAILED,
            note="run crashed",
        )
        return

    # W2: a cancel requested while running drives the job to the terminal
    # ``cancelled`` state instead of ``completed``. Already-committed candidates
    # remain (durable partial progress); the skipped ones are simply not counted
    # (processed < total), and the division slot frees on this finalize.
    if _is_cancel_requested(session_factory, job_id):
        skipped = len(application_ids) - len(results) - len(errors)
        _finalize_job(
            session_factory,
            job_id,
            status=EvaluationJobStatus.CANCELLED,
            errors=errors,
            succeeded=len(results),
            failed=len(errors),
            note="cancelled by recruiter",
        )
        logger.info(
            "Evaluation job %d cancelled: ok=%d failed=%d skipped=%d duration=%.1fs",
            job_id,
            len(results),
            len(errors),
            skipped,
            time.monotonic() - batch_started,
        )
        return

    _finalize_job(
        session_factory,
        job_id,
        status=EvaluationJobStatus.COMPLETED,
        errors=errors,
        succeeded=len(results),
        failed=len(errors),
    )
    logger.info(
        "Evaluation job %d finished: ok=%d failed=%d duration=%.1fs",
        job_id,
        len(results),
        len(errors),
        time.monotonic() - batch_started,
    )


def recover_interrupted_jobs(session_factory: sessionmaker) -> int:
    """Mark any non-terminal job left by a restart as ``failed``.

    Called from the FastAPI lifespan on startup. A ``queued``/``running`` job
    in the table after a boot means the worker died mid-run (crash/deploy), so
    it can never make progress and is holding the division's slot. Flip it to
    ``failed`` with ``note="interrupted by restart"`` and stamp
    ``finished_at``. Returns the number of jobs recovered.
    """
    session = session_factory()
    try:
        jobs = (
            session.query(EvaluationJob)
            .filter(EvaluationJob.status.in_(list(NON_TERMINAL_JOB_STATUSES)))
            .all()
        )
        if not jobs:
            return 0
        now = _utcnow()
        for job in jobs:
            job.status = EvaluationJobStatus.FAILED
            job.note = "interrupted by restart"
            job.finished_at = now
        session.commit()
        return len(jobs)
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Per-candidate pipeline
# ---------------------------------------------------------------------------

async def _evaluate_one(
    app: Application,
    rubric: Rubric,
    db: Session,
) -> dict:
    """Run the full pipeline for one application.

    W1 (Phase 3) — narrowed write window. The function is split into a
    read/compute phase (KTM, KHS, NER, RAG — reads + slow async work only, no
    flushed write) and a persist phase (Candidate, CandidateDocument caches,
    DimensionScore, AI-validation reset) that runs with no awaits. The caller
    flips the Application to SCREENING and commits right after, so the
    per-candidate write transaction is held only for that short persist window
    instead of across the whole LLM/NER/KHS round-trip.
    """
    if app.status not in {ApplicationStatus.VERIFIED, ApplicationStatus.SCREENING}:
        app_status = app.status.value if hasattr(app.status, "value") else str(app.status)
        raise ValueError(
            f"Application {app.id} is not eligible for evaluation while status is '{app_status}'"
        )

    result: dict = {
        "application_id": app.id,
        "division": app.division.value if hasattr(app.division, "value") else str(app.division),
    }

    # ===================== read / compute phase =====================
    # The slow stages (KTM/KHS/NER/RAG) below run on reads only — no write is
    # flushed here, so the per-candidate session holds no write transaction
    # across them (under pysqlite a BEGIN is only emitted on the first DML, so
    # a read-only session takes no lock and concurrent verification writes are
    # not blocked). Every persist is deferred to the short write block at the
    # bottom of this function.
    user = db.query(User).filter(User.id == app.user_id).first()

    # Read-only Candidate lookup. A Candidate usually already exists from
    # post-verification NER; on a first-ever evaluation it is None (no caches
    # to hit) and is created in the persist phase below.
    existing_candidate = _find_candidate(app, db)

    # --- KTM validation ---
    ktm_result = await _run_ktm(app, user, db)
    result["ktm_valid"] = ktm_result.get("valid", False)
    result["ktm_warning"] = ktm_result.get("warning") or ktm_result.get("error")

    # --- KHS parsing/cache resolution (cache write deferred to persist phase) ---
    khs_doc = _get_doc(app.id, DocumentType.KHS, db)
    khs_context = await _resolve_khs_context(app, existing_candidate, rubric, khs_doc, db)
    result["khs_summary"] = khs_context["khs_summary"]
    result["khs_warning"] = khs_context["khs_warning"]
    result["khs_used_in_ai_scoring"] = khs_context["khs_used_in_ai_scoring"]
    result["khs_source"] = khs_context["khs_source"]
    khs_result = khs_context["parsed_khs"]

    cv_doc = _get_doc(app.id, DocumentType.CV, db)
    if not cv_doc:
        raise ValueError(f"No CV document found for application {app.id}")
    ml_doc = _get_doc(app.id, DocumentType.MOTIVATION_LETTER, db)
    ml_fallback_attempted = False
    # Deferred motivation-letter cache write (a 5-tuple set when ML is rebuilt
    # inline below; persisted in the write phase).
    ml_cache_write: tuple | None = None

    # --- Task 10.3: Check NER cache from post-verification anonymization ---
    # Cache lookups require an existing Candidate; without one there is nothing
    # cached yet, so we fall straight through to the inline-NER branch.
    cached_cv = None
    if existing_candidate is not None:
        cached_cv = (
            db.query(CandidateDocument)
            .filter(
                CandidateDocument.candidate_id == existing_candidate.id,
                CandidateDocument.document_type == "cv",
                CandidateDocument.anonymized_text != None,  # noqa: E711
            )
            .order_by(CandidateDocument.created_at.desc())
            .first()
        )
        if cached_cv and not _cache_matches_document(cached_cv, cv_doc):
            logger.info("Ignoring stale CV NER cache for application %d", app.id)
            cached_cv = None

    if cached_cv and cached_cv.anonymized_text:
        # Cache hit — use pre-computed anonymized text
        logger.info(
            "NER cache hit for application %d, skipping anonymization", app.id
        )
        full_text = cached_cv.anonymized_text

        # Also check for cached motivation letter
        cached_ml = None
        if existing_candidate is not None and ml_doc:
            cached_ml = (
                db.query(CandidateDocument)
                .filter(
                    CandidateDocument.candidate_id == existing_candidate.id,
                    CandidateDocument.document_type == "motivation_letter",
                    CandidateDocument.anonymized_text != None,  # noqa: E711
                )
                .order_by(CandidateDocument.created_at.desc())
                .first()
            )
            if cached_ml and not _cache_matches_document(cached_ml, ml_doc):
                logger.info(
                    "Ignoring stale motivation letter NER cache for application %d",
                    app.id,
                )
                cached_ml = None
        ml_anon_text = cached_ml.anonymized_text if cached_ml else ""

        # We still need raw_text for the deferred CandidateDocument refresh.
        raw_text = cached_cv.raw_text or ""
        normalised = {
            "normalized_text": cached_cv.normalized_text or "",
            "sections": cached_cv.sections_json,
        }
        anonymised = {
            "anonymized_text": cached_cv.anonymized_text,
            "entities_found": cached_cv.entities_json or [],
        }
        cv_metadata = {
            "page_count": cached_cv.page_count,
            "file_size_kb": cached_cv.file_size_kb,
        }
    else:
        # Cache miss — run inline NER as fallback
        logger.info(
            "NER cache miss for application %d, running inline anonymization",
            app.id,
        )

        # Heavy sync stages (PyMuPDF extraction, IndoBERT NER inference) run
        # in worker threads so they never block the event loop.
        extraction = await asyncio.to_thread(extract_text_from_pdf, cv_doc.file_path)
        cv_metadata = extraction.get("metadata") or {}
        raw_text = extraction.get("raw_text", "")
        normalised = await asyncio.to_thread(normalize_and_segment, raw_text)
        anonymised = await asyncio.to_thread(
            anonymize_text, normalised["normalized_text"]
        )
        full_text = anonymised.get("anonymized_text", "")

        # Also anonymize motivation letter if present
        ml_anon_text = ""
        cached_ml = (
            _get_ready_candidate_document(
                existing_candidate,
                "motivation_letter",
                ml_doc,
                db,
            )
            if (existing_candidate is not None and ml_doc)
            else None
        )
        if cached_ml:
            ml_anon_text = cached_ml.anonymized_text or ""
        elif ml_doc and os.path.exists(ml_doc.file_path):
            ml_fallback_attempted = True
            try:
                ml_extraction = await asyncio.to_thread(
                    extract_text_from_pdf, ml_doc.file_path
                )
                ml_metadata = ml_extraction.get("metadata") or {}
                ml_norm = await asyncio.to_thread(
                    normalize_and_segment, ml_extraction.get("raw_text", "")
                )
                ml_anonymised = await asyncio.to_thread(
                    anonymize_text, ml_norm["normalized_text"]
                )
                ml_anon_text = ml_anonymised.get("anonymized_text", "")
                ml_cache_write = (
                    ml_doc,
                    ml_extraction.get("raw_text", ""),
                    ml_norm,
                    ml_anonymised,
                    ml_metadata,
                )
            except Exception:
                pass  # graceful fallback — ML is bonus context

    if (
        not ml_anon_text
        and not ml_fallback_attempted
        and ml_doc
        and os.path.exists(ml_doc.file_path)
    ):
        try:
            ml_extraction = await asyncio.to_thread(
                extract_text_from_pdf, ml_doc.file_path
            )
            ml_metadata = ml_extraction.get("metadata") or {}
            ml_norm = await asyncio.to_thread(
                normalize_and_segment, ml_extraction.get("raw_text", "")
            )
            ml_anonymised = await asyncio.to_thread(
                anonymize_text, ml_norm["normalized_text"]
            )
            ml_anon_text = ml_anonymised.get("anonymized_text", "")
            ml_cache_write = (
                ml_doc,
                ml_extraction.get("raw_text", ""),
                ml_norm,
                ml_anonymised,
                ml_metadata,
            )
        except Exception:
            pass  # graceful fallback — ML is bonus context

    # --- Build full anonymized text with ML + KHS blocks ---
    if ml_anon_text:
        full_text += (
            "\n\n=== SURAT MOTIVASI ===\n"
            f"{ml_anon_text}\n"
            "=====================\n"
        )

    # KHS is sent to the LLM only when the rubric asks for academic evidence.
    if result["khs_used_in_ai_scoring"] and khs_result is not None:
        khs_block = format_khs_summary(khs_result)
        full_text = (
            "=== DATA AKADEMIK TERSTRUKTUR ===\n"
            f"{khs_block}\n"
            "Gunakan data akademik hanya untuk dimensi rubrik yang relevan. "
            "Jangan menghitung mata kuliah ongoing atau nilai kosong sebagai "
            "bukti performa akademik.\n"
            "=====================\n\n"
            + full_text
        )

    # --- RAG evaluation (reads the rubric + LLM round-trip; no write) ---
    evaluation = await evaluate_candidate(
        anonymized_cv={"anonymized_text": full_text},
        rubric_id=rubric.id,
        db=db,
        certificate_data=None,
    )

    # --- SWOT text extraction (highlight only, not scored) ---
    swot_text = await _extract_swot(app, db)
    result["swot_text"] = swot_text

    # ===================== persist phase (short write tx) =====================
    # Everything below mutates the DB and runs straight through with no awaits.
    # The caller flips status to SCREENING and commits immediately after, so
    # the write lock is held only for this brief window — never across the
    # LLM/NER/KHS work above.
    candidate = _ensure_candidate(app, rubric, user, db)

    # KHS cache row + scoring metadata, deferred from the read phase.
    _apply_khs_persist(candidate, khs_doc, khs_context["_persist"], db)

    # Motivation-letter cache, if it was rebuilt inline above.
    if ml_cache_write is not None:
        ml_portal_doc, ml_raw_text, ml_norm, ml_anon, ml_meta = ml_cache_write
        _ensure_candidate_document(
            candidate,
            ml_portal_doc,
            ml_raw_text,
            ml_norm,
            ml_anon,
            db,
            document_type="motivation_letter",
            metadata=ml_meta,
        )

    # --- Bridge: refresh the CV CandidateDocument (cache hit or fresh NER) ---
    _ensure_candidate_document(
        candidate,
        cv_doc,
        raw_text,
        normalised,
        anonymised,
        db,
        metadata=cv_metadata,
    )

    # --- Store results ---
    store_evaluation_results(
        candidate_id=candidate.id,
        rubric_id=rubric.id,
        evaluation=evaluation,
        db=db,
    )

    # A fresh AI result was just stored (initial or force re-evaluation), so
    # any prior recruiter validation no longer applies to the new score —
    # reset the marker to pending. This only runs when results are persisted,
    # never when an evaluation is skipped.
    candidate.ai_validation_status = "pending"
    candidate.ai_validated_by_id = None
    candidate.ai_validated_at = None
    candidate.ai_validation_note = None
    db.flush()

    # --- Populate result ---
    result["candidate_id"] = candidate.id
    result["anonymous_id"] = candidate.anonymous_id
    result["composite_score"] = candidate.composite_score
    result["profile_summary"] = evaluation.get("profile_summary", "")
    result["dimension_scores"] = [
        {
            "dimension": ds["dimension"],
            "score": ds["score"],
            "weight": ds["weight"],
            "weighted_score": ds["weighted_score"],
            "justification": ds.get("justification", ""),
        }
        for ds in evaluation.get("dimension_scores", [])
    ]

    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_doc(application_id: int, doc_type: DocumentType, db: Session) -> Document | None:
    return (
        db.query(Document)
        .filter(
            Document.application_id == application_id,
            Document.doc_type == doc_type,
        )
        .first()
    )


def _cache_matches_document(cached: CandidateDocument, doc: Document) -> bool:
    """Return True when a NER cache row still points at the current upload."""
    if cached.file_path and cached.file_path != doc.file_path:
        return False
    if cached.filename and cached.filename != doc.file_name:
        return False
    if cached.file_size_kb is not None and doc.file_size is not None:
        expected_size_kb = round(doc.file_size / 1024.0, 2)
        if abs(cached.file_size_kb - expected_size_kb) > 0.01:
            return False
    return True


def _get_ready_candidate_document(
    candidate: Candidate,
    document_type: str,
    doc: Document,
    db: Session,
) -> CandidateDocument | None:
    """Fetch an anonymized cache row if it belongs to the current upload."""
    cached = (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id == candidate.id,
            CandidateDocument.document_type == document_type,
            CandidateDocument.anonymized_text != None,  # noqa: E711
        )
        .order_by(CandidateDocument.created_at.desc())
        .first()
    )
    if not cached:
        return None
    if not _cache_matches_document(cached, doc):
        return None
    return cached


def rubric_requires_academic_evidence(rubric: Rubric) -> bool:
    """Return True when rubric text asks for academic/KHS evidence."""
    parts: list[str] = [
        rubric.name or "",
        rubric.position or "",
        rubric.description or "",
    ]
    for dim in rubric.dimensions or []:
        parts.extend([dim.name or "", dim.description or ""])
        indicators = dim.indicators or []
        if isinstance(indicators, list):
            parts.extend(str(item) for item in indicators)
        else:
            parts.append(str(indicators))

    haystack = " ".join(parts).lower()
    return any(keyword in haystack for keyword in _ACADEMIC_EVIDENCE_KEYWORDS)


async def _resolve_khs_context(
    app: Application,
    candidate: Candidate | None,
    rubric: Rubric,
    khs_doc: Document | None,
    db: Session,
) -> dict:
    """Load cached KHS or parse inline fallback, then decide prompt usage.

    W1: read/compute only. The inline parse no longer stores its cache, and the
    scoring-metadata write is not applied here; both are deferred to
    ``_apply_khs_persist`` in the per-candidate persist phase. The returned
    ``_persist`` blob carries everything needed to write them in the short
    write window.
    """
    requires_academic = rubric_requires_academic_evidence(rubric)
    if not khs_doc:
        logger.info("KHS cache miss for application %d: no KHS document", app.id)
        return {
            "parsed_khs": None,
            "khs_summary": None,
            "khs_warning": "No KHS document uploaded",
            "khs_used_in_ai_scoring": False,
            "khs_source": "missing",
            "_persist": {"has_doc": False},
        }

    cached = _get_cached_khs_document(candidate, khs_doc, db) if candidate else None
    parsed: KhsResult | None = None
    source = "missing"
    store_inline = False
    raw_text = ""
    metadata: dict = {}

    if cached:
        parsed = parsed_khs_from_cache(cached.sections_json)
        source = "cache"
        logger.info("KHS cache hit for application %d", app.id)
    else:
        logger.info("KHS cache miss for application %d, parsing inline", app.id)
        parsed, raw_text, metadata = await _parse_khs_inline(app, khs_doc)
        source = "inline_fallback"
        store_inline = True

    warning = None
    if not parsed:
        source = "missing"
        warning = "KHS cache is empty"
    elif parsed.get("parse_error"):
        source = khs_processing_status(parsed)
        warning = parsed.get("parse_error")
        logger.warning("KHS parse error for application %d: %s", app.id, warning)
    else:
        warning = parsed.get("parse_warning")

    used_in_ai = bool(requires_academic and parsed and not parsed.get("parse_error"))
    if used_in_ai:
        logger.info(
            "KHS academic summary will be used in AI scoring for application %d",
            app.id,
        )
    elif not requires_academic:
        logger.info(
            "KHS skipped from AI scoring for application %d because rubric does not require academic evidence",
            app.id,
        )

    public_summary = (
        _public_khs_summary(parsed)
        if parsed and not parsed.get("parse_error")
        else None
    )

    return {
        "parsed_khs": parsed,
        "khs_summary": public_summary,
        "khs_warning": warning,
        "khs_used_in_ai_scoring": used_in_ai,
        "khs_source": source,
        "_persist": {
            "has_doc": True,
            "store_inline": store_inline,
            "raw_text": raw_text,
            "metadata": metadata,
            "parsed": parsed,
            "source": source,
            "used_in_ai_scoring": used_in_ai,
            "warning": warning,
        },
    }


def _apply_khs_persist(
    candidate: Candidate,
    khs_doc: Document | None,
    persist: dict,
    db: Session,
) -> None:
    """Persist the KHS cache row + scoring metadata resolved in the read phase.

    Runs in the per-candidate persist phase (W1). For an inline parse it stores
    the cache row now; for a cache hit it re-resolves the existing row. Either
    way it then writes the scoring metadata (used-in-AI flag, source, warning).
    """
    if not persist.get("has_doc"):
        return
    parsed = persist.get("parsed")
    if persist.get("store_inline"):
        cache_doc = _store_khs_cache(
            candidate=candidate,
            portal_doc=khs_doc,
            raw_text=persist.get("raw_text", ""),
            parsed=parsed,
            metadata=persist.get("metadata") or {},
            db=db,
            source="inline_fallback",
        )
    else:
        cache_doc = _get_cached_khs_document(candidate, khs_doc, db)
    _update_khs_scoring_metadata(
        cache_doc,
        parsed,
        source=persist.get("source"),
        used_in_ai_scoring=persist.get("used_in_ai_scoring", False),
        warning=persist.get("warning"),
        db=db,
    )


def _get_cached_khs_document(
    candidate: Candidate | None,
    khs_doc: Document,
    db: Session,
) -> CandidateDocument | None:
    if candidate is None:
        return None
    cached = (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id == candidate.id,
            CandidateDocument.document_type == DocumentType.KHS.value,
        )
        .order_by(CandidateDocument.created_at.desc())
        .first()
    )
    if not cached:
        return None
    if not _cache_matches_document(cached, khs_doc):
        logger.info("Ignoring stale KHS cache for application %d", khs_doc.application_id)
        return None
    if not parsed_khs_from_cache(cached.sections_json):
        return None
    return cached


async def _parse_khs_inline(
    app: Application,
    khs_doc: Document,
) -> tuple[KhsResult, str, dict]:
    """Parse KHS inline (compute only) — the cache write is deferred to persist.

    W1: returns ``(parsed, raw_text, metadata)`` and performs no DB write, so it
    never flushes inside the read phase. ``_apply_khs_persist`` stores the cache
    row later in the short write window. Degrades to a structured parse error
    rather than raising, so a bad KHS never fails the whole candidate.
    """
    try:
        # parse_khs calls DeepSeek through the sync client; running it in a
        # worker thread keeps its retries/timeout off the event loop.
        extraction = await asyncio.to_thread(
            extract_text_from_pdf, khs_doc.file_path
        )
        raw_text = (extraction.get("raw_text") or "").strip()
        metadata = extraction.get("metadata") or {}
        parsed = await asyncio.to_thread(parse_khs, khs_doc.file_path)
    except Exception as exc:  # noqa: BLE001 - evaluation should degrade gracefully
        logger.warning("Inline KHS parse failed for application %d: %s", app.id, exc)
        raw_text = ""
        metadata = {}
        parsed = khs_parse_error(f"Inline KHS parse failed: {exc}")

    if parsed.get("parse_error"):
        logger.warning(
            "KHS parse error for application %d: %s",
            app.id,
            parsed.get("parse_error"),
        )
    else:
        logger.info("KHS parse success for application %d", app.id)
    return parsed, raw_text, metadata


def _store_khs_cache(
    *,
    candidate: Candidate,
    portal_doc: Document,
    raw_text: str,
    parsed: KhsResult,
    metadata: dict | None,
    db: Session,
    source: str,
) -> CandidateDocument:
    metadata = metadata or {}
    payload = build_khs_cache_payload(
        parsed,
        processing_status=khs_processing_status(parsed),
        processing_error=parsed.get("parse_error"),
        source="llm_parser",
    )
    existing = (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id == candidate.id,
            CandidateDocument.document_type == DocumentType.KHS.value,
        )
        .first()
    )
    if existing:
        existing.filename = portal_doc.file_name
        existing.file_path = portal_doc.file_path
        existing.raw_text = raw_text
        existing.normalized_text = None
        existing.sections_json = payload
        existing.anonymized_text = None
        existing.entities_json = None
        existing.page_count = metadata.get("page_count")
        existing.file_size_kb = metadata.get("file_size_kb")
        db.flush()
        return existing

    cache_doc = CandidateDocument(
        candidate_id=candidate.id,
        filename=portal_doc.file_name,
        file_path=portal_doc.file_path,
        document_type=DocumentType.KHS.value,
        raw_text=raw_text,
        sections_json=payload,
        page_count=metadata.get("page_count"),
        file_size_kb=metadata.get("file_size_kb"),
    )
    db.add(cache_doc)
    db.flush()
    return cache_doc


def _update_khs_scoring_metadata(
    cache_doc: CandidateDocument | None,
    parsed: KhsResult | None,
    *,
    source: str,
    used_in_ai_scoring: bool,
    warning: str | None,
    db: Session,
) -> None:
    if not cache_doc or not parsed:
        return
    current = cache_doc.sections_json if isinstance(cache_doc.sections_json, dict) else {}
    payload = build_khs_cache_payload(
        parsed,
        processing_status=current.get("processing_status"),
        processing_error=current.get("processing_error") or parsed.get("parse_error"),
        source=current.get("source") or "llm_parser",
        scoring={
            "khs_used_in_ai_scoring": used_in_ai_scoring,
            "khs_source": source,
            "khs_warning": warning,
            "evaluated_at": _utcnow().isoformat(),
        },
    )
    cache_doc.sections_json = payload
    db.flush()


def _public_khs_summary(parsed: KhsResult | None) -> dict | None:
    if not parsed:
        return None
    return {
        "ipk_final": parsed.get("ipk_final", parsed.get("ipk")),
        "total_sks_final": parsed.get("total_sks_final", parsed.get("total_sks")),
        "ips_history": parsed.get("ips_history") or [],
        "courses": parsed.get("courses") or [],
        "ongoing_courses": parsed.get("ongoing_courses") or [],
        "parse_warning": parsed.get("parse_warning"),
        "parser_version": parsed.get("parser_version"),
    }


async def _run_ktm(app: Application, user: User | None, db: Session) -> dict:
    """Validate KTM — returns ktm_validator output or synthetic error."""
    ktm_doc = _get_doc(app.id, DocumentType.KTM, db)
    if not ktm_doc:
        return {"valid": False, "error": "No KTM document uploaded"}

    expected_nim = user.nim if user else None
    return await asyncio.to_thread(
        validate_ktm, ktm_doc.file_path, expected_nim=expected_nim
    )


def _legacy_parse_khs_inline(app: Application, db: Session) -> KhsResult:
    """Parse KHS — returns khs_parser output."""
    khs_doc = _get_doc(app.id, DocumentType.KHS, db)
    if not khs_doc:
        return {"ipk": None, "total_sks": None, "relevant_courses": [], "parse_error": "No KHS document uploaded"}

    return parse_khs(khs_doc.file_path)


async def _extract_swot(app: Application, db: Session) -> str | None:
    """Extract SWOT text — best effort."""
    swot_doc = _get_doc(app.id, DocumentType.SWOT, db)
    if not swot_doc or not os.path.exists(swot_doc.file_path):
        return None
    try:
        result = await asyncio.to_thread(extract_text_from_pdf, swot_doc.file_path)
        return (result.get("raw_text") or "").strip() or None
    except Exception:
        return None


def _find_candidate(app: Application, db: Session) -> Candidate | None:
    """Read-only lookup of the Candidate linked to this application's user.

    Used in the W1 read phase so cache lookups can run without creating (and
    flushing) a Candidate row. ``_ensure_candidate`` performs the create/update
    later, in the persist phase.
    """
    return (
        db.query(Candidate)
        .filter(Candidate.user_id == app.user_id)
        .first()
    )


def _ensure_candidate(
    app: Application,
    rubric: Rubric | None,
    user: User | None,
    db: Session,
) -> Candidate:
    """Find or create a Candidate pipeline record linked to this application.

    Task 10.4: rubric is optional. Post-verification NER may create the
    Candidate with rubric_id=None; evaluation fills the rubric_id.
    """
    existing = (
        db.query(Candidate)
        .filter(Candidate.user_id == app.user_id)
        .first()
    )
    if existing:
        if rubric is not None:
            existing.rubric_id = rubric.id
        existing.status = "anonymized"
        db.flush()
        return existing

    candidate = Candidate(
        anonymous_id=_generate_anon_id(),
        user_id=app.user_id,
        rubric_id=rubric.id if rubric else None,
        status="anonymized",
    )
    db.add(candidate)
    db.flush()
    return candidate


def _ensure_candidate_document(
    candidate: Candidate,
    portal_doc: Document,
    raw_text: str,
    normalised: dict,
    anonymised: dict,
    db: Session,
    *,
    document_type: str = "cv",
    metadata: dict | None = None,
) -> CandidateDocument:
    """Find or create a CandidateDocument cache row for an application file."""
    metadata = metadata or {}
    existing = (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id == candidate.id,
            CandidateDocument.document_type == document_type,
        )
        .first()
    )

    if existing:
        existing.filename = portal_doc.file_name
        existing.file_path = portal_doc.file_path
        existing.raw_text = raw_text
        existing.normalized_text = normalised.get("normalized_text", "")
        existing.sections_json = normalised.get("sections")
        existing.anonymized_text = anonymised.get("anonymized_text", "")
        existing.entities_json = anonymised.get("entities_found", [])
        existing.page_count = metadata.get("page_count")
        existing.file_size_kb = metadata.get("file_size_kb")
        db.flush()
        return existing

    cand_doc = CandidateDocument(
        candidate_id=candidate.id,
        filename=portal_doc.file_name,
        file_path=portal_doc.file_path,
        document_type=document_type,
        raw_text=raw_text,
        normalized_text=normalised.get("normalized_text", ""),
        sections_json=normalised.get("sections"),
        anonymized_text=anonymised.get("anonymized_text", ""),
        entities_json=anonymised.get("entities_found", []),
        page_count=metadata.get("page_count"),
        file_size_kb=metadata.get("file_size_kb"),
    )
    db.add(cand_doc)
    db.flush()
    return cand_doc
