# 7 October: failed normalization and contract pagination

The owner authorized repairing the production incident now. Scheduled run `a089c12c-592d-4700-8749-77f24dcd17ee` started 05:00 RO, failed 05:32 during normalization, and correctly retained maintenance. Backup completed and was verified before normalization. A separate source block had begun at 02:46 for task 190888, request 51915.

## Confirmed causes and permanent safeguards

- Four award-contract envelopes (raw IDs 17438578, 17545919, 17556115, 17556311) attempted to enrich old SICAP winner profiles with valid CUIs already owned by canonical profiles. MEDI SENSE: typo `3324092`, canonical `33240921`, old entity 2276078 → 2071542. Wigstein: typo `273906673`, canonical `27390673`, old 2276333 → 2084714. Source SICAP keys and normalized names corroborate the two reviewed repairs; no fuzzy merge. The resolver now uses an exact existing valid CUI for the incoming record instead of assigning it to a placeholder. It does not silently move historical edges or overwrite valid conflicting identities. Reviewed redirects also apply during future invalid-CUI/foreign-key resolution.
- `GetCANoticeContracts`, notice 100646288, returned 201 rows for take 200. Two explicit, ledger-recorded maintenance probes (requests 51980, 51981, one healthy fixed proxy, 70-second spacing reservation, no retries/direct fallback) checked offsets 200 and 400. Page sizes 201/201/185, total 585; 587 returned rows reconcile to 585 distinct IDs. Two overlaps have complementary empty winner/lot fields. This is not simply an extra framework row on every page.
- Contract pagination retains offsets in steps of 200, permits at most one extra row, rejects within-page duplicates, retains stable totals, fills only empty winner/lot fields on cross-page overlap, and rejects conflicting facts. The combined envelope is archived only when distinct IDs exactly reconcile to total. Other endpoints retain strict pagination checks. No dropped records or silent skipping.
- Processing failures now write sanitized technical diagnostics to the private server log; public error wording stays generic.

## Validation

Nineteen targeted tests passed: 9 planner units, 3 entity-resolution PostgreSQL tests, 7 recovery-runner PostgreSQL tests. TypeScript and full Turbo (20 tasks) passed. Source traffic from these tests: zero.

[Targeted production-copy rehearsal](copy-validation.json): copied the affected public entities, source relationships, contracts, TED lots and dependencies into `seap_test_incident_copy_20261007`. Reviewed alias repair moves 36 SEAP winner associations and 88 TED winner associations; old profiles and frozen evidence remain. Four formerly quarantined envelopes replayed twice with stable counts, zero old references. This is a targeted stage rehearsal, not a full database/pipeline rehearsal.

[Actual-response pagination rehearsal](pagination-validation.json): all three captured pages successfully reconcile and produce one envelope containing exactly 585 contracts. Private snapshots and source payloads stay outside Git, under `/tmp/seap-recovery-20261007` locally and `/srv/seap/repairs/recovery-20261007` on the server.

## Recovery procedure and status

Pending deployment/application. Dated scripts under `scripts/operations/20261007-recovery` are incident procedures, never scheduled or onboarding commands. `run-recovery.sh` pins the deployed SHA, holds the deployment lock, verifies the original full backup checksum, requires the passed copy proof, stops drained workers, applies reviewed aliases and replays four source envelopes. Original quarantine rows, failed run and HTTP attempts are retained; resolution is audited. The three captured contract pages are archived offline without extra source requests, and only that exact source block is cleared.

A new manual **full** publication is required once because historical supplier identities, TED associations and existing signal references change. The ordinary daily/weekly schedule is unchanged. The new run freezes the current raw boundary, recomputes statistics and risk, validates the complete snapshot and search, then reopens only under the normal revision/checkpoint guard. Any error retains maintenance. Proxy settings and six disabled endpoints are unchanged.
