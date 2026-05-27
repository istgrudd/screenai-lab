"""Rubric-related ORM models: Rubric and Dimension."""

from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from backend.database import Base
from backend.models.application import Division


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Rubric(Base):
    """A scoring rubric defined by the recruiter for a specific position.

    Each rubric contains multiple competency dimensions with
    weights that must sum to 1.0 (100%).
    """

    __tablename__ = "rubrics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, doc="Rubric name, e.g. 'Lab Assistant 2026'")
    position = Column(
        String(200), nullable=False, doc="Position this rubric applies to"
    )
    # Task 14.2: typed as Enum(Division) with values_callable so SQLAlchemy
    # stores the lowercase enum *value* ('big_data' …) — matches the data
    # already on disk and keeps `==` comparisons against raw strings working.
    # Direct DB writes of stray values are now rejected at the column-type
    # boundary instead of silently sneaking in.
    division = Column(
        Enum(
            Division,
            native_enum=False,
            length=20,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=True,
        index=True,
        doc="Division this rubric scores (big_data / cyber_security / game_tech / gis). "
            "Nullable for legacy Capstone rubrics that predate divisions.",
    )
    description = Column(Text, nullable=True, doc="Optional description of the rubric")
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    # --- Relationships ---
    dimensions = relationship(
        "Dimension", back_populates="rubric", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Rubric(id={self.id}, name='{self.name}', position='{self.position}')>"


class Dimension(Base):
    """A single competency dimension within a rubric.

    Example: 'Technical Skills' with weight 0.3 and indicators like
    'programming experience', 'relevant coursework', etc.
    """

    __tablename__ = "dimensions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rubric_id = Column(
        Integer, ForeignKey("rubrics.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String(200), nullable=False, doc="Dimension name, e.g. 'Technical Skills'")
    weight = Column(
        Float,
        nullable=False,
        doc="Weight of this dimension (0.0 - 1.0). All weights in a rubric must sum to 1.0.",
    )
    description = Column(
        Text, nullable=True, doc="Description of what this dimension measures"
    )
    indicators = Column(
        JSON,
        nullable=True,
        doc='Concrete indicators the LLM should look for: ["programming experience", "relevant coursework"]',
    )

    # --- Relationships ---
    rubric = relationship("Rubric", back_populates="dimensions")
    scores = relationship(
        "DimensionScore", back_populates="dimension", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Dimension(id={self.id}, name='{self.name}', weight={self.weight})>"
