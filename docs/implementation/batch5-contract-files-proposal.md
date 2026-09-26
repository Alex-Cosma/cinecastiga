# Contract files on demand — proposal,26September2026

Status: functional mock completed locally; production integration remains proposed. User likes the mock and asks where processed content will be useful. Extends the existing Operate-mode UI and document pilot. No additional SEAP requests: pilot total remains18,1downloadedPDF.

## Local mock and proposed use of processed content

Preview: http://127.0.0.1:3112/contract-files/ — code and scope in `mockups/contract-files/README.md`. Real local PDF/P7S/OCR fixtures, simulated acquisition queue, no production worker. Browser verification:26checks passed; evidence under `docs/implementation/previews/batch5-contract-files/`.

Proposed first implementation (discussion, not yet built):

1. In the document reader, search extracted native/OCR text and jump to the corresponding original page; show the passage beside that page. Mark OCR as machine-recognized and retain original bytes.
2. On the contract page, one search across prepared documents, with filename, page and short matching passage. Explicit coverage such as “Cauți în2din5fișiere”; distinguish pending, unsupported and failed processing from no matches. Processing creates reusable indexed text, not repeated OCR on each search.
3. In Anchete, save a selected passage with a note and its contract, source document, version/hash and original page reference. Export should preserve those references. A saved OCR passage remains verifiable against the page, not an automatically validated factual claim.

Once a file is ready, make the useful actions visible where the user initiated work: open/search/read/save a passage. Avoid requiring a separate processing dashboard to benefit. Later scope: search across institutions/contracts and compare specifications with page-level references; similarity flags guide human review and do not establish wrongdoing. Existing `mockups/documents/` separately demonstrates a document-and-quote concept; the contract mock currently has PDF/OCR viewing but does not implement text search or passage saving.

## Intended experience

- EvidenceDrawer record title opens the corresponding local detail page in a new tab, preserving the query, filters, pagination and drawer. Actual titles must be included in drill data: current drawer renders code/date/CPV, not contract title. Existing /contracte/[nid] covers awarded procedure contracts; /contracte/i/[cid] resolves internal IDs. Direct acquisitions also appear in drawer and need a real local detail route rather than a broken contract link or silent SEAP redirect.
- Detail page has a Files section with available source metadata (name, type, date when available), last checked timestamp and source notice. Fetch/cache metadata separately from file bytes, handle pagination and distinguish unqueried/unavailable from confirmed empty. Pilot proved list endpoint reports9documents while first page contained5; file contents are not known from metadata. Availability for other notice families/direct acquisitions must be established, not inferred from the SCN pilot.
- Distinguish documents of the procurement/notice from documents specific to a contract/lot. Maintain explicit verified relationship, sharing an existing stored document across related contracts instead of duplicating it.
- Undownloaded row action: small download icon plus clear accessible label (e.g. Descarcă și procesează). This collects to the application's storage, not just user's computer. Ready state replaces collection action with Deschide and access to archived original; saving an existing local archive to computer makes no new SEAP request.
- Feedback states: waiting/queue position, obtaining fresh source link, downloading, extracting PDF from signed container if applicable, extracting native text or OCR, ready/error. Show measured bytes/pages when available; otherwise honest stage indicator, not fabricated percentages. Status is accessible and survives navigation/reload/tab closure. Download success and processing success are separate.
- Failure after download offers resume processing of already stored original, without redownloading. Failure to collect leaves explicit error/retry action. Original signed P7S, extracted PDF and machine OCR stay distinct, hashed, with page references and OCR review status.

## Implementation constraints

One globally active file job across the entire application, from download start through processing completion, not one per tab/user/process. Durable database queue, shared worker ownership/locking and duplicate-job prevention. Multiple requests for same document/version join the same job; other files queue transparently. Existing ready documents reuse stored results. Verify mutual exclusion with competing workers, restarts and repeated clicks; define safe recovery so stale worker cannot continue alongside a replacement.

Fresh same-session metadata lookup must regenerate the ephemeral download URL before POST verification and GET. Source identity should use notice type/id, document id/code and version/content hash; neither user cookie nor previously saved download token is a durable dependency. Rate-limit and count SEAP calls, including metadata requests, and cache list reads to avoid calls on every render. The successful Chrome pilot demonstrates acquisition; portable production processing needs deployed runtime support (local Apple PDFKit/Vision are not a Linux server implementation).

Existing application source links must become notice-type aware (SCN simplified-notice versus CN c-notice). UI should not conflate imported metadata, downloaded original, extracted PDF, OCR, or verified certificate trust. No auto-download all files upon opening a contract.
