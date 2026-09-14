# Complete question coverage — proposal A

This document records a read-only inspection of the current query vocabulary, builder, and compiler. It is a design and implementation acceptance plan, **not evidence that all 13 types are implemented or tested in the new mockup**. No production or prototype code is changed by this document.

The authoritative vocabulary contains exactly 13 blocks in [spec.ts:7](../../apps/web/lib/ask/spec.ts#L7). The current builder offers all 13 in [Builder.tsx:111](../../apps/web/app/intreaba/Builder.tsx#L111).

## Coverage matrix

“Transaction scope” below means the selected dataset plus CPV subject, buyer county, authority kind, authority/supplier identity, locality, competition, administrator-linked suppliers, latest-filing employee bounds, and period. The shared implementation is [compile.ts:563](../../apps/web/lib/ask/compile.ts#L563). Exceptions are stated explicitly.

| Engine block | Editable question example | Required inputs and supported scope | Evidence path |
| --- | --- | --- | --- |
| `table` | Cine încasează cel mai mult de la [spitalele] din [Cluj]? | Authority/supplier/county dimension; value or count; optional top N. Transaction scope. Per-capita ranking only for authorities with known population. [Compiler:778](../../apps/web/lib/ask/compile.ts#L778) | Matching transactions; optional selected-row identity. |
| `stat` | Cât au cheltuit [spitalele] din [Cluj] în [2026]? | Total value or transaction count within transaction scope. [Compiler:680](../../apps/web/lib/ask/compile.ts#L680) | All matching transactions. |
| `timeseries` | Cum au evoluat cheltuielile [spitalelor] din [Cluj]? | Annual value/count series within transaction scope. [Compiler:727](../../apps/web/lib/ask/compile.ts#L727) | Matching transactions, optionally for the selected year. |
| `map` | În ce județe cheltuie [spitalele] cel mai mult? | County breakdown by value/count. Other transaction filters apply, but county/locality filters are prohibited. [Validation:378](../../apps/web/lib/ask/spec.ts#L378), [compiler:755](../../apps/web/lib/ask/compile.ts#L755) | Matching transactions, optionally for the selected county. |
| `breakdown` | Pe ce au cheltuit [spitalele] din [Cluj]? | Composition by CPV and value within transaction scope. A subject filter descends further into that CPV subtree. [Compiler:1058](../../apps/web/lib/ask/compile.ts#L1058) | Matching transactions, optionally for the selected category. |
| `trend` | Cine și-a schimbat cel mai mult cheltuielile între [2024] și [2026]? | Dimension, two distinct years, optional top N. Ranks absolute value differences between the two endpoints; ordinary range/month bounds are bypassed. Other transaction filters apply. [Compiler:1345](../../apps/web/lib/ask/compile.ts#L1345) | Transactions in the two endpoint years; current generic drill needs alignment. |
| `network` | Cu cine lucrează [Spitalul Județean Cluj]? | One named authority/supplier. Shows its top 14 procurement partners. Uses transaction scope except both entity IDs and locality are dropped, then only the focal ID is restored. [Compiler:1218](../../apps/web/lib/ask/compile.ts#L1218) | Focal procurement records and selected partner records; current generic drill needs alignment. |
| `sankey` | Cum se împart banii [Spitalului Județean Cluj] între parteneri și categorii? | One named authority/supplier. Same identity/locality exception as network. Value flows with smaller partner/category groups combined into “other.” [Compiler:1157](../../apps/web/lib/ask/compile.ts#L1157) | Focal records and selected flow records; current generic drill needs alignment. |
| `fact_check` | A cumpărat [autoritatea] de la [firma] în [2026]? | Both named entities required. Transaction scope applies. Returns existence, count/value and up to five examples. [Validation:374](../../apps/web/lib/ask/spec.ts#L374), [compiler:1295](../../apps/web/lib/ask/compile.ts#L1295) | Matching transactions. Empty answer: “Nu am găsit în datele selectate.” |
| `compare` | Cum se compară profilurile [autorității A] și [autorității B]? | Two entities of the same role. Reads full-activity DA profiles; selected dataset and all ordinary transaction filters are ignored. [Compiler:961](../../apps/web/lib/ask/compile.ts#L961) | Both profiles, indicator explanations and related records; no direct matching-row drill for this block. |
| `distribution` | Cât de neobișnuit este profilul de risc al [entității]? | One named entity. DA risk population of the same role with at least 10 DAs. County filters population; kind/locality apply only to authority populations. Other transaction filters do not apply. [Compiler:1008](../../apps/web/lib/ask/compile.ts#L1008) | Focal profile, population definition, indicator methodology and supporting records. |
| `scatter` | Cine iese din tipar ca risc și volum dintre [autorități]? | Authority/supplier dimension; same limited DA profile scope as distribution. Selected outlier/high-volume points plus population density. [Compiler:1091](../../apps/web/lib/ask/compile.ts#L1091) | Selected entity profiles and risk/volume definitions; no direct matching-row drill. |
| `entity_card` | Cine are cea mai mare [valoare / valoare a indicelui de risc] dintre [spitale]? | A superlative winner, not an arbitrary named entity profile. Authority/supplier population with at least 20 DAs, including when ranked by value. Limited profile scope as above. Builder requests kind and ranking criterion. [Compiler:1248](../../apps/web/lib/ask/compile.ts#L1248), [builder:171](../../apps/web/app/intreaba/Builder.tsx#L171) | Winning entity profile, cohort/criterion explanation and supporting records. |

## Scope rules the interface must enforce

- Treat question intent separately from visual presentation. Table versus bars may preserve meaning; transaction totals versus a risk profile can change data scope.
- The four profile blocks use [a separate filter fragment](../../apps/web/lib/ask/compile.ts#L630). Their risk/activity values cover DA profiles, not the currently selected transaction period or dataset. Show that scope before applying the question; do not leave unsupported condition chips looking active.
- The compiler implements per-capita calculation only in authority `table` results. `stat`, `timeseries`, `map`, and `breakdown` return raw value/count aggregates. Although validation accepts per-capita outside the table restriction, the new UI must not offer it there without additional engine work. [Validation:358](../../apps/web/lib/ask/spec.ts#L358), [calculation:849](../../apps/web/lib/ask/compile.ts#L849)
- The network is a procurement-partner network; it does not establish ownership or personal connections. Risk indicators are statistical signals requiring investigation.
- Employee conditions use the latest filed accounts and exclude suppliers without a filing. Administrator conditions use current legal representatives, not necessarily historical representatives or owners. [Compiler:517](../../apps/web/lib/ask/compile.ts#L517)
- Preserve exact selected identities. Current focal validation expects names even when IDs exist; suggestions omit entity IDs and `compareWith` is name-only. [Validation:363](../../apps/web/lib/ask/spec.ts#L363), [suggestions:192](../../apps/web/app/intreaba/Builder.tsx#L192)
- Nine blocks support direct row drilldown; the four profile blocks do not. [Drillable list:1478](../../apps/web/lib/ask/compile.ts#L1478)
- Use the same effective scope for answer and evidence. Current [generic row queries](../../apps/web/lib/ask/compile.ts#L1555) reapply original filters, which can disagree with network/sankey identity/locality handling, trend endpoint selection, or compiler-clamped periods. This needs reconciliation before promising exact answer-source equivalence.

## Proposed acceptance gate — required independently for every block

Maintain one exhaustive registry keyed by the existing `Block` type. Each definition contains the human question, required slots, supported filters/measures, effective scope, result renderer, and evidence route. Exhaustiveness against the authoritative vocabulary prevents a block from disappearing during redesign.

Each of the following 13 entries remains **planned / not verified in the new interface** until all eight checks below pass:

`table` · `stat` · `timeseries` · `map` · `breakdown` · `trend` · `network` · `sankey` · `fact_check` · `compare` · `distribution` · `scatter` · `entity_card`

1. **Discoverable:** reachable through a plain-language question template, searchable catalogue, and relevant follow-up actions; it does not require knowing the engine block name.
2. **Complete inputs:** every required entity, dimension, period endpoint or criterion has a focused accessible control; incomplete and empty-result states explain the next action.
3. **Honest scope:** visible sentence and conditions describe exactly what the engine applies. Unsupported controls cannot masquerade as active filters.
4. **Canonical query:** editing, applying, sharing, and revisiting preserve a validated `AskSpec`, resolved identities, and declared effective scope; draft edits do not change the applied answer.
5. **Appropriate evidence:** transaction blocks expose equivalent underlying records; profile blocks expose profiles, indicator methodology, cohort definition, and relevant supporting records.
6. **Export and Anchete:** the appropriate export includes scope/provenance; saving and restoring in Anchete reproduces the applied question and its evidence reference, with data freshness stated.
7. **Desktop and mobile:** keyboard operation, focused pickers/sheets, result navigation, source inspection, and saved-query restoration work at both sizes.
8. **No silent filter loss:** switching intent preserves compatible conditions and explicitly explains any proposed scope changes before applying. Cancellation restores the previous question.

In addition to one complete journey per type, transition checks must cover county → map, contracts/period → profile risk, locality/second entity → network or flow, one year → two-year trend, and returning from any branch to the original saved question.
