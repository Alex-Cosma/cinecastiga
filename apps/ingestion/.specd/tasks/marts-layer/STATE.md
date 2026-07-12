# State: marts-layer

**Task:** marts-layer
**Stage:** discussion
**Last Updated:** 2026-07-12

## Progress

- [x] Task initialized
- [x] Initial discussion complete (5 decisions)
- [ ] Research (schema shapes, concentration/HHI SQL, attribution)
- [ ] Plan
- [ ] Execution

## Current position

Discussion done: job-built tables (Mongo $out pattern), v1 = 5 marts, RON-only,
year grain. Next: research/plan the marts schema + build queries. Blocked on
nothing — full core dataset (793 entities, 1495 contracts, 90 DAs) in local DB.

## Notes

- SICAP still down (irrelevant — marts are offline over core).
- Gray areas: consortia spend attribution, DA-vs-contract stream separation,
  refresh trigger.
