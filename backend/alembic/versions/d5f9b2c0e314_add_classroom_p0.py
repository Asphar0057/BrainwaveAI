"""add classroom p0

Revision ID: d5f9b2c0e314
Revises: c4e8a1b9d203
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5f9b2c0e314"
down_revision: Union[str, Sequence[str], None] = "c4e8a1b9d203"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("assignments") as batch:
        batch.add_column(sa.Column("rubric_text", sa.Text(), nullable=True))
        batch.add_column(sa.Column("weight_percent", sa.Float(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("start_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("allow_resubmission", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"))
    with op.batch_alter_table("submissions") as batch:
        batch.add_column(sa.Column("attachment_storage_path", sa.String(500), nullable=True))
        batch.add_column(sa.Column("attachment_name", sa.String(255), nullable=True))
        batch.add_column(sa.Column("attachment_content_type", sa.String(120), nullable=True))
        batch.add_column(sa.Column("attachment_size", sa.Integer(), nullable=True))
    with op.batch_alter_table("course_materials") as batch:
        batch.add_column(sa.Column("storage_path", sa.String(500), nullable=True))
        batch.add_column(sa.Column("original_filename", sa.String(255), nullable=True))
        batch.add_column(sa.Column("content_type", sa.String(120), nullable=True))
        batch.add_column(sa.Column("file_size", sa.Integer(), nullable=True))
    op.create_table(
        "classroom_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("recipient_id", sa.Integer(), nullable=False),
        sa.Column("assignment_id", sa.Integer(), nullable=True),
        sa.Column("subject", sa.String(180), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["section_id"], ["class_sections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_classroom_messages_id"), "classroom_messages", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_classroom_messages_id"), table_name="classroom_messages")
    op.drop_table("classroom_messages")
    with op.batch_alter_table("course_materials") as batch:
        batch.drop_column("file_size")
        batch.drop_column("content_type")
        batch.drop_column("original_filename")
        batch.drop_column("storage_path")
    with op.batch_alter_table("submissions") as batch:
        batch.drop_column("attachment_size")
        batch.drop_column("attachment_content_type")
        batch.drop_column("attachment_name")
        batch.drop_column("attachment_storage_path")
    with op.batch_alter_table("assignments") as batch:
        batch.drop_column("max_attempts")
        batch.drop_column("allow_resubmission")
        batch.drop_column("start_at")
        batch.drop_column("weight_percent")
        batch.drop_column("rubric_text")
