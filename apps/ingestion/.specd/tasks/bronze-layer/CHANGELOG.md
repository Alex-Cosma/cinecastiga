# Changelog: bronze-layer

### 2026-07-12 - Phase 2 PLAN.md

**test:integration uses vitest substring filter, not glob**
- **What:** `vitest run integration.test` instead of the planned `vitest run 'test/*.integration.test.ts'`.
- **Why:** vitest CLI args are filename filters, not shell globs — the quoted glob matched zero files (silent no-op, worse than failing).
- **Files:** `apps/ingestion/package.json`
