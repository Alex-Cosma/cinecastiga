---
version: 1
slug: "apps-web-app-semnale-page-tsx"
primary_target: "apps/web/app/semnale/page.tsx"
related_targets: ["apps/web/app/semnale/SignalsExplorer.tsx","apps/web/app/semnale/signals.css","apps/web/app/semnale/case/CasePage.tsx","apps/web/app/semnale/case/case.css"]
---

# /semnale: the signal family (case, national list, risk ranking)

Address (owner, 6 November 2026): one entity's case page is /entitati/{id}/semnale?tip=… (its route app/entitati/[id]/semnale/page.tsx renders app/semnale/case/CasePage.tsx); /semnale is the national list and the ranking only.

Mode: Read (the case page), Operate (the national list and the ranking). Owner decisions, 6 November 2026: the whole family; the case and its sources are one page; one page per pattern, the entity's score bar and the tabs under it are the menu between them (the segments open their tab; the bottom "Celelalte tipare" block was removed, owner, 6 November 2026); the dependence and concentration signals' sources are the records with the main partner only, the rest set aside and visible.

Audience: people checking public procurement (journalists, local councillors, citizens) arriving from an entity page, Întreabă or the national list. Job: understand one pattern of one entity in its own numbers, then open the exact records (SEAP), save them in an investigation or download them.

Approved composition (owner, 6 November 2026, "bun, hai să implementăm local"): apps/web/.impeccable/mocks/semnale-familie.html and apps/web/.impeccable/mocks/semnale-ibanesti.html; the structure round's sketches are in apps/web/.impeccable/mocks/decision/.

One-acquisition patterns (owner, 6 November 2026): their cases are one table (CaseTable.tsx) with column funnels on the partner, the date and the value, 10 rows a page, the excess as a bar with its number above and the sentence on hover, the row's actions a SEAP link and an icon-only save.

Open after the finish review (6 November 2026): the national list's order "Cât trec de plafon" (needs its own query), the mirrors of the signals outside the score (to show the owner first), a case beyond the first 50 of a pattern opened from an old link.

## Direction contract

THESIS: every pattern is a comparison between what happened and its reference; the case page puts the two faces side by side. It refuses the filterable table of "apariții" with a disclosure of rule text.

OWN-WORLD: the incumbent forest and ivory system (DESIGN.md): Bricolage headlines, Plex reading text, Plex Mono for amounts and codes, thin lines, flat tonal surfaces. The score bar reuses the entity page's choropleth segments; the mirror is one surface split in two by a hairline, with a large number on each side.

STORY: the reader sees from what the entity's score is made, reads the case as one sentence with its numbers, compares the two faces, opens a group and its records, checks them on SEAP, saves them.

FIRST VIEWPORT: the entity line with the score pill; the score bar as tabs (in score, quiet at 0, outside the score); the case sentence as h1; the mirror panel; the start of the case list with its actions.

FORM: Oglinda, position 4 of 7 on the ranked list (dealt lead). seed:5c865262cd41999a

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
