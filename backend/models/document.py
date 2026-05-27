"""Document ORM model — candidate-uploaded application files.

A Document is the persistent record of one file uploaded by a candidate
for their Application (e.g. CV, KHS, KTM, Motivation Letter, SWOT,
Dokumen Pendukung). AI-pipeline artifacts (raw text, NER output, scores)
live on ``models.candidate.CandidateDocument``.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DocumentType(str, enum.Enum):
    """The six document types a candidate must upload (D-01 … D-06)."""

    CV = "cv"
    KHS = "khs"
    KTM = "ktm"
    MOTIVATION_LETTER = "motivation_letter"
    SWOT = "swot"
    SUPPORTING_DOCS = "supporting_docs"


class Document(Base):
    """One uploaded file belonging to an Application.

    At most one Document per (application, doc_type). Replacing a
    document before submit happens via PUT — the stored row is
    updated in-place rather than rows piling up.
    """

    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("application_id", "doc_type", name="uq_documents_app_type"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    application_id = Column(
        Integer,
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    doc_type = Column(
        Enum(DocumentType, native_enum=False, length=30),
        nullable=False,
    )
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False, doc="Size in bytes")
    uploaded_at = Column(DateTime, nullable=False, default=_utcnow)
    is_verified = Column(
        Boolean,
        nullable=False,
        default=False,
        doc="Recruiter manual verification flag for supporting_docs (D-06)",
    )

    # --- Relationships ---
    application = relationship("Application", back_populates="documents")

    def __repr__(self) -> str:
        return (
            f"<Document(id={self.id}, app={self.application_id}, "
            f"type='{self.doc_type}', file='{self.file_name}')>"
        )
