# DA list partition experiment — 10 October 2026

Research requested by the owner: prove national date-based direct-acquisition discovery without enumerating every authority. This is a dated research procedure, **not an operational command or deployed collector**. Do not rerun it without checking current authorization, controls and capacity.

## Pagination controls

The public SEAP JavaScript archived on 26 September (`.local/document-pilot-buzau-20260926/response-03-aba183165fe8.js`) explicitly sends `pageIndex` and `pageSize`. Its DA controller computes pagination from the returned total and uses the configured maximum result count in its truncation message. It also sends `cpvCodeText`, which our current list wrapper does not expose.

Live 8 October list, fetched 10 October:

- size2000/page0:2000 rows, total2000, searchTooLong=true.
- size2000/page1:0 rows, total2000, searchTooLong=true.
- size100/page0:100 rows, **exact ordered match** to rows1–100 of the big response.
- size100/page19:100 rows, **exact ordered match** to rows1901–2000 of the big response.
- size100/pages20 and21:0 rows each, total2000, searchTooLong=true.

Thus pageIndex works, but pagination on this query stops at the truncated window. This is observed behavior, not a claim that every undiscovered API or export has the same limit.

## Filter discoveries

- `cpvCodeId` is exact, not hierarchical. Root33000000→4 exact-code rows; root45000000→3 exact-code rows on8October.
- `searchCpvs?parentId=6` and7 both returned the same50items/total9455. They do not establish category membership; requested pageSize2000 is capped to50.
- `cpvCodeText=33` returned2000 capped rows, including227 codes not starting33 (e.g.15332290). Treat it as a substring search, **never a disjoint hierarchy filter**.
- `cpvCodeText=3369` returned473 complete rows, spanning33690000 and descendants; all observed codes started3369.
- `uniqueIdentificationCode=DA4135` andDA41358 both returned0. Prefix matching on DA identifiers is not established and must not be assumed.

## Bounded experiment

`probe.mjs` reads the existing official CPV2008 catalogue (9454codes), starts with its two-digit prefixes, and requests each closed day nationally with `cpvCodeText`. If a result is truncated or reaches2000, it is replaced by finer prefixes from the catalogue. Only complete leaves enter the final union. Repeated IDs across text-search leaves are deduplicated; conflicting representations are reported. A saturated eight-digit leaf stops for a separately verified fallback.

This is a **cover with possible overlap**, not disjoint source partitions. All valid catalogue codes are covered by the prefix tree; incidental substring matches do not justify dropping any required branch. Using the fixed catalogue rather than CPVs already present in the test day avoids selecting queries from the answer being reconstructed.

Three research workers share the existing production gate; hard bound400 HTTP attempts, no automatic research retries. Baseline is a read-only public projection of all normalized DAs finalized7/8October. Compare full ID sets, CPV, value, state and both CUIs; require closed-day filtering and unique IDs within each response. No DA details or PDF downloads.

## Verified result

| Closed day | Baseline IDs | Current list IDs | List calls | Missing IDs explained by live detail | Unexplained omissions/extras |
|---|---:|---:|---:|---:|---:|
| 7 October |11219|11212|61|7|0/0|
| 8 October |10940|10937|61|3|0/0|

Each day used45 division probes plus16 finer probes (overflows30,31,33), producing58 complete leaves. The leaves cover every one of the9454 official CPV codes exactly once **as leading prefixes**; source substring results themselves overlap heavily. 7October returned31978 leaf rows→11212 distinct IDs;8October30810→10937. No conflicting repeated representations.

All10 apparent omissions were checked using the full-detail endpoint. Four now have finalization date9October/state6(refused by authority); six have finalizationDate=null/state5(waiting for authority). They no longer belong to the closed-day source lists. The adjusted baseline and the new union match exactly for both days. This proves the tested reconstruction relative to the independently collected baseline, not that every possible missing SEAP record has been ruled out historically.

CPV, state and both normalized CUIs match for all shared records. The initial probe's deliberately simple CUI regex produced false differences for old single-R prefixes and foreign suppliers; the offline verifier applies equivalent existing Romanian CUI parsing/checksum rules and finds zero identity differences. Two real amount differences remain:

- DA ID123187952:4799.90→5994.90RON, finalization date still8October.
- DA ID123184633:1541→1675RON, finalization date still7October.

Do not overwrite or delete production records based on this research. Preserve source versions. These observed updates mean yesterday-only collection is insufficient: include trailing-window rescans and explicit reconciliation of disappeared/reopened records when implementing the replacement.

The61 requests/day measure **list discovery only**, compared with the current38425 initial per-authority probes/day:≈99.84% fewer requests for these samples. An initial national overflow probe adds one call; detail enrichment, catalogue reconciliation and retries are separate costs. No general fixed61-call guarantee.

Full research accounting:147 HTTP attempts in this experiment (146successes + the verified HTML false positive), including122 partition list requests and10 detail requests for discrepancies. The preceding pilot used20 requests separately:167 combined. No settings changes, no normalization/mart writes and no PDF traffic. Final controlrevision114,paused=false,maintenance=false,blocked_reason=null;695successful requests across ordinary collection and probes in the last5minutes at final verification.

`verified-results.json` contains the compact public evidence. `verify.py SOURCE_DIR BASELINE_JSONL` recomputes the reconciliation offline from the private responses and read-only baseline. `probe.mjs` now uses the production CUI parsers for subsequent rehearsals; its earlier raw reconciliation is retained in the private archive.

Limits before operational replacement: reconcile SEAP's9455 catalogue entries against9454 official codes; handle unknown/null codes and future taxonomy changes; verify any saturated leaf fallback; archive task results durably and retry under existing policy; preserve correction rescans. A finite day sample cannot certify all historical coverage.

## Research-induced false positive, restored

The current ingestion transport classifies every HTTP200/non-JSON body as a challenge. A research fetch of the normal public HTML page therefore incorrectly suspended collection (request425101, HTML SHA25657a5b149822d2c6327ff49d97fe92ee49d4b8abac8c5939443687aa57d42c4ad). The body was verified as the ordinary public SPA, including PUBLIC INDEX, not an anti-bot challenge. Cleared only this blocked_reason/blocked_until using a transaction guarded by revision114, exact request/hash/context and absence of newer failed requests. Kept the failed ledger entry and all diagnostics. Settings, pause, maintenance and revision unchanged;97 later successful requests verified immediately afterwards.

A planned `/app-pub` fetch was rejected by the existing endpoint allowlist before HTTP; no bypass was attempted. Used the already archived JS instead. Do not use the JSON-assuming ingestion transport to inspect HTML/JS.

Private evidence: `.local/da-partition-proof-20261010/` and server `/srv/seap/repairs/da-partition-proof-20261010/`. Production request context: `audit:da-partition-proof-20261010`. This report accompanies [the initial20-request pilot](../2026-10-10-da-collection-strategy.md).
