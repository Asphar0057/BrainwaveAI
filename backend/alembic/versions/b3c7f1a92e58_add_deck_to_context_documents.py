"""add deck membership to context_documents

Revision ID: b3c7f1a92e58
Revises: a1f5e8c2d904
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3c7f1a92e58"
down_revision: Union[str, Sequence[str], None] = "a1f5e8c2d904"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("context_documents") as batch_op:
        batch_op.add_column(sa.Column("in_deck", sa.Boolean(), nullable=False, server_default="false"))
        batch_op.add_column(sa.Column("deck_added_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("context_documents") as batch_op:
        batch_op.drop_column("deck_added_at")
        batch_op.drop_column("in_deck")
