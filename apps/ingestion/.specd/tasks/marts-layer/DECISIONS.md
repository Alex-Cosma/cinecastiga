# Decisions: marts-layer

**Task:** marts-layer
**Created:** 2026-07-12
**Last Updated:** 2026-07-12

---

## Active Decisions

### DEC-001: Job-built tables (truncate + recompute from core)

**Date:** 2026-07-12
**Status:** Active
**Context:** Marts must support window functions (concentration, ranks) and
multi-fact joins (entity profiles) that don't fit cleanly in single-query
materialized views. User has run this exact pattern successfully before
(MongoDB `$out` precomputed collections, indexed).
**Decision:** Each mart is a plain table populated by a TS `marts` build:
`TRUNCATE marts.* ; INSERT ... SELECT FROM core`. Rebuildable + replayable like
normalize; we own the indexes. Incremental is a later option; full rebuild is
fine at current scale.
**Rationale:** Full control, uniform mechanism, handles the watchdog-critical
concentration math cleanly. Consistent with the medallion pattern already built.

### DEC-002: v1 mart scope (five tables); county choropleth deferred

**Date:** 2026-07-12
**Status:** Active
**Decision:** v1 = `national_stats`, `spend_by_cpv`, `entity_profile`,
`top_entities`, `authority_concentration`. Defer `spend_by_county` (choropleth)
and the Meilisearch index.
**Rationale:** County lives only on winner/supplier entities (award address);
contracting authorities from notice/DA strings have no geo, so a buyer-side
choropleth — the watchdog-relevant cut — isn't possible yet. Ship the four cuts
that are clean now.

### DEC-003: Currency — RON only, FX out of scope v1

**Date:** 2026-07-12
**Status:** Active
**Decision:** Sum RON figures (`estimated_value_ron`, `closing_value`,
contract `contract_value` where currency is RON / `defaultCurrency` RON). No
historical FX conversion in v1; flag/exclude non-RON if it appears at scale.
**Rationale:** Sample is 100% RON; FX time-series is a large separate concern.

### DEC-004: Time grain — year + overall, primary date per fact

**Date:** 2026-07-12
**Status:** Active
**Decision:** Aggregate by calendar year (Europe/Bucharest) plus an overall
total. Primary date: DA `finalization_date`, contract `contract_date`, notice
`state_date`.
**Rationale:** 100% date coverage; year is the natural grain for trend charts.

### DEC-005: Meilisearch search index is a separate task

**Date:** 2026-07-12
**Status:** Active
**Decision:** Full-text/faceted search (document index) is its own task, not
part of marts. Marts = aggregate read models only.
**Rationale:** Different concern (document index vs precomputed aggregates),
different infra (Meilisearch).

### DEC-006: Consortia attribution — store BOTH full-credit and equal-split

**Date:** 2026-07-12
**Status:** Active
**Context:** Verified against raw payloads: SICAP gives NO per-member value for
consortia. The winner object is identity-only (`name`, `fiscalNumber`,
`entityId`, `address`); contract values are contract-level. Any per-member
number is our assumption.
**Decision:** In supplier-side marts (`entity_profile`, `top_entities`,
concentration inputs) store both `total_ron_full` (each member credited the full
contract) and `total_ron_split` (contract_value / N winners). Split is labeled an
assumption in the schema/comments; web + red-flags choose per view.
**Rationale:** No data loss, no premature commitment. Full shows "who touches big
money"; split reconciles to actual national spend. Both are truthful; neither is
imposed as the single answer.

---

## Decision Log

| ID | Date | Decision | Status |
|----|------|----------|--------|
| DEC-001 | 2026-07-12 | Job-built tables (truncate + recompute from core) | Active |
| DEC-002 | 2026-07-12 | v1 = 5 marts; county choropleth + search deferred | Active |
| DEC-003 | 2026-07-12 | Currency RON only; FX out of scope v1 | Active |
| DEC-004 | 2026-07-12 | Time grain: year + overall, primary date per fact | Active |
| DEC-005 | 2026-07-12 | Meilisearch search index is a separate task | Active |
| DEC-006 | 2026-07-12 | Consortia: store both full-credit and equal-split totals | Active |
