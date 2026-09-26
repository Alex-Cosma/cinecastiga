# Admin collection mock-up — design documentation

This is an ordinary extension of the incumbent cinecâștigă? system, prepared as a standalone interactive preview before production implementation. [DESIGN.md](../../../../DESIGN.md) remains the design authority; neither it nor `.impeccable/design.json` is changed by this handoff. The surface-specific direction remains in [the direction contract](../../../mockups/admin-collection-direction.md).

## Implementation evidence

Compared [prototype CSS](../../../../mockups/admin/style.css) and [markup](../../../../mockups/admin/index.html) with the approved application palette and workspace controls, the existing design record, and [PRODUCT.md](../../../../PRODUCT.md).

| Area | Observed implementation and disposition |
| --- | --- |
| Palette | The paper `#f7f8f2`, surface `#fffefa`, sunk `#edf0e5`, ink `#243a30`, forest accent `#204c3c`, orange `#c7522d`, and border colors match the approved light system. The corresponding dark foundations also match. Local aliases such as `--soft` and `--on` reproduce existing roles. |
| Typography | Bricolage Grotesque headings, IBM Plex Sans reading text, IBM Plex Mono request details, and tabular numerals preserve the incumbent families. The tool headline is 38px, reducing to 31px on narrow screens; body defaults to 15px/1.55 and operational labels generally use 12px. These are compact surface choices, not replacements for the shared type scale. |
| Controls | Filled forest Apply, bordered secondary buttons, 7px button corners, 6px delay-input corners, visible orange focus, active navigation underline, labeled fields, and explicit disabled/draft/error states retain the established control language. Buttons use a 42px minimum height; this differs from the monitoring primary's 44px without establishing a new shared minimum. |
| Layout and depth | Open stream rows, thin rules, a grouped settings surface, and a wide collection-state band follow the requested hierarchy. The 1340px shell and 345px settings column are local layout values. Surfaces remain flat; the toast has a restrained overlay shadow. Columns stack and the request table scrolls locally; reduced-motion CSS removes transitions. |

## Local differences

The prototype duplicates theme values for standalone operation. Its light muted text is `#626d60` rather than incumbent `#6c746b`, and light risk text is `#a63625` rather than `#c0311c`. Warning text and the solid live-band state colors are local additions; the band retains its own dark forest/brown colors across themes. Compact preset/filter corners and the custom checkbox switch are also surface-specific. These differences are recorded, not promoted to shared tokens or silently fixed. No material change to the existing identity was identified within this mock-up scope. Production integration should resolve standalone declarations against shared components and variables.

## Behavior, provenance, and disposition

All numbers, request events, progress, configuration changes, and collection/publication states are illustrative browser state. The preview has no backend integration, SEAP requests, or server configuration writes. Its visible guardrails describe proposed backend policy, not implemented server enforcement. Draft changes update the estimate and require Apply; acquisition, processing, and publication remain distinct.

[verification.json](verification.json) records 24 browser checks with no runtime exceptions or external HTTP requests. This documentation uses that supplied evidence and the [finish review](finish-review.md); it does not claim a new test run or full accessibility certification. The reviewer found no blocking defects and gave **Ship** for the standalone simulated preview. A direct mobile settings link is an optional future discoverability improvement.

The PNGs in this preview folder are browser-generated captures of the authored HTML/CSS prototype. They are review evidence, not shipping raster assets, generated artwork, or source photographs; there is no new shipping raster provenance to register.
