"""Users router — super-admin user management.

Endpoints (all super_admin only):
    GET  /api/users                       — paginated user list
    PUT  /api/users/{id}/role             — change role
    PUT  /api/users/{id}/deactivate       — set is_active = False
    PUT  /api/users/{id}/reactivate       — set is_active = True

A super_admin cannot deactivate or demote themselves — that's a trivial
footgun we block server-side so the single admin account can't lock itself
out of the system.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import get_current_user, require_role
from backend.models.user import User, UserRole

router = APIRouter(prefix="/api/users", tags=["users"])

_super_admin_only = require_role(UserRole.SUPER_ADMIN)


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
            role=u.role.value if hasattr(u.role, "value") else str(u.role),
            is_active=u.is_active,
            created_at=u.created_at.isoformat() if u.created_at else None,
        )


class RoleUpdate(BaseModel):
    role: UserRole


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
