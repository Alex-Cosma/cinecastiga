#!/usr/bin/env python3
"""Restore a trusted handover into a NEW local Docker database, never an existing DB."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

PUBLIC_APP = {'document_blobs', 'document_notices', 'procurement_documents',
              'document_pages', 'monitoring_refreshes'}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bundle', required=True)
    p.add_argument('--database', default='seap_collab')
    p.add_argument('--container', default='seap-postgres-1')
    p.add_argument('--jobs', type=int, default=2)
    a = p.parse_args()
    if not re.fullmatch(r'(seap_collab(?:_[a-z0-9_]+)?|seap_test_transfer_[a-z0-9_]+)', a.database):
        p.error('Target must be seap_collab[_suffix] or seap_test_transfer_*; never seap')
    if not 1 <= a.jobs <= 4:
        p.error('Restore jobs must be 1..4')
    if os.environ.get('DOCKER_HOST') or os.environ.get('DOCKER_CONTEXT'):
        p.error('Unset Docker endpoint overrides; select a local Docker context explicitly')
    context = json.loads(subprocess.check_output(['docker', 'context', 'inspect'], text=True))[0]
    if not context['Endpoints']['docker']['Host'].startswith('unix://'):
        p.error('Only a local Unix-socket Docker context is supported (WSL for Windows)')
    info = json.loads(subprocess.check_output(['docker', 'inspect', a.container], text=True))[0]
    if info.get('Config', {}).get('Labels', {}).get('com.docker.compose.project') != 'seap':
        p.error('Container must belong to the local seap Compose project')
    bundle = Path(a.bundle).resolve()
    manifest = json.loads((bundle / 'manifest.json').read_text())
    archive = bundle / 'database.dump'
    print('Checking the complete archive SHA-256 (this can take a few minutes)...', flush=True)
    h = hashlib.sha256()
    with archive.open('rb') as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b''):
            h.update(chunk)
    if h.hexdigest() != manifest['sha256'] or archive.stat().st_size != manifest['archive_bytes']:
        raise RuntimeError('Archive checksum/size differs from manifest')
    def query(db, sql):
        return subprocess.check_output(['docker','exec',a.container,'psql','-X','-A','-t',
          '-v','ON_ERROR_STOP=1','-U','seap','-d',db,'-c',sql],text=True).strip()
    if query('postgres', "SELECT count(*) FROM pg_database WHERE datname='" + a.database + "'") != '0':
        raise RuntimeError('Target database already exists; refusing to overwrite it')
    # pg_restore is trusted input, not a security sandbox. A known sender/checksum is required.
    target = '/tmp/' + a.database + '.handover.dump'
    print('Copying the archive into the local container; large files can take a few minutes...',flush=True)
    subprocess.run(['docker','cp',str(archive),a.container+':'+target],check=True)
    try:
        subprocess.run(['docker','exec',a.container,'createdb','-U','seap','-T','template0',a.database],check=True)
        print('Restoring into NEW database ' + a.database,flush=True)
        subprocess.run(['docker','exec',a.container,'pg_restore','-U','seap','-d',a.database,
          '--no-owner','--no-privileges','--exit-on-error','--jobs',str(a.jobs),target],check=True)
        # Seed only fresh local defaults; no production state is carried over.
        query(a.database, "INSERT INTO app.collection_control(id,paused,maintenance,processing_enabled) VALUES(1,true,false,false) ON CONFLICT DO NOTHING")
        control = query(a.database, "SELECT paused AND NOT maintenance AND NOT processing_enabled FROM app.collection_control WHERE id=1")
        if control != 't':
            raise RuntimeError('Unsafe restored collection state')
        forbidden = json.loads(query(a.database,"SELECT coalesce(json_agg(x),'[]') FROM (SELECT table_schema s,table_name t FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('auth','app')) x"))
        for table in forbidden:
            if table['s']=='app' and table['t'] in PUBLIC_APP | {'collection_control'}:
                continue
            name = '"' + table['s'].replace('"','""') + '"."' + table['t'].replace('"','""') + '"'
            if query(a.database,'SELECT EXISTS(SELECT 1 FROM ' + name + ' LIMIT 1)') != 'f':
                raise RuntimeError('Private/operational data unexpectedly restored: ' + name)
        migrations = int(query(a.database,'SELECT count(*) FROM drizzle.__drizzle_migrations'))
        expected = 0 if manifest['schema_only'] else manifest['migration_count']
        if migrations != expected:
            raise RuntimeError('Migration history count mismatch')
        subprocess.run(['docker','exec',a.container,'psql','-X','-v','ON_ERROR_STOP=1','-U','seap','-d',a.database,'-c','ANALYZE'],check=True)
        print(json.dumps({'restored':a.database,'private_tables_empty':True,'paused':True,
                          'processing_enabled':False,'migration_count':migrations}),flush=True)
    finally:
        subprocess.run(['docker','exec',a.container,'rm','-f',target],check=True)
    # Failure intentionally keeps the NEW database for diagnosis. No automatic DROP.

if __name__=='__main__':
    main()
