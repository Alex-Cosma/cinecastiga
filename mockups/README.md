# cinecâștigă? — Sunt banii tăi.

**New: [Domenii — compare category cards and an animated atlas](cinecastiga-domains.html).** Two clickable directions using the same real data. [Walkthrough and previews](domains/README.md).

**Complete prototype: [all 13 questions, with direct source records](cinecastiga-complete.html).** Includes 39,343 fully traceable historical profile records, exact calculations, source exports and working Anchete. [Walkthrough and data scope](complete/README.md).

**New: [Proposal A — the editable question](cinecastiga-question.html).** Try the advanced query sketch, with [a one-minute walkthrough and desktop/mobile previews](question/README.md).

**Open [cinecastiga-v1.html](cinecastiga-v1.html) in a browser.** It is one self-contained file: no installation, build, database connection, or internet connection needed. Fonts, map geometry, data, styles, and interactions are embedded.

The screen designs were written first in [the design document](../docs/mockups/01-design.md). Existing application code, configuration, dependencies, and earlier search mockups are unchanged.

## Try these journeys

1. **Start with curiosity:** click **Drumuri** on the home screen. Filter the purchases, change the order, open an entry, and inspect its original source reference.
2. **Follow an institution:** search **Cluj**, choose **Primăria Cluj-Napoca**, then click a category or supplier bar. The resulting purchases retain that institution as a filter.
3. **Investigate a signal:** **Explorează → Semnale → Servicii legislative**. Inspect the real five-minute interval and its explanation. Choose **Salvează în anchetă**, name the dossier, then open **Anchete**, add a note, and export it.
4. **Explore your county:** select any of the 42 counties. The national archive provides real county context. Detailed records are available for the four institutions included in this prototype; other counties explain the limited sample and offer a way back.
5. **Use the keyboard:** `/` opens search; arrows select suggestions; Enter opens a result; Escape closes a dialog. Tab moves through controls, map regions, and evidence links.

Search, filters, sorting, pagination, entity tabs, and the selected evidence record are encoded in the URL fragment. A copied local `file:` link also requires the HTML file on the recipient's device. Investigations and notes persist in the current browser; JSON export includes captured records, source URLs, notes, and timestamps.

## Screens

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Discover | [Preview](previews/desktop-home.png) | [Preview](previews/mobile-home.png) |
| Explore purchases | [Preview](previews/desktop-explore.png) | [Preview](previews/mobile-explore.png) |
| Institution profile | [Preview](previews/desktop-profile.png) | [Preview](previews/mobile-profile.png) |
| Signals | [Preview](previews/desktop-signals.png) | [Preview](previews/mobile-signals.png) |
| Evidence details | [Preview](previews/desktop-evidence.png) | [Preview](previews/mobile-evidence.png) |
| Investigation workspace | [Preview](previews/desktop-investigation.png) | [Preview](previews/mobile-investigation.png) |
| First investigation | [Preview](previews/desktop-investigations-empty.png) | Responsive in the prototype |

Preview dossiers and notes were created during browser verification. They are not preloaded into the delivered HTML.

## Data scope

The prototype embeds **48 authentic records**, selected from four authorities in the project's local database: Cluj municipality, Cluj county council, Cluj emergency hospital, and CNAIR. Records span 2024–2026. The extraction date is 12 September 2026; it does not imply data through that date.

National and county figures reproduce the existing imported archive aggregates for 2018–2026. They are separate from the smaller interactive sample. County attribution means the authority's registered location, not the location of a project.

Record sums can include framework agreements and amendments. They are labeled as recorded values, with coverage explanations, rather than actual expenditure or payments. Signal cards use the existing `da_rapid` flags and recorded time intervals. No fictional corruption allegation or single-bidder finding was introduced. Source URLs follow the project's existing SICAP helpers; SICAP could not be checked live from this device.

The existing Romania geometry and its attribution are preserved. Its source contains a noncommercial-use notice; this remains an unreleased design prototype.

## Verification

**38 browser checks passed; zero JavaScript runtime errors.** Coverage includes keyboard search, county navigation, empty-state recovery, category totals, chart drill-downs, signal totals, pagination, sorting, evidence permalinks, dialog dismissal, skip navigation, create/save/note/reload, CSV and JSON exports, aggregate source preservation, and layouts at 1440, 768, 390, and 320 pixels. See [the verification record](previews/verification.json).

The investigation module was also checked for duplicate saves, escaping, evidence removal, and unavailable browser storage. Desktop and mobile screenshots were visually inspected. External SICAP availability and the production authentication/query services are outside this standalone prototype.

## Editing the prototype

The editable source fragments are in `src/`. After editing, rebuild the single-file artifact with:

```sh
python3 mockups/src/build.py
```

The existing React application can adopt the components and interaction patterns after the design direction is selected. This prototype does not replace its complete query engine, account controls, server-built investigation snapshots, or change detection.
