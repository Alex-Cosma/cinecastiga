# Population and manually selected comparison evidence

Implemented 20 September 2026; reverified 26 September 2026. No deployment or commit requested.

- Existing `peer-evidence-1` receipts retain their exact validated shape and call the isolated legacy activity implementation. Existing SHA-256 queue/capture bindings must remain valid; no population fields are inserted into old cohort/member objects.
- New `peer-evidence-2` receipts carry explicit `method`, a pinned `populationVersion` for population/manual methods, and ordered identity-bound `members` for manual selection (maximum 50, no duplicates or focal member). Whole comparison and individual member selection remain separate.
- The server recomputes cohort membership at the analytic checkpoint and pinned population catalog. Browser monetary values, names, population claims and arbitrary source scopes are discarded.
- Whole comparisons preserve the complete selected roster, including members without source records. Zero records mean unavailable recorded observations, not zero actual spending; these members do not contribute to medians.
- Frozen case and readable export retain population, official source URL/date/row/catalog, percentage difference, membership reason and observed-member denominator. Source rows retain original SEAP/TED links.

Implemented: frozen case summary and readable export distinguish population/manual/activity selection, show population and signed percentage differences, cite official source/date/row/catalog, preserve the complete roster and mark missing observations explicitly. The frozen context also retains original source SHA-256, printed in the readable export. Capture source reconciliation includes zero-row members with `hasRecordedData:false`.

Added three unit boundary scenarios and four PostgreSQL scenarios covering manual add/remove order, zero rows, missing population, population provenance/full roster, catalog drift, identity drift, forged scope and browser totals. Existing six v1 PostgreSQL cases verify legacy captures/recapture.

Final verification: **7 unit + 10 PostgreSQL evidence scenarios pass**, plus **13 existing PostgreSQL regressions** (6 connection evidence, 7 general captures, including the 100,000+ row copy). An initial backend SQL alias error was corrected by the backend owner; the full rerun passed. Final focused population-provenance assertion also verifies the source SHA-256 in frozen metadata and readable export. Manual receipts reject simultaneous county restrictions, matching the backend exact-roster contract.

26 September resume: inspected the current contracts and found the backend now requires an observed authority role before population matching. Updated the zero-source county fixture to include its SICAP authority role; this represents a registered authority with no observations in the selected scope. Recreated a schema-only disposable database and ran all four suites together with `--no-file-parallelism`: **30 tests passed (7 unit + 23 PostgreSQL)**. No production evidence-code changes were required. Database dropped again after verification.

Disposable database `seap_test_population_evidence` was created from a schema-only dump of `seap`; no source data, users or sessions copied. **Dropped after successful checks.** To repeat, recreate a schema-only database and run the evidence suites serially with `TEST_DATABASE_URL=postgres://seap:seap_dev@localhost:5432/seap_test_population_evidence pnpm --filter web exec vitest run --no-file-parallelism lib/peers-evidence.test.ts lib/peers-evidence.integration.test.ts`.

Evidence implementation complete. Root owns global typecheck/build, main UI/browser review, final handoff and any requested later publication. No new migrations or worker setup required.
