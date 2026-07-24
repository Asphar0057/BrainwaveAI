"""add quiz-derived teaching style columns to comprehensive_user_profiles

Revision ID: a3d5f8e21c4b
Revises: f4c2d9a7e631
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3d5f8e21c4b"
down_revision: Union[str, Sequence[str], None] = "f4c2d9a7e631"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("comprehensive_user_profiles") as batch_op:
        batch_op.add_column(sa.Column("learning_preferences", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("derived_teaching_style", sa.String(length=50), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("comprehensive_user_profiles") as batch_op:
        batch_op.drop_column("derived_teaching_style")
        batch_op.drop_column("learning_preferences")
