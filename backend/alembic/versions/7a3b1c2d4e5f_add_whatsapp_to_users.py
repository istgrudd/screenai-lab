"""add_whatsapp_to_users

Revision ID: 7a3b1c2d4e5f
Revises: 554e0ad3f931
Create Date: 2026-04-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a3b1c2d4e5f'
down_revision: Union[str, Sequence[str], None] = '554e0ad3f931'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the optional whatsapp contact column on users.

    Nullable because existing accounts (recruiters, super_admins, and any
    candidate registered before Task 13.4) won't have one. The candidate
    ProfilePage form lets users fill it in post-hoc.
    """
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('whatsapp', sa.String(length=32), nullable=True))


def downgrade() -> None:
    """Drop the whatsapp column."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('whatsapp')
