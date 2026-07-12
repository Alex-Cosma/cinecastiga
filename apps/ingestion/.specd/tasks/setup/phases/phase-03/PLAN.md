---
task: setup
phase: 3
depends_on: [1, 2]
creates:
  - packages/scraper-clients/package.json
  - packages/scraper-clients/tsconfig.json
  - packages/scraper-clients/src/index.ts
  - packages/scraper-clients/src/http-client.ts
  - packages/scraper-clients/test/http-client.test.ts
  - apps/ingestion/package.json
  - apps/ingestion/tsconfig.json
  - apps/ingestion/src/index.ts
  - apps/ingestion/src/jobs/index.ts
  - apps/ingestion/src/jobs/heartbeat.ts
  - apps/ingestion/src/scrape/README.md
  - apps/ingestion/src/normalize/README.md
  - apps/ingestion/src/aggregate/README.md
  - apps/ingestion/test/worker.integration.test.ts
modifies: []
---

# Phase 3: Ingestion app skeleton

## Objective

Worker process boots: graphile-worker runs against docker Postgres with a cron heartbeat job; rate-limited HTTP client skeleton exists; module structure enforces the bronze-first rule.

## Context

**From Phase 2:** `@seap/db` (createDb, DATABASE_URL convention with local default) and `@seap/domain` build green; migrations own schemas; docker Postgres up.

**Relevant Decisions:**
- DEC-006 (project): graphile-worker on same Postgres, no Redis
- Politeness defaults from FEATURE.md: max ~5 concurrent, honest User-Agent with contact info, exponential backoff on 403/429
- Bronze-first: `scrape/` writes raw only, `normalize/` reads raw only — stated in module READMEs so later phases inherit the boundary

---

## Tasks

### Task 1: packages/scraper-clients — polite HTTP client skeleton

**Files:** `packages/scraper-clients/{package.json,tsconfig.json}`, `src/http-client.ts`, `src/index.ts`, `test/http-client.test.ts`

**Action:**
ESM package `@seap/scraper-clients`. No fetch library — Node 22 native fetch. Export `createHttpClient(opts)`:
- Options: baseUrl, userAgent (required — no default that hides identity), maxConcurrency (default 5), minDelayMs between requests (default 500), maxRetries (default 3)
- Semaphore limiting concurrency; per-request exponential backoff with jitter on 429/403/5xx/network errors; gives up after maxRetries with typed `ScrapeError` carrying status + attempt count
- Returns parsed JSON + response metadata (status, url, fetchedAt) — caller archives raw payload
Unit tests with a local `node:http` test server: concurrency cap respected, retry on 429 then success, honest User-Agent header sent.

**Verify:**
```bash
pnpm --filter @seap/scraper-clients build && pnpm --filter @seap/scraper-clients test
```

**Done when:**
- [ ] Build + tests green (no external network in tests)

---

### Task 2: apps/ingestion — worker entry + heartbeat job

**Files:** `apps/ingestion/{package.json,tsconfig.json}`, `src/index.ts`, `src/jobs/{index.ts,heartbeat.ts}`

**Action:**
Package `ingestion` (private app). Deps: graphile-worker, `@seap/db`, `@seap/domain`, `@seap/scraper-clients`.
- `src/jobs/heartbeat.ts`: task logs a heartbeat line + counts raw_documents rows (proves DB wiring), exported task function
- `src/jobs/index.ts`: task list + crontab (`* * * * * heartbeat` every minute for dev)
- `src/index.ts`: `run()` from graphile-worker with connectionString from DATABASE_URL (same default convention as @seap/db), concurrency 5, graceful shutdown on SIGINT/SIGTERM
- Scripts: `dev` (tsx watch src/index.ts), `start` (node dist), build/test/typecheck/lint matching other packages

**Verify:**
```bash
pnpm --filter ingestion build
```

**Done when:**
- [ ] Builds clean; graphile-worker types resolve

---

### Task 3: module boundaries + worker integration test

**Files:** `apps/ingestion/src/{scrape,normalize,aggregate}/README.md`, `apps/ingestion/test/worker.integration.test.ts`

**Action:**
- READMEs (3-5 lines each) stating the boundary: scrape → writes `raw.raw_documents` only, never parses; normalize → reads raw, writes core, never fetches; aggregate → reads core, writes marts
- Integration test: `runOnce()` graphile-worker programmatically, enqueue heartbeat via `quickAddJob`, assert it executed (graphile-worker schema auto-created in docker Postgres). Separate `test:integration` script; unit `test` passes with no tests.

**Verify:**
```bash
pnpm --filter ingestion test:integration
pnpm -r build && pnpm -r test && pnpm turbo typecheck
```

**Done when:**
- [ ] Worker executes an enqueued job against docker Postgres
- [ ] Full workspace green

---

## Verification

After all tasks complete:

```bash
pnpm -r build && pnpm -r test
pnpm --filter ingestion test:integration
docker compose -f infra/docker-compose.yml exec -T postgres psql -U seap -d seap -c "\dt graphile_worker.*" | head -5
```

**Phase is complete when:**
- [ ] All tasks marked done
- [ ] All verification commands pass

---

## Implementation Log

Capture decisions/deviations to `.specd/tasks/setup/CHANGELOG.md`.
