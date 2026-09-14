# Domenii: two interactive design directions

Open [the portable mockup](../cinecastiga-domains.html) in a browser. It includes its fonts, data, styles and interactions; no installation is needed. Use the switch at the top to compare **A · Categorii** and **B · Atlas animat** without losing the selected category.

**B now opens by default.** Hover or focus any rectangle for its immediate full label, CPV, exact value and action hint. Click a parent rectangle to zoom into its children in the same atlas; click an eight-digit leaf to open its details. The independent bottom-right arrow opens details at any level. Small tiles also have a dedicated details arrow in the readable companion list. Breadcrumbs and browser Back restore earlier scopes.

[Instant label preview](previews/b-instant-tooltip.png) · [Zoom within the atlas](previews/b-in-place-drill.png) · [Parent opened directly in details](previews/b-parent-details.png)

For the running local preview: [compare both directions](http://localhost:4175/cinecastiga-domains.html).

| Direction | Desktop | Phone | Open Construcții |
| --- | --- | --- | --- |
| A · Category cards | [Preview](previews/a-desktop.png) | [Preview](previews/a-mobile.png) | [Preview](previews/a-detail-desktop.png) |
| B · Animated atlas | [Preview](previews/b-desktop.png) | [Preview](previews/b-mobile.png) | [Preview](previews/b-detail-desktop.png) |

Try Construcții → a subcategory, switch A/B, return using breadcrumbs or browser Back, search “spații verzi” or “4523”, and open **Vezi înregistrările**. All 45 divisions are accessible through the remainder tile or “Toate cele 45”. The source dialog provides [a real preview](previews/evidence-desktop.png) and links to the complete scoped records in the public application.

## Data and prototype boundaries

Both directions use the same real 2025 data: **2,386,867 source rows**, **178,357,316,781.88 RON**, with a known CPV code. The initial view presents eight divisions and an explicit remainder containing the other 37. All 45 divisions now expand through disjoint numeric prefix groups to all **7,252 recorded eight-digit CPV codes**. Construction retains its 26 immediate four-digit groups. Generic codes are separate leaves, so all parent amounts and counts reconcile with their children. Intermediate prefix groups are explicitly identified as technical groupings, rather than the official legal CPV tree. Short names are navigation aliases; catalogue labels remain available in tooltips and details.

The scope includes accepted positive-value direct acquisitions up to two million lei and positive-value awarded contracts. Joint awards are allocated equally among their winners; row counts are not distinct-contract counts. Values describe source records, not confirmed payments. Exact source queries and provenance are embedded in `data.js`.

The construction evidence preview includes three real rows, explicitly labeled as a partial sample. Two rows concern different consortium members of the same contract. Record descriptions in this preview are CPV descriptions rather than original contract titles. SEAP availability was not verified from this device.

Period and geography are fixed for this sketch. Search reaches divisions, intermediate groups and full codes; it avoids counting a matching parent and its children together. The complete source lists and contextual queries open the live application. No production application code, dependencies, configuration, or database data were changed.

## Validation and editing

24 browser checks passed, including category navigation, equivalent A/B data, scoped source links, keyboard dismissal, search, back navigation, all 45 divisions, reduced motion, and no horizontal overflow at 320, 390, 768 and 1440 pixels. Zero application runtime errors. The standalone `file:` version and embedded fonts were also checked. See [verification results](previews/verification.json).

The B refinement passed [30 additional browser checks](previews/refinement-verification.json), covering immediate tiny-tile labels, restored medium-tile titles, tooltip dismissal and viewport bounds, separate arrow/body actions, real parent/leaf navigation, stable canvas position, browser Back, exact leaf evidence, keyboard activation, mobile 44px details controls and reduced motion. Zero application runtime errors. All 10,097 indexed nodes have unique IDs, all 7,252 leaves are full codes, and exact decimal sums/counts reconcile at every parent.

Editable source files are next to this README. Rebuild the single-file mockup with:

```sh
python3 mockups/domains/build.py
```
