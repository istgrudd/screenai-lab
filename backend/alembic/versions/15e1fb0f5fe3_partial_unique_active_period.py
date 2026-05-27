"""partial_unique_active_period

Revision ID: 15e1fb0f5fe3
Revises: 0543acf1450b
Create Date: 2026-05-10 04:09:07.481530

Enforces the single-active-RecruitmentPeriod invariant at the database
level so two concurrent super-admins creating periods cannot both end
up with ``is_active = True``.

The constraint is implemented as a *partial unique index* on
``recruitment_periods (is_active) WHERE is_active = TRUE`` — it allows
unbounded inactive rows while permitting at most one active row.

PostgreSQL only. SQLite (the dev database) supports partial indexes
syntactically, but the index would be rejected because ``is_active``
already has duplicate FALSE rows; the application-level
``_deactivate_others`` guard in ``backend/routers/periods.py`` continues
to enforce the invariant during dev. The migration short-circuits to a
no-op on any non-Postgres dialect so ``alembic upgrade head`` keeps
working on SQLite.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '15e1fb0f5fe3'
down_revision: Union[str, Sequence[str], None] = '0543acf1450b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEX_NAME = "uq_one_active_period"


def upgrade() -> None:
    """Add the partial unique index on PostgreSQL; no-op elsewhere."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_NAME} "
        f"ON recruitment_periods (is_active) WHERE is_active = true"
    )


def downgrade() -> None:
    """Drop the partial unique index on PostgreSQL; no-op elsewhere."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
