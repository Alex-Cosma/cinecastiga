---
version: 1
slug: "admin-collection"
primary_target: "apps/web/app/admin/page.tsx"
related_targets: ["apps/web/app/admin/CollectionDashboard.tsx", "apps/web/app/admin/DocumentQueue.tsx", "apps/web/app/admin/ProcessingOverview.tsx", "apps/web/app/admin/collection.css"]
---

# Collection administration

Mode: Operate. Implementation of the user-approved standalone admin mock, extending the existing forest/ivory interface. Real authenticated status and persisted settings; no production collection started by this implementation.

## Direction contract

THESIS: Show whether collection is safe and advancing, then let the administrator inspect or change its rhythm.

OWN-WORLD: Existing Bricolage/IBM Plex typography, ivory background, forest-green emphasis, quiet rules, tabular numerals. Orange reserves attention for intervention.

STORY: Read global state and next request; compare the three recovery streams; inspect a request; change staged settings with an explicit apply action. Distinguish received records, archived records, document jobs, and publication. Unknown totals stay unknown.

FIRST VIEWPORT: Existing app shell, admin navigation, wide status band with pause control, statistics row, stream rows at left and pacing form at right. Publication and request log below. Mobile stacks without page overflow. Signature interaction: editing delays updates a rate estimate immediately, while active settings change only on Apply. Stale status disables commands; server revisions prevent overwriting another administrator.

FORM: Code-led approved admin extension; reference mockups/admin. One shared SEAP request slot, random 50–70 seconds by default, file retrieval at least 60 seconds apart. Default paused. No automatic PDF crawling. Scheduled processing is implemented locally: daily statistics/Radiografie and search at 05:00 Europe/Bucharest, with full risk recalculation on Sunday at the same hour. Administrators stage activation, time, and weekday changes before Apply; saving does not start a job immediately. Status distinguishes configured automation, a recent scheduler signal, active processing, and maintenance. Production activation remains pending the live TED repair and full-data daily clone rehearsal as of the 2026-09-27 documentation handoff.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Completion evidence

Historical evidence from the original admin implementation, retained at the 2026-09-27 handoff; its inactive-processor wording describes that earlier implementation. The processing-schedule extension and its separate review are recorded below.

Final [finish review](../../docs/implementation/previews/admin-collection-live/finish-review.md): **ship**, after bounded fixes for truthful offline status, preservation of staged settings, and offline text fit. [Design documentation](../../docs/implementation/previews/admin-collection-live/design-documentation.md) compares this ordinary extension to the incumbent; `DESIGN.md` and `.impeccable/design.json` are preserved, with local detector advisories recorded rather than promoted into global tokens.

[Verification](../../docs/implementation/previews/admin-collection-live/verification.json) reports 41 passing production-build browser checks, no runtime errors, and no external requests. All eight captures in that directory are synthetic isolated-test evidence, not shipping artwork or proof of actual source collection. Default collection remains paused; this implementation does not activate production collection or the daily processor.

## Document queue extension — 2026-09-27

The same Operate surface now explains the agreed processing policy and exposes requested document work. The top count and default “De descărcat” view include only queued files whose original has not been saved. Separate filters expose processing of saved originals, notice file-list requests, and all waiting jobs. FIFO position is calculated before filtering, so visible positions may skip numbers. The active job sits above these filters with its actual stage and page progress where available; saved-file links open the existing archive route.

The queue is an administrator-only read view, with visible-tab polling every five seconds, loading and empty states, retained last-known data on refresh failure, and an explicit retry control. Viewing, filtering, and paging do not request downloads. Pause, source blocking, and maintenance explain why SEAP work is waiting. The existing shared pacing and file-delay rules remain visible.

The implementation keeps the existing typography, theme variables, thin row separators, small file icons, and text state labels. Mobile wraps controls and source text; dark theme and reduced-motion behavior inherit the collection surface. No new visual world, shared token, or shipping raster was added.

[Extension documentation](../../docs/implementation/admin-document-queue-20260927.md) records source mapping, synthetic browser evidence, verification scope, and operational limitations. The historical finish verdict above applies to the original admin implementation; the extension's current review and build status are recorded separately in that document. `DESIGN.md` and `.impeccable/design.json` remain unchanged.

## Processing schedule extension — 2026-09-27

The existing processing section now shows the current stage and elapsed duration, next daily and weekly risk runs in Romanian time, separately labeled verified statistics and risk dates, and a disclosure of recent runs with stage durations. A missed heartbeat and failed run have explicit alerts. Failure retains maintenance and last verified dates, with an instruction to inspect the server journal before recovery; new runs do not begin during maintenance.

The existing settings panel adds an automatic-processing switch, a labeled daily time field, and a weekly risk weekday selector. It keeps the staged change summary, explicit Apply, reload action, and revision conflict protection. Schedule controls and Apply are disabled during maintenance. Activation applies to the next future scheduled time; disabling the schedule does not interrupt an existing run.

The [finish review](../../docs/implementation/previews/processing-schedule/finish-review.md) records **ship** for the supplied visual/source scope. [Design documentation](../../docs/implementation/previews/processing-schedule/design-documentation.md) compares the incumbent interface, documents states and screenshot provenance, and records the supplied localhost browser results. Six synthetic captures establish desktop/mobile composition, running progress, and dark failure presentation; they do not establish real source freshness or successful production processing. Production activation remains pending the live TED repair and full-data daily clone rehearsal at this handoff. Operational status belongs to the separate implementation handoff.

This remains an Operate extension using existing forest/ivory theme roles, typography, flat groups, native form controls, and disclosure rows. No new visual system or shipping raster was added. `DESIGN.md` and `.impeccable/design.json` are preserved byte for byte; inherited detector and metadata advisories are recorded without unrelated repairs.

## List pagination refinement — 2026-09-27

The request journal and document queue now show at most ten list items per page, including their “Toate” views. The journal adds a visible range and page count, disabled navigation at either boundary, and a reset to page one when changing filters. Leaving its first page freezes the selected request list during the existing five-second polling; returning to page one or choosing “Vezi cele mai noi cereri” resumes the latest list. The document queue uses a server page size of ten with its existing navigation and FIFO positions; its active operation remains separate from waiting items.

The [finish review](../../docs/implementation/previews/admin-pagination/finish-review.md) records **ship** for this narrow Operate refinement. [Design documentation](../../docs/implementation/previews/admin-pagination/design-documentation.md) records implementation, supplied production-build browser evidence, and eight synthetic captures. Existing controls, typography, theme roles, and responsive styling are reused; no CSS, shared token, or shipping raster was introduced. `DESIGN.md` and `.impeccable/design.json` remain byte-for-byte unchanged.

The journal retains its latest-100-attempt window and separate latest-100-failure window, and its existing horizontal table scroll on mobile. Synthetic browser checks establish pagination behavior and composition, not real collection or deployment. Deployment is pending at this documentation handoff; collector repairs and operational status belong to their separate handoff.

## Daily SEAP pause extension — 2026-09-27

The existing status band now names the preventive daily 02:59–03:30 Europe/Bucharest pause and shows new requests as stopped without a countdown. The document queue explains the wait and preserved positions; existing decisions and guardrails disclose coverage of data and files, completion of already-started responses, and preservation of manual and error stops. Higher-priority stop states remain visible. The quiet-window policy is independent of manual pause flags.

The [finish review](../../docs/implementation/previews/quiet-window/finish-review.md) records **ship** for this narrow Operate extension. [Design documentation](../../docs/implementation/previews/quiet-window/design-documentation.md) compares the incumbent and records two synthetic desktop/mobile captures plus the supplied verification scope. Existing styling, typography, controls, and theme roles are reused; no CSS, shared token, visual-world change, or shipping raster was introduced. `DESIGN.md` and `.impeccable/design.json` remain byte-for-byte unchanged.

The local production-build fixture made zero source HTTP requests; its synthetic overnight state does not prove an actual overnight pause or SEAP availability. Deployment and real overnight observation remain pending at this handoff. Production is separately blocked by timeout request 801; that operational issue is outside the visual verdict.

## Bounded timeout retry extension — 2026-09-27

The existing status band now describes a scheduled recovery data-query retry, attempt 2/3 or 3/3, and its earliest time. Its countdown respects both the shared next-request time and retry time; a separate label states the five- or ten-minute timeout pause. The existing pause action remains available. Stale status, maintenance, source-error blocking, manual pause, daily limits, and the daily quiet window retain precedence over retry execution. The file queue explains the shared wait and preserved positions.

The approved exception retries a timed-out recovery data query after five minutes, then after another ten minutes; the third timeout stops collection for review. Other errors and browser document timeouts remain subject to manual review. Files honor the shared cooldown, and automatic PDF crawling remains disabled. Existing decisions and guardrails now explain this bounded exception instead of claiming there are no automatic retries.

The [finish review](../../docs/implementation/previews/timeout-retry/finish-review.md) records **ship** for the narrow Operate extension. [Design documentation](../../docs/implementation/previews/timeout-retry/design-documentation.md) records the incumbent comparison, scope, provenance, and limitations. [Verification](../../docs/implementation/previews/timeout-retry/verification.json) reports 11 passing browser checks, no runtime errors, and zero source HTTP requests. Two synthetic desktop/mobile captures show the first retry waiting state using an isolated database and intercepted metadata; they do not establish a real production timeout or successful recovery.

The extension reuses existing forest/ivory styles, typography, status treatment, and responsive layout. No CSS, token, new visual world, or shipping raster was added; `DESIGN.md` and `.impeccable/design.json` remain byte-for-byte unchanged. Deployment is pending at this handoff, and a real production timeout has not been observed under the new policy. Operational validation remains separate from the visual ship verdict.

## Persistent admin navigation and forecast extension — 2026-09-28

The approved `mockups/admin-navigation` direction extends this Operate surface with five real routes in a persistent authenticated layout: collection, processing, files, journal and accounts. The shared status strip stays available across sections. Collection and processing settings remain separate while their drafts survive navigation; account and journal lists show at most ten rows, and journal pagination survives route changes. Mobile navigation clears the measured site header; account rows stack for narrower screens.

Known queue percentages remain distinct from the estimated overall workload. The estimate requires representative observations from all three streams and measured calendar throughput, includes at least 25% scenario variation, and names the collector's fixed batch end date. Deferred details and failures suppress completion ETA; pauses, missing worker signal and stale data suspend current deadlines. Batch completion never claims all newer days or all historical SEAP data are current. Crawler policy, pacing and schema are unchanged.

The [implementation and design documentation](../../docs/implementation/admin-navigation-20260928.md) records source behavior, thresholds and supplied evidence: 252 unit tests, two PostgreSQL integration tests, passing types/build, 24 authenticated browser checks without source/external traffic, and a read-only production EXPLAIN of 424.711 ms. Seven synthetic captures under `.impeccable/review/admin-navigation-live/` establish composition and local UI states. The [finish review](../../docs/implementation/previews/admin-navigation/finish-review.md) records final **ship** after the sole mobile account email measure correction; refreshed light/dark phone captures establish its resolution, and the rebuilt preview passed the browser checks again. Deployment is pending at this documentation handoff.

The extension retains the incumbent forest/ivory palette, type and flat component treatment. Local navigation/forecast styling introduces no shared tokens or shipping rasters. `DESIGN.md` and `.impeccable/design.json` remain unchanged; local detector advisories are recorded without unrelated global repairs.

## Proxy connection and pacing extension — 2026-10-06

The same Operate surface adds “Conexiunea cu SEAP” after the collection status and statistics. Operators can distinguish the active route, observed requests per minute over the last ten minutes including pauses, the total configured ceiling, and the delay between requests on the same IP. The draft capacity is explicitly theoretical. When proxy mode is active, the existing direct-delay fields are inactive and refer to the new connection section; the daily request limit remains shared.

A native disclosure groups route selection, per-IP minimum/maximum delay, total ceiling, and registered endpoint checkboxes before an explicit Apply. Editing requires paused collection, no maintenance, no running request or document, fresh status, and no save in progress. Drafts survive status refresh; revision conflicts block Apply until the operator discards/reloads the draft. Saving retains the pause and existing wait. The UI exposes endpoint IDs and exit IPs without credential or connection-URL fields.

Endpoint rows show textual availability/reservation/error state, today's request and error counts, and measured response volume. Traffic is explicitly distinguished from provider billing. The inventory shows at most ten endpoints per page, with boundary-disabled navigation. Below 600px, each endpoint becomes a compact group with all three statistics labeled beneath its identity and state. Stale data replaces the observed rate and availability with unknown states and disables edits. Empty inventory and server-required proxy mode have explicit explanations or disabled choices.

The [finish review](../../docs/implementation/previews/proxy-pool-admin-20261006/finish-review.md) records **ship** for the supplied new interface and inspected source states only. [Design documentation](../../docs/implementation/previews/proxy-pool-admin-20261006/design-documentation.md) compares the existing system and records provenance and limits. Synthetic desktop/mobile captures and [verification](../review/proxy-pool/verification.json) use the isolated `seap_test_proxy_pool` fixture, with documentation-range IPs, no page overflow, no runtime errors, zero source requests, rejected unauthorized/CSRF requests, and a persisted ceiling of four. The light, paused, saved state is visually evidenced; error, empty, stale, conflict, running-document, dark, and second-page states were inspected in source without separate captures. `mobile-panel.png` is excluded because of its skip-link overlay.

This ordinary extension preserves the forest/ivory theme roles, Bricolage/IBM Plex typography, quiet separators, native controls, and flat local form grouping. No new visual world, shared token system, or shipping raster was added. `DESIGN.md` and `.impeccable/design.json` remain unchanged. This documentation and its synthetic evidence do not activate production proxies or collection, certify live source throughput, or replace the separate backend and operational verification.


## Separate connection tab — 2026-10-06

User requested proxy settings in their own tab and small icons for all tabs. `/admin/conexiune` (“Conexiune SEAP”) now follows Colectare. Seven decorative16px line icons supplement visible labels. Existing horizontal overflow and active-route scrolling remain. Proxy settings stay mounted in the shared layout so drafts survive tab changes; their reminder returns to the connection tab. A dedicated-page treatment removes embedded top spacing and opens the configuration disclosure. No global design/token change. Local desktop1440/mobile390 browser checks cover routing, icons, draft preservation and no page overflow; no source traffic or settings writes. Evidence remains local at `.impeccable/review/proxy-tabs/`; earlier proxy-panel review predates this relocation.
