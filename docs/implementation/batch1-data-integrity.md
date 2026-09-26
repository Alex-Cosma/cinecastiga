# Batch 1: trustworthy totals, signals and source coverage

This batch implements the six data-integrity foundations from the investigative workflow review. It preserves the approved interface, the thirteen question types and the route from a result to its source records.

## Resulting behavior

1. **One ordinary value population.** Entity profiles, partner totals, discovery, maps and ordinary value questions use accepted positive direct purchases up to the 2,000,000 RON plausibility ceiling, plus the canonical procedure-contract allocation table. Notice values and TED publications are not added as extra expenditure. Entity contract headlines count distinct source contracts; query/source tables explicitly count contract–supplier allocation rows. Consortium allocations retain the source total exactly, with the rounding remainder assigned deterministically to the last supplier. Shares smaller than one cent retain extra precision so an identified winner is not silently dropped by a zero allocation. Missing titles no longer accidentally exclude ordinary contracts from notices containing call-offs.
2. **Evidence-based competition.** A single-offer signal requires a recorded TED count on an eligible confirmed contract–lot association. Missing, ambiguous and contradictory counts remain unknown. Equal price extrema do not establish a bidder count. The signal records the affected contracts and TED lot IDs, rather than implying every lot in the notice had one offer.
3. **Historical thresholds.** Annual and rolling-window rules share the same effective-date/type definitions: 26 May 2016, 4 June 2018, and 10 September 2022. Works use their own thresholds. Declared purchase type takes priority; CPV and finalization-date fallbacks are disclosed. Unsupported types, missing dates and dates before the defined eras are excluded from threshold comparisons. Exact source membership is retained for annual splitting signals.
4. **TED amount provenance.** All tender references and currencies are preserved. An offer/result value, range, framework ceiling and missing amount have different meanings. Multiple tenders are not silently summed. See [TED repair](./ted-repair.md) for parser definitions, replay and source documentation.
5. **Complete, scoped Semnale.** County and role apply to findings, counts and rankings. Pagination reads the full triggered `core.flags` population rather than the 500-example display sample. An award with several winners remains one occurrence. Entity tables use deterministic ordering, cancel stale requests and preserve a loading frame.
6. **Observed coverage.** The methodology page reports available records, included analytic records, missing fields, observed dates and year distribution. Collection completion and processing timestamps are separate from procurement dates and inventory calculation time. None is represented as proof of complete source coverage or live collection. The footer links to these observations instead of hard-coded coverage dates.

The financial and relationship rules also use canonical contract allocations when comparing procedure values. Their labels describe recorded contract values, not payments or a firm's actual receipts. Core flags and Radiografie each refresh within a transaction; dependent tables still require a coordinated release.

## Evidence behavior

The new `/semnale/[id]` source page reads exact recorded membership for annual splitting (`da_split`) and single-offer contracts (`award_single_bid`). Other signal types do not yet have equivalent recorded-membership pages. For annual splitting, it does not substitute every purchase by the same authority/supplier in that year. It shows the recorded total and a fresh decimal sum, and warns when they do not reconcile. Missing current records retain their original SEAP IDs and links. Contract sources retain the recorded contract–lot pair even if the current crosswalk changes.

Signal source reads use a read-only repeatable-read transaction. These are current-calculation links, not immutable archived case files: flags receive new IDs when rebuilt. Immutable investigation snapshots remain a later batch.

The DA exclusion switch exposes accepted records with null/nonpositive values or values above the plausibility ceiling. That analytical ceiling is distinct from a legal procurement threshold and does not, by itself, prove a source error or illegality.

## Coordinated refresh

The web deploy currently does not run database migrations or ingestion jobs. Publish this code together with the refreshed data; do not treat a web-only push as a completed repair.

Use a staging/local database with the archived raw TED documents. The production snapshot may not contain `raw.raw_documents`; replay must run where those documents exist. Preserve application/authentication data when moving a refreshed procurement snapshot. This batch does not automate a production restore.

From the repository root, in order:

```sh
pnpm install --frozen-lockfile
pnpm --filter @seap/db build
pnpm --filter @seap/domain build
pnpm --filter @seap/db db:migrate
pnpm --filter ingestion seed-thresholds
pnpm --filter ingestion replay-ted --limit 100000
pnpm --filter ingestion replay-ted --apply --limit 100000 --concurrency 4
```

Repeat the last command until it selects zero notices. A notice commits its source updates and parser version atomically. Interrupted work resumes from notices with a missing or older normalization version; no raw/core reset is needed. Then:

```sh
pnpm --filter ingestion reconcile
pnpm --filter ingestion ted-mart
pnpm --filter ingestion marts
pnpm --filter ingestion flags
pnpm --filter ingestion index-search
```

The flags command refreshes core flags, flag read models, Radiografie and the coverage inventory in that order. `pnpm --filter ingestion coverage` can recalculate observations independently. Reconciliation and each dependent rebuild have distinct transaction boundaries, so keep the staging data unavailable for publication until all stages and checks succeed. Pause source normalization and replay writers throughout the final rebuilds, verification and snapshot promotion so these separately committed tables describe the same source state.

Start the web process against the completed refresh with an empty Next data cache. Domain aggregates otherwise remain cached for up to one hour and coverage observations for five minutes. For a local rebuild, stop the web process, move its generated `apps/web/.next/cache/fetch-cache` directory into a temporary backup, then restart it. A production release must likewise invalidate cached data or use a fresh cache.

Migrations 0026 and 0027 are additive. Migration 0026 deliberately excludes existing manual auth/app/index drift detected in the prior Drizzle snapshot. Neither migration resets accounts, investigations, saved evidence or raw documents.

## Four archived DA restorations

A legacy correction-scraper test had archived its three-field mock response against four genuine DA IDs: `120379639`, `120617973`, `120618371` and `122557878`. Their headers have been restored through the existing DA-detail parser from earlier complete archived responses. The repair checked pinned raw IDs and SHA-256 hashes, the exact mock signature, and agreement between the earlier list and detail responses. All four genuine responses record state 8, “Oferta neacceptata in termen”; restoring them does not add accepted purchases to ordinary spending totals.

The four mock documents remain in the archive, classified as `test-fixture` with endpoint `test-fixture:da-detail:v1` so an endpoint-based replay cannot apply them again. The [repair audit](./previews/da-test-fixture-repair.json) preserves their original metadata and payloads, corroborating source hashes, and the before/after headers. The bounded [repair script](../../apps/ingestion/src/scripts/repair-da-test-fixtures.ts) defaults to validation only, applies all four changes atomically with `--apply`, and verifies an already-applied repair without rewriting the audit. Its applied state and subsequent idempotent validation were checked locally.

The legacy DA integration suite now requires an explicit `TEST_DATABASE_URL` whose database name begins with `seap_test_`, verifies that its archive, ingestion watermarks and scrape-run history are empty, and rejects mock requests for IDs outside its fixtures. It no longer falls back to the shared database or performs broad archive/history cleanup. Its six cases passed in a separately created and migrated disposable database, which was then dropped; twelve unit checks cover the database guard and repair signatures.

## Validation

The regression suite includes real PostgreSQL queries against isolated rollback fixtures and read-only VALUES fixtures. It checks exact contract allocation and totals, omitted/unknown counterparties, framework eligibility, legal-date/type boundaries, inconsistent competition evidence, TED reference cardinality and amount precision, Semnale scope/paging, source membership and asynchronous table request ordering.

Routine checks:

```sh
pnpm turbo build
pnpm turbo typecheck lint
pnpm turbo test
pnpm --filter ingestion exec vitest run src/normalize/marts.integration.test.ts
pnpm --filter ingestion exec vitest run src/normalize/coverage.integration.test.ts
pnpm --filter ingestion exec vitest run src/flags/thresholds.integration.test.ts test/ted-competition.integration.test.ts
pnpm --filter ingestion exec vitest run src/normalize/reconcile.integration.test.ts
SEAP_READONLY_TESTS=1 pnpm --filter web exec vitest run lib/signal-sources.test.ts
```

Run the build before the type checks: Next regenerates `.next/types`, so a concurrent build can remove those files while TypeScript is reading them.

Database integration fixtures create uniquely named schemas inside a rolled-back transaction; they do not replace shared procurement tables. Run them outside an active derived-table rebuild: even `CREATE TABLE AS … WITH NO DATA` needs metadata read locks and can wait behind ETL table changes. An initial concurrent run timed out on those locks; both marts fixtures passed when rerun without the conflicting rebuild. These fixtures also retain the concentration expectations after the HHI window-query optimization. The dedicated DA scraper suite described above is separate and must use its own disposable database.

After the coordinated refresh, run the read-only verifier:

```sh
pnpm --filter ingestion exec tsx src/scripts/verify-batch1.ts --full-profiles --all-annual
```

It reports exact allocation and aggregate reconciliation, profile populations, methodology versions, stored source references and annual source membership. Without these two options, profile and annual checks are explicitly identified deterministic samples; the other checks always cover their complete populations. Exit status 1 indicates failed or incomplete verification. Passing proves internal consistency of this snapshot, not source completeness or legal compliance.

## Local acceptance — 19 September 2026

The coordinated local refresh completed, including all 161,633 TED notices, 19,582,214 direct-purchase table rows, 1,098,371 contract–supplier allocations and the search index of 194,500 entities. The coverage inventory was calculated at 16:11 UTC; this is a processing timestamp, not a claim of newly collected procurement records.

The [full read-only verification](./previews/batch1/data-verification.jsonl) passed all nine checks. It considered all 1,133,208 source contracts, reconciled all 196,135 entity/role profiles and all 17,807 annual splitting signals, and checked methodology versions across 2,417,827 flags. There were zero missing eligible contracts, allocation mismatches, profile mismatches or annual source-list mismatches. Every allocated winner retained a positive share, including sub-cent allocations.

The [API/export check](./previews/batch1/api-checks.json) passed all seventeen assertions. For MUNICIPIUL BUZAU, its 694 source/allocation rows and complete CSV sum exactly to **1,553,407,378.67 RON**: 493 direct purchases plus 201 supplier allocations from 155 distinct procedure contracts. Counts, exact sums, exported source links and first/second/last-page membership agree. The headline statistic is a JSON number and was compared at displayed-cent precision; source API and CSV totals were compared as exact decimals.

The [Semnale browser check](./previews/batch1/signals-browser-checks.json) passed 55 assertions across five views, including rows 501–550 beyond the former sample cap, county filtering by selected role, retained filters during navigation and award winner lists. [Interaction checks](./previews/batch1/interaction-checks.json) cover stable loading rows, protection from stale responses and both exact source-page types. [Page captures](./previews/batch1/browser-checks.json) cover desktop/mobile layouts; the [TED country-review check](./previews/batch1/ted-country-browser-checks.json) verifies the 66 explicitly marked records and their source links.

Source amounts use Romanian thousands separators without converting the stored decimal to a JavaScript number or rounding away precision. The coverage card distinguishes the contract's own unfilled CPV field from the award notice's CPV used in searches and domain grouping.

Build, type checks, lint, regression tests and the selected PostgreSQL fixtures passed. Browser checks reported no uncaught exceptions or document-width overflow. Source URL structure and availability within the application were checked locally; the remote SEAP documents were not fetched from this device. These checks establish internal consistency of the refreshed snapshot, not completeness of SEAP coverage or proof of illegality.

This work is implemented and verified locally. It has not been pushed or deployed; production still requires the coordinated code/data release described above.
