"""add_phase_dates_to_recruitment_periods

Revision ID: 554e0ad3f931
Revises: 9ce1c5537331
Create Date: 2026-04-26 22:49:13.134950

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '554e0ad3f931'
down_revision: Union[str, Sequence[str], None] = '9ce1c5537331'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add submission_end_date and evaluation_end_date to recruitment_periods.

    Both columns are nullable so existing periods (created before Task 13.1)
    keep working — ``get_current_phase`` collapses missing boundaries onto
    ``end_date``, treating legacy periods as one continuous SUBMISSION
    window followed by CLOSED.
    """
    with op.batch_alter_table('recruitment_periods', schema=None) as batch_op:
        batch_op.add_column(sa.Column('submission_end_date', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('evaluation_end_date', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Drop the phase-boundary columns."""
    with op.batch_alter_table('recruitment_periods', schema=None) as batch_op:
        batch_op.drop_column('evaluation_end_date')
        batch_op.drop_column('submission_end_date')
