# Production collection completeness audit — 9 October 2026

**Verdict: NO, production does not contain everything across all years.** The current recovery has exhausted its executable queue, but has 76 failed detail tasks. Historical collection also has confirmed omissions and a newly confirmed participation-notice identity collision. A numeric-ID-only coverage check incorrectly counts some unrelated notices as present.

Scope: production SEAP streams (direct acquisitions, participation notices, award notices),2018–2026, through the last closed day 8 October2026. No claim about pre2018/legacy SEAP or every other public procurement publication family. TED and attachments were inventoried separately, not exhaustively checked against their source.

## Operational scope and request cost

- Controlrevision 101,unpaused,unblocked; public maintenance and collection-during-maintenance remain enabled. Batch`recovery-2026-09-25`,end_day2026-10-08,follow_latest=true,status=incomplete. No pending/running tasks in the inventory.
- **37 additional SEAP requests, all HTTP200**, through the installed production client/shared gate/proxy pool:18 annual notice first pages,8 historical contract inventories,9 annual DA first pages,2 identity confirmation roots. No automatic retries, PDF downloads, task requeues, normalization, code deployment or operator-setting changes.
- The two historical day probes from8 October are not counted again; today's recheck used their saved115 IDs against production only.
- Read-only SQL with bounded statement timeouts. One initial contract reconciliation timed out at30 seconds; revised query materialized small fields before expanding IDs and completed. No DB mutation from audit SQL.
- Full public-list responses are local and Git-ignored in`.local/coverage-audit-20261009/{source,followup}`; request IDs, safe parameters, observations and hashes are in[evidence.json](evidence.json). Root confirmation saves identity fields only. Scratch scripts/files on the server/container are not scheduled jobs.

## 1. Critical: participation IDs are scoped to source families

Confirmed example:

| Source route | Public ID | Internal notice ID | Identity |
|---|---:|---:|---|
| PUBLICCNotice/getPubCNoticeView |100004524|100038419|CN1002119, from source list and root|
| PublicRFQInvitation/getRfqInvitationView |100004524|100019534|Different notice; normalized row is SCN1002813,type 17|

Production has only theSCNrow for this public ID;CN1002119 is absent even when searched by notice number across the entire`core.notices`table. The source list identifies CN1002119 as type 2 and title`Furnizare consumabile HR`.

Cause: `packages/db/src/schema/core.ts` defines unique`notices_c_notice_id_uq`on numeric`c_notice_id`alone. `loadNoticeLike`in`apps/ingestion/src/normalize/parsers.ts`upserts on that key, replacing the previous notice fields. SEAP exposes different route namespaces with overlapping public IDs. This explains how an ID-presence test can pass while the wrong notice is stored; do not extrapolate a total loss count from this sample.

Historical sample:100 participation notices per year, first page, **800 notices for 2018–2025**. **221 have a different stored notice number/type**, and all 221 are absent when searched by their correct notice number elsewhere in`core.notices`. They also have no historical raw list archive in production. Counts by year:

| Year | Sampled participation notices | Wrong identity / absent correct notice number |
|---|---:|---:|
|2018|100|19|
|2019|100|8|
|2020|100|17|
|2021|100|39|
|2022|100|38|
|2023|100|23|
|2024|100|15|
|2025|100|62|

The 2026 participation sample had0 identity mismatches, but a **full comparison of all 18,167 current raw participation-list rows** found37 matching numeric IDs with a different normalized identity,51 IDs not yet normalized, and18,116 numeric matches overall. There are0 duplicate notice numbers under one external ID inside the current raw list inventory. These 37 are a current raw/core inconsistency; the recent batch is not yet a successfully published snapshot.

No award identity mismatch was found in the 800 historical award samples; this is not a certificate that all award namespaces are globally collision-free.

**Repair order:** establish a route-aware identity (or globally unique internal notice identity with validated mappings), preserve existing references, update collector task/archive keys and lookups as necessary, then restore displaced notices. Types 12/17/19 share a route family; do not mechanically assume every type is a separate namespace without verifying it. Audit consumers that join/link by numeric ID. Recollecting and running the current upsert unchanged can overwrite one notice with another again. No repair has been applied.

## 2. Current recovery: lists and contracts reconciled,76 details missing

| Layer | Verified result |
|---|---|
| Participation lists,1 Jan–8 Oct2026 |281 daily partitions;18,167 notice IDs;0 pagination mismatches|
| Participation details |18,167 roots and all currently planned child graphs complete|
| Award lists,1 Jan–8 Oct2026 |281 daily partitions;33,742 notice IDs;0 pagination mismatches|
| Award contract inventories |33,742 inventories reconciled to distinct IDs;248,382 contract-to-notice memberships;2,772 legitimately empty source inventories;0 mismatches|
| Award details |33,668 roots complete;33,666 complete graphs;76 distinct notices have a failed task|
| DA,1 Jul–8 Oct2026 |38,425 known authorities cover the full date range;192,110 completed leaf partitions;630,504 listed records;0 pagination/count mismatches|
| Authority catalogue |5 enumerations reconciled;118,712 rows across repeated catalogues, **not**118,712 unique authorities|

All known notice IDs have a root task. Contract counts are memberships in notice inventories, **not a deduplicated count of economic contracts**. Daily lists and leaves reconcile to the totals/IDs recorded at collection time, not to a fresh full source sweep. Known-authority completeness does not prove that no unknown historical authority exists.

Failed details:

-66 type 18 root requests:HTTP400.
-2 type 20 root requests:HTTP400.
-2 type 3 eForm requests:HTTP400.
-6 type 3 root requests:exhausted proxy/transport failures.

These are76 missing forms/details, not76 missing contract inventories. HTTP400 does not establish whether the cause is source availability or a routing/input defect; inspect responses before choosing a repair. Full task IDs/metadata are preserved in the evidence file.

## 3. Historical award gap remains:21 April2022

All 115 source notice IDs discovered on8 October remain absent from production`core.awards`,linked`core.contracts`,raw`award-list:v1`and raw`award-contracts:v1`at the checked keys. The current2026 recovery does not include that date. No recovery has been scheduled by this audit.

See[the original targeted audit](../20261008-historical-coverage/README.md). These are 115 notices; missing economic-contract count remains unknown, and equivalent records in other publications/TED have not been ruled out.

## 4. Historical daily runs do not prove full detail coverage

Production logs for 2018–2025:all 2,922 participation days have a completed,reconciled run;2,921 award days do,with 21 April2022 missing. Historical date windows were stored with fixed+03:00; the audit recovers the requested date using that convention, not mutable notice state dates.

The latest completed run per day explicitly records deferredv2 details on hundreds of days **in every year2018–2025**. In 2018 it also records detail-fetch failures on 118 participation days and 7 award days. A completed daily run certified its list counter, not successful retrieval of every form/contract. Do not sum warning counts across repeated runs and call that a count of unique missing notices.

Production's SEAP raw inventory contains only list/contract responses fetched from26 September2026 and detail responses fetched8–9 October. Existing normalized historical records are therefore not equivalent to retained raw provenance. Absence of raw alone is **not** proof an economic record is absent; the 221 identity-displaced notices and115 missing awards have separate positive evidence.

## 5. Historical direct acquisitions: present, not exhaustively certified

Core contains records in every year2018–2026 (roughly 21.3 million total). The historical DA process mixed imported data and resumed authority scans. Its13 run records include successful final segments as well as failed/interrupted segments; the retained global cursor is not a per-authority/per-period completeness manifest. Current durable recovery begins 1 July2026 and cannot certify previous years.

Additional source sample:100 DAIDs in each year2018–2026,900 total,all present in core. All returned finalization dates matched the requested year;2018 begins2 April in this sample. This is a **first-page sample**, not random or representative, and does not establish exhaustive historical coverage. All broad DA queries returned 2000/searchTooLong=true; annual notice queries returned 3000/searchTooLong=true. Neither capped total can be used as a source denominator.

Eight sampled historical awards with no stored contracts (one per year2018–2025) each returned an empty contract list from SEAP. Thus absence of contracts under an award is not automatically a collection gap. Other historical contract inventories still require source reconciliation.

## 6. Other layers and publication

- Individual DA detail/item retrieval is optional/off by default; the durable recovery collects DA list fields. It does not mean everygetView,quantity/unit-price line item or correction history was downloaded.
- No attachment/PDF backfill is part of the agreed recovery. Production document inventory currently has 0 rows;0 downloaded/processed attachments. This is separate from JSON notice forms and from the on-demand authenticated download feature.
- TED's stored coverage ends 30 June2026; it is a separate collector, outside the three SEAP streams. No live TED audit was performed here.
- The9 October05:00 full processing run failed at`identity-quality`; maintenance remains enabled. Completed raw collection does not mean the UI/statistics have a validated current publication. This pre-existing publication blocker is distinct from the newly found participation-key collision.

## Recommended next steps

1. Fix and validate participation-notice identity, including preservation of both notices and safe references. This comes before historical replay.
2. Resolve the 76 current detail failures with cause-specific handling; recover the 115 known missing awards and their contracts/details.
3. Build a persistent historical manifest by date and source namespace; enumerate lists in source windows below their cap and compare exact identities. Use existing data for matches and fetch missing fields/inventories selectively. No full historical backfill was initiated here.
4. Reconcile historical DA by authority and closed date windows, including the union of historical and current authorities; split capped windows. Count requests from the resulting plan rather than guessing from annual capped totals.
5. Treat PDFs, DA line items and TED catch-up as separate scopes. Validate normalization/publication after repairs before reopening the site.

The audit has established concrete gaps; it has **not** issued a full historical completeness certificate. The sample counts above must not be presented as the total number of missing records across SEAP.
