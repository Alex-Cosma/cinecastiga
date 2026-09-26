# Population comparisons — design extension record

Recorded 26 September 2026. This is an ordinary **Operate** refinement of the comparison page and its preserved investigation evidence. The visual authority remains [DESIGN.md](../../../../DESIGN.md) and its [sidecar](../../../../.impeccable/design.json); [PRODUCT.md](../../../../PRODUCT.md) supplies the Romanian language, source transparency and evidence-preservation commitments. The scoped direction is [peer-population-design.md](../../peer-population-design.md) and the [comparison surface brief](../../../../apps/web/.impeccable/surfaces/apps-web-app-entitati-id-comparatii-page-tsx.md).

The Impeccable documenter role and `reference/document.md` were applied as a comparison against the existing system. The implementation does not establish a new visual world or require new global tokens. This pass writes this record and the scoped brief's final review status only; the canonical product/design files remain byte-identical.

## Implemented refinement

[PeersExplorer](../../../../apps/web/app/entitati/[id]/comparatii/PeersExplorer.tsx) explains the population basis before showing the comparison. The automatic group receipt states who qualifies, the focal population, its census date and source. Member rows retain identity, population, signed difference and direct procurement-source access. Missing population is explicit; members without eligible records remain visible and are excluded from the disclosed median denominator. These meanings are conveyed in Romanian text independently of color or bar length.

[PeerGroupEditor](../../../../apps/web/app/entitati/[id]/comparatii/PeerGroupEditor.tsx) adds inline name/CUI search, named add/remove controls, selected members and a return-to-suggestions action. Its search region reserves height while loading. A manual roster can contain up to 50 entities, including entities without identified population. Year, channel and CPV remain explicit Apply controls; the comparison caption states the currently applied criteria while an unsubmitted draft remains visible. [PeerEvidenceSummary](../../../../apps/web/app/anchete/PeerEvidenceSummary.tsx) reuses the investigation workspace's disclosures and focusable tables to show the preserved roster, population citations, observed denominator and exact source totals.

These are surface workflow decisions. They do not add requirements to the global type ramp, radius scale or component library.

## Comparison with the incumbent system

| Area | Observed implementation |
| --- | --- |
| Palette and themes | The local [stylesheet](../../../../apps/web/app/entitati/[id]/comparatii/peers.css) uses shared paper, surface, sunk, ink, muted, line and accent variables. The `globals.css` → `approved.css` cascade and shared font loading remain authoritative. Forest/ivory and the existing dark theme need no token changes. |
| Typography | Bricolage headings and IBM Plex reading text continue unchanged. The route retains its 42px heading, 34px mobile heading, 25px section/value emphasis and 15px/1.6 body. Population text uses 13px with 12px differences; the editor uses 14–16px labels/names and a subordinate 11px remove label within the full named button. Tabular figures support population and procurement comparisons. These local sizes are not new global tokens. |
| Layout and material | The existing 1120px content maximum, open rows, thin separators and sunk comparison panel remain. At 700px the editor actions, selected members and population details stack. Search results have stable internal scrolling; the investigation retains its own scrollable tables. No new shadows or decorative material are introduced. |
| Shapes and controls | Native selects, surface buttons and filled Apply retain 6–7px control corners and 44px minimum main control height. The search input is 46px high. The existing 12px comparison panel and 3px bar corners remain scoped details. Named add/remove actions, expanded/pressed states and 2px accent focus outlines with 4px offsets preserve the established control language. |
| Feedback and evidence | Existing short button/bar transitions retain reduced-motion overrides; numeric text does not animate. Search exposes loading, empty, error and retry states. The shared source drawer and investigation styles carry the population extension without a second visual system. |

## Review and evidence

The independent [finish review](finish-review.md) returned **SHIP**, with **no material fixes**. It inspected all nine supplied captures, the relevant UI source, functional HTML sketch, direction and system documents, craft floor, detector report and browser report. The reviewer disclosed the use of a fresh agent applying the supplied degraded finish-reviewer reference because the shipped reviewer role was unavailable. This record retains that limitation.

This documentation pass checked the source and system files above, [review packet](review-packet.md), finish review, [browser report](browser-checks.json), [retained detector output](design-detect.json) and the previous [comparison design record](../batch4-peers/design-documentation.md). It verified all nine PNG files against the browser report's dimensions: desktop widths of 1440px and mobile widths of 390px, with the declared full-page or viewport capture dimensions. Visual acceptance comes from the independent finish review; this pass did not rerun a browser, context loader, detector, build or test suite.

The browser report contains **17 check/capture entries**, reports success, and records no overflow or console errors. It covers automatic membership, add/remove with draft criteria, URL restoration, reset, individual/group sources, exact CSV totals, private v2 evidence and reduced-motion mode. The fixture uses fictional procurement, identifiers, suppliers and account data alongside official locality population data. The private evidence example preserves 11 other members and 47 source records totaling `1.153.000,0144 lei`; it is development evidence, not a procurement finding. This documentation pass does not independently establish backend correctness or full accessibility coverage.

The nine PNGs are development review evidence. No raster asset ships, and no new generated-image provenance is required.

## Preserved canonical files and drift

SHA-256 values recorded before and verified after this documentation pass:

| File | Unchanged SHA-256 |
| --- | --- |
| `PRODUCT.md` | `83fc90efd5a984ae7049eea8512902f4205133f2c95444aa777aa7ac94d13b24` |
| `DESIGN.md` | `a6991426170ab2f72767179f1696a9adf86166881bf68160c5706b60fa2ab3e6` |
| `.impeccable/design.json` | `de3d623ee0466006854b0ec81158f0270ee02fdc0ac3bc1ab8314e1f722b9611` |

The detector's ten advisory entries cover local font sizes and radii outside the concise global scales; it reports no primary findings. The independent review accepted these scoped treatments. The earlier comparison already documented its inherited heading, panel and bar differences. The base CSS versus approved-palette distinction and the shared source drawer's pre-existing eyebrow remain outside this refinement. None is promoted into a new system rule, canonized as a craft exception, or repaired by this documentation pass. No new global drift finding was supplied, and no global-file refresh or broad edit was warranted.
