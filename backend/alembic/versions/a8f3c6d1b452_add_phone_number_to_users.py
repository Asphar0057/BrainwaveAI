"""add phone_number to users

Revision ID: a8f3c6d1b452
Revises: e6a1c3d5f702
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8f3c6d1b452"
down_revision: Union[str, Sequence[str], None] = "e6a1c3d5f702"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("phone_number", sa.String(length=32), nullable=True))
        batch.create_index("ix_users_phone_number", ["phone_number"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_phone_number")
        batch.drop_column("phone_number")
