# Changelog: setup

### 2026-07-12 - Phase 3 PLAN.md

**Heartbeat uses postgres.js client directly, not drizzle-orm**
- **What:** Heartbeat job queries via the `sql` client from `createDb()` instead of importing `drizzle-orm`.
- **Why:** pnpm strict deps — drizzle-orm isn't a direct dependency of the ingestion app, and adding it just for one count query was unnecessary.
- **Files:** `apps/ingestion/src/jobs/heartbeat.ts`

### 2026-07-12 - Phase 2 PLAN.md

**Migrations own schema creation; docker init script removed**
- **What:** Removed `infra/postgres-init/01-schemas.sql` (created in Phase 1) and its compose mount; edited initial Drizzle migration to `CREATE SCHEMA IF NOT EXISTS`.
- **Why:** Generated migration's plain `CREATE SCHEMA` collided with the pre-created schemas and failed. Single owner (migrations) works on any Postgres — VPS deploy later needs no init-script wiring.
- **Files:** `infra/docker-compose.yml`, `packages/db/migrations/0000_early_retro_girl.sql`

**Duplicate-rejection test asserts on error cause code**
- **What:** Integration test checks wrapped error `cause.code === '23505'` (unique_violation) instead of message regex.
- **Why:** Drizzle wraps postgres.js errors; message text is the query, not the constraint.
- **Files:** `packages/db/test/raw-documents.integration.test.ts`

**`@seap/db` unit test script passes with no tests**
- **What:** Added `--passWithNoTests` to the unit `test` script (integration tests run separately via `test:integration`).
- **Why:** db package currently has only integration tests; CI without Postgres must stay green.
- **Files:** `packages/db/package.json`
