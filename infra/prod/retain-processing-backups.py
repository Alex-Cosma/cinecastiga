"""Delete only dump artifacts of successful scheduled runs beyond the latest 14."""
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(sys.argv[1]).resolve(strict=True)
result = subprocess.run([
    'docker', 'exec', 'cinecastiga-postgres-1', 'psql', '-X', '-U', 'seap', '-d', 'seap', '-Atc',
    "select id from app.processing_runs where status='ready' order by started_at desc offset 14",
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
