"""User ORM model for authentication and RBAC."""

import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    """Role enum for RBAC.

    super_admin: full system access, user management
    recruiter:   evaluate candidates, manage rubrics, publish announcements
    candidate:   register, upload documents, submit application, view status
    """

    SUPER_ADMIN = "super_admin"
    RECRUITER = "recruiter"
    CANDIDATE = "candidate"


class User(Base):
    """An authenticated user of the system.

    Candidate-specific fields (nim, faculty, major, year) are nullable at
    the DB level — recruiters and super_admins don't have them. The
    /api/auth/register endpoint enforces that candidates provide all four.
    """

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)

    # --- Candidate-only student info ---
    nim = Column(String(20), unique=True, nullable=True, index=True)
    faculty = Column(String(255), nullable=True)
    major = Column(String(255), nullable=True)
    year = Column(Integer, nullable=True)

    # Optional contact field. Editable from the candidate ProfilePage even
    # after submit, since recruiters may need to reach out at any phase.
    whatsapp = Column(String(32), nullable=True)

    role = Column(
        Enum(UserRole, native_enum=False, length=20),
        nullable=False,
        default=UserRole.CANDIDATE,
    )
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)

    # Candidate email verification state. Recruiter/super_admin enforcement
    # is intentionally deferred; Phase 3 only blocks unverified candidates.
    email_verified_at = Column(DateTime, nullable=True)
    email_verification_sent_at = Column(DateTime, nullable=True)
    password_changed_at = Column(DateTime, nullable=True)

    # --- Relationships ---
    applications = relationship(
        "Application",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    periods = relationship(
        "RecruitmentPeriod",
        back_populates="creator",
    )
    email_verification_links = relationship(
        "EmailVerificationLink",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    password_reset_links = relationship(
        "PasswordResetLink",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}')>"
