"""add quiz battle instructions

Revision ID: d1e5a9c73f28
Revises: b3c7f1a92e58
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e5a9c73f28"
down_revision: Union[str, Sequence[str], None] = "b3c7f1a92e58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "quiz_battles",
        sa.Column("instructions", sa.String(length=300), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("quiz_battles", "instructions")
