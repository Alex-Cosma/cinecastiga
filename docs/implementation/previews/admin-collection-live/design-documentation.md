# Collection administration design documentation

The authenticated `/admin` implementation extends the approved collection mock and the incumbent forest/ivory interface. The final [finish review](finish-review.md) records **ship** after resolving offline status wording, preservation of staged settings, and the resulting offline text collision. This document records the extension; [DESIGN.md](../../../../DESIGN.md) and [.impeccable/design.json](../../../../.impeccable/design.json) remain unchanged and retain their existing authority.

Sources: [surface contract](../../../../.impeccable/surfaces/admin-collection.md), [PRODUCT.md](../../../../PRODUCT.md), [authenticated route](../../../../apps/web/app/admin/page.tsx), [dashboard](../../../../apps/web/app/admin/CollectionDashboard.tsx), and [surface CSS](../../../../apps/web/app/admin/collection.css). The task is an ordinary extension, not an identity replacement or a repair of global design-document drift.

## Overview

The status band answers whether requests may proceed before the page introduces stream records, pacing settings, publication, and the request ledger. The shared application header and footer retain the product identity. Romanian labels distinguish received records, newly archived records, document jobs, and publication; unknown recovery totals are explicitly unknown. Operational values come from authenticated status and persisted settings rather than the standalone mock's demonstration controls.

The default is paused with a 50–70 second interval. The shared source gate, minimum file spacing, source-block recovery acknowledgement, and maintenance states are explained beside the relevant controls. Saving a time does not start daily processing: the publication section explicitly reports **Procesor zilnic nepornit** when no processor is connected. No actual source requests, production activation, or daily-processor startup are established by this evidence.

## Colors

The route's scoped variables reuse incumbent values for paper, surface, sunk, ink, secondary text, separators, forest action, accent-soft, orange, and amber backgrounds. Their local names sometimes differ: `--secondary` maps to ink-secondary, `--line2` to line-strong, `--soft` to accent-soft, and `--on` to on-accent. Shared font variables are referenced directly; color values are repeated in the scoped stylesheet rather than universally aliased to global variables. Explicit dark-theme and system-dark overrides retain the corresponding incumbent dark roles.

Local light-theme supporting text (`#626d60`) and risk text (`#a63625`) differ from the corresponding documented global values. Warning text uses `#82591b` in light mode and `#e2ba79` in dark mode. The status band keeps its own forest/sage treatment in both themes, with a brown blocked-state fill. These observed surface choices are not promoted to global tokens.

The supplied [detector report](detector.json) contains 23 advisory findings: six color literals, five radii, and twelve font sizes. Its color entries identify the blocked fill (`#694328`), pale band copy (`#d1e0d3`), countdown track (`#577563`), and band-button normal, border, and hover values (`#355d4d`, `#76917d`, `#446d59`). This is a record of local exceptions, not an exhaustive new palette or an instruction to normalize the approved surface. The finish review requested no optional visual changes.

## Typography

Bricolage Grotesque headings and IBM Plex Sans body text use the app's loaded `--font-display` and `--font-body`; request details retain IBM Plex Mono. Tabular numerals support timing, counters, and ledger comparison. The page heading uses 38px on desktop, 32px at the intermediate breakpoint, and 31px on narrow screens. Most operational labels and metadata use 12px; primary section headings use 23px. These tool-specific sizes extend the same family hierarchy without changing the documented global scale. Detector font-size advisories remain local observations, including declarations inherited from the standalone mock that need not be rendered by this React route.

## Layout

The live route uses the existing application shell. Its status band precedes a four-column statistics row and a workspace with open stream/publication content and a 345px pacing panel. The panel narrows to 315px below 1100px. At 800px the workspace stacks, the pacing panel moves above the main column, and its form uses two columns. At 480px the form becomes one column and returns after the main content. The ledger scrolls inside its own region on narrow screens; filters wrap.

Browser evidence reports no page overflow at 1440px, 390px, and 320px. Scoped standalone-shell declarations remain in the stylesheet, but their 1340px maximum is not the live route's shell specification. This document records rendered structure rather than promoting unused mock selectors into the system.

## Elevation & Depth

The rendered surface uses open rows, thin rules, and tonal grouping. The status band and settings panel provide the principal grouping; the live route does not introduce a decorative card grid. The stylesheet retains a mock toast shadow, but the current React dashboard uses inline feedback and does not render that toast. It is not a new shared elevation token.

## Shapes

The band and settings panel reuse the incumbent 13px radius value; primary/secondary controls use 7px and fields use 6px. Small local radii vary by role. The detector flags 2px, 3px, 4px, 5px, and 20px declarations; these include track, badge, preset, and switch treatments as well as retained mock styling. They remain surface-specific and do not expand the normative global radius scale.

## Components

- **Status and recovery.** State is expressed in text as well as color. Reporting loss shows “Stare necunoscută” with an em dash and explains that server collection may continue. Commands are unavailable while reporting is stale. Source-block recovery requires acknowledgement and respects its mandatory wait.
- **Pacing form.** Presets and numeric fields update the draft estimate immediately. Apply persists the draft, while pause/resume and stream controls preserve it. Competing revisions block overwrites, and explicit reload adopts saved settings. The current wait is not shortened by a settings save.
- **Stream rows.** Open rows show recorded attempts and received counts without invented completion percentages. Individual pause controls expose semantic pressed state and descriptive labels.
- **Request ledger.** Filters expose selected state, disclosure buttons expose expansion state, and details show the actual sanitized request record. Export is authenticated; visible copy states the 100-row view and 5,000-row export limit.
- **Feedback and access.** Loading and success use status text; validation/conflicts use alerts. Controls retain a visible 3px orange focus outline with a 4px offset. Reduced-motion CSS removes transitions and animation. These source observations and selected browser checks do not constitute a complete accessibility audit.

## Do's and Don'ts

- Preserve the shared fonts, forest/ivory identity, restrained rows, and explicit Romanian action labels.
- Preserve the distinction between saved policy, connected workers, source requests, and daily processing.
- Keep drafts intact across unrelated commands and describe unavailable status as unknown.
- Do not treat populated test records or worker fixtures as proof of source collection or production readiness.
- Do not promote these local visual exceptions or retained mock selectors into the global design system without a separate decision.

## Verification and raster provenance

[verification.json](verification.json) reports **41 passing production-build browser checks**, no browser runtime errors, and no external requests. Scope is the isolated `seap_test_collection` database with synthetic private-account and request fixtures; no actual SEAP traffic occurred. Checks cover access restrictions, settings persistence and revisions, draft preservation, request details/export, viewport overflow, blocked-source waiting, maintenance access, and stale-state behavior. The documenter inspected source, the report, and desktop/mobile/dark/offline captures; the finish reviewer inspected all eight captures and recorded the bounded verdict passes.

All eight PNGs are browser-generated test evidence: [empty desktop](empty-desktop.png), [populated desktop](desktop.png), [mobile](mobile.png), [narrow](narrow.png), [dark](dark.png), [blocked](blocked.png), [maintenance admin](maintenance-admin.png), and [offline](offline.png). Their counts, accounts, timestamps, worker signals, requests, and states are synthetic isolated fixtures. They are not shipping artwork, sourced photography, or generated illustration assets. The implementation adds no shipping raster asset; icons are inline SVG and interface structure is code. The review disposition does not establish deployment, current source coverage, or processor operation.
