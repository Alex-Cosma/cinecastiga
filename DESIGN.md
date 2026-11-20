---
name: "cinecâștigă?"
description: "The existing forest-green and ivory procurement investigation interface."
colors:
  paper: "#f7f8f2"
  surface: "#fffefa"
  sunk: "#edf0e5"
  ink: "#243a30"
  ink-secondary: "#3f5043"
  muted: "#6c746b"
  line: "#dfe3d8"
  line-strong: "#cbd4c3"
  accent: "#204c3c"
  accent-ink: "#173e2e"
  accent-soft: "#e6eddd"
  accent-line: "#b8c9a8"
  on-accent: "#fffefa"
  orange: "#c7522d"
  risk: "#c0311c"
  risk-soft: "#fbe4df"
  amber-soft: "#fbefd6"
  dark-paper: "#111d18"
  dark-surface: "#18271f"
  dark-sunk: "#203328"
  dark-ink: "#e7eddf"
  dark-ink-secondary: "#ccd8c4"
  dark-muted: "#a5b39e"
  dark-line: "#314437"
  dark-line-strong: "#456047"
  dark-accent: "#c0d8ad"
  dark-accent-ink: "#d1e6bf"
  dark-accent-soft: "#263e2b"
  dark-accent-line: "#526c47"
  dark-on-accent: "#18271f"
  dark-orange: "#ec9672"
  dark-risk: "#ff8a75"
  dark-risk-soft: "#3a1b16"
  dark-amber-soft: "#382a10"
typography:
  display:
    fontFamily: "Bricolage Grotesque, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "clamp(48px, 5vw, 70px)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-3.1px"
  headline:
    fontFamily: "Bricolage Grotesque, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "36px"
    lineHeight: 1.15
    letterSpacing: "-.025em"
  title:
    fontFamily: "Bricolage Grotesque, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "24px"
    lineHeight: 1.15
    letterSpacing: "-.02em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  technical:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    lineHeight: 1.7
rounded:
  message: "6px"
  monitoring-control: "7px"
  workspace-control: "8px"
  surface: "10px"
  discovery-card: "13px"
  large-surface: "15px"
spacing:
  control-gap: "8px"
  field-gap: "12px"
  row-gap: "16px"
  section-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.monitoring-control}"
    padding: "11px 18px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-accent}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.monitoring-control}"
    padding: "9px 15px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.message}"
    padding: "11px 12px"
  status-chip:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    padding: "3px 9px"
  evidence-panel:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.workspace-control}"
    padding: "16px 18px"
---

# Design System: cinecâștigă?

## Overview

The incumbent interface uses forest-green text and actions on ivory paper, with Bricolage headings and IBM Plex reading text. Open sections, thin separators, direct source links, and preserved-evidence panels give procurement records a clear reading order.

This records the built system rather than a new brand proposal. Color and font values come from the cascade of `globals.css` followed by `approved.css`; the latter supplies the approved forest/ivory overrides. Component examples come from the investigation workspace and monitoring extension. No creative metaphor or new palette was introduced.

Sources: [approved.css](apps/web/app/approved.css), [globals.css](apps/web/app/globals.css), [font loading](apps/web/app/layout.tsx), [workspace.css](apps/web/app/anchete/workspace.css), and [monitoring.css](apps/web/app/urmariri/monitoring.css). The frontmatter records existing reusable values; CSS remains the implementation authority when this record and a later build differ. The sidecar at [.impeccable/design.json](.impeccable/design.json) provides the extracted component examples and behavior tokens.

## Colors

The palette uses one primary forest accent and neutral paper/surface layers. Orange is an incumbent identity/detail accent, not a second monitoring action color. The favicon (owner, 14 November 2026, variant A of six) carries the identity in the browser tab: an ivory (`on-accent`) question mark on the forest `accent` square, its dot in `dark-orange` so it reads on the green, as the orange "?" of the wordmark does on paper (`apps/web/app/icon.svg`; `favicon.ico` at 16/32/48 and the 180 px `apple-icon.png`, a full square that iOS rounds, are drawn from it). Risk text and amber cautions convey exceptional conditions together with explicit wording.

Paper supplies the page ground; surface supplies form and control backgrounds; sunk separates scope summaries and preserved evidence. Ink and ink-secondary handle reading text, while muted is reserved for supporting labels and dates. Line and line-strong separate sections and controls. In CSS these names are `--ink2` (ink-secondary), `--line2` (line-strong) and `--mono` (IBM Plex Mono); there is no `--ink-secondary`, `--line-strong` or `--font-ibm-plex-mono` variable, so a rule that names one renders wrong (audit, 20 November 2026). Accent-soft supports quiet state and after-version surfaces without overpowering source content.

Dark-prefixed frontmatter values are the existing dark-theme overrides of the corresponding light roles. The app honors system color scheme and an explicit light/dark preference. Components reference theme variables so contrast roles follow the active theme.

## Typography

Display and section headings use Bricolage Grotesque; body copy and actions use IBM Plex Sans; optional technical records use IBM Plex Mono. Latin and Latin Extended subsets support Romanian content. The font declarations and fallbacks remain shared.

The display role describes the discovery headline; it is not a required size for tool pages. Investigation headings use the recorded headline role. The private space's list pages share a 36px headline (30px on phones); watch titles and sections use the recorded headline and title roles. Body text retains a comfortable reading line height. Metadata may be smaller but cannot replace the readable source values or main explanation. On phones (≤700px) no text goes below 12px, except all-caps labels at 11px; figure captions and the map readout are 13px and search fields 16px (owner, 1 November 2026). Numeric comparisons use tabular numerals and preserve exact values.

**Amounts (owner, 20 November 2026, decision A).** A record's amount and any sum read to the leu; the exact amount with bani opens from a dotted line in the site's floating explanation (`components/Lei.tsx`), never as a second figure beside it. Counts take „de” from 20 through `roCount`/`countWords`, never by hand.

## Layout

The shared application shell has an approved maximum width of 1256px. The private space (investigations, follows, account) uses a 1120px content maximum (since 7 November 2026; monitoring used 1050px before). These are existing surface choices, not a rule that every future route must use the same width.

Open sections and record rows are the normal tool structure. Scope, form, and preserved-evidence surfaces provide local grouping. The header's mobile arrangement changes below 700px; workspace and monitoring split layouts collapse below 760px. The page never scrolls sideways, and neither does a table inside it: on phones a long table becomes cards or a list (owner rule, 20 November 2026: no horizontal scrollbars; the Radiografie lot matrix is a list per supplier there). Reading order and action order remain meaningful when columns stack.

## Elevation & Depth

Investigation and monitoring surfaces are flat and use tonal layering with thin boundaries. Discovery cards and search overlays use the existing soft shadow vocabulary where elevation communicates hover or an overlay. This record does not impose a global ban on shadows or on the incumbent navigation underline.

The exact light and dark shadow values, motion timings, and responsive boundaries are carried in the sidecar rather than invented frontmatter token groups.

## Shapes

Corners are gently rounded. Compact fields/messages, controls, larger surfaces, and discovery cards use the recorded existing sizes. Thin borders define controls and separate record sections; the active navigation underline remains a distinct incumbent convention. Native checkboxes, selects, and disclosure triangles keep familiar operation. Do not reproduce decorative labels or isolated text glyphs as a required design motif.

## Components

**Buttons.** Filled accent buttons identify the immediate committing action; surface buttons carry secondary actions. Monitoring uses a 44px primary minimum height and a 42px secondary minimum. The investigation workspace has the same family with 8px corners. Hover changes the surface/border or primary fill, never the position or the size: nothing lifts, turns or grows under the mouse (owner, 16 November 2026). A press scales a button or a chip to .97 over `--t-press` (100ms) and returns over `--fast`; on a phone the tap shows it. Disabled controls visibly reduce emphasis and cannot fire actions.

**Inputs.** Fields use a surface background, ink text, a thin line-strong border, and a visible label. Focus remains explicit. The workspace and monitoring focus treatment is a 2px accent outline with a 4px offset; the shared application also defines an orange focus treatment. Preserve the appropriate visible treatment rather than removing it. Login and account fields (7 November 2026) rest on a border of at least 3:1 and take the site's orange focus ring; their errors are announced and tied to the field. A focused element always stops below the opaque sticky header (`:focus { scroll-margin-top }` in `globals.css`), so a page's own `scroll-margin-top` keeps serving its anchors.

**Explanations (?) (14 November 2026).** A bare "?" (`<Term tip>`) shows its explanation on hover, keyboard focus or a tap, never in the page flow. It is placed from the "?" itself, in the top layer (a manual popover), so no window, sticky bar or clipping box moves or hides it: above the "?" or below when the screen's top or the sticky header would cut it, as wide as its text up to 360px, 16px inside the screen's sides, scrolling inside when taller than the room. Pages do not position it themselves. A tap elsewhere or Escape closes it. A large target that carries its own explanation (a tag, a pill, a dotted word: `<Term hold="box">` or `hold="line"`) waits `--hold` (1s) under a resting mouse while its outline closes round it (a box) or its dotted line turns solid from the middle out (a word), then opens it; a mouse that leaves early runs the trace back in 200ms. A tap, keyboard focus and the small "?" open at once. A button one means to press never draws a trace: its explanation waits the same second without one. The explanation comes out of its "?" (140ms, `--ease`, 4px from that side) and goes back toward it (90ms, `--ease-exit`); reduced motion keeps only the opacity (owner, 16 November 2026). A tag or mark never explains itself only by a native `title` (a phone never shows it): it is a `Term` with `hold="box"` (a tag) or `hold="line"` (words), as on the entity's records table (component audit, 20 November 2026). Every floating card on the site (a (?)'s explanation, a chart's, map's or table's hover card, the tour's example) uses this one frame and title, „Fișă”: `--surface`, 1px `--line2`, radius 10px, `--shadow2`, 13px body text, the title a 12px mono uppercase label in `--accent` over a thin rule (`.tipcard`/`.tipcard-t` in `app/guide.css`; each card's own stylesheet keeps only its place; owner, 20 November 2026). Arrows: „→” for any page of the site, „↗” only for a page outside it, opened in a new tab (owner decision B, 20 November 2026).

**Fine print behind an "i" (owner, 17 November 2026).** Sentences under charts, lists and headings crowd the page. A sentence that restates what the chart, rows or heading next to it already show is deleted. A sentence that carries something not visible elsewhere on the page (a caveat, what a figure counts, a method note, a source) but need not be read every time moves into `<InfoMark title text>` (`components/InfoMark.tsx`): a quiet 24 px "i" whose box opens like a (?) on hover, focus or a tap; its dot hops once while pointed at or open (none with reduced motion). At most a few words stay visible beside it ("scară logaritmică ⓘ"). What stays on the page: the lead sentence that states the answer, empty states, errors, form hints needed to act, a chart's legend, units. Never an InfoMark inside a link, a button or a summary; inside a card that is one stretched link it sits above the link. No (?) or InfoMark inside another one's box. The map's sources use the same idea with their own mark (three layers that part).

**Esențial and Complet (owner, 18 November 2026).** The site can be seen in two ways, chosen at the end of the welcome tour or from the header switch beside the theme button, and kept in the browser (`lib/view-mode.ts`). *Complet* is the whole site. *Esențial* shows, on each page, what answers the page's one question, what the answer rests on (the records, the link to SEAP) and one way onward. A new reader starts in Esențial; whoever skipped the tour is asked once, in a small box under the switch; a reader who signs in is moved to Complet once per device. What Esențial removes: second charts, secondary selects and view switches, exports, method notes, peer comparisons and every score („N din 100”, percentiles, rankings by score): risk is said in words, the signal names with their explanation and one „pistă, nu dovadă”. What it never removes: who bought and who won, the amount with „nu e plată”, the date, the link to the source, a warning attached to a number that stays, empty states and errors, the filters in table column heads, the click-on-a-word editing of a question in Întreabă and of the subject and place on /cauta, the map's filters, and a signed-in reader's tools (save, follow). The private space is the same in both modes. Nothing inside a page says that something is hidden: only the switch brings it back. A page that belongs to Complet (an entity's Radiografie, Legături and Comparații, Atribuiri TED, the ranking by score, the method lanes of the guide, the risk clouds of Întreabă) has no links to it in Esențial; opened from a link someone sent, it shows whole, with one line on top saying where it belongs (`components/mode/CompletOnly.tsx`). The mode is a mark on `<html>` and CSS does the hiding: `data-only="complet"` on what exists only there, `data-only="esential"` on the short form that replaces it, `data-whole` round a Complet page; layout that a mark cannot express lives in `components/mode/esential-<zone>.css`. The mode is never read in React: the HTML is the same for every reader, the cache and a crawler. A hidden control that arrives set from a shared link shows while it is not at its default, so a filtered page says so. The switch is one transition (`components/mode/mode-engine.ts`): what leaves fades where it stood, what stays glides to its new place, what returns fades in after the rest has made room, and the block the reader was looking at keeps its place on the screen; with reduced motion, at once.

**Navigation.** The shared header and private-workspace destination links retain the approved typography and active underline. Active state is exposed semantically as well as visually. Responsive navigation changes arrangement rather than inventing a separate mobile identity.

**Administration (owner, 7 November 2026).** An Operate surface: sticky tabs (Acum, Trafic SEAP, Procesare, Fișiere, Oameni), the page name as h1, one form and one committing button per task. The collector's band is the one dark surface: only a healthy run is forest green; waits and pauses are grey-green, maintenance dark amber, a SEAP refusal brown, silence neutral grey, and each state also has its own dot and words (`app/admin/navigation.css`, `--band-*`). A command's outcome floats under the tabs and never moves the page. Gaps that the next runs will fill are information, not alarms.

**Private space (owner, 7 November 2026).** Investigations, follows and the account are three tabs of one place (`components/private/PrivateTrail.tsx`: Anchetele mele · Urmăriri · Contul meu) at one width (`.private-shell`, 1120px) and one h1 scale (36px, 30px on phones). "Dosar" names the container, "anchetă" the activity. Dates are dd.mm.yyyy, with the time only where it matters (captures, checks, revisions). A preserved-evidence sheet reads like a record page: its subject as title, the capture's facts, rows that stack on phones, "Copiază citarea". Since the UX audit (owner, 16 November 2026): the avatar opens a small menu of the three tabs, with what waits beside each ("1 invitație", "N de verificat"); the dot by "Anchete" shows only while something waits. Every saved item is named by what it is (a question by its sentence, an acquisition or a notice by its object, the SEAP code beside its kind), never by an internal id. An evidence card is compact: kind, state and day on one row, the name, one line of facts, the note; the citation sits in its "⋯" menu. A dossier, sheet or follow that does not exist or is not shared answers 404 inside the private space, with the same sentence for both.

**Save to an investigation.** "Salvează în anchetă" opens a labelled dialog at the end of the page, never clipped by its container: under or above its button on a wide screen, over the page when neither side has room, a bottom sheet on phones (≤700px). It says what it saves, lists every dossier with its full title and marks the ones that already hold it; there the action becomes a new version of that evidence, never a duplicate (`components/clip-button.css`). Since 16 November 2026 the button of an item already saved reads "Salvată · N dosare"; after a save the dialog says where it went and whether its sources are kept, and the saved item's box closes its outline once; with no dossier yet it offers "Primul tău dosar" with the item's name already written. A question is kept with "Păstrează" (a star); the bookmark stays for "Salvează în anchetă".

**„Pe scurt” on /cauta (owner, 10 November 2026).** One line beside the title says what was counted, in the chips' words. The rows the question asked for share one grid (subgrid), each value on its row's first line; on phones every row puts its value first and its name or title on the full width. The rows lead after a question about them (largest purchases, „cine…”); the total sits on the right on wide screens. Bars only where magnitude is the answer (years, the two sides of a comparison), in `--bar` on `--line`, partial years hatched. Names and titles are ink with a soft underline. How it was counted folds into one disclosure; no filled button inside the card. In „Am înțeles” the subject's word opens what it counts (owner, 16 November 2026): the CPV domains of the subject, each with its code, its value and records in the selection (asked when the menu first opens, „…” until then) and a thin bar of its share; one domain can be kept alone, which narrows only „Pe scurt” and is said in one line with the way back, and under them the curated subjects inside it or beside it. The menu never tells the reader the word „is not a subject”: „Caută exact ce ai scris” on the same row is that way out, and a word with nothing to list is plain text. On a phone the menu is a sheet from the bottom. The place's word opens the same window (owner, 17 November 2026): a field to search another place first, then the places around (a county's largest localities and the counties beside it; a locality's whole county and its other localities), and the way out to the whole country last. What is typed replaces the suggestions; a word of the sentence never opens a menu whose only row takes the word away.

**Prețuri pe unitate (owner, 11 November 2026; administrators only until the data is complete).** An Operate list over one shared axis, every year by default (each buyer against the median of its own year, so a lead is an institution in a year): each product and pack is a strip of its buyers on log2 of "times the median" (about a third at the left edge, eight times at the right), so every strip reads the same way. The median is a 2px forest rule, twice the median a dashed risk rule; eight buyers in ten sit in an `--accent-line` band outlined in `--pr-edge` (the accent mixed toward its line), the middle half in a solid `--accent` band. A lead („peste dublu”) is the mart's flag, never the multiple alone: at least twice the year's median, in at least two awards, at least 500 lei above the median, in a product with at least 20 institutions that year (`LEAD_RULE`; „Cum am comparat” states it). Every lead is a 1px risk tick under the band; the largest by lei above the median are solid risk dots (at most 14 on a strip of the list, 40 on the product page) and the legend says so („cele mai mari 40 din 195”); the largest is named in risk text and carries a ring. Marks are never faded: each reads at 3:1 or more on paper, on the hovered row and on the opened row (dots keep a halo of the row's own background, `--pr-bg`, so neighbours stay apart; the pale band and the histogram are carried by their `--pr-edge` outline). A lead past eight times is an open ring on the edge, its tag keeping the true multiple. A named lead's name may shorten, never its multiple; the tag stays inside the strip and sits on the row's background so the rules do not strike through it. A legend sits above the axis row, which is sticky under the header. A strip is a `<details>` (one open at a time) whose summary is the whole row; the pressed strip stays where it was pressed (the page is scrolled back by what closing another moved). It opens into its five largest leads, loaded then (`/api/preturi/piste`) behind ghost rows of the same shape, with one line above them („Cele mai mari 5 din 28, după lei peste mediană. Piste, nu dovezi.”) and a retry on failure; each row has its own „Liniile” beside the institution's name. A strip with fewer than 20 institutions in every year shown says „prea puține instituții pentru piste” in place of a count. Amber chips, never a different colour of strip, mark what else can explain a price: „mărci diferite” (more than a tenth of the comparisons at twice the median) and „sezon” (fresh vegetables and fruit, compared with the whole year's median), each with a caution when opened. Under a county or a year, products without a lead fold behind one line („47 de produse fără prețuri peste dublu în Cluj”). Filters are a real GET form of standard controls plus one typeahead over the site's own product groups (not CPV), which opens on typing, a click or ArrowDown; without JavaScript the typeahead becomes two selects and a button. The product page draws every buyer as a column histogram over the same strip, with the legend under it. Pointing at a dot shows its lead in a surface card (name, county, price per unit, the multiple in the owner's words, quantity, awards, lei above the median, „Pistă, nu dovadă”); a click opens that institution's lines on the product page, its row first, open and focused. On the product page the dots are one Tab stop: arrows move along the axis, Escape closes the card; a touch shows the card first and opens on the second, and a touch elsewhere on the strip reads the axis (price, multiple, and how many institutions bought at about that price). On the list the strip is one image and its dots answer the mouse only. The product page's buyers are a table with the app's header sort (▾/▴, aria-sort) and column funnels (lib/price-columns.ts, `/api/preturi/cumparatori`); from 1100 px down it becomes cards with the headers as pills and keeps its table roles, so it never scrolls sideways. „Liniile” is a link to the row opened (`deschis`), a toggle in place with JavaScript. With no lead the table shows every institution. Under 900 px, or with a coarse pointer, every control is at least 44 px tall. On phones the filters stack (group or product first), the name and count share a row, the strip takes the full width below and the named lead is on a line under it. Prices per unit are Plex Mono with tabular numerals; the multiple is Bricolage in risk. Words: values are contracted („a cumpărat”, „a contractat”), never paid.

**Întreabă: the answer's title (owner, 16 November 2026).** Beside an answer the question is said once: the answer's title is the builder's sentence, and its words are the controls. A word opens its window and the choice applies at once; there is no row of pills, no second sentence and no "Vezi răspunsul" there. Under the title sit one presentation line ("Arată primele 10, după…"), the conditions already set as chips with "×", and what only a pill used to say. "Schimbă întrebarea" opens the models and the "+" invitations under the title. An institution's or firm's name in the title opens its window; the arrow after it goes to its page. The empty page keeps the builder with its draft and its button.

**Status chips.** Small accent-soft labels communicate source-change or review state with text. Color is reinforcement, not the only cue.

**Preserved evidence.** A sunk panel separates the frozen record action from live comparison links. Clear source counts and “before” / “after” wording identify what will open. This is a signature investigative component already present in the Batch 2 workspace and extended by monitoring.

**Motion and feedback.** Motion explains a change; it never decorates or delays reading. Controls change state over `--fast` (160ms); a hover or state colour is never timed by hand. Content never waits for the scroll (owner, 16 November 2026): sections, tables, cards and lists are there at first paint, so a capture or a print of the whole page shows every section; only the page title, when it is on screen as the page opens, rises in with the shared reveal (opacity and a 10px rise over `--slow`, 420ms), and not after back/forward (`app/Reveal.tsx`). Moving to another page cross-fades the content (out 150ms, in 210ms, no slide; owner, 6 November 2026) with the sticky header anchored, the root at the same timings; two things travel over that cross-fade, forward only (owner, 16 November 2026): the current tab's underline in the main menu and in the private space slides to the tab clicked (`--med`, 260ms), and an institution's or firm's name clicked in a list moves into its page's title (300ms, `components/motion/name-travel.ts`); Back, a new tab and reduced motion keep the plain swap; filters and pages of a list on the same page, browser Back/Forward and reduced motion swap without it (`app/template.tsx`, `components/motion/PageTransition.tsx`). Monitoring source entries use a brief opacity/movement transition; reduced-motion styles remove it and the monitoring button transitions. Loading, errors, and success are readable text states, using semantic status/alert markup where implemented. A copy or a save says its success on the pressed button itself ("✓ Copiat", "Salvat", 1.6s, read out by a live region), not in a toast; failures keep their own words. A loading status shown over content that is already on screen never moves the page: its words float under the sticky header (`.ask-loader`, `FloatStatus`) and the stale answer stays in place, dimmed. The one sign of work (owner, 16 November 2026) is a 2px line (`components/motion/WorkLine.tsx`): after 150ms a piece runs along it while the request is open, it fills and fades when the answer is in and disappears at once on an error; it sits under Întreabă's answer head, under a search field, along the bottom of /harta's map. No bars, no spinner; a ghost beside an error stops pulsing. No class or id starts like an ad slot (`ad-`, `ads-`, `advert`, `sponsor`): ad blockers hide such elements on every site, which emptied the direct-acquisition page for their users until 1 November 2026; `app/adblock-names.test.ts` guards it. Component snippets retain keyboard focus and reduced-motion behavior.

**The outline family and what moves in place (owner, 16 November 2026; `components/motion`).** One drawn line says four things, never two at once on the same thing. *Holding*: the trace round a target whose explanation waits (see Explanations). *Chosen*: a selection draws its outline once when the reader makes it, never on hover (/harta's opened county in the camera's time, a UAT, the cloud's dot, a radiography supplier, the row found by "Unde e…?"); leaving runs it back in 200ms. *Arrived*: where a link or an action lands, the target's outline draws once the scroll stops (600ms, stays 900ms, fades 400ms); a new arrival cancels the running one. *At work*: a save longer than 300ms turns a piece of outline round its button and closes it when done. Beside them: every window, menu, list and sheet comes in over 200ms (opacity and 4px from its anchor's side) and leaves over 140ms with `--ease-exit`, a phone's sheet 24px from the bottom in 260/180ms; a leaving window takes no clicks and focus returns at once (`windows.css`, `leave.ts`). A folded section's content comes out under its title over 180ms and folds at once; height is never animated. The chosen option's fill in a segmented control and an entity's section underline slide to the option chosen (`--med`, transform only). The theme changes in one 220ms dissolve of the whole page. A filter chip enters over `--fast`, leaves in 120ms and its neighbours slide into the room (200ms). Rows added under a list ("Arată încă…") rise 6px and fade in over 220ms, the first one marked in `--accent-soft` where the focus went; a page, a sort or a filter still replaces rows at once. Scroll-linked marks (the methodology's reading line, the entity's name in its sticky bar) follow the scroll itself, never a timer. Layout properties are not animated: movement is transform and opacity. With reduced motion nothing moves on hover, press or selection, windows only fade (120/90ms), scrolls the page starts go at once, and the colour marks that carry information stay.

**Loading: ghosts (owner, 6 November 2026, "ghost data loading").** While content loads, its place keeps the content's shape, so nothing moves when the data arrives. A ghost (`components/ghost`) is the real component's element with its real classes; text is drawn as lines exactly one line-height tall inside the real headings and paragraphs (`G.Line`), with extra lines only where the real text wraps more on phones or less on the wide layouts; known text stays real (page and section titles, labels, a name known from the click); charts show a fixed decorative profile inside the real chart's frame, never data; lists draw their page size. Bars use `--line` and pulse gently; reduced motion removes the pulse and fades but keeps the waits. Three cases: (1) a client fetch inside a page (panels, tables, explorers, answers) shows its ghost only after 120ms, so a quick answer never flashes it; (2) a filter, sort, page or year for the same subject keeps the old answer in place, dimmed (`.g-stale`, after 250ms), with the floating status (`FloatStatus`, after 150ms); a ghost replaces it only when the subject or the view's shape changes; (3) a route ghost (`loading.tsx`) exists only on routes slower than about 0.25s in production (/domenii, /supra-prag, /contracte/[nid], an entity's Radiografie and signals page), because React keeps any route ghost at least 300ms and would make a fast page slower; a click to a fast page shows "Se deschide…" under the header after 150ms instead (`NavPending`). A route ghost's layout answers redirects and 404s before anything streams. One status is read out per ghost; nothing inside a ghost is focusable.

**Risk cloud (owner, 15 November 2026, variant 1 of three mockups).** The /intreaba scatter puts the scored profiles (10–100) in a field and the ones without a signal in the score (under 10, most of any group) in a strip under it, so the least telling group is never the heaviest mark. Above 2,000 profiles the field is small cells in one sequential green ramp (`color-mix` of `--accent` into `--paper`, five steps whose bounds come from the cells' counts and are written in the legend; more is darker, lighter on the dark theme), the strip a histogram by value in `--accent-line`; a chosen signal repaints its cells on the same grid in an orange ramp. The density layer is a field, not a set of marks: its palest step reads under 3:1, the listed dots (forest, surface ring) carry the exact profiles. Bands stay faint fills with lines at 40 and 68; their words sit in the right margin beside a rail in the pill colours (inside the plot on a phone). Axis labels are the bands' edges (0 · 10 · 40 · 68 · 100). Names on the chart have their own class (`.sc-label`, 11.5px/600), are measured in that font and stay inside the plot. On a phone the strip's signal is one native menu and no chart text is under 12px.

**Charts in motion (owner, 6 November 2026).** A chart's first appearance shows where its values come from: magnitudes grow from their baseline (bars and columns; a stacked bar as one piece; flows from source to destination), while positions (dots, markers, map fills) appear where they are and never travel through values they do not have. Reference marks (axes, grid, ceilings, medians, group bands) are present first and the subject's own mark comes last, with no pulse. An entrance runs over `--slow` with `--ease`, staggered in reading order by at most 240ms in total (160ms on phones), once per page view when the chart first enters the viewport (`[data-chart]`, gated by `app/Reveal.tsx`); it does not replay on back/forward navigation. When data changes for the same subject (filter, measure, group, period), marks tween from old to new values over `--med` (260ms), keyed by entity; ranked rows take their new order at once rather than sliding, and a new sort is seen in its column (its cells take `--accent-soft`, fading over 700ms, while the one sort arrow turns over `--fast`); maps fill all their areas together, never ordered by value; a different subject (another entity, UAT or question) enters anew instead of morphing. Going down or up a level of the same question is a camera, not a new subject (owner, 16 November 2026): in "Ce se cumpără" and on /domenii the chosen part widens until it is the whole (260ms at pace 1, transform), then its parts and the legend appear; back up, the whole comes out of the part it was. Text never moves: numbers, labels, axes, legends and tables are final at first paint and nothing counts up, so a screenshot or print at any instant contains only values from the data. A figure that changed for the same subject (a filter, a year) is marked, not counted: `--accent-soft` behind it for 900ms, never on first draw, and not at all when more than six change together. The two sides of a comparison move together. Above about 300 marks the group animates, not its members. Nothing loops and interaction is never blocked. With reduced motion, and in print, every chart is drawn in its final state. Bars are revealed with clip-path (`components/motion/chart-motion.css`), never scaled. The /harta camera move (560ms; a transform of the map's whole drawing under its final viewBox, never an animated viewBox or grid; `app/harta/camera.ts`) and the methodology's illustrated steps are the two places where longer, staged motion is allowed. Every chart duration, delay and stagger above is at pace 1 and is multiplied by `--chart-pace` (owner, 7 November 2026: 1.5), the camera move included; hover feedback, panels and the methodology's story are not.

## Do's and Don'ts

### Do

- Do reuse the approved theme variables and shared font families.
- Do keep record/source text and numeric comparisons readable at desktop and mobile widths.
- Do use filled primary actions for the immediate committing step and surface buttons for secondary actions.
- Do preserve visible focus, semantic state labels, and reduced-motion support.

### Don't

- Don't turn a task-specific width, decorative page label, or glyph mark into a global design requirement.
- Don't replace actual source content with decorative statistics, invented evidence, or ornamental dashboards.
- Don't use color alone to distinguish before/after, errors, or selected state.
- Don't modify the shared identity as a side effect of adding a workflow.
- Don't animate a value through numbers it does not have (count-up, a marker sliding in from zero) or order an entrance by value.
- Don't collapse a loaded area to a loading line, or give a fast route a route ghost.

Not canonized: older discovery kickers, isolated glyph decoration, and differences between historical base CSS tokens and the approved overriding palette. These are not a new design vocabulary or an authorization to redesign existing pages. Batch-specific workflow and review details remain in [batch3-design.md](docs/implementation/batch3-design.md).
