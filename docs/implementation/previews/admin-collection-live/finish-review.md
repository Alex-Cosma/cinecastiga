disposition: ship

Final status: both original findings and the introduced offline text overlap were scored resolved in the bounded verdict passes below. Earlier findings and dispositions remain as review history.

## Scope / evidence

One bounded finish review of `apps/web/app/admin/page.tsx`, `CollectionDashboard.tsx`, and `collection.css`, against `.impeccable/surfaces/admin-collection.md`, `DESIGN.md`, `PRODUCT.md`, the approved `admin-collection/desktop.png` mock, and the Impeccable craft floor. Opened all eight required captures: empty desktop, populated desktop, mobile, narrow, dark, blocked, maintenance admin, and offline. The captures show their named states, the document top, and complete content; none requires recapture for validity. Read `verification.json` (33 reported checks, no runtime errors or external requests) and `detector.json` (advisory findings).

This is a screenshot and source review, with supplied browser verification rather than an independent browser run. Fixtures use an isolated test database and do not establish live source collection, daily processing, or production deployment. Screenshots are verification evidence, not shipping raster assets.

## Task fit

The implementation preserves the approved forest/ivory identity, shared typography, status-first hierarchy, open stream rows, adjacent desktop pacing form, and stacked mobile composition. Received records, archived records, and document jobs are distinguished. Unknown totals remain unknown; publication explicitly identifies the daily processor as not started. The supplied checks support draft rate estimates, explicit Apply, revision protection, persisted controls, request details/export, Retry-After handling, maintenance access, and stale-command disabling. The safe paused default is visible in the empty capture.

## Material findings

1. **Offline status incorrectly claims that requests are stopped.** `offline.png` displays “Cereri noi / Oprite” beside the explicit warning that collection may continue on the server. `CollectionDashboard.tsx:23` makes `running` false whenever status is stale, and line 37 maps every false result to “Oprite.” Loss of reporting establishes an unknown current state, not a stopped queue. Show an unknown/unavailable request status while stale, preserving disabled commands and the last-known-data explanation. Acceptance: the offline capture must contain no affirmative claim that new requests stopped merely because reporting disconnected.

2. **Pause and stream actions silently discard staged settings.** `CollectionDashboard.tsx:20` clears `dirtyRef` and invokes `refresh(true)` after every successful mutation; line 16 then replaces the entire form. Editing an interval or processing time and then pausing the queue, toggling a stream, or confirming recovery loses those unapplied values without an explicit discard action. Preserve drafts across non-settings actions; reset them after successful Apply or the explicit reload action. Retain revision protection, distinguishing the administrator's own non-settings revision from an actual competing settings change where needed. Acceptance: stage a different interval/time, operate global and per-stream pause controls, and verify the draft survives, remains visibly unapplied, and can subsequently be applied without overwriting competing changes.

## Optional notes

No optional changes requested. Detector advisories alone do not justify changing the approved visual direction. Preserve the restrained hierarchy and truthful unknown-total wording while addressing the findings.

## Disposition

**fix** — resolve the two material findings in one batch. Confirm the offline wording with the same screenshot path and supply focused interaction evidence that staged settings survive non-settings actions. The next review should score these findings and any regressions introduced by their fixes, rather than reopen the surface.

## Verdict pass 1

Reopened the same eight regenerated screenshot paths; all remain valid evidence. Read the changed mutation/refresh logic and the updated `verification.json` reporting 41 checks, zero runtime errors, and zero external requests. Scope is the two prior findings and regressions introduced by their fixes.

1. **Offline request truthfulness — resolved.** `offline.png` now shows “Necunoscut” and retains the warning that collection may continue on the server. The stale branch no longer asserts stopped requests.
2. **Draft preservation — resolved.** Source separates forced status refresh from form reset, resets after settings Apply, and advances a matching draft revision for the administrator's own non-settings actions. Supplied focused checks verify global and per-stream draft preservation, successful subsequent Apply, competing-change preservation and overwrite protection, and explicit adoption of saved settings.
3. **Introduced regression — unresolved.** In `offline.png`, the new “Necunoscut” value exceeds the fixed countdown column and visibly overlaps the adjacent pause button. Fit the unknown state within its allocated column at desktop and narrow widths, preserving the truthful unknown wording or using a concise unknown token with an explanatory label.

## Remaining

The offline status/button collision remains open. No other introduced regression identified in this bounded pass. The two original behavioral findings are resolved; this is not a fresh whole-surface review.

disposition: fix

## Verdict pass 2

**Offline status/button collision — resolved.** Reopened the regenerated production `offline.png` at the same path and inspected the corresponding source. “Stare necunoscută” now labels a compact em dash; both fit inside the countdown column with clear separation from the disabled pause control. The server-activity uncertainty explanation remains visible. The supplied final verification still reports 41 passing checks, no runtime errors, and no external requests. No regression introduced by this text-only correction is visible in the reviewed region.

## Remaining after verdict pass 2

Clear. This **ship** disposition covers the scored findings and their fix regressions; it does not represent a new whole-surface review or establish production source collection.

disposition: ship
