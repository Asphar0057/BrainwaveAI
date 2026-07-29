"""add institution workspaces and account roles

Revision ID: e7b2c9d4a6f1
Revises: c4e8f1a9d3b7
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7b2c9d4a6f1"
down_revision: Union[str, Sequence[str], None] = "c4e8f1a9d3b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column(
                "account_role",
                sa.String(length=20),
                nullable=False,
                server_default="learner",
            )
        )
        batch_op.create_index(
            batch_op.f("ix_users_account_role"), ["account_role"], unique=False
        )

    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("institution_type", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_organizations_id"), "organizations", ["id"], unique=False)
    op.create_index(
        op.f("ix_organizations_slug"), "organizations", ["slug"], unique=True
    )

    op.create_table(
        "academic_terms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "name",
            name="uq_academic_term_organization_name",
        ),
    )
    op.create_index(
        op.f("ix_academic_terms_id"), "academic_terms", ["id"], unique=False
    )

    op.create_table(
        "organization_memberships",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "user_id",
            name="uq_organization_membership_user",
        ),
    )
    op.create_index(
        op.f("ix_organization_memberships_id"),
        "organization_memberships",
        ["id"],
        unique=False,
    )

    op.create_table(
        "courses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("department", sa.String(length=100), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id", "code", name="uq_course_organization_code"
        ),
    )
    op.create_index(op.f("ix_courses_id"), "courses", ["id"], unique=False)

    op.create_table(
        "class_sections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("academic_term_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("schedule_text", sa.String(length=120), nullable=True),
        sa.Column("room", sa.String(length=80), nullable=True),
        sa.Column("instructor_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(
            ["academic_term_id"], ["academic_terms.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["instructor_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_class_sections_id"), "class_sections", ["id"], unique=False
    )

    op.create_table(
        "course_materials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("material_type", sa.String(length=30), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_course_materials_id"), "course_materials", ["id"], unique=False
    )

    op.create_table(
        "enrollments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("progress_percent", sa.Integer(), nullable=False),
        sa.Column("mastery_percent", sa.Integer(), nullable=False),
        sa.Column("last_active_at", sa.DateTime(), nullable=True),
        sa.Column("enrolled_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["section_id"], ["class_sections.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "section_id", "student_id", name="uq_enrollment_student"
        ),
    )
    op.create_index(
        op.f("ix_enrollments_id"), "enrollments", ["id"], unique=False
    )

    op.create_table(
        "assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("assignment_type", sa.String(length=30), nullable=False),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        sa.Column("points_possible", sa.Float(), nullable=False),
        sa.Column("estimated_minutes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("ai_policy", sa.String(length=40), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["section_id"], ["class_sections.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_assignments_id"), "assignments", ["id"], unique=False
    )

    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["section_id"], ["class_sections.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_announcements_id"), "announcements", ["id"], unique=False
    )

    op.create_table(
        "submissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("assignment_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["assignment_id"], ["assignments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "assignment_id",
            "student_id",
            name="uq_submission_assignment_student",
        ),
    )
    op.create_index(
        op.f("ix_submissions_id"), "submissions", ["id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_submissions_id"), table_name="submissions")
    op.drop_table("submissions")
    op.drop_index(op.f("ix_announcements_id"), table_name="announcements")
    op.drop_table("announcements")
    op.drop_index(op.f("ix_assignments_id"), table_name="assignments")
    op.drop_table("assignments")
    op.drop_index(op.f("ix_enrollments_id"), table_name="enrollments")
    op.drop_table("enrollments")
    op.drop_index(op.f("ix_course_materials_id"), table_name="course_materials")
    op.drop_table("course_materials")
    op.drop_index(op.f("ix_class_sections_id"), table_name="class_sections")
    op.drop_table("class_sections")
    op.drop_index(op.f("ix_courses_id"), table_name="courses")
    op.drop_table("courses")
    op.drop_index(
        op.f("ix_organization_memberships_id"),
        table_name="organization_memberships",
    )
    op.drop_table("organization_memberships")
    op.drop_index(op.f("ix_academic_terms_id"), table_name="academic_terms")
    op.drop_table("academic_terms")
    op.drop_index(op.f("ix_organizations_slug"), table_name="organizations")
    op.drop_index(op.f("ix_organizations_id"), table_name="organizations")
    op.drop_table("organizations")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_account_role"))
        batch_op.drop_column("account_role")
