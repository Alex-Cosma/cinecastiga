# Functional mock-up review

12 September 2026 · visual branch v1 · follows [the before-code screen designs](01-design.md)

The delivered direction is a warm, editorial interface built around **„Sunt banii tăi. Vezi unde ajung.”** A county, a topic, and a simple search provide three immediate starting points. The same surface leads into source-backed purchases and an investigation notebook.

## What changed in the experience

The current app introduces its query builder and then a risk leaderboard. The prototype first gives a visitor something recognizable to investigate: roads, hospitals, or suppliers. Plain questions replace tool vocabulary at the entrance. The original institutional names remain visible alongside readable labels.

Exploration preserves county, category, institution, supplier, year, ordering, and page state in the URL. Clicking a category or partner keeps the relevant entity filter. Short display summaries retain expandable original contract titles. Every purchase opens a contextual evidence dialog with its source reference.

Anchete is visible in primary navigation. The empty state explains the workflow, and a saved discovery becomes a source card beside editable notes. Saving an entity captures the entire selected set of records and exposes all their original links, rather than implying that one purchase proves an aggregate.

## Persona walkthroughs

**Curious visitor:** Home → Drumuri → an actual purchase → the supplier or original source. The first result requires one click and no query syntax. The county path also requires one click; a county absent from the detailed sample still displays real archive context and an explicit recovery route.

**Watchdog:** `/` → type Cluj → select Primăria Cluj-Napoca → category or supplier → source → save into a named investigation → note → export. The prototype retains context when drilling and preserves captured values and provenance through reload/export. All professional investigation data remains visibly distinct from an unsupported conclusion.

## Findings from verification

The browser walkthrough caught and corrected a skip-link routing error, same-route dialog navigation, aggregate provenance labeling, inconsistent signal totals, supplier geography attribution, and keyboard dismissal. Mobile tables become vertical purchase records instead of horizontally scrolling tables. Interactive bars reveal exact amounts and context on hover or focus. A six-partner overview has a direct path to the full partner list.

38 checks passed, with zero JavaScript runtime errors. The [verification record](../../mockups/previews/verification.json) and [desktop/mobile previews](../../mockups/README.md#screens) are included.

## Deliberate prototype limits

- Detailed exploration uses 48 real records; the national map uses separately labeled archive aggregates. This distinction is visible in the interface.
- The complete 13-block production query engine, natural-language interpretation, peer comparisons, network analysis, and server-backed accounts are not reimplemented here. Existing functionality and earlier search mockups are unchanged.
- Investigations use browser storage and honest local-storage messaging. Production integration must retain the existing ownership checks, server snapshots, and drift detection.
- SICAP source URLs follow existing helpers; this device cannot verify their current external availability.

## Integration sequence

1. Adopt the visual tokens, typography, responsive navigation, and discovery homepage.
2. Connect the question starters and filters to the existing search/AskSpec system; preserve the existing advanced query capabilities.
3. Adopt the entity overview, source dialog, and context-preserving drills using existing IDs and data helpers.
4. Restyle the actual Anchete routes and clipping actions around this notebook layout, retaining their server-side evidence and access model.

The prototype is ready for design review. No application source changes were made.
