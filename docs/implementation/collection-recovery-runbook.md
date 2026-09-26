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
