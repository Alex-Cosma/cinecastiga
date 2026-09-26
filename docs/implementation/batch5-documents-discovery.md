# Batch 5 — documents: discovery and functional mock

26 September 2026. Authorized first step: inventory existing sources and sketch the search → page → saved passage workflow before application integration. Production code and database unchanged.

## Findings in this checkout and local database

- `raw.raw_documents` is an archive of fetched JSON/XML payloads, not a PDF repository (`packages/db/src/schema/raw.ts`). Current schema has no attachment/blob/page/OCR tables.
- TED raw payloads preserve XML (`apps/ingestion/src/scrape/ted/notices.ts`). These can support richer announcement text; XML reference URLs must be classified by their field, never treated wholesale as attachment URLs.
- Contract page `apps/web/app/contracte/[nid]/page.tsx` explicitly says documents are not imported and directs readers to the official notice.
- Existing investigation exports explicitly declare `originalDocumentsArchived: false` (`apps/web/lib/evidence-bundle.ts`). Frozen procurement rows are not frozen attachments.
- Local read-only SYSTEM(0.05) REPEATABLE(26) sample examined 8,998 raw rows: 8,431 direct acquisition list, 10 direct detail, 153 award list, 142 award contracts, 164 tender list, 28 TED eForms, 70 TED legacy. All ten sampled direct details have an empty `documents` array. This sample does not establish archive-wide or live-source absence.
- TED sample contains notice references and URLs, including SEAP; no inference that those are downloaded tender documentation. Full inventory count exceeded a 15-second read-only timeout and was abandoned; no full-scan coverage claim. Artifact: `previews/batch5-documents/data-inventory.json`. No live SEAP request or scraping was performed.

## First deliverable

`mockups/documents/` extends the existing private investigation vocabulary. It contains explicitly fictional procurement documents, two generated reference PDFs, indexed sample text and illustrative missing-text/OCR states. Search is diacritic-insensitive. Reader opens the exact matching page; a paragraph or native text selection can be retained with an optional question and note. Saved passages include source, version, PDF SHA-256 and page, persist only in localStorage, and export as JSON notes. The reference PDF remains one action away. Manual PDF addition is browser-only metadata plus a temporary object URL, not text extraction.

## Proposed implementation order

1. **Private document store and provenance:** add files to an authorized investigation; optionally bind to an exact contract/notice identifier. Preserve original bytes, SHA-256, MIME/size, added-by/date, declared source URL/date and acquisition route (source download vs reporter upload). File identity is not authentication of contents. Use investigation membership authorization on every file/page/search/export request; opaque storage keys and private storage, no public static uploads.
2. **Text and page indexing:** PDF text first; OCR only when a page lacks usable text. Store page number, original page image, extraction engine/version/language and stable text offsets/bounding boxes. Preserve failed/partial/encrypted states, per-page coverage and extraction revisions. OCR text is a derivative and corrections never replace original bytes. Asynchronous idempotent jobs with progress, bounded resources and retry; no claim that this worker exists yet.
3. **Search and review:** full-text query over titles and authorized page text; Romanian diacritic folding, exact phrases, page snippets. Use PostgreSQL text indexing first unless corpus measurements justify a separate engine. Counts distinguish documents with text from link-only/pending/failed documents. Deep links bind document version and physical PDF page, with any printed page label separate.
4. **Passage preservation:** extend investigation evidence with immutable document version, quote, physical page, extraction revision, text offsets/quads, original source and user note/question/verification state. Keep native OCR text, reader correction and note distinct. Include exact referenced originals and a manifest in a future document-aware export; preserve existing export semantics until implemented. Viewer can read/search, editor can add/annotate, revoked membership cannot retrieve files.
5. **Automatic collection, separately validated:** start with URLs genuinely identified as procurement documents in raw source fields. Validate linkage, public accessibility and file identity, retain failures. External file fetches require URL/redirect validation, response limits and private-network protection; process PDFs in isolated bounded workers. Existing browser access limits to SEAP remain a constraint. Do not invent a national PDF corpus.

Two-document comparison is the next slice, after reliable original/version/page identity. No legal interpretation, source completeness or wrongdoing is inferred from a match.

## Acceptance for real integration

Cross-case authorization and revocation, malformed/encrypted/large PDFs, interrupted/retried extraction, Romanian search, immutable re-extraction/version anchors, exact page/quote/original hash, export integrity, missing OCR coverage, keyboard/mobile navigation, and database-isolated tests before enabling uploads.

## Completed mock verification

24browser assertions passed at1440/800/390/320px;7full-page light/dark/desktop/mobile captures checked. Two real fictional PDFs (3and1physical pages) generated from the same source text used in the reader. Independent finish review found a native selection boundary that could include helper-button wording; corrected with source-paragraph endpoint guards and an independent exact-substring check before save. A negative selection-crossing-helper check now passes, alongside valid substring selection. Reviewer verdict pass: ship, listed fix resolved. Review used a fresh generic agent and the degraded contract because a dedicated role is unavailable. No claim of production OCR/upload security or live collection follows from these checks.

User then requested a cautious1–2institution automatic-fetch pilot: see `batch5-document-pilot.md`. Institution preference was asked asynchronously; no live source request has been made. Local Buzău discovery found only generic buyer-profile SEAP links in two TED notices, not attachment URLs, and two version2SEAP notice IDs. Pilot endpoint discovery remains required.
