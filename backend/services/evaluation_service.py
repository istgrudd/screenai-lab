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
import traceback
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.application import Application, ApplicationStatus, Division
from backend.models.candidate import Candidate, CandidateDocument
from backend.models.document import Document, DocumentType
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

async def run_evaluation_pipeline(
    division: str,
    application_ids: list[int] | None,
    db: Session,
    force: bool = False,
) -> dict:
    """Run the full evaluation pipeline for applications in a division.

    Args:
        division: Division value string (e.g. "big_data").
        application_ids: Specific application IDs to evaluate, or None for all
            eligible applications in the division.
        db: Database session.
        force: When True, re-evaluate eligible already-scored candidates in
            VERIFIED or SCREENING status. Final, draft, document-review, and
            correction statuses are always skipped.

    Returns:
        { queued: int, results: [...], errors: [...], skipped: int, ...counters }
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
        return {"queued": 0, "results": [], "errors": [], **counters}

    # Bounded-concurrency evaluation. The SQLAlchemy Session is sync and DB
    # work happens between awaits; the DeepSeek request itself is awaitable,
    # so up to _LLM_CONCURRENCY LLM round-trips can overlap inside this batch.
    semaphore = asyncio.Semaphore(_LLM_CONCURRENCY)

    async def _bounded(app: Application) -> tuple[str, dict]:
        async with semaphore:
            try:
                result = await _evaluate_one(app, rubric, db)
                app.status = ApplicationStatus.SCREENING
                db.flush()
                return ("ok", result)
            except Exception as exc:
                traceback.print_exc()
                return (
                    "err",
                    {"application_id": app.id, "error": str(exc)},
                )

    outcomes = await asyncio.gather(*[_bounded(a) for a in applications])

    results: list[dict] = []
    errors: list[dict] = []
    for tag, item in outcomes:
        if tag == "ok":
            results.append(item)
        else:
            errors.append(item)

    db.commit()

    return {
        "queued": len(applications),
        "results": results,
        "errors": errors,
        **counters,
    }


# ---------------------------------------------------------------------------
# Per-candidate pipeline
# ---------------------------------------------------------------------------

async def _evaluate_one(
    app: Application,
    rubric: Rubric,
    db: Session,
) -> dict:
    """Run the full pipeline for one application."""
    if app.status not in {ApplicationStatus.VERIFIED, ApplicationStatus.SCREENING}:
        app_status = app.status.value if hasattr(app.status, "value") else str(app.status)
        raise ValueError(
            f"Application {app.id} is not eligible for evaluation while status is '{app_status}'"
        )

    user = db.query(User).filter(User.id == app.user_id).first()

    result: dict = {
        "application_id": app.id,
        "division": app.division.value if hasattr(app.division, "value") else str(app.division),
    }

    # --- KTM validation ---
    ktm_result = _run_ktm(app, user, db)
    result["ktm_valid"] = ktm_result.get("valid", False)
    result["ktm_warning"] = ktm_result.get("warning") or ktm_result.get("error")

    # --- Task 10.3/10.4: Ensure Candidate exists (moved up for cache check) ---
    candidate = _ensure_candidate(app, rubric, user, db)

    # --- KHS parsing/cache resolution ---
    khs_context = _resolve_khs_context(app, candidate, rubric, db)
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

    # --- Task 10.3: Check NER cache from post-verification anonymization ---
    cached_cv = (
        db.query(CandidateDocument)
        .filter(
            CandidateDocument.candidate_id == candidate.id,
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
        cached_ml = (
            db.query(CandidateDocument)
            .filter(
                CandidateDocument.candidate_id == candidate.id,
                CandidateDocument.document_type == "motivation_letter",
                CandidateDocument.anonymized_text != None,  # noqa: E711
            )
            .order_by(CandidateDocument.created_at.desc())
            .first()
        )
        if cached_ml and ml_doc and not _cache_matches_document(cached_ml, ml_doc):
            logger.info(
                "Ignoring stale motivation letter NER cache for application %d",
                app.id,
            )
            cached_ml = None
        ml_anon_text = cached_ml.anonymized_text if cached_ml else ""

        # We still need raw_text for _ensure_candidate_document bookkeeping
        cv_doc = _get_doc(app.id, DocumentType.CV, db)
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

        cv_doc = _get_doc(app.id, DocumentType.CV, db)
        if not cv_doc:
            raise ValueError(f"No CV document found for application {app.id}")

        extraction = extract_text_from_pdf(cv_doc.file_path)
        cv_metadata = extraction.get("metadata") or {}
        raw_text = extraction.get("raw_text", "")
        normalised = normalize_and_segment(raw_text)
        anonymised = anonymize_text(normalised["normalized_text"])
        full_text = anonymised.get("anonymized_text", "")

        # Also anonymize motivation letter if present
        ml_doc = _get_doc(app.id, DocumentType.MOTIVATION_LETTER, db)
        ml_anon_text = ""
        cached_ml = (
            _get_ready_candidate_document(
                candidate,
                "motivation_letter",
                ml_doc,
                db,
            )
            if ml_doc
            else None
        )
        if cached_ml:
            ml_anon_text = cached_ml.anonymized_text or ""
        elif ml_doc and os.path.exists(ml_doc.file_path):
            ml_fallback_attempted = True
            try:
                ml_extraction = extract_text_from_pdf(ml_doc.file_path)
                ml_metadata = ml_extraction.get("metadata") or {}
                ml_norm = normalize_and_segment(ml_extraction.get("raw_text", ""))
                ml_anonymised = anonymize_text(ml_norm["normalized_text"])
                ml_anon_text = ml_anonymised.get("anonymized_text", "")
                _ensure_candidate_document(
                    candidate,
                    ml_doc,
                    ml_extraction.get("raw_text", ""),
                    ml_norm,
                    ml_anonymised,
                    db,
                    document_type="motivation_letter",
                    metadata=ml_metadata,
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
            ml_extraction = extract_text_from_pdf(ml_doc.file_path)
            ml_metadata = ml_extraction.get("metadata") or {}
            ml_norm = normalize_and_segment(ml_extraction.get("raw_text", ""))
            ml_anonymised = anonymize_text(ml_norm["normalized_text"])
            ml_anon_text = ml_anonymised.get("anonymized_text", "")
            _ensure_candidate_document(
                candidate,
                ml_doc,
                ml_extraction.get("raw_text", ""),
                ml_norm,
                ml_anonymised,
                db,
                document_type="motivation_letter",
                metadata=ml_metadata,
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

    # --- Bridge: update CandidateDocument ---
    cand_doc = _ensure_candidate_document(
        candidate,
        cv_doc,
        raw_text,
        normalised,
        anonymised,
        db,
        metadata=cv_metadata,
    )

    # --- RAG evaluation ---
    evaluation = await evaluate_candidate(
        anonymized_cv={"anonymized_text": full_text},
        rubric_id=rubric.id,
        db=db,
        certificate_data=None,
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

    # --- SWOT text extraction (highlight only, not scored) ---
    swot_text = _extract_swot(app, db)
    result["swot_text"] = swot_text

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


def _resolve_khs_context(
    app: Application,
    candidate: Candidate,
    rubric: Rubric,
    db: Session,
) -> dict:
    """Load cached KHS or parse inline fallback, then decide prompt usage."""
    requires_academic = rubric_requires_academic_evidence(rubric)
    khs_doc = _get_doc(app.id, DocumentType.KHS, db)
    if not khs_doc:
        logger.info("KHS cache miss for application %d: no KHS document", app.id)
        return {
            "parsed_khs": None,
            "khs_summary": None,
            "khs_warning": "No KHS document uploaded",
            "khs_used_in_ai_scoring": False,
            "khs_source": "missing",
        }

    cached = _get_cached_khs_document(candidate, khs_doc, db)
    parsed: KhsResult | None = None
    cache_doc: CandidateDocument | None = None
    source = "missing"

    if cached:
        parsed = parsed_khs_from_cache(cached.sections_json)
        cache_doc = cached
        source = "cache"
        logger.info("KHS cache hit for application %d", app.id)
    else:
        logger.info("KHS cache miss for application %d, parsing inline", app.id)
        parsed, cache_doc = _parse_and_store_khs_inline(app, candidate, khs_doc, db)
        source = "inline_fallback"

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
    _update_khs_scoring_metadata(
        cache_doc,
        parsed,
        source=source,
        used_in_ai_scoring=used_in_ai,
        warning=warning,
        db=db,
    )

    return {
        "parsed_khs": parsed,
        "khs_summary": public_summary,
        "khs_warning": warning,
        "khs_used_in_ai_scoring": used_in_ai,
        "khs_source": source,
    }


def _get_cached_khs_document(
    candidate: Candidate,
    khs_doc: Document,
    db: Session,
) -> CandidateDocument | None:
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


def _parse_and_store_khs_inline(
    app: Application,
    candidate: Candidate,
    khs_doc: Document,
    db: Session,
) -> tuple[KhsResult, CandidateDocument | None]:
    try:
        extraction = extract_text_from_pdf(khs_doc.file_path)
        raw_text = (extraction.get("raw_text") or "").strip()
        metadata = extraction.get("metadata") or {}
        parsed = parse_khs(khs_doc.file_path)
    except Exception as exc:  # noqa: BLE001 - evaluation should degrade gracefully
        logger.warning("Inline KHS parse failed for application %d: %s", app.id, exc)
        raw_text = ""
        metadata = {}
        parsed = khs_parse_error(f"Inline KHS parse failed: {exc}")

    cache_doc = _store_khs_cache(
        candidate=candidate,
        portal_doc=khs_doc,
        raw_text=raw_text,
        parsed=parsed,
        metadata=metadata,
        db=db,
        source="inline_fallback",
    )
    if parsed.get("parse_error"):
        logger.warning(
            "KHS parse error for application %d: %s",
            app.id,
            parsed.get("parse_error"),
        )
    else:
        logger.info("KHS parse success for application %d", app.id)
    return parsed, cache_doc


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


def _run_ktm(app: Application, user: User | None, db: Session) -> dict:
    """Validate KTM — returns ktm_validator output or synthetic error."""
    ktm_doc = _get_doc(app.id, DocumentType.KTM, db)
    if not ktm_doc:
        return {"valid": False, "error": "No KTM document uploaded"}

    expected_nim = user.nim if user else None
    return validate_ktm(ktm_doc.file_path, expected_nim=expected_nim)


def _legacy_parse_khs_inline(app: Application, db: Session) -> KhsResult:
    """Parse KHS — returns khs_parser output."""
    khs_doc = _get_doc(app.id, DocumentType.KHS, db)
    if not khs_doc:
        return {"ipk": None, "total_sks": None, "relevant_courses": [], "parse_error": "No KHS document uploaded"}

    return parse_khs(khs_doc.file_path)


def _extract_swot(app: Application, db: Session) -> str | None:
    """Extract SWOT text — best effort."""
    swot_doc = _get_doc(app.id, DocumentType.SWOT, db)
    if not swot_doc or not os.path.exists(swot_doc.file_path):
        return None
    try:
        result = extract_text_from_pdf(swot_doc.file_path)
        return (result.get("raw_text") or "").strip() or None
    except Exception:
        return None


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
