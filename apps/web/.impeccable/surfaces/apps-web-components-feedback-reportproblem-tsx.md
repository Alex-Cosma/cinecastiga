---
version: 1
slug: "apps-web-components-feedback-reportproblem-tsx"
primary_target: "apps/web/components/feedback/ReportProblem.tsx"
related_targets: ["apps/web/components/feedback/feedback.css","apps/web/app/layout.tsx","apps/web/app/intreaba/AskPanel.tsx","apps/web/components/SourceEvidenceView.tsx"]
---

# Feedback flotant — application implementation

Mode: Operate. Primary target `apps/web/components/feedback/ReportProblem.tsx`; related `components/feedback/feedback.css`, `app/layout.tsx`, `app/intreaba/AskPanel.tsx`, `components/SourceEvidenceView.tsx`. The user chose mockup variant **A (edge tab) + discreet style** on 2026-10-02 after reviewing `mockups/floating-feedback/` (fictitious data). Alex gave the user freedom on features; review/merge by Alex.

## Direction contract

THESIS: One quiet, always-available entry point for anonymous feedback, docked to the right edge. The existing dialog, copy, attached-page rules, validation, idempotency and privacy stay unchanged.

OWN-WORLD: Existing tokens only: surface background, accent text, accent-line border, `--shadow2` elevation, Plex 500 14px, 8px radius on the free (left) corners, the shared orange focus ring, dark-theme variables. No new color, font or motion vocabulary.

STORY: The visitor notices a data problem or has a suggestion on any public page, opens the right-edge "Feedback" tab, sees the existing dialog with the public page attached, sends anonymously, and focus returns to the tab.

FIRST VIEWPORT: Desktop: a vertical tab (icon + "Feedback", top-to-bottom), vertically centred on the right edge. At ≤700px it becomes a 48px round icon button in the bottom-right corner (16px + safe area), changed after the critique so it never covers the content edge; the accessible name stays "Feedback: semnalează o problemă sau trimite o sugestie". Hidden on `/admin/*` and in print.

FORM: Replaces all three inline "Semnalează o problemă" triggers (footer, Explore answer actions, source-evidence pages), as the user decided. z-index 30: above sticky subnavs (≤20), below popovers (40), tooltips and toasts; modal dialogs (feedback, evidence drawer) live in the top layer and cover it. Reduced motion removes the hover transition.

KNOWN DEFECT FIXED ALONGSIDE: `feedback.css` referenced the undefined `--ink-secondary` / `--line-strong`; the dialog fields had no border and secondary text used body ink. Replaced with the defined `--ink2` / `--line2`.

FINISH: before/after comparisons in `docs/implementation/previews/floating-feedback/` (desktop 1440, mobile 390, dark), detector run, critique verdict, HANDOFF entry and `docs/implementation/anonymous-feedback.md` update. Unreviewed and undocumented is unfinished.
