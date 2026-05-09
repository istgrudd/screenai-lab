"""rubric_division_enum

Revision ID: 0543acf1450b
Revises: 7a3b1c2d4e5f
Create Date: 2026-05-10 03:50:59.335993

Task 14.2 — tighten ``rubrics.division`` from a free-form ``VARCHAR(20)``
to an Enum-validated column. Because the ORM already declares
``Enum(Division, native_enum=False, length=20)`` (no native PG enum, no
column-type change), SQLAlchemy handles enforcement on the application
side. To also guard direct SQL writes, this migration adds a CHECK
constraint that limits the column to the four allowed division values
(plus NULL for legacy Capstone rubrics).

Existing rows already store the lowercase value strings ('big_data',
'cyber_security', 'game_tech', 'gis'), so no data migration is required.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0543acf1450b'
down_revision: Union[str, Sequence[str], None] = '7a3b1c2d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_CHECK_NAME = "ck_rubrics_division_enum"
_ALLOWED = "('big_data', 'cyber_security', 'game_tech', 'gis')"


def upgrade() -> None:
    """Add CHECK constraint enforcing the Division enum at the DB level."""
    with op.batch_alter_table("rubrics", schema=None) as batch_op:
        batch_op.create_check_constraint(
            _CHECK_NAME,
            f"division IS NULL OR division IN {_ALLOWED}",
        )


def downgrade() -> None:
    """Drop the CHECK constraint."""
    with op.batch_alter_table("rubrics", schema=None) as batch_op:
        batch_op.drop_constraint(_CHECK_NAME, type_="check")
