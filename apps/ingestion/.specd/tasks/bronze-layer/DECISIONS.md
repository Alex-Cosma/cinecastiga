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

### DEC-003: DA cursor on finalizationDate; notices on publicationDate + state re-scan

**Date:** 2026-07-12
**Status:** Active
**Context:** Live probing proved `publicationDateStart/End` is silently ignored on the DA list endpoint; only `finalizationDateStart/End` works (day granularity). No modified-date filter anywhere.
**Decision:** DA watermark keyed to finalizationDate with 2–3 day trailing lookback + correction-flag re-fetch queue. Notice watermark on publicationDate + trailing 30–60d list-only re-scan diffing `noticeStateDate`.
**Implications:** Cursor JSON carries window + page; quarterly data.gov.ro reconcile catches arbitrary late edits.

### DEC-004: Adaptive slicing day → cpvCategory → cpvCodeId; searchTooLong at leaf = data loss

**Date:** 2026-07-12
**Status:** Active
**Context:** 2000-record hard cap live-verified; one weekday of DAs = 8-12k records; `searchTooLong` is the reliable overflow signal (total lies when true).
**Decision:** Probe unsliced day → overflow? fan out by cpvCategoryId → overflowing categories fan out by cpvCodeId. Leaf-level searchTooLong → page-immediately alert, run aborts as incomplete.
**Implications:** ~15–800 list calls/day; slice sums valid within one dimension only.

### DEC-005: Politeness — concurrency 3, ~400ms delay, Retry-After honored, instant-drop config

**Date:** 2026-07-12
**Status:** Active
**Context:** Conflicting rate-limit intel (2026 repos: 429s since Mar 2025, 1 conc/2s; live probe: 80 req at 2.5 rps unthrottled; 2021 prior art: conc 5 for years).
**Decision:** Default concurrency 3 / minDelay 400ms per shared source client; honor Retry-After; automatic cool-down on 429/403 streaks; env-tunable to 1/2s without deploy.
**Implications:** 30d DA sample ≈ ~24h of chunked resumable runs; daily incremental ≈ ~1h. Don't discover the threshold.

### DEC-006: PII redaction BEFORE bronze write

**Date:** 2026-07-12
**Status:** Active
**Context:** Detail payloads carry contact-person PII (`assignedCAUser`, `assignedSupplierUser`: names/emails/phones — live-verified). Append-only raw archive = PII retention; prior art strips and warns.
**Decision:** Versioned redaction transform (field denylist per endpoint_version) between fetch and archive. Content hash computed on post-redaction payload.
**Implications:** Bronze "verbatim" rule amended: verbatim minus documented PII redaction. Redaction list lives with endpoint clients; GDPR lawful-basis note references it.

### DEC-007: Europe/Bucharest cursor math; closed windows only; runs after 03:00 local

**Date:** 2026-07-12
**Status:** Active
**Context:** Timestamps Romania-local; date filters = Bucharest calendar days; nightly DA finalization batches 00:00–02:30 local; paginating an open day shifts pages.
**Decision:** All cursor dates computed in Europe/Bucharest; ingest D-1 and older only; daily schedule after 03:00 local.

### DEC-008: Response invariant checks gate cursor advancement

**Date:** 2026-07-12
**Status:** Active
**Context:** Unknown filter fields silently ignored (typo = unfiltered firehose, no 400); maintenance can serve 200-HTML.
**Decision:** Every list response validated: Content-Type JSON, schema guard, every item's date within requested window. Violation → abort run, alert, cursor untouched.

### DEC-009: Mandatory same-site Referer; UA stays honest

**Date:** 2026-07-12
**Status:** Active
**Context:** WAF hard-403s any request without same-site Referer (live-verified); UA content irrelevant to WAF.
**Decision:** Referer `https://e-licitatie.ro/pub/...` on every call; User-Agent keeps honest identification + contact email. Optics tension recorded: Referer is a technical necessity, identity stays transparent via UA.

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
| DEC-003 | 2026-07-12 | DA cursor on finalizationDate; notice state re-scan | Active |
| DEC-004 | 2026-07-12 | Adaptive slicing; searchTooLong = data loss | Active |
| DEC-005 | 2026-07-12 | Politeness: conc 3 / 400ms, Retry-After, instant-drop | Active |
| DEC-006 | 2026-07-12 | PII redaction before bronze write | Active |
| DEC-007 | 2026-07-12 | Europe/Bucharest cursors; closed windows only | Active |
| DEC-008 | 2026-07-12 | Invariant checks gate cursor advancement | Active |
| DEC-009 | 2026-07-12 | Mandatory same-site Referer; honest UA | Active |
