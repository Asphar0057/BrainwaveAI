"""complete classroom workflow

Revision ID: f2a7c5d8e901
Revises: e7b2c9d4a6f1
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2a7c5d8e901"
down_revision: Union[str, Sequence[str], None] = "e7b2c9d4a6f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("submissions") as batch_op:
        batch_op.add_column(sa.Column("content_text", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("attachment_url", sa.String(length=500), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "attempt_number",
                sa.Integer(),
                nullable=False,
                server_default="1",
            )
        )
        batch_op.add_column(sa.Column("graded_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("graded_by", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_submissions_graded_by_users",
            "users",
            ["graded_by"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_table(
        "class_activity_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("visible_to_students", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["section_id"], ["class_sections.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_class_activity_events_id"),
        "class_activity_events",
        ["id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_class_activity_events_id"),
        table_name="class_activity_events",
    )
    op.drop_table("class_activity_events")
    with op.batch_alter_table("submissions") as batch_op:
        batch_op.drop_constraint(
            "fk_submissions_graded_by_users",
            type_="foreignkey",
        )
        batch_op.drop_column("graded_by")
        batch_op.drop_column("graded_at")
        batch_op.drop_column("attempt_number")
        batch_op.drop_column("attachment_url")
        batch_op.drop_column("content_text")
