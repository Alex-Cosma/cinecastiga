---
version: 1
slug: "app-preturi-page-tsx"
primary_target: "app/preturi/page.tsx"
related_targets: ["app/preturi/PriceStrips.tsx","app/preturi/preturi.css","app/preturi/[produs]/page.tsx","app/achizitii/[id]/page.tsx"]
---

# /preturi: unit prices (lead-finder, product page, record-page note)

Mode: Operate (the lead-finder /preturi), Read (the product page /preturi/[produs]). Owner decisions, 10–11 November 2026: main job = find who buys the same product at a higher price (lead-finder first; title „Cine cumpără mai scump același produs”; values are contracted, never „plătit”); compare like with like, packs split; section only (not /semnale, not the score); ≥ 5 buyers per product and year; a lead („peste dublu”) is the mart's flag: ≥ 2× the year's median, ≥ 2 awards, ≥ 500 lei above the median, in a product with ≥ 20 institutions that year (LEAD_RULE), worded „de N ori mediana”, a lead not proof („pistă, nu dovadă” beside the named leads); administrators only until the data is complete; prices excl. VAT, nominal, same year; the raw unit always visible. Structure locked on the decision page: "Banda prețurilor" (sketch apps/web/.impeccable/mocks/decision/preturi/banda.html). "Grupă" is one typeahead „Grupă sau produs” over our own groups and products, not CPV (owner, 11 November 2026).

Audience: journalists, local councillors, curious citizens. Job: spot institutions that bought the same product, in the same pack, at twice the median or more; open the exact lines and awards (SEAP), save them.

Data: SEAP direct-award item lines, 2018–2019 complete from the 2020 archive, 2025–2026 a small part (strips drawn, usually too few institutions for leads: „prea puține instituții pentru piste”); lines with unit and name in disagreement, a blended price, a yearly ceiling contract or a price outside the product's plausible range are not compared; fresh produce is compared with the whole year's median („sezon”); marts.unit_price_groups / unit_price_buyers / unit_price_lines.

## Direction contract

THESIS: every product is one strip of buyers on a shared "times the median" axis, so the outliers of 50 products read in one look; it refuses the flat ranked table as the first view.

OWN-WORLD: the incumbent forest and ivory system (DESIGN.md): Bricolage product names, Plex reading text, Plex Mono prices; thin lines; the median as a forest rule, twice the median as a dashed risk rule, the middle half as a dark forest band over a pale, outlined accent-line band, every lead as a risk tick, the largest by lei above the median as solid risk dots (the legend says how many of how many), the largest named. No mark is faded: 3:1 or more on every row state.

STORY: the reader picks a year and a group or product, scans the strips for dots past the dashed rule, opens a strip to read its five largest leads, loaded on open (who, price vs median, quantity, lei above, supplier), opens the product page or the award, verifies on SEAP, saves.

FIRST VIEWPORT: h1 and a one-line method; the filter bar (An, Grupă sau produs typeahead, Județ, Ordine) with the lead count on the right; the axis; the first six strips. Under a county or a year, products without a lead fold behind one line. The buyers table is cards from 1100 px down (no horizontal scrollbar, ever); controls are 44 px on touch; the product page's dots are one Tab stop with arrows; filters work without JavaScript.

FORM: Banda prețurilor, dealt structure 2 of 3 (owner pick). seed:cfefbf7ab4f5991b

FINISH: unreviewed and undocumented is unfinished; the build ends with the finish review, the verdict and DESIGN.md's unit-price paragraph.
