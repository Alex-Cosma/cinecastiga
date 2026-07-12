# State: core-layer

**Task:** core-layer
**Stage:** research complete
**Last Updated:** 2026-07-12

## Progress

- [x] Task initialized
- [x] Initial discussion complete
- [x] Four foundational decisions recorded (DEC-001..004)
- [x] Gray areas resolved (RESEARCH.md §6)
- [x] Research complete — RESEARCH.md (CPV catalog, entity resolution, schema,
      parser architecture) from 2 agents + live data inspection
- [ ] Ratify research → Plan
- [ ] Execution

## Current position

Research done and written to RESEARCH.md: CPV seed source (official EU CPV 2008
XML), full CUI checksum + 3-tier entity resolution, proposed core schema (13
tables), parser architecture (era-aware zod dispatch, per-transform replayable
cursor). Awaiting user ratification, then plan. Blocked on nothing — 744 real,
PII-clean docs in local DB for offline development.

## Notes

- SICAP is down platform-wide (outage, not us) — irrelevant to this task; all
  normalization work is offline against the archive.
