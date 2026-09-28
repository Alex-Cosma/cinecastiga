# Explorează compact

Mode: Operate. Narrow refinement of the existing Romanian question workspace, preserving PRODUCT.md and DESIGN.md.

Approved brief: remove repeated introductory copy/space above the useful controls; retain all 13 questions, exact evidence, reusable private recipes and condition semantics. User explicitly pins the existing “Toate întrebările” button styling, including mobile; this overrides the mobile selector in the sketch.

Implementation and verification: docs/implementation/explore-compact.md. Route /intreaba, local only. Dark and light use existing tokens; no new design canon.

Follow-up: user rejected the header recipes button and entire shelf UI. Save now sits left of Run and opens a minimal naming dialog. Existing data/storage preserved. Loading UI is pending user choice; proposed Saved tab inside the existing catalogue, no new header action.

Approved follow-up implemented: catalogue Models/Saved tabs; private server-side name search, exact-spec loading without autorun, unsaved-edit confirmation, optimistic update or copy. Prior loading-pending notes are superseded. External catalogue trigger stays unchanged.

Saved-name follow-up: unique per-owner names enforced in PostgreSQL; copy action proposes an editable unused suffix before a separate confirmation. Preserve old question versions when deduplicating current names.
