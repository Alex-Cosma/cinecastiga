# Batch 3 — coherent monitoring checkpoints

Monitoring consumes an explicitly published analytic snapshot. A successful scrape
alone is not a completed refresh: the existing Graphile jobs archive source
documents and collection observations, but do not normalize and rebuild all
dependent tables.

## Operator commands

After the additive Batch 3 migration and package build, run a coordinated refresh
against the intended database:

```sh
pnpm --filter ingestion monitoring-refresh --run
```

This command performs no network collection. It runs these existing builders in
order: normalization, reconciliation, TED mart, ordinary marts, core flags, flag
marts, Radiografie, and coverage. It then validates the complete snapshot before
publishing a ready checkpoint. Newly quarantined normalization records fail the
run; resolve those records and the underlying problem before publication.

For an existing, already completed Batch 1 snapshot, explicitly validate it:

```sh
pnpm --filter ingestion monitoring-refresh --validate-existing
```

This baseline path does not rebuild procurement tables, recalculate coverage, or
claim a new collection. It performs the full nine Batch 1 checks, including every
entity/role and annual splitting source population, plus a comparison between
actual source record counts and the preserved coverage inventory. It stores the
real procurement dates, prior inventory calculation times, normalization
watermarks, collection windows, most recent collection status and latest
successful collection time. Empty or incomplete historical collection metadata
remains absent; it is never replaced with the checkpoint time. The first watch
baseline remains a separate watch-engine operation and generates no historical
alert flood.

With no arguments or with `--help`, the refresh command only prints usage. Run the
separate monitoring worker as a supervised application process:

```sh
pnpm --filter web exec tsx scripts/monitoring-worker.ts
```

It checks for pending active watches every 60 seconds, including new watches on
the current ready snapshot. A completed refresh therefore becomes eligible
automatically. Pending work is reconstructed from persisted checkpoints, watches
and the absence of a completed watch/checkpoint run; process restart cannot lose
an in-memory notification. Completed runs are unique per watch and checkpoint.
Failed checks keep their prior good observation and are retried in later batches;
ordering older attempts first prevents failed watches from starving untouched
watches. `--limit=100` bounds each batch and `--interval-seconds=60` controls the
delay after a completed batch. No two ticks overlap. SIGINT/SIGTERM finishes the
current bounded batch and closes the database pool before exiting.

For an operational smoke check, `--once` performs one bounded pass and exits.
Operational logs contain counts and generic status, not private titles, URLs,
records or error parameters. This process never sends email or starts collection.
Do not start the broad scraping worker to trigger monitoring evaluation; its cron
tasks have different responsibilities. The monitoring process must be deployed
and supervised alongside the application. A web deployment alone neither runs
this worker nor publishes a checkpoint.

## Lock and dirty-state contract

`app.monitoring_refreshes` is additive application state and must survive source
refreshes. Every attempt has a UUID, an increasing bigint version, kind
(`coordinated`, `baseline`, or `manual`), lifecycle (`running`, `ready`, or
`failed`), timestamps, source coverage, methodology, validation and a safe error.
The latest numeric version determines whether monitoring may read. An older ready
version is retained for explaining the last successful check, but cannot authorize
new reads after a later failed or running attempt.

The shared `@seap/db` gate is the PostgreSQL two-key session advisory lock
`(1397047632, 3)`:

- `publishMonitoringRefresh` holds the exclusive lock across all separately
  committed builders, validation and checkpoint publication.
- `withMonitoringWrite` obtains the same exclusive lock and persists a `running`
  row **before** its first analytic mutation. Its successful standalone command
  still ends in a failed/dirty checkpoint requiring coordinated publication.
- `withMonitoringSnapshot` reserves one connection, takes the shared session lock
  **before beginning** repeatable read, validates the latest ready checkpoint,
  then performs all watch reads and writes in that transaction. Acquiring a lock
  after starting repeatable read would risk retaining a pre-refresh snapshot.
  A supplied expected checkpoint ID must still match the current ready version.
- A process crash releases its session lock, but its durable `running` row keeps
  monitoring blocked. Failure is never interpreted as an empty set of updates.
  A later complete coordinated refresh or explicitly validated existing snapshot
  can restore readiness; no manual status flip is needed.

Use PostgreSQL directly or session pooling for this gate. Transaction-pooling
proxies cannot preserve a session advisory lock across the builders' transactions.
The pool requires spare connections because one reserved connection holds the
gate while the existing builders use their own transactions.

## Supported mutation entry points

The standalone ingestion commands `normalize`, `reconcile`, `ted-mart`, `marts`,
`flags`, `radiografie`, `coverage`, `reset-derived`, `import-old`, `import-das`,
`import-financials`, `import-onrc`, `seed-thresholds`, and `merge-exact-name` use the
exclusive gate and invalidate earlier readiness. Applied `replay-ted` and the
bounded DA fixture repair do likewise; their default read-only modes do not dirty
the snapshot. Authentication, investigation and capture writes do not affect this
procurement gate.

The existing Graphile scraping jobs only archive raw responses and collection
history; they do not publish or mutate the normalized analytic dataset. Collection
can therefore advance independently of the last analytic snapshot. The stored
source coverage distinguishes that state from newly processed records.

Direct external SQL and custom scripts which call low-level builder functions
without this gate are unsupported concurrent writers. They cannot be detected
reliably from row timestamps, especially after truncation or corrections. Wrap any
new analytic writer in `withMonitoringWrite`; do not assume an old ready checkpoint
remains valid after database restoration, manual reference-data changes or an
out-of-band rebuild. Use a full coordinated refresh or explicit validation before
resuming monitoring. Application/auth state must not be truncated during a source
restore. Existing Next data-cache invalidation requirements still apply to public
analytic pages.

## Verification

The pipeline unit tests check dependency order, stopping after stage failure and
quarantine rejection. Database integration tests use a `seap_test_*` database with
an initially empty checkpoint table, and remove only their checkpoint fixtures:

```sh
pnpm --filter ingestion exec vitest run src/monitoring/pipeline.test.ts
TEST_DATABASE_URL=... pnpm --filter @seap/db exec vitest run test/monitoring.integration.test.ts
```

The gate tests cover explicit baseline creation, retained source dates, shared
versus exclusive locking, failure and interrupted-process state, standalone-write
invalidation, numeric monotonic versions, stale-checkpoint rejection and rollback.
Run them separately from watch-engine fixtures on the same disposable database.
Four isolated worker tests cover argument bounds, non-overlapping ticks, signal
shutdown, one-shot failure reporting, retry and sanitized logging.

Local acceptance on 19 September 2026: all eight gate integration tests, three
pipeline tests and 85 ingestion tests passed. Database and ingestion type checks
passed. The explicit existing-snapshot baseline passed all ten full checks in
approximately 128 seconds and published version 1. Its inventory timestamps and
latest observed procurement dates remain those of the existing dataset. The
[refresh acceptance artifact](./previews/batch3/refresh-checks.json) records the
checkpoint and full validation results. No collection or procurement rebuild was
performed during this acceptance.
