"""Applications router — candidate application CRUD + final submit.

Endpoints:
    POST /api/applications                 — Candidate; create a new application
    GET  /api/applications/my              — Candidate; fetch my active application
    POST /api/applications/{id}/submit     — Candidate; final submit (irreversible)
    GET  /api/recruiter/applications       — Recruiter+; list submitted applications

Rules:
    * One application per user for the current period. The candidate sees a
      409 if they try to POST a second one.
    * Submission requires one Document per DocumentType (D-01 … D-06). The
      endpoint returns the list of missing doc_types on failure.
    * After submission, status transitions out of ``draft`` and the document
      router refuses any further mutations (see documents.py).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.candidate import Candidate
from backend.models.document import Document, DocumentType
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole
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

    @classmethod
    def from_application(cls, app: Application, documents_count: int) -> "ApplicationOut":
        return cls(
            id=app.id,
            user_id=app.user_id,
            division=app.division.value if hasattr(app.division, "value") else str(app.division),
            status=app.status.value if hasattr(app.status, "value") else str(app.status),
            submitted_at=app.submitted_at.isoformat() if app.submitted_at else None,
            created_at=app.created_at.isoformat() if app.created_at else None,
            documents_count=documents_count,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _count_documents(db: Session, application_id: int) -> int:
    return db.query(Document).filter(Document.application_id == application_id).count()


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
    """Create a new application. One per candidate per active period."""
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
        "data": ApplicationOut.from_application(app, 0).model_dump(),
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
    return {
        "success": True,
        "data": ApplicationOut.from_application(app, count).model_dump(),
        "error": None,
    }


@router.get("/{application_id}/swot-text")
def get_swot_text(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return plain-text content of the application's uploaded SWOT PDF.

    Extraction is deterministic (PyMuPDF); the text is not cached — SWOT
    documents are small enough that re-extracting on demand is cheaper
    than managing a cache invalidation path.
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
        },
        "error": None,
    }


@router.post(
    "/{application_id}/submit",
    dependencies=[Depends(_candidate_only)],
)
def submit_application(
    application_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Final-submit an application.

    Validates that every DocumentType (D-01 … D-06) has a Document, sets
    status to ``submitted``, stamps ``submitted_at``, and locks the
    documents (the document router rejects edits once status != draft).
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

    uploaded_types: set[str] = {
        (d.doc_type.value if hasattr(d.doc_type, "value") else str(d.doc_type))
        for d in db.query(Document).filter(Document.application_id == app.id).all()
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

    app.status = ApplicationStatus.SUBMITTED
    app.submitted_at = datetime.now(timezone.utc)
    app.period_id = active_period.id
    db.commit()
    db.refresh(app)

    # Task 10.2: trigger NER anonymization in the background.
    # Pass a NEW db session — the request-scoped session will be closed
    # by the time the background task runs.
    background_tasks.add_task(
        run_submit_anonymization, app.id, next(get_db())
    )

    return {
        "success": True,
        "data": ApplicationOut.from_application(app, len(required_types)).model_dump(),
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

    Task 12.5: each row carries ``rank`` (1-based, by composite_score DESC
    within its division across all submitted apps; None if not evaluated)
    and ``is_recommended`` (True iff active period has ``threshold_n`` and
    ``rank <= threshold_n``). Both are computed at query time.
    """
    q = db.query(Application)
    if status_filter is None:
        q = q.filter(Application.status != ApplicationStatus.DRAFT)
    else:
        q = q.filter(Application.status == status_filter)
    if division is not None:
        q = q.filter(Application.division == division)

    rows = q.order_by(Application.submitted_at.desc().nullslast()).all()

    # ---- Task 12.5: per-division rank from composite_score --------------
    # Build (app_id -> composite_score) for every row whose user has a
    # Candidate eval record, then rank within division. We rank across the
    # *filtered* result set so the recruiter sees ranks consistent with
    # whatever they're currently viewing.
    user_ids = [app.user_id for app in rows]
    scored_by_user: dict[int, Candidate] = {}
    if user_ids:
        for c in (
            db.query(Candidate)
            .filter(Candidate.user_id.in_(user_ids))
            .order_by(Candidate.created_at.desc())
            .all()
        ):
            # Keep the newest per user (sorted DESC, so first-write wins).
            scored_by_user.setdefault(c.user_id, c)

    by_division: dict[str, list[tuple[int, float]]] = {}
    for app in rows:
        scored = scored_by_user.get(app.user_id)
        if scored is None or scored.composite_score is None:
            continue
        div_key = app.division.value if hasattr(app.division, "value") else str(app.division)
        by_division.setdefault(div_key, []).append((app.id, scored.composite_score))

    rank_by_app_id: dict[int, int] = {}
    for div_key, items in by_division.items():
        items.sort(key=lambda t: t[1], reverse=True)
        for idx, (app_id, _score) in enumerate(items, start=1):
            rank_by_app_id[app_id] = idx

    active_period = (
        db.query(RecruitmentPeriod)
        .filter(RecruitmentPeriod.is_active == True)  # noqa: E712
        .order_by(RecruitmentPeriod.created_at.desc())
        .first()
    )
    threshold_n = active_period.threshold_n if active_period else None

    data = []
    for app in rows:
        user = db.query(User).filter(User.id == app.user_id).first()
        count = _count_documents(db, app.id)
        scored = scored_by_user.get(app.user_id) if user else None

        rank = rank_by_app_id.get(app.id)
        is_recommended = bool(
            rank is not None and threshold_n is not None and rank <= threshold_n
        )

        data.append(
            {
                **ApplicationOut.from_application(app, count).model_dump(),
                "doc_completeness_pct": int(round((count / len(DocumentType)) * 100)),
                "rank": rank,
                "is_recommended": is_recommended,
                "candidate": {
                    "user_id": user.id if user else None,
                    "full_name": user.full_name if user else None,
                    "email": user.email if user else None,
                    "nim": user.nim if user else None,
                    "faculty": user.faculty if user else None,
                    "major": user.major if user else None,
                    "year": user.year if user else None,
                } if user else None,
                "evaluation": {
                    "candidate_id": scored.id,
                    "anonymous_id": scored.anonymous_id,
                    "composite_score": scored.composite_score,
                    "language_score": scored.language_score,
                    "language_bonus": scored.language_bonus,
                    "status": scored.status,
                } if scored else None,
            }
        )
    return {"success": True, "data": data, "error": None}
