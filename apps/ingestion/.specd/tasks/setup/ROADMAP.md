# Roadmap: setup

## Overview

| Metric | Value |
|--------|-------|
| Total Phases | 3 |
| Current Phase | 1 |
| Status | Not Started |

---

## Phases

- [ ] **Phase 1: Workspace + infra** — pnpm/Turborepo monorepo root, docker-compose (Postgres + Meilisearch), CI skeleton
- [ ] **Phase 2: Shared packages** — `packages/db` (Drizzle, raw/core/marts schemas, migrations, `raw_documents`), `packages/domain` (canonical types)
- [ ] **Phase 3: Ingestion app skeleton** — graphile-worker wiring, scraper-client skeleton, module structure, tests green

---

## Phase Details

### Phase 1: Workspace + infra

**Goal:** Clean-clone developer loop exists: install, build, and local infra all work.

**Creates:**
- `pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `tsconfig.base.json` — workspace
- `infra/docker-compose.yml` — Postgres 16+ (raw/core/marts schemas via init script) + Meilisearch
- `.github/workflows/ci.yml` — install → typecheck → test → build
- `.gitignore`, `.nvmrc` — hygiene

**Plan:** `phases/phase-01/PLAN.md`

**Success Criteria:**
1. `pnpm install` succeeds from clean clone
2. `docker compose -f infra/docker-compose.yml up -d` → Postgres healthy with three schemas; Meilisearch healthy
3. CI workflow syntactically valid (runs on push)

**Dependencies:** None (first phase)

---

### Phase 2: Shared packages

**Goal:** Typed database layer exists: schemas migrate, `raw_documents` table ready, domain types importable.

**Creates:**
- `packages/db/` — Drizzle config + schema definitions for `raw` (raw_documents), `core` (placeholder), `marts` (placeholder); migration tooling; typed client factory
- `packages/domain/` — TS types: Notice, Procedure, Award, Contract, DirectAcquisition, Entity, RedFlag
- One passing test per package (Vitest)

**Plan:** `phases/phase-02/PLAN.md`

**Success Criteria:**
1. Migrations apply and roll back cleanly against docker Postgres
2. `raw_documents` has source, external_id, payload jsonb, content_hash, fetched_at, endpoint_version + unique constraint on (source, external_id, content_hash)
3. `pnpm -r build && pnpm -r test` green

**Dependencies:** Phase 1 complete

---

### Phase 3: Ingestion app skeleton

**Goal:** Worker process runs: graphile-worker executes a scheduled no-op job; module structure enforces bronze-first rule.

**Creates:**
- `apps/ingestion/package.json`, `src/index.ts` — entry, graceful shutdown
- `apps/ingestion/src/jobs/` — graphile-worker task list + cron schedule with no-op heartbeat job
- `apps/ingestion/src/scrape/`, `src/normalize/`, `src/aggregate/` — module skeletons with README-level notes (scrape writes raw only; normalize reads raw only)
- `packages/scraper-clients/` — rate-limited HTTP client skeleton (honest User-Agent, retry/backoff, ~5 max concurrency default)
- Vitest test proving worker boots and job runs

**Plan:** `phases/phase-03/PLAN.md`

**Success Criteria:**
1. `pnpm --filter ingestion dev` starts worker; heartbeat job fires on schedule and logs
2. Worker connects to docker Postgres, graphile-worker schema auto-created
3. `pnpm -r build && pnpm -r test && pnpm -r lint` green; CI passes

**Dependencies:** Phase 2 complete

---

## Execution Order

```
Phase 1: Workspace + infra
└── PLAN.md
    ↓
Phase 2: Shared packages
└── PLAN.md
    ↓
Phase 3: Ingestion app skeleton
└── PLAN.md
```

---

## Key Decisions Affecting Roadmap

| Decision | Impact on Phases |
|----------|------------------|
| DEC-006 (project): TypeScript end-to-end | Single toolchain: pnpm/Turborepo, Drizzle, zod, graphile-worker |
| Project research: Postgres-only v1, no Redis | Job queue = graphile-worker on same Postgres; docker-compose has only 2 services |
| Bronze-first rule (PITFALLS.md) | raw_documents lands in Phase 2 before any fetcher exists; module boundaries in Phase 3 enforce archive-before-parse |
| Out of scope (FEATURE.md) | No actual scraping logic, no web app, no VPS deploy in this task |
