"""Applications router — candidate application CRUD + final submit.

Endpoints:
    POST /api/applications                 — Candidate; create a new application
    GET  /api/applications/my              — Candidate; fetch my active application
    POST /api/applications/{id}/submit     — Candidate; final submit (irreversible)
    GET  /api/recruiter/applications       — Recruiter+; list submitted applications

Rules:
    * Current implementation allows one application per user globally. The
      candidate sees a 409 if they try to POST a second one. If multi-period
      re-application is needed later, widen the model/check to
      (user_id, period_id).
    * Submission requires one Document per DocumentType (D-01 … D-06). The
      endpoint returns the list of missing doc_types on failure.
    * After submission, status transitions out of ``draft`` and the document
      router refuses any further mutations (see documents.py).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from backend.database import SessionLocal, get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.candidate import Candidate, CandidateDocument
from backend.models.document import Document, DocumentType
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole
from backend.services.document_review_service import (
    document_review_progress,
    finalize_document_review,
    reset_document_review_state,
)
from backend.services.extractor import extract_text_from_pdf
from backend.services.submit_anonymization import run_submit_anonymization
from backend.utils.period_utils import get_current_phase

router = APIRouter(prefix="/api/applications", tags=["applications"])
recruiter_router = APIRouter(prefix="/api/recruiter", tags=["recruiter"])

_candidate_only = require_role(UserRole.CANDIDATE)
_recruiter_or_admin = require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ApplicationCreate(BaseModel):
    division: Division


class ApplicationOut(BaseModel):
    id: int
    user_id: int
    division: str
    status: str
    submitted_at: str | None
    created_at: str | None
    documents_count: int
    document_review_progress: dict | None = None

    @classmethod
    def from_application(
        cls,
        app: Application,
        documents_count: int,
        review_progress: dict | None = None,
    ) -> "ApplicationOut":
        return cls(
            id=app.id,
            user_id=app.user_id,
            division=app.division.value if hasattr(app.division, "value") else str(app.division),
            status=app.status.value if hasattr(app.status, "value") else str(app.status),
            submitted_at=app.submitted_at.isoformat() if app.submitted_at else None,
            created_at=app.created_at.isoformat() if app.created_at else None,
            documents_count=documents_count,
            document_review_progress=review_progress,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _count_documents(db: Session, application_id: int) -> int:
    return db.query(Document).filter(Document.application_id == application_id).count()


def _document_review_progress(db: Session, application_id: int) -> dict:
    docs = db.query(Document).filter(Document.application_id == application_id).all()
    return document_review_progress(docs)


def _get_my_application_or_404(db: Session, user: User) -> Application:
    app = (
        db.query(Application)
        .filter(Application.user_id == user.id)
        .order_by(Application.created_at.desc())
        .first()
    )
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No application found for this user",
        )
    return app


# ---------------------------------------------------------------------------
# Candidate endpoints
# ---------------------------------------------------------------------------

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_candidate_only)],
)
def create_application(
    payload: ApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new application.

    There is currently at most one application per candidate globally, not one
    application per recruitment period. Multi-period re-application would need
    a `(user_id, period_id)` uniqueness model.
    """
    existing = (
        db.query(Application).filter(Application.user_id == current_user.id).first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "You already have an active application",
                "application_id": existing.id,
                "status": existing.status.value
                if hasattr(existing.status, "value")
                else str(existing.status),
            },
        )

    app = Application(
        user_id=current_user.id,
        division=payload.division,
        status=ApplicationStatus.DRAFT,
    )
    db.add(app)
    db.commit()
    db.refresh(app)

    return {
        "success": True,
        "data": ApplicationOut.from_application(
            app,
            0,
            document_review_progress([]),
        ).model_dump(),
        "error": None,
    }


@router.get("/my", dependencies=[Depends(_candidate_only)])
def get_my_application(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch the current candidate's application (404 if none)."""
    app = _get_my_application_or_404(db, current_user)
    count = _count_documents(db, app.id)
    review_progress = _document_review_progress(db, app.id)
    return {
        "success": True,
        "data": ApplicationOut.from_application(
            app,
            count,
            review_progress,
        ).model_dump(),
        "error": None,
    }


@router.get("/{application_id}/swot-text")
def get_swot_text(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return plain-text content of the application's uploaded SWOT PDF.

    Reads from the submit-time cache on ``CandidateDocument`` (Perf 3) so the
    server doesn't re-open the PDF on every request. Falls back to inline
    PyMuPDF extraction if the cache is empty (e.g. submit-time NER task
    crashed, or the application predates the cache feature).
    """
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    # Candidates can read their own; recruiters+ can read any.
    if current_user.role == UserRole.CANDIDATE and app.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your application")

    swot_doc = (
        db.query(Document)
        .filter(
            Document.application_id == application_id,
            Document.doc_type == DocumentType.SWOT,
        )
        .first()
    )
    if not swot_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No SWOT document uploaded for this application",
        )

    # Cache hit path — no disk I/O, no PyMuPDF.
    cached = (
        db.query(CandidateDocument)
        .join(Candidate, Candidate.id == CandidateDocument.candidate_id)
        .filter(
            Candidate.user_id == app.user_id,
            CandidateDocument.document_type == DocumentType.SWOT.value,
        )
        .order_by(CandidateDocument.created_at.desc())
        .first()
    )
    if cached and cached.raw_text:
        return {
            "success": True,
            "data": {
                "application_id": application_id,
                "document_id": swot_doc.id,
                "file_name": swot_doc.file_name,
                "text": cached.raw_text.strip(),
                "page_count": cached.page_count,
                "source": "cache",
            },
            "error": None,
        }

    if app.status not in (
        ApplicationStatus.VERIFIED,
        ApplicationStatus.SCREENING,
        ApplicationStatus.ANNOUNCED_PASS,
        ApplicationStatus.ANNOUNCED_FAIL,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="SWOT text is available only after document verification",
        )

    # Cache miss: fall back to inline extraction only after verification.
    try:
        result = extract_text_from_pdf(swot_doc.file_path)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to extract SWOT text: {e}",
        )

    return {
        "success": True,
        "data": {
            "application_id": application_id,
            "document_id": swot_doc.id,
            "file_name": swot_doc.file_name,
            "text": (result.get("raw_text") or "").strip(),
            "page_count": result.get("metadata", {}).get("page_count"),
            "source": "live",
        },
        "error": None,
    }


@router.post(
    "/{application_id}/submit",
    dependencies=[Depends(_candidate_only)],
)
def submit_application(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Final-submit an application into document review.

    Validates that every DocumentType has a Document, sets status to
    ``document_review``, stamps ``submitted_at``, and leaves NER blocked until
    recruiter/admin final approval.
    """
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    if app.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your application")
    if app.status != ApplicationStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Application has already been submitted",
                "status": app.status.value
                if hasattr(app.status, "value")
                else str(app.status),
            },
        )

    # Phase 2B (Task 11.7) + Task 13.2.1: submission requires an active
    # recruitment period AND the period must currently be in the
    # SUBMISSION phase. The phase is derived from the calendar; legacy
    # periods (no submission_end_date) collapse to SUBMISSION while
    # is_active is True, preserving back-compat.
    active_period = (
        db.query(RecruitmentPeriod)
        .filter(RecruitmentPeriod.is_active == True)  # noqa: E712
        .first()
    )
    if not active_period:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tidak ada periode rekrutasi yang aktif saat ini.",
        )

    phase = get_current_phase(active_period, datetime.now(timezone.utc))
    if phase != "SUBMISSION":
        phase_messages = {
            "UPCOMING": "Periode rekrutasi belum dibuka.",
            "EVALUATION": "Masa pendaftaran telah ditutup.",
            "ANNOUNCEMENT": "Masa pendaftaran telah ditutup.",
            "CLOSED": "Periode rekrutasi telah berakhir.",
        }
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=phase_messages.get(phase, "Pendaftaran tidak diperbolehkan saat ini."),
        )

    docs = db.query(Document).filter(Document.application_id == app.id).all()
    uploaded_types: set[str] = {
        (d.doc_type.value if hasattr(d.doc_type, "value") else str(d.doc_type))
        for d in docs
    }
    required_types = [dt.value for dt in DocumentType]
    missing = [dt for dt in required_types if dt not in uploaded_types]

    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Cannot submit — required documents are missing",
                "missing": missing,
                "required": required_types,
            },
        )

    app.status = ApplicationStatus.DOCUMENT_REVIEW
    app.submitted_at = datetime.now(timezone.utc)
    app.period_id = active_period.id
    for doc in docs:
        reset_document_review_state(doc)
    db.commit()
    db.refresh(app)

    return {
        "success": True,
        "data": ApplicationOut.from_application(
            app,
            len(required_types),
            document_review_progress(docs),
        ).model_dump(),
        "error": None,
    }


@router.post(
    "/{application_id}/finalize-document-review",
    dependencies=[Depends(_recruiter_or_admin)],
)
def finalize_application_document_review(
    application_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Finalize document review for one application/candidate."""
    result = finalize_document_review(
        db,
        application_id=application_id,
        reviewer=current_user,
    )
    if result.trigger_anonymization:
        background_tasks.add_task(
            run_submit_anonymization,
            result.application.id,
            SessionLocal,
        )

    return {
        "success": True,
        "data": ApplicationOut.from_application(
            result.application,
            _count_documents(db, result.application.id),
            _document_review_progress(db, result.application.id),
        ).model_dump()
        | {
            "rejected_document_types": result.rejected_document_types,
            "anonymization_queued": result.trigger_anonymization,
        },
        "error": None,
    }


# ---------------------------------------------------------------------------
# Recruiter endpoints
# ---------------------------------------------------------------------------

@recruiter_router.get(
    "/applications",
    dependencies=[Depends(_recruiter_or_admin)],
)
def list_submitted_applications(
    division: Division | None = Query(None, description="Filter by division"),
    status_filter: ApplicationStatus | None = Query(
        None, alias="status", description="Filter by application status"
    ),
    db: Session = Depends(get_db),
):
    """List applications for the recruiter dashboard.

    By default returns every application whose status has moved past
    ``draft``. Can be narrowed with ``division`` and ``status`` query
    params (Task 6 will consume these).
    """
    q = (
        db.query(Application)
        .options(joinedload(Application.user), joinedload(Application.documents))
        .filter(
            ~Application.status.in_(
                [ApplicationStatus.DRAFT, ApplicationStatus.CANCELLED]
            )
        )
    )
    if division:
        q = q.filter(Application.division == division)
    if status_filter:
        q = q.filter(Application.status == status_filter)

    apps = q.order_by(Application.submitted_at.desc().nullslast()).all()

    # Build rank lookup per division based on composite_score (desc), ignoring
    # unscored candidates. Rank is computed within the current filtered set so
    # UI filters and counts stay intuitive.
    candidate_by_user = {
        c.user_id: c for c in db.query(Candidate).filter(Candidate.user_id.isnot(None)).all()
    }
    scored_by_division: dict[str, list[tuple[Application, Candidate]]] = {}
    for app in apps:
        cand = candidate_by_user.get(app.user_id)
        if cand and cand.composite_score is not None:
            div_value = app.division.value if hasattr(app.division, "value") else str(app.division)
            scored_by_division.setdefault(div_value, []).append((app, cand))

    rank_by_app: dict[int, int] = {}
    for _div, pairs in scored_by_division.items():
        pairs.sort(key=lambda pair: pair[1].composite_score or -1, reverse=True)
        for idx, (app, _cand) in enumerate(pairs, start=1):
            rank_by_app[app.id] = idx

    active_period = (
        db.query(RecruitmentPeriod)
        .filter(RecruitmentPeriod.is_active == True)  # noqa: E712
        .first()
    )
    threshold_n = active_period.threshold_n if active_period else None

    # One grouped query for document counts; avoids N+1 count queries.
    count_rows = (
        db.query(Document.application_id, func.count(Document.id))
        .filter(Document.application_id.in_([app.id for app in apps]) if apps else False)
        .group_by(Document.application_id)
        .all()
    )
    doc_counts = {application_id: count for application_id, count in count_rows}
    required_count = len(DocumentType)

    items: list[dict] = []
    for app in apps:
        doc_count = doc_counts.get(app.id, 0)
        cand = candidate_by_user.get(app.user_id)
        rank = rank_by_app.get(app.id)
        is_recommended = bool(threshold_n and rank and rank <= threshold_n)

        review_progress = document_review_progress(list(app.documents))
        item = ApplicationOut.from_application(
            app,
            doc_count,
            review_progress,
        ).model_dump()
        item.update({
            "doc_completeness_pct": round((doc_count / required_count) * 100),
            "candidate": {
                "user_id": app.user.id,
                "full_name": app.user.full_name,
                "email": app.user.email,
                "nim": app.user.nim,
                "faculty": app.user.faculty,
                "major": app.user.major,
                "year": app.user.year,
                "whatsapp": app.user.whatsapp,
            },
            "evaluation": {
                "candidate_id": cand.id,
                "anonymous_id": cand.anonymous_id,
                "composite_score": cand.composite_score,
                "language_score": cand.language_score,
                "language_bonus": cand.language_bonus,
                "status": cand.status,
            } if cand else None,
            "rank": rank,
            "is_recommended": is_recommended,
        })
        items.append(item)

    return {"success": True, "data": items, "error": None}
