---
version: 1
slug: "app-preturi-page-tsx"
primary_target: "app/preturi/page.tsx"
related_targets: ["app/preturi/PriceStrips.tsx","app/preturi/preturi.css","app/preturi/[produs]/page.tsx","app/achizitii/[id]/page.tsx"]
---

# /preturi: unit prices (lead-finder, product page, record-page note)

Mode: Operate (the lead-finder /preturi), Read (the product page /preturi/[produs]). Owner decisions, 10–11 November 2026: main job = find who overpays (lead-finder first); compare like with like, packs split; section only (not /semnale, not the score); ≥ 5 buyers per product and year; a lead is ≥ 2× the median, worded „de N ori mediana”, a lead not proof; prices excl. VAT, nominal, same year; the raw unit always visible. Structure locked on the decision page: "Banda prețurilor" (sketch apps/web/.impeccable/mocks/decision/preturi/banda.html). "Grupă" is one typeahead „Grupă sau produs” over our own groups and products, not CPV (owner, 11 November 2026).

Audience: journalists, local councillors, curious citizens. Job: spot institutions that bought the same product, in the same pack, at twice the median or more; open the exact lines and awards (SEAP), save them.

Data: SEAP direct-award item lines, 2018–2019 from the 2020 archive (+ a thin 2025–2026); marts.unit_price_groups / unit_price_buyers / unit_price_lines.

## Direction contract

THESIS: every product is one strip of buyers on a shared "times the median" axis, so the outliers of 50 products read in one look; it refuses the flat ranked table as the first view.

OWN-WORLD: the incumbent forest and ivory system (DESIGN.md): Bricolage product names, Plex reading text, Plex Mono prices; thin lines; the median as a forest rule, twice the median as a dashed risk rule, the middle half as a dark forest band over a pale accent-line band, leads as risk dots, the largest named.

STORY: the reader picks a year and a group or product, scans the strips for dots past the dashed rule, opens a strip to read its leads (who, price vs median, quantity, lei above, supplier), opens the product page or the award, verifies on SEAP, saves.

FIRST VIEWPORT: h1 and a one-line method; the filter bar (An, Grupă sau produs typeahead, Județ, Ordine) with the lead count on the right; the axis; the first six strips.

FORM: Banda prețurilor, dealt structure 2 of 3 (owner pick). seed:cfefbf7ab4f5991b

FINISH: unreviewed and undocumented is unfinished; the build ends with the finish review, the verdict and DESIGN.md's unit-price paragraph.
