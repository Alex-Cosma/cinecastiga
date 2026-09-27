# Admin processing policy and document queue — 2026-09-27

The existing collection administration surface now distinguishes the agreed processing schedule from working automation and provides a live read view of requested document jobs. This is an ordinary extension of the incumbent forest/ivory interface. It does not activate collection, deploy the application, or implement the daily/weekly scheduler.

## Processing policy and operational truth

The agreed daily work covers new data, TED–SEAP associations, statistical tables, Radiografie, and search. Full risk-signal recalculation is weekly; the weekday remains undecided. The interface states “Program convenit · automatizare neactivată” and explains that splitting daily and weekly execution still requires implementation and validation. Saving the proposed daily time does not start processing.

The status view exposes current processor activity and maintenance alongside the latest completed, coordinated, verified refresh. A newer failed or separate manual stage does not replace that verified checkpoint. Risk freshness currently refers to that same complete verified refresh; a separate weekly risk timestamp is a future scheduling requirement. This release does not claim that daily statistics and weekly risk are already calculated independently.

The disclosed operational policy retains the shared SEAP request interval, explicit failure review, and publication sequence of collection pause, backup, recalculation, checks, and search update. The suspected source interruption around 03:00 remains an observation, without an automatic pause at that hour. These explanations do not establish successful execution of those operations in this local verification.

## Queue semantics and behavior

| View | Included waiting work |
| --- | --- |
| De descărcat | Queued file jobs with no saved original hash; this is also the top-level file count. |
| De procesat | Queued file jobs whose original is already saved. |
| Liste de fișiere | Queued notice file-list jobs; listing does not mean downloading a file. |
| Toată coada | All queued document jobs, excluding running and completed work. |

The active job is displayed separately from waiting counts. It shows the stored stage and saved-original state. A page progress indicator appears only when a page total exists, using stored pages completed and total rather than estimated progress. Saved-original or PDF links use the existing `/api/documents/{id}/file` route. Notice links are rendered only for the expected HTTPS SEAP notice prefix.

FIFO order is determined by creation time and job ID across all queued document work before filtering. Missing numbers in the default view therefore identify intervening jobs in other categories. Pages hold 20 jobs, and requests beyond the current final page clamp to that page.

The queue endpoint is a read-only database snapshot with a statement timeout. Anonymous and non-admin access return 403. Invalid filter/page values return 400; read failure returns 503. Responses are private and uncached, omit blob hashes and requester identity, and expose no queue mutation action.

The browser loads immediately, polls every five seconds while the tab is visible, and refreshes on window focus. Requests have an eight-second timeout. Refresh failures show a retry action and retain the last known snapshot where applicable. Filters, pagination, source/archive links, loading, empty, paused, maintenance, and blocked states are represented explicitly. Viewing or filtering the queue does not enqueue work or contact SEAP. The UI states the existing minimum 60-second separation between downloads and the shared SEAP request budget.

## Design preservation

The queue extends the existing admin reading order below collection/publication and before the request journal. A navigation link and the top file count lead to it. The surface retains Bricolage headings, IBM Plex text, forest emphasis, ivory/sunk surfaces, thin separators, existing button/filter treatment, and explicit text labels for state. File icons are inline SVG in code, not generated raster assets.

Queue filters wrap, source text and filenames fit narrow layouts, and pagination wraps on mobile. The active job uses a quiet bordered surface, while empty/status messages use existing tonal backgrounds. New ornamental three-pixel side borders were removed during the bounded finish correction. Theme colors and reduced-motion behavior come from the existing collection surface. No global token or design-world change was needed.

The documenter preserved [DESIGN.md](../../DESIGN.md) and [.impeccable/design.json](../../.impeccable/design.json) byte for byte. Their SHA-256 values before and after documentation are:

```text
f3b7f369ca38b6c209606d7f9ca33a2e682754424b4ef55233128569db1f0ef1  DESIGN.md
de3d623ee0466006854b0ec81158f0270ee02fdc0ac3bc1ab8314e1f722b9611  .impeccable/design.json
```

## Source and verification evidence

Source reviewed for this documentation:

- [CollectionDashboard.tsx](../../apps/web/app/admin/CollectionDashboard.tsx): queue navigation/count, processing overview, and proposed-time labeling.
- [DocumentQueue.tsx](../../apps/web/app/admin/DocumentQueue.tsx): polling, filters, active progress, archive links, pagination, and failure/empty states.
- [ProcessingOverview.tsx](../../apps/web/app/admin/ProcessingOverview.tsx): agreed policy, inactive-automation explanation, current activity, and verified freshness.
- [collection.css](../../apps/web/app/admin/collection.css): incumbent theme and responsive extension styles.
- [document-queue.ts](../../apps/web/lib/admin/document-queue.ts), [collection.ts](../../apps/web/lib/admin/collection.ts), and [collection route](../../apps/web/app/api/admin/collection/route.ts): query semantics, verified-checkpoint selection, authorization, and response validation.
- [check-document-queue.mjs](../../apps/web/scripts/admin/check-document-queue.mjs): explicit local fixture and browser checks.

The implementation run reports the dedicated script passing against the schema-only local `seap_test_admin_queue` database and local preview. Its synthetic fixture contains 23 undownloaded waiting files, one saved waiting file, one waiting list, one running saved file at 3/12 OCR pages, and one completed job. External browser requests are blocked. The checks cover access denial, private/no-store responses, category counts, original-file availability, FIFO positions, pagination/clamping, invalid input, active progress, omission of internal hashes/requester identity, correct verified-checkpoint selection, filter interactions, saved-file links, retry after a simulated read error, an empty queue, no document requests created by viewing, no desktop/mobile horizontal overflow, and no browser runtime errors.

The implementation run also reports 239 unit tests passed and 106 skipped. Existing integration suites were skipped in that run; the dedicated queue script supplies separate local database/browser coverage. The production build completed successfully. The documenter inspected the script, source, build-log completion, and the final browser-test log, but did not rerun test setup or read runtime secrets. The final integration run additionally confirms that the served CSS has no colored side stripes. These checks do not certify every accessibility interaction, source-network behavior, document worker execution, or production performance.

Synthetic review captures are stored at:

- [Full desktop](../../.impeccable/review/admin-queue-final/desktop.png) and [full mobile](../../.impeccable/review/admin-queue-final/mobile.png).
- [Queue desktop](../../.impeccable/review/admin-queue-final/queue-desktop.png), [queue mobile](../../.impeccable/review/admin-queue-final/queue-mobile.png), [queue dark](../../.impeccable/review/admin-queue-final/queue-dark.png), and [queue empty](../../.impeccable/review/admin-queue-final/queue-empty.png).

These screenshots are local test evidence, not shipping imagery or findings about real institutions. Queue examples are explicitly synthetic. The documenter visually confirmed the post-correction desktop/mobile queue captures at the unique `admin-queue-final` paths; earlier same-name captures outside that directory are superseded. The fresh reviewer identified only the new side accents as a material fix. Its focused final verdict is **ship** for that bounded correction, corroborated by the computed-style assertion and refreshed captures. This verdict does not claim an additional whole-surface audit. Release `7d49f3a` was committed and pushed to main; GitHub run `36315179905` completed both CI and deploy successfully. Production checkout matches the release, the web container is healthy, public health and `/domenii` return 200, and anonymous access to the queue returns 403. The live queue had zero undownloaded waiting files at 14:20 Bucharest. This release does not establish completion of the separate TED data repair.

The existing Impeccable context report identified an unset `buildPath` and two orphan surface briefs. Those pre-existing advisories are recorded without unrelated metadata repairs.
