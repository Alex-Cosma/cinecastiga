"""Keep dumps of the two latest successful runs and of the latest successful full (weekly) run.

Failed-run dumps are removed once a later run succeeded: recovery takes its own fresh backup.
Running runs and stage logs are never touched.
"""
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(sys.argv[1]).resolve(strict=True)
result = subprocess.run([
    'docker', 'exec', 'cinecastiga-postgres-1', 'psql', '-X', '-U', 'seap', '-d', 'seap', '-Atc',
    """with ready as (select id,scope,started_at,row_number() over(order by started_at desc) n
         from app.processing_runs where status='ready'),
       keep as (select id from ready where n<=2
         union select id from (select id from ready where scope='full' order by started_at desc limit 1) weekly)
     select r.id from app.processing_runs r
     where r.id not in (select id from keep)
       and (r.status='ready' or (r.status='failed' and r.started_at<(select max(started_at) from ready)))""",
], check=True, capture_output=True, text=True)
for run_id in result.stdout.splitlines():
    if not re.fullmatch(r'[a-f0-9-]{36}', run_id):
        raise ValueError('Unexpected processing run ID')
    directory = root / run_id
    if directory.is_symlink() or directory.resolve().parent != root:
        raise ValueError('Unsafe backup directory')
    for name in ('database.dump', 'database.list', 'database.sha256'):
        artifact = directory / name
        if artifact.is_file() and not artifact.is_symlink():
            artifact.unlink()
