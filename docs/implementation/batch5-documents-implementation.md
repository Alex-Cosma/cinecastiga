# Contract documents and verifiable passages

**6 October 2026:** optional [local document proxy pilot](document-proxy-pilot.md), fixed endpoint per session, no direct fallback when configured; no production activation or pacing change.

Local implementation, 26 September 2026. Not committed, pushed or deployed.
Preview: http://localhost:3113/contracte/107063311#fisiere

## Delivered flow

- Evidence drawer titles open local contract/direct-acquisition detail pages in a separate tab; contracts use the existing internal-ID bridge. The main query supplies the imported title. Other specialized source streams retain their existing CPV/record title fallback.
- Contract Files section resolves a procedure through matching imported procedure ID and authority. Metadata collection is explicit and distinct from bytes. Supported acquisition is verified simplified notices, type17. Missing/ambiguous associations and unsupported notice families show a truthful source fallback; direct-acquisition detail currently links to SEAP without claiming document collection.
- Metadata and file requests enter one durable queue. A dedicated worker holds a PostgreSQL session advisory lock, with a second database constraint allowing one running job. Active document requests deduplicate across users; ready results are reused. Queue insertion requires authentication, same-origin JSON, and a per-user cap of20operations/hour. List refresh is cached24hours. Normal browsing/search is read-only and makes no SEAP requests.
- Acquisition uses a fresh isolated Chromium session, fresh document metadata, verification POST then GET. Only explicitly permitted requests leave the browser; scripts, subresources, redirects and service workers are blocked. Source-generated file URLs are never stored as durable identity. Every reserved request is audited; starts are at least15seconds apart. No automatic remote retries.
- Originals and derived PDFs are SHA-256-addressed database blobs; source documents/pages retain their identities. PDF or signed DER CMS/P7S up to50MiB and150pages. Poppler extracts text per page; short/empty text falls back to Tesseract ron+eng. Original/PDF/hash remain separate. CMS integrity verification does not establish certificate trust/revocation. Unsupported/failed processing retains the original and offers retry without download. Pages and search become visible after the entire processing result commits.
- Search across prepared files or within one document returns filename, page and passage. Accent-insensitive literal substring matching, bound query parameters, maximum100matching pages and explicit coverage. No matches does not imply absence in unprocessed files.
- Reader places page-linked OCR/native text beside the original PDF. Selection or the keyboard-friendly whole-page action opens an inline investigation picker/new-case form with note. Server checks private edit access, exact source relationship, original hash, page and substring before saving. Quotes retain processor/method/source references. Dossier shows passage and original links; Markdown/ZIP JSON exports preserve these references. ZIP does not embed binary originals.

## Operation and deployment

Migration: `packages/db/migrations/0033_procurement_documents.sql`; Drizzle schema and snapshot/journal included. Applied only to the local development database and the dedicated test database. App tables are independent of ingestion rebuilds. Database backups now also contain archived file bytes; storage is deliberately PostgreSQL for this bounded first implementation.

Apply migrations using the database owner and run `infra/prod/roles.sql` to ensure new app tables/sequences are accessible. Production configuration:

1. Set `DOCUMENTS_ENABLED=true` in the deployment environment.
2. Build the web image and `infra/prod/Dockerfile.documents` worker image.
3. Start with `docker compose --profile documents up -d web documents` from infra/prod. The worker has no published port and uses the same application database; it includes Chromium, OpenSSL, Poppler, Tesseract and Romanian/English language data. Runtime runs as node with resource limits and an init process.
4. Check worker logs and `app.document_jobs` / `app.document_requests`; perform a separately bounded live acquisition smoke test with request accounting. This session deliberately performed no new SEAP acquisition calls.

For local worker: `DOCUMENTS_ENABLED=true DOCUMENTS_CHROMIUM=/path/to/chromium pnpm --filter web documents:worker`, with Poppler, OpenSSL and Tesseract ron+eng installed. `--once` through the script processes at most one job. `DOCUMENTS_OFFLINE=true` refuses any network acquisition and only processes retained originals; it is used by local verification. Worker errors remain durable and do not cause automatic retries. The worker is separate from request handlers and continues after the browser closes.

Session-lock ownership does not expire while a live worker processes a file. A heartbeat aborts on database connection loss, all child tools have time limits, and a replacement waits120seconds after detecting an orphan to let bounded children finish before starting another file. A interrupted job is failed with explicit retry rather than invisibly redownloaded. One worker invocation does not imply all queued work has succeeded; inspect job status.

## Verification and current local data

- Production Next build succeeded with `NEXT_DIST_DIR=.next-documents`, isolated from other running previews. TypeScript passed.
- Web unit suite:230passed,10existing skipped. Dedicated PostgreSQL integration checks concurrent workers, dedup, reuse, ownership and rejection of forged text/page/hash/contract; passed. Final focused source-query/document suite:26passed, including the added rejection of HTTP error bodies as originals. Source-query pagination regression checks remain unchanged and pass.
- Browser:16checks passed, search/read/save/export, real PDF/OCR, mobile widths320/390/800/1440, no runtime errors or external HTTP. Real queue/reload and worker processing were also exercised with the retained pilot original, with captures and durable job evidence. Captures and review under `previews/batch5-documents-live/`.
- Four additional browser assertions verify independent contract/document search state; three verify real drawer titles, new-tab canonical navigation and preserved current results. Fresh finish review identified the shared search state; fixed and scored resolved. Documentation handoff is complete; design canon unchanged.
- Linux container with network disabled extracted the user's P7S into the exact same PDF hash as the previous pilot and ran all16pages through OCR. Tesseract found text/noise on15pages; this differs from earlier Apple Vision and is not a verified transcript or evidence of content on a blank page.
- The actual pilot PDF HC-127-2025.pdf was imported byte-for-byte, then processed by the queue's Linux worker:10pages. A first attempt found a reserved-connection transaction API mismatch; corrected to explicit transactions, retried from retained original, succeeded with no download. Technical exception text is now sanitized for users.
- Pilot metadata contains5of9reported files, so full-list `checked_at` is intentionally unset and coverage is explicit. The user-provided CS P7S was tested offline only; it was not assigned an invented SEAP document ID or silently added as a verified remote file.
- Additional SEAP requests:0. Historical pilot remains18requests,1remotely downloadedPDF. New queue audit starts separately at0; the UI says requests recorded in this queue.
- Temporary authenticated browser account/cases are verification fixtures, not real investigations; cleaned after review. Real archived public PDF/metadata retained for manual checking. Test worker exits after one job; no new unattended SEAP collector is left running.

Reference behavior: [PostgreSQL session advisory locks](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS), [Tesseract command-line language selection](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html), [Playwright isolated contexts and request routing](https://playwright.dev/docs/api/class-browsercontext).

## Follow-up: first user-triggered live file

The local user queued `decizie CNSN_semnat.pdf.p7s`; the worker had intentionally stopped after prior tests. Ran the Docker worker with `--once`: downloaded1,470,109bytes, extracted the signed PDF and processed all18pages successfully. All5source requests returned200 (notice,2metadata pages,verification,download); cumulative total23including the earlier18-request pilot. The historical pilot ledger remains unchanged. The notice now has all9metadata rows and2prepared files. Worker exited, no pending jobs.

Fixed status refresh for tabs that were idle before work began: mount/focus/visibility refresh and15secondidle/2.5secondactive polling, paused while hidden. The label now explicitly says “Descărcat” during processing and after completion. Six focused browser checks passed using browser-only simulated transitions and the real completed document; no extra source calls. Desktop/mobile captures inspected, TypeScript passed. See `previews/batch5-documents-live/status-refresh-verification.json`.

## Follow-up: visible document availability

Download buttons now have a neutral surface and download icon. Ready documents have a solid brand-green read button with book icon. A check-circle “Descărcat” label and tinted format marker confirm retained original bytes, independently of text processing; retained-original retry uses a soft-green action and retry icon. Original links explicitly say “Descarcă originalul”. Existing SVG icon system and theme tokens reused.

TypeScript and7focused browser checks passed, including light/dark, keyboard activation, mobile, processing and failure; actual-state desktop/mobile captures inspected. No source requests or queued downloads; fixture account cleaned. See `previews/batch5-documents-live/action-states-verification.json` and `actions-*.png`.

## Follow-up: synchronized PDF and OCR pages

The native embedded PDF viewer maintained a separate page position, leaving OCR at the app's selected page. Replaced it with a controlled PDF.js page canvas. The app's page selector, previous/next buttons, search results and deep links now determine both original image and OCR text. Fit-width and zoom are available; full PDF remains available in a separate tab. Loading and error states replace stale page images, pending render operations are cancelled, and the same document stays loaded across page changes.

PDF.js6.3.289 is bundled locally. The dev/build command prepares versioned worker, fonts, CMAP, WASM, ICC and license assets in ignored public/pdfjs; Docker runtime copies public assets. No CDN or remote document retrieval. API bytes and original hashes are unchanged. Implementation follows the [official PDF.js examples](https://mozilla.github.io/pdf.js/examples/).

TypeScript and the isolated production build passed. Nine browser checks passed on dev and production builds, including exact OCR content/blank-page handling, changed canvas pixels, rapid navigation, reload, zoom and mobile/dark rendering. `reader-navigation-verification.json` and `synchronized-reader-*.png` record the results. Fixed global shell was hidden only in mobile element screenshots to avoid screenshot clipping artifacts. Temporary production smoke server stopped; development preview remains3113. No additional SEAP requests, no processing jobs.

## Release follow-up: source access and pacing

Per the user's final clarification, archived originals, derived PDFs, OCR and search remain public. Anonymous visitors see a disabled source-download button and login link. The file/list queue POST checks the session on the backend before accepting requests; authenticated users can initiate source acquisition. There is no login wall on cached file GETs.

The source worker enforces at least60seconds between noticedoc GET attempt starts globally, including failed attempts, based on persisted request timestamps and database time. The existing15second spacing between all HTTP requests remains. It rechecks after waiting, survives restarts and does not grant separate budgets per account. One worker still owns the global queue lock. The interface names the waiting stage. No new source calls were needed to verify this policy.

The deployment now builds a dedicated migration image and the document worker, applies pending migrations and grants before restarting the new application, and starts the on-demand worker. DOCUMENTS_ENABLED defaults totrue; explicitfalse disables acquisition and parks the worker. Compose also guards web/worker startup behind successful migration for the first transition from the old deploy script. See infra/prod/README.md for the first-transition caveat and operational commands.

Validation: account/source endpoint and public archive browser checks,7document unit tests,4deployment failure-order tests,20successful whole-project tasks, and an isolated PostgreSQL26→34migration/rollback/data-preservation test. Source total remains23. Verification fixtures cleaned.
