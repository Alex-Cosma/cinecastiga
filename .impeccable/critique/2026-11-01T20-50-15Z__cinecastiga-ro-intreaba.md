---
target: "https://cinecastiga.ro/intreaba"
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "url:https://cinecastiga.ro/intreaba"
timestamp: 2026-11-01T20-50-15Z
slug: cinecastiga-ro-intreaba
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent). Production https://cinecastiga.ro/intreaba (bare, built question, typed questions, scatter Buzău, table NASTASĂ, records drawer, Back/Forward, keyboard), 1280 + 390, light + dark, signed out.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Floating loader, page stays put; after Enter two chained scrolls push "Am înțeles așa" away, 1 in 3 runs title under header |
| 2 | Match System / Real World | 3 | Jargon: "profil istoric", "scară logaritmică", "4 entități · pagina 1 din 1", "după nume"; "deszăpezirea" echoed as „deszapezire” |
| 3 | User Control and Freedom | 3 | Back/Forward ~0.1 s, "Renunță la modificări", relax options; on linked answers "Schimbă întrebarea" under the header |
| 4 | Consistency and Standards | 2 | Numerals Plex Mono vs sans; focus ring orange/risk-red/green; "MARIA MONICA" vs "MARIA-MONICA"; question stated 3× with builder open |
| 5 | Error Prevention | 3 | Picker counts prevent empty answers; same-name readings offered |
| 6 | Recognition Rather Than Recall | 3 | Sentence + pills restate the question; picker numbers unlabeled |
| 7 | Flexibility and Efficiency | 3 | Free text, builder, 13 models, links, CSV ≤100k, SQL; pickers focus a radio, type-to-filter fails |
| 8 | Aesthetic and Minimalist Design | 3 | Clean desktop answers; empty tinted strip on rankings; ragged action buttons; mobile scatter ~1.6 screens down |
| 9 | Error Recovery | 3 | Unknown words listed + 4 examples; "Reîncearcă"; unknown panel scrolls the input away |
| 10 | Help and Documentation | 3 | Tips nearly everywhere, "Ce include calculul", SQL; picker numbers and "după nume" without tip |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict
LLM: mostly authored — editable Romanian question sentence with "+" chips, counts inside pickers, row → "N de înregistrări →" → drawer (bani, dates, CSV, SEAP), risk scatter with top-10% line. Generic: 2×2 illustrated prompt-starter cards; builder as dashed box under 12 examples. Missed: inert scope pills (AskPanel.tsx:1104).
Detector URL scans: bare 1280 → 0 (+ placeholder 2.8:1 advisory); bare 390 → 7 (shell header/footer links 10px); scatter 1280 → 10 (7 × risk-mid pill 3.7:1 real; 2 SVG labels false positive; caveat line 11.5px); scatter 390 → 19 (+ 3 cramped signal chips); table 1280 → 0; table 390 → 11 (shell + rank-row small 10px, question-results.css:847).
Source scan: 219 CSS findings — side-stripe 2 real (.qb-card, .ev-profile-note) + 3 FP; compare card top border deliberate; 116 off-scale sizes (34 below 11px incl. drawer 8–9px); 25 literal colors (19 in question-builder.css).
Agree: evidence link smallest text in row; scatter caveat small and far from red badges. Detector-only: risk-mid 3.7:1, drawer 8–9px. Overlay: blocked by Chrome Local Network Access; headless-only run, same findings; not user-visible.

## Overall Impression
Core excellent and authored (sentence, counts, evidence path, 0.2–0.5 s, Back/Forward with 0 requests). Weak around the answer: Enter carries the interpretation away, linked answers hard to edit, red risk badges far from "piste, nu dovezi". Biggest opportunity: the answer head as the place to edit and read the question.

## What's Working
1. Sentence builder with counts in pickers — no dead ends.
2. Evidence path — labelled dialog, focus in/Esc back, CSV selection/filtered, SQL, SEAP.
3. Speed and history as specified — 170–541 ms, fixed loader, Back/Forward ~0.1 s 0 requests, Tabel no history step, visible focus, no horizontal scroll.

## Priority Issues
1. [P1] Enter scrolls the interpretation away — focusResult → #ia-understood (AskPanel.tsx:441) then answer → #raspuns (AskPanel.tsx:413); card ends 512px above; race puts title under header. Fix: one scroll target; card stays on top with the answer under it, or one-line interpretation in the answer head; scroll-margin-top from --site-header-h. → /impeccable layout
2. [P1] Linked answers hard to edit — ?spec= focuses the title, "Schimbă întrebarea" at y≈14 under 91px header; pills inert; ranking strip holds only Vizual/Tabel. Fix: pills open their pickers in place, or "Schimbă întrebarea" in the answer head; remove or fill the strip. → /impeccable layout
3. [P2] Red risk badges far from "piste, nu dovezi"; risk-mid pill 3.7:1 — footnote 12px under row 10 (ScatterAnswer.tsx:473); unlabeled 68/40/20% bands. Fix: phrase into the amber banner line; band labels in plot; darken --amber for .risk-mid ≥4.5:1. → /impeccable clarify
4. [P2] Picker numbers unlabeled — "Toată țara 21.244.587", "Județul Cluj 4,7% · 1.146.439". Fix: caption "% din valoare · înregistrări" per picker or "(?)" on "Toată țara". → /impeccable clarify
5. [P2] Mobile crushes the evidence path — Tabel 5 columns in 352px, mid-word breaks, "#" wastes ~70px; lone → in ranking rows; evidence link 10–11px muted. Fix: stacked rows ≤600px (.rank-stack, globals.css:1443); link 13px --ink2. → /impeccable adapt

## Persona Red Flags
Alex: type-to-filter fails in "Unde?"; 13 models 2 clicks away; linked answer edit hidden; total rounded vs drawer bani; no record count in ranking head.
Sam: H1 stays the input label, answer is H2; focus jumps to answer, edit control under header; top 10 = 20 tab stops; risk-red as focus color; hidden tip text duplicated (not verified with VoiceOver).
Jordan: unlabeled picker numbers; untipped jargon; auto-scroll after Enter; diacritics dropped in echo; "Tot grupul 337" vs "Primele 10 din 330"; gallery "cele mai multe contracte" vs value ranking.

## Minor Observations
F36 breach: first example "Pe ce cheltuie primăria din Râmnicu Sărat?" (ask-examples.ts:25); value-wording.test.ts does not scan that file. Ragged action buttons; mobile title 4px under header; unknown panel clipped (90 vs 91px); feedback button over row "⋯" and scatter edge; scatter label collision; disabled "Întreabă" reads broken; modal title near-duplicates H1.

## Questions to Consider
- Scope pills as the editor?
- One editable answer title instead of three copies of the question?
- Red "puternic" badge without "piste, nu dovezi" in the same glance?
- Headline without bani and record count, while the drawer has both?
