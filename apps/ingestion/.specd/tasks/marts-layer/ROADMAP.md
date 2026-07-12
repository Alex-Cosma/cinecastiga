# Roadmap: marts-layer

**Task:** marts-layer
**Created:** 2026-07-12
**Approach:** job-built gold tables, rebuilt from core (truncate + recompute),
verified against the current core dataset (793 entities, 1495 contracts, 90 DAs).

## Phases

- [x] **Phase 1 — marts schema + build harness**
- [x] **Phase 2 — national_stats + spend_by_cpv**
- [x] **Phase 3 — entity_profile + top_entities (full + split)**
- [x] **Phase 4 — authority_concentration (HHI, window fns)**
- [x] **Phase 5 — wire-up + reconciliation**

---

### Phase 1 — marts schema + build harness

**Goal:** `marts` tables exist; a rebuildable build command scaffolded.
**Work:**
- Define `packages/db/src/schema/marts.ts`: the five v1 tables (DEC-002) with
  own indexes. Money = numeric.
- `normalize/marts.ts` (or `marts/build.ts`) build fn: `TRUNCATE marts.* ;`
  then per-mart INSERT…SELECT. `marts` CLI (`--rebuild`).
- Migration + apply.
**Done when:** tables present; empty build runs clean.

### Phase 2 — national_stats + spend_by_cpv

**Goal:** headline totals + treemap data.
**Work:**
- `national_stats(kind, year, n, total_ron)` — kind ∈ {notice, award, da};
  year from primary date (DEC-004); overall row (year null).
- `spend_by_cpv(division, name_ro, kind, n, total_ron)` — join cpv_codes; DA +
  contract spend by CPV division.
**Done when:** numbers reconcile to raw core sums; spot-checked.

### Phase 3 — entity_profile + top_entities

**Goal:** per-entity aggregates + leaderboards, with consortia handled (DEC-006).
**Work:**
- `entity_profile(entity_id, role, n_contracts, n_das, total_ron_full,
  total_ron_split, first_seen, last_seen)` — role ∈ {supplier, authority};
  supplier totals split full vs equal-split across contract winners.
- Top counterparties (top authorities per supplier / suppliers per authority) —
  either nested jsonb or a `entity_top_partners` table.
- `top_entities(role, rank, entity_id, total_ron_full)` leaderboards.
**Done when:** INGRID/Romgaz profiles look right; consortia credited both ways.

### Phase 4 — authority_concentration

**Goal:** watchdog concentration signal.
**Work:**
- `authority_concentration(authority_entity_id, distinct_suppliers,
  top_supplier_pct, hhi, total_ron)` — window functions over per-authority
  supplier spend (using split attribution for share math).
**Done when:** an authority buying ~all from one supplier shows ~100% / high HHI.

### Phase 5 — wire-up + reconciliation

**Goal:** one command, verified.
**Work:**
- `marts --rebuild` runs all builds in order; optionally chain after `normalize`.
- Reconcile: national_stats totals == core sums; spend_by_cpv sum == national;
  top_entities matches profile; concentration sanity.
- Short report.
**Done when:** rebuild reproducible + reconciles; idempotent.

---

## Notes

- Offline — independent of the SICAP outage.
- County choropleth + Meilisearch search deferred (DEC-002/005).
- Red-flag engine (separate task) will consume `authority_concentration`.
