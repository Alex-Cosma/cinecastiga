# Batch 4 — comparisons in context

20 September 2026. Authorized next portion of Batch 4. Work is local and uncommitted. Ownership enrichment remains deferred.

## User flow

From an entity profile, choose **Compară în context**. The new route is `/entitati/[id]/comparatii?rol=autoritate|furnizor`. It proposes the latest available closed calendar year and the focal entity's dominant CPV division by eligible recorded value. Both criteria are visible and editable; the fallback to an available current year is disclosed.

Choose year, CPV division, procurement channel and optional registered county, then **Aplică**. The screen describes who qualifies before displaying the focal total and the median. A second measure shows the mean per source record, explicitly distinguished from unit prices. The complete member list is paginated, with **Vezi sursele** for each member. **Verifică toate sursele** opens the exact group; **Adaugă la anchetă** preserves its method, members, totals, median and source records. Copied URLs pin resolved filters, focal identity and data checkpoint.

The functional sketch `mockups/cinecastiga-peers.html` was written before UI integration. Its data are fictional. The surface direction is documented in `batch4-peers-design.md`; the existing design system is preserved.

## Method and boundaries

- Same calendar year, CPV division and procurement channel.
- Other entities have between half and twice the focal count of eligible source records. This is observed activity, not an assertion of equal population, budgets, employee counts or firm size.
- Authorities additionally have the same type estimated by existing name patterns. Unknown or ambiguous classification prevents automatic comparison while keeping focal sources accessible.
- County filters members' registered county, never transaction delivery geography or buyer county for suppliers.
- Focal is excluded from all medians. Medians use the entire group, not the visible page. At least five other members are required for comparative interpretation.
- Positive DA values up to the existing technical ceiling of 2 million RON; positive contract allocations. Consortium allocations and distinct contract counts remain separate. No payment or corruption inference.
- Values retain SQL numeric precision. Mean values are rounded to two decimal places. Coverage exclusions are explained; a closed year does not imply complete collection.
- Full-group source inspection/capture supports up to 499 other members plus focal. Wider groups retain complete medians and individual sources; narrowing is required before saving the whole group. No silent sampling.
- Member-source captures may preserve local source filters. Whole-comparison saves preserve the full group; the drawer explicitly explains this even if its visible list is filtered.

## Implementation

Backend/shared/API: `lib/peers.ts`, `peers-shared.ts`, `/api/peers`. Details and performance in `batch4-peers-data.md`.

Bindings: `lib/peers-evidence*.ts`, existing source rows/CSV, capture queue/worker, case/frozen pages and exports. Details in `batch4-peers-evidence.md`. No new migration, background worker, mail task or scraping task.

UI: `app/entitati/[id]/comparatii/`, profile entry, optional peer binding in `EvidenceDrawer`. Case save uses the existing authenticated private workflow.

## Verification checkpoint

Final build, typecheck and lint passed;339defaulttests passed.29isolated PostgreSQL scenarios cover ten peer-backend, six peer-evidence and thirteen existing connection/capture regressions. Corrected desktop/mobile browser confirmation passed23checks with12screenshots, including both themes, exact CSV, frozen case evidence, supplier comparisons, copied URLs, paging and small groups. Fresh finish review: **ship**. Its two copy findings were corrected and the bounded verdict confirmed both **resolved**. The design documenter preserved the incumbent design records. Temporary preview database, process and private session files were removed; the main local app remains running with this build. Final evidence is in `previews/batch4-peers/verification.json`.

Real database read-only sample: Buzău,2025,CPV45,all. Focal18records /481366697.99RON;202othermembers;median15519171.185RON. Full source population203entities /3561records /5745681623.00RON. Initial national-query performance improved by sharing the summary and member-page scan. Broader queries can still take several seconds; no sampling or raised timeout was used.

## Manual checks after the local app is restarted with this build

1. Open `http://localhost:3110/entitati/2144364?rol=autoritate` and select **Compară în context**.
2. Review the proposed year and CPV. Select2025 and45 if needed, then **Aplică**. Check the group definition, total and median.
3. Switch to **Pe înregistrare**, read its limitation and return to **Total**.
4. Open the focal **Vezi sursele**. Check count, exact total and original SEAP/TED links. Try a local list filter; verify the modal keeps its size.
5. Inspect another member and another page. The group count and median must not change with pagination.
6. Restrict **Județul entităților**, apply and inspect the recalculated group. Small groups explain why interpretation is suppressed.
7. **Copiază linkul**, open it in a new tab and check that filters and version are retained.
8. When signed in, save a whole comparison to a private investigation. Wait for capture completion, open frozen sources and export the evidence. Verify the criteria, complete member roster and original source links remain available.

Production release is outside this authorization. Do not commit, push or deploy without an explicit instruction.
