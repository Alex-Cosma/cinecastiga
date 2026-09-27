"""Dated, authorized continuation: repair -> deploy -> clone rehearsal -> schedule.

Run locally with --execute <pinned main SHA>. No credentials are read or printed.
Every remote mutation follows evidence checks. Any error stops the continuation;
the live repair and scheduled publisher retain their own fail-closed safeguards.
Progress/evidence: /tmp/seap-processing-release-20260927/status.json and run.log.
"""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
REPORT = Path('/tmp/seap-processing-release-20260927')
HOST = 'cinecastiga'
API = 'https://api.github.com/repos/Alex-Cosma/seap-new/actions/runs?branch=main&per_page=10'
DEADLINE = time.monotonic() + 6 * 3600
state = {}


def now():
    return datetime.now(timezone.utc).isoformat()


def progress(phase, **extra):
    state.update(phase=phase, updatedAt=now(), **extra)
    temp = REPORT / 'status.partial'
    temp.write_text(json.dumps(state, indent=2))
    temp.replace(REPORT / 'status.json')
    print(now(), phase, flush=True)


def command(args, text=None, timeout=180):
    result = subprocess.run(args, input=text, text=True, capture_output=True,
                            cwd=ROOT, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'Command failed: {args[0]} (exit {result.returncode}): {result.stderr[-2000:]}')
    return result.stdout.strip()


def remote(script):
    return command(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', HOST, 'bash', '-se'], script)


def wait():
    if time.monotonic() >= DEADLINE:
        raise TimeoutError('Continuation deadline reached; inspect saved evidence')
    time.sleep(30)


def clean_head(sha):
    if command(['git', 'rev-parse', 'HEAD']) != sha or command(['git', 'status', '--porcelain']):
        raise RuntimeError('Local checkout changed; automatic push/document edits stopped')


def deploy(sha):
    clean_head(sha)
    command(['git', 'push', 'origin', f'{sha}:refs/heads/main'])
    progress('waiting-ci-and-deploy', release=sha)
    while True:
        with urlopen(API, timeout=30) as response:
            runs = json.load(response)['workflow_runs']
        run = next((r for r in runs if r['head_sha'] == sha and r['name'] == 'CI'), None)
        if run and run['status'] == 'completed':
            if run['conclusion'] != 'success':
                raise RuntimeError(f'CI/deploy failed: {run["html_url"]}')
            if remote('git -C /srv/seap/src rev-parse HEAD') != sha:
                raise RuntimeError('Deployed checkout does not match verified release')
            state['workflow'] = run['html_url']
            return
        wait()


def main(sha):
    clean_head(sha)
    progress('waiting-live-repair', initialRelease=sha, startedAt=now())
    while True:
        marker = remote('''
if test -f /srv/seap/backups/ted-repair-20260927/live-failed; then echo failed
elif test -f /srv/seap/backups/ted-repair-20260927/live-ready; then
 flock -n /srv/seap/src/.git/deploy.lock true && echo ready || echo locked
else echo running; fi
''')
        if marker == 'failed':
            raise RuntimeError('Live repair failed; its maintenance must remain enabled')
        if marker == 'ready':
            break
        wait()
    live = json.loads(remote('cat /srv/seap/backups/ted-repair-20260927/live-validation.json'))
    assert live['notices'] == 161633 and live['pending'] == 0
    assert live['checkpoint']['status'] == 'ready'
    assert len(live['checkpoint']['validation']['checks']) == 10
    assert all(c['passed'] for c in live['checkpoint']['validation']['checks'])
    (REPORT / 'live-validation.json').write_text(json.dumps(live, indent=2))
    deploy(sha)
    progress('starting-isolated-daily-rehearsal')
    remote('''
test ! -e /srv/seap/backups/daily-rehearsal-20260927/daily-validation.json
nohup /bin/bash /srv/seap/src/scripts/operations/run-daily-rehearsal-20260927.sh > /srv/seap/backups/daily-rehearsal-20260927-launch.log 2>&1 < /dev/null &
echo "$!"
''')
    while True:
        result = remote('''
if test -f /srv/seap/backups/daily-rehearsal-20260927/daily-validation.json; then
 cat /srv/seap/backups/daily-rehearsal-20260927/daily-validation.json
else echo '{}'; fi
''')
        daily = json.loads(result)
        if daily.get('status') == 'failed':
            raise RuntimeError(f'Daily rehearsal failed: {daily.get("error")}')
        if daily.get('status') == 'ready':
            marker = remote('test -f /srv/seap/backups/daily-rehearsal-20260927/ready && echo ready || echo pending')
            if marker == 'ready':
                break
        progress('daily-rehearsal', stage=daily.get('stage', 'starting'))
        wait()
    assert daily['before'] == daily['after']
    assert daily['sourceRequests'] == 0 and not daily['searchChanged']
    checks = daily['checkpoint']['validation']['checks']
    assert len(checks) == 10 and all(c['passed'] for c in checks)
    assert daily['checkpoint']['validation']['refreshScope'] == 'daily'
    remote('test -f /srv/seap/backups/daily-rehearsal-20260927/ready')
    (REPORT / 'daily-validation.json').write_text(json.dumps(daily, indent=2))
    progress('activating-validated-schedule', dailyRecalculationMs=daily['recalculationMs'])
    remote('''
test "$(docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -Atc 'select not processing_enabled and not maintenance from app.collection_control where id=1')" = t
python3 - <<'PY'
import pathlib, subprocess
line = '* * * * * /bin/bash /srv/seap/src/infra/prod/process-nightly.sh >> /srv/seap/backups/processing-scheduler.log 2>&1'
r = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
if r.returncode and 'no crontab' not in r.stderr.lower():
    raise RuntimeError('Cannot read existing crontab')
existing = r.stdout
matches = [x for x in existing.splitlines() if 'process-nightly.sh' in x]
if matches and matches != [line]:
    raise RuntimeError('A different processing schedule already exists')
if not matches:
    backup = pathlib.Path('/srv/seap/backups/pre-processing-crontab-20260927.txt')
    with backup.open('x') as f: f.write(existing)
    backup.chmod(0o600)
    subprocess.run(['crontab', '-'], input=existing.rstrip()+'\\n'+line+'\\n', text=True, check=True)
PY
/bin/bash /srv/seap/src/infra/prod/process-nightly.sh </dev/null
docker exec -i cinecastiga-postgres-1 psql -X -U seap -d seap < /srv/seap/src/scripts/operations/enable-processing-20260927.sql
''')
    verify = remote('''
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii)" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health)" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' 'https://cinecastiga.ro/api/admin/collection?documentQueue=1')" = 403
docker exec cinecastiga-postgres-1 psql -X -U seap -d seap -Atc "select jsonb_build_object('enabled',processing_enabled,'time',processing_time,'riskWeekday',risk_weekday,'maintenance',maintenance,'paused',paused,'blocked',blocked_reason is not null,'minSeconds',min_seconds,'maxSeconds',max_seconds,'enabledAt',processing_enabled_at) from app.collection_control where id=1"
''')
    control = json.loads(verify)
    assert control['enabled'] and control['time'] == '05:00' and control['riskWeekday'] == 0
    assert not control['maintenance'] and (control['minSeconds'], control['maxSeconds']) == (50, 70)
    state['control'] = control
    clean_head(sha)
    milliseconds = daily['recalculationMs']
    minutes, seconds = divmod(round(milliseconds / 1000), 60)
    evidence = f'''\n## Production completion — {now()}\n\nLive TED repair passed all ten checks: {live['notices']:,} normalized notices, zero pending, {live['links']:,} association candidates and {live['competition']:,} contracts with verified competition counts. The site reopened; no repair/rehearsal source requests were made.\n\nThe daily rehearsal on the repaired isolated clone passed all ten checks in **{minutes}m{seconds:02d}s** (calculation and validation; excludes risk fingerprints, backup and search). Retained risk-table fingerprints and original risk provenance were unchanged.\n\nThe host minute scheduler is installed and activation is audited: daily at **05:00 Europe/Bucharest**, including full risk on **Sunday**. Existing source controls and the shared 50–70-second budget are preserved. Public pages/health returned200; anonymous admin queue returned403. Evidence: `/srv/seap/backups/ted-repair-20260927/live-validation.json` and `/srv/seap/backups/daily-rehearsal-20260927/daily-validation.json`. This establishes a verified internal snapshot, not complete external source coverage.\n'''
    for filename in ['docs/implementation/scheduled-processing.md', 'docs/implementation/ted-production-recovery-20260927.md']:
        path = ROOT / filename
        text = path.read_text()
        path.write_text(text.split('\n', 1)[0]+'\n\n**Completed in production; the dated completion evidence at the end supersedes the historical work-in-progress notes below.**\n'+text.split('\n', 1)[1]+evidence)
    handoff = ROOT / 'HANDOFF.md'
    handoff.write_text(handoff.read_text().split('\n', 1)[0]+'\n'+evidence+'\nEarlier checkpoints below are historical. Schedule activation and full-data rehearsal are complete.\n'+handoff.read_text().split('\n', 1)[1])
    paths = ['HANDOFF.md', 'docs/implementation/scheduled-processing.md', 'docs/implementation/ted-production-recovery-20260927.md']
    command(['git', 'add', *paths])
    command(['git', 'commit', '-m', 'Record verified TED repair and active daily and Sunday processing'])
    final_sha = command(['git', 'rev-parse', 'HEAD'])
    deploy(final_sha)
    remote('''
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/api/health)" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' https://cinecastiga.ro/domenii)" = 200
''')
    progress('complete', completedAt=now(), finalRelease=final_sha)


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] != '--execute' or len(sys.argv[2]) != 40:
        raise SystemExit('Usage: python3 finish-processing-release-20260927.py --execute <pinned main SHA>')
    os.umask(0o077)
    REPORT.mkdir(exist_ok=True)
    lock = (REPORT / 'lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if (REPORT / 'status.json').exists():
        raise SystemExit('Existing continuation report: inspect before any rerun')
    try:
        main(sys.argv[2])
    except Exception as error:
        progress('failed', error=f'{type(error).__name__}: {error}')
        raise
