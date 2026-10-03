---
target: floating Feedback tab (ReportProblem)
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:F:\\CineCastiga\\seap-new\\apps\\web\\components\\feedback\\ReportProblem.tsx"
target_fingerprint: "sha256:b647631ecc3925bb003219f9d031a194baafc1e752466b4918877f11a8278ab2"
target_path: "F:\\CineCastiga\\seap-new\\apps\\web\\components\\feedback\\ReportProblem.tsx"
timestamp: 2026-10-02T16-14-38Z
slug: apps-web-components-feedback-reportproblem-tsx
---
⚠️ DEGRADED: single-context (sub-agents not started because the user has not asked for sub-agents in this session; the detector ran once before this review as part of the finish checklist, so Assessment A was not fully isolated from it)

# Critique — floating Feedback tab (feat/floating-feedback)

Target: `apps/web/components/feedback/ReportProblem.tsx` + `feedback.css`, verified on `/semnale/24086173`, `/intreaba?spec=…`, `/metodologie` (local data `seap_collab_20261001`). Mode: Operate.

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Dialog has sending/sent/error states; the tab itself has no persistent "sent" state (not needed) |
| 2 | Match System / Real World | 3 | "Feedback" is a loanword in an otherwise Romanian UI (explicit user choice); speech-bubble icon is familiar |
| 3 | User Control and Freedom | 4 | Renunță, ×, Escape, focus returns to the tab, text kept after errors |
| 4 | Consistency and Standards | 3 | Existing tokens and focus ring; first floating control in the product |
| 5 | Error Prevention | 3 | 20-character minimum, max length, idempotent retries |
| 6 | Recognition Rather Than Recall | 3 | Always visible; icon-only on phones |
| 7 | Flexibility and Efficiency | 2 | Last stop in the tab order (after the footer); no shortcut |
| 8 | Aesthetic and Minimalist Design | 3 | Quiet surface style; on phones it permanently covers a strip of the content edge |
| 9 | Error Recovery | 4 | Specific Romanian messages, text preserved, no duplicates on retry |
| 10 | Help and Documentation | 3 | Dialog explains anonymity, what to include, attached page |
| **Total** | | **31/40** | **Good** |

## Design specificity
LLM: Authored for this product. Forest/ivory surface, accent text, accent-line border, the site's orange focus ring, Plex 500; it reads like the existing secondary buttons. The edge "feedback tab" is a deliberately conventional pattern: recognition matters more than novelty for a utility control.
Deterministic: CLI on the changed files found 1 warning (padding transition on hover; fixed by removing the movement) and 3 advisories in the existing dialog CSS (backdrop literal colour, 14px, 25px). Browser overlay on `/semnale/24086173` found 7 findings: 1 on the new tab ("1px border + 35px shadow blur"), and 6 existing (the search dialog has the same border+shadow pattern; small 10–11.7px text in the search dialog and table). The overlay ran in a temporary tab that was closed after reading; none remains visible.

## Overall impression
A quiet, consistent single entry point that does its job and fixes a real dialog defect (fields had no border). The biggest opportunity is the phone placement, which covers part of the content edge.

## What's working
- Uses only incumbent tokens and the shared focus treatment. Dark theme, print and reduced motion are handled.
- One component and one unchanged dialog, so validation, idempotency, privacy and attached-page rules all carry over intact.
- The `--ink-secondary`/`--line-strong` → `--ink2`/`--line2` fix restores field borders and secondary text colour.

## Priority issues
- **[P2] Phone tab covers the content edge.** At 390px the 38px icon tab sits over the right edge of table cards. Fix: move the compact tab to the bottom-right corner on phones only, or reserve a right gutter ≤700px. Command: /impeccable adapt.
- **[P2] Reporting moved away from the numbers.** Data problems are noticed next to results and sources; the only entry is now the edge tab (user's decision). Fix if wanted: preselect "Problemă cu datele" on data pages, or keep a short in-context hint. Command: /impeccable clarify.
- **[P3] Detector: thin border + wide shadow on the tab.** This matches the existing overlay vocabulary (search results/dialog use the same pairing). Options: keep, or drop the border in the light theme. Command: /impeccable quieter.
- **[P3] Viewports 1256–1340px:** the tab overlaps up to about 26px of the content edge. Command: /impeccable layout.

## Persona red flags
- **Casey (mobile):** the tab is in thumb reach (112px from the bottom), but it covers content and has no visible label.
- **Sam (keyboard/screen reader):** good accessible name and visible inner focus ring, but the tab is reached only after tabbing through the whole page and footer.
- **Jordan (first-timer):** on phones, the icon alone may not say "report a problem"; on desktop the label helps.

## Minor observations
- Hydration warning on `h1.page-title rv` comes from the existing scroll-reveal script; it predates this change.
- Vertical text reads top to bottom; acceptable and consistent with common feedback tabs.

## Questions to consider
- Should a data report carry the exact question or record identifier? Today only the public path is attached, by design for privacy.
- Is the tab's permanent presence on phones worth the content it covers, or should phones keep a bottom-of-page link?
