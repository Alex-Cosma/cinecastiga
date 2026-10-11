# P7S extraction with separate signature verification — 11 October 2026

Related: [read-only failure audit](document-failures-audit-20261011.md).

## Behavior

The extractor first runs the existing CMS cryptographic verification (`-noverify` skips certificate-chain trust, not the content/signature checks). If and only if OpenSSL exits4 without cancellation/killing, it retries content extraction with `-nosigs`. A successful extraction on that path is ALWAYS recorded as failed cryptographic verification, never inferred as a valid signature from OpenSSL's misleading "Verification successful" stderr. Missing executable, timeout, abort, malformed input and failed extraction cannot be silently accepted. PDF validation and existing processing resource bounds still apply.

Original P7S bytes and SHA256 remain immutable. Derived PDF/pages are published atomically by the existing worker. Processor version is `poppler+tesseract-ron-eng-v2`; old completed documents and frozen evidence are not reprocessed or overwritten. The explicit failed-verification message appears alongside the file and in its reader, also exposed by the existing provenance API. The PDF viewer is labeled PDF, leaving Original for the retained source file.

## Targeted recovery

`apps/web/scripts/documents/recover-p7s.ts` defaults to read-only. It considers only failed automatic file jobs with the old OpenSSL error, retained original and no processed result. It checks real extracted content and PDF page count, not filenames. `--apply` queues readable PDFs at `process_queued`, retaining the original hash. Unsupported payloads/page-policy failures receive a more precise final error instead of another OCR attempt. Unreadable/unexpected failures remain untouched. Concurrently resumed or completed records are not overwritten; a transaction audits old errors, attempts, timestamps, original hashes, source request counts and recovery decisions. A second application does not repeatedly reset the same processed/reclassified jobs.

The inspector and recovery command import no SEAP/browser client. A recovered job starts at local processing because its original is already archived. Other file failures and collection settings are outside this operation. This release does not add Office/archive processing, lift the50MiB/150page/100kcharacter bounds, or change general transient/permanent retry classification.

Read-only production preflight using the proposed code in a separate temporary directory:196candidates,160readable PDFs,35other contents,1over150pages,0unresolved,0DBchanges. Counts can increase while the collector runs; the application records its own exact set.

## Validation

-6synthetic OpenSSL tests: valid signature; intentionally tampered signed content extracts with explicit failed-verification status; malformed containers; operational failures; cancellation; failed fallback.
-2isolated recovery integration tests: read-only default, idempotency, precise classification, retained bytes, audit, concurrent resume, zero document-source requests.
-Existing2serial-worker/private-provenance integration tests passed.
-Real archived one-page scanned PDF and56-page scanned PDF passed full extraction/OCR using a local Linux document image, network disabled. Original hashes unchanged; warnings persisted in both reports.
-Full workspace typecheck/lint/tests/build passed before final release checks. Narrow visual fixture: actual ContractFiles/PdfPage UI on desktop1440/mobile390/light/dark; warning shown both in file list and reader, no JS errors or horizontal overflow. The existing local data DB lacks a legacy namespace column, so the visual check used fixture props and intercepted API responses rather than migrating local data. Temporary fixture route removed before release.
-Private reproduction artifacts: `.local/document-failures-20261011/`. No source originals or OCR text are committed.

Production publication and recovery results are appended after verification.

## Production release

Runtime `a1f8f78`, CI/deploy38124882278 both passed; health200. Applied recovery after drained deploy:198candidates,161PDFs queued,37other/page-policy cases precisely reclassified,0unresolved. Source/doc pause restored with revision guards131→132 and2→3; public site stayed live. At11:47RO,120completed/4running/37queued, originals unchanged, **zero extra source requests across the recovered jobs**. The owner subsequently authorized [other formats and large documents](document-formats-20261011.md).
