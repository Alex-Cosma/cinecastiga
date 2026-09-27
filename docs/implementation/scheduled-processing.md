# Daily publication and weekly risk

**Repair/rehearsal completed and schedule activated. See the latest verified status below; older pending notes are historical. Collection has a separate unresolved task block.**

Approved 27 September 2026: publish new data every day at 05:00 Europe/Bucharest; also recalculate risk on Sundays at the same time. Implementation is pending production activation until the one-off TED repair and isolated daily rehearsal pass. Deployment alone does not activate the schedule.

## Data and risk have separate dates

`runMonitoringRefresh` supports `scope: daily | full`. Both normalize only archived rows up to the frozen raw ID, reconcile TED/SEAP, rebuild TED reporting tables, procurement statistics, transaction lists and question aggregates, Radiografie, coverage, and run all existing snapshot checks. Full runs additionally rebuild `core.flags`, CRI profiles and browsable flag samples.

The transaction builder formerly lived inside flag-marts. It is now separately callable; leaving it in the weekly-only branch would have hidden new direct acquisitions from search questions and Radiografie. The standalone flag-marts command retains its original behavior for compatibility.

A daily run requires the immediately previous checkpoint to be a ready coordinated publication with the same risk methodology. It carries forward the original risk checkpoint/date across successive days. It does not relabel the retained signals as freshly calculated. Full source-membership checks remain enabled: corrections to historical source values which invalidate retained evidence stop publication instead of silently weakening validation. Recovery then requires an operator to rebuild the full snapshot or restore the backup.

Radiografie includes its own structural analyses and remains daily as requested. This separation concerns the explicit flag/CRI pipeline; it does not claim that every analytical observation on the site updates only weekly. The risk calculation date is visible in `/admin`, `/semnale` and the shared data footer. Collection completeness remains separately reported and is never inferred from a successful refresh.

## Scheduler and failure behavior

The host cron invokes `infra/prod/process-nightly.sh` once per minute. It first takes the existing deployment lock; concurrent deployments/runners cannot overlap. PostgreSQL chooses the Romanian local date/time (including DST), a unique `scheduled_day` permits only one attempt, and `processing_enabled_at` prevents late activation from immediately starting a missed 05:00 run. A restart after the due time can catch up on that same local day; earlier days are not replayed as separate jobs.

Migration 0037 adds opt-in settings and `app.processing_runs`. The runner:

1. Atomically records the run, pauses collection and enables maintenance. Preserves the preceding operator pause.
2. Blocks new work, waits up to 25 minutes for active requests/tasks/documents to finish, then stops workers. Waiting occurs before SIGTERM because the document worker aborts OCR on that signal. Requires zero active work again before freezing the maximum raw ID; an orphan or exhausted drain deadline stops publication.
3. Checks at least 20 GiB free and takes a private full PostgreSQL dump, archive listing and SHA-256. A `.partial` file is never accepted as a restore point.
4. Executes the selected pipeline, persists stage durations/heartbeats and validates the full snapshot.
5. Rebuilds search; requires expected document count, no indexing in progress and no failed/canceled write/settings tasks.
6. Restarts web caches and previously active workers while still paused; requires healthy web before guarded reopening.
7. Reopens only the exact validated checkpoint with verified search and unchanged control revision. Prior manual pauses and independent source-error blocks survive publication.

Any failure retains maintenance; there is no automatic retry. A killed runner also leaves maintenance enabled. Stale heartbeat is visible in admin. The bounded database shutdown fix prevents completed long-lived reserved connections from hanging process cleanup.

Backups live in `/srv/seap/backups/processing/<run UUID>/`, mode restricted by `umask 077`. Keep the latest fourteen successful scheduled restore points; remove only their older dump/list/hash files. Failed-run backups and the dated TED/benchmark recovery archives outside this directory are preserved. Stage logs and database run history remain available. Retention failure is logged without revoking an already verified publication.

## Installation after validation

- Deploy the release and migration normally; the processor image is built on every deployment, including installations without an active collector.
- Preserve the user's existing crontab and add exactly one line:
  `* * * * * /bin/bash /srv/seap/src/infra/prod/process-nightly.sh >> /srv/seap/backups/processing-scheduler.log 2>&1`
- Verify a scheduler heartbeat while disabled, then enable in `/admin`: daily 05:00, risk Sunday. Activation is audited and starts at the next scheduled time.
- Do not install/enable during the live TED repair's deployment lock.

## Recovery

Do not clear maintenance merely to make the site visible. Preserve the run log, checkpoint error and dump checksum. Resolve the failed stage on an isolated restored copy before changing the live dataset. For rollback, stop both source workers, retain an additional copy of the failed database if possible, verify the chosen dump checksum, and restore to a new database first (the benchmark/TED rehearsal has already exercised restoration on this host). Validate that snapshot and its source coverage, rebuild/verify its search index and clear web caches before a guarded operator-controlled switch/reopen. A source block is independent and must not be cleared by data recovery. No automatic destructive restore is included.

## Validation evidence (in progress)

- Nine real PostgreSQL scheduler/state-machine cases: local schedule, DST, concurrency, late activation, no retry, guarded reopening, preserved pause/source blocks.
- Four publication-gate cases with expensive builders stubbed: retained risk date/identity, full baseline requirement, refusal after manual writes, full risk update.
- Real SQL transaction-builder fixture: new purchases reach lists/totals while saved flags/samples are unchanged.
- Four host orchestration cases: no-op, deploy-lock collision, backup/refresh failure, success ordering. Failure test exposed missing Bash ERR inheritance; runner uses `set -Eeuo pipefail`.
- Unit suites and browser/admin checks recorded in the completion report below once final validation finishes. Browser fixture is synthetic, localhost only, with no source HTTP.

### Local release verification — 27 September

The complete `pnpm turbo typecheck lint test build` run passed all 20 tasks; host deployment/nightly tests passed 11 cases. Dedicated browser fixtures passed and were removed after verification. The activation SQL was exercised on a rolled-back test fixture and retained its manual pause and independent source block. Visual finish review is **ship** for the interface scope.

The guarded full-data rehearsal runner is `scripts/operations/run-daily-rehearsal-20260927.sh`; it targets only the repaired production clone, records per-stage timing, compares retained risk fingerprints and requires all ten publication checks. It does not index live search or contact SEAP. Production deployment, rehearsal and schedule activation remain pending completion of the live repair at this checkpoint.

## Verified production status — 27 September, 20:39 Bucharest

TED repair completed and the site reopened at **19:18:19 Bucharest**. All 161,633 notices normalized, zero pending, all ten snapshot checks passed. Full recalculation took **1h47m49s**, excluding archive repair/backup/search; the maintenance interval was **2h50m31s**. Search verified 194,519 entities. The initial release through8997ded passed CI/deployment (run36332770987).

The isolated daily rehearsal passed all ten checks in **41m15.247s**, excluding risk fingerprints, backup and search. Core flags, entity risk profiles and saved risk samples retained identical counts and dual fingerprints, and retained the original risk provenance. No source HTTP or live search writes were performed by this rehearsal.

The continuation installed cron and proved the disabled heartbeat, but its activation SQL did not run: a Compose command inherited the SSH script input. The postcondition correctly detected that the schedule was still disabled. The runner and caller now detach command stdin; the host regression passes caller input and ensures it never reaches the container. The preserved failed continuation report is historical evidence, not proof the repair or rehearsal failed.

Activation SQL was applied separately and committed at **20:38:18 Bucharest**, audited as a settings change. Enabled: daily05:00 Europe/Bucharest and Sunday risk. Next daily: **28 September05:00**; next full risk: **4 October05:00**. Existing cron jobs and the50–70second budget are preserved.

**Separate unresolved collection stop:** after reopening, requests772–776 succeeded. Task36017 (participation notices,26July2026,page0) failed at19:21:52 before any request ledger entry for that task. Its generic task error does not preserve the original pre-request exception. The source block is retained; no retry/unblock was performed during this status check. Schedule activation preserves this block and the site remains available. Do not describe crawling as currently resumed or blame SEAP without evidence. The exception coincided with release deployment, but causation is unconfirmed.

Evidence: `/srv/seap/backups/ted-repair-20260927/live-validation.json`, `/srv/seap/backups/daily-rehearsal-20260927/daily-validation.json`, and local `/tmp/seap-processing-release-20260927/`. These checks establish internal consistency, not full external source coverage.

### Follow-up: prepared-query migration fault and admin pagination

PostgreSQL logs identified task36017's pre-request failure: at16:21:52.461UTC the old worker's cached `SELECT *` on collection_control failed with SQLSTATE0A000 after migration0037 added columns. There was no HTTP ledger entry for this task. Admission and task-claim queries now select explicit stable fields. Two real PostgreSQL cases exercise additive ALTER TABLE on the same prepared worker sessions; the admission regression reproduced with the old compiled DB package and passed after rebuilding the fix. No source traffic was used.

Admin journal now displays10 requests/page with range/count, filter reset and stable historical pages during polling; document queue also returns10 items/page. Production-build browser verification passed, as did239web and93ingestion unit cases. Scoped pagination finish verdict: ship. The existing latest100-request feed/export scope and mobile horizontal table scroll remain explicit.

A guarded one-off task recovery script preserves the original task/error plus PostgreSQL diagnosis in audit, verifies the unchanged source boundary and enforces at least70seconds before ordinary collection resumes. Its rolled-back fixture passed. Application awaits the combined release deployment; do not infer a resumed collector from this paragraph.
