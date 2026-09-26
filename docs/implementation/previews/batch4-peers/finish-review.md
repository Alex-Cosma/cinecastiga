# Peer comparisons — independent finish review

Disposition: **ship** with nonblocking copy advisories. Reviewed 20 September 2026. This is a local design acceptance, not deployment authorization.

## 1. Evidence validity

All 12 required final captures were opened with `view_image` at original detail: `peer-desktop.png`, `peer-mobile.png`, `peer-mobile-dark.png`, `peer-small-cohort-mobile.png`, `peer-sources-desktop.png`, `peer-sources-mobile.png`, `peer-group-sources-desktop.png`, `peer-case-desktop.png`, `peer-frozen-desktop.png`, `peer-frozen-desktop-viewport.png`, `peer-supplier-desktop.png`, and `peer-supplier-mobile.png`.

They show rendered, populated pages without blank captures, visible horizontal overflow, or malformed composition. Their filesystem timestamps fall within 12:34:05–12:34:13 EEST and agree with the final browser report at 09:34:13 UTC. Captured fixture names explicitly identify fictional data. The three source captures and frozen viewport capture are intentionally viewport-only. The long frozen capture shows the preserved source page with its 103-record total and pagination; it is not evidence that every row fits on one page. The actual viewport filename is `peer-frozen-desktop-viewport.png`, correcting the packet's shorthand.

The final `browser-checks.json` contains 23 successful observations, including 12 capture records, with no reported errors. Its complete-group, exact-total, original-link, CSV, private-capture, filter, pagination and URL assertions provide behavioral evidence beyond the images. Build, typecheck, lint, 339 default tests and 29 isolated PostgreSQL scenarios are reported in the supplied verification materials; this reviewer did not rerun them. `verification.json` still describes browser confirmation as pending, but the later final browser report supplies that confirmation. Update the handoff status when this review is integrated.

## 2. Direction and craft assessment

The result follows the approved Operate extension. PRODUCT.md, DESIGN.md, the comparison direction contract, persisted surface brief, implementation/evidence notes, functional mock and craft floor were read. This is code-led work without an approved raster comp or a separate quality-bar card; the incumbent design and explicit direction are the relevant authorities. No raster reproduction or shipping-image provenance obligation is introduced by these review screenshots.

| Promise | Assessment |
| --- | --- |
| Type | Match: Bricolage headings and IBM Plex reading text retain the incumbent character; values and member labels have a clear hierarchy. |
| Material | Match: flat surfaces, quiet dividers and a single comparison panel support a reporting task without simulated physical materials. |
| Ground | Match: the approved ivory/forest palette and corresponding dark roles remain coherent in the supplied captures. |
| Denominator before headline | Match: year, CPV, member count, activity band and estimated authority type precede the value comparison. |
| Exact sources and preservation | Match: each member has an adjacent source action; full-group actions explicitly preserve the group; case and frozen views show exact decimals and the focal-exclusion rule. |
| Small cohort | Match: four other entities produce “Grup insuficient,” retain source access and give a concrete way to broaden the selection. |
| Mobile composition | Appropriate adaptation to the stated brief: controls stack, member rows become labelled blocks, and actions stay present. Light and dark captures preserve the same reading order. |

The desktop first viewport establishes scope and reaches the comparison; mobile uses the necessary additional vertical space for labelled controls. The long member list is purposeful, paginated data rather than decorative repetition. The frozen evidence is dense but legible, with its summary, limitations, exact values and source table separated clearly. No new visual treatment needs rebuilding. The source drawer's inherited header and shell conventions remain outside this extension's redesign scope.

Primary source review confirms native labels, visible focus styling, meaningful status/error text, a reserved loading area, pressed state for the measure toggle, tabular numbers and reduced-motion handling. Screenshots alone do not certify keyboard behavior, screen-reader announcements or measured contrast for every state.

## 3. Material findings with severity and concrete remedy

No P0 or P1 finding. The reviewed evidence supports task completion and the approved comparison method.

1. **P2 — the median explanation excludes ties.** In both supplier captures the median is 372,000 lei, four of seven peers equal that value, and none is lower. The helper “Jumătate au valori mai mici, jumătate mai mari” therefore overstates a property of the distribution. In `PeersExplorer.tsx`, retain the complete-group count and use an exact definition, such as: “Mediana este valoarea din mijloc după ordonare; pentru un număr par, media celor două valori centrale.” This is a copy correction; the displayed median and source access remain intact.
2. **P3 — singular contract agreement.** `SourceBreakdown` displays “1 contracte distincte” in focal and supplier rows. Render “1 contract distinct” for one and “contracte distincte” otherwise; apply the same singular handling to “înregistrare” when its count is one. The count itself is unambiguous.

These are bounded follow-up copy corrections, not grounds for a new design or an open-ended polishing cycle.

## 4. Advisory disposition and limitations

The one detector warning about animating width is resolved in the inspected CSS: bars use `transform: scaleX(...)`, and the reduced-motion rule removes their transition. The eight remaining radius/type advisories are acceptable local tool choices within the incumbent world. They do not warrant changes to global DESIGN.md tokens or another detector run.

National-query latency of roughly 7–19 seconds remains a documented operational limitation, supported by the supplied data/HTTP observations. The loading region and recovery copy address its UI presentation; this review does not establish production response times. The explicit 499-other-member whole-group capture limit, checkpoint binding and complete medians are documented, with behavioral coverage supplied by the backend/evidence artifacts.

Review coverage includes the requested authority/supplier, source, private case, frozen, small-cohort and theme captures. It does not independently exercise every error/loading state, every responsive width, all assistive technologies, or live collection completeness. No browser session, test rerun, product-code edit, commit, push or deployment was performed by this reviewer.

## 5. Final disposition

**Ship.** Accept the comparison extension at this local checkpoint, carrying the two copy advisories above. Preserve the explicit group definition, per-member source access, exact frozen values, complete-group save semantics and existing design identity.
