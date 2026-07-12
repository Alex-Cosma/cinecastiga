# State: marts-layer

**Task:** marts-layer
**Stage:** complete
**Last Updated:** 2026-07-12

## Progress
- [x] Task initialized (6 decisions)
- [x] Schema + build (Phases 1–5)
- [x] Reconciled + idempotent

## Current position
**Complete.** 6 gold marts built from core, reconcile exactly to core sums,
consortia dual-attribution correct, concentration signals meaningful. Rebuild:
`pnpm --filter ingestion marts`.

## Follow-ups (not blockers)
- Chain `marts` after `normalize` (currently separate command).
- County choropleth + Meilisearch search: deferred (separate tasks).
- Incremental marts (full rebuild fine at current scale).
- Authority profiles cover spending authorities only (notice-only excluded).
