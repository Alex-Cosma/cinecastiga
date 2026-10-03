# Contract currency integrity — 3 October 2026

Initial validation: implemented on `fix/contract-currency-integrity`, verified offline on `seap_test_currency_20261003`. The owner subsequently authorized deployment and a single repair in the 4 October maintenance window. See [one-time scheduling](#one-time-scheduling--4-october-2026). Existing unrelated working-tree changes are preserved.

## Problem and policy

The award-contract loader stored `defaultCurrencyContractValue` in `contract_value` while retaining the original currency. For a source reporting 100 EUR / 500 RON / rate 5, the old row looked like 500 EUR. Foreign rows were then excluded from RON statistics. The archival audit confirmed 392 such conversions in the available source documents.

We retain the old columns as forensic legacy values. Additive fields preserve `original_value`, `original_currency`, `value_ron`, `currency_rate`, `amount_status`, `amount_raw_id` and `amount_evidence`. Consumers use shared SQL helpers from `@seap/db`; they must not sum the old `contract_value` blindly.

- RON: original value is the RON amount; a reported equivalent, when present, must agree within 0.01 RON.
- Foreign: require original amount, explicit original currency, reported RON equivalent and positive source rate. Their product must agree within 0.01 RON. Never infer currency or fetch a contemporary exchange rate.
- Missing, malformed or contradictory values remain inspectable, with no RON equivalent in calculations. Zero is distinct from missing; ordinary statistical eligibility still excludes zero/negative/over-bound values.
- Legacy explicit RON retains its declared value, labelled separately as not rechecked against the archive. Legacy foreign/missing currency has no verified original amount or RON equivalent; do not label a converted legacy number as EUR.
- Changing a row's raw pointer without monetary normalization marks it stale and removes its effective RON amount until verified again.

Decimal comparisons use decimal strings and BigInt, not floating-point multiplication. Precision already lost upstream when a JSON source is parsed as a JavaScript number cannot be recovered; the archived payload remains authoritative.

## Prevention and publication

Migrations `0047_next_radioactive_man` and `0048_fine_ben_grimm` are additive and retain the previous 47 migration records. A database CHECK rejects incoherent new monetary records, including verified foreign conversions without a rate. It cannot alone certify the source: a second guard compares every verified row against the corresponding archived contract, requiring exactly one match and agreement on original amount, currency, rate, reported equivalent and parent notice.

The `money-quality` stage runs after normalization and before reconciliation/marts on **both daily and full weekly refreshes**. Structural errors, stale source pointers or source disagreements stop publication. Final snapshot validation checks it again. Existing maintenance/failure behavior remains in force. Unresolved source amounts are excluded and reported, rather than invented or silently included. Checkpoint methodology records `contractMoney: source-currency-1`.

The cached report in `marts.contract_money_quality` is written before a guard failure; admin polling reads this single row rather than scanning the database. `/admin` → processing contains a collapsed **Valori și monede** panel, counts, new-source issues since the previous inventory and at most ten linked examples. Missing initial report is explicit. Contract details separate original currency and verified RON equivalent. Newly captured evidence uses these fields; existing frozen captures are not rewritten.

## Isolated simulation

A schema-only copy plus public monetary inputs was created locally. It includes entities, CPVs, awards, contracts, winners, the previous contract transaction mart, real migration history and archived award-contract responses. No account/session/investigation/queue rows. Only the two new migrations were applied there (49 total). The copy is a monetary test fixture, not a complete runnable product database.

`prepare-currency-simulation.py` streams from local `seap` using read-only source connections into an empty `seap_test_currency_*` destination, retains actual migration history and resets copied sequences. First create the destination and copy the matching schema with `pg_dump --schema-only`; use the same schema version on both sides before copying data. Source collection/processing must be paused while this multi-table fixture copy is taken. Partial-copy failure requires a fresh destination; it is not a production backup utility.

`scripts/operations/with-currency-db.mjs` requires a local host and test database prefix. It overrides only the database name from the local environment and never prints credentials. The replay refuses ordinary database names. No worker or source network client runs.

```sh
# Node 22 on PATH; fixture already prepared with matching historical schema/data.
node --env-file=apps/web/.env.local scripts/operations/with-currency-db.mjs seap_test_currency_20261003 node packages/db/scripts/deploy-migrate.mjs
node --env-file=apps/web/.env.local scripts/operations/with-currency-db.mjs seap_test_currency_20261003 node apps/ingestion/node_modules/tsx/dist/cli.mjs apps/ingestion/src/scripts/simulate-contract-money.ts docs/implementation/contract-currency/simulation
```

Replay touches only the new monetary columns of contract rows whose **current raw pointer, contract ID and parent notice** match the available archive. It does not clear/rebuild core, overwrite legacy values, regenerate risk or update search. Raw coverage is incomplete: never attempt a blanket core rebuild from it. Eligibility is compared with the original contract mart, at contract level, using existing framework/date/party/value-bound rules.

Results (repeated replay gave identical amounts):

| Measure | Before | After |
|---|---:|---:|
| Contracts eligible for contract statistics | 980,558 | 980,925 |
| Contract total, RON | 935,335,692,864.7400 | 936,141,296,594.43 |

- 25,209 source-matched contracts normalized: 24,682 RON; 392 verified foreign conversions; 24 inconsistent; 109 missing original value; 2 missing conversion.
- 373 contracts added to the statistical population; 6 removed; no amount change for contracts remaining eligible on both sides.
- Exact net delta: **+805,603,729.6900 RON**. This is a correction to contract statistics, not payments, losses or recovered money. Duplicate contracts are a separate unresolved audit finding and remain in both sides.
- Legacy outside this repair: 1,101,612 explicit RON; 17,126 with unverified units.
- Structural errors: 0; archived-source disagreements: 0.
- Removed source contract IDs: 108118387, 107148349, 107112485, 108110482, 107195585, 108110755. Exact deltas are in the linked artifacts.

Artifacts: [summary](simulation/summary.json), [527 nontrivial monetary records](simulation/changed-records.json), [379 statistical deltas](simulation/statistical-deltas.json). These contain public procurement evidence, no private user data. The dates and counts describe the copied snapshot, not current production.

## Verification

- 125 ingestion unit tests passed; 370 web unit tests passed, 10 skipped (database suites excluded from that unit run).
- Monetary integration: 2 passed on the isolated copy, including actual parser replay, constraint rejection, coherent-but-source-wrong amounts, stale source rejection and persisted failure report. About 14 seconds including repeated scans of the entire fixture.
- Marts integration: 4 passed, now exercising verified EUR conversion and unresolved-source exclusion in actual national/profile/allocation calculations. Reconciliation integration: 5 passed.
- DB build and ingestion/web typechecks passed. Mechanical UI detector: no findings.
- Admin component rendered with incumbent CSS at 1440/390 widths; keyboard expansion and ten-example limit checked. This is a component review, not an authenticated end-to-end admin test.

## Applying the repair later

The ordinary local database remains on 47 migrations and unchanged monetary data. This branch's new queries require migrations 0047/0048; do not run them against the old schema. The isolated copy is retained for review. No production rollout is implied by this validation.

A rollout needs backup/maintenance, both migrations, a separately scoped replay of currently matched archived rows, coordinated recalculation and validation, then search refresh and reopening. The simulation script intentionally refuses production/ordinary local database names; do not remove that guard to deploy it. Reuse the verified normalization in a bounded, journaled repair procedure. A migration alone does not backfill history or refresh marts. Include the full initial risk recalculation for the corrected population; afterwards retain the existing daily statistics / Sunday risk schedule. Existing frozen evidence is retained.

Open follow-ups: duplicate contracts across notice identities; ONRC date parsing; MF profit parsing; unavailable historical raw. None is declared solved by this patch.

## One-time scheduling — 4 October 2026

The owner authorized execution **once**, in the Sunday 4 October 2026 05:00 Europe/Bucharest full processing run. The existing daily/Sunday schedule and current collection settings are preserved. Additive migrations are installed with the release; history is rewritten only inside the scheduled maintenance, after the private backup. No SEAP requests are needed by the repair.

Migration `0049_past_shadowcat` adds `app.data_repairs` without scheduling anything. Explicit operator script `scripts/operations/schedule-contract-money-20261004.sql` registers `contract-money-v1` for that date, refusing an elapsed window, an existing processing attempt, a different schedule or an already applied/failed repair.

The host records `backup-verified` only after pg_dump, archive listing and SHA-256 succeed. Before the normal refresh, `runScheduledMoneyRepair` locks the ledger, requires paused collection, maintenance, a running **full** run, frozen raw boundary, exact scheduled day and completed backup. Historical replay and the `applied` marker commit **in the same transaction**; failures roll back monetary changes and persist `failed`. No automatic retry on another Sunday. A missed date fails closed for operator review rather than silently applying later.

`applied` means corrected core is awaiting publication; it does not mean success. `finishProcessing` changes it to `completed` in the same guarded transaction that verifies the latest checkpoint, search, control revision and reopens the site. Later runs skip completed repairs. An applied/failed repair left after interruption requires operator recovery; neither a deploy nor a retry resets its marker.

The production replay uses an indexed temporary target projection, bounded batches and current raw/contract/notice identities. On the existing isolated copy it processed 25,209 contracts in 32.057 seconds including the source guard, with **zero field differences** from the earlier simulation. Production may have more available sources; counts/deltas are not asserted equal to an older snapshot. Exact applied counts and quality are persisted in the ledger report, while processing stages/checkpoint preserve subsequent publication evidence. No core reset is used.

Additional verification: scheduling integration covers wrong day/scope, missing backup, duplicate source rollback, applied-state refusal and completed-state skip; host tests verify backup-before-refresh ordering and retained maintenance on failure. Full local `pnpm turbo typecheck lint test build`: 20 tasks passed (database suites remain separately gated). Additive migrations bring the isolated copy to 50 entries. The ordinary local DB remains at 47.

Morning inspection (read-only): inspect `app.data_repairs` for `contract-money-v1`, its `processing_run_id`, `report`, timestamps and error; then the referenced `app.processing_runs`, latest monitoring checkpoint, and `/api/health`. **Scheduled is not executed; applied is not completed.** Never delete/reset the ledger to hide an error. Preserve the matching `/srv/seap/backups/processing/<runId>/` backup and log.
