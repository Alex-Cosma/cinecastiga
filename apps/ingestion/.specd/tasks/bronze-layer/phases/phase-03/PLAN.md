---
task: bronze-layer
phase: 3
depends_on: [1, 2]
creates:
  - apps/ingestion/src/scrape/window.ts
  - apps/ingestion/src/scrape/watermark.ts
  - apps/ingestion/src/scrape/elicitatie/client.ts
  - apps/ingestion/src/scrape/elicitatie/notices.ts
  - apps/ingestion/src/scrape/elicitatie/state-rescan.ts
  - apps/ingestion/test/window.test.ts
  - apps/ingestion/test/notices-scrape.integration.test.ts
modifies:
  - apps/ingestion/src/jobs/index.ts
---

# Phase 3: Notice scrape jobs

## Objective

Tenders + awards flowing into raw_documents end-to-end: windowed scrape with watermark transactions, invariant checks gating cursor advancement (DEC-008), award contracts pagination, trailing state re-scan (DEC-003), reconciliation per run.

## Context

**Decisions:** DEC-003 (publicationDate cursor + 30–60d state re-scan), DEC-007 (Europe/Bucharest, closed windows D-1 and older), DEC-008 (validate-then-advance).
**From RESEARCH.md §6:** shared client singleton with DI at task-construction; chunked self-re-enqueueing jobs, jobKey overlap protection; watermark upsert in same tx as page inserts; ~239 notices/day → day windows trivially safe, ≤1 week windows.

---

## Tasks

### Task 1: window + watermark helpers

**Files:** `src/scrape/window.ts`, `src/scrape/watermark.ts`, `test/window.test.ts`

**Action:**
- `window.ts`: Europe/Bucharest date helpers using `Intl.DateTimeFormat` (no dep): `bucharestToday()`, `isoDaysAgo(n)`, `closedWindow(days)` → `{start, end}` ending D-1, `eachDay(start, end)` iterator. Unit tests incl. DST-boundary dates (2026-03-29, 2026-10-25).
- `watermark.ts`: typed cursor `{windowStart: IsoDate, page: number}`; `readWatermark(db, source)` (parse JSON, fail loud on garbage), `writeWatermark(tx, source, cursor)` (onConflictDoUpdate). Works with a drizzle transaction handle.

**Verify:**
```bash
pnpm --filter ingestion build && pnpm --filter ingestion test
```

**Done when:**
- [ ] Unit tests green incl. DST dates

---

### Task 2: notice scrape core

**Files:** `src/scrape/elicitatie/client.ts`, `src/scrape/elicitatie/notices.ts`

**Action:**
- `client.ts`: lazy singleton `getElicitatieClient()` reading `SCRAPE_UA` env (fail loud if unset outside tests), politeness env overrides (`SCRAPE_CONCURRENCY`, `SCRAPE_MIN_DELAY_MS`); test override setter.
- `notices.ts`: `scrapeNoticesWindow(deps, {family: 'tenders'|'awards', window})`:
  1. startScrapeRun
  2. resume page from watermark if same window
  3. per page: list → **invariants** (JSON envelope shape, every item publicationDate within window — else abort, cursor untouched, run failed with error) → fetch details (Promise.all — shared client caps concurrency) → awards also getNoticeContracts (skip/take loop, take 200) → build ArchivableDocuments (list item + detail + contracts as separate rows: `tender-list:v1`/`tender-detail:v1`/`award-contracts:v1`, externalId `tender:{caNoticeId}` etc.) → `db.transaction`: archiveDocuments + writeWatermark
  4. finishScrapeRun with totals (reportedTotal = envelope total when searchTooLong false, else null + failed status)
- Deps injected: `{db, client}` — testable against mock server.

**Verify:**
```bash
pnpm --filter ingestion build
```

**Done when:**
- [ ] Builds clean; no HTTP outside injected client; no raw_documents writes outside archiveDocuments

---

### Task 3: worker wiring

**Files:** `src/jobs/index.ts` (modify), new task factories in `src/scrape/elicitatie/notices.ts`

**Action:**
- `makeScrapeNoticesTask(deps, family)` → graphile-worker Task: computes closed window (default: since watermark, max 7 days per job run), runs scrapeNoticesWindow, re-enqueues itself via `helpers.addJob` with same jobKey when more window remains
- Register `scrape_tenders`, `scrape_awards` in taskList; crontab: `30 4 * * * scrape_tenders ?max=1` and `40 4 * * * scrape_awards ?max=1` (after 03:00 Bucharest incl. DST slack; conservative daily)
- Demote heartbeat to `*/10 * * * *`

**Verify:**
```bash
pnpm --filter ingestion build && pnpm --filter ingestion test
```

**Done when:**
- [ ] Tasks registered; jobKey prevents overlapping runs per family

---

### Task 4: state re-scan job

**Files:** `src/scrape/elicitatie/state-rescan.ts`, `src/jobs/index.ts`

**Action:**
`rescanNoticeStates(deps, {days: 45})`: list-only sweep of trailing publication window (both families), compare each item's `noticeStateDate` against latest archived list-row for that caNoticeId (query raw_documents by externalId + endpointVersion prefix, order fetched_at desc); changed → re-fetch detail (+contracts for awards) and archive. Weekly cron `0 6 * * 1 rescan_notice_states ?max=1`. Records its own scrape_run (source `elicitatie:state-rescan`).

**Verify:**
```bash
pnpm --filter ingestion build
```

**Done when:**
- [ ] Only changed notices re-fetched (list-only cost otherwise)

---

### Task 5: integration tests (mock server)

**Files:** `test/notices-scrape.integration.test.ts`

**Action:**
Mock SICAP server (recording pattern from elicitatie.test.ts) + docker Postgres:
1. Full window: 2 pages of tenders + details archived; scrape_run completed, counts match, deviation 0; watermark at window end
2. Idempotent re-run: same window again → all skipped, 0 inserted
3. Kill/resume: run once with server failing hard at page 2 → watermark stuck at page 1; re-run with healthy server → resumes page 2, no gap (all externalIds present exactly once per content_hash)
4. Invariant abort: server returns item outside window → run failed, watermark unchanged, error recorded
5. Awards: contracts fetched via skip/take (server serves 250 contracts → two calls), archived as award-contracts rows

**Verify:**
```bash
pnpm --filter ingestion test:integration && pnpm -r build && pnpm -r test && pnpm turbo typecheck
```

**Done when:**
- [ ] All 5 scenarios green; no live network

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
