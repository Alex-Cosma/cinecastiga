# cinecâștigă? — „Sunt banii tăi.”

Written before implementation · 12 September 2026 · functional mock-up v1

## The experience

An open invitation to understand public money. The first screen should feel like a useful public-interest publication, with the immediacy of a good search tool. One question, one place, one useful discovery. The deeper tools emerge from the answer.

Keep the existing name, Romanian voice, entity profiles, source trail, geographic exploration, question builder, and private Anchete. Use a separate, self-contained HTML prototype. No production app changes are part of this round.

## What the current code tells us

`apps/web/app/page.tsx` opens with `AskPanel initialMode="build"`; the visitor encounters query construction before an answer. Its next prominent block ranks authorities by a compound risk index. `SiteNav.tsx` gives methodology equal prominence to exploration, while Anchete is accessible through account navigation. The existing entity and investigation models already contain useful depth: partners, purchases, source references, clipped snapshots, notes, and relations. The redesign makes that value discoverable.

The previous search explorations remain intact. This is a separate visual/product branch, not a replacement for their 13-block query engine.

## Visual system

- Canvas: warm ivory #f7f8f2; white surfaces; deep forest #173f35; ink #202e28; muted green-gray #69736b; orange #cf552f; mint #e5eddd.
- Typography: large, closely spaced editorial sans headings; readable humanist sans body; tabular numbers. Local fallback fonts keep the artifact useful offline.
- Layout: 1200px maximum width, 32px desktop gutters, deliberate negative space. Compact persistent navigation, generous hero, a composed map panel, a question-led exploration section, and an investigation invitation.
- Shape: 12–20px corners, thin warm borders, restrained shadows. No heavy dashboard chrome. Small line icons communicate actions; typography carries the identity.
- Motion: short opacity/position transitions, responsive hover/focus feedback, no scroll hijacking; honor reduced motion.
- Accessibility: visible keyboard focus, semantic buttons and links, keyboard search, labeled form fields, focus-managed dialogs, status announcements, a list alternative to the map, usable mobile controls.

## Screen 1 — Discover / home

```text
 cinecâștigă?       Descoperă  Explorează  Anchete       Cum funcționează  [ / Caută ]
 ────────────────────────────────────────────────────────────────────────────────
 BANII PUBLICI, PE ÎNȚELESUL TĂU              [ ROMÂNIA, MAI DE APROAPE ]
                                             Pe ce se duc banii
 Sunt banii tăi.                              în județul tău?
 Vezi unde ajung.                             [interactive county map]
                                             [selected county + drill action]
 De la strada ta la marile contracte.         [subtle legend / coverage]
 Urmărește cine cumpără, cine câștigă
 și ce întrebări merită puse.

 [ ⌕  O primărie, o firmă, un subiect…    → ]
 Încearcă: [Cluj] [Drumuri] [Spitale]
 Gratuit. Date publice. Curiozitatea e suficientă.

 ───────────────── contextual data / honest snapshot ───────────────────────────

 O întrebare bună e un început.                   [Vezi toate achizițiile →]
 [01 Cine repară drumurile?] [02 Ce cumpără spitalele?] [03 Cine primește contractele?]
 Each card has a small composed graphic, a short question and a specific next step.

 [ Anchetă / folder illustration ]   Ai găsit un fir? Urmărește-l.
                                    Strânge contracte, surse și notițe într-un dosar.
                                    [Începe o anchetă →]

 Plain source, amount and prototype coverage note · v1 · short changelog
```

Home gives three valid starts without typing: a county, a topic, an example. Search accepts names and everyday words with diacritic folding. Suggestions show entity type and county; Enter runs the first clear match; Escape closes suggestions; `/` focuses search. No implied generative AI: unsupported queries offer concrete alternatives.

## Screen 2 — Explore / results

```text
 Descoperă / Explorează
 Urmărește banii.                         [ search within snapshot ]
 [county] [category] [period] [clear]      [Listă | Hartă]

 [number of matching records] [contracted value] [distinct suppliers]
 These numbers derive from exactly the rows below.

 Ce s-a cumpărat                    Cine a câștigat       Valoare        Data
 [contract title + authority]       [supplier link]       [amount]       [date]
 …
 [Exportă CSV] [Copiază linkul]          Coverage and source note

 Mai departe: [Vezi instituția] [Cine sunt furnizorii?] [Salvează în anchetă]
```

Filters update rows and totals together. URL hash preserves view, filters and selected record. Empty states keep filters editable and offer a reset. Contract opens an evidence drawer. County map is fully clickable and offers an accessible selector/list; unsupported counties explicitly report absence from the small prototype snapshot rather than invented values.

## Screen 3 — Authority / follow the money

```text
 Explorează / Instituție
 [institution icon]  Authority name                [Salvează în anchetă]
                     County · public authority · source scope

 One plain-language sentence about the snapshot.
 [contracted value] [purchases in sample] [suppliers in sample]

 [Privire de ansamblu] [Achiziții] [Furnizori]
 Where money goes: clickable category bars + readable values
 Who receives it: partner bars linked to matching evidence rows

 Mai departe: Ce a cumpărat? · De la cine? · Deschide sursa
```

Facts before signals. No fabricated risk findings or legal conclusions about real entities. Any future statistical signal pairs its explanation and limitation in the same block. Totals explicitly describe the displayed sample, not a complete authority budget.

## Screen 4 — Evidence drawer

Title, authority, supplier, exact contracted amount, award date, acquisition type, original notice reference and source link. A compact explanation distinguishes contracted values from payments. Actions: save into a chosen investigation, copy a link, open original source. Focus remains in the dialog; Escape and close return focus to the invoking control. On mobile the drawer occupies the screen.

## Screen 5 — Anchete

```text
 Anchetele tale                               [+ Anchetă nouă]
 O întrebare azi. O imagine mai clară mâine.
 Saved locally in this prototype; browser storage is not a private account.

 [folder card: title, description, saved evidence count, last updated]
 [new folder card]

 Open dossier:
 title / editable notes / saved contract cards / source links
 [Exportă dosarul]   [+ Adaugă o notă]
```

Create a named investigation; save a contract or institution snapshot; write notes; remove saved evidence; export JSON with timestamps and original source references. Persist in localStorage with graceful handling if storage is unavailable. Do not imply account authentication or server privacy. The production integration retains existing owner checks, server-built snapshots and drift detection.

## Two walkthroughs to validate

Ana: open → click „Drumuri” → read matching purchases → open one → follow supplier or source. First result requires one click and no knowledge of procurement vocabulary. Wrong term → useful alternatives → reset without losing navigation.

Dan: `/` → type authority → Enter → inspect purchases → open a source → save to named Ancheta → annotate → export. Search, filter, view and evidence deep links survive reload; saved dossier survives reload. Export describes scope and source.

## Data and implementation boundaries

Prefer a small read-only snapshot from the project's existing local data, with exact original references. If unavailable, use prominently labeled illustrative fixtures and fictitious entities. No network calls to SICAP are required. Never combine synthetic transaction rows with authentic totals without explicit labels. Existing Romania geometry can be embedded with its existing attribution retained; this is a private design prototype.

One self-contained deliverable at `mockups/cinecastiga-v1.html`, opening directly in a browser with no build step. Supporting source fragments may be kept in `mockups/src` for maintenance, but the delivered HTML embeds all styles, behavior and data. Existing application files remain unchanged.

The scope is a functional visual prototype, not a release of the redesigned production app or a full reimplementation of the existing query engine. Unsupported backend-dependent actions must be explained clearly in context.

## Acceptance

Check desktop and mobile visual composition; search and no-results recovery; county/category filtering; aggregates against matching rows; entity and evidence navigation; source URLs; keyboard/focus handling; create/save/note/export/reload; URL restoration; responsive layout with no horizontal overflow. Document remaining limitations and retain before-code design notes.
