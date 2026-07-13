# Context: red-flags

## Discussion — 2026-07-13

User asked for "very, very serious planning" of a red-flag engine covering both
direct acquisitions and awards.

**Research findings that shaped the plan:**
- db-old dump is **DA-only** for transactions: 4.78M `directAcquisitionContract`
  docs (values, publication + finalization dates, CPV, `supplier` as "CUI name",
  `contractingAuthority` as "sicapId name"). No award/tender/offer/bid collections.
- Sample DA already shows a vivid flag: published 13:56:37, finalized 14:00:05
  same day (4 min), CA decision deadline set AFTER finalization.
- `core` schema already fits: `direct_acquisitions` (authority/supplier/estimate/
  closing/pub+final dates/state), `awards` (has lowest/highest offer values but NO
  bid count), `contracts` + `contract_winners` (consortia).
- `marts.authority_concentration` + `marts.entity_top_partners` are empty — the DA
  pair data fills them.

**Decisions locked (see DECISIONS.md):** full 4.78M import; binary CRI; all 7 v1
DA flags; polymorphic replayable `core.flags`; date-aware versioned thresholds;
award engine dormant-but-ready.

**Open item:** confirm exact historical DA ceiling values + change dates (DEC-006).

## Domain references
- Open Contracting Partnership — red-flag guide.
- DIGIWHIST / opentender.eu — Corruption Risk Index (CRI) indicators.
- World Bank / EU procurement risk indicators.
- Legea 98/2016 (achiziții publice), art. 7(5) — direct-acquisition ceilings.
