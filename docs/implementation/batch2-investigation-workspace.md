# Batch 2: a reproducible investigation

Implemented locally. Batch 1 established consistent analytic populations and source provenance. This batch adds a private reporting workflow around those foundations; it does not add a corruption verdict. Final acceptance checks are recorded below.

## Follow-up found during manual-review preparation

Ordinary accounts created through `/admin` are not marked email-verified, and the configured emailed two-factor login does not currently update that flag. Invitation acceptance correctly requires the intended authenticated account to have a verified email, so a newly provisioned watchdog can log in but cannot accept an invitation. The earlier collaboration tests used explicitly verified fixtures and therefore did not cover this onboarding gap. It was disclosed to the user and remains to be fixed before Batch 3; preserve the invitation protections and verify email ownership through an actual server-side proof flow. See [the continuation handoff](../../HANDOFF.md) for the precise implementation anchors and required regression checks.

## Reporter journey

Semnale or Radiografie → exact sources → preserve a version → link supporting or contrary evidence to a question → review privately → export a portable dossier.

The existing green/ivory interface and sentence builder remain the visual foundation. Anchete groups work into **Întrebări, Dovezi, Cronologie and De verificat**. Questions support alternative explanations and evidence marked as supporting, contradicting or requiring verification. Notes, dated events and tasks retain an optimistic revision history; conflicting edits return 409. Archived entries remain in that history. The interface shows the latest 200 revisions; ZIP export contains the complete history.

Source actions remain adjacent to the finding. Captures expose queued/running/complete/failed states and retain earlier complete versions. Legacy clips are explicitly unverified until a server capture exists. Frozen lists show exact decimals and links to the original SEAP/TED source. Original remote pages and documents are not archived.

## Private collaboration

The owner creates an invitation link for a named, verified email address and chooses editor or reader access. Invitations expire after seven days and can be revoked; accepted invitations cannot be replayed. Users send links themselves; the application sends no invitation emails.

Editors can contribute and organize evidence. Readers can consult and export. Only the owner manages membership or deletes the case. Revocation prevents subsequent private reads and writes. An export already authorized at download start can finish without holding up revocation or workspace edits. The editorial status “Publicată editorial” does not make the private workspace public.

## Reusable questions and precise selection

The thirteen query views retain their source paths. “Selecție precisă” progressively reveals grouped AND/OR conditions for dates, exact value bounds, institutions, suppliers, CPV prefixes and counties. Groups can include or exclude lists. Limits are eight groups, eight conditions per group and 32 conditions total; each list allows 100 values. The answer, selected source rows and exports share the same predicates.

A minimum-record threshold selects authorities or suppliers with at least N records in the complete selection before a chart subgroup is opened. This option is unavailable for the difference-between-years view, with an explicit explanation. Historical risk/profile views reject transaction conditions they cannot honor rather than discarding them.

New comparisons use the same transaction selection for both entities. Historical profile comparison remains available explicitly; old comparison links preserve their original profile semantics. Profile risk measures do not appear in scoped transaction comparisons.

Private recipes preserve each version's full question and conditions. Opening a recipe recalculates current data when applied; preserving the current evidence is a separate capture action. Saved source links also restore subgroup and local search/state/channel filters.

## Source populations

`signal-evidence.ts` selects the records behind all thirteen current signal categories. Annual splitting and single-offer signals retain recorded source references. Other categories explicitly reconstruct their population from current records using the original criteria. Financial signals preserve relevant financial rows separately. Shared-representative signals resolve the old name/year identity only when unambiguous; an uncertain match does not produce a guessed group.

`radiografie-evidence.ts` reconstructs a rolling window using its pair, CPV class, purchase type, dates and the historical ceiling of each acquisition. Contract patterns retain notice/member identities and canonical supplier allocations. Because their numeric IDs can be reused after a rebuild, source links and captures also bind an exact server-derived identity; stale pages, queued captures and recaptures reject a changed pattern. They disclose the difference between those shares and full contract values in the lot matrix.

Neither calculation equates contract values with payments. Missing source references and current/recorded total mismatches remain visible. Named findings over 200,000 source rows are rejected explicitly; no truncated finding is marked complete. Query captures use a full-population SQL persistence path with no row-count cap. See [capture and export details](./batch2-frozen-evidence.md) for transaction guarantees, timeouts and recovery.

## Release and operations

Additive migrations `0028_frozen_evidence`, `0029_investigation_workspace` and `0030_private_query_recipes` have been generated with canonical Drizzle snapshots and applied locally. The nine new tables are isolated in the app schema and must survive procurement-data refreshes. Batch 2 requires no new ingestion rebuild. Batch 1's coordinated code/data release requirements still apply; a web-only deployment does not perform ingestion or migrations.

Saving starts background capture work after the response. Jobs persist across restart, expose retry in the UI, and can be resumed with the documented CLI. There is no new continuously running ingestion or worker process.

No changes have been committed, pushed or deployed as part of this batch.

## Verification

- Production build, workspace typecheck and lint pass. Default test run: 168 web, 82 ingestion, 26 domain and 16 scraper tests pass; database integration suites are opt-in.
- Dedicated PostgreSQL integration tests cover capture immutability, NULL versus zero, decimal precision, consortium allocations, private roles, revocation, optimistic revisions, grouped predicates and recipe versioning. A real 100,001-row capture verifies that large query captures are not truncated.
- [Query source matrix](./previews/batch2/query-source-matrix.json): all 13 query types across 17 scoped cases pass result and source execution against real local data. Includes grouped conditions, minimum-record cohorts, both comparison modes and stream selection; returned-page checks are separate from full capture completeness tests.
- [Source selection checks](./previews/batch2/source-checks.json): one real example for every signal category plus rolling windows and lot patterns. Compatible totals reconcile; notice-level differences are disclosed.
- [Authenticated API checks](./previews/batch2/api-checks.json): save/recapture, frozen pagination, questions, alternatives, invitations, editor/reader access, revocation, recipe versions and private export. A 201-row contract subset totals exactly 1,488,754,172.83 RON.
- [Offline ZIP verification](./previews/batch2/zip-checks.json): ZIP CRC, every manifest SHA-256/length, exact decimal sums and full row counts for three capture versions, including workspace evidence relationships and revisions.
- [Pattern identity checks](./previews/batch2/pattern-api-check.json): missing or stale identities are rejected, source pages remain bound to their finding, and queued captures retain the server descriptor.
- [Desktop/mobile checks](./previews/batch2/browser-checks.json) and [query/sharing checks](./previews/batch2/query-browser-checks.json): keyboard tab navigation, task updates, restored query conditions and local source filters, private recipes and sharing controls. No uncaught browser exceptions or page overflow. [Final confirmation](./previews/batch2/final-browser-checks.json) verifies actual form creation, readable mobile conditions, task labels, unwrapped dates and clean restored questions; a [delayed response check](./previews/batch2/delayed-query-check.json) verifies that edits made while loading are preserved.

Write integration tests use the dedicated `seap_test_batch2_20260919` database. HTTP/browser checks use clearly named synthetic accounts/cases on the local application, never real editorial material. Procurement source checks are read-only.

Final independent visual review passed after the bounded fixes. All four synthetic users, their sessions/cases/recipes, and the disposable test database have been removed. The production-mode local app remains available at http://localhost:3110.
