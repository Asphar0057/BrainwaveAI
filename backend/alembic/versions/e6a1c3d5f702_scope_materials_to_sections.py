"""scope materials to class sections

Revision ID: e6a1c3d5f702
Revises: d5f9b2c0e314
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6a1c3d5f702"
down_revision: Union[str, Sequence[str], None] = "d5f9b2c0e314"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("course_materials") as batch:
        batch.add_column(sa.Column("section_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_course_materials_section_id",
            "class_sections",
            ["section_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.create_index("ix_course_materials_section_id", ["section_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("course_materials") as batch:
        batch.drop_index("ix_course_materials_section_id")
        batch.drop_constraint("fk_course_materials_section_id", type_="foreignkey")
        batch.drop_column("section_id")
