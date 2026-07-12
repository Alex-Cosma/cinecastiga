# Task: setup

## What This Is

Initial setup for **ingestion** — the scheduled worker that scrapes e-licitatie.ro + data.gov.ro, archives raw responses, normalizes into the canonical schema, resolves entities, and computes marts/red-flags. This setup task also bootstraps the shared monorepo (Phase 1 of ROADMAP.md), since ingestion is the first sub-project built.

## Technical Requirements

### Must Create

Monorepo root (first sub-project bootstraps shared infra):
- [ ] `pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `tsconfig.base.json` — pnpm/Turborepo workspace
- [ ] `infra/docker-compose.yml` — Postgres 16+ (schemas: `raw`, `core`, `marts`) + Meilisearch, single-VPS shape
- [ ] `.github/workflows/ci.yml` — install, typecheck, test, build
- [ ] `packages/db/` — Drizzle schema + migrations for the three schemas; `raw_documents` table first (source, external_id, payload jsonb, content_hash, fetched_at, endpoint_version)
- [ ] `packages/domain/` — shared TS types: Notice, Procedure, Award, Contract, DirectAcquisition, Entity, RedFlag
- [ ] `packages/scraper-clients/` — skeleton: rate-limited HTTP client (honest User-Agent with contact info, retry/backoff via exponential strategy, response versioning)

Ingestion app:
- [ ] `apps/ingestion/package.json`, `src/index.ts` — entry point
- [ ] `apps/ingestion/src/jobs/` — graphile-worker wiring + a first scheduled no-op job proving the queue runs
- [ ] `apps/ingestion/src/scrape/`, `src/normalize/`, `src/aggregate/` — module skeletons
- [ ] Vitest config + one passing test per package

### Must Integrate With

- Root orchestrator `.specd/config.json` — sub-project registered
- `apps/web` (future) — consumes `packages/db` and `packages/domain`; keep both apps' concerns out of shared packages
- Postgres from `infra/docker-compose.yml` — graphile-worker uses same DB, no Redis

### Constraints

- **TypeScript end-to-end** (research SUMMARY.md conflict resolution) — zod for fail-loud response parsing; red-flag math lives in SQL, not dataframes
- **Postgres-only v1** — no ClickHouse, no Redis; graphile-worker for jobs (`FOR UPDATE SKIP LOCKED`)
- **Bronze-first rule** — nothing parses a response that hasn't been archived to `raw_documents`; enforce in module structure (scrape/ writes raw only; normalize/ reads raw only)
- **Politeness defaults** — low concurrency (~5 connections max, per sicap-parser prior art), conservative rate limits, automatic backoff on 403/429 patterns
- **Node 22 LTS**, Postgres 16+, latest stable Meilisearch

---

## Success Criteria

- [ ] `pnpm install && pnpm -r build && pnpm -r test` green from clean clone
- [ ] `docker compose -f infra/docker-compose.yml up` → Postgres with raw/core/marts schemas + Meilisearch healthy
- [ ] Migrations apply and roll back cleanly
- [ ] graphile-worker runs the scheduled no-op job on its cron
- [ ] CI pipeline green on push
- [ ] Lint passes

---

## Out of Scope

- [X] Actual e-licitatie.ro scraping logic — Phase 2 task (bronze layer)
- [X] Entity resolution, normalization transforms — Phase 3
- [X] Web app scaffolding — separate `web` setup task
- [X] Deployment to VPS/Coolify — after local dev loop works

---

## Initial Context

### User Need
Platform ingests everything SEAP/SICAP publishes (incl. direct-purchase firehose, millions/yr), 2018→now, into a store that supports fast search + critical analytics. See `.specd/tasks/project/` at repo root: PROJECT.md, REQUIREMENTS.md (REQ-001, 002, 013, 014), ROADMAP.md (Phases 1-5, 8), research/.

### Integration Points
Shared packages consumed by future `apps/web`; Postgres is the single system of record and job queue.

### Key Constraints
Raw archive before parsing (top pitfall: schema drift + re-scrape cost); silent-gap reconciliation against data.gov.ro; CUI-keyed entity resolution; solo-dev low-ops (one VPS, no Redis/Kafka/ClickHouse in v1).
