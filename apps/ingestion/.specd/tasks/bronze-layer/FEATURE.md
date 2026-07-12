# Task: bronze-layer

## What This Is

E-licitatie.ro fetchers writing the append-only raw archive: tender notices, award/contract notices, AND direct acquisitions → `raw.raw_documents`, with durable cursors, count reconciliation, and a `--sample` mode for local dev. First real ingestion — implements project ROADMAP Phase 2 (extended with direct acquisitions from Phase 4, per user decision).

## Technical Requirements

### Must Create

- [ ] `packages/scraper-clients/src/elicitatie/` — endpoint-specific clients over the existing `createHttpClient`: tender list/detail, award list/detail, direct-acquisition list/detail (actual paths from research; sicap-parser prior art as starting point)
- [ ] `apps/ingestion/src/scrape/archive.ts` — idempotent writer: content-hash (SHA-256 of canonical payload bytes) → insert into `raw.raw_documents`, on-conflict-do-nothing, returns inserted/skipped
- [ ] `apps/ingestion/src/scrape/elicitatie/*.ts` — per-notice-type scrape jobs: page through list endpoint from watermark, fetch details, archive raw, advance `core.ingestion_watermarks` cursor only after page fully archived
- [ ] `apps/ingestion/src/scrape/reconcile.ts` — per-run counts: fetched vs source-reported totals; deviation → loud log/alert record
- [ ] `apps/ingestion/src/jobs/` — graphile-worker tasks + cron entries per notice type; conservative schedules
- [ ] Sample mode: `SCRAPE_SAMPLE=30d` (or CLI flag via dev script) — restrict fetch window to last N days for local dev
- [ ] Integration tests: archive idempotency (re-run → 0 new rows), cursor resume mid-stream (kill/restart → no gap, no duplicate), reconciliation mismatch detection — all against local Postgres with a mock HTTP server (no live scraping in tests)

### Must Integrate With

- `packages/scraper-clients/src/http-client.ts` — politeness layer (5 conns, backoff, honest UA); endpoint clients compose it, never bypass it
- `packages/db` — `rawDocuments`, `ingestionWatermarks`; new tables via Drizzle migration if needed (e.g. `core.scrape_runs` for reconciliation records)
- `apps/ingestion/src/jobs/index.ts` — task list + crontab registration
- Bronze-first boundary (`src/scrape/README.md`): writes raw only, parses only enough to page (ids, totals, dates)

### Constraints

- **Archive before anything** — no payload leaves scrape/ without a raw_documents row; normalize comes in the NEXT task
- **Politeness** — one shared client instance per source; live-endpoint schedules conservative; sample mode default for local dev so casual dev runs don't hammer the API
- **Watermark semantics** — cursor advances only after all rows of the page are archived; crash → resume re-fetches at most one page (idempotent via content_hash)
- **Endpoint versioning** — every archived row carries `endpoint_version`; response shape assumptions documented per endpoint so drift is diagnosable
- **No login/auth against e-licitatie** — public endpoints only
- **direct acquisitions volume** — list pages can be huge; job must chunk by date window internally, never hold a full day's records in memory

## Success Criteria

- [ ] `pnpm --filter ingestion dev` with SCRAPE_SAMPLE=30d fills raw_documents with real tender + award + direct-acquisition payloads from the last 30 days (manual run, politeness-limited)
- [ ] Re-running the same window inserts 0 new rows (hash dedup observed in logs)
- [ ] Kill worker mid-scrape, restart → resumes from watermark, reconciliation shows no gap
- [ ] Reconciliation record per run: fetched vs reported counts, deviation flagged
- [ ] All integration tests green against mock server; CI green (no live network in CI)

## Out of Scope

- [X] Full 2018→now backfill orchestration — separate task (project Phase 4); this task builds the fetchers backfill will reuse
- [X] Parsing/normalization into core tables — next task (project Phase 3)
- [X] data.gov.ro dump ingestion — reconciliation cross-check task, later
- [X] Meilisearch, marts, red flags — later phases

## Initial Context

### User Need
"Regularly grabs everything e-licitatie has to offer" — this is the grab. User built this before (2020, Spring): expects messy data; endpoints must be re-discovered (no specifics remembered).

### Integration Points
Existing skeleton: polite HTTP client, raw_documents table, watermarks table, graphile-worker.

### Key Constraints
Silent-gap pitfall is the #1 risk (PITFALLS.md) — reconciliation + durable cursors are core deliverables, not extras. Endpoint shapes unknown until research: verify against live API + sicap-parser/sicap.ai prior art before planning.
