# Batch 4 design documentation

The built “Cum sunt legate?” workflow extends the approved forest/ivory interface. Its two-node relationship and three-node procurement path are local workflow patterns; they introduce no replacement identity or new global design system. `DESIGN.md` and `.impeccable/design.json` were preserved without changes.

## Evidence checked

This documentation pass read the following sources directly:

- [Product context](../../../../PRODUCT.md), [incumbent design record](../../../../DESIGN.md), and [component sidecar](../../../../.impeccable/design.json).
- [Approved direction](../../batch4-connections-design.md), [review packet](review-packet.md), [completed finish review](finish-review.md), and [detector output](design-detect.json).
- The implemented [explorer](../../../../apps/web/app/entitati/[id]/legaturi/ConnectionsExplorer.tsx), [route styles](../../../../apps/web/app/entitati/[id]/legaturi/connections.css), and [page](../../../../apps/web/app/entitati/[id]/legaturi/page.tsx).
- The shared [approved palette](../../../../apps/web/app/approved.css) and relevant [investigation](../../../../apps/web/app/anchete/workspace.css) / [monitoring](../../../../apps/web/app/urmariri/monitoring.css) styles for comparison with the incumbent.

The finish reviewer inspected all 13 supplied desktop/mobile captures, including the dark path, source drawers, empty/stale recovery, fictional save fixture, saved investigation, and frozen sources. That review found no material scoped defect and returned `ship`. This documentation pass uses that completed visual review; it did not reopen screenshots, run a browser, or repeat tests. Behavioral and server verification remain the evidence reported in the review packet, with their stated limits.

## Inherited design patterns

| Concern | Built extension and incumbent comparison |
| --- | --- |
| Color and themes | The route references the existing ink, secondary ink, muted, surface, sunk, line, accent, accent-soft, accent-line, on-accent, and risk-soft variables. It declares no replacement color primitives. Theme switching continues through the shared approved palette. |
| Typography | Headings use the shared Bricolage display family; controls use the shared IBM Plex body family. The shell retains the investigation workspace's 15px body with 1.6 line height. Amounts use tabular numerals; identity and supporting metadata stay subordinate. |
| Layout | The route uses the existing investigation width of 1120px. Thin separators and open record rows carry the hierarchy. Sunk surfaces group introductory guidance and the relationship path, consistent with existing scope/evidence panels. |
| Controls | Surface secondary controls, filled forest primary controls, 7px button corners, 6px field corners, and 10px grouped surfaces fit the existing recorded vocabulary. Primary controls have a 44px minimum height, secondary controls 42px; native labeled fields retain familiar operation. |
| States and focus | Selected partner rows combine accent-soft fill with `aria-pressed`. Focus uses the existing 2px accent outline with 4px offset. Loading has status text, lists expose busy state, errors use alert text with recovery actions, and pagination disables unavailable actions. |
| Motion and depth | The surface stays flat with tonal separation. Controls transition background/border over 180ms; entering peer rows briefly lose an accent-soft highlight over 200ms. Reduced-motion rules remove these effects. No new shadow vocabulary is introduced. |
| Shared evidence actions | The explorer reuses `EvidenceDrawer` and `ClipButton`. Source inspection and investigation capture remain adjacent to the documented relationship. The shared drawer and investigation shell retain their incumbent visual structure. |

## Surface-specific expression

The desktop first view places a searchable partner list beside explanatory guidance. Selecting a partner replaces that guidance with a named two-node path, dates, amounts, record counts, sources, and saving. Exploring another partner adds a third node while keeping the original entity visible. Plain Romanian relationship labels state who bought from or supplied whom. Each leg remains inspectable, and a combined source action covers the complete path.

At widths above 760px, partner and peer lists use bounded, focusable scroll regions, and the detail section is sticky. The layout narrows at 1000px, where the two leg summaries stack. At 760px and below, the interface switches between the partner list and selected detail; an explicit return action restores the list. The path becomes vertical and evidence actions use the available width. These are choices for this route, not new global breakpoint or layout requirements.

The local title is 42px on desktop and 34px on mobile; sections use 24px and 20px headings. Partner names and amounts have intermediate sizes appropriate to the record list. This follows the incumbent design record's allowance for tool-specific hierarchy rather than extending the discovery display treatment to every route.

The explanation accompanying a common partner states the limit of the evidence: it establishes procurement relationships, without establishing ownership, transfers between endpoints, or wrongdoing. Direct acquisitions, supplier allocations, and distinct contracts are named separately. The methodology disclosure explains eligible values, estimated consortium shares, dates, excluded identities, and technical validation. Recorded values are distinguished from payments. These implement the product's evidence-first language within this surface.

## Advisory disposition and assets

The detector produced eight advisory entries: seven font-size occurrences across six sizes (14, 16, 17, 20, 23, and 34px), plus the 3px radius of loading skeleton bars. `DESIGN.md` records selected reusable typography roles rather than every size already present in application CSS; for example, incumbent monitoring/workspace styles already use 14px reading/detail text, 20px headings, and 34px headline treatments. The remaining route-specific values are documented here without promoting them into global tokens. The skeleton radius is a minor loading-placeholder detail, not a new control shape.

These advisories do not change the completed review's scoped verdict. No design-record repair, token expansion, or unrelated polish was performed. The existing sidecar and its metadata remain as supplied.

This extension adds no shipping raster imagery. Its chevron is inline SVG; the PNG files in this evidence directory are browser captures for review, not product assets. A raster provenance manifest or generated-image approval step is therefore not applicable to the shipped surface.
