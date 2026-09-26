# Batch 4 finish review

## Evidence validity

Reviewed the approved request and direction in `review-packet.md` and `batch4-connections-design.md`, the incumbent `PRODUCT.md` / `DESIGN.md`, and the Impeccable craft floor. This is a bounded Operate extension of the existing forest/ivory interface, not a replacement visual world.

Opened and inspected all 13 supplied captures:

- `initial-desktop.png`, `connection-desktop.png`, `path-desktop.png`: real Buzău browsing, partner selection, and the two-leg path.
- `path-mobile.png`, `path-mobile-dark.png`: the same path and actions in both themes, with an explicit return to the partner list.
- `sources-desktop.png`, `sources-mobile.png`: intentionally viewport-only source-drawer captures; they show the selected relationship context and matching totals. The desktop capture also shows individual original-source actions. The mobile capture is the top of a scrollable drawer, not evidence that the rows are absent.
- `empty-mobile.png`, `stale-mobile.png`: empty-period recovery and rejected stale identity with restart actions.
- `save-desktop.png`, `saved-case-desktop.png`, `saved-case-mobile.png`, `frozen-sources-mobile.png`: clearly fictional fixture, save controls, private investigation, preserved path, exact frozen total, and original-source links.

The captures are populated, legible, and consistent with the inspected `ConnectionsExplorer.tsx`, `connections.css`, `connection-evidence-shared.ts`, and connection props in `EvidenceDrawer.tsx`. The desktop partner lists are deliberately bounded scroll regions in the code; the partial last visible row does not mean the remaining partners were discarded. No recapture is needed for the stated review.

This reviewer did not run a browser or tests. `browser-checks.json` reports URL restoration, mobile return, source rows, stale/empty recovery, successful save, both path directions, consortium allocations, search/filter behavior, reduced motion, and no continuation runtime errors. `source-performance.json` and the implementation reports supply server verification; their claims are reported evidence rather than independently repeated checks. Screenshots alone cannot establish keyboard operation, live destination availability, access enforcement, or complete contrast compliance.

## Direction/craft assessment

The extension follows the approved interaction: start at a known entity, select a procurement partner, expand to another institution or supplier, inspect either leg or the combined sources, and preserve the selection. The starting entity remains in the path. Romanian edge labels make direction intelligible without requiring graph literacy.

Hierarchy, fonts, forest/ivory roles, thin separators, native fields, and restrained surfaces match the incumbent product. The main action is source inspection; saving and returning remain adjacent and understandable. Mobile replaces the partner/detail split with a focused detail flow, stacks the path and legs in reading order, and retains usable action widths. The dark capture preserves the same hierarchy and state distinction.

Meaning is appropriately bounded: a common procurement partner does not establish ownership, endpoint transfers, coordination, or wrongdoing. Counts distinguish direct acquisitions from supplier allocations and distinct contracts; the two-leg total explains that a contract may contribute different allocations. The visible caveat distinguishes recorded values from payments, and the methodology disclosure explains eligibility, dates, coverage, and estimated consortium allocation. Source details and CSV expose stored precision beyond the rounded browsing amounts.

The new code provides explicit focus styling, semantic selected state, labeled inputs, loading/error/empty states, focusable list regions, recovery actions, and reduced-motion rules. These support the supplied behavior report without substituting for a full accessibility audit.

## Material findings

No material new functional, UX, truthfulness, or presentation defect was identified within this scope.

The real path reconciles visually: 12 Buzău–RER SUD rows plus one additional institution–RER SUD row produce 13 rows and 466,335,665.81 RON in the combined drawer. The fictional save shows both relationships preserved in one private evidence item, with four frozen rows and the exact 358,000.0053 RON amount in the preserved-source panel and source page. The fiction labels prevent the fixture from being mistaken for a real finding.

The shared source drawer retains its existing eyebrow, summary block, and substantial mobile header/footer; the shared case shell retains a compact rounded headline above the exact preserved amount. Those are incumbent components, not introduced by the connection context. The exact amount remains visible and there is no scoped regression that warrants redesigning them in this batch.

## Required corrections

None for the scoped finish. Preserve the reported verification limits and the explicit distinction between procurement relationships and interpretation. Peer comparisons and external ownership enrichment remain deferred as approved.

## Verdict

Ship the bounded procurement-relationship extension. The reviewed evidence supports the approved desktop/mobile workflow, inherited identity, source transparency, and private preservation without introducing unsupported relationship claims.

Disposition: ship
