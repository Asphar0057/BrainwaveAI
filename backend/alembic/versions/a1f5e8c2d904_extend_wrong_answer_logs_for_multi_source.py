"""extend wrong_answer_logs for multi-source mistakes (solo quiz, flashcards) + explain cache

Revision ID: a1f5e8c2d904
Revises: c3d7a1e9f256
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1f5e8c2d904"
down_revision: Union[str, Sequence[str], None] = "c3d7a1e9f256"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("wrong_answer_logs") as batch_op:
        batch_op.alter_column("question_id", existing_type=sa.Integer(), nullable=True)
        batch_op.alter_column("question_set_id", existing_type=sa.Integer(), nullable=True)
        batch_op.add_column(sa.Column("source", sa.String(length=20), nullable=False, server_default="question_bank"))
        batch_op.add_column(sa.Column("solo_quiz_question_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("flashcard_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("ai_explanation", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("ai_explanation_generated_at", sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(
            "fk_wrong_answer_logs_solo_quiz_question_id",
            "solo_quiz_questions", ["solo_quiz_question_id"], ["id"],
        )
        batch_op.create_foreign_key(
            "fk_wrong_answer_logs_flashcard_id",
            "flashcards", ["flashcard_id"], ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("wrong_answer_logs") as batch_op:
        batch_op.drop_constraint("fk_wrong_answer_logs_flashcard_id", type_="foreignkey")
        batch_op.drop_constraint("fk_wrong_answer_logs_solo_quiz_question_id", type_="foreignkey")
        batch_op.drop_column("ai_explanation_generated_at")
        batch_op.drop_column("ai_explanation")
        batch_op.drop_column("flashcard_id")
        batch_op.drop_column("solo_quiz_question_id")
        batch_op.drop_column("source")
        batch_op.alter_column("question_set_id", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("question_id", existing_type=sa.Integer(), nullable=False)
