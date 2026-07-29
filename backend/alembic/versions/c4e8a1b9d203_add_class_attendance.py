"""add class attendance

Revision ID: c4e8a1b9d203
Revises: f2a7c5d8e901
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4e8a1b9d203"
down_revision: Union[str, Sequence[str], None] = "f2a7c5d8e901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "attendance_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("class_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.Column("marked_by", sa.Integer(), nullable=True),
        sa.Column("marked_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["marked_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["section_id"], ["class_sections.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["student_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "section_id",
            "student_id",
            "class_date",
            name="uq_attendance_section_student_date",
        ),
    )
    op.create_index(
        op.f("ix_attendance_records_id"),
        "attendance_records",
        ["id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_attendance_records_id"),
        table_name="attendance_records",
    )
    op.drop_table("attendance_records")
