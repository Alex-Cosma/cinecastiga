---
task: bronze-layer
phase: 4
depends_on: [1, 2, 3]
creates:
  - apps/ingestion/src/scrape/elicitatie/cpv-catalog.ts
  - apps/ingestion/src/scrape/elicitatie/da-slicer.ts
  - apps/ingestion/src/scrape/elicitatie/direct-acquisitions.ts
  - apps/ingestion/src/scrape/elicitatie/da-corrections.ts
  - apps/ingestion/test/da-scrape.integration.test.ts
modifies:
  - apps/ingestion/src/jobs/index.ts
  - apps/ingestion/src/scrape/watermark.ts
---

# Phase 4: Direct-acquisition jobs

## Objective

The firehose: adaptive day→cpvCategory→cpvCodeId slicing (DEC-004), finalizationDate cursors with lookback (DEC-003), correction re-fetch, memory-bounded chunked processing.

## Context

**From RESEARCH.md:** 2000-record cap, searchTooLong reliable overflow signal; weekday 8-12k DAs (cat 6 alone can overflow); `cpvCodeId` = SEAP-internal id; `searchCpvs` has `parentId` param (hierarchy — category→codes mapping candidate, unverified live: design behind interface, verify Phase 5); details contain correction flags.
**Reuses:** archive chokepoint, scrape_runs, window helpers, watermark (extended with optional slice key), invariant pattern from notices.

---

## Tasks

### Task 1: CPV catalog + adaptive slicer

**Files:** `src/scrape/elicitatie/cpv-catalog.ts`, `src/scrape/elicitatie/da-slicer.ts`

**Action:**
- `cpv-catalog.ts`: `CpvCatalog` interface `{categories(): Promise<number[]>, codesFor(categoryId): Promise<number[]>}`; `SicapCpvCatalog` implementation over `searchCpvs` with `parentId` (empty → categories, categoryId → codes); in-memory cache per process. LOW-confidence live behavior → interface isolates it; Phase 5 verifies.
- `da-slicer.ts`: `resolveLeafSlices(client, catalog, day)`:
  1. probe day unsliced (pageSize 1) → `searchTooLong` false → single slice `{day}`
  2. else per category: probe → ok → slice `{day, cpvCategoryId}`
  3. overflowing category → per code: slice `{day, cpvCategoryId, cpvCodeId}` (probe only when paginating detects overflow — code count is large, probing all is wasteful; instead return code slices unprobed, scraper handles leaf overflow)
  4. leaf overflow (code-level searchTooLong) → returned as `{slice, overflow: true}` — caller records data-loss alert
  Slice key stringified for cursors: `d`, `c6`, `c6:k12345`.

**Verify:**
```bash
pnpm --filter ingestion build && pnpm --filter ingestion test
```

**Done when:**
- [ ] Slicer unit-tested with fake client/catalog (all 4 paths)

---

### Task 2: DA scrape core + corrections

**Files:** `src/scrape/elicitatie/direct-acquisitions.ts`, `src/scrape/elicitatie/da-corrections.ts`, `src/scrape/watermark.ts` (optional `slice` field)

**Action:**
- `scrapeDaWindow(deps, {window, pageSize, lookbackDays: 2})`: window extended backward by lookback; per day: resolve slices → per slice: paginate → invariants (shape; finalizationDate day match; searchTooLong at leaf → record `failed` slice, continue others, mark run failed at end with error listing lost slices) → details (getView) per item → archive list+detail rows (`da-list:v1`, `da-detail:v1`, externalId `da:{directAcquisitionId}`) + watermark `{windowStart, day, slice, page}` per page in tx. Streaming: never accumulate more than one page of details.
- `da-corrections.ts`: `refetchOpenCorrections(deps, {days: 30})` — jsonb query for da-detail rows with `isOpenForCorrection` or `isOpenForContractCorrection` true fetched in trailing window; re-fetch detail; archive (new hash iff changed). Own scrape_run `elicitatie:da-corrections`.

**Verify:**
```bash
pnpm --filter ingestion build
```

**Done when:**
- [ ] No full-day accumulation; leaf overflow degrades gracefully with loud record

---

### Task 3: worker wiring

**Files:** `src/jobs/index.ts`

**Action:**
`scrape_das` task via factory (same chaining pattern as notices, maxDaysPerRun 2 — DA days are heavy); cron `0 5 * * * scrape_das ?max=1`; `refetch_da_corrections` weekly `0 7 * * 2 ?max=1`.

**Verify:**
```bash
pnpm --filter ingestion build && pnpm --filter ingestion test
```

**Done when:**
- [ ] Registered; no overlap possible per family

---

### Task 4: integration tests

**Files:** `test/da-scrape.integration.test.ts`

**Action:**
Mock DA server with configurable per-slice volumes:
1. Small day, no overflow → single-slice scrape, details archived, deviation 0
2. Overflow day → category fan-out; totals reconcile across category slices
3. Category overflow → code fan-out via mock catalog
4. Leaf overflow → run failed, other slices still archived, error lists lost slice
5. Lookback: window re-covers trailing days idempotently (skips)
6. Corrections: detail with isOpenForCorrection true gets re-fetched and new version archived when payload changed

**Verify:**
```bash
pnpm --filter ingestion test:integration && pnpm -r build && pnpm -r test && pnpm turbo typecheck
```

**Done when:**
- [ ] All 6 scenarios green, no live network

---

## Verification

```bash
pnpm -r build && pnpm -r test && pnpm --filter ingestion test:integration && pnpm turbo typecheck
```

**Phase is complete when:**
- [ ] All tasks done, all green

---

## Implementation Log

Capture deviations to `.specd/tasks/bronze-layer/CHANGELOG.md`.
