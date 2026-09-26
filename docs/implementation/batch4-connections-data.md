# Procurement connections: data contract and verification

Implemented locally on 19 September 2026. This is the bounded Batch 4 procurement-relationship explorer; ownership records and peer comparisons are outside this slice. No new external data was collected and no procurement data was changed.

## Public data endpoint

`GET /api/connections` accepts `entityId`, `role=authority|supplier`, `dataset=all|da|contracts`, optional inclusive `yearFrom`/`yearTo`, `search`, and one-based `page`. Optional `identity` binds the focal entity to its previous identity receipt; `checkpointId` binds all reads to the same validated analytic publication.

`excludeEntityId` excludes the return edge while expanding a selected partner. `partnerId` restricts the result to an exact counterpart and is used when restoring a copied path. Restoration does not depend on a name/CUI substring search or the first 20 partners. These filters also apply to summary totals and pagination.

The endpoint returns the focal entity, applied filters, complete filtered totals, 20 partners per page, the excluded unresolved-identity or self-identity source count/value, and checkpoint metadata. The order is exact monetary value descending, then entity ID ascending. Every pair includes a stat/value AskSpec for the same authority, supplier, source channels and years. `ConnectionPartner` and `ConnectionsResponse` aliases are exported in `connections-shared.ts`.

## Meaning and precision

- Direct acquisitions: eligible mart rows with positive value no greater than 2,000,000 RON, matching the existing Ask value query. This is a plausibility filter, not a legal threshold.
- Procedure contracts: positive supplier allocations from `marts.contract_transactions`. A consortium's full contract value is not repeated for each winner.
- The channels are disjoint. TED is not added as a third monetary stream.
- Monetary values stay decimal strings from PostgreSQL `numeric`; they never pass through JavaScript floating-point arithmetic.
- DA rows, contract supplier rows and distinct contracts have separate counts. Totals describe recorded values, not payments.
- Date bounds use the recorded finalization date. Without bounds, undated rows remain included and counted; bounded years exclude undated records.
- Eligible rows with an unresolved counterpart identity or the same entity identity at both ends are reported separately and excluded from mapped partner totals. `excluded.selfRows` identifies the latter subset. The display never invents a partner or treats an identity anomaly as a valid relationship.
- Identity receipts bind the internal ID to the strongest available identifier: valid CUI, foreign identity, sorted SEAP identifiers, then conservative normalized-name/location fallback. A changed identity fails closed rather than silently reusing an old internal ID.

All endpoint queries share a repeatable-read snapshot inside the existing analytic refresh gate. A running or failed latest publication blocks the read; a requested older checkpoint yields an explicit restart error. The publication validation date is not a claim about collection freshness.

## Verification

Focused tests passed: **4 unit tests and 8 isolated PostgreSQL cases**.

The PostgreSQL cases cover exact multiwinner allocations and distinct counts; expansion in both roles with the return edge excluded; complete totals across deterministic pagination; exact counterpart restoration beyond page one; self-identity anomaly exclusion and disclosure; channel/year/accent-insensitive literal name/CUI filtering; reconciliation of displayed pairs against the existing complete `runRows` source compiler; and stale identities, missing parties, checkpoint drift, active writer locks and failed publications.

The fixture distinguishes three supplier allocations of `0.0033`, `0.0033` and `0.0034` from one contract worth `0.01`. Values above the DA plausibility cap, zero and negative values are excluded. An unresolved-counterparty value of `7.25` and a self-identity anomaly of `6.75` are explicitly reported separately (two rows, `14` RON). The eligible mapped total is exactly `126.0131`.

Read-only real-data check: Buzău, entity `2144364`, returned in **123 ms** locally. It reported **215 partners**, **493 direct acquisitions**, **201 supplier allocations across 155 distinct contracts**, and exactly **1,553,407,378.67 RON**. This reconciles with the previously verified Batch 3 baseline; unresolved counterpart rows were zero. This is one local observation, not a performance guarantee.

Commands:

```sh
TEST_DATABASE_URL=postgres://seap:seap_dev@localhost:5432/seap_test_batch4_connections_data pnpm --filter web test lib/connections.test.ts lib/connections.integration.test.ts
```

Write tests require a dedicated `seap_test_*` database and refuse the main database. Fixture tables were created from the local schema only; test data is fictional and removed by teardown. The disposable database was dropped after verification. Full application build and browser verification are recorded separately by the main implementation workflow.
