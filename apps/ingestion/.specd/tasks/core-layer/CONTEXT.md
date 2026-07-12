# Context: core-layer

**Task:** core-layer
**Created:** 2026-07-12

## Discussion summary

Opened the core-layer (raw→core normalization) task grounded in a live
inspection of the 744 archived docs. Confirmed the user's 2020 domain warnings
against real payloads: CPV jammed strings, non-standard free-text units,
mashed + inconsistent entity identifiers. User (SICAP domain expert) made the
four foundational calls, all toward the conservative / never-lose-data option —
appropriate for a journalist/watchdog tool where wrong data causes real harm.

## Resolved questions

- CPV handling → parse + catalog-validate + flag (DEC-001)
- Unit handling → preserve raw + best-effort canonical map (DEC-002)
- Entity resolution aggressiveness → 3-tier, no name auto-merge (DEC-003)
- Bad-data policy → per-record quarantine (DEC-004)
- Core is fully replayable from raw (carried principle, reaffirmed)

## Key findings baked into the plan

- CPV is structured in **detail** payloads (`cpvCode.localeKey`), only jammed
  in **list** payloads → detail is trusted source, list gets parsed + cross-checked.
- Entities have a stronger key than parsed CUI: SICAP numeric ids
  (`supplierId`, `contractingAuthorityID`) → 3-tier resolution.

## Deferred questions (gray areas)

- CPV catalog source: bundle official EU CPV CSV vs derive from SICAP localeKeys.
- Entity name-canonicalization rules (diacritics, SRL variants) for fuzzy tier.
- `first_seen`/`last_seen` semantics across sources.
- Incremental cursor granularity (global vs per-transform).
- Contracts → entity linkage: confirm winner identifier shape.

## Constraints carried from project / bronze

- Replayability is mandatory (raw = source of truth).
- v2/eForms notice detail is deferred (bronze archives v2 list-only).
- No company-registry enrichment in v1.
- Historical backfill is independent and currently blocked on SICAP outage.
