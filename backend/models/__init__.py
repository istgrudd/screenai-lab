"""ORM models for the recruitment screening system.

Importing this package ensures all models are registered with
SQLAlchemy's Base so that init_db() can create the tables.
"""

from backend.models.candidate import Candidate, CandidateDocument, DimensionScore  # noqa: F401
from backend.models.rubric import Rubric, Dimension  # noqa: F401
from backend.models.user import User, UserRole  # noqa: F401
from backend.models.email_verification import EmailVerificationLink  # noqa: F401
from backend.models.password_reset import PasswordResetLink  # noqa: F401
from backend.models.application import Application, ApplicationStatus, Division  # noqa: F401
from backend.models.document import Document, DocumentType  # noqa: F401
from backend.models.audit import AuditLog  # noqa: F401
from backend.models.period import RecruitmentPeriod  # noqa: F401
