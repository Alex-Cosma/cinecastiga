# Proxy administration design documentation

Date: 2026-10-06. Surface: authenticated `/admin` collection view. Mode: Operate. This documents the ordinary extension in [ProxyControl.tsx](../../../../apps/web/app/admin/ProxyControl.tsx), [CollectionDashboard.tsx](../../../../apps/web/app/admin/CollectionDashboard.tsx), and [collection.css](../../../../apps/web/app/admin/collection.css).

## Design authority and comparison

The existing [PRODUCT.md](../../../../PRODUCT.md), [DESIGN.md](../../../../DESIGN.md), and [collection surface contract](../../../../.impeccable/surfaces/admin-collection.md) remain authoritative. The task extends the existing Romanian administrator workflow: understand current collection state, inspect pace and endpoints, then stage and apply changes. It introduces no new visual world or shared token system.

| Existing system | Extension evidence | Documentation decision |
| --- | --- | --- |
| Forest emphasis on ivory paper; dark counterparts through theme variables | New rules use existing paper, sunk, ink, secondary, muted, line, line2, and accent roles from `collection.css` | Preserve the global palette and sidecar; no new color primitives |
| Bricolage headings, IBM Plex interface text, tabular numeric comparisons | The section inherits the admin heading/body families; summary and endpoint numbers retain tabular treatment | No new font or global type role; local summary values use 28px desktop and 24px mobile |
| Open sections and quiet separators, with tonal grouping for forms | A bordered open section contains a native configuration disclosure on the existing sunk surface | Keep this composition local to the admin surface |
| Gently rounded controls and familiar native inputs | Existing button classes, radio buttons, checkboxes, 6px numeric inputs, and an 8px disclosure surface | No new component family or decorative material |
| Readable source values and state text at narrow widths | At 600px and below the endpoint inventory stacks identity/state above three labeled statistics | Record a surface adaptation, not a global breakpoint change |
| Explicit committing action and honest unavailable states | Apply follows staged fields; stale status, active work, and revision conflicts prevent unsafe submission | Preserve the established staged-settings interaction |

Source comparison and the supplied captures support preserving `DESIGN.md` and `.impeccable/design.json` without regeneration. Neither file was edited; their Git diff was empty during this documentation pass. Existing admin-local differences from global examples, including muted/risk roles, remain incumbent surface decisions. Detector advisories reported by the finish reviewer do not authorize unrelated token repairs. The new extension ships no raster assets and adds no motion.

## Information and interaction contract

“Conexiunea cu SEAP” follows global status and today's collection statistics. Connection mode is explicit: direct, through proxies, or unavailable when the server requires proxies that have not been activated. Observed pace is the ten-minute average including pauses, not a throughput promise. The total ceiling and per-IP waiting interval are separate. Draft capacity is labeled theoretical and explains that pauses, document work, and response time can reduce the observed rate. Fixture values in captures are examples, not recommended production settings.

The disclosure groups route, per-IP minimum/maximum, total requests per minute, and endpoint selection. Numeric source validation requires integer delays from 1 to 3,600 seconds with maximum at least minimum, and a total ceiling from 1 to 10 requests per minute. Proxy mode requires at least one selected endpoint. The server can disallow direct mode; endpoint installation and secrets remain outside this form.

Editing requires collection to be paused, maintenance to be inactive, no request or document to be running, fresh status, and no save in progress. Input changes create a draft; refreshed status does not replace it. A changed server revision displays a conflict alert and prevents Apply. “Renunță la modificări” discards the draft and reveals current saved settings. Unsaved drafts register the existing browser leave warning. Saving retains manual pause and does not shorten an already-started wait. The original direct pacing fields become inactive while proxy mode is selected; the existing daily limit remains common.

The endpoint inventory exposes IDs, exit IPs, textual state, today's attempts, errors, and measured response volume. State paths include unused, pool stopped, reserved for a document, review needed after an error, cooldown, available, and unknown when stale. The status mapping counts failed/interrupted attempts as errors and uses the Romanian calendar day for daily totals. Measured response bytes are explicitly distinguished from provider-billed consumption. The list paginates at ten endpoints; the selection controls continue to expose registered endpoints. Native pagination names the page and disables navigation at the boundaries.

The source policy remains visible: one in-flight request, a document retaining its IP until download finishes, at least one minute between files, and a SEAP refusal stopping collection. These statements describe the interface contract; visual review alone does not establish live scheduler compliance.

## Evidence and provenance

The supplied [finish review](finish-review.md) has disposition **ship**, limited to the new proxy administration interface and inspected source states. The documenter read the review, inspected current source, and opened the following existing captures; no browser or API tests were rerun for this documentation pass.

| Artifact | Provenance and use |
| --- | --- |
| [desktop.png](desktop.png) | Synthetic full-page capture, 1440 × 3178; establishes placement in the existing collection page and expanded settings/table composition |
| [mobile.png](mobile.png) | Synthetic full-page capture, 390 × 4973; establishes stacked fields, wrapped selection controls, and all endpoint statistics without page overflow |
| [desktop-panel.png](desktop-panel.png) | Synthetic auxiliary detail of the same new panel |
| [verification.json](verification.json) | Builder-supplied local evidence: `synthetic: true`, 1440/390 viewports, no page overflow, no runtime errors, zero source requests, unauthorized and CSRF responses both 403, saved ceiling 4 |

The supplied environment was isolated `seap_test_proxy_pool`, with documentation-range IPs and synthetic records. Captures show four registered endpoints, three selected, and a paused, successfully saved light-theme state. They are review evidence, not artwork shipped by the application. The separate `mobile-panel.png` artifact is excluded because it contains a skip-link overlay.

Error, empty, stale, revision conflict, running-document, dark-theme, and second-page paths exist in source but have no separate visual capture in this set. Inherited theme/focus/reduced-motion rules were inspected; these screenshots do not measure contrast, screen-reader behavior, or keyboard traversal. No additional accessibility certification is implied.

## Completion and operational boundary

The finish reviewer found no material issue in the bounded extension and required no further fixes. The durable surface record now links this documentation and the limited ship verdict. `DESIGN.md` and `.impeccable/design.json` remain unchanged because the evidence demonstrates an extension of the incumbent system.

No production activation was performed by this documentation work. Synthetic local evidence does not establish successful SEAP collection, live proxy performance, backend scheduling correctness, or contract association repair. Deployment, source request budgets, and production operating settings require their own current-state verification and authorization.
