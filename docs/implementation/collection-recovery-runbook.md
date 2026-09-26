# Durable recovery worker — first production activation

User explicitly authorized commit, push, deployment and crawl startup on 2026-09-26. This worker collects and archives source data only. **Daily processing/publication is still not scheduled.** Existing public data is unchanged by raw archival; never invoke normalize `--rebuild` against the production archive that excluded historical payloads.

## Fixed recovery scope

- DA: 2026-07-01 through the frozen previous closed Bucharest day.
- Participation/awards: 2026-01-01 through that same closed day.
- Known authority IDs union the live participant inventory; no old watermarks read or overwritten.
- No automatic source PDF or per-record DA detail requests. eForms detail gaps are explicit deferred tasks, while applicable award contract pages are collected independently.

Migration0035 creates `app.collection_batches` and `collection_tasks`. One task equals one HTTP attempt. Stable identity includes batch, kind, authority/notice, date partition and page. Responses create more tasks only after envelope/date/count/identity checks. DA overflow bisects dates; an unsplittable day stops. Multi-page totals must stay stable; short/duplicate pages stop. Contract pages are retained, redacted, in task results; the compatible combined raw envelope is archived only after reconciliation.

Archival, children and checkpoint share one transaction. A task interrupted before confirmation fails closed on restart; inspect before requeuing. There are no automatic task retries. The existing shared gate serializes all source transports, persists 50–70second jitter, pauses403/429/challenges, and enforces the extra60second gap for file GETs. The worker rotates fairly among DA, participation, awards and the authority catalogue. The first notice pages probe the latest closed day, then the remaining recovery days; this is discovery order, not a contiguous completeness assertion.

## Deployment / activation

1. Take a full production backup; verify its archive listing before migration. The first activation backup is `/srv/seap/backups/pre-collection-20260926.dump`, private to the server user.
2. Merge the tested release to main and let CI deploy web/migrations/documents. The migration leaves the global queue paused. The `collection` Compose profile is opt-in.
3. Build the collector image: `docker compose --profile collection build collection`.
4. Seed without network: `docker compose --profile collection run --rm --no-deps collection node apps/ingestion/dist/scripts/collection.js seed 2026-09-25`.
5. Inspect manifest counts, raw sequence continuity, initial scope and gates. Enable the shared queue with an audited control change; temporarily pause the documents stream for a bounded source pilot.
6. Run `docker compose --profile collection run --rm --no-deps collection node apps/ingestion/dist/scripts/collection.js run --max-tasks=6`. Each task uses at most one source attempt, including failures. Inspect both HTTP ledger and task results; stop on any block. No production source calls are made by ordinary tests.
7. If responses and archives reconcile, restore the intended document-stream setting and run `docker compose --profile collection up -d --no-deps collection`. Future deploys rebuild/restart an already activated collector; they do not activate a dormant profile.

`/admin` reports requests and archive counts plus discovered pending/finished/error/deferred tasks per stream. Known pending work can grow; no final total or percentage is promised. `collected` refers to source archival only. A batch with deferred/failed tasks is `incomplete`, never silently complete. A batch is fixed; new closed days require a subsequent planned run rather than changing its identity.

To stop admission, use the global pause in `/admin`. For a controlled worker shutdown use Compose stop; allow the current attempt/archive commit to finish. Keep maintenance on if a future publication pipeline fails; source collection alone does not toggle public maintenance.

## Validation

Seven pure planner tests cover splitting, date bounds, pagination completeness, repeated IDs, contract assembly/redaction, eForms gaps and inventory expansion. Five isolated PostgreSQL tests cover atomic archive/checkpoint, forced downstream rollback, pause, orphan recovery and idempotent window seeding without cursor changes. Shared limiter tests separately cover serialization/restarts/Retry-After/file spacing. Final project checks and actual activation results are recorded in HANDOFF.md.

Clean deployment validation also found two inherited release gaps: the web image omitted the domain package, and build-time rendering attempted a database read from the shared coverage footer. The image now builds the domain package, the data-bearing layout renders at request time, and authentication initializes lazily with real runtime configuration. The five existing OTP/invite integration cases now exercise the actual Next auth adapter and pass. No production authentication secret is needed or embedded in the build.

## Historical migration compatibility

The first deploy correctly refused migration0005: production records SHA256 `715dde5bb016ceeb3264fe79e14334cb9a9487dcd6b8abd65c0ed1ea445d60b5`, exactly reproduced by removing the later nullable-year correction from the repository SQL. Current SQL hashes to `8fd4aefc5bedea21b3b6fe88c904ce3b0f31a5176458916aa7d3fbb0fead0565`. Production already has nullable `marts.national_stats.year`, no primary key, and the expected `(kind,year)` btree index. The migrator now recognizes only that index/timestamp/hash pair and additionally requires all three schema facts. Every other mismatch still stops deployment; no ledger row is rewritten and no automatic baseline is introduced. Regression tests reject altered timestamps, positions and either unknown checksum.

## Activation result — 2026-09-26

Production release `b688cbd` passed CI/deployment and live administrator mutation checks. Schema upgraded from26to36migrations. Batch `recovery-2026-09-25` was seeded without source traffic:35,810known authority partitions,268participation days,268award days and one initial catalogue page (36,347tasks).

The bounded pilot made exactly6HTTP200attempts and archived215procurement records:100participation notices,100award notices and15direct acquisitions. Two catalogue pages returned4,000institution entries; the other DA authority partition returned0records. Spacing between starts was50.01,56.01,59.00,54.01and54.01seconds. No failures or retries. The permanent collector then continued; at the next recorded check it had8successfulrequests and342archivedrecords. Subsequent live counts are in `/admin`, not this fixed report.

A concurrent deployment initially mistook the one-off pilot for an activated permanent service. The collector session lock prevented overlapping work; the daemon continued only after the pilot released it. Deployment detection now excludes one-off containers, covered by dedicated tests. The documents stream is enabled again under the same budget. The05:00publisher is not scheduled; collection does not itself refresh public data.
