---
target: floating Feedback tab (ReportProblem) - dual-agent
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:F:\\CineCastiga\\seap-new\\apps\\web\\components\\feedback\\ReportProblem.tsx"
target_fingerprint: "sha256:b647631ecc3925bb003219f9d031a194baafc1e752466b4918877f11a8278ab2"
target_path: "F:\\CineCastiga\\seap-new\\apps\\web\\components\\feedback\\ReportProblem.tsx"
timestamp: 2026-10-02T16-50-16Z
slug: apps-web-components-feedback-reportproblem-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser sub-agent)

# Critique — floating Feedback tab (feat/floating-feedback), dual-agent re-run

Target: `apps/web/components/feedback/ReportProblem.tsx`, `feedback.css`, `app/layout.tsx`; live on localhost (local snapshot data `seap_collab_20261001`, older than production). Mode: Operate. Supersedes the single-context run of the same day (31/40, degraded).

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Sending/success states are clear; the attached page silently goes stale after client-side navigation |
| 2 | Match System / Real World | 3 | Romanian copy is natural, but "Feedback" plus a chat icon implies a conversation; the raw path is technical |
| 3 | User Control and Freedom | 3 | Esc, ×, Renunță and focus return work; the attached page can't be corrected |
| 4 | Consistency and Standards | 2 | aria-label promises "trimite o sugestie" but the dialog says "Descrie problema"; two focus-ring styles |
| 5 | Error Prevention | 2 | Content collides with the tab; stale page attachment; 20-character minimum not shown up front |
| 6 | Recognition Rather Than Recall | 3 | Always visible and labelled on desktop; icon-only on mobile |
| 7 | Flexibility and Efficiency | 2 | Last tab stop; no in-context entry point; category never adapts to the page |
| 8 | Aesthetic and Minimalist Design | 3 | Quiet and on-brand, but intrudes on content edges at common widths |
| 9 | Error Recovery | 3 | Excellent timeout/409 messages; short input shows the browser's English bubble instead |
| 10 | Help and Documentation | 2 | Privacy explained; nothing says what happens to a report |
| **Total** | | **26/40** | **Acceptable** |

## Design specificity
LLM (A): the entry point is the stock SaaS feedback widget (right-edge vertical "Feedback" tab with a chat bubble). It is token-perfect and dark-mode clean, but generic in concept. The product-specific part is the existing dialog copy ("Ce ai observat?", "indică instituția, contractul sau cifra", "Pagina atașată"). Missed opportunity: a Romanian action label, and carrying record/answer context into the report.
Deterministic (B): CLI markup scan (ReportProblem.tsx, layout.tsx) was clean, 0 findings. CSS scan found 3 advisories, all on dialog rules that existed before this branch (backdrop literal colour, 14px error text, 25px mobile h2). Browser overlay (port 8400, own tab, dark theme): /semnale/24086173 desktop had 7 findings, 1 on the change; mobile had 13, 1 on the change; /metodologie with the dialog open had 46, 1 on the change and 0 on the dialog. The single on-change finding is "1px border + 35px shadow blur" on `.feedback-fab`. It is likely token-consistent rather than a defect: `--shadow2` is used about 22 times and the search dialog gets the same flag. Everything else (line length, side-tab cards, 9–11px text in the search dialog and footer) predates this change. The overlay ran in a temporary tab that was closed; none remains.
Agreement: both find the tab token-disciplined. A caught behavioural defects (stale page, overlap at specific widths, native validation) that no detector rule covers.

## Overall impression
Calm, on-brand and mechanically solid, but generic in concept. Two real defects need fixing before merge: reports can carry the wrong page, and the tab can hide exact values at some widths.

## What's working
- Token discipline in both themes, hidden in print, reduced motion respected, accent-soft hover.
- Dialog mechanics: native modal in the top layer, Esc returns focus to the trigger, draft survives closing, idempotent submit, honeypot, privacy copy first.
- Responsive switch to a 48px corner button with safe-area offset; label-in-name holds ("Feedback" starts the aria-label).

## Priority issues
- **[P1] The attached page goes stale.** One persistent layout instance only refreshes `sourcePath` when a new draft starts. Reproduced: open on /intreaba, type, Esc, navigate to / → still "Pagina atașată: /intreaba". Admins get the wrong page, which breaks traceability. Fix: refresh `sourcePath` from `pathname` on every open; keep the draft. Command: /impeccable harden.
- **[P1] The tab covers content at many widths.** At 710px it clips "3.919,40" to "3.919,4" in the exact-value column; at 768, 1024 and 1280px it overlaps the table card or content edge by 5–10px; at 375px the round button sits on the full-width "Vezi cele 4 achiziții" button. Hiding exact values violates a core invariant. Fix: show the edge tab only with a real gutter (about ≥1360px) and use the corner button below that; reserve bottom padding on small screens. Command: /impeccable adapt.
- **[P2] Keyboard and screen-reader reach.** It is the last tab stop (after the footer) and sits outside landmarks. Fix: wrap it in a labelled `<aside>` landmark (or add a skip link). Command: /impeccable harden.
- **[P2] The label and icon promise a conversation.** "Feedback" plus a chat bubble suggests a reply channel; the copy is problem-only and anonymous. Fix: a flag-style icon and/or a Romanian action label; field label follows the category. Command: /impeccable clarify.

## Persona red flags
- **Sam (accessibility):** last tab stop, outside landmarks; dialog focus starts on the × close button rather than the first field; too-short input shows the browser's English bubble, never the Romanian role=alert message.
- **Casey (mobile):** the corner button overlaps the full-width primary button on /intreaba; last footer lines pass under it; at 320×640 "Trimite anonim" sits below the fold; icon-only.
- **Jordan (first-timer):** the chat icon implies someone will reply; the 20-character minimum is hidden until it fails ("17 / 3.000"); the attached page is a raw path, sometimes the wrong one.

## Minor observations
- Placeholder now uses `--ink2` (#3f5043), close to ink, so it reads as pre-filled text. This is a side effect of the variable fix; the app's other placeholders use `--muted`.
- Header and tab both use z-index 30; no conflict observed.
- The dark backdrop barely separates the dialog. The button shows on /login (no page attached). /admin hiding verified in code (logged-out /admin redirects to /login).
- Pre-existing: `required minLength` triggers native validation before the Romanian message; "Renunță" keeps the draft; Explore attaches only "/intreaba" by design; hydration mismatch from the `<Reveal />` component.

## Questions to consider
- If the most valuable report is "this number is wrong", should the entry point carry the record or answer title into the dialog?
- Should the edge tab appear only where a real gutter exists?
- What could an anonymous reporter get back (a reference code, a link to known issues or coverage) so the flow doesn't end at a dead end?
