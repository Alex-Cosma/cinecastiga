# Managed SEAP proxy pool — 2026-10-06

**Current production containment, 2026-10-06:** proxy-7 disabled after13/13SEAPtimeouts; nine healthy proxies remain active,40–60seconds/IP, global15requests/minute; required mode and internal worker network active. Runtime `3c67bba`; migration0056 applied (57total), independent proxy retries deployed. See the activation verification below. Earlier disabled/local notes are historical.

**Published and verified in production on 2026-10-06:** runtime `e041f4f`, [CI and deploy successful](https://github.com/Alex-Cosma/seap-new/actions/runs/37452332438). The code and migration are deployed; the managed proxy pool and network overlay remain **inactive**. Historical local implementation notes follow. Builds on [the bounded document pilot](document-proxy-pilot.md). This implementation made **zero additional SEAP/provider requests**. Never repeat that completed document pilot as a smoke test.

## What changes

The existing PostgreSQL request coordinator still allows one HTTP request in flight, including reading its complete response. In proxy mode it also selects an enabled fixed endpoint, persists its random next-allowed time, and enforces a shared ceiling by spacing starts at least `60 / requests_per_minute` seconds apart. Both restrictions must pass. Settings start disabled, with a staged 50–70-second/IP interval and three requests/minute ceiling; **existing direct-connection timings are preserved**. Successful registration never enables traffic.

The collector uses an authenticated Undici ProxyAgent. Documents reserve an endpoint before opening the browser; notice navigation, list pages, POST authorization and GET remain in the same browser/session/proxy. Closing the browser releases the reservation before OCR. Other collector requests skip reserved endpoints. A terminal document job's abandoned reservation is cleared under the coordinator lock; a running job's reservation is not stolen.

Global manual/stream pauses, daily budget, Romania 02:59–03:30 quiet window, maintenance, orphan-request handling and timeout retries remain in the same gate. File GET starts remain at least 60 seconds apart across all IPs; one document job/OCR runs at a time. A 403/429/challenge stops the whole pool, not just the endpoint; there is no rotate-and-replay behavior. Collector timeouts retain the existing five/ten-minute schedule. Document requests are not retried automatically.

`app.collection_proxy_control` stores mode/limits; `app.collection_proxies` stores fixed public endpoint metadata, pacing, reservations and last error. Credentials exist only in a mounted private JSON file. Duplicate endpoint IPs are rejected, even with different IDs/ports, preventing multiple budgets for one configured IP. Registry IDs cannot be reassigned to a different endpoint. Provider endpoint IPs are assumed fixed, as in this Webshare list; only the first proxy's actual exit was verified in the previous pilot. This is not a rotating-gateway integration.

## Admin operation

`/admin/conexiune` → tab **Conexiune SEAP** shows observed requests/minute over the last ten minutes (including pauses), configured global cap, per-IP interval and endpoint statistics for the Romanian calendar day. Bytes are measured response bodies, not provider billing. The table includes disabled, waiting, available, document-reserved and error states, and pages at ten rows. Mobile shows all metrics within each row, without horizontal page scrolling.

Open **Configurează conexiunea și ritmul** to stage mode, interval, cap (1–15/minute) and endpoint choices. Pause collection first; an HTTP request/document already running must finish. Applying settings leaves collection paused, preserves existing waits and source blocks, increments the common revision and writes the audit. Another admin's edit creates a conflict. Offline status disables commands. Source refusal recovery still uses the existing explicit acknowledgement.

Journal rows, request downloads and journal exports include `proxy_id`; old rows without one read “Direct / istoric”, not a retroactive proxy claim. Recovery estimates use the proxy pool's nominal capacity as their upper bound but remain limited by observed historical progress, so switching rates does not immediately produce a measured faster ETA.

## Configuration and production rollout procedure

Pool JSON is the same strict format used by the local document pilot (`id`, fixed IP `server`, `username`, `password`). Private local pool: `apps/web/seap-proxies-pool.local`, ignored and mode0600. Do not copy credentials into docs, DB, screenshots, Git or chat.

Worker environment:

- `SEAP_PROXY_FILE`: absolute mounted pool JSON.
- `SEAP_PROXY_REQUIRED=true`: fail closed if pool is disabled, missing or invalid. No direct fallback.
- `SEAP_PROXY_RELAY_HOST=proxy-egress`: optional network isolation transport described below.
- Legacy `DOCUMENTS_PROXY_FILE`/`DOCUMENTS_PROXY_REQUIRED` remain for the old bounded standalone pilot only; do not configure them alongside the managed pool in production.

Migration0054 is additive, starts the pool disabled, preserves collection control/operator settings and registers **no credentials or endpoints**. Application grants already cover the new tables. After deploying the release, while collection is paused and current requests/documents have drained, install the private file with permissions readable by container UID1000. Build the new collector and document images before enabling the pool; do not activate it with old workers still running.

Recommended production protection uses `infra/prod/docker-compose.proxy.yml` (Compose>=2.24.4). Persist `COMPOSE_FILE=docker-compose.yml:docker-compose.proxy.yml` and `SEAP_PROXY_HOST_FILE=/absolute/private/pool.json` in the production Compose environment. This is a separate operator rollout, not something this code task activated. Validate `docker compose config --quiet` without printing the resolved config/secrets.

The overlay attaches collection/documents **only** to an internal Docker network. Postgres is attached to that network too. A separate unprivileged `proxy-egress` container is connected to internal + default networks and exposes one fixed TCP forwarder per configured proxy (`18000 + numeric proxy ID`), with no host-published ports. It forwards only to preconfigured endpoints, not arbitrary destinations. Workers perform the original HTTP proxy authentication through that relay. First installation requires attaching/recreating Postgres in the extra network, so coordinate a brief maintenance window and drain affected connections. Subsequent deploys preserve the overlay and start/recreate the relay before workers; the nightly scheduler's Compose calls also read the persisted overlay. This isolates these two workers; it is not a machine-wide firewall for unrelated host processes.

With the release and overlay installed, while paused:

```sh
# Owner credentials come from the existing Compose environment, not command history.
docker compose --profile collection run --rm --no-deps --entrypoint node collection scripts/proxies/register.mjs
```

Registration writes only endpoint metadata. Inspect all services and DB connectivity, then choose one endpoint in admin and enable proxy mode. With the network overlay the Direct option is unavailable. Keep a conservative initial cap of 1/minute; pause/review afterward. Only increase to the agreed staged three-proxy/3-min and five-proxy/4-min profiles after inspecting refusals, transport failures and observed progress. Extra active IPs alone never override the global ceiling. Source responses from collector APIs through the production pool are **not yet tested**.

If a proxy fails, the transport does not retry through production's IP. Keep the protected network in place, pause, inspect and fix the configured endpoint. Do not remove isolation to obtain an automatic fallback. Disabling the pool while `SEAP_PROXY_REQUIRED=true` cannot enable direct traffic.

## Contract association repair

Previously `contractNotice()` joined `core.awards.raw_id` and `core.notices.raw_id` back to raw source payloads to compare `procedureId`. Raw rows for the affected contract were absent in local **and production** snapshots.

Future tender/award normalization now persists the exact valid `procedure_id` and source title directly in core. Migration0054 backfills only existing SEAP source objects whose natural notice ID matches the core row. Raw retention no longer removes that imported identity. Links still require the same authority and exactly one compatible notice; ambiguous or missing evidence produces no link, never a title guess.

For contract107063311, the archived official GetGeneralInfo response explicitly links SCN1168231/cNotice100231768 to SCNA1128762/caNotice100594775. [Public evidence](previews/notice-award-association-20261006.json) includes the response, full SHA256, timestamp and archived notice identity provenance. Migration inserts the verified source link only where both notice numbers and authority CUI4233874 match. `core.notice_award_sources` retains source proof independently of raw retention and derived-table resets; it intentionally uses stable natural IDs without cascading foreign keys. Resolution still joins live core entities and validates authority.

Local full-data validation: `/api/contracte/107063311/files` returned200, the correct SCN link, nine files and the already-downloaded `HC-127-2025.pdf`. No file was downloaded again. Backfill recovered procedure identity for17,251/192,572 local notices and2,236/312,836 local awards; missing historic raw identities are not invented or declared repaired generally.

## Verification

- Migration/history/grants completed first on isolated `seap_test_references_guards`, then on local `seap`; existing history preserved. Local pool remains disabled and collection paused.
- Ten isolated PostgreSQL pool tests: shared/per-IP persistence, file minimum, document pinning, other-IP admission, abandoned reservations, refusals/challenges, missing configuration/no direct fallback, paused revisioned audited settings, all-reserved waiting.
- Contract association test: missing raw, unique identity, conflicting matches and wrong-authority rejection; real parser replay test persists notice and award identity.
- Existing collection/document integration: sixteen checks, including real45-second timeout, serialization, private evidence, source blocks and file delay.
- Twenty-three document/config/budget unit tests; four real Chromium loopback proxy tests (cookie session, auth failure, outage and redirects); three actual Undici loopback tests (authenticated tunnel, no fallback after407, no redirect follow).
- `scripts/proxies/test-isolation.mjs`: Docker worker can reach synthetic source via relay, cannot reach it directly on the other network; no source/provider requests.
- Real admin API/browser fixture: save persisted cap, unauthenticated403, foreign-origin403, no JS errors, desktop1440/mobile390 with no page overflow. [review artifacts](previews/proxy-pool-admin-20261006/design-documentation.md) include synthetic captures; [finish review](previews/proxy-pool-admin-20261006/finish-review.md) scope is UI only.

Transport reference: [Undici ProxyAgent](https://undici.nodejs.org/#/docs/api/ProxyAgent). Tests use loopback/synthetic sources; neither production throughput nor all ten real proxies are asserted verified.


### Admin navigation refinement — 2026-10-06

Proxy controls now live at `/admin/conexiune`, immediately after Colectare. Each of the seven admin tabs has a16px outlined decorative icon beside its persistent label. The connection panel remains mounted within the common layout, preserving its draft and pagination across navigation; a specific unsaved-draft message links back to the correct tab. Configuration starts expanded on the dedicated page. Collection pacing links to the new tab; the paused-only instruction links back to collection controls. The standalone panel removes the former embedded top divider/spacing.

Validated local browser navigation, seven icon sizes, active route, panel absence on Colectare, draft preservation, and desktop1440/mobile390 with no page overflow or JS errors. Masked proxy IPs in ignored captures under `.impeccable/review/proxy-tabs/`; no collection settings submitted and zero source requests. TypeScript passed. No deployment.


## Production publication verified — 2026-10-06

Authorized commit, push and deploy completed. `e041f4f` is on `main` and `feat/document-proxy-pilot`; production checkout and new web/document/collection containers use this release. CI/deploy run37452332438 succeeded. Local full Turbo pipeline passed all20tasks (including production build/typecheck/lint); web386unit tests passed,165opt-in checks skipped in that run; ingestion188 and DB8 passed, plus21 host deployment/scheduler tests. Earlier isolated DB/browser checks are recorded above.

Verified after deploy:
- Web healthy; public `/api/health`200. `/admin/conexiune` correctly redirects anonymous visitors to login; admin API rejects anonymous access403. New-table read grant tested as `seap_web`.
- 55migrations;0054 SHA256 `c7bbf46f073f782576a24feff673f355d88e698e73c9b3ee48c1a74609638e16`, exact repository match.
- Contract107063311 files API200, correct SCN1168231 /100231768. Archived notice-award proof present with exact expected source hash. Production currently has **zero inventoried files for this notice**; the nine-file inventory and downloaded pilot PDF are local evidence, not production downloads. No source request was triggered for this verification.
- Collector and documents restarted normally; fresh collector200responses13983/13984 and current document/scheduler heartbeats. No maintenance, manual pause or blocked reason.
- Direct interval remains30–45seconds; daily05:00RO and Sunday risk schedule preserved. Proxy control disabled, zero production endpoints registered. No private proxy credentials transferred and no overlay/network activation. Follow the separate rollout procedure above before using proxies in production.

Earlier “local/not deployed” statements describe historical validation stages. Unrelated older dirty audit/identity/handover material was preserved locally and excluded from this release.


## Production activation and extended ceiling — 2026-10-06

Owner explicitly authorized installing the credentials and using two proxies. The private ten-endpoint pool was installed under `/srv/seap/secrets/seap-proxies.json` (0600); previous Compose environment backed up privately. Overlay persisted in Compose `.env`, Postgres attached to both networks, workers only to the internal network, relay started, required mode enabled for workers/web. Direct TCP Internet access from the collector was confirmed unavailable. Both initial exits matched their configured IPs; after the owner requested all ten, the other eight were verified too (ten IP-diagnostic HTTP requests total, none to SEAP).

Two-proxy mode was started at 2/minute with50–70s/IP, six initial SEAP requests13990–13995 all200 (three per IP), and the website reopened. Changes are recorded in the admin audit with explicit operator identities. Collection continues on those two while the higher-ceiling release is prepared. No PDF download was triggered.

Latest owner instruction supersedes the staged plan: **all ten enabled,40–60s/IP,15/minute shared ceiling**. Migration0055 extends only the cap constraint from10 to15; backend validation and both UI limits match. Existing settings are not changed by migration. Eleven isolated PostgreSQL tests passed, including API+DB upper-bound validation and the scheduler's4-second global admission wait while retaining40–60s/IP. File GET minimum60s, global serialization, source refusal stops and timeout retries remain unchanged. Apply the requested operator settings only after this release is deployed and verified; the pool is currently still two active endpoints.


### Admin audit rendering incident during activation

The initial operator SQL wrote a flat `proxies` audit snapshot, while the client expected `after.proxies.enabled`; this threw in the browser and blocked the admin page. Not a permission change or database timeout. The affected production entry was repaired by adding the expected nested fields while preserving the originals, with a separate `proxy-audit-format-repair` audit entry. The all-ten activation script now writes the correct nested shape. The renderer accepts both historical shapes and falls back to a neutral description for incomplete entries; eight regression cases cover the crash. Credentials and source data were unaffected.


## All-ten activation verified — 2026-10-06, 11:10 UTC

The owner explicitly increased the target to all ten endpoints,40–60seconds per IP, and15requests/minute globally. Release `e8f6564` (cap/API/UI/migration0055) passed CI+deploy [37453820732](https://github.com/Alex-Cosma/seap-new/actions/runs/37453820732); `1056540` (resilient admin audit renderer) passed CI+deploy [37454139232](https://github.com/Alex-Cosma/seap-new/actions/runs/37454139232). Runtime1056540 and the new renderer string in served static assets were verified. Web healthy; PostgreSQL56migrations. Local seap and isolated test DB also have0055.

Production settings verified: enabled=true, requests_per_minute=15, min_seconds=40, max_seconds=60,10enabled registry rows. Source workers remain isolated with required proxy mode; no direct fallback. All ten exit addresses were verified using ten total non-SEAP IP-diagnostic requests. The ordinary direct interval30–45s is retained but inactive. Existing fileGET60s minimum, single document worker, daily05:00RO/Sunday risk schedule and02:59–03:30quiet window remain unchanged. Changes preserve existing waits and are audited as `ops:proxy-all-20261006`. No new site maintenance was needed for the rate change.

Source observation: baseline13989 before initial two-proxy activation; baseline14007 before all-ten activation. Through request14013 there were24SEAP attempts total:23successes/200 and one45-second timeout on proxy-7 (DA task6836). No403/429 response, no overlapping requests; observed minimum global start gap4.022seconds in the all-ten phase. The source did not return headers on the timed-out call, so this does not identify whether the delay arose at the proxy or SEAP. No extra source probes or PDFs were requested.

**Pending automatic retry, not manually forced:** request14013, task6836, first timeout, retry_at2026-10-06T11:14:08.671481Z (14:14:08Romania). paused=false, maintenance=false, blocked_reason=null; normal durable timeout policy holds collection until retry. The live observation stopped on this failure; it did not establish two successful rounds across all ten IPs. Do not claim every proxy has already succeeded against SEAP or manually bypass the delay. Further success/failure must be read from the ledger. Ten proxies are left enabled as requested.

Private server operation scripts/logs and pre-overlay environment backup are under `/srv/seap/secrets/`; never commit credentials. The old two-proxy activation script is an executed historical operation, not a rerunnable deployment command. The admin audit entry was repaired without deleting its original fields, and the correction has its own audit entry; malformed nested proxy-entry count now zero.


## Independent proxy failures — 2026-10-06

The owner requested that a failed proxy stop holding healthy proxies idle. Live diagnosis: proxy-7 had13requests, all45secondstimeout before response headers, noHTTPstatus; the other nine had126successes and zero failures at inspection. The first12tasks later succeeded through other endpoints; task90933/request14128 was pending when inspected, then recovered normally. The IP-echo checks only established exit identity/connectivity, not SEAP reachability. No assertion is made about whether the proxy route or SEAP silently dropped the connection. Proxy-7 was explicitly disabled, preserving diagnostics and retry deadline, with an `ops:proxy-failure-20261006` audit entry. Following that exclusion33consecutive successful requests were observed with no new failures.

Implementation (publication verification follows separately):
- Only a retry originating on a direct connection keeps the previous global hold. A proxy retry holds its exact task until its own5/10minute deadline; unrelated queries and documents can use healthy endpoints. Due retries retain request identity validation and priority; paused streams do not block other scoped retries. Multiple pending tasks are supported; migration0056 removes the old singleton pending-retry index.
- Transport timeouts, recognized socket failures and HTTP407/408/500/502/503/504 failures cool only their selected endpoint for5minutes, then10minutes. Third consecutive endpoint failure disables that endpoint and creates an audit record. Failures are counted across tasks; a success on another endpoint cannot clear them. A successful request on that endpoint clears the counter. Explicit admin re-enabling clears the counter/error while retaining existing cooldowns. Migration0056 adds `consecutive_failures`.
- A task exhausting its own three attempts becomes a visible failed task; healthy work continues. Invalid data, unexpected errors, lost ownership/DB lock, source403/429/challenges and orphaned requests retain global safeguards. There is still one source HTTP request in flight; other work proceeds once a failing request ends, including after its45seconddeadline. No immediate replay, direct fallback or ban bypass.
- Document sessions are still pinned to one endpoint and not automatically replayed. A document transport failure affects its job/endpoint, not unrelated collection. FileGETminimum60seconds unchanged.
- Admin live status distinguishes per-task pending retries from a global hold, links to Conexiune SEAP, and shows endpoint cooldowns/automatic disablement. Proxy configuration revision changes on automatic disablement to invalidate stale drafts.

Validation:15isolated PostgreSQL retry tests, including legacy direct behavior, two pending retries plus a document request, restart continuity, healthy work during cooldown, independent endpoint/task exhaustion, known transport/503 cases and global403protection. Existing admin/document DB checks pass sequentially;28total including a final isolated document-transport test and explicit re-enable/cooldown validation (initial combined parallel execution collided on their shared fixture tables; rerun with `--no-file-parallelism`). All fixture writes were confined to `seap_test_proxy_pool`; zero real source probes were added by implementation tests.


### Independent-failure release verified in production

Commit `3c67bba` is on main and running in production; [CI/deploy37464862632](https://github.com/Alex-Cosma/seap-new/actions/runs/37464862632) succeeded. Full local Turbo20tasks passed (web394unit tests,166opt-in skipped in the broad run); isolated DB15retry +28admin/document checks passed separately. Migration0056 applied with history/grants preserved:57total on production, local seap and isolated test database.

Collection was briefly paused before schema migration to drain old prepared proxy-table reads; public site stayed open. Resume required the unchanged operator revision53, producing revision54, after verifying the replacement collector contains the new retry/circuit code. Proxy-7 remains manually disabled with its explanatory last_error; its new counter starts0 because past outcomes are preserved, not rewritten into the new counter. Nine endpoints active,40–60s/IP,15/min ceiling; no maintenance or source block. All13affected tasks are now resolved.

[Verification snapshot](previews/proxy-failure-isolation-20261006.json):93successful requests and zero failures after exclusion, including the first five completed requests from the new worker14217–14221;14222was still in flight at snapshot time. Web/public health200, fresh containers, and new-column read access confirmed as seap_web. No intentional production failure or extra source test was triggered: independent cooldown/exhaustion behavior is verified by isolated tests, while live verification confirms normal work continues. No polling process remains.

## Measured collection pace — 2026-10-06

Admin reporting now distinguishes measured aggregate traffic from configured capacity. `/admin` shows total requests/minute, enabled endpoint count/inventory, per-IP delay and total ceiling. In proxy mode, inactive direct delay fields and their misleading single-IP estimate are removed from view; direct mode retains them. `/admin/conexiune` shows each endpoint's measured requests/minute and ten-minute count before configuration; today's attempts, failures and response bytes remain separate.

One grouped query over `collection_requests.started_at` supplies both the global total and endpoint rates, including failures/running attempts and recently disabled endpoints. No midnight reset for rates; Romania midnight still governs daily totals. Recent direct-mode traffic is identified in the total's explanation. Stale state suppresses measured rates. The disclosed settings estimate is `min(global ceiling, enabled count × 120 / (min seconds + max seconds))`, assuming enabled endpoints are available. It is not a measured throughput or service guarantee. No scheduler, live setting or migration changes.

[Design and verification evidence](previews/collection-pace-20261006/review.md): 13 isolated PostgreSQL proxy tests, TypeScript, production build, 24 browser checks. Local fixture makes zero source requests and is separate from real data. Read-only live snapshot before publication: nine enabled of ten,40–60s/IP,15/min ceiling,revision54,105attempts in ten minutes (10.5/min),11–12 per working endpoint. Proxy-7 remains disabled. Publication status follows after deployment verification.
