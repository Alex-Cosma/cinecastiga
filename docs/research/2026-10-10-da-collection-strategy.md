# Direct-acquisition discovery strategy — live bounded pilot, 10 October 2026

Owner asked whether DA collection can avoid querying every authority, whether ordinary pagination bypasses the 2,000 cap, and whether detail acquisition is separate. Research only: no collector/configuration/task-plan changes and no production raw/core writes. Normal collection continued. The existing production client/shared proxy gate logged all **20 successful requests**, context partition `audit:da-strategy-20261010`. No retries or PDF/detail fetches in the pilot.

## Confirmed endpoints and behavior

`POST /api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/` already accepts `contractingAuthorityId:null`, `finalizationDateStart/End`, optional CPV category/code, pageIndex/pageSize. The date is finalization, not publication; this endpoint's ignored publication/time-of-day filters were established in earlier research.

Live 8 October2026: national pageIndex0/pageSize2000 returned2000 unique rows, total2000,searchTooLong=true. PageIndex1/pageSize2000 returned **zero rows**, still total2000/searchTooLong=true. Normalized production contains10,940DAIDs finalized that day. Thus the cap is the searchable result window, not merely a page size.

Live 4 October2026 (Sunday): national query returned99unique rows,total99,no truncation. All99IDs matched normalized production, whose day population is also99. This specific day can be collected in one list request instead of38,425authority probes.

## Category pilot for 8 October

Current `GET /api-pub/ComboPub/getCpvCategories` returned12categories. Each was requested without an authority filter, pageSize2000. All dates matched. The observed category responses had no intersecting IDs.

| Category | Returned | Truncated |
|---|---:|---|
| 1 Agriculture/food |1667|no|
| 2 Construction |728|no|
| 3 Energy/water |110|no|
| 4 Hotels/restaurants |45|no|
| 5 Mining |41|no|
| 6 Manufacturing |2000|**yes**|
| 7 Health/social care |2000|**yes**|
| 8 Services |1420|no|
| 9 IT/communications |1102|no|
| 10 Transport |405|no|
| 11 Real estate |0|no|
| 12 Utilities/waste/environment |121|no|

Combined9,639distinct observed IDs, all9,639present in normalized production. **This is not a complete national inventory:** two categories still overflow; do not treat summed capped totals as the day's true total or certify category exhaustiveness from this pilot.

Two finer-filter checks used `searchCpvs` to resolve internal IDs (never assume the CPV code string is the ID), then list filters combining day/category/code:

- Category6,44423000-1→internal16110:320unique rows,total320,no truncation; every returned code/date matched.
- Category7,33690000-3→internal13121:189unique rows,total189,no truncation; every returned code/date matched.

These two exact-code filters work; the pilot does **not** prove hierarchical prefix/descendant behavior, a complete category-to-code mapping, or an exhaustive replacement for an overflowing category. Those must be verified before switching collection.

## Recommended next implementation/rehearsal

1. Discover each closed day nationally. Archive/complete only when nontruncated exact distinct count and date/identity checks pass.
2. On overflow, split by verified source categories. Do not mix parent capped rows and child counts as separate work/data.
3. Refine only overflowing categories using a verified complete CPV partition. Test missing/uncategorized codes and coverage of newly used codes; a list of historically observed codes alone is not exhaustive. If a smallest validated slice still overflows, use a safe finer supported filter or retain authority fallback for that scope. Do not silently mark it complete.
4. Rehearse alongside the existing authority collector on several completed weekdays/weekends: compare full IDs and relevant fields, not just counts. Establish actual call counts before promising a particular daily reduction. Keep current queued collection until the replacement is proven.
5. Track ongoing daily collection separately from initial/historical recovery in admin. Discovery and detail enrichment need separate progress/budgets.

Full DA details use `GET /api-pub/PublicDirectAcquisition/getView/{directAcquisitionId}`. The current durable DA runner archives list records and does not automatically enqueue per-DA detail fetches. The older scrape module supports optional fetchDetail and correction rescans, but that does not mean the current worker runs them. Lists already contain title, authority/supplier, CPV, dates, state and values; full details remain a separate workload/policy. Existing historical details are not being deleted.

Private full source responses and probe scripts: `.local/da-strategy-20261010/`; server `/srv/seap/repairs/da-strategy-20261010/`. Do not commit response bodies/credentials. All source traffic used the existing200/min,10concurrent,35–45sec/IP gate; no operator settings or maintenance changes.

## Follow-up: full partition rehearsal

[Two-day proof, correct pagination parameter, CPV text filter and source revisions](da-partition-20261010/README.md):61list calls/day, full adjusted ID reconciliation for7/8October. The exact-code/category-only pilot above is superseded as the preferred experimental approach by adaptive CPV text prefixes with deduplication. Not deployed.
