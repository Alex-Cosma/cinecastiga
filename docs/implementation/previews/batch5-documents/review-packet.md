# Batch 5 document prototype: finish packet

Task: user accepted inventory existing documents and functional sketch of documents/search/saved passages before application changes. User additionally asks how to run an extremely bounded automatic-fetch pilot (1–2 authorities); no live request has been made. Pilot is independent of this prototype review.

Mode Operate, ordinary extension of existing private Anchete, not a redesign. Artifact: `mockups/documents/index.html`, `style.css`, `app.js`, `data.js`, two real synthetic PDF files under fixtures. Runtime http://127.0.0.1:3112/documents/. Existing app3110 and database untouched.

Direction: `apps/web/.impeccable/surfaces/mockups-documents-index-html.md`. System: PRODUCT.md, DESIGN.md. Existing visual reference `docs/implementation/previews/batch2/workspace-desktop.png`. No comp or quality-bar card: a precisely scoped code-led extension, mock first. No production extraction, OCR, upload or server save is claimed; banner and contextual notes expose the boundary. A scan state is illustrative; its sample reference PDF truthfully says digitally generated in the UI.

Required full-page captures, all opened and inspected after final confirmation:
- `docs/implementation/previews/batch5-documents/library-desktop.png` 1440
- `docs/implementation/previews/batch5-documents/search-desktop.png` 1440
- `docs/implementation/previews/batch5-documents/reader-desktop.png` 1440
- `docs/implementation/previews/batch5-documents/reader-dark.png` 1440
- `docs/implementation/previews/batch5-documents/reader-mobile.png` 390
- `docs/implementation/previews/batch5-documents/saved-mobile.png` 390
- `docs/implementation/previews/batch5-documents/search-mobile.png` 390; includes browser-only uploaded fixture so five documents instead of four.

`verification.json`:23 browser assertions, including diacritics, exact page/PDF hash/quote, reload persistence, selection, missing documents, OCR unverified state, simulated metadata-only upload, no overflow1440/800/390/320 and no runtime exceptions. Initial harness assumptions (4matches, not3; quoted CSS attribute selector) corrected. Final screenshots settle theme transitions. Two-document comparison deferred. Initial visual inspection prompted mobile paragraph selection to jump to save form; stale hash callback guarded.

Detector ran once: `design-detect.json`, one primary warning on thick navigation underline combined on minified CSS line with unrelated radii. Navigation has zero radius and is the incumbent approved underline; inspect rather than removing. Seven advisories: strengthened secondary-text color #596553 for readable small text and incumbent-scale intermediate sizes. No changes to canonical design files. No shipping raster assets: screenshots are review evidence and PDFs are authored text fixtures.

Scope of review: usable, honest functional mock with original-source access; not production upload security or real OCR. Return disposition and five contract sections; document material fixes if any. Write only `finish-review.md` in this packet directory.
