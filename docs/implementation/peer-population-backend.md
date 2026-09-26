# Population and personally selected comparisons — backend

Completed 26 September 2026. Root owns final browser/build/release status in `HANDOFF.md`. No main database writes, migrations, commit, push or deployment were performed by this backend task.

## Delivered behavior

`/api/peers` resolves the default method to `population` for recognized primary local administrations/county councils and to `activity` for other institutions/suppliers. Local administrations share one population group regardless of commune, city or municipality status. County councils form a separate group using the served county's direct official population total. Sectors are deliberately excluded from automatic population mapping.

Population suggestions are the nearest ten **confidently identified administrations available in the application**, sorted by absolute resident-population difference and then entity ID. They are independent of the selected procurement year, CPV division, channel, counts and amounts. The optional county filter refers to the served territory. Every population carries the signed percentage difference, INS reference date, official URL, workbook SHA-256, row number, SIRUTA where applicable, catalog version and mapping method.

The census source is `apps/web/lib/reference/population-rpl2021.json`, version `ins-rpl-2021-table-1.22-v1`, resident population at **1 December 2021**, from INS RPL2021 Table1.22. The old `reference.uat.population` is never read because the audit found that it contains older census values. See `peer-population-audit.md` and the reproducible parser for source verification.

Manual selection accepts up to **50 other entities**, preserves their explicit order and returns the entire editable roster without pagination. The focal entity, duplicates, malformed or stale identity receipts, missing entities and wrong-role selections are rejected. A deliberately empty manual list is valid. A manual county filter is rejected because membership is established by the explicit roster. An omitted catalog version is resolved on first load; a supplied stale version fails409. The resolved method/catalog/members are returned in filters for stable URLs and v2 source receipts.

Members with no eligible source records remain in the roster. `recordCount=0` signals **no observed records**, not zero expenditure; their amounts are excluded from peer medians. `observedMemberCount` explicitly names the median denominator, with at least five observed other members required for interpretation. Focal sources do not enter the peer median. SQL numeric values and consortium allocations preserve existing exact-source semantics.

## Conservative authority mapping

- Require valid canonical CUI and evidence of authority role (SICAP namespace, profile or actual source record).
- Require a primary-government name, not a school, service, hospital or other subordinate entity sharing the UAT code.
- Corroborate positive existing SIRUTA with the official unit name and county. Never override conflicting positive SIRUTA with a name guess.
- When the old mapping is absent, allow an exact, unique government-name + county match to the official catalog. Record this as `exact_name_county`; it is not an official CUI crosswalk.
- Normalize diacritics/punctuation and only two bounded historical spelling variants (`Tîrgu/Târgu`, `Rîmnicu/Râmnicu`). Repeated `Primăria` / `Consiliul local` suffixes are accepted only if bare legal labels or the same administration name. Explicit conflicting county or repeated-name suffixes fail closed.
- County councils derive served county from a strict county name/prefix, including bounded repeated council suffixes and `U.A.T.`. This correctly uses Ilfov population even though its council office is registered in București.
- Distinct qualifying authority identities for one served territory are ambiguous: both are excluded. Procurement activity is never used to choose an identity.

Independent audit coverage: **2,874 local administrations +39 county councils**. Suceava county's two authority-namespace identities and Prahova's department-like council name remain conservative exclusions. București municipality is mapped separately from its sectors. Buzău's suggested ten coincide exactly with the official ten nearest geographic populations; this agreement must not be generalized to all places with incomplete mapping.

## API and compatibility

`PeerInput` adds `method: population|activity|manual`, optional `populationVersion`, and JSON URL `members:[{id,identity}]` for manual groups. Manual pagination canonicalizes to page1/pageSize50. `PeerMember.population`, `selectionReason`, `cohort.observedMemberCount`, `cohort.missingPopulationCount`, and `methodology.defaultMethod` support the UI and saved evidence.

`GET /api/peers/candidates?entityId&role&search&identity&checkpointId&populationVersion` validates a focused2–100character name/CUI search under the shared analytic checkpoint gate. It returns20 identity-bound candidates and `hasMore`. Exact CUI ranks first, confidently mapped administrations next, then other matching entities. Bounded modern/historical spelling variants let a search for `Târgu Mureș` find the stored `Tirgu-Mures` authority. This does not fuzzy-match population identities. The query uses indexed normalized-name patterns and source/role indexes, without scanning whole procurement marts for candidate amounts.

Old pinned URLs without a method retain **activity** semantics. `getLegacyPeersInSnapshot` in `peers-legacy.ts` returns the exact original v1 result shape and original methodology; v1 evidence binding calls it explicitly so pending/saved receipts preserve their original fingerprints. New unpinned visits use the new defaults. Future changes that alter population provenance or matching/membership semantics must increment the pinned catalog/method receipt version rather than silently reinterpret existing v2 requests.

## Validation

- `pnpm --filter web typecheck`: passed before root production build.
- 12 focused unit tests passed: original4 plus new8 for source mapping, aliases, strict suffix/county validation, ambiguity, category mixing, manual input validation and candidate request scope.
- 17 isolated PostgreSQL scenarios passed: original10 activity tests plus7 new population/manual scenarios. They verify the nearest-ten roster independent of year/domain, zero-source retention and median exclusion, exact ordered manual members, all25 members visible beyond the old20-row boundary, empty groups, catalog/identity/role/checkpoint failures, exact CUI and modern-name search with26 distractor associations, and unchanged legacy receipts.
- Read-only main-database check: Buzău103,481 residents;2025/CPV45/all has18 focal records totaling481366697.99. The ten members and signed percentages exactly match the independent official-population audit. Median total90538866.635, with10 observed other members.
- Measured warm local query time312ms for the Buzău comparison. Modern `Târgu Mureș` candidate search returned entity2146721 first in635ms after priority correction. These are local observations, not production latency guarantees.
- Main verification connections explicitly used `default_transaction_read_only=on`.

The isolated backend fixture database was `seap_test_population_backend`; it was dropped after successful validation. Scratch verification code was removed. Main procurement/auth/reference data were untouched.
