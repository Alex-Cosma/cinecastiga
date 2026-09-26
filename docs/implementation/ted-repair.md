# TED amount and reference repair

TED remains a separate publication source. Its values are not added to SEAP totals and are not described as payments.

## Data contract

- One stable `ted_lot_results` row per notice/lot. Multiple result IDs for that lot are retained in `amount_details.resultIds`; this is a publication/result grouping, not a count of signed contracts.
- eForms reads every LotTender reference, deduplicates repeated references, follows every SettledContract reference, and retains per-tender winners, dates, source field, original decimal and currency. Rank-zero entries are not displayed as winning parties. Unknown/unresolved winners remain unknown.
- `PayableAmount` is the XML name for BT-720 **Tender Value**, including options/renewals. It is not the separate BT-779 executed-payment field. The UI uses “Valoarea ofertei / rezultatului”.
- `amount_kind` distinguishes single tender/result values, legacy explicit contract values, several offers, framework offers, offer ranges, framework ceilings, missing values, and unclassified legacy records.
- `awarded_value` is populated only for a single ordinary tender/result value or an explicit legacy contract value. Lower/upper tender values and framework maxima never replace it. Multiple offer values are retained separately without an invented sum.
- Decimal strings are preserved; no conversion through JavaScript floating point. Currency remains the original field currency; absent currency is not silently RON.
- Missing, contradictory, negative or malformed tender counts are unknown. Multiple results merged under one lot do not get an inferred combined bidder count.
- Winner names, IDs and countries are aligned in the same stable order. A multinational consortium counts once in the foreign-result headline and once in each distinct country bucket; country buckets overlap and are not summed. The web page explicitly describes the headline as a stored foreign marker: 66 current result rows have that marker but only Romanian winner countries. A shared SQL predicate provides their live count and exact `tara=neclar` list, with a source link for every result. It also handles absent countries without inventing an ISO code. No entity identity or stored marker is changed. The TED reader transports country arrays as JSON so null elements remain null rather than the driver's text-array string `NULL`.
- TED stats contain counts only. `total_ron` remains nullable for compatibility and is not populated by this builder. The page defaults to date order; its explicit RON value comparison excludes ranges, multiple offers, framework values and unclassified legacy records.
- SEAP matches require comparable explicit amount kinds, original RON currency, an unambiguous source mapping and the existing matching criteria. The inclusive `0.9` threshold uses `0.9::real` to match the stored score type. Lower-confidence links are labeled possible matches.
- Competition inheritance uses actual counts from eligible confirmed links. If those links disagree or include a missing count, that SEAP contract remains unknown. A consortium within one tender remains eligible; several tender references or a tender shared by lots does not become an assumed one-to-one match.

## Migration and replay

Migration `0026_ted_amount_provenance.sql` adds seven nullable TED columns only. It deliberately excludes pre-existing manually deployed auth/app objects and indexes found during snapshot generation. The updated snapshot records those existing objects to avoid re-generating that baseline drift.

Apply migrations using the normal database deployment process before running the new parser or web reader. Old rows remain visible as unclassified until replay; existing derived marts should be refreshed as one coordinated release.

The selective command uses the raw payload currently backing each existing notice. It does not alter ingestion watermarks, truncate core tables or refetch data. Its default mode only selects candidates:

```sh
pnpm --filter ingestion replay-ted --publication 298320-2026
pnpm --filter ingestion replay-ted --apply --publication 298320-2026
pnpm --filter ingestion replay-ted --apply --limit 1000 --concurrency 4
```

Concurrency defaults to 1 and is capped at 4. Historical F03 amount-only replay preserves existing winner edges only after verifying the identical unique lot-ID set; mismatches fall back to the full loader. The optional eForms shortcut additionally proves that the old and repaired winner-org sets agree, requires explicit positive ranks and selected-winner status, rejects duplicate/array/shared or unresolved references and ambiguous settled contracts, and verifies every existing contract date. Rejected eForms reuse the parsed notice in the full loader; they are not parsed twice. Full loaders serialize shared-entity writes with a transaction advisory lock; verified amount-only updates remain concurrent. Deadlock/serialization failures retry at most three times. Other failures stop scheduling and wait for active transactions, reporting only the publication, SQLSTATE, constraint and PostgreSQL primary error message.

Rerun the batch command until it selects zero notices. Each notice commits atomically with `normalization_version = 2`; a failure rolls back that notice and a later run retries it. Newer normalization versions are never downgraded. `--after-notice-id` is available for an explicitly bounded scan, but ordinary resume does not need it.

Lot IDs survive replay. Old crosswalk scores for replayed notices are invalidated because they used previous values and winner mappings. Invalidation follows the indexed `ted_lot_result_id`, not the unindexed notice column. Lot upserts and winner operations use bounded batches of 250 rows; repeated winner identity resolution is cached within a notice/date.

After replay, run the existing reconciliation, TED mart, ordinary mart, flag and radiography rebuilds in that order. Do not present a partially refreshed mixture as a completed repair. No auto-run deployment hook was added.

## Reconciliation execution and matching corrections

Reconciliation now runs in one transaction. It materializes eligible TED and SEAP winner projections in temporary tables, including all three candidate buckets as physical TED rows, indexes each by buyer + winner + logarithmic value bucket, and runs `ANALYZE` before matching. Materializing only the winners was insufficient: PostgreSQL could still apply a lateral bucket probe after a buyer/winner-only lookup. With physical probes, the full-data read-only-source diagnostic selected a merge join whose merge condition includes all three keys, using both composite indexes (temporary preparation and EXPLAIN: 20.14 seconds, then rollback). This prevents the previous planner from joining a TED buyer to all of that authority's awards before checking the winner. The observed old plan estimated 1,093 eligible TED rows against 2,099,926 actual rows. The replacement holds an exclusive table lock, so crosswalk readers may wait until commit. A failed match or primary-selection stage restores the previous complete crosswalk; temporary objects are cleaned up on success and rollback. No permanent tables or indexes are added.

Two intentional correctness changes accompany this execution fix:

- The exact acceptance condition remains `abs(a-b) <= tolerance * max(a,b)`. Its bucket width is now `-ln(1-tolerance)`, so every accepted positive-value pair is within the same or an adjacent bucket. The former `ln(1+tolerance)` width could miss eligible boundary pairs, including 144.77 / 146.23 at 1%. The exact acceptance condition still rejects out-of-range pairs.
- Missing title similarity contributes zero title credit. Previously PostgreSQL's `least(1, NULL)` returned 1, incorrectly granting the full 0.30 title component when the SEAP title was absent. No replacement title is invented. Match-score reporting uses inclusive bounds of the stored `real` type, including 0.90 exactly.

Invalid tolerances are rejected before opening a transaction: `0 < valueTol < 1` and finite positive `dateTolDays`. Amount-kind/currency/provenance restrictions, entity identity, CPV/date/title guards, consortium pair deduplication and deterministic best-per-lot primary selection otherwise remain unchanged. A single SEAP contract can still correspond to several distinct TED lot results; the crosswalk is not forced into a global one-to-one mapping.

The reconciliation integration fixture invokes the real builder against unique schemas inside a rollback. It verifies exact and boundary-tolerance matches, source exclusions, CPV/title guards, consortium deduplication, deterministic primary selection, missing-title scores, repeated invocation, and restoration of both crosswalk rows and identity sequence after an injected late failure. It never changes shared core records or sequences.

## Regression evidence

`test/fixtures/ted-298320-2026.xml` is a reduced authentic example from notice 298320-2026. It retains LOT-0023, its three tender references, original amount fields and settled-contract references; contact data is omitted. Its comment records the original raw XML hash. The three tender values are 4,785,076,670; 4,789,619,555; and 4,808,930,250 RON. The parser keeps all three plus the separately published range/ceiling; its scalar award value is null. The underlying source's repeated large amounts are not independently corrected or divided by the number of lots.

Validation commands:

```sh
pnpm --filter ingestion exec vitest run test/normalize-ted.test.ts test/ted-replay.test.ts
pnpm --filter ingestion exec vitest run test/ted-competition.integration.test.ts test/ted-country.integration.test.ts src/normalize/reconcile.integration.test.ts
pnpm --filter web exec vitest run lib/ted.test.ts
pnpm --filter ingestion typecheck
pnpm --filter web typecheck
```

The competition integration tests execute VALUES-based SELECT queries inside PostgreSQL read-only transactions; they write no fixtures or production records. They cover missing/contradictory counts, currency/kind restrictions, ambiguous mapping and the inclusive score boundary. The parser/display suite covers multi-reference cardinality, ranges, ceilings, legacy values, exact decimal precision, zero, mixed currencies and shared references.

Primary source definitions: [TED competition/results schema](https://docs.ted.europa.eu/eforms/latest/schema/competition-results.html), [BT-720 Tender Value](https://docs.ted.europa.eu/eforms/latest/reference/business-terms/BT-720.html). These distinguish tender values and framework maxima from executed payments.
