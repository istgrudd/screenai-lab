"""add cancellation to evaluation_jobs (cancel_requested + cancelling/cancelled)

Revision ID: b3c5e7d9f1a2
Revises: a2f4d6b8c0e1
Create Date: 2026-06-19 00:00:00.000000

Phase 3 W2 — cooperative job cancellation. Adds:

  * ``cancel_requested`` BOOLEAN NOT NULL DEFAULT false — set by the cancel
    endpoint, polled by the runner between candidates.
  * the ``cancelling`` (non-terminal) and ``cancelled`` (terminal) statuses.

The ``status`` column is a plain ``VARCHAR(20)`` (the model's ``Enum`` uses
``native_enum=False`` and SQLAlchemy 1.4+ defaults ``create_constraint=False``,
so there is **no** CHECK constraint to widen) — the new status *values* need no
column DDL. Only the partial unique index predicate changes: ``cancelling`` is
non-terminal and must keep holding the division's slot, so it joins
``queued``/``running`` in the index's ``WHERE`` clause. The slot is freed only
when the job reaches the terminal ``cancelled`` state.

Same ``CREATE UNIQUE INDEX … WHERE`` syntax on SQLite (dev/test) and
PostgreSQL; the literals match the on-disk lowercase enum values.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3c5e7d9f1a2"
down_revision: Union[str, Sequence[str], None] = "a2f4d6b8c0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEX_NAME = "uq_one_active_job_per_division"
_OLD_PREDICATE = "status IN ('queued', 'running')"
_NEW_PREDICATE = "status IN ('queued', 'running', 'cancelling')"


def _recreate_index(predicate: str) -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
    op.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_NAME} "
        f"ON evaluation_jobs (division) WHERE {predicate}"
    )


def upgrade() -> None:
    """Add cancel_requested and widen the non-terminal index predicate."""
    op.add_column(
        "evaluation_jobs",
        sa.Column(
            "cancel_requested",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    _recreate_index(_NEW_PREDICATE)


def downgrade() -> None:
    """Restore the queued/running-only predicate and drop cancel_requested."""
    _recreate_index(_OLD_PREDICATE)
    with op.batch_alter_table("evaluation_jobs", schema=None) as batch_op:
        batch_op.drop_column("cancel_requested")
