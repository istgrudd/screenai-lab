"""Candidate-related ORM models: Candidate, CandidateDocument, DimensionScore.

These models back the Capstone AI-evaluation pipeline (NER, RAG, scoring).
Phase-1 Lab-specific models for candidate-uploaded files live in
``models.application`` and ``models.document``.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Text,
    DateTime,
    ForeignKey,
    Boolean,
    JSON,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _generate_anon_id() -> str:
    """Generate a short anonymous identifier like 'CAND-a1b2c3d4'."""
    return f"CAND-{uuid.uuid4().hex[:8]}"


class Candidate(Base):
    """A job applicant whose documents are being screened.

    The anonymous_id labels the candidate in AI-facing contexts. It is the
    identifier that travels with the anonymized document text into AI
    evaluation; recruiters can still view the candidate's real identity for
    verification and decision-making (AI-anonymized evaluation, not full
    blind recruitment).
    """

    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    anonymous_id = Column(
        String(20), unique=True, nullable=False, default=_generate_anon_id
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        doc="Owning user account (candidate who uploaded this CV)",
    )
    rubric_id = Column(
        Integer,
        ForeignKey("rubrics.id", ondelete="SET NULL"),
        nullable=True,
        doc="Rubric/position this candidate applied to",
    )
    status = Column(
        String(20),
        nullable=False,
        default="uploaded",
        doc="Pipeline status: uploaded | extracted | anonymized | scored",
    )
    composite_score = Column(Float, nullable=True, doc="Weighted total score (0-100) incl. language bonus")
    profile_summary = Column(Text, nullable=True, doc="LLM-generated narrative summary")
    language_score = Column(
        Integer,
        nullable=True,
        doc="Raw score from language certificate (e.g. EPrT TOTAL SCORE, 310-677)",
    )
    language_bonus = Column(
        Float,
        nullable=True,
        doc="CEFR-mapped bonus added to composite_score (0-8)",
    )
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    # --- Relationships ---
    documents = relationship(
        "CandidateDocument",
        back_populates="candidate",
        cascade="all, delete-orphan",
    )
    dimension_scores = relationship(
        "DimensionScore", back_populates="candidate", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Candidate(id={self.id}, anon='{self.anonymous_id}', status='{self.status}')>"


class CandidateDocument(Base):
    """A PDF processed by the Capstone AI pipeline (CV or EPrT certificate).

    Stores the raw extracted text, normalized/segmented text, and the
    anonymized version used for scoring. Distinct from Phase-1
    ``models.document.Document``, which tracks candidate-uploaded
    application files prior to AI processing.
    """

    __tablename__ = "candidate_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(
        Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False, doc="Relative path in data/raw_pdfs/")
    document_type = Column(
        String(20),
        nullable=False,
        default="cv",
        doc="Document type: cv | certificate",
    )

    # --- Extracted content ---
    raw_text = Column(Text, nullable=True, doc="Full text extracted by PyMuPDF")
    normalized_text = Column(Text, nullable=True, doc="Cleaned and normalized text")
    sections_json = Column(
        JSON,
        nullable=True,
        doc='Segmented sections: {"education": ..., "experience": ..., "skills": ..., "certifications": ..., "other": ...}',
    )
    anonymized_text = Column(Text, nullable=True, doc="Text after NER anonymization")
    entities_json = Column(
        JSON,
        nullable=True,
        doc='Entities found during anonymization: [{"text": ..., "label": ..., "replacement": ...}]',
    )

    # --- Metadata ---
    page_count = Column(Integer, nullable=True)
    file_size_kb = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)

    # --- Relationships ---
    candidate = relationship("Candidate", back_populates="documents")

    def __repr__(self) -> str:
        return f"<CandidateDocument(id={self.id}, type='{self.document_type}', file='{self.filename}')>"


class DimensionScore(Base):
    """Score for a single competency dimension for a candidate.

    Created by the RAG pipeline, can be overridden by the recruiter.
    """

    __tablename__ = "dimension_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(
        Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    dimension_id = Column(
        Integer, ForeignKey("dimensions.id", ondelete="CASCADE"), nullable=False
    )
    rubric_id = Column(
        Integer, ForeignKey("rubrics.id", ondelete="CASCADE"), nullable=False
    )

    # --- Scoring ---
    score = Column(Float, nullable=False, doc="Dimension score (0-100)")
    weighted_score = Column(Float, nullable=False, doc="score × dimension weight")
    justification = Column(
        Text, nullable=True, doc="Evidence-based justification from LLM"
    )
    evidence_json = Column(
        JSON, nullable=True, doc="List of CV excerpts supporting the score"
    )

    # --- Override ---
    is_override = Column(
        Boolean, nullable=False, default=False, doc="True if recruiter manually adjusted"
    )
    override_reason = Column(Text, nullable=True, doc="Recruiter's reason for override")

    created_at = Column(DateTime, nullable=False, default=_utcnow)

    # --- Relationships ---
    candidate = relationship("Candidate", back_populates="dimension_scores")
    dimension = relationship("Dimension", back_populates="scores")
    rubric = relationship("Rubric")

    def __repr__(self) -> str:
        return f"<DimensionScore(cand={self.candidate_id}, dim={self.dimension_id}, score={self.score})>"
