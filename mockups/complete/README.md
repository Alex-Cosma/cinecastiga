# Thirteen questions. Every answer, down to the source.

**[Open the complete interactive mockup](../cinecastiga-complete.html)** in a browser. It is a single offline file, approximately 8 MB, including its fonts, maps and authentic source data.

The [design was written before implementation](../../docs/mockups/06-complete-evidence-design.md). This is a separate prototype: the original designs, first question sketch, deployed application and database remain unchanged.

## Transparency is the main interaction

Every applied answer has **Vezi înregistrările · N** beside it. Its verification strip connects the source count, exact sum and resulting analysis. Click a chart mark, supplier, county, flow, year or profile to open that portion's records.

The evidence drawer includes the question and scope, exact amount, date coverage, calculation, buyer, supplier, recorded value, state where available, and a **direct SEAP link on every row**. The link does not require opening another details screen. Optional details show the imported identifiers and fields.

Search and status filters retain the original total and show a separate filtered count and sum. **Export all** and **export filtered** have separate actions. Pagination changes only what is on screen. A displayed top-five ranking does not restrict the main source list.

For derived figures, the drawer explains the numerator and denominator, the two endpoints of a change, or the risk formula. It includes all available underlying records, with honest distinctions between an illustrative transaction selection, a complete historical profile and a limited comparison population.

## Try these journeys

1. **Start simple:** open the hospital supplier ranking. Inspect the exact eight-record sum, then click DR.MAX to see its one matching record and direct SEAP link. Return to all records; search a supplier and compare the full and filtered sums.
2. **Ask more precisely:** change the period to 2026, add Sănătate, then update. Draft changes leave the previous answer and its evidence intact until applied.
3. **Explore every question:** open **Toate întrebările · 13**. Search or browse the four groups. Select a question, inspect any proposed scope changes, then update the answer.
4. **Check a relationship:** select the buyer–supplier question. Both identities remain editable. The resulting records belong to those exact parties and conditions. A missing match is explicitly limited to the selected data.
5. **Reproduce a change:** choose the change-between-years question. Open a row to see the two year totals and their subtraction, with only those endpoint records.
6. **Reproduce a profile:** choose a comparison. Open one institution's complete historical sources. Inspect the total, then filter the offer status to accepted and see its separate count and sum.
7. **Inspect a signal:** in a risk view or profile's evidence drawer, expand the calculation and open the fragmentation example. Each example includes all three actual records needed to reproduce that particular group sum and threshold comparison.
8. **Keep the evidence:** save a question in Anchete. Open its sources, add notes, reopen the question, and export the dossier. The JSON export includes the complete referenced records and their source URLs.

## All thirteen query types

| Group | Query | Result treatment |
| --- | --- | --- |
| Bani și achiziții | Ranking | Bars and equivalent table |
| Bani și achiziții | Total | Total and additive source-stream breakdown |
| Bani și achiziții | Time series | Annual columns and exact-value table |
| Bani și achiziții | County map | Romanian county map and corresponding list |
| Bani și achiziții | Category breakdown | Proportions, category amounts and table |
| Comparații și schimbări | Comparison | Two historical profiles and comparison table |
| Comparații și schimbări | Change between years | Endpoint amounts and signed differences |
| Relații | Network | Procurement counterparties and complete partner list |
| Relații | Money flows | Partner–category bands and complete flow table |
| Relații | Relationship check | Matching identities, count, amount and sources |
| Repere și semnale | Risk distribution | Explicit cohort, histogram and profile table |
| Repere și semnale | Risk versus volume | Risk/count plot and exact profile table |
| Repere și semnale | Superlative | Highest-value profile, optional risk criterion and explicit ties |

All thirteen are reachable from the catalogue. The structured state is deterministic and encoded in the URL. The original discovery, entity and investigation screens remain available in this artifact.

## Authentic data and an important existing profile rule

Transaction questions use the original **48 real records from four authorities**, selected from 2024–2026. These include contracts and direct acquisitions; this is a selection rather than all activity. Contract values may be framework ceilings or amendments, and do not establish actual payments. County indicates the buying authority's location. Direct-acquisition descriptions use CPV labels, identified in the source list; they are not original notice titles.

Profile questions use a new read-only extraction of **39,343 historical direct-acquisition records**. Their total is **589,214,798.07 lei**. Counts and decimal sums reconcile exactly to the four existing `marts.entity_flags` profiles. Each record has its original SEAP reference, value, date, parties and imported state.

The current profile rule includes values up to 2 million lei **regardless of offer state**. The extracted population therefore includes **32,867 accepted offers and 6,476 refused or expired offers**. The mockup labels this as recorded profile value, shows the offer states and accepted-only subtotals, and never describes it as paid expenditure or exclusively awarded acquisitions. This finding documents existing semantics; the database and production calculation were not changed.

All four actual risk indices are **0.20**: one active indicator out of the five applicable authority indicators. The active indicator is fragmentation. No artificial difference between profiles, invented national percentile or fictional risk score is introduced. Each profile includes an authentic three-record example of the flagged group, with its sum and threshold. That example proves the selected group's arithmetic; the complete historical profile remains a distinct evidence set.

Comparison and risk views use this four-authority population. Profile operations currently support authorities only; supplier profiles are not included in the extract. They do not pretend to cover all Romanian authorities or accept transaction-period filters that the current profile computation ignores. Scope changes are disclosed in the pending question before application. The other transaction views continue to use the 48-record selection.

## Evidence saved in Anchete

Large source lists are stored as immutable record IDs plus a SHA-256 identity of the embedded source snapshot, keeping browser-local dossiers manageable. On this same artifact, source lists resolve against that exact snapshot. The portable JSON export expands every reference into a full record, including its state and SEAP URL. Smaller snapshots also retain their records directly.

This mockup uses a separate local-storage key from earlier prototypes. There is no account or server persistence. A copied `file:` link requires this HTML file on the other device. Source links follow the project's existing SEAP URL conventions; their availability on the live site has not been verified from this device.

## Review artifacts and rebuilding

Screenshots and the final browser-check report are in [previews](previews/). All 89 integrated browser checks passed, covering all thirteen types, exact source subsets, CSV exports, saved evidence, keyboard interactions and widths from 320 to 1440 pixels; no application runtime errors were recorded. The new modules are under `src/`. Rebuild with:

```sh
python3 mockups/complete/src/build.py
```

The bundler adapts copies of the original mockup modules in memory, using checked replacement anchors. It does not modify the original files. The engine, answer renderers, question editor and evidence drawer are separate modules to make the implementation handoff reviewable.
