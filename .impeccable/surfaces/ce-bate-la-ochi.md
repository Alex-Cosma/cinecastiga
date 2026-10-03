# Ce bate la ochi — interactive editorial mockup

Target: `mockups/ce-bate-la-ochi/index.html`. Mockup only; app implementation follows user review. Read/Experience modes, Romanian, public visitor. The user explicitly pins map → county editorial index → illustrated narrative with chronology and exact evidence; demonstrations are explicitly approved. No queries or real allegations.

## Direction contract

THESIS: A geographic entrance to human-authored reporting. The reader follows a story and can challenge each claim through the sources next to it. Counts measure published stories, never corruption.

OWN-WORLD: Existing forest/ivory, Bricolage/Plex fonts, thin rules, orange details. Reuse the actual county geometry and homepage road/hospital/network SVG assets. Preserve the application identity, including its vector illustrations.

STORY: Choose a county, choose an illustrated story, read the narrative, follow dated events, open source records without losing reading position. Honest empty counties, demo labels, source type and unknowns.

FIRST VIEWPORT: Compact header with new entry after Explorează. Large left-hand map with discreet story counts and a right-hand latest-story column; title above and county search inside the map panel. County index uses a wide lead story and quieter side stories. Article splits an illustrated headline from a readable text column, chapter navigation and an evidence rail.

FORM: User-pinned geographic editorial flow, no concept-seed tournament. Code-led interactive mockup for evaluating the requested transitions; no application implementation or static-comp fidelity claim. Selected county silhouette becomes the county masthead through View Transitions. The chosen illustration moves into the article cover. Reduced motion removes the transition, history/back and keyboard remain functional.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

No raster assets ship; reused SVG origins documented. Existing global DESIGN.md remains authoritative. Future open decisions: editorial attribution, publication/review workflow, multi-county assignment, update policy and externally sourced illustrations. These do not block this mockup.

## Completion — 2026-10-02

Interactive mockup complete; application implementation still awaits user feedback. Final review: SHIP FOR MOCKUP REVIEW, three corrections resolved; see `.impeccable/review/ce-bate-la-ochi/review.md`. Documentation: `mockups/ce-bate-la-ochi/README.md`. Desktop/mobile navigation checks pass, no JS errors or horizontal overflow. Named county transition verified in both directions. Existing independent threads reused after fresh-agent spawn hit the thread limit. Global design canon preserved; no raster assets or external source requests.

## Local application implementation — 2026-10-02

User approved the mockup and requested local implementation. Implemented in `apps/web/app/ce-bate-la-ochi/` with typed editorial catalog in `apps/web/lib/stories/`; real routes, shared-element transitions, source sheets, responsive/dark/reduced-motion states and main navigation entry after Explorează. Demo stories load only in development; the published catalog is empty. File-based authoring is documented in `docs/implementation/editorial-stories.md`; an admin editor remains a separate step. No database writes, source requests, private-investigation imports, commit, push or deployment.

Final independent review: **SHIP LOCALLY**, `.impeccable/review/ce-bate-la-ochi-local/review.md`. Nine unit tests, TypeScript, isolated optimized build and desktop/mobile browser checks pass. All twelve final screenshots were visually inspected. Actual application sticky-header offsets were corrected and checked at narrow widths. Existing DESIGN.md remains authoritative; no raster assets introduced.

## Real-source editorial preview — 2026-10-02

User requested removal of fictional stories and a professionally researched current story from local public procurement data. App examples deleted; approved standalone mock remains a historical design artifact. One real local preview now documents seven September 2026 purchases by Școala 311 from BNC Team Construct, with exact evidence and a separate contextual acquisition from another supplier. Narrative sections support source citations; source records expose SEAP code, CPV and Romanian timestamps, and contextual purchases are explicitly outside the total. Generic filler headings were removed. No new art or layout direction. Public catalog remains empty; preview and source pages are development-only/noindex. Research, limitations and unsent reporting questions: `docs/research/20261002-scoala311/README.md`.
