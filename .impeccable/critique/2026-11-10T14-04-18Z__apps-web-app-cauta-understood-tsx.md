---
target: Pe scurt section of /cauta
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:/Users/alexcosma/Desktop/Personal/code/cinecastiga/apps/web/app/cauta/Understood.tsx"
target_fingerprint: "sha256:fe18933a25aabcc5129f120f67bfb8f20544416576d9bd00f4703096db632a9c"
target_path: /Users/alexcosma/Desktop/Personal/code/cinecastiga/apps/web/app/cauta/Understood.tsx
timestamp: 2026-11-10T14-04-18Z
slug: apps-web-app-cauta-understood-tsx
---
# Critique: „Pe scurt” on /cauta (36 questions × 1280/390 × light/dark), 10 November 2026

Method: dual-agent (A split in three: records+top lists, years/compare/empty/notes, phone+dark · B: detector + overlay)

## Design Health Score: 20/40 (Acceptable, bottom of band)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 2 | Ghost keeps the wrong shape: records rows 1 line vs 2–12, years always 6 rows (real 5/9) |
| 2 | Match real world | 2 | „cel mai scump contract” answered with the sum of all records first, under a different question sentence |
| 3 | User control | 3 | Exits exist; unresolved compare (Strabag/Porr) fails silently |
| 4 | Consistency | 1 | float rows vs grid rows, button vs link for the same action, three label styles |
| 5 | Error prevention | 1 | P0: on phones amounts float out of their row and sit beside the wrong firm (13, 21, 30, 31, 32) |
| 6 | Recognition | 2 | Scope never stated in the card; question restated 2–4 times |
| 7 | Flexibility | 2 | No per-row counts/shares; only exits are „Vezi toate” and Întreabă |
| 8 | Minimalist | 1 | Footer (open CPV paragraph, note, two buttons) as tall as the answer; 40% dead width at 1280 |
| 9 | Error recovery | 3 | Empty state explains itself |
| 10 | Help | 3 | Tips exist; disclosure has no marker (summary display:flex) |

## Priority issues
- [P0] Ranked-list values float out of their rows → misattributed amounts on phones (`.topic-answer-top>li>span:last-child{float:right}` in a list-item li).
- [P1] Answers a different question first: question-mode sentence „Cât valorează…” + total lead; asked-for record/firm/years come after.
- [P1] Records rows: unbounded titles (to 12 lines on phones), winners list run-on, names unlinked (ids exist), „(4 câștigători)” beside 2 names, year glued.
- [P1] Footer outweighs the answer: open CPV paragraph (175 ch lines at 1280, codes break at the hyphen), invisible disclosure, 3px stripe note (owner replaced stripes 2 Nov), filled button.
- [P1] Years and compare have no shape of their own (no magnitude, no partial-year mark, compare = top-2 list squeezing names).
- [P2] Ghost moves the page (years rows count, records row heights, compare help line).
- [P2] Dark: links ≈ text (1.04:1), values weaker than names.

## Detector
CLI: 0 findings. Overlay: line-length on .topic-answer-domains (175–181 ch), side-tab + nested-cards + straggler on .topic-subject-note.

## Out of UI scope (semantics, noted)
18 „compară Strabag cu Porr Construct” → no reading, all panels 0; 15/30 quoted subject loses diacritics („deszapezire”, „dializa”); 27 ≤3 records shows firms not records; 03 two near-identical records; 16 „flori” at primăria Sibiu empty.
