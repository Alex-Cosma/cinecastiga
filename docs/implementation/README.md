# Approved design in the real application

Implemented from the approved [complete mockup](../../mockups/cinecastiga-complete.html), using the existing Next.js application, query engine, authentication and PostgreSQL data. The mockups remain available for comparison. No database migration or deployment is required to review the local changes.

## Experience

- **Descoperă** introduces the archive through search, a county map and concrete starting questions. Forest green, warm paper colors and restrained orange accents carry into light and dark themes.
- **Explorează** turns the existing builder into an editable Romanian sentence. The searchable catalogue groups all 13 query types into four families. Conditions open in focused dialogs on desktop and sheets on mobile; advanced filters remain available.
- **Anchete** remains the place to preserve findings, notes, query results and selected source scopes. Visitors can discover the feature before signing in. Authentication returns them to the selected question and evidence.

Draft conditions and applied results are separate. Editing a question, switching modes, a failed request or paging an existing answer must not make an old result appear to answer a new question. Exact entity IDs are retained in resolved query links and saved comparisons.

## All 13 questions retain their evidence

Every result has a primary **Vezi înregistrările** action. More specific selections open the same drawer with their exact source scope.

| Question | Additional source selection |
| --- | --- |
| Ranking | One institution, supplier or county |
| Total | Complete applied selection |
| Time series | One year, preserving the original date bounds |
| County map | One county |
| Category breakdown | One CPV group, including the complement represented by “other” |
| Comparison | Either profile, or the complete comparison |
| Change between years | One entity/county and the two endpoint years |
| Network | One partner, or all partners |
| Money flows | One flow, partner or category, including “other” |
| Relationship check | The selected institution–supplier relationship |
| Risk distribution | One histogram bucket or the highlighted profile |
| Risk versus volume | One plotted profile or the complete cohort |
| Superlative | The selected profile |

The drawer shows source counts, exact sums, dates, calculation notes, filters, pagination, CSV export and direct SEAP links. Monetary exports retain stored numeric precision, including consortium shares. Profile evidence explains its historical, all-status acquisition basis; accepted-only totals are explicitly separate. Reconciliation is asserted only when source counts and exact totals match.

The new homepage headline and county map use the same contract/acquisition definitions as their linked questions. Legacy award-based aggregations are not silently redefined.

## Local review

From the repository root, with the existing web environment and PostgreSQL available:

```sh
pnpm --filter web dev --webpack --port 3100
```

Open `http://localhost:3100`, then try a county, a question card, **Toate întrebările**, an editable condition, a result's source list and **Salvează în anchetă**. Repeat at a narrow mobile width and with keyboard navigation.

The explicit Webpack development option avoids a Turbopack cache failure encountered in this local environment. It does not change the application's package scripts.

## Verification and limits

- **83 unit tests pass**, covering query identity, date/source scope, filter transitions, numerical reconciliation, CSV precision and source-link provenance. TypeScript checks pass.
- All 13 result types were exercised against the real database. Integrated browser checks cover desktop and 768/390/320-pixel layouts, source links and guest investigation entry points.
- [Controlled builder checks](previews/builder-checks.json) and [advanced-filter checks](previews/advanced-builder-checks.json) exercise loading, failed requests, edits made during requests, exact filter retention and keyboard focus.
- The source drawer was checked against complete and filtered CSVs, accepted-only views, source-scope validation, keyboard containment and Escape/focus restoration.
- [Final interaction regressions](previews/final-regressions.json) pass 11/11. [Final production browser checks](previews/production-checks.json) pass 11/11 with no runtime exceptions, including complete-ranking restoration and reapplication.
- The standard production build (`pnpm --filter web build`, Turbopack) passes, as does the Webpack build. See [source verification](evidence-verification.md) for live counts, timings and reconciliation details, [homepage reconciliation](previews/discovery-reconciliation.json), and [browser checks](previews/browser-checks.json) for integrated results.

Database verification was read-only. Authenticated investigation creation and email sign-in were not exercised end to end; their existing server-side ownership checks remain in place.

Saved query evidence records the query scope, displayed result, source totals and capture time. Reopening reads current data; it does not claim to be an immutable archive of every source row. CSV export retains the existing 100,000-row limit and discloses truncation before download. Nationwide value/date sorting or text search can reach the existing 20-second SQL timeout; the default indexed source order supports the full national selection.

Pushes to `main` run the full workspace checks and then the existing production deployment workflow. Mockups and verification artifacts remain outside the production application bundle.

Final production screenshots: [homepage](previews/production-home-desktop.png), [question](previews/production-question-desktop.png), [source drawer](previews/production-sources-desktop.png), [mobile homepage](previews/production-home-mobile.png), [mobile sources](previews/production-sources-mobile.png).

## CPV search refinement — 14 September 2026

The category picker now searches the official Romanian CPV catalogue as well as the synonym list. Word matching ignores diacritics, whitespace and word order. Searching `spatii verzi` returns `77310000-6` first and the related landscaping code `45112710-5`; selecting either stores its code. Numeric/prefix searches and colloquial synonyms remain available. Explicit text-array parameter types also fix a reproduced first-request database error. Verified with [11 live API cases](previews/cpv-search-checks.json), a fresh-server request, [desktop/mobile browser checks](previews/cpv-browser-checks.json), and the production build including TypeScript. [Mobile screenshot](previews/cpv-search-mobile.png).

## Stable search dialogs — 14 September 2026

Every searchable question picker, including the local county and question catalogues, now uses a stable responsive frame with an internally scrolling results pane. Loading placeholders, results, empty states and errors do not move the search input, dialog or close button. The focal institution/firm switch remains available during loading, and the loading announcement sits outside the busy results region. Compact layouts retain usable results space on short screens.

Global search uses the same stable-frame behavior and explicit initial/loading/empty/error states. Suggestions remain bound to their query, stale results clear immediately on edits, and the homepage search remains an anchored dropdown.

The production build and TypeScript pass. [72 delayed-response browser checks](previews/modal-stability-checks.json) cover all seven remote picker fields, county/catalogue filtering, global search and desktop/mobile/short layouts; [five additional checks](previews/modal-short-viewport-checks.json) cover a 320×360 viewport, persistent focal controls, loading announcements and Escape/focus restoration. No runtime exceptions. [Loading preview](previews/modal-loading-desktop-CPV.png).

## Release readiness — 14 September 2026

The unfinished natural-language AI flow is disabled through a shared UI/API flag. The tab is visibly unavailable, legacy `q` links open the manual builder with an explanation, and direct natural-language API calls return HTTP 501 before interpretation. All 13 deterministic query types remain available. [Nine release browser/API checks](previews/release-ai-checks.json) pass, including desktop/mobile layout and the absence of AI requests from disabled entry points.

`pnpm turbo typecheck lint test build` passes all 20 tasks across the workspace, including 143 unit tests (83 web, 43 ingestion, 16 scraper clients and 1 domain). The release audit found no new schema, environment or runtime-asset requirement. No database migration, source-data write or aggregate rebuild is part of this deployment.

## Domains atlas — 14 September 2026

The approved B design replaces the former static `/domenii` chart with an interactive atlas of the actual annual CPV data. Parent rectangles drill in locally, leaves open details, and each independent ↗ opens details directly. Immediate tooltips, a readable companion list, disjoint search results, year selection and exact source drawers carry the exploration through to original SEAP records. See [implementation and data definitions](domains-atlas.md), [desktop](previews/domains-desktop.png), [mobile](previews/domains-mobile.png), and [sources](previews/domains-sources.png).
