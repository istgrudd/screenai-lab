"""Rubrics router — CRUD for scoring rubrics.

Endpoints:
    POST   /api/rubrics        — Create a new rubric with dimensions
    GET    /api/rubrics         — List all rubrics
    GET    /api/rubrics/{id}    — Get rubric detail with dimensions
    PUT    /api/rubrics/{id}    — Update rubric and its dimensions
    DELETE /api/rubrics/{id}    — Delete rubric (cascades to dimensions)
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import require_role
from backend.models.rubric import Rubric, Dimension
from backend.models.user import UserRole

_recruiter_or_admin = require_role(UserRole.RECRUITER, UserRole.SUPER_ADMIN)

router = APIRouter(prefix="/api/rubrics", tags=["rubrics"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class DimensionCreate(BaseModel):
    name: str
    weight: float = Field(..., gt=0, le=1.0)
    description: str | None = None
    indicators: list[str] | None = None


class RubricCreate(BaseModel):
    name: str
    position: str
    description: str | None = None
    dimensions: list[DimensionCreate]


class DimensionUpdate(BaseModel):
    id: int | None = None  # None = new dimension to add
    name: str
    weight: float = Field(..., gt=0, le=1.0)
    description: str | None = None
    indicators: list[str] | None = None


class RubricUpdate(BaseModel):
    name: str
    position: str
    description: str | None = None
    dimensions: list[DimensionUpdate]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rubric_to_dict(rubric: Rubric) -> dict:
    """Serialize a Rubric + its Dimensions to a dict."""
    return {
        "id": rubric.id,
        "name": rubric.name,
        "position": rubric.position,
        "description": rubric.description,
        "created_at": rubric.created_at.isoformat() if rubric.created_at else None,
        "updated_at": rubric.updated_at.isoformat() if rubric.updated_at else None,
        "dimensions": [
            {
                "id": d.id,
                "name": d.name,
                "weight": d.weight,
                "description": d.description,
                "indicators": d.indicators,
            }
            for d in rubric.dimensions
        ],
    }


def _validate_weights(dimensions: list) -> None:
    """Ensure dimension weights sum to approximately 1.0."""
    total = sum(d.weight for d in dimensions)
    if abs(total - 1.0) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Dimension weights must sum to 1.0, got {total:.2f}",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", dependencies=[Depends(_recruiter_or_admin)])
def create_rubric(payload: RubricCreate, db: Session = Depends(get_db)):
    """Create a new rubric with its dimensions."""
    _validate_weights(payload.dimensions)

    rubric = Rubric(
        name=payload.name,
        position=payload.position,
        description=payload.description,
    )
    db.add(rubric)
    db.flush()

    for dim in payload.dimensions:
        dimension = Dimension(
            rubric_id=rubric.id,
            name=dim.name,
            weight=dim.weight,
            description=dim.description,
            indicators=dim.indicators,
        )
        db.add(dimension)

    db.commit()
    db.refresh(rubric)

    return {
        "success": True,
        "data": _rubric_to_dict(rubric),
        "error": None,
    }


@router.get("", dependencies=[Depends(_recruiter_or_admin)])
def list_rubrics(db: Session = Depends(get_db)):
    """List all rubrics (without full dimension details)."""
    rubrics = db.query(Rubric).all()
    return {
        "success": True,
        "data": [
            {
                "id": r.id,
                "name": r.name,
                "position": r.position,
                "description": r.description,
                "dimension_count": len(r.dimensions),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rubrics
        ],
        "error": None,
    }


@router.get("/{rubric_id}", dependencies=[Depends(_recruiter_or_admin)])
def get_rubric(rubric_id: int, db: Session = Depends(get_db)):
    """Get a single rubric with all its dimensions."""
    rubric = db.query(Rubric).filter(Rubric.id == rubric_id).first()
    if not rubric:
        raise HTTPException(status_code=404, detail=f"Rubric {rubric_id} not found")

    return {
        "success": True,
        "data": _rubric_to_dict(rubric),
        "error": None,
    }


@router.put("/{rubric_id}", dependencies=[Depends(_recruiter_or_admin)])
def update_rubric(
    rubric_id: int, payload: RubricUpdate, db: Session = Depends(get_db)
):
    """Update a rubric and replace its dimensions."""
    rubric = db.query(Rubric).filter(Rubric.id == rubric_id).first()
    if not rubric:
        raise HTTPException(status_code=404, detail=f"Rubric {rubric_id} not found")

    _validate_weights(payload.dimensions)

    rubric.name = payload.name
    rubric.position = payload.position
    rubric.description = payload.description

    # Delete old dimensions and recreate
    db.query(Dimension).filter(Dimension.rubric_id == rubric_id).delete()
    db.flush()

    for dim in payload.dimensions:
        dimension = Dimension(
            rubric_id=rubric.id,
            name=dim.name,
            weight=dim.weight,
            description=dim.description,
            indicators=dim.indicators,
        )
        db.add(dimension)

    db.commit()
    db.refresh(rubric)

    return {
        "success": True,
        "data": _rubric_to_dict(rubric),
        "error": None,
    }


@router.delete("/{rubric_id}", dependencies=[Depends(_recruiter_or_admin)])
def delete_rubric(rubric_id: int, db: Session = Depends(get_db)):
    """Delete a rubric and all its dimensions (cascade)."""
    rubric = db.query(Rubric).filter(Rubric.id == rubric_id).first()
    if not rubric:
        raise HTTPException(status_code=404, detail=f"Rubric {rubric_id} not found")

    db.delete(rubric)
    db.commit()

    return {
        "success": True,
        "data": {"deleted_id": rubric_id},
        "error": None,
    }
