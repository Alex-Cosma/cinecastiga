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

FORM: Code-led approved admin extension; reference mockups/admin. One shared SEAP request slot, random 50–70 seconds by default, file retrieval at least 60 seconds apart. Default paused. No automatic PDF crawling. Daily processor explicitly not started; time setting persists without starting a job. The agreed daily statistics/Radiografie and weekly risk schedule is a policy awaiting implementation, visibly labeled as inactive automation.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Completion evidence

Final [finish review](../../docs/implementation/previews/admin-collection-live/finish-review.md): **ship**, after bounded fixes for truthful offline status, preservation of staged settings, and offline text fit. [Design documentation](../../docs/implementation/previews/admin-collection-live/design-documentation.md) compares this ordinary extension to the incumbent; `DESIGN.md` and `.impeccable/design.json` are preserved, with local detector advisories recorded rather than promoted into global tokens.

[Verification](../../docs/implementation/previews/admin-collection-live/verification.json) reports 41 passing production-build browser checks, no runtime errors, and no external requests. All eight captures in that directory are synthetic isolated-test evidence, not shipping artwork or proof of actual source collection. Default collection remains paused; this implementation does not activate production collection or the daily processor.

## Document queue extension — 2026-09-27

The same Operate surface now explains the agreed processing policy and exposes requested document work. The top count and default “De descărcat” view include only queued files whose original has not been saved. Separate filters expose processing of saved originals, notice file-list requests, and all waiting jobs. FIFO position is calculated before filtering, so visible positions may skip numbers. The active job sits above these filters with its actual stage and page progress where available; saved-file links open the existing archive route.

The queue is an administrator-only read view, with visible-tab polling every five seconds, loading and empty states, retained last-known data on refresh failure, and an explicit retry control. Viewing, filtering, and paging do not request downloads. Pause, source blocking, and maintenance explain why SEAP work is waiting. The existing shared pacing and file-delay rules remain visible.

The implementation keeps the existing typography, theme variables, thin row separators, small file icons, and text state labels. Mobile wraps controls and source text; dark theme and reduced-motion behavior inherit the collection surface. No new visual world, shared token, or shipping raster was added.

[Extension documentation](../../docs/implementation/admin-document-queue-20260927.md) records source mapping, synthetic browser evidence, verification scope, and operational limitations. The historical finish verdict above applies to the original admin implementation; the extension's current review and build status are recorded separately in that document. `DESIGN.md` and `.impeccable/design.json` remain unchanged.
