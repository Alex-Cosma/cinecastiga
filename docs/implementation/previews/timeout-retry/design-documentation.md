# Bounded timeout retries — design documentation

Date: 2026-09-27. Mode: Operate. This is an ordinary extension of the existing collection administration surface, following [PRODUCT.md](../../../../PRODUCT.md), [DESIGN.md](../../../../DESIGN.md), and the [surface brief](../../../../.impeccable/surfaces/admin-collection.md). The [finish review](finish-review.md) records **ship** for the supplied UI scope. Deployment remains pending at this handoff.

## Scope and incumbent comparison

The approved policy retries a timed-out recovery data query after five minutes, then after another ten minutes; a third timeout stops collection for review. Other errors and browser document timeouts still require manual review. Files honor the shared cooldown; this policy does not authorize automatic PDF crawling. Manual pause, source-error blocking, maintenance, daily limits, and the daily quiet window remain gates on execution.

The implementation extends the existing status band, countdown, queue notice, and disclosures. It retains the forest/ivory palette, Bricolage and IBM Plex typography, flat sections, controls, spacing, and responsive layout. No CSS, shared tokens, new visual world, or shipping raster was introduced. The existing design documents already describe these visual primitives; no canonical refresh or new qualitative identity interview is needed.

| Source | Documented change |
| --- | --- |
| [CollectionDashboard.tsx](../../../../apps/web/app/admin/CollectionDashboard.tsx) | Shows the scheduled retry or retry in progress, attempt 2/3 or 3/3, earliest retry time, and a five- or ten-minute pause label. Reuses the paused band treatment and existing pause action. The countdown takes the later of shared eligibility and retry time, with “Se pregătește” at expiry rather than a promise of execution. |
| [DocumentQueue.tsx](../../../../apps/web/app/admin/DocumentQueue.tsx) | Explains that requested files await a data-query retry and keep their queue positions. Maintenance, error, manual pause, and quiet-window explanations retain precedence. |
| [ProcessingOverview.tsx](../../../../apps/web/app/admin/ProcessingOverview.tsx) | Replaces the blanket stop-on-failure statement with the bounded data-timeout exception; explicitly retains manual review for other errors and document timeouts, and diagnostics in the journal. |
| [collection.ts](../../../../apps/web/lib/admin/collection.ts) | Adds pending retry metadata to authenticated status: task, latest request, timeout count, retry time, and stream. Presentation reads persisted status; no new admin setting or override is added. |

The status title keeps stale-status, maintenance, source-error, manual-pause, daily-limit, and quiet-window precedence ahead of retry state. These gates suppress the active countdown. Retry details may remain visible as context while a higher-priority title explains a stop. Guardrails continue to state one shared SEAP request slot, file spacing, daily quiet hours, and immediate review for 403, 429, or additional verification. Settings remain staged until Apply.

## Evidence and provenance

[Verification](verification.json) reports 11 passing browser checks against a local production Next build: paused retry presentation, countdown, attempt 2/3, document wait explanation, no page overflow at 390px, attempt 3/3, source-error precedence, preserved manual pause, restored normal state, only the seeded request ledger entry, and zero browser runtime errors. These results are supplied implementation evidence; this documentation pass read the fixture and source changes without rerunning browser or backend suites.

The [fixture](../../../../apps/web/scripts/admin/check-timeout-retry.mjs) requires the dedicated local `seap_test_admin_queue` database, seeds one failed request, and intercepts status to supply synthetic retry metadata. It starts no collector or scheduler and makes no SEAP calls. Its temporary administrator session is removed afterward. [Desktop capture](desktop.png) uses a 1440 × 1050 viewport; [mobile capture](mobile.png) uses 390 × 844. Both are full-page first-retry waiting-state evidence, generated with reduced motion. They are review captures, not shipping artwork or evidence of a real source timeout. The finish reviewer independently inspected both captures and found the added copy fits the incumbent composition, including mobile wrapping and local journal scrolling.

The verification record also reports 8 timeout, 19 quiet-window, 14 control, 5 recovery, and 3 wire integration tests, plus 239 web and 93 ingestion unit tests. These are recorded results from the implementation handoff, not additional tests performed by the documentation agent. The finish review records an empty changed-target detector result and no material UI fixes.

## Limits and preservation

The captures establish the light first-retry presentation. Attempt 3/3 and selected stop states rely on supplied assertions and source inspection. This documentation does not establish a new dark-theme, measured-contrast, keyboard, or assistive-technology certification, all combinations of gates, actual five/ten-minute elapsed timing, exact-query replay, successful source collection, or production deployment. No real production timeout has been observed under this new policy. The UI ship verdict is separate from deployment and operational verification.

Canonical files remain byte-for-byte unchanged. SHA-256 verified during this handoff:

- `DESIGN.md`: `f3b7f369ca38b6c209606d7f9ca33a2e682754424b4ef55233128569db1f0ef1`
- `.impeccable/design.json`: `de3d623ee0466006854b0ec81158f0270ee02fdc0ac3bc1ab8314e1f722b9611`

Only this documentation and an appended surface-brief section were written by the documentation handoff; no implementation changes or unrelated metadata repairs were made.
