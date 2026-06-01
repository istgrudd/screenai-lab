"""Email notification delivery log model."""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EmailNotification(Base):
    """Persistent delivery log for workflow email notifications.

    The table stores routing and provider metadata only. It intentionally does
    not store full email bodies, reset links, verification URLs, tokens, or raw
    provider payloads.
    """

    __tablename__ = "email_notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notification_type = Column(String(80), nullable=False, index=True)
    to_email = Column(String(255), nullable=False, index=True)
    subject = Column(String(255), nullable=False)
    provider = Column(String(50), nullable=True)
    provider_message_id = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, index=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow, index=True)
    sent_at = Column(DateTime, nullable=True)
    related_application_id = Column(
        Integer,
        ForeignKey("applications.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    related_audit_log_id = Column(
        Integer,
        ForeignKey("audit_logs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user = relationship("User")
    related_application = relationship("Application")
    related_audit_log = relationship("AuditLog")

    def __repr__(self) -> str:
        return (
            "<EmailNotification("
            f"id={self.id}, type='{self.notification_type}', "
            f"to='{self.to_email}', status='{self.status}'"
            ")>"
        )
