# All thirteen questions, with the records within reach

Before-implementation design · 13 September 2026

Build a separate offline artifact, `mockups/cinecastiga-complete.html`. Reuse the approved ivory, forest-green, mint and restrained orange visual language. Preserve the existing prototypes and production code. This design extends the editable-question approach to the complete thirteen-type catalogue and makes evidence a permanent part of the answer.

## The promise at every answer

The answer header always contains **Vezi înregistrările · N**, alongside **Salvează în anchetă**. Immediately below it, a quiet verification strip reads **N înregistrări → suma exactă → rezultatul afișat**. A chart mark, ranked row, map county, relationship, comparison side or year opens the corresponding subset. The main action always means the entire applied answer scope, independent of the displayed top-N limit.

Evidence opens as a roomy side drawer on desktop and a full-screen sheet on mobile. Its heading states exactly what was selected. It contains the question's applied conditions, exact record count, exact sum, date coverage, the calculation and a table of authentic source records. Each row exposes date, buyer, supplier, description, recorded value and a direct **SEAP ↗** link. No intermediate record modal is necessary to reach SEAP. Internal detail remains available separately.

Searching the drawer filters its records and displays **N din M înregistrări · suma celor N afișate**, while retaining the original answer total above. CSV offers the complete evidence set and, when searched, the visible subset as separately named actions. A percentage exposes numerator and denominator. A year-change result exposes both endpoint sums and their difference. Search, top-N and chart selection must never masquerade as the full source scope.

For a profile metric, distinguish three things: the published metric, its input population/formula, and the available transaction evidence. A partial supporting sample must never be described as sufficient to reproduce a full-archive total or score. Use authentic profile inputs when obtainable; otherwise display an explicit unavailable state with the real supporting sample, never a simulated risk score. This is especially important for the four current profile-based operations.

## Finding all thirteen questions

Keep three contextual shortcuts and add a prominent **Toate întrebările · 13** action. It opens a searchable catalogue with four meaningful groups. All thirteen remain reachable without first selecting an entity. Each catalogue entry has a plain-language question, a short description and a small diagram glyph.

| Group | Operations |
| --- | --- |
| Bani și achiziții | table, stat, timeseries, map, breakdown |
| Comparații și schimbări | compare, trend |
| Relații | network, sankey, fact_check |
| Repere și semnale | distribution, scatter, entity_card |

Choosing an operation prepares an editable draft. The existing answer remains visible until **Actualizează răspunsul**. Show any changed scope beside the new draft before application. Query templates request their own necessary slots: ranking dimension/measure/limit; one focal entity for networks, flows and distribution; two entities of the same role for comparison; buyer plus supplier for a relationship check; two distinct years for change; role and criterion for a superlative. Additional conditions appear in a stable ordered row.

## Answer treatments

- **Ranking:** bars or table; exact values; total scope separate from displayed top N.
- **Total:** a large exact or clearly rounded value, count and source-stream split, with the additive calculation exposed.
- **Time:** year columns with exact values and record drill-downs; no invented values for missing coverage.
- **Map:** the existing Romanian county geometry; only sampled counties receive sample values, all others explicitly indicate absence from this extract.
- **Breakdown:** category bars and proportions, with corresponding category records.
- **Comparison:** two profile cards, visible data scope, individual evidence actions and a calculation explanation for each side.
- **Change:** start-year amount, end-year amount and signed difference; evidence restricted to the two endpoints, grouped by year.
- **Network:** the focal buyer or supplier and its procurement counterparties; every edge/partner has an equivalent list entry and source subset.
- **Flow:** buyer/supplier relationships grouped by purchasing category; selected bands expose the exact records and omitted groups are identified.
- **Relationship check:** matching records, count and sum; an empty match says **Nu am găsit în datele selectate**, not an assertion about all history.
- **Risk distribution:** focal entity against an explicitly defined cohort; histogram and accessible cohort table; methodology and evidence at hand.
- **Risk versus volume:** labeled plot and equivalent entity table; both axes disclose their source scope and selected entities have evidence actions.
- **Superlative:** one qualifying entity, the selected criterion and eligible cohort; profile evidence is never replaced by an unrelated sample total.

The comparison and risk views preserve the actual engine's broader profile semantics. The mockup must explain any narrower extracted comparison population. A sample percentile must never be presented as a national percentile.

## Save, restore and small screens

Save the applied query, its effective scope, exact record IDs, source URLs, data date, grouped result, profile provenance where applicable and calculation notes into the existing browser-local Anchete workflow. Saved questions reopen their own state. Record-source tables remain expandable within a dossier. Draft edits are excluded from exports, copied links and investigation saves.

On mobile, the question wraps, phrase editors are bottom sheets, and the source drawer becomes a full-screen sheet. Large charts receive equivalent readable lists. Dialogs support Escape, focus trapping/restoration and visible keyboard focus. Respect reduced-motion preferences. Keep all primary evidence actions within the viewport.

## Review requirements

Verify all thirteen catalogue entries and their required inputs, distinct result treatments, applied/draft separation, empty states, precise evidence subsets, direct source anchors, CSV reconciliation, saved query restoration, keyboard interaction and layouts at 1440, 768, 390 and 320 pixels. Explicitly test chart top N versus full evidence, filtered drawer totals, both years of a change, both parties of a relationship and profile/sample scope boundaries. A source link's presence does not establish live SEAP availability.

## Module handoff contract

New files live under `mockups/complete/src/`; original fragments are reused by a new bundler.

`window.CQ` owns the exact thirteen-entry catalogue, default query, query normalization/validation, query descriptions, supported transitions and calculations over the real extract. Query fields: `block`, `dim`, `dataset`, `authorityKind`, `county`, `yearFrom`, `yearTo`, `category`, `authorityId`, `supplierId`, `compareId`, `rankBy`, `measure`, `topN`, `focusRole`.

`CQ.run(query)` returns an applied result with `block`, `query`, `title`, `scopeLabel`, `scopeNote`, `rows`, `groups`, `total`, `count`, and any type-specific `extra`. Every group has `key`, `label`, `amount`, `count`, `rows`. Profile results state their provenance and supporting-row coverage explicitly. Engine exports `CQ.formatMoney`, `CQ.formatCompact`, `CQ.escape`, `CQ.describe`, `CQ.defaults`, `CQ.blocks`, `CQ.validate`, `CQ.transition`, `CQ.run`.

`window.Answers.render(result, layout)` renders answer-specific content; interactive marks use `data-action="q-evidence" data-key="…"`. Group keys resolve through the applied result only. `window.Evidence.open(result, groupKey)` opens all answer rows or the selected group's exact rows, with direct SEAP anchors and explicit calculation/coverage text. Main app handles catalogues, phrase selection, draft/apply, routing, saves and exports. Modules access `window.UI` lazily because the original app initializes it after module definitions.
