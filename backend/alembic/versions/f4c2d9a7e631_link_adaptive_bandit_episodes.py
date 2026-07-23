"""link adaptive bandit episodes to generated learning content

Revision ID: f4c2d9a7e631
Revises: e1a2b3c4d5f6
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4c2d9a7e631"
down_revision: Union[str, Sequence[str], None] = "e1a2b3c4d5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("question_sets") as batch_op:
        batch_op.add_column(sa.Column("bandit_episode_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("bandit_topic_key", sa.String(length=50), nullable=True))
        batch_op.create_index("ix_question_sets_bandit_episode_id", ["bandit_episode_id"], unique=False)

    with op.batch_alter_table("flashcard_sets") as batch_op:
        batch_op.add_column(sa.Column("bandit_episode_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("bandit_topic_key", sa.String(length=50), nullable=True))
        batch_op.create_index("ix_flashcard_sets_bandit_episode_id", ["bandit_episode_id"], unique=False)

    with op.batch_alter_table("solo_quizzes") as batch_op:
        batch_op.add_column(sa.Column("bandit_episode_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("bandit_topic_key", sa.String(length=50), nullable=True))
        batch_op.create_index("ix_solo_quizzes_bandit_episode_id", ["bandit_episode_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("solo_quizzes") as batch_op:
        batch_op.drop_index("ix_solo_quizzes_bandit_episode_id")
        batch_op.drop_column("bandit_topic_key")
        batch_op.drop_column("bandit_episode_id")

    with op.batch_alter_table("flashcard_sets") as batch_op:
        batch_op.drop_index("ix_flashcard_sets_bandit_episode_id")
        batch_op.drop_column("bandit_topic_key")
        batch_op.drop_column("bandit_episode_id")

    with op.batch_alter_table("question_sets") as batch_op:
        batch_op.drop_index("ix_question_sets_bandit_episode_id")
        batch_op.drop_column("bandit_topic_key")
        batch_op.drop_column("bandit_episode_id")
