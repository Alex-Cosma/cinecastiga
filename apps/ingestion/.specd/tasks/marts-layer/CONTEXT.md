# Context: marts-layer

**Task:** marts-layer
**Created:** 2026-07-12

## Discussion summary

Opened the marts (gold) task after core-layer completed. Clarified the "mart"
concept for the user (precomputed answer tables) — user immediately recognized
it as the MongoDB `$out` precomputed-collection pattern they ran successfully in
their 2020 SEAP build ("very good, nicely indexed"). Chose that exact pattern
(job-built tables). Scoped v1 to four analytical cuts + concentration; deferred
county choropleth (authority geo gap) and search (separate task).

## Resolved (decisions)

- Job-built tables, rebuildable from core (DEC-001)
- v1 scope: national_stats, spend_by_cpv, entity_profile, top_entities,
  authority_concentration (DEC-002)
- RON only, FX deferred (DEC-003)
- Year grain (DEC-004)
- Search is separate (DEC-005)

## Key data facts (verified against current core)

- 100% value + date coverage on contracts/DAs; all RON.
- CPV 100% valid → spend_by_cpv joins cleanly to cpv_codes.name_ro.
- County only on 384/793 entities (supplier/winner side) → choropleth deferred.
- Contracts are M:N with winners → spend attribution for consortia is a gray area.

## Deferred / gray areas

- Consortia spend attribution: full-credit-each vs split N-ways.
- national_stats must separate DA stream (firehose, small) from contracts (large).
- Marts refresh trigger: chain off `normalize`, or separate cadence.
- Incremental marts later (full rebuild fine now).

## Constraints carried

- Rebuildable-from-core (replayable), consistent with normalize.
- Offline — independent of the SICAP outage.
- Downstream: web reads marts; red-flag engine consumes concentration.
