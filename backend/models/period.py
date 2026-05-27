"""RecruitmentPeriod ORM model — Phase 2B.

A RecruitmentPeriod represents a single recruitment cycle. Only one
period is active at a time; the application-layer in
``backend.routers.periods`` enforces this by deactivating siblings
inside the same transaction whenever a new period is created or
flipped to active. Submission is locked when no active period exists
(see ``submit_application``).

Task 13.1 expands the period into four explicit phase boundaries:

    SUBMISSION   : start_date          → submission_end_date
    EVALUATION   : submission_end_date → evaluation_end_date
    ANNOUNCEMENT : evaluation_end_date → end_date
    CLOSED       : after end_date

``submission_end_date`` and ``evaluation_end_date`` are nullable for
back-compat with periods created before this change — those are
treated as a single SUBMISSION window that runs from start_date to
end_date (see ``backend.utils.period_utils.get_current_phase``).
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RecruitmentPeriod(Base):
    """One recruitment cycle, owned by a Super Admin.

    ``threshold_n`` is a visual-only top-N highlight for the recruiter
    dashboard — it does not gate any auto-action.
    """

    __tablename__ = "recruitment_periods"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    start_date = Column(DateTime, nullable=False)
    submission_end_date = Column(DateTime, nullable=True)
    evaluation_end_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=False)
    is_active = Column(Boolean, nullable=False, default=False)
    threshold_n = Column(Integer, nullable=True)
    created_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at = Column(DateTime, nullable=False, default=_utcnow)

    # --- Relationships ---
    creator = relationship("User", back_populates="periods")
    applications = relationship("Application", back_populates="period")

    @property
    def current_phase(self) -> str:
        """Derived phase based on ``datetime.now(UTC)`` and the period dates."""
        from backend.utils.period_utils import get_current_phase

        return get_current_phase(self, datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return (
            f"<RecruitmentPeriod(id={self.id}, name='{self.name}', "
            f"is_active={self.is_active})>"
        )
