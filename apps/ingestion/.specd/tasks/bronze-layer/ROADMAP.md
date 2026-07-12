# Roadmap: bronze-layer

## Overview

| Metric | Value |
|--------|-------|
| Total Phases | 5 |
| Current Phase | 1 |
| Status | Not Started |

---

## Phases

- [ ] **Phase 1: Elicitatie endpoint clients** — typed clients for the verified api-pub surface, mandatory headers, politeness per DEC-005/009, envelope guards
- [ ] **Phase 2: Archive plumbing** — PII redaction, canonical hash, idempotent archive writer, `core.scrape_runs` migration
- [ ] **Phase 3: Notice scrape jobs** — tenders + awards: windowed chunked jobs, watermark transactions, contracts pagination, state re-scan, reconciliation
- [ ] **Phase 4: Direct-acquisition jobs** — adaptive day→CPV slicing, correction re-fetch queue, reconciliation
- [ ] **Phase 5: Sample mode + live smoke** — SCRAPE_SAMPLE wiring, dev:scrape script, first real 30-day run, criteria verification

---

## Phase Details

### Phase 1: Elicitatie endpoint clients

**Goal:** `packages/scraper-clients/src/elicitatie/` — typed, tested clients for every endpoint in RESEARCH.md §1, composing one shared `createHttpClient` per DEC-005 (conc 3, 400ms, Retry-After honored — extend http-client if needed), always sending same-site Referer + honest UA (DEC-009). Envelope parsing `{total, items, searchTooLong}`, typed list/detail methods per family, CPV id fetch util.

**Creates:** `elicitatie/{client,tenders,awards,direct-acquisitions,cpv,types}.ts`, re-export from index; mock-server tests (Referer sent, searchTooLong surfaced, Retry-After honored)

**Success Criteria:**
1. All list/detail methods typed and mock-tested; no live network in tests
2. Missing Referer impossible by construction; politeness config env-tunable
3. searchTooLong + total exposed to callers verbatim

**Dependencies:** None

---

### Phase 2: Archive plumbing

**Goal:** Everything between fetch and archive: versioned PII redaction transform (DEC-006, denylist per endpoint_version), canonical JSON hash (sorted keys, post-redaction), `archive.ts` idempotent writer (onConflictDoNothing, inserted/skipped counts), `core.scrape_runs` migration, drizzle-orm added to ingestion deps.

**Creates:** `apps/ingestion/src/scrape/{redact,hash,archive}.ts`, `packages/db` scrape_runs table + migration; unit tests (hash determinism, redaction) + integration test (idempotent re-archive)

**Success Criteria:**
1. Re-archiving identical payload → skipped, not inserted
2. PII fields verifiably absent from stored payloads (test asserts on denylist fields)
3. Migration applies + rolls back; scrape_runs writable

**Dependencies:** Phase 1 (types)

---

### Phase 3: Notice scrape jobs

**Goal:** Tenders + awards flowing into raw_documents: chunked self-re-enqueueing jobs (jobKey overlap protection, `?max=1` cron), watermark advanced in same tx as page inserts (DEC-003), invariant checks gating cursors (DEC-008), detail + GetCANoticeContracts (skip/take) fetching, trailing state re-scan job, scrape_runs reconciliation per run.

**Creates:** `apps/ingestion/src/scrape/elicitatie/{notices,state-rescan}.ts`, job registrations, Europe/Bucharest window helpers (DEC-007); mock-server integration tests: full window archive, kill/resume no-gap, invariant-violation abort

**Success Criteria:**
1. Mock window fully archived; re-run inserts 0
2. Kill mid-page → restart resumes from watermark, reconciliation clean
3. Out-of-window item in response → run aborts, cursor untouched, alert row

**Dependencies:** Phases 1, 2

---

### Phase 4: Direct-acquisition jobs

**Goal:** The firehose: adaptive slicing (probe day → cpvCategory fan-out → cpvCodeId fan-out on overflow, DEC-004), leaf searchTooLong = data-loss alert, finalizationDate cursors + 2–3 day lookback, correction-flag re-fetch queue, chunked memory-bounded processing, reconciliation.

**Creates:** `apps/ingestion/src/scrape/elicitatie/direct-acquisitions.ts`, slicing engine + tests (synthetic overflow scenarios), correction re-fetch job

**Success Criteria:**
1. Synthetic overflowing day slices correctly to leaf level; unresolvable overflow → alert + incomplete run recorded
2. Lookback re-scan re-fetches corrected records
3. Memory bounded (streaming pages, never full-day in memory)

**Dependencies:** Phases 1, 2 (3 for shared window helpers)

---

### Phase 5: Sample mode + live smoke

**Goal:** First real data: `SCRAPE_SAMPLE=30d` restricting all families, `dev:scrape` enqueue script, manual live run at polite rates, verify FEATURE success criteria on real API (idempotent re-run, kill/resume), tune crontab schedules (after 03:00 Bucharest), demote heartbeat, probe the 3 LOW-confidence endpoints (eForms v2 detail, DA award-notification detail, getView liveness).

**Creates:** sample-mode wiring, `dev:scrape` script, crontab final schedule; CHANGELOG notes on live findings

**Success Criteria:**
1. 30-day sample lands real tender+award+DA payloads locally; re-run → 0 new rows
2. Kill/restart mid-run verified live; reconciliation rows populated with real counts
3. LOW-confidence endpoints resolved (probed + documented)

**Dependencies:** Phases 3, 4

---

## Execution Order

```
Phase 1 (clients) → Phase 2 (archive plumbing) → Phase 3 (notices) → Phase 4 (DAs) → Phase 5 (live smoke)
                                                     └─ 3 and 4 partially parallelizable after 2
```

---

## Key Decisions Affecting Roadmap

| Decision | Impact |
|----------|--------|
| DEC-004 adaptive slicing | Phase 4 is the algorithmically hardest — isolated in own phase |
| DEC-005/009 politeness + Referer | Phase 1 owns all header/rate concerns; nothing above it touches HTTP |
| DEC-006 PII redaction | Phase 2 chokepoint — no archive write path bypasses redact+hash |
| DEC-008 invariants gate cursors | Phase 3/4 job loops structured around validate-then-advance |
| Live smoke last | Phases 1–4 fully mock-tested; real API touched once, politely, in Phase 5 |
