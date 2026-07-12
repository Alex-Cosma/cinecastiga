# State: core-layer

**Task:** core-layer
**Stage:** complete
**Last Updated:** 2026-07-12

## Progress

- [x] Task initialized
- [x] Initial discussion complete
- [x] Decisions recorded (DEC-001..006)
- [x] Research complete (RESEARCH.md)
- [x] Plan complete — ROADMAP.md, 6 phases
- [x] Execution — all 6 phases complete, committed

## Current position

**Complete.** Full raw→core normalization built and verified against all 744
real docs: 744 processed, 0 quarantined, 0 duplicate CUIs, 100% CPV valid, 94%
units canonicalized, idempotent replay. See CHANGELOG.md.

## Follow-ups (not blockers)

- **Tier-3 fuzzy name suggestions**: `entity_name_suggestions` table + resolver
  exist but the pg_trgm batch pass that populates suggestions for no-/invalid-CUI
  entities is not yet implemented (RESEARCH.md §2 has the approach + thresholds).
- **unit_map curation**: 19-row starter map covers 94%; domain expert to extend
  the compound/ambiguous tail.
- **v2/eForms notice detail**: still deferred (tender core = list-level only).
- Re-run `normalize` after the (blocked) SICAP backfill lands more raw docs.

## Notes

- SICAP is down platform-wide (outage, not us) — irrelevant to this task; all
  normalization work is offline against the archive.
