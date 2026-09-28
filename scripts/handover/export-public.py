#!/usr/bin/env python3
"""Export public development data; never copy authentication or private workspace rows.
Uses the existing PostgreSQL container. No source HTTP and no database writes.
The optional checkout lock serializes the snapshot with deployment/publication.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess

PUBLIC_APP = {'document_blobs', 'document_notices', 'procurement_documents',
              'document_pages', 'monitoring_refreshes'}
PUBLIC_SCHEMAS = {'public', 'core', 'marts', 'raw', 'reference', 'drizzle', 'app', 'auth'}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--container', required=True)
    p.add_argument('--database', default='seap')
    p.add_argument('--user', default='seap')
    p.add_argument('--output', required=True)
    p.add_argument('--source-label', required=True)
    p.add_argument('--checkout', help='Acquire .git/deploy.lock; required for production')
    p.add_argument('--schema-only', action='store_true', help='Small restore rehearsal, no public rows')
    a = p.parse_args()
    os.umask(0o077)
    lock = None
    if 'cinecastiga' in a.container and not a.checkout:
        p.error('Production export requires --checkout for the publication/deploy lock')
    if a.checkout:
        lock = open(Path(a.checkout) / '.git/deploy.lock', 'a')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    out = Path(a.output).resolve()
    out.mkdir(parents=True, exist_ok=False)
    base = ['docker', 'exec', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', a.container]
    def query(sql):
        return subprocess.check_output(base + ['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
               '-U', a.user, '-d', a.database, '-c', sql], text=True).strip()
    schemas = set(query("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1").splitlines())
    unknown = schemas - PUBLIC_SCHEMAS - {'graphile_worker'}
    if any(not s.startswith('repair_') for s in unknown):
        raise RuntimeError('Unreviewed schemas; export refused: ' + ', '.join(sorted(unknown)))
    if query('SELECT count(*) FROM pg_largeobject_metadata') != '0':
        raise RuntimeError('Unreviewed PostgreSQL large objects; export refused')
    if query('SELECT maintenance FROM app.collection_control WHERE id=1') != 'f':
        raise RuntimeError('No confirmed non-maintenance state; export refused')
    if query("SELECT count(*) FROM app.monitoring_refreshes WHERE status='running'") != '0':
        raise RuntimeError('An analytical publication is running; export refused')
    tables = json.loads(query("SELECT json_agg(x) FROM (SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind IN ('r','p','m') ORDER BY 2) x"))
    if any(t['kind'] != 'r' for t in tables):
        raise RuntimeError('Unreviewed partition/materialized relation in app; export refused')
    if not PUBLIC_APP.issubset({t['name'] for t in tables}):
        raise RuntimeError('Expected public document/provenance tables missing')
    excluded = ['auth.*'] + ['app.' + t['name'] for t in tables if t['name'] not in PUBLIC_APP]
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    manifest = {'format_version': 1, 'source_label': a.source_label, 'started_at': started,
      'schema_only': a.schema_only, 'included_app_data': sorted('app.' + t for t in PUBLIC_APP),
      'excluded_table_data': excluded, 'excluded_schemas': sorted(schemas - PUBLIC_SCHEMAS),
      'database_bytes_before_export': int(query('SELECT pg_database_size(current_database())')),
      'server_version': query('SHOW server_version'),
      'migration_count': int(query('SELECT count(*) FROM drizzle.__drizzle_migrations')),
      'publication': json.loads(query("SELECT coalesce(json_agg(x),'[]') FROM (SELECT id,version,kind,status,completed_at FROM app.monitoring_refreshes WHERE status='ready' ORDER BY version DESC LIMIT 1) x")),
      'notes': ['Public records may contain publicly published personal names/contact data.',
                'No private users/cases/jobs/control rows; public PDF bytes and provenance retained.',
                'Raw rows collected after the last publication can exist; collection completeness is not asserted.',
                'Snapshot is pg_dump consistent; manifest observations precede the dump snapshot.']}
    if a.checkout:
        manifest['source_commit'] = subprocess.check_output(['git', '-C', a.checkout, 'rev-parse', 'HEAD'], text=True).strip()
    (out / 'manifest.partial.json').write_text(json.dumps(manifest, indent=2) + '\n')
    cmd = base + ['pg_dump', '-U', a.user, '-d', a.database, '-Fc', '-Z', '3',
                   '--no-owner', '--no-privileges', '--no-blobs', '--lock-wait-timeout=10s',
                   '--exclude-schema=graphile_worker', '--exclude-schema=repair_*']
    cmd += ['--exclude-table-data=' + table for table in excluded]
    if a.schema_only:
        cmd += ['--schema-only']
    print('Export started: ' + str(out), flush=True)
    with (out / 'database.dump.partial').open('xb') as target, (out / 'export.log').open('x') as log:
        subprocess.run(cmd, stdout=target, stderr=log, check=True)
    archive = out / 'database.dump'
    (out / 'database.dump.partial').rename(archive)
    # Reading the archive catalogue, not source DB, proves exclusions at TABLE DATA level.
    with archive.open('rb') as source:
        toc = subprocess.check_output(['docker', 'exec', '-i', a.container, 'pg_restore', '--list'], stdin=source, text=True)
    for line in toc.splitlines():
        if ' TABLE DATA auth ' in line:
            raise RuntimeError('Unexpected authentication data in archive')
        if ' TABLE DATA app ' in line:
            name = line.split(' TABLE DATA app ', 1)[1].split()[0]
            if name not in PUBLIC_APP:
                raise RuntimeError('Unexpected private app table: ' + name)
    (out / 'archive.list').write_text(toc)
    digest = hashlib.sha256()
    with archive.open('rb') as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b''):
            digest.update(block)
    manifest.update(completed_at=dt.datetime.now(dt.timezone.utc).isoformat(),
                    archive_bytes=archive.stat().st_size, sha256=digest.hexdigest(),
                    validation='Archive catalogue checked; full restore validation is separate')
    (out / 'SHA256SUMS').write_text(digest.hexdigest() + '  database.dump\n')
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (out / 'manifest.partial.json').unlink()
    print(json.dumps({'completed': True, 'bytes': manifest['archive_bytes'], 'sha256': manifest['sha256']}), flush=True)
    if lock:
        lock.close()

if __name__ == '__main__':
    main()
