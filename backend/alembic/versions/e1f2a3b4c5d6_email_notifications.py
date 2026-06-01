"""email_notifications

Revision ID: e1f2a3b4c5d6
Revises: d4c1f2e3a6b7
Create Date: 2026-06-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d4c1f2e3a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create workflow email notification delivery log table."""
    op.create_table(
        "email_notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("notification_type", sa.String(length=80), nullable=False),
        sa.Column("to_email", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=True),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("related_application_id", sa.Integer(), nullable=True),
        sa.Column("related_audit_log_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["related_application_id"], ["applications.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["related_audit_log_id"], ["audit_logs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("email_notifications", schema=None) as batch_op:
        batch_op.create_index("ix_email_notifications_user_id", ["user_id"], unique=False)
        batch_op.create_index(
            "ix_email_notifications_notification_type",
            ["notification_type"],
            unique=False,
        )
        batch_op.create_index("ix_email_notifications_to_email", ["to_email"], unique=False)
        batch_op.create_index("ix_email_notifications_status", ["status"], unique=False)
        batch_op.create_index("ix_email_notifications_created_at", ["created_at"], unique=False)
        batch_op.create_index(
            "ix_email_notifications_related_application_id",
            ["related_application_id"],
            unique=False,
        )
        batch_op.create_index(
            "ix_email_notifications_related_audit_log_id",
            ["related_audit_log_id"],
            unique=False,
        )


def downgrade() -> None:
    """Remove workflow email notification delivery log table."""
    with op.batch_alter_table("email_notifications", schema=None) as batch_op:
        batch_op.drop_index("ix_email_notifications_related_audit_log_id")
        batch_op.drop_index("ix_email_notifications_related_application_id")
        batch_op.drop_index("ix_email_notifications_created_at")
        batch_op.drop_index("ix_email_notifications_status")
        batch_op.drop_index("ix_email_notifications_to_email")
        batch_op.drop_index("ix_email_notifications_notification_type")
        batch_op.drop_index("ix_email_notifications_user_id")
    op.drop_table("email_notifications")
