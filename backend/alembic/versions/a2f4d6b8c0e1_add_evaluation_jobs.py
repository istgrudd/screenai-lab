"""add evaluation_jobs table + partial unique index

Revision ID: a2f4d6b8c0e1
Revises: a1b2c3d4e5f6
Create Date: 2026-06-18 00:00:00.000000

Phase 2 — Evaluation background jobs. Creates the ``evaluation_jobs`` table
that is the durable source of truth for a division batch evaluation, plus a
*partial unique index* enforcing "one non-terminal job per division" at the
database level:

    UNIQUE (division) WHERE status IN ('queued', 'running')

This replaces the Phase 1 in-process ``_running_divisions`` set, so duplicate
triggers are impossible across restarts/processes — a duplicate insert raises
``IntegrityError`` which the POST handler maps to HTTP 409.

Unlike ``15e1fb0f5fe3_partial_unique_active_period.py`` (which is
Postgres-only because the pre-existing ``recruitment_periods`` table already
held duplicate ``is_active = FALSE`` rows), ``evaluation_jobs`` is a brand new,
empty table and terminal rows (completed/failed) are *excluded* from the
predicate. The partial unique index therefore creates cleanly on both SQLite
(the dev/test database, where the duplicate-409 smoke test must pass) and
PostgreSQL, which share the same ``CREATE UNIQUE INDEX ... WHERE`` syntax.

The ``division`` and ``status`` columns are stored as their lowercase enum
*values* ('big_data' …, 'queued' …) — the model uses ``values_callable`` — so
the index predicate's string literals match what is on disk.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a2f4d6b8c0e1"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEX_NAME = "uq_one_active_job_per_division"
# Must match the on-disk lowercase enum values (values_callable on the model).
_PARTIAL_INDEX_SQL = (
    f"CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_NAME} "
    f"ON evaluation_jobs (division) WHERE status IN ('queued', 'running')"
)


def upgrade() -> None:
    """Create evaluation_jobs and its partial unique index."""
    op.create_table(
        "evaluation_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "division",
            sa.Enum(
                "big_data",
                "cyber_security",
                "game_tech",
                "gis",
                name="division",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("period_id", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "queued",
                "running",
                "completed",
                "failed",
                name="evaluationjobstatus",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("force", sa.Boolean(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("processed", sa.Integer(), nullable=False),
        sa.Column("succeeded", sa.Integer(), nullable=False),
        sa.Column("failed", sa.Integer(), nullable=False),
        sa.Column("errors", sa.JSON(), nullable=False),
        sa.Column("triggered_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(
            ["period_id"], ["recruitment_periods.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["triggered_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("evaluation_jobs", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_evaluation_jobs_division"),
            ["division"],
            unique=False,
        )

    # Partial unique index — DB-level "one non-terminal job per division".
    # Same syntax on SQLite and PostgreSQL; the empty new table guarantees a
    # clean create on both.
    op.execute(_PARTIAL_INDEX_SQL)


def downgrade() -> None:
    """Drop the partial unique index, the division index, and the table."""
    op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
    with op.batch_alter_table("evaluation_jobs", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_evaluation_jobs_division"))
    op.drop_table("evaluation_jobs")
