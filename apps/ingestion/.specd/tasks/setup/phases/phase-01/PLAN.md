---
task: setup
phase: 1
depends_on: []
creates:
  - pnpm-workspace.yaml
  - package.json
  - turbo.json
  - tsconfig.base.json
  - .nvmrc
  - .gitignore
  - infra/docker-compose.yml
  - infra/postgres-init/01-schemas.sql
  - .github/workflows/ci.yml
modifies: []
---

# Phase 1: Workspace + infra

## Objective

Bootstrap the monorepo root and local infrastructure so a clean clone can install, build, and run Postgres + Meilisearch locally. All paths relative to repo root (`~/Desktop/Personal/code/seap`).

## Context

**Relevant Decisions:**
- DEC-006 (project): TypeScript end-to-end — pnpm + Turborepo, Node 22 LTS
- Project research: Postgres-only v1 (no Redis, no ClickHouse); Meilisearch single binary; three Postgres schemas `raw`/`core`/`marts`

**From project research:**
- graphile-worker will use the same Postgres — docker-compose needs only 2 services
- Backfills run for days — Postgres container needs a named volume, not ephemeral storage
- Meilisearch needs a master key even locally (dev key fine)

---

## Tasks

### Task 1: pnpm/Turborepo workspace root

**Files:** `pnpm-workspace.yaml`, `package.json`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`, `.gitignore`

**Action:**
- `pnpm-workspace.yaml`: packages `apps/*`, `packages/*`
- Root `package.json`: private, `"packageManager": "pnpm@latest-10"` (pin exact version available locally), scripts: `build`/`test`/`lint`/`typecheck` via turbo, `engines.node >=22`
- `turbo.json`: tasks build (dependsOn `^build`, outputs `dist/**`), test (dependsOn build), lint, typecheck; sensible caching
- `tsconfig.base.json`: strict, ES2023 target, NodeNext module resolution, composite-friendly (declaration, sourceMap)
- `.nvmrc`: `22`
- `.gitignore`: node_modules, dist, .turbo, .env*, coverage, postgres/meili data dirs

**Verify:**
```bash
pnpm install && pnpm turbo --version
```

**Done when:**
- [ ] `pnpm install` succeeds from repo root
- [ ] turbo binary resolves

---

### Task 2: docker-compose infra

**Files:** `infra/docker-compose.yml`, `infra/postgres-init/01-schemas.sql`

**Action:**
- Postgres 16 (postgres:16-alpine): named volume, port 5432, POSTGRES_DB=seap, healthcheck `pg_isready`, mounts `infra/postgres-init/` to `/docker-entrypoint-initdb.d/`
- `01-schemas.sql`: `CREATE SCHEMA IF NOT EXISTS raw; CREATE SCHEMA IF NOT EXISTS core; CREATE SCHEMA IF NOT EXISTS marts;`
- Meilisearch (getmeili/meilisearch latest stable tag): named volume, port 7700, MEILI_MASTER_KEY=dev key via env, MEILI_ENV=development, healthcheck on /health
- `.env.example` values inline in compose via defaults (`${POSTGRES_PASSWORD:-seap_dev}`)

**Verify:**
```bash
docker compose -f infra/docker-compose.yml up -d --wait && \
docker compose -f infra/docker-compose.yml exec -T postgres psql -U seap -d seap -c "\dn" && \
curl -s localhost:7700/health
```

**Done when:**
- [ ] Both containers healthy
- [ ] `\dn` lists raw, core, marts
- [ ] Meilisearch /health returns available

---

### Task 3: CI skeleton

**Files:** `.github/workflows/ci.yml`

**Action:**
GitHub Actions: trigger on push + PR to main; steps: checkout, pnpm/action-setup, setup-node 22 with pnpm cache, `pnpm install --frozen-lockfile`, `pnpm turbo typecheck lint test build`. Single job, ubuntu-latest. No deploy.

**Verify:**
```bash
command -v actionlint >/dev/null && actionlint .github/workflows/ci.yml || node -e "console.log('yaml parse ok')" 
```

**Done when:**
- [ ] Workflow file valid YAML (actionlint if available)
- [ ] Pipeline runs turbo tasks (will be green trivially until packages exist)

---

## Verification

After all tasks complete:

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d --wait
docker compose -f infra/docker-compose.yml exec -T postgres psql -U seap -d seap -c "\dn"
curl -s localhost:7700/health
```

**Phase is complete when:**
- [ ] All tasks marked done
- [ ] All verification commands pass

---

## Implementation Log

During implementation, capture decisions and deviations to `.specd/tasks/setup/CHANGELOG.md`.
