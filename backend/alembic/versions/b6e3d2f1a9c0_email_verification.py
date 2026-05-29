"""email_verification

Revision ID: b6e3d2f1a9c0
Revises: 15e1fb0f5fe3
Create Date: 2026-05-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b6e3d2f1a9c0"
down_revision: Union[str, Sequence[str], None] = "15e1fb0f5fe3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add candidate email verification state and link table."""
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("email_verified_at", sa.DateTime(), nullable=True))
        batch_op.add_column(
            sa.Column("email_verification_sent_at", sa.DateTime(), nullable=True)
        )

    # Existing accounts predate the Phase 3 verification requirement, so mark
    # them verified during migration to avoid locking out recruiters/admins and
    # already-registered candidates.
    op.execute(
        sa.text(
            "UPDATE users "
            "SET email_verified_at = CURRENT_TIMESTAMP "
            "WHERE email_verified_at IS NULL"
        )
    )

    op.create_table(
        "email_verification_links",
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
    with op.batch_alter_table("email_verification_links", schema=None) as batch_op:
        batch_op.create_index(
            "ix_email_verification_links_link_secret_hash",
            ["link_secret_hash"],
            unique=True,
        )
        batch_op.create_index(
            "ix_email_verification_links_user_id",
            ["user_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_email_verification_links_expires_at",
            ["expires_at"],
            unique=False,
        )


def downgrade() -> None:
    """Remove candidate email verification schema."""
    with op.batch_alter_table("email_verification_links", schema=None) as batch_op:
        batch_op.drop_index("ix_email_verification_links_expires_at")
        batch_op.drop_index("ix_email_verification_links_user_id")
        batch_op.drop_index("ix_email_verification_links_link_secret_hash")
    op.drop_table("email_verification_links")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("email_verification_sent_at")
        batch_op.drop_column("email_verified_at")
