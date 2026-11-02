---
target: fișa entității /entitati/[id]
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:~/Desktop/Personal/code/seap-integration-20261016/apps/web/app/entitati/[id]/page.tsx"
target_fingerprint: "sha256:ef60921d3e4c6ef5b132aac21677374a3ba5653ca3c6585145c352f63a89d971"
target_path: ~/Desktop/Personal/code/seap-integration-20261016/apps/web/app/entitati/[id]/page.tsx
timestamp: 2026-11-02T13-07-54Z
slug: apps-web-app-entitati-id-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser), isolated.

Target: /entitati/[id] (apps/web/app/entitati/[id]/page.tsx), authority 2146798 and supplier 2111643, 1280 and 390, light theme (dark briefly), local dev server, after the new top strip (34be776) and the tabs moved above it (0513221).

## Heuristics (Nielsen)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Table loading/filters announced; the partial year 2026 only as a faint label (2.8:1) and in the tip. |
| 2 | Match system / real world | 3 | Plain Romanian; big red "71%" reads as a probability; "Perioada calculului: 2022 · 2022:" repeats the year. |
| 3 | User control and freedom | 3 | "✕ scoate filtrele", Escape on the tip; the "an" panel closes only on mouseleave; "Arată excluse" switches the channel silently. |
| 4 | Consistency and standards | 2 | Records have three destinations (ledger → Ask, tab → in-page table, chart → nowhere); two pager styles; "Radiografie" twice. |
| 5 | Error prevention | 3 | Mostly read-only; filter side effects partly announced. |
| 6 | Recognition rather than recall | 2 | Chart legend a scroll away on phone; December mini-charts without a visible year; partner names cut at 220px at 1280. |
| 7 | Flexibility and efficiency | 2 | No keyboard sorting; chart years not drillable; 9 tab stops in the chart. |
| 8 | Aesthetic and minimalist design | 2 | Totals and top partner said three times, signals twice, full rule text in every card. |
| 9 | Error recovery | 3 | "Reîncearcă", "risc necalculat", ONRC notes. |
| 10 | Help and documentation | 3 | Many (?) and method links; the key caveat ("nu este o probabilitate de corupție") is the last collapsed block. |
| | Total | 26/40 | Acceptable |

## Design specificity

LLM: authored for this product with drift toward a generic dashboard. Specific: the ledger doubling as the chart legend, Romanian band words, honest copy (risc necalculat, parțial, ONRC caveats), SICAP links. Generic: two stacked summary cards (strip, "Pe scurt") then tall rule cards; the copy carries the identity more than the layout.

Detector: CLI scan of 8 markup files 0 findings (styles live in CSS). CDP: authority 27 at 1280 / 29 at 390 (19 non-advisory), supplier 17 (13 non-advisory). Both passes agree on: low contrast of the tab counts (2.7:1, globals.css:1392) and of the partial-year label (2.8:1, entity.css .is-partial); text under 12px (month labels 9.5px globals.css:540; .ask-srctag 10.5px). Detector also flagged "kicker-above-heading" on the role label above the name: likely a false positive (it carries the entity's role). No overlay: headless CDP scans.

## What's working

1. The ledger as legend: swatches explain the chart, each channel links to its records, tabular numbers, full-sentence names for every year.
2. Honest vocabulary and edge states: "risc necalculat", contracts above 1 bn listed apart, consortium tags, ONRC caveats, "(parțial)".
3. The transactions table's phone cards with sort pills; the chart's container-query short years.

## Priority issues

1. [P1] The year chart is a dead end and its tip covers the bar under inspection (EntityYears.tsx click only sets the tip; entity.css .ent-years-tip top:2px). Fix: click/Enter filters the table to that year and scrolls to it (or opens the year's drill, as the December mini-charts do), "Vezi înregistrările din 2021 →" in the tip, tip above the plot, one tab stop with arrow keys. Command: shape.
2. [P1] Print / Save as PDF blank under "Pe scurt": Reveal.tsx's .rv (opacity 0) has no print override. Fix: @media print { .rv { opacity:1; transform:none } }, or no reveal on data sections. Command: harden.
3. [P1] Same facts three times, records far down: totals (ledger, "Pe scurt"), CARNEX three times, signals twice; strip + "Pe scurt" 1,293px on phone; table at ~3,200px desktop / ~7 screens phone. Fix: "Pe scurt" keeps only the domain and "Ce a atribuit", drop "Cui a atribuit"; "Toate semnalele" as a compact index; rule text behind "cum se calculează". Command: distill.
4. [P1] Keyboard and screen reader: sortable headers are th onClick (TxTable.tsx:166-178) without button or aria-sort; SectionNav without nav landmark or aria-current (SectionNav.tsx:79-98); each (?) takes two tab stops. Command: harden.
5. [P2] Contrast and phone text under 12px: tab counts 2.7:1, partial year 2.8:1, risk points 4.2:1 (globals.css:263), "directă" tag 4.2:1; month labels 9.5px, source tags 10.5px, flag badges 11px. Fix: --muted / --amber-pill, 12px at ≤700px. Command: polish.

## Persona red flags

- Alex: chart years not drillable; ledger rows leave for Ask while the same table is below; non-risk signals have no filter chip; partner names cut; no page jump in a 454-page table.
- Sam: no keyboard sorting; tabs without landmark/aria-current; 35 tab stops before "Pe scurt"; YearMiniChart aria-label on a role-less div; two focus-ring styles.
- Casey: 6 header actions on three rows; sticky header + tabs 19% of the screen; tabs clipped at "Achiziții 4.5…", "Radiografie" hidden; "Toate semnalele" a 3-column table with 5–6-line cells; the "an" panel does not close on an outside tap.

## Minor observations

"2022 · 2022" duplicated period; table.rank numeric headers left of their values; SEMNALE badge cut without ellipsis; two pager styles; 🩻 emoji in the primary button; big grey "0%" reads as clean; partial-year bar resembles the contracts swatch (dark theme); turnover sets the supplier chart's scale, bars become slivers; every risk meter in "Toate semnalele" red (overall band); dark-theme risk bands nearly invisible; feedback button covers "Pe scurt" percentages at 1280.

## Questions to consider

1. If the score "nu este o probabilitate de corupție", why is it the largest, reddest element with that caveat collapsed at the end?
2. Now that the strip exists, which sentence of "Pe scurt" says something new?
3. Where is the one home of "the records": the in-page table, Ask, or the signal page?
