"""add baseline_strategy_id to bandit_episode_log for bandit-vs-rule efficacy tracking

Revision ID: b7e19a4f6d02
Revises: a3d5f8e21c4b
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7e19a4f6d02"
down_revision: Union[str, Sequence[str], None] = "a3d5f8e21c4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("bandit_episode_log") as batch_op:
        batch_op.add_column(sa.Column("baseline_strategy_id", sa.String(length=32), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("bandit_episode_log") as batch_op:
        batch_op.drop_column("baseline_strategy_id")
