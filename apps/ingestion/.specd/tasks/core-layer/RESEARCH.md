# Research: core-layer

**Task:** core-layer
**Date:** 2026-07-12
**Inputs:** live inspection of the 744 archived docs + two parallel research
agents (CPV catalog source; Romanian CUI/entity resolution).

---

## 1. CPV catalog

**Standard:** CPV 2008 (Commission Reg. EC 213/2008), the version SICAP uses.
**9,454** main-vocabulary codes, format `NNNNNNNN-D` (8 digits + check digit).

**Seed source — official EU, not SICAP:** bundle SIMAP `cpv_2008.xml`
(`https://ted.europa.eu/documents/d/ted/cpv_2008_xml`). One open-licensed file
(Decision 2011/833/EU) carries every code with **both `name_ro` and `name_en`**
(`<CPV CODE="…"><TEXT LANG="RO">…</TEXT><TEXT LANG="EN">…</TEXT></CPV>`),
correctly diacriticized. Vendor it as a static seed asset; re-seedable.

**Rules:**
- PK = full `NNNNNNNN-D` **with** check digit (SICAP `localeKey` includes it;
  dropping it breaks joins).
- `revision` column = constant `"Rev.2"` for the whole file (it *is* CPV 2008).
  The `(Rev.2)` suffix in SICAP strings is a SEAP-ism, not EU text.
- Strip trailing ` (Rev.\d)` from LIST-payload names before comparing to seeded
  `name_ro`.
- Supplementary vocabulary (alphanumeric, letter-prefixed, e.g. `AA12-4`) is a
  different code space — if any leak into payloads they won't match; reject
  explicitly (quarantine).

**SICAP id mapping (separate concern):** DETAIL payloads reference CPV by an
internal numeric id (`cpvCode.id: 17161`, also `localeKey: "45453000-7"`). The
repo helper is `packages/scraper-clients/src/elicitatie/cpv.ts` —
`searchCpvs()` / `fetchAllCpvs()` hitting `GET /api-pub/ComboPub/searchCpvs`,
returning SICAP-internal ids (`CpvSearchItem { id, text? }`), used today for
DA adaptive slicing. Use it **only** to build a `sicap_cpv_id → code` mapping
table (RO-only, names carry `(Rev.2)` cruft — don't seed names from it). We
mostly don't need the id→code map because `localeKey` already gives the code
directly, but keep it available for any payload that references only the id.

**Correction to FEATURE.md:** there is no `SicapCpvCatalog` class /
`cpv-catalog.ts`; the real file is `cpv.ts` with the two functions above.

---

## 2. Entity resolution

### CUI canonicalization (self-contained, no network — the v1 gate)

CUI = CIF; 2–10 digits, last is a check digit. The `RO` prefix means
**VAT-registered only** (~30% of firms legitimately lack it) — same entity with
or without it. Public institutions (primării, grădinițe) get ordinary CUIs that
pass the **same** checksum.

Checksum (control key `753217532`, mod 11), verified against both our real
records (`21255449`→9 ✓, `29074847`→7 ✓):

```
cuiIsValid(digits):                 # RO already stripped, digits only
  if not /^[0-9]{2,10}$/: return false
  key   = [7,5,3,2,1,7,5,3,2]
  ctrl  = last digit
  body  = leftPad(all-but-last, 9, '0')
  sum   = Σ body[i]*key[i]  for i in 0..8
  check = (sum*10) mod 11 ; if check==10: check=0
  return check == ctrl
```

```
canonicalCui(raw):
  s = raw.toUpperCase().replace(/[^0-9A-Z]/g,'')
  if s.startsWith('RO'): s = s.slice(2)
  s = stripLeadingZeros(s)          # canonical = integer form
  return { cui: s, valid: cuiIsValid(s) }
```

Edge cases: foreign suppliers fail checksum → route to name/id tiers, **never
discard**. 13-digit values failing CUI check are likely CNPs (personal codes) —
do **not** merge on them. Very short CUIs (2–4 digits, old state entities) are
valid — no minimum-length filter above 2.

### Three-tier resolution (auto-merge only on tiers 1–2)

1. **SICAP internal id** — `supplierId`, `contractingAuthorityID`, winner
   `entityId`. Caveat: supplier-id and authority-id are **different namespaces**;
   a state entity that both buys and sells has one id in each. Do not treat the
   two id spaces as the same identity — resolve both to a shared entity via CUI.
2. **Canonical CUI** — only merge on a **checksum-valid** CUI. Stable entity key.
3. **Fuzzy name** — **suggestion only**, written to `core.entity_name_suggestions`
   with score + both source strings + any id/CUI evidence. Human adjudicates.
   Log merges with provenance so they can be un-merged.

### Name canonicalization (fuzzy tier only)

Pipeline: NFC → lowercase → diacritic fold (handle **both** cedilla `ş U+015F`
and comma-below `ș U+0219`, same for ț) → **extract legal-form tokens into a
separate `legal_form` field** (SRL, S.R.L., SA, SNC, SCS, SRL-D, PFA, II, IF,
SC, RA…) so they don't dominate trigram overlap → normalize punctuation/space.
**Keep** the ordinal (`nr 4`) and locality (`Lugoj`) — for public institutions
they *are* the identity (`Grădinița nr. 4 Lugoj` vs `nr. 5` ≈ 0.9 similar but
different entities).

### Postgres fuzzy matching

`pg_trgm` (GIN `gin_trgm_ops` on `name_normalized`) + `fuzzystrmatch` +
`unaccent`. Thresholds: **≥0.85 strong, 0.55–0.85 weak, <0.55 drop** (the
default `%`=0.3 is far too loose — merges distinct firms). Block by locality
before comparing (avoids O(n²) and cross-city false positives). Hard **negative**
rule: differing trailing ordinal or locality suppresses a suggestion even at high
similarity. `levenshtein_less_equal ≤2` tiebreaker for short names.

### v2 enrichment (out of scope v1, noted)

ANAF free web service (`POST …/PlatitorTvaRest/api/v9/ws/tva`, ≤500 CUIs/req,
1 req/s) returns official name, address, VAT flag, `nrRegCom`, CAEN — would let
us *prove* a RO/no-RO pair is one entity and auto-fill official names. v2.

---

## 3. Units

Free-text `itemMeasureUnit` (`"bucata"`, `"Litru"`, `"100 Bucăți"`). Always store
`unit_raw`; resolve nullable `unit_canonical` + `unit_factor` via a
`core.unit_map` reference (`raw_pattern → (canonical, factor)`), e.g.
`"100 Bucăți" → (buc, 100)`. Unmapped → null (never guessed). Seed the map from
the observed distinct values in `da_items`; grow over time. Canonicalize the
lookup key the same way as names (lowercase, diacritic-fold, trim) so
`"Bucăți"`/`"bucata"`/`"BUCATI"` hit one rule.

---

## 4. Core schema (proposed)

New file `packages/db/src/schema/core.ts` additions (keep existing
`ingestion_watermarks`, `scrape_runs`). All in `core` pgSchema.

### Reference / dimension
- **`entities`** — `id` (bigserial PK), `cui_canonical` (text, unique, nullable),
  `cui_valid` (bool), `sicap_supplier_ids` (int[]), `sicap_authority_ids` (int[]),
  `name_display` (text), `name_normalized` (text, GIN trgm), `legal_form` (text),
  `county` (text), `nuts_code` (text), `first_seen` / `last_seen` (timestamptz),
  `cui_raw_variants` (text[]).
- **`entity_name_suggestions`** — `id`, `entity_a`, `entity_b` (or candidate
  raw string), `score` (real), `evidence` (jsonb), `status`
  (open/merged/rejected), `created_at`.
- **`cpv_codes`** — `code` (text PK, `NNNNNNNN-D`), `name_ro`, `name_en`,
  `revision` (text), `division` (text, first 2 digits, for rollups).
- **`sicap_cpv_ids`** — `sicap_id` (int PK), `code` (text FK → cpv_codes).
- **`unit_map`** — `raw_pattern` (text PK, canonicalized), `canonical_unit`
  (text), `factor` (numeric).

### Fact
- **`notices`** — participation/tender, list-level: `id`, `raw_id` (FK), `notice_no`,
  `sys_notice_type_id`, `sys_notice_version_id`, `authority_entity_id` (FK),
  `cpv_code` (FK, nullable), `cpv_valid`, `estimated_value_ron` (numeric),
  `state`, `state_date`, `is_online`, `procedure_type`, `has_lots`.
- **`awards`** — award notices: like notices + award-specific
  (`lowest_offer_value`, `highest_offer_value`, `ron_contract_value`).
- **`contracts`** — one per `caNoticeContractId`: `id`, `raw_id`, `award_id` (FK),
  `contract_no`, `contract_date`, `contract_value` (numeric), `currency`,
  `cpv_code`, `title`, `lots_caption`.
- **`contract_winners`** — **M:N** (consortia): `contract_id` (FK),
  `entity_id` (FK), PK(contract_id, entity_id). (Contracts carry a `winners[]`
  array — joint bids are real.)
- **`direct_acquisitions`** — `id`, `raw_id`, `da_code`
  (`uniqueIdentificationCode`, e.g. `DA40761319`), `authority_entity_id` (FK),
  `supplier_entity_id` (FK), `cpv_code`, `cpv_valid`, `estimated_value_ron`,
  `closing_value` (numeric), `publication_date`, `finalization_date`, `state`.
- **`da_items`** — line items: `id`, `da_id` (FK), `cpv_code`, `catalog_item_name`,
  `quantity` (numeric), `unit_raw`, `unit_canonical`, `unit_factor`,
  `unit_price` (numeric), `closing_price` (numeric).

### Operational
- **`quarantine`** — `id`, `raw_id` (FK), `endpoint_version`, `zod_error` (text),
  `payload_excerpt` (jsonb, small), `created_at`.
- **`normalize_watermarks`** — `transform` (text PK), `last_raw_id` (bigint),
  `updated_at`. High-water cursor over the monotonic `raw_documents.id`.

**Money:** use `numeric`, not float, for all value/price columns.
**Geo bonus:** contracts winners carry county + `nutsCodeItem` (`RO321
Bucuresti`) → populate `entities.county`/`nuts_code` from the richest source.
Ignore the broken `nutsCode` scalar (`System.Data.Entity.DynamicProxies…`); read
`nutsCodeItem.text` / `nutsCodeID`.

---

## 5. Parser architecture

- **Dispatch by `endpoint_version`** — one parser per (family, era):
  `tender-list:v1`, `award-list:v1`, `award-contracts:v1`, `da-list:v1`,
  `da-detail:v1`. Registry map `endpoint_version → { zodSchema, transform }`.
- **Fail-loud zod** at the boundary: parse the raw payload with a strict schema;
  on failure → `core.quarantine` row, continue (DEC-004). Success → typed object
  → transform → upsert into core tables (+ entity resolution).
- **Replayable + incremental**: process `raw_documents` in `id` order from each
  transform's `normalize_watermarks.last_raw_id`. Full rebuild = truncate core
  fact tables + reset watermark to 0 + replay. Entity/dimension upserts are
  idempotent (natural keys: CUI, code, contract id).
- **Two-pass or upsert-on-the-fly for entities**: resolve/insert the entity
  (tiers 1–2) as facts stream in; queue tier-3 name suggestions for later. Entity
  ids are stable across replays because they key on CUI/SICAP-id, not insert order
  — but a full truncate reassigns bigserial ids, so fact tables must be rebuilt in
  the same replay (they reference entity ids). Acceptable: core is derived.
- **Transaction boundary**: per raw doc (or small batch) → all its core rows +
  watermark advance in one tx, mirroring bronze's archive+cursor pattern.

---

## 6. Gray areas — resolutions

| Gray area | Resolution |
|-----------|-----------|
| CPV catalog source | Official EU CPV 2008 XML (SIMAP), vendored seed. SICAP only for id→code map. |
| Name canonicalization | Pipeline in §2 (fold both cedilla variants; legal-form to separate field; keep ordinal+locality). |
| first_seen/last_seen | min/max of source-record dates (`state_date`, `publication_date`) across all facts touching the entity; updated on each replay. |
| Incremental cursor | **Per-transform** cursor over `raw_documents.id` (one row per endpoint_version in `normalize_watermarks`). |
| Contracts→entity linkage | Winner carries `entityId` (SICAP) + `fiscalNumber` (CUI) → tiers 1–2 resolve cleanly; `winners[]` → M:N `contract_winners`. |

---

## 7. Open question for planning

- **CPV seed mechanism**: commit the parsed `cpv_2008` as a JSON/CSV asset in
  `packages/db` and load it in a seed migration, vs a one-off fetch+parse script.
  Recommendation: **vendored JSON asset + seed script** (offline, deterministic,
  no build-time network). ~9.5k rows is trivial.
- Confirm `estimated_value_ron` vs `estimatedValueExport` semantics on notices
  (which is the trustworthy RON figure) during implementation against samples.
