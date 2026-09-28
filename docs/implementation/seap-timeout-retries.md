# Bounded timeout retries

Approved 27 September2026: when a collection query times out, pause all source traffic for five minutes and retry that exact query. If it times out again, wait another ten minutes and make one final attempt. A third timeout stops collection until operator review. Waits start when the failed attempt finishes, not when it starts.

## Scope and durable state

Eligible timeouts are the shared transport's confirmed45-second deadline on a recovery task: direct acquisitions, tender/award lists and details, contracts, and catalogue. The task identity, endpoint, method and sanitized query parameters are checked against the failed ledger entry before admitting its retry. Known non-success HTTP status, 403/429, source challenge, malformed data, ordinary connection errors, explicit cancellation and lost DB session are not eligible. Browser document sessions are not replayed automatically; their errors keep the existing operator-review behavior.

Migration0038 adds only `app.collection_retries`, with one row per task and at most one globally pending retry. It stores first/last attempt IDs, timeout count, next retry date and pending/resolved/stopped status. Timeout recording requeues the task and writes its deadline atomically. This allows process/container restart during the waiting period without losing or resetting the budget. An interrupted active request/task still fails closed rather than being blindly replayed.

The central gate holds all other SEAP traffic while a retry is pending. The recovery worker gives that exact task priority when due; no other worker can spend the slot. A successful response resolves the retry only in the transaction committing validation/archive/checkpoint updates. Every attempt remains separately visible in the ordinary request ledger, with diagnostics and retry scheduling metadata. A non-timeout error on either retry stops automatic recovery immediately.

Admission also requires normal manual and per-stream permissions, no maintenance/error block, available daily budget, and the50–70second shared pacing. The02:59–03:30Romanian-time window still applies; an otherwise due retry waits until the window ends without spending an attempt. Files retain their minimum60-second gap. Expiry does not clear unrelated state, and no admin pause/resume command shortens a scheduled retry wait. The05:00publication and Sunday risk schedules remain unchanged; their work can finish before a due retry resumes.

## Admin behavior

The leading status band names the scheduled retry, shows attempt2/3 or3/3, its earliest Romanian resume time, and a countdown plus5/10minute policy label. Quiet-window/manual/error states keep precedence. The file queue explains the shared waiting period. An active retry is described as in progress; a successful committed task returns the dashboard to normal collection. Existing rules/decisions disclosures now describe bounded data-query retries and distinguish document timeouts.

## Validation and release

Real isolatedPostgreSQL tests use fake transport and shortened test-only deadline timers; production timeout remains45seconds. Checks cover5/10minute database deadlines, all3 ledger attempts, terminalstop, exact-task priority and query identity, successful resolution, restart duringwait, other-stream/file gating, manual/stream/maintenance/budget/error stops, non-timeoutfailure,403 and a403bodytimeout. The actual HTTP client propagates scheduled suspension without a hidden retry. Quiet-window regression covers a due retry deferred until03:30 without consuming its budget.

8timeout integration,19quiet-window integration,14existingcontrol integration (including the real45second deadline),5recovery integration and3wire integration tests passed, along with239web and93ingestion unit tests. Production web build and typechecks passed. Eleven isolatedbrowser checks passed; see `previews/timeout-retry/verification.json`. No test sent SEAPHTTP.

Deploy runs the additive migration before restarting updated services. Existing source blocks and old failed tasks are not retrospectively cleared or requeued. The first genuine production timeout after deployment is still an operational observation to make; tests do not establish SEAP availability.

## Deployment verified — 27 September 2026

Release **e5f7ec7** is on `main` and production; Actions **36342127739** passed CI and deployment. Migration0038 is applied (39 history entries). Both running source-worker images were checked for the retry policy, the web role can read the new table, public/health returned200 and anonymous admin returned403. At21:56:29Romanian time, controlrevision12 had no manual pause, maintenance or sourceblock; requests824–826 were successful, and the retry table was empty. Thus installation and normal collection are verified; a genuine production timeout under the new policy has not yet been observed.

The complete compact handoff and read-only morning checklist are in [continuation-20260927.md](continuation-20260927.md). Older “deployment pending” statements in review artifacts describe their pre-release evidence capture.
