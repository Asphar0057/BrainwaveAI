"""Check the frozen B2B upgrade/downgrade against a database with existing data."""
import os, sys, importlib.util
from pathlib import Path
os.environ['DATABASE_URL']='sqlite://'
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sqlalchemy import create_engine, inspect
from alembic.migration import MigrationContext
from alembic.operations import Operations
import models

def test_b2b_revision_keeps_existing_users_and_matches_runtime_tables():
    engine=create_engine('sqlite://')
    tables=[t for t in models.Base.metadata.sorted_tables if t.name not in {'organization_licenses','organization_invites','organization_audit','learning_lessons','lesson_completions','learning_checkpoints','checkpoint_attempts','learning_interventions','submission_revisions'}]
    models.Base.metadata.create_all(engine,tables=tables)
    file=Path(__file__).resolve().parents[1]/'alembic/versions/b2b20260911a_company_learning.py'
    spec=importlib.util.spec_from_file_location('revision',file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    with engine.begin() as conn:
        conn.execute(models.User.__table__.insert().values(username='existing',email='existing@example.com',account_role='learner',session_version=0))
        with Operations.context(MigrationContext.configure(conn)):module.upgrade()
        for name in ['organization_licenses','organization_invites','organization_audit','learning_lessons','lesson_completions','learning_checkpoints','checkpoint_attempts','learning_interventions','submission_revisions']:
            assert {c['name'] for c in inspect(conn).get_columns(name)}==set(models.Base.metadata.tables[name].columns.keys())
        with Operations.context(MigrationContext.configure(conn)):module.downgrade()
        assert conn.exec_driver_sql('select username from users').scalar()=='existing'
        assert 'learning_lessons' not in inspect(conn).get_table_names()
