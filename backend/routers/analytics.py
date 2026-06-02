"""Recruiter analytics router for active-period recruitment metrics."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import require_role
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.candidate import Candidate
from backend.models.document import Document, DocumentType
from backend.models.period import RecruitmentPeriod
from backend.models.user import User, UserRole

router = APIRouter(prefix="/api/recruiter", tags=["analytics"])

_recruiter_or_admin = require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN)

_FUNNEL_STATUSES = [
    ApplicationStatus.DRAFT,
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.DOCUMENT_REVIEW,
    ApplicationStatus.CORRECTION_REQUESTED,
    ApplicationStatus.VERIFIED,
    ApplicationStatus.SCREENING,
    ApplicationStatus.ANNOUNCED_PASS,
    ApplicationStatus.ANNOUNCED_FAIL,
    ApplicationStatus.CANCELLED,
]

_DIVISION_LABELS = {
    Division.BIG_DATA.value: "Big Data",
    Division.CYBER_SECURITY.value: "Cyber Security",
    Division.GAME_TECH.value: "Game Tech",
    Division.GIS.value: "GIS",
}

_DOCUMENT_LABELS = {
    DocumentType.CV.value: "Curriculum Vitae",
    DocumentType.KHS.value: "KHS",
    DocumentType.KTM.value: "KTM",
    DocumentType.MOTIVATION_LETTER.value: "Motivation Letter",
    DocumentType.SWOT.value: "SWOT",
    DocumentType.SUPPORTING_DOCS.value: "Supporting Documents",
}

_SCORE_BUCKETS = [
    {"label": "0-20", "min": 0, "max": 20},
    {"label": "21-40", "min": 21, "max": 40},
    {"label": "41-60", "min": 41, "max": 60},
    {"label": "61-80", "min": 61, "max": 80},
    {"label": "81-100", "min": 81, "max": 100},
]

# IPK buckets are range-stable: rendered in this fixed order regardless of
# count, never sorted by frequency. `max_exclusive=None` is the final/open
# bucket. Candidates without an IPK fall into the Unknown bucket below.
_IPK_BUCKETS = [
    {"label": "0.00 - 2.49", "max_exclusive": 2.50},
    {"label": "2.50 - 2.99", "max_exclusive": 3.00},
    {"label": "3.00 - 3.49", "max_exclusive": 3.50},
    {"label": "3.50 - 4.00", "max_exclusive": None},
]
_IPK_UNKNOWN_LABEL = "Belum Diisi"


def _utc_iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _enum_value(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _active_period(db: Session) -> RecruitmentPeriod | None:
    return (
        db.query(RecruitmentPeriod)
        .filter(RecruitmentPeriod.is_active == True)  # noqa: E712
        .order_by(RecruitmentPeriod.created_at.desc())
        .first()
    )


def _period_payload(period: RecruitmentPeriod | None) -> dict | None:
    if period is None:
        return None
    return {
        "id": period.id,
        "name": period.name,
        "current_phase": period.current_phase,
        "start_date": _utc_iso(period.start_date),
        "submission_end_date": _utc_iso(period.submission_end_date),
        "evaluation_end_date": _utc_iso(period.evaluation_end_date),
        "end_date": _utc_iso(period.end_date),
        "threshold_n": period.threshold_n,
    }


def _zero_payload(division: Division | None) -> dict:
    return {
        "active_period": None,
        "filters": {"division": division.value if division else None},
        "summary": _summary_payload([]),
        "applicants_per_division": _applicants_per_division([]),
        "funnel_counts": _funnel_counts([]),
        "document_completeness": _document_completeness([], {}),
        "missing_documents_by_type": _missing_documents_by_type([], {}),
        "evaluation_progress": _evaluation_progress([], {}),
        "score_distribution": _score_distribution([]),
        "demographics": {
            "faculty_distribution": [],
            "major_distribution": [],
            "year_distribution": [],
            "ipk_distribution": [],
        },
        "message": "No active recruitment period.",
    }


def _latest_candidates_by_user(db: Session, user_ids: set[int]) -> dict[int, Candidate]:
    if not user_ids:
        return {}

    candidates = (
        db.query(Candidate)
        .filter(Candidate.user_id.in_(user_ids))
        .order_by(Candidate.created_at.desc(), Candidate.id.desc())
        .all()
    )
    latest: dict[int, Candidate] = {}
    for candidate in candidates:
        if candidate.user_id is not None and candidate.user_id not in latest:
            latest[candidate.user_id] = candidate
    return latest


def _documents_by_application(db: Session, application_ids: list[int]) -> dict[int, set[str]]:
    if not application_ids:
        return {}

    rows = (
        db.query(Document.application_id, Document.doc_type)
        .filter(Document.application_id.in_(application_ids))
        .all()
    )
    docs: dict[int, set[str]] = {app_id: set() for app_id in application_ids}
    for application_id, doc_type in rows:
        docs.setdefault(application_id, set()).add(_enum_value(doc_type))
    return docs


def _submitted_or_later(app: Application) -> bool:
    return app.status not in {ApplicationStatus.DRAFT, ApplicationStatus.CANCELLED}


def _candidate_scores(
    apps: list[Application],
    candidates_by_user: dict[int, Candidate],
) -> list[float]:
    scores: list[float] = []
    for app in apps:
        candidate = candidates_by_user.get(app.user_id)
        if candidate and candidate.composite_score is not None:
            scores.append(float(candidate.composite_score))
    return scores


def _summary_payload(
    apps: list[Application],
    candidates_by_user: dict[int, Candidate] | None = None,
) -> dict:
    candidates_by_user = candidates_by_user or {}
    scores = _candidate_scores(apps, candidates_by_user)
    return {
        "total_applications": len(apps),
        "submitted_or_later": sum(1 for app in apps if _submitted_or_later(app)),
        "total_verified": sum(1 for app in apps if app.status == ApplicationStatus.VERIFIED),
        "total_evaluated": len(scores),
        "total_announced": sum(
            1
            for app in apps
            if app.status
            in {ApplicationStatus.ANNOUNCED_PASS, ApplicationStatus.ANNOUNCED_FAIL}
        ),
        "total_correction_requested": sum(
            1 for app in apps if app.status == ApplicationStatus.CORRECTION_REQUESTED
        ),
        "average_score": round(sum(scores) / len(scores), 2) if scores else None,
    }


def _applicants_per_division(apps: list[Application]) -> list[dict]:
    buckets: dict[str, dict] = {}
    for division in Division:
        buckets[division.value] = {
            "division": division.value,
            "label": _DIVISION_LABELS.get(division.value, division.value),
            "total": 0,
            "submitted_or_later": 0,
            "verified": 0,
            "screening": 0,
            "announced_pass": 0,
            "announced_fail": 0,
        }

    for app in apps:
        key = _enum_value(app.division)
        bucket = buckets.setdefault(
            key,
            {
                "division": key,
                "label": _DIVISION_LABELS.get(key, key),
                "total": 0,
                "submitted_or_later": 0,
                "verified": 0,
                "screening": 0,
                "announced_pass": 0,
                "announced_fail": 0,
            },
        )
        bucket["total"] += 1
        if _submitted_or_later(app):
            bucket["submitted_or_later"] += 1
        status_value = _enum_value(app.status)
        if status_value in bucket:
            bucket[status_value] += 1

    return list(buckets.values())


def _funnel_counts(apps: list[Application]) -> dict[str, int]:
    counts = {status.value: 0 for status in _FUNNEL_STATUSES}
    for app in apps:
        status_value = _enum_value(app.status)
        counts[status_value] = counts.get(status_value, 0) + 1
    return counts


def _document_scope(apps: list[Application]) -> list[Application]:
    return [app for app in apps if app.status != ApplicationStatus.CANCELLED]


def _document_completeness(
    apps: list[Application],
    docs_by_application: dict[int, set[str]],
) -> dict:
    required = [doc_type.value for doc_type in DocumentType]
    required_count = len(required)
    scoped_apps = _document_scope(apps)

    items = []
    raw_percentages: list[float] = []
    for app in scoped_apps:
        uploaded_count = len(docs_by_application.get(app.id, set()) & set(required))
        pct = (uploaded_count / required_count) * 100 if required_count else 0
        raw_percentages.append(pct)
        items.append(
            {
                "application_id": app.id,
                "division": _enum_value(app.division),
                "status": _enum_value(app.status),
                "uploaded_count": uploaded_count,
                "completion_pct": round(pct),
            }
        )

    complete_count = sum(1 for item in items if item["uploaded_count"] == required_count)
    average_pct = (
        round(sum(raw_percentages) / len(raw_percentages), 1)
        if raw_percentages
        else 0
    )

    return {
        "required_count": required_count,
        "complete_count": complete_count,
        "incomplete_count": len(scoped_apps) - complete_count,
        "average_completion_pct": average_pct,
        "items": items,
    }


def _missing_documents_by_type(
    apps: list[Application],
    docs_by_application: dict[int, set[str]],
) -> list[dict]:
    scoped_apps = _document_scope(apps)
    items: list[dict] = []
    for doc_type in DocumentType:
        doc_value = doc_type.value
        missing_count = sum(
            1
            for app in scoped_apps
            if doc_value not in docs_by_application.get(app.id, set())
        )
        items.append(
            {
                "doc_type": doc_value,
                "label": _DOCUMENT_LABELS.get(doc_value, doc_value),
                "missing_count": missing_count,
            }
        )
    return items


def _evaluation_progress(
    apps: list[Application],
    candidates_by_user: dict[int, Candidate],
) -> dict:
    evaluated_app_ids: set[int] = set()
    error_count = 0
    for app in apps:
        candidate = candidates_by_user.get(app.user_id)
        if not candidate:
            continue
        if candidate.composite_score is not None:
            evaluated_app_ids.add(app.id)
        if str(candidate.status).lower() in {"error", "failed"}:
            error_count += 1

    return {
        "eligible_for_evaluation": sum(
            1 for app in apps if app.status == ApplicationStatus.VERIFIED
        ),
        "evaluated_count": len(evaluated_app_ids),
        "pending_evaluation_count": sum(
            1
            for app in apps
            if app.status == ApplicationStatus.VERIFIED and app.id not in evaluated_app_ids
        ),
        "correction_blocked_count": sum(
            1 for app in apps if app.status == ApplicationStatus.CORRECTION_REQUESTED
        ),
        "document_review_blocked_count": sum(
            1 for app in apps if app.status == ApplicationStatus.DOCUMENT_REVIEW
        ),
        "announced_count": sum(
            1
            for app in apps
            if app.status
            in {ApplicationStatus.ANNOUNCED_PASS, ApplicationStatus.ANNOUNCED_FAIL}
        ),
        "error_count": error_count,
    }


def _score_distribution(scores: list[float]) -> dict:
    buckets = [{**bucket, "count": 0} for bucket in _SCORE_BUCKETS]
    for score in scores:
        normalized = max(0.0, min(100.0, float(score)))
        if normalized <= 20:
            buckets[0]["count"] += 1
        elif normalized <= 40:
            buckets[1]["count"] += 1
        elif normalized <= 60:
            buckets[2]["count"] += 1
        elif normalized <= 80:
            buckets[3]["count"] += 1
        else:
            buckets[4]["count"] += 1

    return {
        "count": len(scores),
        "average": round(sum(scores) / len(scores), 2) if scores else None,
        "min": min(scores) if scores else None,
        "max": max(scores) if scores else None,
        "buckets": buckets,
    }


def _demographic_scope(apps: list[Application]) -> list[Application]:
    return [
        app
        for app in apps
        if app.status not in {ApplicationStatus.DRAFT, ApplicationStatus.CANCELLED}
    ]


def _clean_demographic_label(value: object | None) -> str:
    if value is None:
        return "Unknown"
    cleaned = str(value).strip()
    return cleaned or "Unknown"


def _year_distribution_sort_key(pair: tuple[str, int]) -> tuple[int, int, str]:
    label, _count = pair
    try:
        return (0, -int(label), label)
    except (TypeError, ValueError):
        return (1, 0, label.lower())


def _distribution(items: list[str], *, sort_by_year: bool = False) -> list[dict]:
    total = len(items)
    if total == 0:
        return []

    counts: dict[str, int] = {}
    for item in items:
        counts[item] = counts.get(item, 0) + 1

    sort_key = (
        _year_distribution_sort_key
        if sort_by_year
        else lambda pair: (-pair[1], pair[0].lower())
    )

    return [
        {
            "label": label,
            "count": count,
            "percentage": round((count / total) * 100, 1),
        }
        for label, count in sorted(counts.items(), key=sort_key)
    ]


def _ipk_bucket_label(ipk: float) -> str:
    for bucket in _IPK_BUCKETS:
        max_exclusive = bucket["max_exclusive"]
        if max_exclusive is None or ipk < max_exclusive:
            return bucket["label"]
    return _IPK_BUCKETS[-1]["label"]


def _ipk_distribution(ipks: list[float | None]) -> list[dict]:
    """Bucket IPK values into range-stable groups.

    Percentages are computed over the full scoped population (``ipks`` already
    contains one entry per scoped application, with ``None`` for candidates
    who have not filled in their IPK). Buckets are returned in fixed order,
    never sorted by count, so the IPK ranges stay visually stable.
    """
    total = len(ipks)
    if total == 0:
        return []

    counts: dict[str, int] = {bucket["label"]: 0 for bucket in _IPK_BUCKETS}
    counts[_IPK_UNKNOWN_LABEL] = 0
    for ipk in ipks:
        if ipk is None:
            counts[_IPK_UNKNOWN_LABEL] += 1
        else:
            counts[_ipk_bucket_label(float(ipk))] += 1

    ordered_labels = [bucket["label"] for bucket in _IPK_BUCKETS] + [
        _IPK_UNKNOWN_LABEL
    ]
    return [
        {
            "label": label,
            "count": counts[label],
            "percentage": round((counts[label] / total) * 100, 1),
        }
        for label in ordered_labels
    ]


def _demographics_payload(
    apps: list[Application],
    users_by_id: dict[int, User],
) -> dict:
    scoped_apps = _demographic_scope(apps)
    faculties: list[str] = []
    majors: list[str] = []
    years: list[str] = []
    ipks: list[float | None] = []

    for app in scoped_apps:
        user = users_by_id.get(app.user_id)
        faculties.append(_clean_demographic_label(user.faculty if user else None))
        majors.append(_clean_demographic_label(user.major if user else None))
        years.append(_clean_demographic_label(user.year if user else None))
        ipks.append(user.ipk if user else None)

    return {
        "faculty_distribution": _distribution(faculties),
        "major_distribution": _distribution(majors),
        "year_distribution": _distribution(years, sort_by_year=True),
        "ipk_distribution": _ipk_distribution(ipks),
    }


@router.get(
    "/analytics",
    dependencies=[Depends(_recruiter_or_admin)],
)
def get_recruiter_analytics(
    division: Division | None = Query(None, description="Optional division filter"),
    db: Session = Depends(get_db),
):
    """Return active-period analytics for recruiter and super-admin dashboards."""
    period = _active_period(db)
    if period is None:
        return {"success": True, "data": _zero_payload(division), "error": None}

    all_apps = (
        db.query(Application)
        .filter(Application.period_id == period.id)
        .order_by(Application.created_at.asc(), Application.id.asc())
        .all()
    )
    filtered_apps = (
        [app for app in all_apps if _enum_value(app.division) == division.value]
        if division is not None
        else all_apps
    )
    user_ids = {app.user_id for app in filtered_apps}
    candidates_by_user = _latest_candidates_by_user(db, user_ids)
    users_by_id = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    docs_by_application = _documents_by_application(db, [app.id for app in filtered_apps])
    scores = _candidate_scores(filtered_apps, candidates_by_user)

    return {
        "success": True,
        "data": {
            "active_period": _period_payload(period),
            "filters": {"division": division.value if division else None},
            "summary": _summary_payload(filtered_apps, candidates_by_user),
            "applicants_per_division": _applicants_per_division(all_apps),
            "funnel_counts": _funnel_counts(filtered_apps),
            "document_completeness": _document_completeness(
                filtered_apps,
                docs_by_application,
            ),
            "missing_documents_by_type": _missing_documents_by_type(
                filtered_apps,
                docs_by_application,
            ),
            "evaluation_progress": _evaluation_progress(
                filtered_apps,
                candidates_by_user,
            ),
            "score_distribution": _score_distribution(scores),
            "demographics": _demographics_payload(filtered_apps, users_by_id),
        },
        "error": None,
    }
