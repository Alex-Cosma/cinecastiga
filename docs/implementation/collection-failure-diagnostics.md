# Collection failure diagnostics and September 27 benchmark

The ledger now retains failure diagnostics in `app.collection_requests.diagnostics`: source request headers and body, task/batch identity, response status/headers/body, complete versus interrupted capture, received byte count and SHA-256, exception name/message/stack/cause chain, and a distinct 45-second deadline reason. Authentication headers, cookies, passwords, tokens, session identifiers and transient document URLs are redacted. Existing 32 MiB collector response bounds remain; a bounded partial capture is explicitly identified. Successful HTTP attempts retain metadata without response bodies; subsequent task validation/archive errors attach their diagnostic and available parsed response to the original attempt.

Nothing retries automatically. Source blocks and the common 50–70 second budget are unchanged. Previous generic failures cannot acquire missing original response headers or stack traces retroactively.

`GET /api/admin/collection?request=<id>` exports a single attempt and diagnostics, protected by the existing admin session check. Polling responses do not include response bodies. The Errors filter separately retrieves the last 100 failures, even when newer successes fill the main ledger. Ledger and audit ordering uses qualified numeric IDs, avoiding PostgreSQL sorting the displayed string alias lexicographically.

Validation: database diagnostic/redaction unit cases; real isolated ledger tests including a real45s timeout, HTTP503 bodies, partial HTTP200 responses and older failures; mock-wire integration cases with no source traffic; browser authorization/export/older-failure rendering/390px checks. Browser runner: `apps/web/scripts/admin/check-diagnostics.mjs`, requiring the dedicated `seap_test_diagnostics` DB and localhost3115.

## Authorized one-off operation, September 27

- Failed request248: March11,2026 participation notice page1, probable timeout at03:00Bucharest. Original failure retained.
- User authorized one retry: task64492 requeued with an audit entry. Request377 returned HTTP200 and all34remaining notices; task complete. No nightly03:00pause inferred from a single incident.
- At08:00:00Bucharest, collection was paused. Last request379. Containers drained/stopped by08:02:30; this is overhead, not recalculation time.
- Preflight found161,633TED notices with missing normalization versions and no historical raw TED archive on production, plus outdated threshold seed eras. Canonical publication would fail. User was informed that the measured recalculation uses an isolated full production clone on the same server. Live core/marts and public pages remain untouched.
- Full backup and restore are timed separately. Dedicated DB `seap_benchmark_20260927`; clone-only threshold preparation is separate from normalize/reconcile/TEDmart/marts/flags/flagmarts/radiografie/coverage/validation. Search indexing is not included in this initial benchmark.
- Scripts are dated, one-off operations, not a nightly scheduler. `benchmark-production-refresh.mjs` must be mounted into the ingestion image's `dist/scripts` directory and requires an explicit benchmark database name. Its JSON report is persisted outside the container.
- Server logs/reports: `/srv/seap/backups/recalculation-20260927-pause.log`, `benchmark-20260927-run.log`, `benchmark-20260927/benchmark.json`. Final stage durations and publication blockers must be reported after completion. Never describe a clone benchmark as a live publication.
