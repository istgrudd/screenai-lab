"""AuditLog ORM model — records recruiter actions on candidate data."""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AuditLog(Base):
    """An entry in the recruiter-action audit trail.

    Written whenever a recruiter mutates candidate-facing state:
    score override, document verification, announcement publish, etc.
    ``old_value`` / ``new_value`` are free-form strings so the same
    table can serve all action types.
    """

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    recruiter_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    candidate_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action_type = Column(String(50), nullable=False, index=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    reason = Column(Text, nullable=True)
    timestamp = Column(DateTime, nullable=False, default=_utcnow, index=True)

    # --- Relationships ---
    recruiter = relationship("User", foreign_keys=[recruiter_id])
    candidate = relationship("User", foreign_keys=[candidate_id])

    def __repr__(self) -> str:
        return (
            f"<AuditLog(id={self.id}, action='{self.action_type}', "
            f"recruiter={self.recruiter_id}, candidate={self.candidate_id})>"
        )
