# Bounded document pilot

**Latest: success,18total requests,1real PDF.** Use fresh own-session document metadata and its generated URL, then POST→GET in the same context. Replaying old/another-session URLs failed. `browser-download-sequence.mjs --fresh-links` implemented the successful bounded diagnostic; its specific grant/start count is consumed, so do not rerun as if it were a reusable production collector. See latest preview report/HANDOFF for evidence and remaining integration work. No further network operations pending. Earlier text below records historical pilot boundaries/results.

Current state: user explicitly allowed exceeding the original10requests with ongoing counts. Separate POST→GET runner consumed grants using the existing ledger; total **12requests**, no remote document. POST10and12returned400file-not-found; page11returned200and one cookie (initial no-cookie report corrected). No13threquest sent. See latest preview report/HANDOFF. The following original pilot description is historical; its default guard remains unchanged.

`download-sequence.mjs` / `run-download-sequence.mjs` consume an explicit saved per-sequence approval; optional page initialization, then POST(no body), GET only after200JSONempty-string. Never reuse the user's browser cookie. No automatic restart. Tests: `node --test scripts/document-pilot/*.test.mjs`.

Standalone manual pilot, independent of application/ingestion workers. Approved scope: only Municipiul Buzău, at most10total HTTP attempts,15seconds between starts, no retries, at most2PDFs. Fixed ledger/cache directory `.local/document-pilot-buzau-20260926/` is gitignored. No schema/main DB writes. No cron or background downloader.

The initial run stopped at request6. The user explicitly authorized one retry, executed as request7, which also returned HTTP500. A further user-authorized corrected-Referer attempt8 returned403: Referer and Origin headers mismatch. The explicitly authorized aligned-www attempt9 returned500again. **Currently stopped at9/10, zero PDFs.** Do not clear its stop or create a new budget. See `docs/implementation/previews/batch5-document-pilot/README.md` and manifest/report/result.

Local tests (no external HTTP):

```sh
node --test scripts/document-pilot/transport.test.mjs
```

The runner accepts only a request ID recorded with provenance in the fixed manifest. It always uses the same durable policy/ledger and will refuse further network operations while stopped. A deliberate future continuation needs explicit user instructions for its time window and cumulative allowance. The consumed approval is retained in the ledger. `--single-approved-retry` reads a fixed private approval file; it cannot be reused, follow redirects, change the URL, or reset the cumulative budget.

Security/scope: authenticated fetching is not implemented. Only the two SEAP public origins are permitted. Only GET and the exact verified read-only NoticeDocument/GetAll POST with bound type17/noticeID/pageSize5are permitted. Streaming content limits/format checks are guards, not a PDF parser or proof of file authenticity. The first synthetic test PDF validates transport signatures, not PDF semantics. Real extraction/OCR/PKCS#7support remains unimplemented.
