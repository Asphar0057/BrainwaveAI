"""Immutable sessions, answer reports, practice delivery and billing/product events."""
from alembic import op
import sqlalchemy as sa

revision = "a9f1e8c2b603"
down_revision = "d1e5a9c73f28"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("chat_messages", sa.Column("source_metadata", sa.JSON(), nullable=True))
    # Tables use the same declarations as runtime; keep this revision's schema frozen here.
    op.create_table("product_events",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("event_key", sa.String(120), nullable=False, unique=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("visitor_id", sa.String(36)), sa.Column("name", sa.String(50), nullable=False),
        sa.Column("origin", sa.String(12), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    for col in ("user_id", "visitor_id", "name", "created_at"):
        op.create_index("ix_product_events_" + col, "product_events", [col])
    op.create_table("answer_reports",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource_type", sa.String(30), nullable=False), sa.Column("resource_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False), sa.Column("detail", sa.Text(), nullable=False), sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False), sa.Column("resolution", sa.Text()),
        sa.Column("resolved_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("resolved_at", sa.DateTime()),
        sa.UniqueConstraint("user_id", "resource_type", "resource_id", name="uq_answer_report_owner_resource"))
    op.create_index("ix_answer_reports_user_id", "answer_reports", ["user_id"])
    op.create_table("practice_deliveries", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("practice_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("generated_questions.id"), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False), sa.Column("answered_at", sa.DateTime()),
        sa.UniqueConstraint("session_id", "ordinal", name="uq_practice_delivery_ordinal"))
    op.create_index("ix_practice_deliveries_session_id", "practice_deliveries", ["session_id"])
    op.create_table("billing_events", sa.Column("event_id", sa.String(120), primary_key=True),
        sa.Column("event_type", sa.String(80), nullable=False), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("provider_created", sa.Integer(), nullable=False), sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(12)), sa.Column("processed_at", sa.DateTime(), nullable=False))
    op.create_index("ix_billing_events_user_id", "billing_events", ["user_id"])


def downgrade():
    for table in ("billing_events", "practice_deliveries", "answer_reports", "product_events"):
        op.drop_table(table)
    op.drop_column("chat_messages", "source_metadata")
    op.drop_column("users", "session_version")
