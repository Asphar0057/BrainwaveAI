"""Copy the isolated demo into the local database used by localhost:3000.

Run with --apply to commit; otherwise validate the entire import and roll it back.
Paths are pinned to local SQLite files. Existing users and organizations are never
updated. Password hashes are copied, so the private demo credentials still work.
"""
import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / '.local/b2b-demo/classroom.db'
TARGET = ROOT / 'backend/brainwave_tutor.db'
TABLES = (
    'users', 'organizations', 'organization_memberships', 'academic_terms',
    'courses', 'organization_licenses', 'organization_audit', 'class_sections',
    'enrollments', 'assignments', 'announcements', 'learning_lessons',
    'learning_checkpoints', 'learning_interventions', 'submissions',
    'checkpoint_attempts', 'lesson_completions', 'submission_revisions',
    'classroom_messages',
)
USERNAMES = {f'{company}.{role}' for company in ('northstar', 'meridian')
             for role in ('owner', 'teacher', 'student', 'student2')}
SLUGS = {'northstar-b2b-demo', 'meridian-b2b-demo'}


def install(apply=False):
    source = sqlite3.connect(f'file:{SOURCE}?mode=ro', uri=True)
    source.row_factory = sqlite3.Row
    target = sqlite3.connect(f'file:{TARGET}?mode=rw', uri=True, timeout=30)
    target.row_factory = sqlite3.Row
    target.execute('PRAGMA foreign_keys=ON')
    try:
        source.execute('BEGIN')
        users = source.execute('SELECT * FROM users').fetchall()
        organizations = source.execute('SELECT * FROM organizations').fetchall()
        if {row['username'] for row in users} != USERNAMES or {row['slug'] for row in organizations} != SLUGS:
            raise RuntimeError('Source is not the expected isolated demo. Nothing imported.')
        for user in users:
            if not user['email'].endswith('@example.com'):
                raise RuntimeError('Only fictional demo accounts can be imported.')

        existing = target.execute('SELECT username, hashed_password, account_role FROM users WHERE username IN (%s)' % ','.join('?' for _ in USERNAMES), tuple(USERNAMES)).fetchall()
        if existing:
            original = {row['username']: row for row in users}
            if len(existing) == len(USERNAMES) and all(
                row['hashed_password'] == original[row['username']]['hashed_password']
                and row['account_role'] == original[row['username']]['account_role'] for row in existing
            ):
                print('All demo accounts are already installed; no changes made.')
                return
            raise RuntimeError('Demo username collision. Existing accounts were not modified.')

        if apply:
            backup = SOURCE.parent / ('development-before-import-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.db')
            with sqlite3.connect(backup) as copy:
                target.backup(copy)
            backup.chmod(0o600)
            print(f'Local backup saved: {backup.name}')

        target.execute('BEGIN IMMEDIATE')
        for user in users:
            if target.execute('SELECT 1 FROM users WHERE username=? OR email=?', (user['username'], user['email'])).fetchone():
                raise RuntimeError('Account collision. Import rolled back.')
        for org in organizations:
            if target.execute('SELECT 1 FROM organizations WHERE slug=?', (org['slug'],)).fetchone():
                raise RuntimeError('Organization collision. Import rolled back.')

        mappings, counts = {}, {}
        for table in TABLES:
            rows = source.execute(f'SELECT * FROM "{table}"').fetchall()
            if not rows:
                continue
            columns = source.execute(f'PRAGMA table_info("{table}")').fetchall()
            target_columns = {row['name'] for row in target.execute(f'PRAGMA table_info("{table}")')}
            if {row['name'] for row in columns} - target_columns:
                raise RuntimeError(f'{table}: development schema needs migration; import rolled back.')
            primary = [row['name'] for row in columns if row['pk']]
            if len(primary) != 1:
                raise RuntimeError(f'{table}: unsupported primary key; import rolled back.')
            key = primary[0]
            foreign = source.execute(f'PRAGMA foreign_key_list("{table}")').fetchall()
            mappings[table] = {}
            for row in rows:
                values = dict(row)
                if key == 'id':
                    values.pop(key)
                for reference in foreign:
                    value = values.get(reference['from'])
                    if value is not None:
                        values[reference['from']] = mappings[reference['table']][value]
                names = ','.join(f'"{name}"' for name in values)
                placeholders = ','.join('?' for _ in values)
                cursor = target.execute(f'INSERT INTO "{table}" ({names}) VALUES ({placeholders})', tuple(values.values()))
                mappings[table][row[key]] = cursor.lastrowid if key == 'id' else values[key]
            counts[table] = len(rows)
        for table, mapping in mappings.items():
            primary = next(row['name'] for row in target.execute(f'PRAGMA table_info("{table}")') if row['pk'])
            # The FK pragma checks all rows; restrict failures to imported records.
            imported_rowids = {row[0] for row in target.execute(f'SELECT rowid FROM "{table}" WHERE "{primary}" IN ({",".join("?" for _ in mapping)})', tuple(mapping.values()))}
            if any(row[1] in imported_rowids for row in target.execute(f'PRAGMA foreign_key_check("{table}")')):
                raise RuntimeError(f'{table}: invalid imported relationship; import rolled back.')
        target.commit() if apply else target.rollback()
        print(('Installed' if apply else 'Validated; rolled back') + ': ' + ', '.join(f'{count} {table}' for table, count in counts.items()))
    finally:
        target.rollback()
        target.close()
        source.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    install(parser.parse_args().apply)
