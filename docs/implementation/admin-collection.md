# Administration of SEAP collection

Implemented from the approved `mockups/admin` preview. `/admin` is the authenticated administrator dashboard; existing account management is at `/admin/conturi`. No production deployment or SEAP request was made during implementation.

## Available now

- Real status refreshed every five seconds, server-clock countdown, worker heartbeat, global and per-stream pause.
- Persisted minimum/maximum random spacing, optional daily attempt cap and processing time. Explicit Apply; revision checks prevent concurrent administrators overwriting each other. Changes and actor names are audited.
- Separate counts for today's HTTP attempts, received list entries, newly archived raw responses, and queued/running documents. Received entries may repeat; they are not a deduplicated contract count. Reporting starts at migration installation. Historical cursor dates are not asserted as complete.
- Sanitized request ledger with stream/error filters, details and JSON export (latest 5,000 attempts; table latest 100). No headers, cookies, source session tokens or temporary file identifiers are logged.
- Backend authorization, same-origin mutation checks, stale-status command protection, source-block acknowledgement and enforced Retry-After.
- Responsive light/dark layout. Unknown recovery totals remain explicitly unknown.

## Source request enforcement

Migration `0034_workable_obadiah_stane.sql` adds `app.collection_control`, `collection_requests`, `collection_audit`, and `collection_workers`. Singleton defaults: **paused**, 50–70 seconds, no daily cap, 05:00 Europe/Bucharest, maintenance off. Applied only to the local development database in this turn; production migrator handles it before a future deployment.

`runCollectionRequest` owns a session advisory lock on a reserved connection through receipt of the complete response. Both the ingestion client and explicit document-browser transport use it. The database retains the next admission timestamp across restarts; failed HTTP attempts count. Actual file GETs additionally retain a minimum 60-second gap. Delays are between attempt starts, with only one attempt in flight. A slower setting extends an existing wait where needed; a faster setting cannot shorten it.

403, 429 and detected source challenges block the shared queue. Transport failures and orphaned attempts also stop traffic for inspection; no transparent transport retry. A disconnected database session aborts transport. An orphan cannot be cleared while another process owns the request lock. Retry-After is enforced before manual acknowledgement can resume traffic. The document worker returns a suspended job to its queue. Existing one-document-at-a-time download/processing lock remains in place.

The old ingestion cron is now heartbeat-only. Starting an ingestion worker does not schedule nationwide historical crawling. Existing manually queued legacy jobs still use the shared gate, so inspect/drain that queue before resuming in production. The UI's Resume permits already scheduled work; it does not create a recovery inventory.

## Maintenance and boundaries

Public routes and APIs return 503 when the persistent maintenance flag is on; admin, login/auth and process health remain available with their normal authorization. Failed database reads fail closed. `/api/health` measures process health so planned maintenance does not cause an unhealthy-container restart loop.

**The daily recovery/publication runner is not implemented or scheduled by this change.** The processing time is persisted and clearly described as saved configuration. A future runner must drain collection, enable maintenance, back up, process a fixed batch, rebuild and validate the analytic/search snapshot, and reopen only after success. Nothing automatically clears maintenance on failure.

Recovery manifests, durable per-window/page/detail checkpoints, exact known request totals, the bounded source pilot, and supervised production activation remain follow-up work in `seap-production-resume-plan.md`. Do not resume old cursors blindly or claim that all data through July is complete. Approved starting windows remain DA July 1, 2026 and participation/awards January 1, 2026. Those labels express the agreed plan, not proof that a recovery job has run.

## Verification

- `pnpm turbo typecheck lint`: passed, 13 tasks.
- Default unit suite: 364 passed across web, ingestion, domain, scraper clients and DB policy.
- Isolated PostgreSQL: 11 collection cases, including serialization across sessions, failed-attempt budgets, pause/maintenance, stream controls, CAS/audit, Retry-After, orphan handling, file spacing and transport/challenge stops. Existing document integration also passed.
- Browser: 41 checks with admin/member/anonymous sessions in `seap_test_collection`, desktop/mobile/narrow/dark, controls, export, maintenance, offline reporting and no external calls. `apps/web/scripts/admin/check-collection.ts`; evidence in `previews/admin-collection-live`. Fixtures are synthetic and confined to the test DB.
- Final production build and all 20 project validation tasks passed. Four deployment-script regression tests passed. Browser checks were repeated against the final production build. Fresh finish review: **ship**; see `previews/admin-collection-live/finish-review.md`.
- Local preview: http://localhost:3113/admin, existing administrator login required. Isolated test server and database were removed; main local DB remains paused with zero new source attempts.

Manual check: sign in as an administrator, open `/admin`, edit an interval and Apply, refresh, inspect the audit entry, then check pause/resume and `/admin/conturi`. Do not enable the production queue until the source pilot and recovery plan are ready. Local preview contains actual local status; screenshots with counters are isolated-test fixtures.
