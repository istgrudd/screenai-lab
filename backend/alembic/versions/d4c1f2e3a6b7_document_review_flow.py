"""document_review_flow

Revision ID: d4c1f2e3a6b7
Revises: c8a7f4d2e9b1
Create Date: 2026-05-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4c1f2e3a6b7"
down_revision: Union[str, Sequence[str], None] = "c8a7f4d2e9b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add explicit document review fields."""
    with op.batch_alter_table("documents", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "verification_status",
                sa.String(length=20),
                nullable=False,
                server_default="pending",
            )
        )
        batch_op.add_column(sa.Column("rejection_reason", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("reviewed_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("reviewed_by_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_documents_reviewed_by_id_users",
            "users",
            ["reviewed_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_documents_reviewed_by_id",
            ["reviewed_by_id"],
            unique=False,
        )

    documents = sa.table(
        "documents",
        sa.column("is_verified", sa.Boolean()),
        sa.column("verification_status", sa.String(length=20)),
    )
    conn = op.get_bind()
    conn.execute(
        documents.update()
        .where(documents.c.is_verified == sa.true())
        .values(verification_status="verified")
    )
    conn.execute(
        documents.update()
        .where(documents.c.is_verified == sa.false())
        .values(verification_status="pending")
    )


def downgrade() -> None:
    """Remove explicit document review fields."""
    with op.batch_alter_table("documents", schema=None) as batch_op:
        batch_op.drop_index("ix_documents_reviewed_by_id")
        batch_op.drop_constraint(
            "fk_documents_reviewed_by_id_users",
            type_="foreignkey",
        )
        batch_op.drop_column("reviewed_by_id")
        batch_op.drop_column("reviewed_at")
        batch_op.drop_column("rejection_reason")
        batch_op.drop_column("verification_status")
