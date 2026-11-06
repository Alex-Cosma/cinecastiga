---
version: 1
slug: "apps-web-app-entitati-id-comparatii-page-tsx"
primary_target: "apps/web/app/entitati/[id]/comparatii/page.tsx"
related_targets: ["apps/web/app/entitati/[id]/comparatii/PeersExplorer.tsx","apps/web/app/entitati/[id]/comparatii/peers.css","apps/web/app/entitati/[id]/comparatii/PeerGroupEditor.tsx"]
---

# Compare in context ("Comparații")

Mode: Operate. An entity's analysis page (/entitati/{id}/comparatii), beside Semnale, Radiografie and Legături. Owner, 6 November 2026: redo the whole page; the first viewport shows the entity's place in its group ("Locul ei în grup"). Problems to remove: the group is not understood, the list is long and repetitive (464 rows, 24 pages, a "Vezi sursele" on each), the page reads as a form. Keep whatever is relevant (owner: "orice e relevant").

Audience: journalists, councillors, citizens checking one firm or institution. Job: see where the entity stands among comparable entities and how far from the middle, understand who the group is and change it, open the sources of the entity, of any member or of the whole comparison, save the comparison.

Constraints kept (method revisions of 20 and 26 September 2026): activity groups (same year, channel and CPV division, half to double the entity's eligible records; authority type from Întreabă); local governments by the ten closest RPL2021 populations, county councils separately; copied links to a manual group of up to 50 identity-bound entities still open (the hand-picked group left the page, owner 6 November 2026; only "Revino la grupul automat" remains); members without records stay listed but are out of the median, never zero spending; Toți anii / Toate domeniile with their unknown-date/CPV note; the method details, coverage and data version; copied links pin identity and checkpoint; capture of the whole comparison up to 499 members; exact amounts on hover; values are recorded, not payments; a difference from the median is a lead, not proof.

Approved sketch: apps/web/.impeccable/mocks/decision/comparatii/sir.html (card "Șirul celor 465", owner pick on the decision page, 6 November 2026).

## Direction contract

THESIS: the whole group drawn on one value axis, every member a dot, the entity the one orange dot, the middle half and the median marked: how far from the group it stands reads at a glance. It refuses the explicit-apply form above 24 pages of identical rows with a source button each.

OWN-WORLD: the incumbent forest and ivory system: Bricolage headings, IBM Plex text, Plex Mono amounts; group dots in the choropleth green, the middle half as a sunk band, the median as a dashed ink rule, the entity in the site's orange; thin rules, flat surfaces, the site's period/option windows (Popover + OptionList) for filters.

STORY: the reader sees the rank and the multiple of the median, reads who is in the group in one sentence with three facts, changes period, domain, channel or county with buttons that apply at once, hovers a dot for its name, place and exact value, opens the neighbours or the whole ranking, opens any sources, saves the comparison.

FIRST VIEWPORT: crumb to the entity (type, county); "Unde stă {nume} între {N} {firme|instituții|administrații}" with a lede (domain, period, the group rule, rank, multiple of the median); one row of filter buttons (Perioada, Domeniul CPV, a Toate/Directe/Proceduri segment, Județul) applied immediately; the stage full width: the swarm on a logarithmic value axis with the middle-half band, the dashed median and its value, the orange entity with name, value and rank, axis ticks in lei, a Total / Pe înregistrare switch top right; under it two columns: "În jurul ei" (ranked rows around the entity, names linking to their pages with one line of facts, each row's place as a dot on a thin track with the median's tick, on the swarm's log axis (a position, never a ratio fill), short value with the exact on hover, a small sources button; "Tot clasamentul" under them) and "Cine e în grup" (sentence, three facts, one row of actions: Sursele ei · N, Sursele comparației, Salvează în anchetă, Copiază linkul). Below the fold: the whole ranking in the same rows (pages of 20, opened at the entity's page), the method details. On a phone the filters wrap two per row, the swarm is shorter, the columns stack.

FORM: Șirul celor 465, position 1 of 7 on the ranked list (dealt; the lead was the sentence-first card). seed:6cf2d0715920e4c4

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
