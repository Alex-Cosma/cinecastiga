# Decisions: core-layer

**Task:** core-layer
**Created:** 2026-07-12
**Last Updated:** 2026-07-12

---

## Active Decisions

### DEC-001: CPV — parse + validate against catalog, flag unknowns, keep raw

**Date:** 2026-07-12
**Status:** Active
**Context:** CPV in list payloads is one jammed string
(`"15800000-6 - Diverse produse alimentare (Rev.2)"`); user's 2020 firsthand
experience is that CPV codes are "a mess." Detail payloads already carry a
structured code (`cpvCode.localeKey`).
**Decision:** Split into `cpv_code` (8-digit) + `cpv_name` + `cpv_revision`.
Validate the code against a CPV catalog → `cpv_valid` boolean. Unknown/malformed
code: keep the raw string, set `cpv_valid=false`, flag it — **never drop**.
Where both list and detail exist, detail's structured code is the trusted source
and can cross-check the parsed list string.
**Rationale:** Queryable by clean code without silently losing the messy tail.
A watchdog tool must never make bad data invisible.

### DEC-002: Units — always preserve raw, best-effort canonical map, unmapped=null

**Date:** 2026-07-12
**Status:** Active
**Context:** `itemMeasureUnit` is free-text and non-standard
(`"bucata"`, `"Litru"`, `"100 Bucăți"`) — user's 2020 pain point. No enum.
**Decision:** Always store `unit_raw` verbatim. Add nullable `unit_canonical`
+ `unit_factor` resolved via a `core.unit_map` reference table (e.g.
`"100 Bucăți" → (buc, 100)`). Unmapped units leave canonical **null** — never
guessed. The map grows from observed data over time.
**Rationale:** Honest normalization: enables unit-based aggregation where we're
confident, admits ignorance where we're not. Preserving raw keeps it replayable
as the map improves.

### DEC-003: Entities — three-tier resolution (SICAP-id → CUI → name-suggestion)

**Date:** 2026-07-12
**Status:** Active
**Context:** Entity identity is mashed into strings with inconsistent CUI
formats (`"RO21255449 …"` vs `"29074847 …"`); the same legal entity appears as
both authority and supplier. Detail payloads add numeric SICAP ids
(`supplierId`, `contractingAuthorityID`).
**Decision:** One `core.entities` table; role is per source-record, not per
entity. Resolve identity in priority order: (1) SICAP internal numeric id,
(2) canonical CUI (strip `RO`, trim leading zeros, uppercase), (3) fuzzy name
match. Tiers 1–2 hard-dedup. Tier 3 produces **suggestions only** in
`core.entity_name_suggestions` — never auto-merge on name.
**Rationale:** Most-reliable key first. Auto-merging on name risks conflating
distinct entities, which in a watchdog context = false accusations. Human
adjudicates the fuzzy tail.

### DEC-004: Bad data — per-record quarantine, pipeline continues

**Date:** 2026-07-12
**Status:** Active
**Context:** Six years of firehose data with era drift; zod validation will hit
unexpected shapes. Aborting on each is too brittle; silently skipping hides
problems.
**Decision:** Parse failure → write the record to `core.quarantine`
(`raw_id`, `endpoint_version`, `zod_error`, `ts`) and continue. Core stays clean
and rebuildable; the quarantine is a queryable worklist of what's breaking.
Mirrors the bronze dead-letter pattern.
**Rationale:** Resilience + observability without corrupting core. One weird
2019 record must not halt a national dataset, nor vanish unlogged.

### DEC-005: CPV seed — vendored EU CPV 2008 JSON asset + offline seed script

**Date:** 2026-07-12
**Status:** Active
**Context:** `core.cpv_codes` needs the official 9,454-code CPV 2008 catalog with
RO + EN names (RESEARCH.md §1). Source is the SIMAP `cpv_2008.xml`.
**Decision:** Parse the EU XML **once** offline → commit a `cpv_2008.json` asset
in `packages/db` → load it via a deterministic seed script (no build-time
network). `revision="Rev.2"` constant; PK keeps the check digit (`NNNNNNNN-D`).
**Rationale:** Offline, deterministic, reproducible; ~9.5k rows is trivial to
vendor. No runtime dependency on ted.europa.eu availability.

### DEC-006: Confirmed value + geo field semantics

**Date:** 2026-07-12
**Status:** Active
**Decision:** (1) `estimated_value_ron` is the trustworthy RON figure on notices
(use it, not `estimatedValueExport`). (2) Parsers read `nutsCodeItem.text` /
`nutsCodeID` for county/NUTS and **ignore** the broken `nutsCode` scalar
(`"System.Data.Entity.DynamicProxies…"` serialization leak).
**Rationale:** User (domain expert) confirmed; matches live-data inspection.

---

## Decision Log

| ID | Date | Decision | Status |
|----|------|----------|--------|
| DEC-001 | 2026-07-12 | CPV: parse + catalog-validate, flag unknowns, keep raw | Active |
| DEC-002 | 2026-07-12 | Units: preserve raw + best-effort canonical map (null if unmapped) | Active |
| DEC-003 | 2026-07-12 | Entities: 3-tier resolution (SICAP-id → CUI → name-suggestion) | Active |
| DEC-004 | 2026-07-12 | Bad data: per-record quarantine, pipeline continues | Active |
| DEC-005 | 2026-07-12 | CPV seed: vendored EU CPV 2008 JSON asset + offline seed script | Active |
| DEC-006 | 2026-07-12 | estimated_value_ron trusted; read nutsCodeItem, ignore broken nutsCode | Active |
