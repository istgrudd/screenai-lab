"""Application ORM model — a candidate's submission to a division."""

import enum
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Division(str, enum.Enum):
    """The four MBC Laboratory divisions a candidate can apply to."""

    BIG_DATA = "big_data"
    CYBER_SECURITY = "cyber_security"
    GAME_TECH = "game_tech"
    GIS = "gis"


class ApplicationStatus(str, enum.Enum):
    """Lifecycle states for a candidate application.

    draft:           candidate is still editing / uploading
    submitted:       legacy submitted state before explicit document review
    document_review: recruiter/admin is checking uploaded documents
    correction_requested: one or more documents must be replaced
    verified:        all required documents are accepted; NER may run
    screening:       AI pipeline is processing or has scored it
    announced_pass:  recruiter has published a pass result
    announced_fail:  recruiter has published a fail result
    cancelled:       application/draft was cancelled
    """

    DRAFT = "draft"
    SUBMITTED = "submitted"
    DOCUMENT_REVIEW = "document_review"
    CORRECTION_REQUESTED = "correction_requested"
    VERIFIED = "verified"
    SCREENING = "screening"
    ANNOUNCED_PASS = "announced_pass"
    ANNOUNCED_FAIL = "announced_fail"
    CANCELLED = "cancelled"


class Application(Base):
    """A candidate's application to one division for the current period.

    Phase-1 rule: one active application per user. Submission is
    irreversible once ``status`` transitions out of ``draft``.
    """

    __tablename__ = "applications"
    __table_args__ = (
        # Current invariant: one application per candidate, period-agnostic.
        # `period_id` now exists as a column (stamped at submit time), but the
        # uniqueness rule is still keyed on user_id only — a candidate has at
        # most one in-flight application across all periods. If we ever need
        # to let candidates apply to multiple periods over time, widen this
        # constraint to (user_id, period_id) and add a migration.
        UniqueConstraint("user_id", name="uq_applications_user_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    division = Column(
        Enum(Division, native_enum=False, length=20),
        nullable=False,
    )
    status = Column(
        Enum(ApplicationStatus, native_enum=False, length=20),
        nullable=False,
        default=ApplicationStatus.DRAFT,
    )
    submitted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)

    # Phase 2B: nullable so drafts can exist without a period; the
    # submit endpoint stamps it from the active period at submit time.
    period_id = Column(
        Integer,
        ForeignKey("recruitment_periods.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # --- Relationships ---
    user = relationship("User", back_populates="applications")
    documents = relationship(
        "Document",
        back_populates="application",
        cascade="all, delete-orphan",
    )
    period = relationship("RecruitmentPeriod", back_populates="applications")

    def __repr__(self) -> str:
        return (
            f"<Application(id={self.id}, user_id={self.user_id}, "
            f"division='{self.division}', status='{self.status}')>"
        )
