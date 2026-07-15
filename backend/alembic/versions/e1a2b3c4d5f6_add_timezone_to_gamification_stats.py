"""add timezone_name to user_gamification_stats

Revision ID: e1a2b3c4d5f6
Revises: c7d8e9f0a1b2
Create Date: 2026-07-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1a2b3c4d5f6'
down_revision: Union[str, Sequence[str], None] = 'c7d8e9f0a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'user_gamification_stats' not in existing_tables:
        return

    existing_columns = {c["name"] for c in inspector.get_columns('user_gamification_stats')}
    if 'timezone_name' not in existing_columns:
        with op.batch_alter_table('user_gamification_stats', schema=None) as batch_op:
            batch_op.add_column(sa.Column('timezone_name', sa.String(length=64), nullable=True, server_default='UTC'))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if 'user_gamification_stats' not in existing_tables:
        return
    existing_columns = {c["name"] for c in inspector.get_columns('user_gamification_stats')}
    if 'timezone_name' in existing_columns:
        with op.batch_alter_table('user_gamification_stats', schema=None) as batch_op:
            batch_op.drop_column('timezone_name')
