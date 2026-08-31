"""add wrong_options to flashcards

Revision ID: c3d7a1e9f256
Revises: b1c3f9d2e845
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d7a1e9f256"
down_revision: Union[str, Sequence[str], None] = "b1c3f9d2e845"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("flashcards") as batch:
        batch.add_column(sa.Column("wrong_options", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("flashcards") as batch:
        batch.drop_column("wrong_options")
