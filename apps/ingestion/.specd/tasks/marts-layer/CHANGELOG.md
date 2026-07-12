# Changelog: marts-layer

**Task:** marts-layer

---

_No implementation yet — task in discussion stage._

## Phases 1–5 — marts build (2026-07-12)

- Schema: `packages/db/src/schema/marts.ts` — 6 tables (national_stats,
  spend_by_cpv, entity_profile, entity_top_partners, top_entities,
  authority_concentration). Migration 0004; 0005 dropped national_stats PK →
  index (year nullable = overall row).
- `normalize/marts.ts` (`runMarts`) + `marts` CLI: atomic `sql.begin` rebuild.
  Shared `pair_spend` temp table (DA + exploded contract-winner rows) with
  full + split attribution (DEC-006). HHI + top-supplier-% via window/agg.
- Verified: national_stats reconciles EXACTLY to core (notices 937.8M, awards
  2.311B, DAs 2.86M). Consortia full vs split correct (CONI/GENERAL TRUST both
  full=468.9M, split=234.5M). Concentration: 114 single-supplier authorities
  all pct=1.0/hhi=1.0; ONRC 73.5M single-source surfaced. Idempotent.

## Enhancement — acquisition-type dimension (2026-07-12)

- Validated approach against user's 28GB 2020 dump (db-old/): CUI checksum
  98.4%/99.6% pass, CPV catalog exact 9454 match. Their contractsTotalSpendingByType
  cut (SERVICII/FURNIZARE/LUCRARI) adopted.
- core: added `acquisition_type` to notices/awards/direct_acquisitions
  (sysAcquisitionContractType.text); parsers updated; migration 0006.
- marts: new `spend_by_type(kind, acquisition_type, n, total_ron)`. Rebuilt:
  awards Lucrari 1.045B / Servicii 879M / Furnizare 387M; reconciles to national.
