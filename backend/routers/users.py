"""Users router — super-admin user management + self-service profile.

Endpoints:
    GET  /api/users/me                    — Auth; current user's profile
                                             (enriched with division)
    PUT  /api/users/me                    — Auth; update own profile;
                                             candidate-only fields lock
                                             after submit

Super-admin only:
    GET  /api/users                       — paginated user list
    PUT  /api/users/{id}/role             — change role
    PUT  /api/users/{id}/deactivate       — set is_active = False
    PUT  /api/users/{id}/reactivate       — set is_active = True

A super_admin cannot deactivate or demote themselves — that's a trivial
footgun we block server-side so the single admin account can't lock itself
out of the system.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.application import Application, ApplicationStatus, Division
from backend.models.user import User, UserRole
from backend.utils.security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])

_super_admin_only = require_role(UserRole.SUPER_ADMIN)

# Mirror the candidate NIM rule from auth.py — at least 10 numeric digits.
_NIM_PATTERN = re.compile(r"^\d{10,}$")

# Status set that locks academic identity fields (Task 13.4.2). Once a
# candidate has submitted, they cannot change their NIM, division, etc.
_LOCKED_STATUSES = {
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.SCREENING,
    ApplicationStatus.ANNOUNCED_PASS,
    ApplicationStatus.ANNOUNCED_FAIL,
}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class UserAdminOut(BaseModel):
    id: int
    email: str
    full_name: str
    nim: str | None
    faculty: str | None
    major: str | None
    year: int | None
    whatsapp: str | None
    role: str
    is_active: bool
    created_at: str | None

    @classmethod
    def from_user(cls, u: User) -> "UserAdminOut":
        return cls(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            nim=u.nim,
            faculty=u.faculty,
            major=u.major,
            year=u.year,
            whatsapp=u.whatsapp,
            role=u.role.value if hasattr(u.role, "value") else str(u.role),
            is_active=u.is_active,
            created_at=u.created_at.isoformat() if u.created_at else None,
        )


class RoleUpdate(BaseModel):
    role: UserRole


class MeOut(BaseModel):
    """Response shape for GET /api/users/me — enriched with division.

    ``division`` is sourced from the user's most recent active Application
    (any non-deleted Application — there is at most one per candidate today).
    Recruiters/admins always see ``None``. ``application_status`` lets the
    frontend disable the academic-identity inputs without a second fetch.
    """

    id: int
    email: str
    full_name: str
    nim: str | None
    faculty: str | None
    major: str | None
    year: int | None
    whatsapp: str | None
    division: str | None
    application_status: str | None
    role: str
    is_active: bool


class ProfileUpdate(BaseModel):
    """PUT /api/users/me — every field is optional; only sent ones change.

    NIM/faculty/major/year/division are locked once the user's active
    Application has moved past DRAFT — the endpoint returns 403 in that
    case rather than silently no-opping.
    """

    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    whatsapp: str | None = Field(default=None, max_length=32)
    nim: str | None = Field(default=None, min_length=10, max_length=20)
    faculty: str | None = Field(default=None, min_length=1, max_length=255)
    major: str | None = Field(default=None, min_length=1, max_length=255)
    year: int | None = Field(default=None, ge=2000, le=2100)
    division: Division | None = None
    password: str | None = Field(default=None, min_length=8, max_length=72)

    @field_validator("nim")
    @classmethod
    def _validate_nim(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not _NIM_PATTERN.match(v):
            raise ValueError("NIM must be a numeric string of at least 10 digits")
        return v


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _forbid_self_action(target: User, current: User, action: str) -> None:
    if target.id == current.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You cannot {action} your own account",
        )


def _latest_application(db: Session, user_id: int) -> Application | None:
    return (
        db.query(Application)
        .filter(Application.user_id == user_id)
        .order_by(Application.created_at.desc())
        .first()
    )


def _me_payload(db: Session, user: User) -> dict:
    """Build the GET /me response, deriving division from the user's app."""
    app = _latest_application(db, user.id) if user.role == UserRole.CANDIDATE else None
    division = None
    app_status = None
    if app is not None:
        division = (
            app.division.value if hasattr(app.division, "value") else str(app.division)
        )
        app_status = (
            app.status.value if hasattr(app.status, "value") else str(app.status)
        )
    return MeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        nim=user.nim,
        faculty=user.faculty,
        major=user.major,
        year=user.year,
        whatsapp=user.whatsapp,
        division=division,
        application_status=app_status,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        is_active=user.is_active,
    ).model_dump()


# ---------------------------------------------------------------------------
# Self-service profile endpoints (Task 13.4.2)
# ---------------------------------------------------------------------------

@router.get("/me")
def get_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's profile + (for candidates) their division."""
    return {"success": True, "data": _me_payload(db, current_user), "error": None}


@router.put("/me")
def update_me(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the current user's profile.

    For candidates, ``nim``/``faculty``/``major``/``year`` are locked
    once the active Application has moved past DRAFT. ``division`` is
    locked as soon as *any* Application exists (including DRAFT) — the
    candidate has already started uploading docs against that division
    and switching mid-flight would orphan their uploads. All five keys
    raise 403 if present in the payload after their respective lock.
    ``full_name``, ``email``, ``whatsapp``, and ``password`` remain
    editable in every phase. Recruiters/super_admins ignore lock logic
    and never carry a division.
    """
    is_candidate = current_user.role == UserRole.CANDIDATE
    app = _latest_application(db, current_user.id) if is_candidate else None
    submit_locked = bool(app and app.status in _LOCKED_STATUSES)
    division_locked = bool(app)  # any Application — DRAFT or beyond

    data = payload.model_dump(exclude_unset=True)

    # Reject locked-field changes early for a clear error message.
    locked_attempted: set[str] = set()
    if submit_locked:
        locked_attempted |= {"nim", "faculty", "major", "year"} & data.keys()
    if division_locked and "division" in data and data["division"] != (
        app.division.value if hasattr(app.division, "value") else str(app.division)
    ):
        locked_attempted.add("division")
    if locked_attempted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Field tidak dapat diubah setelah aplikasi dibuat.",
                "locked_fields": sorted(locked_attempted),
            },
        )

    # Division is only meaningful for candidates and only changes the
    # Application — not the User. Reject for non-candidates if sent.
    if "division" in data and not is_candidate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hanya kandidat yang memiliki divisi.",
        )

    # Email uniqueness check before mutating anything.
    if "email" in data:
        new_email = data["email"].lower()
        if new_email != current_user.email:
            exists = (
                db.query(User)
                .filter(User.email == new_email, User.id != current_user.id)
                .first()
            )
            if exists:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email sudah dipakai akun lain.",
                )
            current_user.email = new_email

    if "nim" in data:
        nim = data["nim"]
        exists = (
            db.query(User)
            .filter(User.nim == nim, User.id != current_user.id)
            .first()
        )
        if exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="NIM sudah dipakai akun lain.",
            )
        current_user.nim = nim

    if "full_name" in data:
        current_user.full_name = data["full_name"].strip()
    if "faculty" in data:
        current_user.faculty = data["faculty"].strip()
    if "major" in data:
        current_user.major = data["major"].strip()
    if "year" in data:
        current_user.year = data["year"]
    if "whatsapp" in data:
        # Allow clearing by sending empty string; keep otherwise.
        wa = data["whatsapp"]
        current_user.whatsapp = wa.strip() if wa else None
    if "password" in data:
        current_user.password_hash = hash_password(data["password"])

    if "division" in data and is_candidate:
        # Mutate the user's draft Application — create one if there isn't
        # any (i.e. the candidate hasn't started one yet).
        new_div = data["division"]
        if app is None:
            app = Application(
                user_id=current_user.id,
                division=new_div,
                status=ApplicationStatus.DRAFT,
            )
            db.add(app)
        else:
            app.division = new_div

    db.commit()
    db.refresh(current_user)
    return {"success": True, "data": _me_payload(db, current_user), "error": None}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", dependencies=[Depends(_super_admin_only)])
def list_users(
    page: int = Query(1, ge=1, description="1-indexed page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page (1-100)"),
    role: UserRole | None = Query(None, description="Filter by role"),
    q: str | None = Query(None, description="Search substring on email / full_name / NIM"),
    db: Session = Depends(get_db),
):
    """Paginated list of users for the admin panel."""
    query = db.query(User)
    if role is not None:
        query = query.filter(User.role == role)
    if q:
        needle = f"%{q.strip()}%"
        query = query.filter(
            (User.email.ilike(needle))
            | (User.full_name.ilike(needle))
            | (User.nim.ilike(needle))
        )

    total = query.count()
    rows = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {
        "success": True,
        "data": {
            "page": page,
            "limit": limit,
            "total": total,
            "items": [UserAdminOut.from_user(u).model_dump() for u in rows],
        },
        "error": None,
    }


@router.put("/{user_id}/role", dependencies=[Depends(_super_admin_only)])
def update_role(
    user_id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change a user's role."""
    target = _get_user_or_404(db, user_id)
    _forbid_self_action(target, current_user, "change the role of")

    target.role = payload.role
    db.commit()
    db.refresh(target)
    return {"success": True, "data": UserAdminOut.from_user(target).model_dump(), "error": None}


@router.put("/{user_id}/deactivate", dependencies=[Depends(_super_admin_only)])
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a user as deactivated — blocks future logins."""
    target = _get_user_or_404(db, user_id)
    _forbid_self_action(target, current_user, "deactivate")

    target.is_active = False
    db.commit()
    db.refresh(target)
    return {"success": True, "data": UserAdminOut.from_user(target).model_dump(), "error": None}


@router.put("/{user_id}/reactivate", dependencies=[Depends(_super_admin_only)])
def reactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
):
    """Re-enable a previously deactivated account."""
    target = _get_user_or_404(db, user_id)
    target.is_active = True
    db.commit()
    db.refresh(target)
    return {"success": True, "data": UserAdminOut.from_user(target).model_dump(), "error": None}
