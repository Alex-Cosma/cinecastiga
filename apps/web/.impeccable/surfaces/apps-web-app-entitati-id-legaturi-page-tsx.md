---
version: 1
slug: "apps-web-app-entitati-id-legaturi-page-tsx"
primary_target: "apps/web/app/entitati/[id]/legaturi/page.tsx"
related_targets: ["apps/web/app/entitati/[id]/legaturi/ConnectionsExplorer.tsx","apps/web/app/entitati/[id]/legaturi/connections.css"]
---

# Procurement relationships ("Cum sunt legate?")

Mode: Operate. An entity's analysis page (/entitati/{id}/legaturi), beside Semnale, Radiografie and Comparații. Owner, 6 November 2026: redo the whole page; the reader first wants the partners and their weight, then the path through one of them ("Partenerii, apoi traseul"). Problems to remove: nothing important stands out, the path is hard to follow, it reads as a form, the phone is one long list.

Audience: journalists, councillors, citizens checking one firm or institution. Job: see who it works with and how much each weighs, pick one partner, see who else works with that partner, open the exact records of each leg, save the path in an investigation.

Constraints kept: exact decimal values; consortium shares without double counting; the type and year filters apply to the whole path; source coverage and exclusions visible in the method note; private capture permissions inherited; identities pinned to the checkpoint (copied links restore the path); a shared partner proves no ownership, transfer or wrongdoing; values are recorded, not payments.

Approved sketch: apps/web/.impeccable/mocks/decision/legaturi/flux.html (card "Fluxul banilor", owner: "implementează varianta A").

## Direction contract

THESIS: the money drawn as flow: from the entity to its partners, then from the chosen partner to that partner's other partners, each band as wide as its value. It refuses the stacked list of identical rows with an "Explorează legătura" button each.

OWN-WORLD: the incumbent forest and ivory system: Bricolage headings, IBM Plex text, Plex Mono amounts; the choropleth greens for bands (darkest = largest, the chosen band at full ink), one orange mark for the root entity's place among the chosen partner's partners; thin rules, flat surfaces, a soft green dock.

STORY: the reader sees at once who carries the money (shares, the top four's sum), picks a band, sees where the root stands among that partner's partners, picks a third party, opens the sources of either leg or both, saves the path.

FIRST VIEWPORT: crumb to the entity (type, county); "Cum sunt legate?" with a one-line lede (total, partner count, years, the top four's share); top right a segmented type control and one period button opening the site's period picker (Întreabă's component 12: presets, then a free range of years); the flow stage full width: root bar, ribbons leaving it together and opening out to the four largest partners (and the chosen one) with value and share plus one "alte N" band, the chosen partner's five largest partners on the right with the root in orange at its rank; the dock under the stage as one band, path and facts left, "Vezi cele N surse" and "Salvează în anchetă" right. Under the stage, the complete lists with search, pages and one bar scale. On a phone the flow becomes two tappable share strips, the dock follows them, then one list at a time behind a two-way switch (owner: the old phone page was one long list).

FORM: Fluxul banilor, position 4 of 7 on the ranked list (dealt lead). seed:469fe5a23330eec3

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
