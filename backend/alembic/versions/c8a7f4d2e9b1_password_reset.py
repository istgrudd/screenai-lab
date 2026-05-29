"""password_reset

Revision ID: c8a7f4d2e9b1
Revises: b6e3d2f1a9c0
Create Date: 2026-05-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c8a7f4d2e9b1"
down_revision: Union[str, Sequence[str], None] = "b6e3d2f1a9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add password reset state and one-time reset link table."""
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("password_changed_at", sa.DateTime(), nullable=True))

    op.create_table(
        "password_reset_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("link_secret_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("sent_to_email", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("password_reset_links", schema=None) as batch_op:
        batch_op.create_index(
            "ix_password_reset_links_link_secret_hash",
            ["link_secret_hash"],
            unique=True,
        )
        batch_op.create_index(
            "ix_password_reset_links_user_id",
            ["user_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_password_reset_links_expires_at",
            ["expires_at"],
            unique=False,
        )


def downgrade() -> None:
    """Remove password reset schema."""
    with op.batch_alter_table("password_reset_links", schema=None) as batch_op:
        batch_op.drop_index("ix_password_reset_links_expires_at")
        batch_op.drop_index("ix_password_reset_links_user_id")
        batch_op.drop_index("ix_password_reset_links_link_secret_hash")
    op.drop_table("password_reset_links")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("password_changed_at")
