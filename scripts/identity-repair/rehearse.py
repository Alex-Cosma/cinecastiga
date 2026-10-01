#!/usr/bin/env python3
"""Rehearse archive-backed authority corrections on an isolated local copy only.
No production mode. No collectors. No implicit default database or source archive.
"""
import argparse
import csv
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--database', required=True)
p.add_argument('--container', default='seap-postgres-1')
p.add_argument('--bundle', type=Path, required=True)
p.add_argument('--phase', choices=['prepare', 'audit', 'pilot', 'apply', 'verify'], required=True)
a = p.parse_args()
if not re.fullmatch(r'seap_test_identity_[a-z0-9_]+', a.database):
    p.error('Only an isolated seap_test_identity_* database is accepted')
# Do not inherit remote Docker contexts into a mutation command.
endpoint = subprocess.check_output(['docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], text=True).strip()
if not endpoint.startswith('unix://') or not os.environ.get('DOCKER_HOST','unix://').startswith('unix://'):
    p.error('Only a local Unix-socket Docker context is accepted')
cmd = ['docker', 'exec', '-i', a.container, 'psql', '-X', '-U', 'seap', '-d', a.database, '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off']
def sql(statement):
    subprocess.run(cmd, input="SET TIME ZONE 'UTC';\n" + statement, text=True, check=True)
def copy_file(table, fields, path, csv_format=False):
    suffix = " WITH (FORMAT csv, DELIMITER E'\\t')" if csv_format else ''
    with path.open('rb') as inp:
        subprocess.run(cmd + ['-c', f'COPY {table} ({fields}) FROM STDIN{suffix}'], stdin=inp, check=True)
def hash_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for part in iter(lambda: f.read(1024*1024), b''): h.update(part)
    return h.hexdigest()
manifest = json.loads((a.bundle/'manifest.json').read_text())
if manifest['version'] != 2: raise RuntimeError('Unsupported bundle')
if set(manifest['files']) != {'rows.tsv','groups.json','dimension.json'}: raise RuntimeError('Incomplete bundle manifest')
for name, expected in manifest['files'].items():
    if name not in ('rows.tsv','groups.json','dimension.json') or hash_file(a.bundle/name) != expected:
        raise RuntimeError('Bundle verification failed')
if a.phase != 'prepare':
    stored=json.loads(subprocess.check_output(cmd+['-Atc','SELECT document::text FROM identity_repair.manifest'],text=True))
    if any(stored.get(key)!=manifest.get(key) for key in ('version','files','sources','rows','dimensionRows')):
        raise RuntimeError('Staged proof does not match the supplied bundle')
if a.phase == 'prepare':
    sql('''CREATE SCHEMA identity_repair;
CREATE TABLE identity_repair.manifest (document jsonb NOT NULL);
CREATE TABLE identity_repair.dimension (sicap_id integer PRIMARY KEY,cui text,name text NOT NULL);
CREATE TABLE identity_repair.groups (id integer PRIMARY KEY, raw text NOT NULL, identity jsonb NOT NULL, source_count bigint NOT NULL);
CREATE TABLE identity_repair.source_rows (sicap_da_id bigint PRIMARY KEY, group_id integer NOT NULL REFERENCES identity_repair.groups);
''')
    # COPY encoding, not interpolated source text in SQL.
    with tempfile.TemporaryDirectory(prefix='seap-identity-') as tmp:
        dim_file=Path(tmp)/'dimension.tsv'
        with dim_file.open('w',newline='') as f:
            writer=csv.writer(f,delimiter='\t',lineterminator='\n')
            for row in json.loads((a.bundle/'dimension.json').read_text()): writer.writerow([row['sicapId'],row['cui'],row['name']])
        copy_file('identity_repair.dimension','sicap_id,cui,name',dim_file,True)
        groups_file = Path(tmp)/'groups.tsv'
        with groups_file.open('w', newline='') as f:
            writer=csv.writer(f, delimiter='\t', lineterminator='\n')
            for g in json.loads((a.bundle/'groups.json').read_text()):
                writer.writerow([g['id'],g['raw'],json.dumps(g['identity']),g['rows']])
        copy_file('identity_repair.groups','id,raw,identity,source_count',groups_file,True)
        mf=Path(tmp)/'manifest.tsv'
        with mf.open('w',newline='') as f: csv.writer(f,delimiter='\t').writerow([json.dumps(manifest)])
        copy_file('identity_repair.manifest','document',mf,True)
    copy_file('identity_repair.source_rows','sicap_da_id,group_id',a.bundle/'rows.tsv')
    sql(f'''DO $$ BEGIN
IF (SELECT count(*) FROM identity_repair.dimension) <> {int(manifest['dimensionRows'])} THEN RAISE EXCEPTION 'Incomplete original dimension'; END IF;
IF (SELECT count(*) FROM identity_repair.source_rows) <> {int(manifest['rows'])} THEN RAISE EXCEPTION 'Incomplete row manifest'; END IF;
IF EXISTS (SELECT 1 FROM identity_repair.groups g LEFT JOIN (SELECT group_id,count(*) n FROM identity_repair.source_rows GROUP BY group_id) r ON r.group_id=g.id WHERE r.n IS DISTINCT FROM g.source_count) THEN RAISE EXCEPTION 'Group counts mismatch'; END IF;
END $$;
ANALYZE identity_repair.source_rows;
ANALYZE identity_repair.groups;
''')
elif a.phase == 'audit':
    sql('''BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
IF EXISTS(SELECT 1 FROM identity_repair.source_rows s LEFT JOIN core.direct_acquisitions d ON d.sicap_da_id=s.sicap_da_id WHERE d.id IS NULL) THEN RAISE EXCEPTION 'Incomplete source copy: archived acquisitions are missing'; END IF;
END $$;
CREATE TABLE identity_repair.plan AS
SELECT d.id da_id,d.sicap_da_id,d.authority_entity_id old_id,e.id new_id,s.group_id,
       d.raw_id, to_jsonb(d) - 'authority_entity_id' original_record
FROM identity_repair.source_rows s
JOIN identity_repair.groups g ON g.id=s.group_id
JOIN core.entities e ON e.cui_valid AND e.cui_canonical=g.identity->>'cui'
JOIN core.direct_acquisitions d ON d.sicap_da_id=s.sicap_da_id
WHERE g.identity->>'kind' IN ('cui','sicap')
  AND d.authority_entity_id IS DISTINCT FROM e.id;
ALTER TABLE identity_repair.plan ADD PRIMARY KEY(da_id);
CREATE INDEX ON identity_repair.plan(old_id);
CREATE TABLE identity_repair.baseline AS
SELECT count(*) n,sum(closing_value) amount,
       sum(hashtextextended((to_jsonb(d)-'authority_entity_id')::text,0)::numeric) fingerprint,
       sum(hashtextextended(to_jsonb(d)::text,0)::numeric) identity_fingerprint
FROM core.direct_acquisitions d;
CREATE TABLE identity_repair.applied (da_id bigint PRIMARY KEY REFERENCES identity_repair.plan, applied_at timestamptz NOT NULL DEFAULT now());
COMMIT;
SELECT count(*) planned_rows,count(DISTINCT old_id) old_profiles,count(*) FILTER(WHERE raw_id IS NOT NULL) live_source_conflicts FROM identity_repair.plan;
SELECT p.old_id,e.name_display,p.new_id,count(*) rows FROM identity_repair.plan p LEFT JOIN core.entities e ON e.id=p.old_id GROUP BY 1,2,3 ORDER BY count(*) DESC LIMIT 15;
SELECT g.identity->>'kind' classification,count(*) rows,count(*) FILTER(WHERE d.id IS NULL) missing_in_copy FROM identity_repair.source_rows s JOIN identity_repair.groups g ON g.id=s.group_id LEFT JOIN core.direct_acquisitions d ON d.sicap_da_id=s.sicap_da_id GROUP BY 1;
''')
elif a.phase in ('pilot', 'apply'):
    predicate = 'p.old_id=2147251 AND p.new_id=2146445' if a.phase=='pilot' else 'true'
    sql(f'''BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE core.direct_acquisitions IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
IF EXISTS(SELECT 1 FROM identity_repair.plan p JOIN core.direct_acquisitions d ON d.id=p.da_id WHERE ({predicate}) AND (d.raw_id IS NOT NULL OR (d.authority_entity_id IS DISTINCT FROM p.old_id AND d.authority_entity_id IS DISTINCT FROM p.new_id) OR (to_jsonb(d)-'authority_entity_id') IS DISTINCT FROM p.original_record)) THEN RAISE EXCEPTION 'Source conflict/drift: review before applying'; END IF;
END $$;
WITH changed AS (
 UPDATE core.direct_acquisitions d SET authority_entity_id=p.new_id
 FROM identity_repair.plan p WHERE d.id=p.da_id AND ({predicate}) AND d.authority_entity_id IS DISTINCT FROM p.new_id RETURNING d.id
) INSERT INTO identity_repair.applied(da_id) SELECT id FROM changed;
DO $$ BEGIN
IF EXISTS(SELECT 1 FROM identity_repair.plan p JOIN core.direct_acquisitions d ON d.id=p.da_id WHERE ({predicate}) AND (d.authority_entity_id IS DISTINCT FROM p.new_id OR (to_jsonb(d)-'authority_entity_id') IS DISTINCT FROM p.original_record)) THEN RAISE EXCEPTION 'Correction validation failed'; END IF;
END $$;
COMMIT;
SELECT count(*) applied_rows FROM identity_repair.applied;
''')
else:
    sql('''BEGIN READ ONLY;
DO $$ BEGIN
IF EXISTS(SELECT 1 FROM identity_repair.plan p JOIN identity_repair.applied a ON a.da_id=p.da_id LEFT JOIN core.direct_acquisitions d ON d.id=p.da_id WHERE d.id IS NULL OR d.authority_entity_id IS DISTINCT FROM p.new_id OR (to_jsonb(d)-'authority_entity_id') IS DISTINCT FROM p.original_record) THEN RAISE EXCEPTION 'Applied rows changed unexpectedly'; END IF;
IF EXISTS(SELECT 1 FROM identity_repair.baseline b CROSS JOIN (SELECT count(*) n,sum(closing_value) amount,sum(hashtextextended((to_jsonb(d)-'authority_entity_id')::text,0)::numeric) fingerprint FROM core.direct_acquisitions d) a WHERE a.n IS DISTINCT FROM b.n OR a.amount IS DISTINCT FROM b.amount OR a.fingerprint IS DISTINCT FROM b.fingerprint) THEN RAISE EXCEPTION 'Global conservation failed'; END IF;
IF (SELECT sum(hashtextextended(to_jsonb(d)::text,0)::numeric) FROM core.direct_acquisitions d) IS DISTINCT FROM
 (SELECT identity_fingerprint FROM identity_repair.baseline) +
 (SELECT coalesce(sum(hashtextextended((p.original_record||jsonb_build_object('authority_entity_id',p.new_id))::text,0)::numeric - hashtextextended((p.original_record||jsonb_build_object('authority_entity_id',p.old_id))::text,0)::numeric),0) FROM identity_repair.plan p JOIN identity_repair.applied a ON a.da_id=p.da_id)
THEN RAISE EXCEPTION 'Unexpected identity changes outside the verified plan'; END IF;
END $$;
SELECT (SELECT count(*) FROM identity_repair.applied) applied_rows,(SELECT count(*) FROM identity_repair.plan) planned_rows;
COMMIT;
''')
