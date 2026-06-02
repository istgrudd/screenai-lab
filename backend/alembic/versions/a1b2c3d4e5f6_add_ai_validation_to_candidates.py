"""add_ai_validation_to_candidates

Revision ID: a1b2c3d4e5f6
Revises: f2a4b6c8d9e0
Create Date: 2026-06-02 00:00:00.000000

Adds the recruiter "Validasi Evaluasi AI" marker columns to candidates.
This is an informative checkpoint only — it does not change scores,
application status, or announcement eligibility.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f2a4b6c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add AI-evaluation validation marker columns to candidates."""
    with op.batch_alter_table("candidates", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "ai_validation_status",
                sa.String(length=20),
                nullable=False,
                server_default="pending",
            )
        )
        batch_op.add_column(
            sa.Column("ai_validated_by_id", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("ai_validated_at", sa.DateTime(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("ai_validation_note", sa.Text(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_candidates_ai_validated_by_id_users",
            "users",
            ["ai_validated_by_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    """Drop the AI-evaluation validation marker columns."""
    with op.batch_alter_table("candidates", schema=None) as batch_op:
        batch_op.drop_constraint(
            "fk_candidates_ai_validated_by_id_users", type_="foreignkey"
        )
        batch_op.drop_column("ai_validation_note")
        batch_op.drop_column("ai_validated_at")
        batch_op.drop_column("ai_validated_by_id")
        batch_op.drop_column("ai_validation_status")
