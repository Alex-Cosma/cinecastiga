# Processing schedule design documentation — 2026-09-27

The existing authenticated collection administration surface now exposes implemented scheduled processing, live progress, separate risk freshness, and editable daily/weekly settings. The [finish review](finish-review.md) records **ship** for the supplied screenshot/source scope. Production activation remains pending completion of the live TED repair and a full-data daily clone rehearsal at this handoff. This document does not establish deployment or activation; current operational status belongs to [scheduled-processing.md](../../scheduled-processing.md).

## Incumbent comparison

The extension follows the existing Operate [surface contract](../../../../.impeccable/surfaces/admin-collection.md), [PRODUCT.md](../../../../PRODUCT.md), and forest/ivory [DESIGN.md](../../../../DESIGN.md). It preserves Bricolage headings, IBM Plex reading text, tabular timing values, restrained separators, flat tonal grouping, and Romanian labels. The existing settings panel contains the new controls; the processing section remains beneath recovery streams. Desktop retains the open main column and settings panel, and narrow mobile stacks them in the existing order.

Source comparison covers [ProcessingOverview.tsx](../../../../apps/web/app/admin/ProcessingOverview.tsx), [CollectionDashboard.tsx](../../../../apps/web/app/admin/CollectionDashboard.tsx), and [collection.css](../../../../apps/web/app/admin/collection.css). The extension reuses local theme roles for paper, text, warning, and soft enabled-state backgrounds. Stage durations align in paired label/value rows with tabular, nonwrapping duration values. The native weekday selector uses existing field colors, typography, and gently rounded corners. No new palette, font, elevation system, identity, or shipping raster is introduced.

## Implemented states and interaction

The approved schedule is daily at 05:00 Europe/Bucharest, with full risk recalculation on Sunday at the same hour. The display reads saved settings, so subsequent administrator changes update the presented rhythm. Daily work is described as new data, TED–SEAP associations, statistical tables, Radiografie, and search; the weekly run additionally recalculates risk.

- **Schedule and service state.** The section distinguishes automatic processing off, configured processing without a recent scheduler signal, active automation, and a running scheduled job. It gives separate next daily and risk dates in Romanian time and explains that maintenance prevents new runs.
- **Progress and recovery.** Current stage and elapsed duration appear above the schedule. Recent runs disclose scope, outcome, total duration, and individual stage durations. A heartbeat older than two minutes triggers an alert in source. Failure keeps maintenance visible and directs the administrator to inspect the server journal before recovery; no automatic retry is promised.
- **Freshness.** Verified statistics and risk calculation dates are separately labeled. Risk freshness uses the checkpoint's risk calculation date where available, with the existing verified completion fallback for older checkpoints. A failed attempt does not replace the last verified values. TED normalization counts appear only when present in the verified checks.
- **Editing.** The switch, daily time input, and weekday selector participate in the existing staged form. Apply persists the changes, reload restores saved values, and revision conflicts block overwrites. Schedule controls and Apply are disabled during maintenance. Copy explains that activation applies to the next future scheduled time and disabling the schedule does not interrupt a run already started.
- **Accessibility.** Visible labels, native controls and disclosures, semantic status/alert feedback, and text state cues extend the incumbent behavior. Focus and reduced-motion styling remain inherited. This handoff is not a complete keyboard, assistive-technology, or contrast audit.

## Verification and raster provenance

The documenter opened all six supplied captures in [.impeccable/review/processing-schedule](../../../../.impeccable/review/processing-schedule/): [desktop](../../../../.impeccable/review/processing-schedule/desktop.png), [mobile](../../../../.impeccable/review/processing-schedule/mobile.png), [processing desktop](../../../../.impeccable/review/processing-schedule/processing-desktop.png), [processing mobile](../../../../.impeccable/review/processing-schedule/processing-mobile.png), [running mobile](../../../../.impeccable/review/processing-schedule/processing-running-mobile.png), and [dark failure](../../../../.impeccable/review/processing-schedule/processing-failed-dark.png). Full pages show the shared shell and document top; section captures show enabled, running, and failed processing states. The capture script hides the sticky global header only for section captures. Dark evidence is limited to the failed processing section.

These are browser screenshots of synthetic isolated data, generated by [check-processing.mjs](../../../../apps/web/scripts/admin/check-processing.mjs) against localhost:3115 and the dedicated local `seap_test_admin_queue` database. Fixture accounts, dates, totals, scheduler signals, and run progress are illustrative test records. The screenshots are review evidence, not shipping artwork or proof of actual production processing, coverage, or freshness.

The supplied `/tmp/seap-processing-browser.log` reports a successful real localhost authenticated settings POST, persisted activation date and Sunday selection, no processing job created by saving, HTTP 400 for an invalid weekday, separately preserved risk freshness, no mobile horizontal overflow, disabled schedule controls during maintenance, HTTP 409 for a maintenance settings change, no new SEAP request records from admin inspection, and no browser runtime errors. The documenter read the script and passing log; these checks were not rerun for this documentation-only handoff. The finish review likewise distinguishes its independent screenshot/source inspection from supplied browser results. Neither evidence set runs a real publication or host scheduler, validates the full production dataset, or authorizes operational activation.

## Canon preservation and inherited advisories

The supplied `/tmp/seap-processing-design-detect.json` contains inherited advisory findings only: six colors, nine radii, and seventeen font sizes. They remain observations about the existing surface rather than additions to global tokens. The prior [document queue handoff](../../admin-document-queue-20260927.md) also records an unset `buildPath` and two orphan surface briefs. Those known metadata advisories are preserved without repair; no new context scan or detector pass is claimed here.

[DESIGN.md](../../../../DESIGN.md) and [.impeccable/design.json](../../../../.impeccable/design.json) were preserved byte for byte. SHA-256 values before and after this documentation handoff:

```text
f3b7f369ca38b6c209606d7f9ca33a2e682754424b4ef55233128569db1f0ef1  DESIGN.md
de3d623ee0466006854b0ec81158f0270ee02fdc0ac3bc1ab8314e1f722b9611  .impeccable/design.json
```

Only the existing admin surface record and this extension document were written. The original admin and document-queue evidence remains historical; their earlier inactive-policy wording is superseded by this implemented extension without converting local evidence into a production activation claim.
