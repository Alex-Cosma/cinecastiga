# Roadmap: core-layer

**Task:** core-layer
**Created:** 2026-07-12
**Approach:** replayable raw→core normalization, built + verified offline
against the 744 real PII-clean docs already in the local DB.

## Phases

- [x] **Phase 1 — Schema + migration**
- [x] **Phase 2 — CPV catalog seed**
- [x] **Phase 3 — Entity resolution module**
- [x] **Phase 4 — Era-aware parsers + quarantine**
- [x] **Phase 5 — Normalization pipeline (replayable runner)**
- [x] **Phase 6 — Reconciliation + verification**

---

### Phase 1 — Schema + migration

**Goal:** `core` tables exist; extensions enabled.
**Work:**
- Extend `packages/db/src/schema/core.ts`: `entities`, `entity_name_suggestions`,
  `cpv_codes`, `sicap_cpv_ids`, `unit_map`, `notices`, `awards`, `contracts`,
  `contract_winners` (M:N), `direct_acquisitions`, `da_items`, `quarantine`,
  `normalize_watermarks`. Money = `numeric`.
- Migration enables `pg_trgm`, `fuzzystrmatch`, `unaccent`; GIN trgm index on
  `entities.name_normalized`; unique on `entities.cui_canonical` (partial, where
  `cui_valid`); useful FKs + fact indexes (cpv_code, entity ids, dates).
- `pnpm --filter @seap/db db:generate` + migrate; verify in DB.
**Done when:** migration applies clean on the existing local DB; tables + indexes
present; existing raw/core data untouched.

### Phase 2 — CPV catalog seed (DEC-005)

**Goal:** `cpv_codes` holds all 9,454 CPV 2008 codes with RO+EN.
**Work:**
- One-off parse of SIMAP `cpv_2008.xml` → vendored `packages/db/seed/cpv_2008.json`
  (`{code, name_ro, name_en}`), `revision="Rev.2"`, PK keeps check digit.
- Seed script (idempotent upsert) loads the asset into `cpv_codes` + derives
  `division` (first 2 digits).
- (Deferred/optional) `sicap_cpv_ids` populated later via `fetchAllCpvs` only if a
  payload references a CPV by id without `localeKey`.
**Done when:** `select count(*) from core.cpv_codes` = 9454; spot-check
`15800000-6` → "Diverse produse alimentare"; re-running seed is a no-op.

### Phase 3 — Entity resolution module (DEC-003)

**Goal:** deterministic CUI canonicalization + 3-tier resolution, unit-tested.
**Work:**
- `canonicalCui()` + `cuiIsValid()` (key `753217532`, mod 11) — tests include the
  two real records (`21255449`, `29074847`), a RO-prefixed dup, a foreign/invalid,
  a 13-digit CNP-shaped reject.
- `normalizeName()` pipeline (diacritic fold incl. cedilla+comma-below, legal-form
  extraction, keep ordinal+locality).
- `resolveEntity(tx, {sicapId, cui, name, county, nuts})`: tier 1 SICAP id → tier 2
  canonical CUI → upsert `entities` (merge id arrays, min/max seen); tier-3 fuzzy
  candidates written to `entity_name_suggestions` (never auto-merge).
**Done when:** unit tests green; resolving the same entity via RO and bare CUI
yields one row; foreign/invalid CUI creates its own row (no bad merge).

### Phase 4 — Era-aware parsers + quarantine (DEC-001/002/004/006)

**Goal:** one zod schema + transform per `endpoint_version`.
**Work:**
- Parsers: `tender-list:v1`, `award-list:v1`, `award-contracts:v1`, `da-list:v1`,
  `da-detail:v1`. Strict zod; failure → `quarantine` row.
- CPV parse (split code/name/rev, validate vs `cpv_codes` → `cpv_valid`, keep raw).
- Unit resolve via `unit_map` (raw kept, canonical nullable).
- Value = `estimated_value_ron`; geo from `nutsCodeItem`.
- Fixtures = real payloads pulled from the local DB.
**Done when:** each parser maps a real sample correctly; a deliberately-broken
payload lands in quarantine, not core; CPV unknown flagged not dropped.

### Phase 5 — Normalization pipeline (replayable runner)

**Goal:** drive parsers over `raw_documents` incrementally + replayably.
**Work:**
- Runner reads per-transform `normalize_watermarks.last_raw_id`, processes new
  rows in `id` order, writes core rows + advances cursor in one tx per doc/batch.
- `normalize` CLI (`--transform all|<version>`, `--rebuild` truncates facts +
  resets cursors); optional worker task later.
- Seed `unit_map` from observed distinct `itemMeasureUnit` values.
**Done when:** running over the 744 docs populates all fact tables; re-run is a
no-op (idempotent); `--rebuild` reproduces identical counts.

### Phase 6 — Reconciliation + verification

**Goal:** prove completeness + dedup quality.
**Work:**
- Counts: core facts vs raw docs per family; quarantine count + reasons.
- Entity sanity: dup CUIs = 0; suggestion queue reviewed; supplier/authority
  overlap (same entity both roles) surfaces correctly.
- CPV: % `cpv_valid`, list unknown codes.
- Spot-check a known DA + award end-to-end raw→core.
**Done when:** a short reconciliation report; no silent data loss; numbers
explained.

---

## Notes

- Fully offline — independent of the SICAP outage.
- v2/eForms notice **detail** still deferred (tender core = list-level).
- Downstream (marts/search/red-flags/web) consume `core` after this task.
