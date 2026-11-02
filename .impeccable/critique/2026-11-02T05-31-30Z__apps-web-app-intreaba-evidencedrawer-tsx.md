---
target: records drawer (EvidenceDrawer)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:~/Desktop/Personal/code/seap-integration-20261016/apps/web/app/intreaba/EvidenceDrawer.tsx"
target_fingerprint: "sha256:ce2ee61c601e1661a3dcee822920d320f0f3dcbb26c46bb109a4bd7583353400"
target_path: ~/Desktop/Personal/code/seap-integration-20261016/apps/web/app/intreaba/EvidenceDrawer.tsx
timestamp: 2026-11-02T05-31-30Z
slug: apps-web-app-intreaba-evidencedrawer-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent). Local production-mode preview (same drawer code as production, which was in its maintenance window), opened from a ranking row, "Vezi înregistrările sursă" (Buzău scatter, 403.915 records), a picked card and radiografie; 1280 + 390, light + dark.

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Status bar inserted above the list shifts content ~61px per update; CSV confirmation out of view |
| 2 | Match System / Real World | 3 | "ID rând", "3250 RON", unlabeled contract numbers, "…din spatele răspunsului" on entity pages |
| 3 | User Control and Freedom | 3 | Esc/×/backdrop + exact focus return; no URL, Back on phone leaves the page |
| 4 | Consistency and Standards | 2 | "Oferta acceptata" amber (cascade bug); sizes leak from host page; "5112469.92 RON" vs "5.112.469,92 lei" |
| 5 | Error Prevention | 3 | Limits stated; stream filter without counts |
| 6 | Recognition Rather Than Recall | 3 | Scope label good; unlabeled sort; phone cards lose headers |
| 7 | Flexibility and Efficiency | 2 | 10 rows/page (40.392 pages), no jump, no link, CSV 50+ tabs away |
| 8 | Aesthetic and Minimalist Design | 2 | Question is the biggest text; records 11px; 7-paragraph "Cum ajungem…" |
| 9 | Error Recovery | 3 | Retry, explained empty state with clear action |
| 10 | Help and Documentation | 3 | Help as a wall; no (?) on key labels |
| **Total** | | **27/40** | **Acceptable** |

## Design Specificity Verdict
LLM: specific content (Instituție → furnizor, SEAP/TED per record, consortium share, stored-precision sum, profile reconciliation tick, exact CSV), generic side-sheet form; the verification unit has no form — exact value smallest and hidden ("3250 RON").
Detector: source 0 (CSS-blind); CDP with drawer open: 79 real in-drawer findings at 1280, 58 at 390 (undersized/tiny text), side-tab on .ev-profile-note on profile drawers; blind spots measured: 8px ::before label, 10px sort select, 12px phone search field. No false positives in the drawer. Overlay ran on localhost but drawer highlights sit under the modal top layer; not user-visible.

## Overall Impression
Sound core (source per record, exact sums, correct dialog). Inverted hierarchy (question big, records 8–11px); phone header 35%, no record on first screen. Opportunity: the record as protagonist.

## What's Working
1. Source chain per record (title, entities, SEAP/TED, exact and filtered sums).
2. Dialog mechanics (native dialog, focus return, own scroll, no page x-scroll, 44px phone targets, reduced motion).
3. States and speed on normal selections (120–320 ms rows, ~70 ms sort).

## Priority Issues
1. [P1] Phone header eats the drawer — 293/844px, h2 26px at ≤760 (> desktop 22px, evidence-drawer.css:3), never collapses; 0 records on first screen; 431px cards. Fix: scope as title, question one line or scrolls away; one-line summary; filters behind one row. → /impeccable adapt
2. [P1] Verification text too small — .ev-table 11px desktop, details 10px, th/pill 9px; phone 8–10px incl. exact value (breaks 1 Nov 12px phone rule). Fix: 13/14px table, ≥12px details, 11px caps labels, exact value 12–13px tabular, CSV 13px. → /impeccable typeset
3. [P2] Accepted records amber — css:32 `.ev-export-limit,.ev-state{color:var(--amber-ink)}` overrides css:2 `.ev-state-accepted{color:var(--ok)}`. Fix: higher-specificity accepted rule, neutral "Contract atribuit", amber only for unusual states. → /impeccable polish
4. [P2] Exact value hidden, misformatted, no not-a-payment cue — EvidenceDrawer.tsx:244 `{r.valueExact} RON`; ID SEAP = ID rând for DA. Fix: lei with bani, only when it differs, drop ID rând for DA, tip on "Valoare înregistrată". → /impeccable clarify
5. [P2] Large selections slow, over-paged, jumpy — 403.915 records: 3.1 s cold open, 2–4.7 s search, 1.5–2.7 s page; page change lands at bottom; status bar shifts ~61px. Fix: scroll to table top, overlay status, 25–50 rows or "Arată încă 25", default "Valoare ↓" on huge sets. → /impeccable optimize + polish

## Persona Red Flags
Alex: 40.392 pages no jump; no link; no SQL for the drawer query; CSV 50+ tabs; disabled export without reason; stream filter without counts.
Sam: dialog name = question for every row; 3 live regions per change; phone loses column headers; risk-red focus ring.
Casey: 35% header, no record on first screen; Back leaves; CSV label wraps; confirmation at list end; 8–10px text.

## Minor Observations
CPV repeated when title missing; unlabeled bold contract numbers; eyebrow on radiografie; "celor 1 profil selectate"; 20 of 337 profiles in arbitrary order; second × from the rotated "+"; CSV label changes after load; .ev-profile-note side stripe.

## Questions to Consider
- Phone: is the question worth 35% of the screen?
- "Verify every leu": a receipt row (value in bani, ID, date, SEAP)?
- 403.915 records: 10-row pager or largest-first + rest in CSV?
- Should a record's state carry colour on a site where colour means signal?
