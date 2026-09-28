# Admin navigation preview

Quick interactive mockup of consistent administration navigation. Colectare, Procesare, Fișiere, Jurnal and Conturi use one shell, one active-link treatment and a persistent system summary. The existing forest-green and ivory visual system is retained.

Open [the local preview](http://localhost:3112/admin-navigation/). The existing server serves `mockups/`; if it is stopped, run `python3 -m http.server 3112 --directory mockups` from the repository root.

Try switching all five sections, opening `?sectiune=conturi` directly and using browser Back/Forward. Change a collection interval without saving, visit another section, then return: the draft remains. Journal filters and pagination also survive section changes. Use the scenario selector to inspect normal operation, timeout and processing states; toggle the theme and narrow the viewport.

All data and actions are simulated. Account creation adds a local row, and the existing reporter account can be deactivated/reactivated locally; no account or email is created on a server. Processing schedule submission shows feedback only: it does not update the summary or run a scheduler. Pause, interval changes and journal export are demonstrations; the export contains fixture data. State is held in the current page and resets on reload. No backend or SEAP requests are made, and this preview is not deployed.

The standalone prototype uses query-string URLs and browser history to switch panels. Production should use separate routes within a shared administration layout, with real authorization, persistence and service state.

Implementation: [index.html](index.html), [style.css](style.css), [app.js](app.js), inherited [admin styles](../admin/style.css) and [shared fonts](../src/fonts.css). Product and visual authority remain [PRODUCT.md](../../PRODUCT.md), [DESIGN.md](../../DESIGN.md) and [the design sidecar](../../.impeccable/design.json); canonical design files were not changed for this extension.

Recorded browser verification contains [18 passing checks](../../.impeccable/review/admin-navigation/verification.json), including navigation, retained drafts/page state, simulated account creation, mobile overflow and absence of JavaScript errors or external requests. [Screenshots](../../.impeccable/review/admin-navigation/) cover desktop, accounts, processing, mobile, mobile accounts and dark mobile. The independent [finish review](review.md) concludes **Ship for mockup review**, with no blocking findings; this is not production readiness or full accessibility certification.

## Recovery estimate extension

The collection section now leads with overall recovery and approximate days until the configured streams are caught up; a compact summary persists across all five sections. The illustrative values are ≈30% and 7–12 days. Open the methodology disclosure for the workload calculation, incoming work allowance and distinction between collection and publication. Pause suspends the ETA, retry and processing retain an explicitly marked last estimate, and the new “Estimare în formare” scenario withholds percentage and ETA until enough observations exist.

These are simulated fixture values, not measurements or a working forecast service. Production needs observed useful workload, remaining-work estimates and effective calendar pace including pauses, processing and file traffic; failed attempts must not add progress. Changes to collection settings do not produce a real forecast in this mockup.

The extension has [nine recorded passing checks](../../.impeccable/review/admin-navigation/recovery/verification.json), covering summary persistence, pause/progress behavior, last-estimate labeling, learning state, incoming work, mobile overflow and runtime errors. Settled screenshots: [desktop](../../.impeccable/review/admin-navigation/recovery/desktop.png), [mobile](../../.impeccable/review/admin-navigation/recovery/mobile.png), [learning mobile](../../.impeccable/review/admin-navigation/recovery/learning-mobile.png), and [retry in dark mobile](../../.impeccable/review/admin-navigation/recovery/retry-dark-mobile.png). The independent [extension review](recovery-review.md) concludes **Ship for mockup review**, with no blocking findings. This narrow extension retains the incumbent design; `DESIGN.md` and the design sidecar are unchanged.
