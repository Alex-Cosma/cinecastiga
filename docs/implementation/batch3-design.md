# Batch 3: monitoring design extension

## Overview

This records the implemented monitoring extension to cinecâștigă, not a new visual identity. The approved forest-green and ivory system remains the authority: [approved.css](../../apps/web/app/approved.css), [globals.css](../../apps/web/app/globals.css), the font declarations in [layout.tsx](../../apps/web/app/layout.tsx), and the investigation patterns in [workspace.css](../../apps/web/app/anchete/workspace.css). The extension lives in [monitoring.css](../../apps/web/app/urmariri/monitoring.css). At the finish review's request, the previously absent [PRODUCT.md](../../PRODUCT.md), [DESIGN.md](../../DESIGN.md), and [design sidecar](../../.impeccable/design.json) now persist the evidenced incumbent context. No prior context file was overwritten and no new identity was introduced.

The user's priorities are exact sources and understandable Romanian watchdog actions. The implemented sequence is: follow the current question or source selection, establish a quiet reference version, inspect changes, open the original records, and preserve both versions in a private investigation. Language distinguishes a changed selection, a correction, an older record observed later, and a changed methodology. None is presented as proof of wrongdoing or payment.

The bounded documentation pass compared Batch 2's [desktop workspace](previews/batch2/workspace-desktop.png) and [mobile evidence](previews/batch2/evidence-mobile.png) against Batch 3's [desktop inbox](previews/batch3/review-inbox-desktop.png), [mobile changes](previews/batch3/review-change-mobile.png), [dark mobile setup](previews/batch3/review-setup-mobile-dark.png), and [desktop investigation](previews/batch3/final-case-desktop.png). A single confirmation pass inspected the corrected inbox/setup/change captures and the [contracts-only, selected-year scope](previews/batch3/review-selection-mobile.png). The shared navigation, typography, paper background, thin separators, modest corners, and source-preservation surfaces are consistent across those artifacts. This is an extension record; CSS remains the source of truth for tokens.

## Colors

Monitoring defines no replacement palette. These existing custom properties supply the reusable color roles; both themes come from the incumbent stylesheets.

| Existing token | Light | Dark | Observed use |
| --- | --- | --- | --- |
| `--paper` | `#f7f8f2` | `#111d18` | Page background |
| `--surface` | `#fffefa` | `#18271f` | Forms, buttons, before-version cells |
| `--sunk` | `#edf0e5` | `#203328` | Scope and total summaries |
| `--ink` | `#243a30` | `#e7eddf` | Headings and main text |
| `--ink2` | `#3f5043` | `#ccd8c4` | Explanations |
| `--muted` | `#6c746b` | `#a5b39e` | Dates, labels, secondary text |
| `--line` | `#dfe3d8` | `#314437` | Record and section separators |
| `--line2` | `#cbd4c3` | `#456047` | Control borders and comparison delimiters |
| `--accent` | `#204c3c` | `#c0d8ad` | Main actions, links, selected navigation, focus |
| `--accent-ink` | `#173e2e` | `#d1e6bf` | Text in green status surfaces |
| `--accent-soft` | `#e6eddd` | `#263e2b` | After-version cells and preserved/success states |
| `--accent-line` | `#b8c9a8` | `#526c47` | Hover and grouped-condition boundaries |
| `--on-accent` | `#fffefa` | `#18271f` | Text on filled primary actions |
| `--amber-soft` | `#fbefd6` | `#382a10` | Failed or incomplete refresh cautions |
| `--risk` | `#c0311c` | `#ff8a75` | Error text |
| `--risk-soft` | `#fbe4df` | `#3a1b16` | Error message background |

Color reinforces visible labels. “Înainte” and “După”, failure text, selected navigation semantics, and reviewed-state copy carry the meaning independently of tint. Dark mode inherits the existing automatic/manual theme behavior rather than defining a separate monitoring theme.

## Typography

The extension reuses **Bricolage Grotesque** through `--display`, **IBM Plex Sans** through `--body`, and **IBM Plex Mono** through `--mono`. Font loading and Romanian character subsets remain shared with the application.

The monitoring body is 15px with a 1.6 line height, matching the investigation workspace. Main headings use `clamp(34px, 4vw, 52px)`; watch titles use `clamp(30px, 3vw, 42px)`. Section headings are 24px, record titles 20px, and controls/source links 13px. Text explanations generally stop at 70–85 characters of measure rather than spanning the full desktop width. Exact monetary values use tabular numerals and retain stored decimal precision. Technical JSON uses the mono face only inside optional disclosures.

Small uppercase page labels and glyph marks remain in older incumbent surfaces. Monitoring's new heading kickers and standalone empty-state glyph were removed during the bounded finish corrections; useful privacy, paused, and reference-version information remains ordinary metadata. Older decorative details are not promoted to requirements for future pages.

## Layout

The monitoring content has a 1050px maximum width within the existing application shell; the investigation workspace keeps its 1120px maximum. Both use open vertical sections and thin record separators. The inbox presents a title, actionable data-status notice, tabs, then update rows. It does not introduce a second dashboard shell.

Setup places the scope first in document order. On desktop it uses a `1.1fr 1fr` grid with a 48px gap; at 760px and below it becomes one column with a 20px gap. Optional alert preferences sit inside a disclosure. The primary action remains after the name and preferences so the scope is visible before committing.

Before/after amounts use two columns on wider screens and stack below 400px. Changed fields become labeled before/after cells below 760px. Larger result and source tables retain contained horizontal scrolling, keyboard-focusable regions, and a mobile scrolling hint where implemented. The whole page must not scroll sideways: [final-browser-checks.json](previews/batch3/final-browser-checks.json) reports matching viewport/document widths at 1440px and 390px and verifies the mobile amount pair without horizontal scrolling.

## Elevation & Depth

Monitoring adds no box shadows. Paper, inset summaries, white form surfaces, and thin boundaries provide separation, consistent with the Batch 2 investigation workspace. Filled green is reserved for the immediate committing action; secondary actions use bordered surface buttons. Source changes remain part of the reading flow instead of opening another modal layer.

## Shapes

The extension uses observed local corner sizes of 6px for messages and inputs, 7px for buttons/scope summaries, and 8px for larger form/summary containers. These fit the incumbent workspace's 6–8px controls; they are not a new global radius scale. Native checkboxes, selects, and disclosures retain their familiar interaction shapes.

The detector's two side-border warnings referred to before/after comparison boundaries and grouped scope conditions. The implementation reduced these to 1px during the bounded finish corrections. The active-navigation underline remains because it matches the incumbent header/workspace navigation. Written labels still carry the meaning independently of those boundaries. The independent finish review accepted these corrections.

## Components

**Actions and navigation.** Romanian actions state the next step: “Începe urmărirea”, “Vezi modificările”, “Vezi sursele”, “Adaugă în anchetă”, and “Păstrează în anchetă”. Primary controls have a 44px minimum height; ordinary monitoring buttons have a 42px minimum height. The existing investigation navigation stays intact, with “Anchetele mele” / “Urmăriri” as the local destination choice. Links remain links; actions remain buttons.

**Scope and preferences.** The readable scope separates “Întrebarea de pornire”, “Perioada întrebării” / “Sursele întrebării”, additional grouped conditions, and the narrower source-list selection. An unrestricted base period says “Fără limite de an în filtrele de pornire”; it no longer implies that the final selection spans all years when later conditions restrict dates. Drawer stream, selected years, and other local restrictions are listed as applying together over the question. Grouped OR conditions remain explicit rather than being summarized as one invented date interval. Historical-profile scope is described separately from transactional datasets. The initial version is explicitly a reference, not an alert about every existing acquisition. Email opt-in explains local unavailability instead of offering an apparently operational delivery setting. It does not block in-application monitoring.

**Changes and source access.** Human-readable result fields precede optional complete JSON. A changed source record shows its code, parties, procurement date, observed date, exact before/after values, interpretation, and direct SEAP/TED links. Missing links are labeled. Full frozen source lists remain available beyond the changed records. In the investigation, “Sursele înainte” and “Sursele după” are separate links with their respective counts; the explanation distinguishes the change amount from either version's summed values.

**Source-copy actions.** “Adaugă în anchetă” opens the inline destination form; “Păstrează în anchetă” copies both frozen source versions and their change explanation into the selected or new investigation. The optional verification task is a separate checkbox. The success state links directly to the resulting evidence item. These actions preserve source records in the case; they are not clipboard-copy controls.

**Loading, empty, and failure states.** Loading has visible text with `role="status"`; request errors use `role="alert"` and a retry action. Session expiry supplies a sign-in route. A failed watch appears above the inbox so an empty update list cannot imply a successful check. The watch keeps the last successful version and names the failed attempt. Reviewed-empty and first-reference states explain why the list is empty. Refresh notices distinguish validation time from procurement and collection dates; “Cât de recente sunt sursele?” exposes the preserved source coverage. The artifact set includes failed-watch, reviewed-empty, confirmation, and frozen-source screens.

**Focus, reading order, and motion.** Monitoring inherits the workspace's visible 2px accent focus ring with a 4px offset. Forms have visible labels; grouped options use fieldsets/legends; active tabs expose `aria-current`; expandable controls expose their state. Saving into an investigation is inline, with cancellation returning focus to its trigger. Tables retain text headers and focusable overflow regions. This documents implemented affordances, not a claim of a full assistive-technology audit.

Button color/border transitions are 160ms, matching the investigation workspace. Newly rendered source-change sections have a 220ms opacity/4px movement entry. The monitoring `prefers-reduced-motion: reduce` rule removes that animation and its button transitions. The shared “follow” entry button outside this shell retains its short color transition; this pass makes no broader motion-compliance claim.

**Review evidence.** [browser-checks.json](previews/batch3/browser-checks.json) records pause/resume, retention of unsaved preferences, exact decimals, case before/after capture, task creation, reviewed inbox, quiet baseline, and denial of private-watch access to a case viewer. [final-browser-checks.json](previews/batch3/final-browser-checks.json) adds the responsive/source-order checks. The subsequent [review-confirmation.json](previews/batch3/review-confirmation.json) records nine corrected screens, separate base periods, preserved OR groups, contracts-only stream, selected years, 1px delimiters, and removal of the new kickers/empty glyph. All nine recorded document widths match their viewports, and the artifact reports no runtime errors. Those are preview-fixture results; they do not establish production procurement freshness or real email delivery.

## Do's and Don'ts

- Do continue the existing palette, shared fonts, restrained form language, and investigation navigation.
- Do keep the exact selection and source record one clear action away; retain precise amounts and the dates that explain them.
- Do distinguish observed change, older data, missing information, failed checks, and refreshed methodology in Romanian copy.
- Do preserve the two frozen source versions when evidence enters an investigation.
- Do keep optional technical data behind a plainly named disclosure.
- Don't infer a payment, cancellation, first-ever import, or wrongdoing solely from a delta.
- Don't turn this extension's widths, page labels, glyph marks, or individual borders into new global brand rules.
- Don't equate a successful validation timestamp with fresh or complete source collection.

Not canonized or repaired by this documentation pass: older incumbent page labels and isolated glyph decoration. The implementation pass removed those additions from monitoring and corrected its error background to the existing `--risk-soft` token. Product code remained owned by that implementation/review pass.

Finish-review status: **ship**. The independent [initial verdict](previews/batch3/finish-review-initial.md) requested bounded corrections to scope wording and new decorative details, plus durable product/design context. The [final verdict](previews/batch3/finish-review.md) confirms all three findings are resolved, with no correction regressions. The existing visual identity remains intact.
