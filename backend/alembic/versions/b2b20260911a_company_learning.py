"""Company workspaces and approved classroom learning. Frozen schema."""
from alembic import op
import sqlalchemy as sa

revision = "b2b20260911a"
down_revision = "a9f1e8c2b603"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('organization_licenses',
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), primary_key=True, nullable=False),
        sa.Column('seat_limit', sa.Integer(), nullable=False),
        sa.Column('plan', sa.String(length=30), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
    )
    op.create_table('organization_invites',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('section_id', sa.Integer(), sa.ForeignKey('class_sections.id', ondelete='CASCADE'), nullable=True),
        sa.Column('email', sa.String(length=100), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False, unique=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete=None), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_organization_invites_organization_id', 'organization_invites', ['organization_id'])
    op.create_table('organization_audit',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.String(length=80), nullable=False),
        sa.Column('detail', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_organization_audit_organization_id', 'organization_audit', ['organization_id'])
    op.create_table('learning_lessons',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('section_id', sa.Integer(), sa.ForeignKey('class_sections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=180), nullable=False),
        sa.Column('objective', sa.String(length=500), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('source_url', sa.String(length=500), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('minutes', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete=None), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_learning_lessons_section_id', 'learning_lessons', ['section_id'])
    op.create_table('lesson_completions',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('lesson_id', sa.Integer(), sa.ForeignKey('learning_lessons.id', ondelete='CASCADE'), nullable=False),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('confidence', sa.Integer(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('lesson_id', 'student_id', name='uq_lesson_completion'),
    )
    op.create_table('learning_checkpoints',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('section_id', sa.Integer(), sa.ForeignKey('class_sections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=180), nullable=False),
        sa.Column('concept', sa.String(length=120), nullable=False),
        sa.Column('questions', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('approved_by', sa.Integer(), sa.ForeignKey('users.id', ondelete=None), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete=None), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_learning_checkpoints_section_id', 'learning_checkpoints', ['section_id'])
    op.create_table('checkpoint_attempts',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('checkpoint_id', sa.Integer(), sa.ForeignKey('learning_checkpoints.id', ondelete='CASCADE'), nullable=False),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('answers', sa.JSON(), nullable=False),
        sa.Column('confidence', sa.JSON(), nullable=False),
        sa.Column('results', sa.JSON(), nullable=False),
        sa.Column('score_percent', sa.Float(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('checkpoint_id', 'student_id', name='uq_checkpoint_student'),
    )
    op.create_table('learning_interventions',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('section_id', sa.Integer(), sa.ForeignKey('class_sections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id', ondelete=None), nullable=False),
        sa.Column('title', sa.String(length=180), nullable=False),
        sa.Column('instructions', sa.Text(), nullable=False),
        sa.Column('evidence', sa.JSON(), nullable=False),
        sa.Column('due_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('student_response', sa.Text(), nullable=True),
        sa.Column('review', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_learning_interventions_section_id', 'learning_interventions', ['section_id'])
    op.create_table('submission_revisions',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('submission_id', sa.Integer(), sa.ForeignKey('submissions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('attempt_number', sa.Integer(), nullable=False),
        sa.Column('event', sa.String(length=20), nullable=False),
        sa.Column('snapshot', sa.JSON(), nullable=False),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete=None), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_submission_revisions_submission_id', 'submission_revisions', ['submission_id'])


def downgrade():
    op.drop_table('submission_revisions')
    op.drop_table('learning_interventions')
    op.drop_table('checkpoint_attempts')
    op.drop_table('learning_checkpoints')
    op.drop_table('lesson_completions')
    op.drop_table('learning_lessons')
    op.drop_table('organization_audit')
    op.drop_table('organization_invites')
    op.drop_table('organization_licenses')
