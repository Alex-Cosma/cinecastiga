# Bounded automatic-document pilot — protocol and first result

26 September 2026. User selected **only MUNICIPIUL BUZAU**, valid CUI4233874/local entity2144364, with the proposed10request/15s/no-retry/max2PDFbounds. The bounded standalone runner and18local transport tests are implemented. First live run used **6requests**, discovered a9-document list (5metadata rows inspected), and stopped persistently onHTTP500while fetching the first PDF. **No PDF collected.** See `previews/batch5-document-pilot/README.md`, `report.json`, `result.json` and `manifest.json`. No automatic restart. The protocol below records the agreed boundaries; future collection is not authorized beyond this stop without a fresh user decision.

## Agreed pilot limits

- One authority initially; at most two if explicitly selected. Freeze an allowlist by canonical CUI and exact notice/acquisition identifiers. Choose at most two notices total, not every contract belonging to the authority.
- At most10outbound HTTP attempts in the entire pilot across all hosts, one in flight, minimum15seconds between starts. Every request, including redirect hops, HEAD probes, failed requests and resource discovery, consumes the same durable budget. No browser navigation to SEAP: its implicit asset requests would escape the cap.
- At most2PDF files,10MiB each,20MiB downloaded bytes for the run; small metadata responses capped separately within that total. Bound request duration and entire run. A stopped budget is never reset by restarting the command.
- No automatic retries. Stop the entire run on403,429,CAPTCHA/access challenge, server error or network timeout. Record Retry-After and wait for an explicit later decision, not an automatic resume. Do not rotate identities, IPs, hosts or endpoints to bypass a block.
- One operator/run; verify no other scraper uses the same outbound connection. The current client limiter is process-local, not distributed. A local singleton cannot promise to coordinate another process or machine. Run in a quiet window on an already authorized host with access; do not change remote services unasked.
- Response/file cache and URL request ledger prevent repeated reads. Write the request reservation before making it; uncertain crash attempts still count. A shared exclusive pilot lock prevents two runs from multiplying the allowance. Explicit `redirect: manual`; only exact approved public destinations, no guessed recursive endpoint enumeration.

These are conservative proposed experiment limits, **not a documented SEAP quota**. Current source code defaults are not evidence of today's upstream allowance.

## What we can do without a single external request

Inspect normalized authority links and archived raw JSON/XML. Record exact IDs, raw hashes, URLs with source field paths and expected relationship. Classify buyer homepage, notice page, related-notice reference and genuine attachment separately. Resolve canonical links using existing source-link builders where appropriate. Produce a dry-run manifest with every proposed discovery request and its reason. If we cannot establish a document-list/download endpoint from existing code or archived evidence, report that gap rather than burning the budget trying guessed endpoints.

Local findings for the proposed first authority:

- TED notice341721-2026, raw16101858: supervision of renovation of30housing blocks, published19May2026.
- TED notice277403-2026, raw16107496: school digital equipment, published23April2026.
- Both archived XML payloads only identify `https://www.e-licitatie.ro` under `ContractingParty/BuyerProfileURI` for SEAP links. This is **not an attachment URL**. See `previews/batch5-documents/pilot-offline-candidates.json`.
- Two recent participation notices in the local SEAP collection: SCN1168231 (local40458, source c_notice_id100231768, raw121928) and SCN1167450 (local41863, source100230829, raw129311), both notice version2. This is a local snapshot, not live coverage. Existing classic detail reader is documented as incompatible with version2; do not fire its request at these notices.

## Why the current scraper is not the pilot

`packages/scraper-clients/src/elicitatie/client.ts` defaults to8concurrent,120msdelay,maxRetries3. `apps/ingestion/src/scrape/elicitatie/client.ts` shares a singleton only inside one process and does not currently expose maxRetries through its environment configuration. `packages/scraper-clients/src/http-client.ts` retries403/429and uses fetch's normal redirect behavior unless overridden. Merely setting concurrency1and a delay would not enforce the proposed total-attempt cap or stop policy. Binary file acquisition and accounting need a tested bounded transport, without changing the production scraper defaults as a side effect.

## Execution and output after targets are settled

1. Prepare and inspect the offline manifest. Test transport accounting, redirects and stop behavior against a local mock server; these tests spend zeroSEAPrequests.
2. Use the smallest verified public metadata endpoint needed to discover attachments for the allowed notice. Stop on access failure. If the attachment is available on an official authority site, disclose the different source; it is not proof that SEAP downloading works.
3. Download one identified PDF; optionally a second within the unchanged run cap. Verify PDF signature/content type/size. Retain original bytes and SHA-256, exact final/source URL, raw field path, notice binding and fetch timestamp in an isolated pilot folder.
4. Extract/search locally. OCR, if needed, runs only on the already saved file and consumes noSEAPrequests. Test passage/page/PDF linkage and document limits; do not index partial extraction as complete.
5. Produce one result table per notice: found reference, accessible file, bytes/hash, extraction coverage, requests spent, stop reason. Distinguish no reference found, access blocked, no file collected and no readable text. Failure on the first request is an honest pilot result, not permission to expand the scope.

Success: at least one **verified notice-bound document**, original bytes retained and a quote demonstrably traceable to its PDF page, within the hard cap. Finding only metadata or a TED announcement XML is useful discovery, but not success at acquiring procurement attachments.
