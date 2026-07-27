"""add dkt_artifacts table for DB-backed DKT model/vocab persistence

Revision ID: c4e8f1a9d3b7
Revises: b7e19a4f6d02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4e8f1a9d3b7"
down_revision: Union[str, Sequence[str], None] = "b7e19a4f6d02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dkt_artifacts",
        sa.Column("name", sa.String(length=64), primary_key=True),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("dkt_artifacts")
