# Changelog: core-layer

**Task:** core-layer

---

## Phase 1 — Schema + migration (2026-07-12)

- Extended `packages/db/src/schema/core.ts` with 14 normalized tables:
  entities, entity_sicap_ids, entity_name_suggestions, cpv_codes,
  sicap_cpv_ids, unit_map, notices, awards, contracts, contract_winners (M:N),
  direct_acquisitions, da_items, quarantine, normalize_watermarks.
- Money columns = numeric; entity CUI uniqueness is a partial index (valid only);
  GIN gin_trgm_ops index on entities.name_normalized.
- Migration `0002_fuzzy_vertigo.sql`; prepended CREATE EXTENSION pg_trgm /
  fuzzystrmatch / unaccent (needed before the trgm index).
- Applied to local DB: 16 core tables present, 3 extensions, trgm index live,
  raw.raw_documents untouched (744).

## Phase 2 — CPV catalog seed (2026-07-12)

- Fetched official EU CPV 2008 XML (ted.europa.eu, open data) → parsed to
  `packages/db/seed/cpv_2008.json` (9454 codes, {code, name_ro, name_en,
  revision:"Rev.2", division}). Provenance tool: `scripts/parse-cpv-xml.mjs`.
- Seed loader `scripts/seed-cpv.mjs` (idempotent bulk upsert) + `db:seed:cpv`.
- Loaded: 9454 rows, all with EN, 45 divisions. Verified `15800000-6` and
  `45453000-7` (both seen in our real data) resolve; re-run stays 9454.

## Phase 3 — Entity resolution module (2026-07-12)

- `normalize/cui.ts`: `cuiIsValid` (mod-11, key 753217532) + `canonicalCui`
  (strip RO/zeros/punct, checksum gate). Validated on both real records.
- `normalize/name.ts`: `foldDiacritics` (cedilla + comma-below), `normalizeName`
  (legal-form split, SC prefix marker dropped, ordinal+locality kept),
  `parseEntityString` (mashed "CUI name" splitter).
- `normalize/resolve-entity.ts`: tier-1 (SICAP id, namespaced) → tier-2
  (checksum-valid CUI) resolution with first/last-seen + backfill; SICAP-id
  cross-links left for reconciliation (no silent mismerge). Tier-3 fuzzy is a
  separate batch pass (later phase).
- Tests: 16 unit (normalize-entity) + 4 integration (rolled-back tx) proving
  RO/bare-CUI dedup, tier-1 re-resolution, no foreign merge, distinct CUIs kept.

## Phase 4 — Era-aware parsers + quarantine (2026-07-12)

- Schema refined to NATURAL keys (not raw_id): notices→cNoticeId, awards→
  caNoticeId, contracts→caNoticeContractId, DAs→sicapDaId (merges list+detail),
  da_items→sicapItemId. Migration 0003.
- `normalize/cpv.ts`, `normalize/unit.ts`: CPV parse/validate (keep raw),
  unit resolve (keep raw, null if unmapped).
- `normalize/parsers.ts`: zod schema + transform per endpoint_version
  (tender-list, award-list, award-contracts, da-list, da-detail); registry.
  Consortia via winners[] → contract_winners M:N. DA detail links SICAP ids to
  list-resolved entities. Added zod dep.

## Phase 5 — Normalization pipeline (2026-07-12)

- `normalize/pipeline.ts`: replayable per-endpoint id-cursor runner; per-doc tx;
  parse failure → quarantine + advance (never loops). `--rebuild` truncates
  derived tables (keeps reference data) + replays. `normalize` CLI.

## Phase 6 — Reconciliation (2026-07-12)

- Ran over all 744 docs: **744 processed, 0 quarantined**.
- Counts: 822 entities (731 valid CUI, **0 duplicate CUIs**, 8 RO/bare merges),
  202 notices, 181 awards, 1495 contracts, 1966 contract_winners (consortia),
  90 DAs, 123 da_items.
- CPV 100% valid (notices/DAs/items). Units: seeded 19-row starter unit_map →
  94% da_items canonicalized; compound/ambiguous tail left null (for curation).
- End-to-end spot-check verified (INGRID DA joins supplier/authority/CPV;
  multi-winner contracts resolve). Idempotent: incremental re-run processes 0.

## Phase 3b — Tier-3 fuzzy suggestions + parser hardening (2026-07-12)

- `normalize/suggestions.ts`: pg_trgm self-join over entities, bands
  (≥0.85 strong / 0.55–0.85 weak), negative rules (differing `nr N` ordinal
  suppresses; two different valid CUIs never suggested), writes
  entity_name_suggestions (open, never auto-merged). `normalize --suggest[-only]`.
- Tier-3 immediately surfaced a real parser bug: `parseEntityString` missed
  "RO <space> CUI - Name" and the pre-2007 single-"R" VAT prefix, so those CUIs
  never extracted → entities didn't dedup (27 Romgaz/Banca/etc. duplicates).
- Fixed parseEntityString regex + canonicalCui (strip "RO" or single "R").
- Result: entities 822→793, valid-CUI 731→790 (99.6%), invalid 91→3, dup CUIs
  still 0, suggestions 90→1 (the one genuine same-name/bad-CUI pair to review).
