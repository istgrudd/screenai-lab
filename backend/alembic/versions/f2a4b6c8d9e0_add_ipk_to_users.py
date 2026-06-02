"""add_ipk_to_users

Revision ID: f2a4b6c8d9e0
Revises: e1f2a3b4c5d6
Create Date: 2026-06-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2a4b6c8d9e0"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the optional candidate IPK column on users."""
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("ipk", sa.Float(), nullable=True))


def downgrade() -> None:
    """Drop the candidate IPK column."""
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("ipk")
