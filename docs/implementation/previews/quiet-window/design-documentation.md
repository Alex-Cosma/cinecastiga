# Daily SEAP pause: design documentation

Date: 2026-09-27. This is a narrow Operate extension of the [collection administration surface](../../../../.impeccable/surfaces/admin-collection.md). The [finish review](finish-review.md) records **ship** for the supplied UI scope. Deployment remains pending at this handoff; production collection is separately blocked by timeout request 801.

## Comparison with the incumbent

The extension keeps the status-first admin composition, forest/ivory theme, Bricolage and IBM Plex typography, flat groups, thin separators, native controls, and staged settings with explicit Apply. It reuses the existing paused band and queue notice. No CSS, shared token, new component vocabulary, or shipping raster was introduced. The existing [DESIGN.md](../../../../DESIGN.md) and [design sidecar](../../../../.impeccable/design.json) remain the canonical visual records.

The first viewport now names the daily preventive SEAP pause and its resume time. “Cereri noi” reads “Oprite” with no countdown while the window is active; an already-started response may still finish. The manual pause action remains available. The title retains stale-status, maintenance, source-error, manual-pause, and daily-limit precedence over the scheduled state.

The document queue explains that the daily pause is 02:59–03:30, Romanian time, and preserves waiting files' positions. Maintenance, source errors, and manual pause retain precedence in that notice. Existing decisions and guardrails disclose that the interval covers data and files, lets already-started requests finish, and preserves manual and error stops after expiry. This replaces the previous statement that no overnight pause was scheduled. Backend quiet-window metadata is independent of the manual pause flags; automatic expiry does not authorize clearing those flags or error blocks.

These changes are in [CollectionDashboard.tsx](../../../../apps/web/app/admin/CollectionDashboard.tsx), [DocumentQueue.tsx](../../../../apps/web/app/admin/DocumentQueue.tsx), [ProcessingOverview.tsx](../../../../apps/web/app/admin/ProcessingOverview.tsx), and the [admin status mapping](../../../../apps/web/lib/admin/collection.ts). The daily interval uses Europe/Bucharest; it is separate from the existing daily processing schedule.

## Evidence and scope

Both retained captures were opened during this documentation pass: [desktop](desktop.png), captured at 1440px viewport width, and [mobile](mobile.png), captured at 390px. Desktop retains the wide status band and adjacent pacing panel. Mobile stacks the sections and wraps the longer scheduled-state title and queue explanation while preserving the visible pause action. These captures show the light scheduled state; they are synthetic review evidence, not shipping artwork.

The [fixture](../../../../apps/web/scripts/admin/check-quiet-window.mjs) uses a local production Next build, an isolated PostgreSQL test database, and intercepted quiet-window metadata. The on-screen update timestamp need not fall within the simulated overnight window. [Verification](verification.json) reports nine browser checks covering scheduled presentation, stopped requests without countdown, queue explanation, 390px no-overflow, source-error precedence, manual pause surviving expiry, normal-state resumption, zero request-ledger entries, and zero browser runtime errors. It records zero source HTTP requests and supplied totals of 18 policy integration, 14 existing-control integration, 239 web unit, and 93 ingestion unit tests. This documentation pass inspected the supplied results and source; it did not rerun those suites.

Neither the screenshots nor the finish verdict establish real overnight behavior, SEAP availability, or successful deployment. Real overnight observation remains pending. Dark mode, every combination of status flags, measured contrast, and complete keyboard or assistive-technology behavior were not newly verified by this evidence; existing theme and focus behavior are inherited. The production timeout and deployment status belong to the operational handoff, outside this visual verdict.

## Canonical preservation

No visual-world refresh was needed or performed. Canonical SHA-256 values, checked during this pass:

- `DESIGN.md`: `f3b7f369ca38b6c209606d7f9ca33a2e682754424b4ef55233128569db1f0ef1`
- `.impeccable/design.json`: `de3d623ee0466006854b0ec81158f0270ee02fdc0ac3bc1ab8314e1f722b9611`

Only this report and the appended surface extension record are documentation outputs of this pass. No unrelated historical documentation was repaired.
