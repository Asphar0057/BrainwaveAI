"""add quiz battle game mode

Revision ID: c9a4e7b2d611
Revises: a8f3c6d1b452
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9a4e7b2d611"
down_revision: Union[str, Sequence[str], None] = "a8f3c6d1b452"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "quiz_battles",
        sa.Column("game_mode", sa.String(length=20), nullable=False, server_default="classic"),
    )
    op.add_column(
        "quiz_battles",
        sa.Column("question_quality_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("quiz_battles", "question_quality_version")
    op.drop_column("quiz_battles", "game_mode")
