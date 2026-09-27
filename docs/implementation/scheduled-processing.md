# Daily publication and weekly risk

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
2. Drains collection and document workers. Requires zero running requests, collection tasks and document jobs; then freezes the maximum raw ID.
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
