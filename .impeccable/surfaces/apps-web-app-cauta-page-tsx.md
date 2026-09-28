# Căutare /cauta
Mode: Operate. Extends the reviewed local topic-search mockup into the real application. Entry: home/global search, with entity suggestions retained. Scope: public acquisition titles, prepared public document pages, entities; county/UAT typeahead, inclusive year interval, all years by default. Existing geography contains counties/UATs, not a village catalog. No source acquisition on search. No fake watch/save interactions.

## Direction contract
THESIS: One familiar search starts a traceable investigation; distinct result kinds avoid counting a document as another contract.
OWN-WORLD: Preserve forest/ivory, shared typography, open record rows and existing source/document reader workflows.
STORY: Type a subject, narrow place/time, find a contract or exact document page, retain evidence using the existing reader.
FIRST VIEWPORT: Heading, wide query field, compact geography/year/type controls; result navigation then open rows with source actions and a quieter coverage sidebar. Mobile stacks the same reading order. Pending searches retain the preceding result area's height.
FORM: User-approved code-led mockup adapted to actual indexed data; no new concept seed, no new visual world. Result arrangement remains open to user evaluation.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Built surface, 28 September 2026

Local implementation on `work/topic-search`, included in the user-requested local commit and not deployed. `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` remain the canonical incumbent system, checked against `apps/web/app/cauta/page.tsx`, `TopicSearch.tsx`, `topic-search.css`, the approved theme cascade and shared icon component. This ordinary extension does not require a system rewrite.

- Palette and materials: shared forest/ivory variables and their existing dark counterparts; supporting text uses `--ink2`. Open acquisition/entity rows, inset document passages, thin separators and a quieter coverage panel preserve the source-first hierarchy.
- Typography: shared Bricolage headings and IBM Plex body. This surface uses a 32–48px heading (34px below 650px), 23px section headings, 19px record titles, 15px body, and 12–14px supporting text. These observed route values do not replace the canonical type ramp.
- Layout and controls: 1120px content maximum, a 270px coverage column, 900px intermediate adaptation and 650px single-column stacking. Main fields/actions have a 44px minimum height. Existing rounded controls, semantic active underlines, shared focus treatment, and reduced-motion support remain in use.
- State truth: retained records use the last completed response's query, place, interval, type, matching mode, result category, entity role and page. A pending or failed request displays that full retained scope; result tabs, role controls and pagination are disabled until another response completes. Copying the search uses the completed scope. Error states do not claim zero matches or a successful refresh.
- Sources and assets: real county/UAT catalog and local archived records; exact contract decimals are labeled as registered values, not payments. Historical missing-title coverage is explicit. Document matches link to actual pages and the existing evidence reader. No raster was added or generated; icons reuse the existing SVG system.

## Finish evidence and limits

The local index completed with 20,553,037 rows and 16,068,616 searchable titles (6,424 MB), in 988 seconds (16m28s), at `2026-09-28T12:49:20.937997Z`. Localhost runs with `DOCUMENTS_ENABLED=false`; search used archived data without SEAP traffic. No production operation or deployment was performed.

Build and web/ingestion/database type checks passed; the production build and web type check also passed after the final state correction. The local `/cauta` preview returned HTTP 200 after the build. The isolated test run passed 25 tests (12 integration, 6 shared, 7 documents); its test database was cleaned up. The final local browser run has 52 passing checks, no runtime errors and no external requests, including failed page/tab/place transitions. Real-data light/dark desktop/mobile, place, period, empty, error, document and retained-error captures are in `.impeccable/review/topic-search-live/` (Git-ignored). These are local checks, not production or comprehensive accessibility certification.

The independent review found no material visual defect and identified one state-truth defect: pending/failed scope labels could describe retained records incorrectly. The implementation now binds retained result presentation to the completed response, confirmed by the follow-up browser run. Final review verdict: **SHIP** for the scored state-truth correction, with no open fix. The independent reviewer was a generic substitute for the unavailable specialized reviewer; its evidence is in `.impeccable/review/topic-search-live/finish-review.md`. The documenter likewise used the generic substitute role with the supplied degraded documenter and document references.

The detector reported 15 findings: one active-underline false positive against an incumbent convention and 14 type-ramp/radius advisories. Local type sizes and the small 2px highlight/5px count radii remain surface implementation values, not new global tokens. They were not canonized or redesigned to silence detector output. Existing canonical drift remains outside this extension's scope.

Detailed behavior, operational cost and verification evidence: [Batch 5B implementation](../../docs/implementation/batch5b-topic-search-implementation.md).
