# Decisions: bronze-layer

**Task:** bronze-layer
**Created:** 2026-07-12
**Last Updated:** 2026-07-12

---

## Active Decisions

### DEC-001: Direct acquisitions included in bronze-layer task

**Date:** 2026-07-12
**Status:** Active
**Context:** Project ROADMAP put direct-purchase ingestion in Phase 4; tenders+awards in Phase 2.
**Decision:** This task builds fetchers for all three notice families (tenders, awards, direct acquisitions).
**Rationale:**
- User choice — one coherent fetcher layer, same archive/cursor/reconciliation machinery
- Direct acquisitions are the project's strongest differentiator; earlier data = earlier validation
**Implications:**
- Bigger task; direct-acquisition jobs must chunk by date window (volume)
- Project Phase 4 shrinks to backfill orchestration only

### DEC-002: Sample mode = date window, 30-day default

**Date:** 2026-07-12
**Status:** Active
**Context:** Local dev needs small real data without hammering the API or waiting for backfills.
**Decision:** `SCRAPE_SAMPLE=30d` (configurable) restricts fetch window; default posture for local dev.
**Rationale:**
- Reuses the same date-cursor logic as live incremental — no separate code path
- Predictable volume, exercises pagination
**Implications:**
- List endpoints must support date filtering (research to confirm; fallback: fetch-and-stop at window edge)

---

## Superseded Decisions

_None._

---

## Revoked Decisions

_None._

---

## Decision Log

| ID | Date | Title | Status |
|----|------|-------|--------|
| DEC-001 | 2026-07-12 | Direct acquisitions included in bronze-layer | Active |
| DEC-002 | 2026-07-12 | Sample mode = 30-day date window | Active |
