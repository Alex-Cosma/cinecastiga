---
target: floating Feedback entry point - dual-agent run 3
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:F:\\CineCastiga\\seap-new\\apps\\web\\components\\feedback\\ReportProblem.tsx"
target_fingerprint: "sha256:ff72c2bc1f16e17e8f8834e515a8490e6da0eefaedddc58082af20104ddf9cbd"
target_path: "F:\\CineCastiga\\seap-new\\apps\\web\\components\\feedback\\ReportProblem.tsx"
timestamp: 2026-10-02T17-31-57Z
slug: apps-web-components-feedback-reportproblem-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser sub-agent), third run after the fixes of run 2

# Critique — floating Feedback entry point (feat/floating-feedback), run 3

Target: `apps/web/components/feedback/ReportProblem.tsx`, `feedback.css`, `app/layout.tsx`; localhost on local snapshot data (older than production). Mode: Operate. Behaviour reviewed: edge tab ≥1360px, round flag button below, landmark `<aside>`, page refreshed on each open, Romanian validation.

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Clear sending/success states; a kept draft is silently re-attached to the new page after navigation |
| 2 | Match System / Real World | 2 | "Feedback" doesn't say what happens; the flag glyph collides with the site's "Semnale de risc" vocabulary; raw path shown |
| 3 | User Control and Freedom | 3 | Esc, ×, Renunță, draft kept, focus returns; can't detach the page or move the button |
| 4 | Consistency and Standards | 3 | Token-faithful; trigger and dialog use the two focus styles that both exist in DESIGN.md |
| 5 | Error Prevention | 3 | Minimum length stated up front, idempotent id; mis-tap risk on mobile |
| 6 | Recognition Rather Than Recall | 2 | Icon-only flag with no tooltip below 1360px; question/record not attached |
| 7 | Flexibility and Efficiency | 2 | Last tab stop (21st on /semnale/24086173, 82nd on an entity page); no skip link |
| 8 | Aesthetic and Minimalist Design | 3 | Quiet; tab 75px clear at 1440 and 34px at 1360/1366 |
| 9 | Error Recovery | 3 | Specific Romanian messages, draft kept; error sits far below the textarea and isn't programmatically tied to it |
| 10 | Help and Documentation | 3 | Good placeholder and privacy note; no pointer to coverage limits before a "data problem" report |
| **Total** | | **27/40** | **Acceptable** (trend 31 degraded → 26 → 27) |

## Design specificity
LLM (A): tokens are on-brand, but the pattern and the label are the generic SaaS feedback widget. The product-specific part is the dialog copy. Missed opportunity: errors here are noticed next to an exact figure or record, and the entry point knows nothing about it.
Deterministic (B): CLI markup scan clean (0). CSS scan has 3 advisories, all verified as pre-existing on origin/main (backdrop colour, 14px error text, 25px mobile h2); the new `font:500 14px` shorthand isn't checked by the rule. Browser overlay in light theme found no finding on the change at 1440, 1280 or 375 (5/5/11 findings, all pre-existing: search-dialog small text, 10px mobile footer links, hidden streaming container). Dark theme at 1440: `gpt-thin-border-wide-shadow` on `.feedback-fab`, caused by the dark value of the existing `--shadow2` token (`0 10px 35px #0004`); the existing search dialog gets the same flag. Dialog open: 0 findings inside `.feedback-dialog`. Overlap scan (150px steps, clipping-aware): the fab never covered main text or tables in the measured runs, and no horizontal overflow anywhere.
Disagreement: A observed overlaps B's sampling missed. At 375×812 on the Explore answer the round button rests over the primary "Vezi răspunsul →" button (27×37px), and on an entity page right-aligned amounts pass under it while scrolling. Both are real, mid-scroll and transient; page ends stay clear.

## What's working
- Breakpoints follow the real layout: no text under the tab at 1360–1440; footer reserve keeps page ends clear at every width; no overflow at 320.
- Dialog mechanics: draft survives close/reopen, Esc returns focus, `role=alert` errors, honest timeout copy; hidden on /admin and in print; the evidence drawer covers it correctly.
- Clean theming in both modes; visible focus ring in both shapes.

## Priority issues
- **[P2] Round button covers content mid-scroll below 1360px.** At 375 it sits over the primary "Vezi răspunsul →" (mis-tap at 326,772), and right-aligned amounts pass under it while scrolling. Fix: hide on scroll-down and reveal on scroll-up or at page end (≤700px), or fade with pointer-events:none while it overlaps primary actions and tables. Command: /impeccable adapt.
- **[P2] The icon-only flag is ambiguous.** From 1359px down there's no label or tooltip, and on "Semnale de risc" pages a flag reads as "flag this contract". Fix: a labelled pill between 701 and 1359px, a `title`, and a non-flag "report" glyph. Command: /impeccable clarify.
- **[P2] The report loses traceable context.** Explore attaches only "/intreaba" (the question spec is dropped, which was the existing privacy rule). The evidence drawer hides the button. A kept draft is silently re-attached to a different page. Fix: say "Pagina atașată s-a schimbat" when the page changes under a draft; decide with the owner whether a public, shareable spec may be attached. Command: /impeccable harden.
- **[P3] Keyboard path is long.** Last tab stop, no skip link, initial focus on × instead of the textarea. Fix: autofocus the textarea; a focus-revealed skip link. Command: /impeccable harden.

## Persona red flags
- **Jordan (citizen, mobile):** faint unlabelled circle (accent-line border ~1.6:1 against paper) with a flag and no tooltip; raw path in "Pagina atașată".
- **Sam (keyboard/screen reader):** 82 tab stops on an entity page; initial focus on "Închide formularul"; textarea lacks aria-invalid/aria-describedby to the error (role=alert still announces it).
- **Ioana (journalist checking a figure in the evidence drawer):** the drawer covers the button; after closing it, the report carries "/intreaba" with no question or record.

## Minor observations
- Tab 38px wide; no draft indicator on the trigger; the counter doesn't show how many characters remain to reach 20; at 320×640 the dialog scrolls internally; "Înapoi la explorare" is generic on non-Explore pages.
- The CSS comment claimed exact values are "never covered"; that holds only for page ends (corrected).
- Pre-existing: hydration mismatches (Reveal `h1.rv in`, /harta choropleth, a script-tag warning); `feedbackSourcePath` drops query strings by design; /entitati mobile table header overlap; the mobile source table puts "Valoare exactă" behind horizontal scroll.

## Questions to consider
- Should records and answers get an in-context "Raportează o eroare" that carries the record ID or public spec, with the global button as fallback?
- Does the phone button need to be persistent, or only on scroll-up and at page end?
- Does "Feedback" carry the product's plain-Romanian promise?
