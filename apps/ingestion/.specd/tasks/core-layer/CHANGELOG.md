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
