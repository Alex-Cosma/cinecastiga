# Admin list pagination documentation

Date: 2026-09-27. Mode: Operate, narrow refinement of the existing `/admin` surface. The request is to limit lists under “Toate” to ten items per page. The [finish review](finish-review.md) records **ship** for the supplied visual and source scope. Deployment is pending at this documentation handoff.

## Implemented behavior

The [request journal](../../../../apps/web/app/admin/CollectionDashboard.tsx) renders ten requests per page with a visible item range and page count, native previous/next buttons disabled at the boundaries, and a polite range announcement. Changing filters resets pagination and request expansion. Browsing beyond the first page preserves a snapshot of the selected list while the dashboard continues polling every five seconds; returning to page one or choosing “Vezi cele mai noi cereri” resumes live results. Empty filters retain an explicit message without misleading rows or pagination.

The [document queue query](../../../../apps/web/lib/admin/document-queue.ts) reduces its page size from twenty to ten. Its existing [queue controls](../../../../apps/web/app/admin/DocumentQueue.tsx), filtered counts, FIFO positions, live refresh, and out-of-range page clamping remain applicable. The active operation is displayed separately from the paginated waiting list.

## Incumbent design comparison

This refinement reuses the existing queue navigation styling, buttons, focus treatment, typography, forest/ivory theme roles, and responsive wrapping. The established admin hierarchy remains intact. There are no new CSS rules, assets, shared tokens, or visual-system decisions. [PRODUCT.md](../../../../PRODUCT.md), [DESIGN.md](../../../../DESIGN.md), and the [surface brief](../../../../.impeccable/surfaces/admin-collection.md) remain the product and design authority. `DESIGN.md` and `.impeccable/design.json` were preserved byte for byte; no system refresh is needed for this change.

Inherited limits remain explicit: the journal pages only the latest 100 attempts, with a separate latest-100 failure feed; it is not a complete historical browser. Its mobile table retains horizontal scrolling within its own region. The queue retains live refresh rather than the journal's snapshot behavior.

## Evidence and provenance

Eight captures in [.impeccable/review/admin-pagination](../../../../.impeccable/review/admin-pagination/) are synthetic production-build browser evidence, not shipping artwork or real procurement findings:

| Captures | Scope |
| --- | --- |
| `desktop.png`, `mobile.png` | Complete admin composition, including the document top. |
| `journal-desktop.png`, `journal-mobile.png` | Journal pagination and responsive presentation. |
| `queue-desktop.png`, `queue-mobile.png` | Ten-item document queue and navigation. |
| `queue-dark.png`, `queue-empty.png` | Existing dark theme and empty queue state. |

The finish reviewer independently opened all eight images and found valid framing. Section captures hide the sticky global header only for capture; full-page captures preserve the complete surface. The documenter reviewed the source, review report, supplied browser log, and detector result without rerunning the browser.

The supplied `/tmp/seap-pagination-browser.log` records passing authorization and private-response checks, ten-request journal pages, partial final pages, disabled boundaries, filter reset and empty states, stable historical journal rows through polling, return-to-latest behavior, queue page clamping and preserved FIFO positions, mobile/desktop overflow checks, retry behavior, archive links, and no browser runtime errors. Viewing and filtering did not request documents; the parent verification reports no SEAP calls. `/tmp/seap-pagination-detect.json` contains an empty finding array. The implementation handoff reports a passing web production build, 239 web unit tests, and 93 ingestion unit tests; those suites were not rerun by the documenter.

These checks establish the isolated pagination implementation and supplied viewport/state samples. They do not establish production deployment, source freshness, collector recovery, a complete accessibility audit, or every viewport/state combination. Collector repair and deployment evidence remain in the separate operational handoff.
