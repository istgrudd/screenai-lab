"""EvaluationJob ORM model — Phase 2 background evaluation jobs.

Each ``evaluation_jobs`` row is the durable source of truth for one division
batch evaluation: its progress counters, status, and final error list. The
``POST /api/recruiter/evaluate/batch`` handler inserts the row
(``status=queued``) and returns ``202 + job_id``; a background task runs the
pipeline and updates the counters incrementally, then flips the row to a
terminal state.

A partial unique index (one non-terminal job per division) enforces the
"only one evaluation per division at a time" invariant at the DB level —
see the ``evaluation_jobs`` Alembic migration. This DB-level guard replaces
the Phase 1 in-process ``_running_divisions`` set.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    String,
)
from sqlalchemy.orm import relationship

from backend.database import Base
from backend.models.application import Division


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EvaluationJobStatus(str, enum.Enum):
    """Lifecycle states for an evaluation background job.

    queued:    row created, background task not yet started
    running:   background task is processing candidates
    completed: run finished (even if some individual candidates errored)
    failed:    the whole run threw, or it was interrupted by a restart
    """

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# Non-terminal states. A job in one of these holds the division's slot in the
# partial unique index (``WHERE status IN ('queued','running')``). Shared here
# so the runner, the polling endpoints, and startup recovery use one source.
NON_TERMINAL_JOB_STATUSES = (
    EvaluationJobStatus.QUEUED,
    EvaluationJobStatus.RUNNING,
)


class EvaluationJob(Base):
    """A background division-evaluation job and its live progress."""

    __tablename__ = "evaluation_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Stored as the lowercase enum *value* ('big_data' …) via values_callable,
    # matching Rubric.division — not the uppercase enum *name* that
    # Application.division stores. The partial unique index predicate compares
    # against these lowercase strings, so they must agree.
    division = Column(
        Enum(
            Division,
            native_enum=False,
            length=20,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=False,
        index=True,
    )
    # Nullable: evaluation may run with no active period (only a soft warning
    # applies), so a job is not tied to a period.
    period_id = Column(
        Integer,
        ForeignKey("recruitment_periods.id", ondelete="SET NULL"),
        nullable=True,
    )
    status = Column(
        Enum(
            EvaluationJobStatus,
            native_enum=False,
            length=20,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=False,
        default=EvaluationJobStatus.QUEUED,
    )
    force = Column(Boolean, nullable=False, default=False)
    total = Column(Integer, nullable=False, default=0)
    processed = Column(Integer, nullable=False, default=0)
    succeeded = Column(Integer, nullable=False, default=0)
    failed = Column(Integer, nullable=False, default=0)
    # List of {application_id, error}; written once at completion (never
    # concurrently appended — see the runner).
    errors = Column(JSON, nullable=False, default=list)
    triggered_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    # Free-form note; recovery sets "interrupted by restart".
    note = Column(String(255), nullable=True)

    # --- Relationships ---
    triggered_by_user = relationship("User")
    period = relationship("RecruitmentPeriod")

    def __repr__(self) -> str:
        return (
            f"<EvaluationJob(id={self.id}, division='{self.division}', "
            f"status='{self.status}', processed={self.processed}/{self.total})>"
        )
