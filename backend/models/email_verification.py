"""Email verification link model."""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EmailVerificationLink(Base):
    """One-time candidate email verification link.

    ``link_secret_hash`` stores a deterministic hash of the raw link secret.
    The raw secret is only present in the email body and is never persisted.
    """

    __tablename__ = "email_verification_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    link_secret_hash = Column(String(128), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    sent_to_email = Column(String(255), nullable=False)

    user = relationship("User", back_populates="email_verification_links")

    def __repr__(self) -> str:
        return (
            "<EmailVerificationLink("
            f"id={self.id}, user_id={self.user_id}, sent_to_email='{self.sent_to_email}'"
            ")>"
        )
