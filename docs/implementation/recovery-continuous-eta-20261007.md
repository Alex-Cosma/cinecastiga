# ETA and daily closed-window collection

The owner requested a useful ETA at the current pace and collection beyond the original 25 September boundary. They selected **through yesterday, updated automatically each day**, not provisional current-day data. This supersedes the fixed-horizon behavior described in the original recovery runbook. Existing private proxy credentials and failed endpoints are unrelated and are not re-enabled by this release.

## Daily scope

Migration 0061 adds nullable `seed_end_day` and opt-in `follow_latest` to the existing batch. The stable batch ID stays unchanged; it is a historical identifier, not the displayed coverage boundary. `end_day` becomes the latest seeded target. `seed_end_day` retains the original catalogue horizon, so a previously queued catalogue page cannot silently change its existing task identity. No old migrations or task parameters are rewritten.

`collection follow-latest` opts the existing single batch into continuous extension, with zero source requests. Every minute, the permanent worker's first lane checks for missing closed days. Before 03:30 Europe/Bucharest, the target remains D−2; from 03:30 it becomes D−1, after SEAP's overnight updates and the quiet window. The current day is excluded. The day calculation uses Romanian calendar time, including DST, and never moves the boundary backwards. Bounded CLI runs do not auto-extend.

Each extension transaction locks control and batch rows, inserts the missing interval, advances the target, and audits counts. DA receives one initial request per known authority for the whole missing interval, splitting later only if needed. Notice lists get one initial page per missing day and stream. A fresh catalogue scan finds newly listed authorities; a newly discovered authority gets the original DA start (1 July 2026) through the current target. Catalogue archival takes a shared batch lock to prevent missing a day if scope advances while its response is in flight. New windows reuse the normal archive deduplication, pacing, retry, pagination and source-validation rules. Existing successful/failed/deferred tasks and retry budgets are preserved. Repeating or concurrently invoking extension does not duplicate a window. Maintenance postpones extension.

This is a seeded target, not verified full source coverage. Failed tasks and unimplemented eForms detail endpoints remain visible gaps. No historical repair, old-task replay or automatic PDF download is introduced.

## Current-pace ETA

The admin forecast uses successful task completions and split steps over the last ten minutes, bounded by the latest pause/resume/settings change. It waits for at least one minute and twenty completions. Failed HTTP attempts are not useful work. Observed pace reflects time consumed by documents and failures; theoretical capacity and the shared daily cap remain ceilings, not measured throughput. Subsecond global proxy intervals are supported.

When discovery samples are sufficient, the remaining estimate includes projected pages. Otherwise the prominently labeled estimate covers only the known queue. Failed and deferred tasks are shown separately and do not suppress the ETA for executable work. Forecast ranges allow at least 25% rate/volume variation. New discoveries and daily extensions can increase the remaining work; future maintenance duration is not predicted. Pause, maintenance, quiet window, blocking, stale data or missing worker heartbeat suppress an active completion deadline. Queue completion never certifies gap-free source coverage or publication readiness.

The existing percentage/progress group now includes approximate duration, an estimated finish interval in Romanian time, recent useful pace and the explicit scope date. Long explanations remain in the existing disclosure. Forest/ivory styles and global design tokens are preserved.

## Verification

- Ten forecast unit tests: recent sampling, gaps, projected versus known queue, daily caps and proxy pace above 60/minute.
- Six isolated extension tests: opt-in, immutable history/retries, repeat/concurrent idempotence, Romanian 03:30 boundary, maintenance, transactional rollback, and authority discovery during scope advance.
- Seven existing runner integration tests and three admin metadata integration tests passed. All fixture writes use `seap_test_proxy_pool`, with no SEAP calls.
- Full local Turbo: 20 tasks passed. Database integrations above run explicitly rather than relying on skipped broad-suite cases.
- [Browser evidence](previews/recovery-eta-20261007/verification.json): authenticated production build, 12 checks, desktop/mobile, dark, paused/offline states, no overflow/runtime errors/external traffic, zero source requests. Screenshots are synthetic fixtures, not production collection results. Two bounded inspection rounds improved time-range precision and singular/plural gap copy. Detector: 10 advisories, no primary findings. Finish review: **ship** within this scope. No new visual world or shipping raster asset.

## Production rollout

Pending: pause and drain active requests; commit/push and verify deployment; apply the additive migration; enable `follow-latest` explicitly; verify the inserted scope without source probes; restore only the deployment-owned pause; observe resumed work and document the exact target and counts. Do not reset the operator's current rate or re-enable the six failed proxy endpoints.
