"""add last_known to flashcards

Revision ID: b1c3f9d2e845
Revises: c9a4e7b2d611
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c3f9d2e845"
down_revision: Union[str, Sequence[str], None] = "c9a4e7b2d611"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("flashcards") as batch:
        batch.add_column(sa.Column("last_known", sa.Boolean(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("flashcards") as batch:
        batch.drop_column("last_known")
