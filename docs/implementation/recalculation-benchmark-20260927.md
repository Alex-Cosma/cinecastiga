# Recalculation benchmark — 27 September 2026

Status: finished at 09:53:17 Bucharest. Recalculation took **94m 29.510s**; validation failed only on the historical TED normalization baseline. No analytics were published. Collection resumed automatically at 09:53:18. All times below use Europe/Bucharest (UTC+3).

This is a one-off full recalculation on an isolated production database clone on the same server. It does not publish analytics, write to live core/marts, contact SEAP, or rebuild the live search index. The public site remains available on its previous analytics. Collection was paused for the measurement and has since resumed.

## Request recovery and collection boundary

Failed request 248 started at 03:00:20 and ended about 45 seconds later. Original exception/response details were not captured by the old code; maintenance at SEAP is a hypothesis, not an established cause. The authorized retry, request 377, succeeded with HTTP 200 and 34 records. The original ledger entry remains intact and links to the retry through an explicitly reconstructed historical observation.

Collection paused at exactly 08:00:00. Request 379 was the last admitted attempt: 378 successes and one historical failure. Workers drained/stopped by 08:02:30. The fixed raw boundary contains 7,294 records, maximum raw ID 17,315,367. No automatic 03:00 blackout was configured.

## Preparation (separate from recalculation)

| Operation | Duration |
| --- | ---: |
| Worker drain/stop | 2m 30s |
| Full production backup | 7m 26s |
| Restore into isolated database | 8m 32s |
| Refresh planner statistics on restored database | 10.589s |
| Prepare current threshold seed in clone only | 0.008s |

Backup: `/srv/seap/backups/pre-recalculation-20260927.dump`. It was restored successfully into `seap_benchmark_20260927`; this verifies this archive's restorability, not an end-to-end live application rollback procedure.

## Recalculation

Started at 08:18:47.563. Stage timings are measured with a monotonic clock and persisted after each stage.

| Stage | Duration | Result |
| --- | ---: | --- |
| Incremental normalization | 40.215s | 7,294 raw records processed; zero quarantined |
| SEAP/TED reconciliation | 11.743s | Zero links; legacy TED metadata prevents valid matching |
| TED reporting table | 2m 18.887s | 4,032,082 award rows |
| General reporting tables | 3m 22.042s | Completed, including 1,103,236 contract transactions |
| Risk signals | 64m 32.910s | 2,412,043 signals across the full historical population |
| Risk reporting tables | 12m 54.736s | 79,039 stored signal samples; 19,582,943 direct-acquisition transactions |
| Radiografie | 9m 34.048s | Completed |
| Coverage | 22.290s | Completed |
| Validation | 32.639s | Nine checks passed; TED normalization failed (161,633 pending) |

## Publication limitations

Preflight found all 161,633 existing TED notices missing their normalization version, and the corresponding historical raw TED archive absent from production. Current reconciliation therefore produces no links. Historical direct-acquisition threshold eras also differ from the repository seed; the benchmark prepares current eras **only in the clone**. A verified live publication requires resolving this baseline first. Never substitute this clone's output for the live application data.

Reconciliation timings are not representative of a repaired TED baseline. Full search indexing is excluded. Backup and clone preparation are not included in calculation time; a future nightly pipeline must also account for its own backup, validation, indexing, cache and publication steps.

Machine-readable results: `/srv/seap/backups/benchmark-20260927/benchmark.json`; stage log: `/srv/seap/backups/benchmark-20260927-run.log`. The running script predates the final nonzero exit-code fix for `validation_failed`: the JSON status and individual checks, rather than shell exit success, determine validity.

## One-off completion handler

`finish-benchmark-20260927.sh` completed successfully. It waited for a final report and for the isolated benchmark container to exit. It recorded `completion.json` alongside the report, then started the prepared collector/document services and atomically resumed the shared dispatcher after confirming production still has the exact operator boundary: revision6, audit6, request379, paused, maintenance off, no block, no running requests/tasks, and unchanged50–70second settings. An administrator change prevents automatic resume. The resume receives its own audit entry; the first subsequent ordinary completed request is captured in `first-resumed-request.json`, without an extra SEAP probe.

A clone validation failure is recorded and never published. It can still be followed by resuming collection into the untouched live raw archive, because live analytics were never rebuilt by this test. A missing final report or handler failure leaves collection paused. This handler is a dated one-off process, not a daily scheduler. Its shell syntax and SQL plan were checked; completion.json confirms resumption, followed by ordinary request380 with HTTP200 and diagnostics. The public analytics remained unchanged.

At08:56 the risk stage remained active, chiefly the `da_round` rule. A separate read-only10,000-row diagnostic took695ms; EXPLAIN-only analysis showed a serial hash join for the insertion query. These diagnostics and a brief application deployment shared the server during the run, so the result is an operational wall-time measurement, not an idle-host microbenchmark.

The completion handler also holds the deployment lock while starting services and resuming the dispatcher, avoiding a race with an automatic release.

## Follow-up

The original TED raw archive was found locally and recovery is being tested on the same isolated clone. See [TED recovery](ted-production-recovery-20260927.md). The agreed daily statistics/Radiografie and weekly risk split is future processing policy, not an activated scheduler.
