# Feature: core-layer (raw → core normalization)

**Sub-project:** apps/ingestion
**Created:** 2026-07-12
**Stage:** discussion

## Problem

`raw.raw_documents` is a faithful but messy archive of SICAP responses:
CPV codes, units, and entity identifiers are jammed into free-text strings,
shapes differ by era (v1 notices vs v2/eForms vs DAs), and the same legal
entity appears under inconsistent identifiers. Every downstream consumer
(marts, search, red-flags, web UI) needs clean, queryable, deduplicated data.

## What this builds

Deterministic, **replayable** transforms that read `raw.raw_documents` and
write normalized `core` tables. Raw stays the single source of truth; `core`
is 100% rebuildable by replaying transforms (the same property that let the
PII scrub fix the archive without re-scraping — see bronze DEC-012).

### Core tables (draft)

**Reference / dimension:**
- `core.entities` — canonical org, one row per resolved entity. Fields:
  `id`, `cui_canonical`, `sicap_ids[]`, `name_canonical`, `name_variants[]`,
  `cui_raw_variants[]`, `first_seen`, `last_seen`. Role (authority/supplier)
  is **per source-record, not per entity** — a company can be both.
- `core.cpv_codes` — validated CPV catalog (code, name, revision) used to
  flag `cpv_valid`.
- `core.unit_map` — `raw_pattern → (canonical_unit, factor)` reference,
  grown from observed data.
- `core.entity_name_suggestions` — fuzzy name-match review queue for
  no-/garbage-CUI records (suggestions only, never auto-merged).

**Fact:**
- `core.notices` — participation/tender notices (list-level fields; v2 detail
  deferred — see gray areas).
- `core.awards` + `core.contracts` — award notices and their winners/values.
- `core.direct_acquisitions` — normalized DAs (authority, supplier, cpv,
  values, dates, state).
- `core.da_items` — DA line items (cpv, name, qty, `unit_raw`,
  `unit_canonical`, `factor`, price). Where the unit mess lives.

**Operational:**
- `core.quarantine` — per-record parse failures (`raw_id`, `endpoint_version`,
  `zod_error`, `ts`). Pipeline continues; nothing hidden.
- `core.normalize_watermarks` — per-transform high-water cursor over
  `raw_documents.id` for incremental runs; reset to replay from scratch.

## Key design decisions (this discussion)

See DECISIONS.md DEC-001..004. Summary:
1. **CPV** — parse into code/name/revision, validate against catalog, flag
   unknowns (`cpv_valid=false`), never drop the raw string.
2. **Units** — always preserve `unit_raw`; add nullable canonical + factor via
   `unit_map`; unmapped stays null (never guessed).
3. **Entities** — three-tier resolution: SICAP-internal-id → canonical-CUI →
   fuzzy-name (suggestion only). Hard-dedup on id/CUI; never auto-merge on name.
4. **Bad data** — per-record quarantine table; pipeline continues; core stays
   clean and rebuildable.

## Integrates with

- **Reads:** `raw.raw_documents` (bronze, complete). `endpoint_version`
  selects the era-aware parser.
- **Reuses:** `@seap/scraper-clients` payload types. NOTE: CPV catalog is seeded
  from the official EU CPV 2008 file, NOT SICAP — the repo's `cpv.ts`
  (`searchCpvs`/`fetchAllCpvs`) only yields SICAP-internal ids, used for a
  `sicap_cpv_id → code` map, not names. See RESEARCH.md §1.
- **Writes:** new `core` schema tables (`packages/db/src/schema/core.ts`).
- **Downstream (future):** marts, Meilisearch, red-flag engine, web read all
  from `core`.

## Data realities (verified against 744 archived docs)

- CPV list string: `"15800000-6 - Diverse produse alimentare (Rev.2)"`;
  CPV in **detail** already structured (`cpvCode.localeKey = "45453000-7"`).
- Units free-text: `itemMeasureUnit: "bucata"` (no enum, no diacritic norm).
- Entities mashed + inconsistent: supplier `"RO21255449 S.C. INGRID S.R.L."`
  vs authority `"29074847 Gradinita PP nr. 4 Lugoj"` (RO prefix asymmetry).
  Detail adds numeric `supplierId` / `contractingAuthorityID` (SICAP ids).

## Out of scope (v1 core)

- v2/eForms notice **detail** mapping (bronze archives v2 list-only; detail is
  a separate future task). Tender core = list-level fields until then.
- Company-registry enrichment (ONRC/ANAF) — deferred per project scope.
- Marts / search / red-flags — separate downstream phases.
- Historical backfill run (blocked on SICAP recovery; independent of this code).

## Gray areas (defer to /specd.discuss)

- **CPV catalog source:** bundle the official EU CPV list (~9.5k codes, static
  CSV) vs derive from SICAP's own catalog (`localeKey`s seen in detail). Affects
  `core.cpv_codes` seeding.
- **Entity `first_seen`/`last_seen` semantics** across notice vs DA sources.
- **Name-canonicalization rules** for the suggestion queue (diacritics,
  S.R.L./SRL, punctuation) — how much normalization before fuzzy compare.
- **Incremental cursor granularity:** single global cursor vs per-source
  transform cursors.
- **Contracts ↔ entities:** award winners come from the contracts endpoint;
  confirm the winner identifier shape links cleanly to `core.entities`.
