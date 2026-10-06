# Managed SEAP proxy pool — 2026-10-06

**Published and verified in production on 2026-10-06:** runtime `e041f4f`, [CI and deploy successful](https://github.com/Alex-Cosma/seap-new/actions/runs/37452332438). The code and migration are deployed; the managed proxy pool and network overlay remain **inactive**. Historical local implementation notes follow. Builds on [the bounded document pilot](document-proxy-pilot.md). This implementation made **zero additional SEAP/provider requests**. Never repeat that completed document pilot as a smoke test.

## What changes

The existing PostgreSQL request coordinator still allows one HTTP request in flight, including reading its complete response. In proxy mode it also selects an enabled fixed endpoint, persists its random next-allowed time, and enforces a shared ceiling by spacing starts at least `60 / requests_per_minute` seconds apart. Both restrictions must pass. Settings start disabled, with a staged 50–70-second/IP interval and three requests/minute ceiling; **existing direct-connection timings are preserved**. Successful registration never enables traffic.

The collector uses an authenticated Undici ProxyAgent. Documents reserve an endpoint before opening the browser; notice navigation, list pages, POST authorization and GET remain in the same browser/session/proxy. Closing the browser releases the reservation before OCR. Other collector requests skip reserved endpoints. A terminal document job's abandoned reservation is cleared under the coordinator lock; a running job's reservation is not stolen.

Global manual/stream pauses, daily budget, Romania 02:59–03:30 quiet window, maintenance, orphan-request handling and timeout retries remain in the same gate. File GET starts remain at least 60 seconds apart across all IPs; one document job/OCR runs at a time. A 403/429/challenge stops the whole pool, not just the endpoint; there is no rotate-and-replay behavior. Collector timeouts retain the existing five/ten-minute schedule. Document requests are not retried automatically.

`app.collection_proxy_control` stores mode/limits; `app.collection_proxies` stores fixed public endpoint metadata, pacing, reservations and last error. Credentials exist only in a mounted private JSON file. Duplicate endpoint IPs are rejected, even with different IDs/ports, preventing multiple budgets for one configured IP. Registry IDs cannot be reassigned to a different endpoint. Provider endpoint IPs are assumed fixed, as in this Webshare list; only the first proxy's actual exit was verified in the previous pilot. This is not a rotating-gateway integration.

## Admin operation

`/admin/conexiune` → tab **Conexiune SEAP** shows observed requests/minute over the last ten minutes (including pauses), configured global cap, per-IP interval and endpoint statistics for the Romanian calendar day. Bytes are measured response bodies, not provider billing. The table includes disabled, waiting, available, document-reserved and error states, and pages at ten rows. Mobile shows all metrics within each row, without horizontal page scrolling.

Open **Configurează conexiunea și ritmul** to stage mode, interval, cap (1–10/minute) and endpoint choices. Pause collection first; an HTTP request/document already running must finish. Applying settings leaves collection paused, preserves existing waits and source blocks, increments the common revision and writes the audit. Another admin's edit creates a conflict. Offline status disables commands. Source refusal recovery still uses the existing explicit acknowledgement.

Journal rows, request downloads and journal exports include `proxy_id`; old rows without one read “Direct / istoric”, not a retroactive proxy claim. Recovery estimates use the proxy pool's nominal capacity as their upper bound but remain limited by observed historical progress, so switching rates does not immediately produce a measured faster ETA.

## Configuration and production rollout (not yet executed)

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
