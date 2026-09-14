# Domains atlas

The approved [B mockup](../../mockups/cinecastiga-domains.html) is implemented at `/domenii`. The page uses the existing application navigation, light/dark themes and evidence drawer.

## Interaction

- Rectangle area represents recorded value. Hover or keyboard focus reveals the complete label, CPV prefix, amount and share immediately, even when a rectangle cannot fit text.
- Clicking a parent enters its children in the same atlas. Clicking a leaf opens details. The separate ↗ opens details at any level; the adjacent list offers the same actions for small rectangles and touch screens.
- Breadcrumbs, browser history and shareable URLs preserve the selected year and scope. Search ignores Romanian diacritics and accepts names, prefixes and full CPV codes. Search results are disjoint: matching parents and their descendants are never added together.
- Year changes retain the current chart frame during loading. Failed requests can be retried or dismissed back to the displayed year. Reduced-motion preferences disable entrance and loading animations.
- Source actions open the existing complete row list, with original SEAP links, precise amounts, CSV export and saving to Anchete.

## Data and calculation

The atlas defaults to the latest completed calendar year with data. Annual aggregates come from the existing transaction marts: accepted direct purchases with positive value up to 2 million lei, plus positive allocated contract rows, restricted to records with a CPV code. Values represent recorded purchases and awards, not confirmed payments. Consortium awards are allocated across winners, so the displayed record count is not a distinct-contract count.

The tree partitions actual CPV codes into disjoint numeric prefixes (2 → 4 → 5–8 digits), skipping intermediate levels without branches. It explicitly describes this grouping rather than claiming to reproduce the official CPV hierarchy. General codes ending in zero have separate exact leaves. The initial “Celelalte domenii” rectangle contains all divisions outside the eight largest; its sources use the exact complement.

Stored decimal strings determine additive totals. Literal evidence prefixes preserve exact eight-digit leaves even where the query builder normally broadens general CPV codes. Source scopes retain the chosen year and known-CPV population.

The server caches annual full-code aggregates and the CPV catalogue separately for one hour; each entry fits below Next.js’s cache limit. Concurrent cold requests for a year share one load. The displayed calculation timestamp belongs to the cached query result. No schema change or database write is required.

## Verification

Nine unit tests cover exact partitions and decimals, duplicate-code aggregation, general-code leaves, remainder exclusions, source URLs and default/legacy year handling. The real 2025 dataset contains 45 divisions, 7,252 CPV leaves and 2,386,867 source rows, totaling 178,357,316,781.88 lei when displayed to two decimals. All 10,097 node identities and parent totals reconcile.

`pnpm turbo typecheck lint test build` passes all 20 workspace tasks and 154 tests. Two additional source-query regressions cover annual reference paging and consortium identity.

[21 visual/navigation checks](previews/domains-browser-checks.json), [15 state and evidence checks](previews/domains-state-checks.json), and [15 keyboard/accessibility checks](previews/domains-accessibility-checks.json) pass without runtime exceptions. These include 768/390/320-pixel layouts, failed year loads, Back across application pages, retrying the requested scope, immediate tooltips after scrolling, reduced motion and source-drawer focus restoration.

[Live API reconciliation](previews/domains-source-checks.json) checks the national scope, construction, the remaining divisions, exact general and maintenance CPV leaves, and disjoint search scopes. A one-row CSV preserves its exact stored amount, CPV and original SEAP link. Repeated annual atlas requests complete in roughly 66 ms locally with the same cached calculation timestamp.

The source verification exposed a cold older-year paging timeout: scanning backward through reference IDs could read millions of newer rows before reaching the selected year. Broad earlier-year source pages now select bounded reference keys first, then retrieve the corresponding rows inside the same read-only snapshot. Exact filters, ordering, consortium identities and CSV limits are retained. National source retrieval completed in about 11 seconds in the final local run; large source selections remain slower than navigating the cached atlas. Source text search and alternative sorts retain the existing database timeout.

Authenticated investigation creation was not exercised end to end. The atlas uses the existing save action and ownership checks.
