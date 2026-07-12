---
task: bronze-layer
phase: 5
depends_on: [1, 2, 3, 4]
creates:
  - apps/ingestion/src/scripts/scrape.ts
modifies:
  - apps/ingestion/package.json
  - apps/ingestion/src/jobs/index.ts
  - apps/ingestion/.specd/tasks/bronze-layer/RESEARCH.md (live findings)
---

# Phase 5: Sample mode + live smoke

## Objective

First real API contact, politely: CLI for explicit-window scrapes, verification of the 3 LOW-confidence endpoints, live smoke runs proving the FEATURE success criteria on real data, real-volume numbers recorded.

## Context

Everything below runs at DEC-005 politeness (conc 3 / 400ms, Retry-After). Request budget for the whole phase: ~2-3k requests (2-day tenders ≈ 1k, 1 quiet-Sunday DA day ≈ 200, probes ≤6). The full 30-day sample (~210k requests, ~24h) is documented for overnight running, NOT executed in-session.

**Env contract:** `SCRAPE_UA` (required), `SCRAPE_SAMPLE_DAYS` (task factories' initial window, default 30), `SCRAPE_CONCURRENCY`/`SCRAPE_MIN_DELAY_MS`.

---

## Tasks

### Task 1: scrape CLI + sample env wiring

**Files:** `src/scripts/scrape.ts`, `package.json` (script `scrape`), `src/jobs/index.ts` (SCRAPE_SAMPLE_DAYS passthrough)

**Action:**
- CLI: `pnpm --filter ingestion scrape --family tenders|awards|das --start YYYY-MM-DD --end YYYY-MM-DD` — calls scrapeNoticesWindow/scrapeDaWindow directly (no worker), prints outcome JSON, exits nonzero on failed run. Uses getElicitatieClient (SCRAPE_UA env).
- Task factories read `SCRAPE_SAMPLE_DAYS` for their no-watermark initial window (jobs/index.ts passes `{sampleDays: env}`).

**Verify:**
```bash
pnpm --filter ingestion build && pnpm -r test
```

**Done when:**
- [ ] CLI builds; bad args → usage message

---

### Task 2: probe LOW-confidence endpoints (≤6 live requests)

**Action:**
Via curl with honest UA + Referer: (1) `PublicDirectAcquisition/getView/{recent id}` still 200s; (2) DA award-notification detail candidates; (3) one eForms-v2-era notice through `C_PUBLIC_CANotice/get`. Record verdicts in RESEARCH.md §8 + CHANGELOG. Back off immediately on 403/429.

**Done when:**
- [ ] 3 verdicts recorded with response-shape notes

---

### Task 3: live smoke runs

**Action:**
1. Tenders, 2-day recent window → expect ~400-500 notices; verify rows in raw_documents (list+detail), scrape_run completed, deviation 0
2. Re-run same window → 0 inserted (idempotency on real data)
3. DAs, one recent Sunday (quiet ~90-200 records) → slicer stays unsliced, details archived, PII fields absent (spot-check SQL)
4. Record real volumes/timings in CHANGELOG; any surprises (shape drift, rate limiting) → CHANGELOG + RESEARCH update

**Done when:**
- [ ] Real SICAP payloads in local raw_documents; idempotent re-run proven live; no 429/403 encountered (or backoff observed working)

---

### Task 4: wrap-up docs

**Action:**
Update RESEARCH.md §8 confidence table from probe results; CHANGELOG entry with live-run numbers; document the overnight 30-day sample procedure (start worker with SCRAPE_UA, enqueue via CLI windows or let cron chain) in `apps/ingestion/README.md` (create — short runbook: env vars, docker compose up, migrate, dev, scrape CLI, schedules).

**Verify:**
```bash
pnpm -r build && pnpm -r test && pnpm --filter ingestion test:integration && pnpm turbo typecheck
```

**Done when:**
- [ ] README runbook exists; docs updated; workspace green

---

## Verification

FEATURE.md success criteria checklist against live data (sample-scale):
- [ ] Real tender + award + DA payloads land locally via sample runs
- [ ] Re-run inserts 0 (hash dedup observed live)
- [ ] Reconciliation rows populated with real counts
- [ ] All integration tests still green; CI green (no live network in CI)

---

## Implementation Log

Capture live findings to `.specd/tasks/bronze-layer/CHANGELOG.md`.
