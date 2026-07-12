---
task: setup
phase: 2
depends_on: [1]
creates:
  - packages/db/package.json
  - packages/db/tsconfig.json
  - packages/db/drizzle.config.ts
  - packages/db/src/index.ts
  - packages/db/src/client.ts
  - packages/db/src/schema/raw.ts
  - packages/db/src/schema/core.ts
  - packages/db/src/schema/marts.ts
  - packages/db/src/schema/index.ts
  - packages/db/test/raw-documents.test.ts
  - packages/domain/package.json
  - packages/domain/tsconfig.json
  - packages/domain/src/index.ts
  - packages/domain/test/types.test.ts
modifies: []
---

# Phase 2: Shared packages

## Objective

Typed database layer + canonical domain types: Drizzle schemas for raw/core/marts, working migrations against docker Postgres, `raw_documents` bronze table ready for Phase 2 (project-level) scraping work.

## Context

**From Phase 1:** workspace live (pnpm 9.4.0, turbo 2.10.4, strict tsconfig.base.json); docker Postgres running with raw/core/marts schemas at localhost:5432 (seap/seap_dev); Meilisearch at :7700.

**Relevant Decisions:**
- DEC-006 (project): Drizzle ORM, zod, TypeScript strict
- Bronze-first rule: `raw_documents` is append-only archive keyed by (source, external_id, content_hash); JSONB payload; endpoint_version for schema-drift tracking
- core/marts get placeholder tables only — real modeling happens in project Phases 3/5; avoid speculative schema now

**Connection string convention:** `DATABASE_URL=postgres://seap:seap_dev@localhost:5432/seap` (env, with default for local dev).

---

## Tasks

### Task 1: packages/domain — canonical types

**Files:** `packages/domain/package.json`, `tsconfig.json`, `src/index.ts`, `test/types.test.ts`

**Action:**
ESM package `@seap/domain`, no runtime deps (zod comes later with real parsers). Export TS types/interfaces: `SourceSystem` ('elicitatie' | 'datagov'), `NoticeType` union (tender, award, contract, direct_acquisition...), `Entity` (id, cui, canonicalName, kind: authority|supplier), `Procedure`, `Award`, `Contract`, `DirectAcquisition`, `RedFlag` (flagType, severity, entityId?, procedureId?, computedAt, sampleSize). Keep fields minimal-but-plausible; these evolve in later project phases. Build via `tsc`; vitest smoke test type-checks an object literal per type.

**Verify:**
```bash
pnpm --filter @seap/domain build && pnpm --filter @seap/domain test
```

**Done when:**
- [ ] Package builds to dist/ with declarations
- [ ] Test passes

---

### Task 2: packages/db — Drizzle schemas + client

**Files:** `packages/db/package.json`, `tsconfig.json`, `drizzle.config.ts`, `src/schema/{raw,core,marts,index}.ts`, `src/client.ts`, `src/index.ts`

**Action:**
ESM package `@seap/db`. Deps: drizzle-orm, postgres (postgres.js driver); dev: drizzle-kit.
- `schema/raw.ts`: `pgSchema('raw')` → `raw_documents`: id bigserial PK, source text notNull, external_id text notNull, endpoint_version text notNull, content_hash text notNull, payload jsonb notNull, fetched_at timestamptz notNull default now. Unique index on (source, external_id, content_hash); index on (source, fetched_at).
- `schema/core.ts`: `pgSchema('core')` → placeholder `ingestion_watermarks` table (source text, cursor text, updated_at) — genuinely needed soon, not speculative.
- `schema/marts.ts`: `pgSchema('marts')` → no tables yet, export the pgSchema handle only.
- `client.ts`: `createDb(url?)` factory using postgres.js, default `process.env.DATABASE_URL` falling back to local dev URL.
- `drizzle.config.ts`: schema glob, out `./migrations`, dialect postgresql.

**Verify:**
```bash
pnpm --filter @seap/db build
```

**Done when:**
- [ ] Builds clean under strict tsconfig

---

### Task 3: migrations — generate + apply + verify

**Files:** `packages/db/migrations/*` (generated), `packages/db/package.json` scripts, `packages/db/test/raw-documents.test.ts`

**Action:**
- Scripts: `db:generate` (drizzle-kit generate), `db:migrate` (drizzle-kit migrate), `db:studio`.
- Generate initial migration; apply against docker Postgres.
- Integration test (vitest): insert a row into raw_documents, verify content_hash uniqueness constraint rejects duplicate (source, external_id, content_hash), verify jsonb payload roundtrip. Test skips gracefully (or fails loud with clear message) if DATABASE_URL unreachable — decide: fail loud locally, `test:integration` script separate from unit `test` so CI without Postgres stays green.

**Verify:**
```bash
pnpm --filter @seap/db db:migrate && pnpm --filter @seap/db test:integration
```

**Done when:**
- [ ] Migration applies cleanly; re-running is a no-op
- [ ] raw_documents exists in `raw` schema with unique constraint
- [ ] Integration test green against docker Postgres

---

## Verification

After all tasks complete:

```bash
pnpm -r build && pnpm -r test
pnpm --filter @seap/db db:migrate
pnpm --filter @seap/db test:integration
docker compose -f infra/docker-compose.yml exec -T postgres psql -U seap -d seap -c "\d raw.raw_documents"
```

**Phase is complete when:**
- [ ] All tasks marked done
- [ ] All verification commands pass

---

## Implementation Log

Capture decisions/deviations to `.specd/tasks/setup/CHANGELOG.md`.
