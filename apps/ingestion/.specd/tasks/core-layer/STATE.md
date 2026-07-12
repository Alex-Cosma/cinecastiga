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

- **unit_map curation**: 19-row starter map covers 94%; domain expert to extend
  the compound/ambiguous tail.
- **v2/eForms notice detail**: still deferred (tender core = list-level only).
- **Entity-name-suggestion review UI**: 1 open suggestion now; at backfill scale
  a review workflow (merge/reject) will be needed. Locality-blocking negative
  rule (beyond ordinal) is a future refinement (RESEARCH.md §2).
- Re-run `normalize --suggest` after the (blocked) SICAP backfill lands more raw.

## Done in this task

Tier-3 fuzzy suggestions implemented (Phase 3b) and it surfaced + drove a
parser fix that lifted valid-CUI coverage to 99.6% (793 entities, 0 dup CUIs).

## Notes

- SICAP is down platform-wide (outage, not us) — irrelevant to this task; all
  normalization work is offline against the archive.
