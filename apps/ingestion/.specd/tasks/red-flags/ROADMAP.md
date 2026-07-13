# Roadmap: red-flags

## Phase 1 — DA transaction import
- Streaming reader over `directAcquisitionContract` (4.78M).
- Parse `supplier` (CUI prefix) + `contractingAuthority` (sicap-id prefix);
  resolve via in-memory maps (reuse/extend `import-old`).
- Batched insert → `core.direct_acquisitions` (idempotent on `sicap_da_id`).
- Backfill `marts.authority_concentration` + `marts.entity_top_partners` from
  the DA pair spine (fills the currently-empty marts).
- **Verify:** row count ≈ 4.78M; DA total reconciles to national DA spend.

## Phase 2 — Flag store + thresholds
- `core.flags` + `core.risk_thresholds` schema + migration.
- Seed thresholds (DA ceilings by date range — DEC-006, pending confirmation).

## Phase 3 — DA flag rules (7)
- One replayable module per flag (SQL-centric), writing `core.flags` with evidence.
- Idempotent recompute (truncate + rebuild).
- **Verify:** the 4-minute `da_rapid` case surfaces; `da_split` finds known
  structuring patterns; counts are stable across reruns.

## Phase 4 — CRI + marts
- Composite: per entity, share of applicable flags triggered.
- `marts.entity_flags`, `marts.flag_instances`; denormalize display fields.
- Wire flag recompute into the marts build.

## Phase 5 — Web surfaces
- Flag badges + evidence on `/entitati/[id]`.
- `/semnale` — browse flag instances by type, sortable.
- Risk leaderboard (highest-CRI authorities/suppliers).
- `/metodologie` — documented flags, thresholds, caveats.

## Phase 6 — Award engine (dormant)
- Add bid-count column to `core.awards`; award rules (single-bidder, few-bidders,
  short-window, over-estimate, procedure-avoidance, winner-concentration,
  unit-price-outlier).
- Synthetic-fixture unit tests; computes automatically when live award data lands.

## Cross-cutting
- Every phase: gates green (build/test/typecheck/lint), commit, push.
- "Signal, not proof" copy; `methodology_version` stamped throughout.
