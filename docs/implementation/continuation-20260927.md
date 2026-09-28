# Continuation after compact — 27 September 2026

This is the current operational handoff. Read this and the top of `HANDOFF.md` before older notes. Earlier “pending”, “active”, “not deployed” and permission questions are historical unless repeated here.

## Verified release and production state

Latest application release: **e5f7ec7**, committed and pushed to `main`, deployed successfully. GitHub Actions run **36342127739** passed both CI and deployment. Server checkout and running collector/document images were verified; this is not merely a successful push.

At **21:56:29 Europe/Bucharest, 27 September 2026**, a fresh read-only production check found:

- Control revision **12**; `paused=false`, `maintenance=false`, `blocked_reason=NULL`.
- Shared random delay **50–70 seconds**. One source request at a time; file GETs retain at least 60 seconds between starts.
- Processing enabled at **05:00 daily**, risk weekday **0 / Sunday**.
- Requests **824 (direct acquisitions), 825 (participation), 826 (awards)** all HTTP 200 / success. These were ordinary collection, not test traffic.
- `app.collection_retries` has **zero rows**: the new automatic retry policy has not yet encountered a genuine production timeout.
- Migration **0038** applied; **39** migration-history rows. The web role can read the new table.
- Last release verification: public site and `/api/health` HTTP 200, anonymous admin API HTTP 403; web container healthy.

This is a timestamped snapshot, not a promise that the same state persists. Re-read status before making any operational change.

## User decisions now implemented

### Source collection and daily quiet window

Resume all three SEAP data flows, with catalogue support, covering gaps rather than trusting old watermarks. Recovery starts at **1 July 2026 for direct acquisitions**, **1 January 2026 for participation/awards**, with deduplication. No automatic PDF crawl. Source pacing is a common budget for data and requested documents, not separate budgets per worker.

Every day, refuse new SEAP request admission from **02:59 inclusive to 03:30 exclusive, Europe/Bucharest**. This includes notice pages, metadata, document POST/GET and all collector streams. It is enforced in the shared database-clock gate, not a cron that toggles the manual pause flag. Already admitted responses can finish under the existing 45-second deadline; running OCR can finish. Saved PDFs/site access stay available.

At 03:30 workers may resume automatically, subject to all independent pauses, errors, maintenance, daily budget and pacing. No manual/source block is cleared by expiry. DST policy is conservative: autumn waits through both occurrences of 03:00 until the later 03:30; spring's nonexistent 03:30 resolves to 04:30 local. See `seap-quiet-window.md`.

### New bounded timeout retries

For a **confirmed 45-second transport deadline on a recovery data task**:

1. Record the failed attempt, wait **5 minutes from failure**, retry the exact query.
2. On a second timeout, wait **another 10 minutes from that failure**, retry once more.
3. On a third timeout, **stop for operator review**. Three total attempts, not three retries.

A successful response only resolves retry state when task validation, archiving and checkpoint writes commit. Any non-timeout failure during a retry stops automatic recovery. Known unsuccessful HTTP responses (including 403/429, even if their body subsequently times out), challenges, malformed data, connection errors without the shared deadline, cancellation and lost database sessions are not automatically replayed.

Scope: collector recovery tasks for direct acquisitions, tender/award lists/details/contracts, and catalogue. **Browser document-session timeouts still require manual review**. Document traffic waits behind a pending collector retry; it does not bypass the cooldown.

`app.collection_retries` persists task identity, first/last failed request IDs, timeout count, next due time and `pending/resolved/stopped` status. A partial unique index permits only one globally pending retry. The task is requeued atomically with its deadline. Restart during the waiting period does not reset the budget; interruption during active work still fails closed. Existing pre-release failures are not retrospectively requeued.

The gate checks matching task ID, endpoint, method and sanitized query parameters. Other source traffic waits until the exact retry is processed. Manual/stream pauses, maintenance, source blocks, daily limits and the nightly quiet window all take precedence. If the due time falls within 02:59–03:30, wait until 03:30 without consuming another attempt.

Admin shows scheduled retry, attempt **2/3 or 3/3**, earliest Romanian time, countdown and 5/10-minute label. The document queue explains why it is waiting. All attempts and failure diagnostics remain in the ledger. See `seap-timeout-retries.md`.

### Nightly publication

At **05:00 Romanian time**, maintenance, drain active work, backup, normalize newly archived data, rebuild statistics/Radiografie and search, validate, reopen. **Sunday 05:00** also recalculates risk; other days preserve its provenance/date. Failure keeps the site in maintenance until verified recovery. Do not silently reopen partial results.

Next scheduled daily run after this snapshot: **28 September 2026, 05:00**. Next full risk run: **4 October 2026, 05:00**. The source quiet window and publication maintenance are independent.

## Morning inspection — read first, do not restart repairs

No real overnight quiet-window observation or new-policy production timeout has yet been verified. No new overnight task or external notification was scheduled by the assistant. The application services/cron execute the existing schedule.

Inspect `/admin` and production state:

1. No source admissions between 02:59 and 03:30; a pre-window request may finish during it.
2. First subsequent source request succeeds, or the independent reason for continued waiting is explained.
3. Retry records show the correct 5/10-minute deadlines and bounded attempt count if a timeout occurred; compare the ledger and task outcome.
4. Document jobs remain queued during waits; originals already downloaded remain available.
5. After 05:00, inspect processing stage/heartbeat, stage durations, validation result, publication/search freshness, risk date and maintenance state. A daily run must not claim freshly recalculated risk.

Useful bounded, read-only SQL, using `docker exec cinecastiga-postgres-1 psql -X -U seap -d seap` over SSH:

```sql
select revision, paused, maintenance, blocked_reason, min_seconds, max_seconds,
       processing_enabled, processing_time, risk_weekday
from app.collection_control where id=1;

select id, stream, status, outcome,
       started_at at time zone 'Europe/Bucharest' started_ro,
       finished_at-started_at duration, error
from app.collection_requests order by id desc limit 20;

-- First overnight window after the release. Change date for later mornings.
select id, stream, outcome, started_at, finished_at
from app.collection_requests
where started_at >= (timestamp '2026-09-28 02:59' at time zone 'Europe/Bucharest')
  and started_at <  (timestamp '2026-09-28 03:30' at time zone 'Europe/Bucharest');

select r.task_id, r.first_request_id, r.last_request_id, r.timeouts,
       r.status, r.retry_at at time zone 'Europe/Bucharest' retry_ro,
       t.status task_status
from app.collection_retries r
join app.collection_tasks t on t.id=r.task_id
order by r.updated_at desc limit 20;

select id, scope, status, stage, started_at, heartbeat_at, completed_at, error
from app.processing_runs order by started_at desc limit 3;
```

Avoid dumping `collection_tasks.result` or full response bodies: these may contain huge real records. Select totals/archive counts or bounded diagnostic fields. Never expose `.env`, cookies, keys or authentication secrets.

## Production access and deployment

- Workspace: `~/Desktop/Personal/code/seap`; branch `main`.
- SSH: `ssh -o BatchMode=yes cinecastiga`, using the existing local key.
- Server checkout: `/srv/seap/src`; compose directory `/srv/seap/src/infra/prod`.
- Containers: `cinecastiga-collection-1`, `cinecastiga-documents-1`, `cinecastiga-web-1`, `cinecastiga-postgres-1`, `cinecastiga-meilisearch-1`, `cinecastiga-caddy-1`.
- PostgreSQL database/owner: `seap`; web role: `seap_web`.
- Pushes to `main` trigger CI then deployment. Avoid duplicating this with an overlapping manual deploy. Deployment and publication share a lock.
- Public Actions status can be read through GitHub REST for `Alex-Cosma/seap-new`; `gh` is not installed. Use curl for production HTTP checks; a prior Python urllib edge 403 was misleading.
- Minute cron runs `/bin/bash /srv/seap/src/infra/prod/process-nightly.sh`, logging to `/srv/seap/backups/processing-scheduler.log`.
- Existing 03:15 backup cron and Monday 04:30 Cloudflare-IP refresh are unrelated to the SEAP pause; preserve them.
- Nightly Docker command helper redirects stdin with `</dev/null`; do not regress this fix (Compose previously consumed an SSH script's remaining input).

## Source map and verification

| Area | Main implementation |
| --- | --- |
| Shared request admission/ledger/deadline | `packages/db/src/collection.ts` |
| Durable retry scheduling and task-ID normalization | `packages/db/src/collection-retry.ts` |
| Romanian quiet-window policy | `packages/db/src/collection-quiet-window.ts` |
| Schema/migration | `packages/db/src/schema/collection.ts`, `packages/db/migrations/0038_massive_ben_grimm.sql` and generated metadata |
| Task selection, validation/archive, retry resolution | `apps/ingestion/src/collection/runner.ts` |
| Actual source transport, hidden retries disabled | `apps/ingestion/src/scrape/elicitatie/client.ts` |
| Document worker and source browser | `apps/web/lib/documents/worker.ts`, `seap.ts` |
| Admin snapshot and UI | `apps/web/lib/admin/collection.ts`, `apps/web/app/admin/CollectionDashboard.tsx`, `DocumentQueue.tsx`, `ProcessingOverview.tsx` |
| Publication runner | `infra/prod/process-nightly.sh`, `docs/implementation/scheduled-processing.md` |

Latest validation passed: **8 timeout integration, 19 quiet-window integration, 14 control integration, 5 recovery integration, 3 actual-client wire integration, 239 web unit, 93 ingestion unit, 11 host-runner tests**, typechecks and production web build. The control suite includes a real 45-second deadline. New retry tests shorten only the test timer and assert real database 300/600-second deadlines; no source HTTP is used.

Eleven browser checks passed for timeout admin status; nine passed for the earlier quiet-window UI. Scripts are `apps/web/scripts/admin/check-timeout-retry.mjs` and `check-quiet-window.mjs`. Captures, verification, SHIP finish reviews and design documentation are under `docs/implementation/previews/timeout-retry/` and `quiet-window/`. These are synthetic fixtures, not evidence of a genuine overnight event. Canonical `DESIGN.md` and `.impeccable/design.json` are unchanged.

Tests which reset a fixture database must run sequentially against that database. Build `@seap/db` before cross-package tests, since consumers import its `dist`. Only use dedicated `seap_test_*` databases; do not truncate ordinary local or production data.

## Local environment and cleanup

- Ordinary dev server on port **3113** was left untouched; verify it is still running before assuming availability.
- Temporary preview **3115** was stopped; fixture databases `seap_test_quiet_window`, `seap_test_quiet_retry`, `seap_test_timeout_retry`, `seap_test_admin_queue` were removed.
- Local main database also has migration0038, applied with `DATABASE_URL=postgres://seap:seap_dev@localhost:5432/seap pnpm --filter @seap/db db:migrate`.
- The production migration wrapper refused locally before writes because local `seap_web` is absent. This is expected local/prod role separation; do not create/reset roles merely to run the production wrapper locally.
- Local PostgreSQL container is `seap-postgres-1`. No local continuous crawler was started for these tests.
- `.next-processing` is an ignored temporary production build. Next's automatic additions for that directory were removed from tracked `tsconfig.json`.
- UI skill review/documentation agents have completed; no pending agent work remains for these changes.
- The latest compact handoff is documentation-only. Check `git status` for these saved Markdown edits; do not assume they are a newly deployed application release.

## Completed repairs — do not repeat

- TED history repair completed on production at **19:18:19 Romanian time, 27 September**: all **161,633** notices normalized, all ten snapshot checks passed. Full calculation **1h47m49s**; maintenance **2h50m31s**. Search verified **194,519** entities. Evidence `/srv/seap/backups/ted-repair-20260927/live-validation.json` and `live-ready`.
- Daily-only rehearsal on an isolated repaired clone passed all ten checks in **41m15.247s**, excluding backup/search/risk fingerprint overhead. Risk counts/fingerprints/provenance remained unchanged. Evidence `/srv/seap/backups/daily-rehearsal-20260927/daily-validation.json`. This is a benchmark, not a nightly completion SLA.
- PostgreSQL prepared-query fault on task36017 was repaired by stable control projections; guarded recovery was already applied. Request779 succeeded, task complete. **Do not rerun `resume-schema-block-20260927.sql`.**
- Request801 timed out at21:19:42 on GetCANoticeContracts, task42952. The user explicitly authorized one retry after quiet-window deployment. The guarded script was applied once: request802 succeeded HTTP200 in3.943seconds,68 contracts returned,1 archived response,0 duplicates. Original evidence remains in the ledger/audit. **Do not rerun `retry-timeout-801-20260927.sql`.** This happened before the automatic retry release.
- **Do not restart `finish-processing-release-20260927.py`** or earlier TED/live coordinators. Their work was completed; old pending sections and failed-continuation status are historical.
- Admin journal/file lists already paginate at most10 rows. Historic journal pages freeze their snapshot while polling; latest-page/filter actions reset appropriately.
- Password recovery was completed earlier. Its local secret artifact must never be read into chat, copied into Markdown or committed. No credential values are needed to continue operational checks.

Relevant release chain: `e458690` pagination/stable queries → `e6fd8bc` evidence → `bb225ea` quiet window → `9ebf102` authorized one-off retry evidence → **`e5f7ec7` bounded automatic retries**.

## User expectations and next action

The user is compacting context now, not requesting another repair or another forced source test. Current authorized work is complete. Preserve the deployed decisions and inspect real overnight behavior when asked. Continue in Romanian. Keep admin UX clear, transparency/source evidence accessible, and collection conservative. Ask only for genuinely missing decisions; do not re-request already granted authorizations.
