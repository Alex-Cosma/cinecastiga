# Source evidence implementation verification

Verified on 13 September 2026 against the local application's real PostgreSQL data. All database operations were read-only. No source fixtures, score changes, migrations or database writes were used.

## Coverage

All 13 answer types now expose their underlying rows through `/api/ask/rows` and the shared evidence drawer. Group selections use a validated `EvidenceScope`: exact entity IDs and roles, complements for “other” groups, CPV prefixes/complements, county, endpoint years and the production histogram bucket definition. The applied question remains distinct from search, status, source-stream, sorting and pagination controls inside the drawer.

- Counts and sums are calculated directly from source rows in the same repeatable-read transaction as the page.
- Monetary totals and exported values retain PostgreSQL numeric precision. Displayed currency rounds to cents; the calculation disclosure and CSV retain every stored decimal, including consortium allocation fractions.
- Contract rows retain allocated value, full contract value and winner count. Stable ordering includes the source stream, source ID and supplier ID.
- Profile evidence reads `core.direct_acquisitions` with the same `closing_value IS NOT NULL AND closing_value <= 2000000` rule as `marts.entity_flags`, including zero values and all offer states. Accepted-only subtotals and state filters remain separate.
- A profile is marked reconciled only when the current source count and exact sum equal the selected profile aggregates. Otherwise the mismatch is disclosed.
- Profile scoring semantics remain unchanged. Profile caveats no longer incorrectly claim that refused offers were excluded.
- Breakdown and Sankey no longer truncate their SQL grouping before computing “other”; visible presentation limits remain.
- CSV supports whole-source-scope and filtered-scope exports independently of pagination. The existing 100,000-row cap appears before export and in the downloaded file's name and completion message when it applies.
- Saved query evidence contains its own applied spec, `evidenceScope`, source totals, dates, capture time and a source URL. It is labeled a query-scope-and-totals snapshot; this does not claim to archive every underlying record immutably.

## Live checks

The transaction checks used authority 2128753 and supplier 2123754. The comparison additionally used authority 2138354. The risk distribution/scatter checks used Cluj schools as a real cohort.

| Answer | Source rows | Exact source total (RON) | Answer + source request |
| --- | ---: | ---: | ---: |
| Ranking | 85 | 245316.74 | 71 ms |
| Total | 85 | 245316.74 | 9 ms |
| Time series | 85 | 245316.74 | 12 ms |
| County map | 85 | 245316.74 | 7 ms |
| Category breakdown | 85 | 245316.74 | 32 ms |
| Comparison | 200 | 901168.30 | 46 ms |
| Change between years | 30 | 99758.40 | 9 ms |
| Network | 85 | 245316.74 | 12 ms |
| Money flows | 85 | 245316.74 | 12 ms |
| Relationship check | 50 | 87315.69 | 61 ms |
| Risk distribution | 226132 | 607028486.32 | 601 ms |
| Risk versus volume | 226132 | 607028486.32 | 404 ms |
| Superlative | 6916 | 14817949.66 | 142 ms |

Additional verified cases:

- Comparison accepted-only: 179 records, 775938.02 RON; original 200-record / 901168.30-RON totals remain unchanged.
- Comparison first-profile selection: exactly 100 records / 302587.02 RON, reconciled to that profile.
- Full comparison CSV source set: exact decimal sum of all 200 exported values equals the source total.
- All returned first-page records had their actual direct SEAP URLs.
- Desktop drawer and 320-pixel mobile drawer: ten source links, no horizontal overflow, correct profile-state disclosure, no browser runtime exceptions.

## National source performance

The unrestricted national total contains 20,680,081 source rows. Ordering all rows by value exceeded the existing 20-second SQL statement limit because this database has no global value index. Broad questions therefore open sources in explicitly labeled **Ordinea sursei**. Each data stream selects its indexed source IDs before the global page is merged; selecting `offset + limit` from both streams preserves correct global pagination.

The complete national request now takes **6.6 seconds**, including direct source count, exact sum and date bounds; the indexed page operation measured **42 ms**. No precomputed-total substitution or database index change was necessary. Sorting a nationwide source list by value/date and text-searching very large scopes can still hit the existing 20-second limit; the drawer preserves the question and explains how to narrow and retry.

The measured national sum, including every stored consortium fraction, was `1051349391700.50000001989499570000` RON. Display: `1.051.349.391.700,50 lei`. Both representations are exposed honestly.

## Regression checks

`pnpm --filter web exec vitest run lib/ask/evidence.test.ts` — **20 passed**.

Coverage includes exact decimal arithmetic beyond JavaScript's safe integer range, negative sub-unit values and cent rounding, spreadsheet formula protection, direct-link provenance, closed source-scope validation, all-13 coverage, separate full/filtered totals, parameterized literal search, all-status historical profiles and reconciliation mismatches, histogram boundary parity, endpoint-only trends, per-capita eligibility, CPV/partner complements, consortium pagination tie-breaking, indexed national pagination and already-aborted requests.

TypeScript check: `pnpm --filter web typecheck` passed after implementation.

Final integrated checks also passed against the running application:

- **6 HTTP checks:** accepted-only totals, exact profile selection, filtered CSV, whole-selection CSV, invalid scope rejected with HTTP 400, and source totals preserved during local text search.
- **5 keyboard checks:** calculation disclosure opens with Enter; accepted-only control preserves original totals; 30 consecutive Tab presses remain inside the native modal; Escape closes it; focus returns to the source button.
- Desktop and 320-pixel mobile screenshots: [desktop](previews/evidence-desktop.png), [mobile summary](previews/evidence-mobile.png), [mobile source records](previews/evidence-mobile-records.png).

## Final unrestricted aggregate audit

A subsequent read-only audit checked the unrestricted national fast path and individual source streams:

| Stream | Answer / stored aggregate count | Source count | Exact source total (RON) |
| --- | ---: | ---: | ---: |
| All | 20680081 | 20680081 | 1051349391700.50000001989499570000 |
| Direct acquisitions | 19581710 | 19581710 | 126473148355.40 |
| Contracts | 1098371 | 1098371 | 924876243345.10000001989499570000 |

The `marts.agg_national` decimal totals equal the source totals exactly, including stored consortium fractions. The answer's JavaScript-number representation rounds the sub-cent fractions but agrees at displayed cent precision. Fresh source request times were 6.2 seconds for all streams, 3.3 seconds for direct acquisitions and 76 milliseconds for contracts.

This audit identified two integration corrections:

1. Unrestricted DA-only totals bypassed the original all-stream-only fast path and hit the 20-second statement timeout. The existing `agg_national` per-stream rows provide identical counts and sums without a full scan; the stat fast path should use them for all three source choices.
2. Legacy homepage `getHeadline()` used `national_stats.kind = 'spend'` (`823037737693.76000000939100610001` RON), based on award-notice amounts. New query sources use actual contract amounts, producing `1051349391700.50000001989499570000` RON. This is a difference in definitions, not floating-point rounding. The new homepage headline and county map should use `agg_national` / `agg_map_county` when linking to query-engine sources. Legacy profile/domain aggregation semantics remain a separate existing definition.

The stat fast-path correction is now implemented and verified. It reuses the existing per-stream `agg_national` rows only when every filter is absent. Filtered stats and other block paths are unchanged; count-measure totals continue using `v_all`/`n_all`, while value totals use the existing plausibility scope. Fresh post-fix measurements:

| Stream | Answer time | Source time | Verified count | Verified displayed value (RON) |
| --- | ---: | ---: | ---: | ---: |
| All | 38 ms | 3291 ms | 20680081 | 1051349391700.50 |
| Direct acquisitions | 3 ms | 1423 ms | 19581710 | 126473148355.40 |
| Contracts | 2 ms | 127 ms | 1098371 | 924876243345.10 |

The stored aggregate decimal values also match source decimal values exactly. Five additional regressions cover the three unrestricted streams, count-measure scope and rejection of this shortcut for filtered stats. All **20 evidence tests** and TypeScript pass.

The homepage and county-map correction is also implemented. A discovery-only helper now reads these same query-engine aggregates; all three headline links retain `measure: value`, including the matching row-count population. All 42 county totals and counts match the query map, and Cluj's link reproduces 916,745 rows / 48,670,819,065.36 RON. The map explains that it excludes records without a known county. See [seven live reconciliation checks](previews/discovery-reconciliation.json).
