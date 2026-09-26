# Buzău automatic-document pilot — observed result

## Latest — AUTOMATIC DOWNLOAD SUCCEEDED;18total requests,1real PDF

The user confirmed their GET actually saved the file. We tested fresh Chrome contexts via local CDP9237; all unplanned requests were blocked before transmission, scripts disabled, cache disabled/service worker bypassed, no user cookie reused or copied. User had explicitly authorized exceeding10and requested count updates; every issued request/stage reported. Default15sstart spacing retained.

-13GET correct SCN page →200; own `_HttpSessionID` cookie created.
-14POST the user's supplied file URL in that fresh session →400file-not-found; no15GETin that flow. Same-session cookie alone did not resolve replay of the supplied URL.
-15GET correct SCN page in a second fresh browser context →200and own `_HttpSessionID`.
-16POST exact known read-only document-list filter →200. **Same document110778324 / SCN1168231/00054 / HC-127-2025.pdf now had a different noticeDocumentUrl**, ending `bf24dd02123e4729a427c3459c654cb1`, replacing old response5URLending`a26b2dc863ee4b2ab784a77dc760d9d4`.
-17POST freshly obtained URL in the same browser context →200, JSON`""`.
-18GET same fresh URL/context →200application/octet-stream, Content-Disposition`HC-127-2025.pdf`,632876bytes. Browser generated correct SCN Referer; GET had no Origin header. No19threquest. The latter two requests reference the fresh response16file, not the user's supplied URL.

**Validated offline:** `%PDF-1.5`, PDFKit parsed10pages, unencrypted/unlocked, zero native text (scans). SHA256`9b305927ede6acf7a831ecde2a111df668bac20e046d61fefdf33f879b3cb4da`. Actual source bytes preserved as private `.local/document-pilot-buzau-20260926/browser-response-18-9b305927ede6.bin` and friendly identical copy `HC-127-2025.pdf`; inspectionJSONnexttofriendlyfile. Ledger/result/report now correctly count1downloadedPDF,18requests. Earlier user-supplied P7S remains a separate local fixture, not falsely counted as remotely downloaded.

**Working solution:** open own public session, fetch notice document metadata in that context, immediately use returned file URL with POST verification then GET in the same context. Treat download URLs as generated/transient, not permanent database links. Stable provenance uses notice type/id, document ID/code/name, correct public SCN route, acquisition time and byte hash; regenerate file URL for each collection. Observed change and success establish a working flow, but do not prove exact link TTL, strict session binding, or that browser automation is inherently required. Need not reuse user credentials/session. Do not claim court findings or wrongdoing from content metadata.

Code: `scripts/document-pilot/browser-download-sequence.mjs` implements bounded diagnostic, immutable historical attempts plus explicit grants, own isolated context, allow-only-request interception, counters, bytes/hashes and later format classification. Browser contexts disposed.32local transport/sequence tests passed; browser diagnostic exercised live. `download-sequence.mjs` Node variant replays static URL and remains insufficient; production collector must do fresh metadata lookup in the same session. This is a demonstrated local pilot, not production integration/deployment. Type-aware application notice links still need separately scoped correction. No further SEAP calls needed for this task.

Correction already communicated: request11did emit one cookie; earlier report saying none was a reading error. Verified ledger field sessionCookieCount1and forwarded by Node script; cookie name not logged until Chrome13(_HttpSessionID). Historical docs corrected.


## Latest — observed POST→GET implemented/tested; currently12requests, source file not found

User provided browser evidence: empty-body POST to `https://www.e-licitatie.ro/api-pub/files/noticedoc/4333a84fdfb741059d25b48970751216`,200JSON response `""`, www Origin and correct SCN Referer. `Authorization: Bearer null`, `HttpSessionID: null`, `RefreshToken: null`, Culture ro-RO; browser has a session cookie. **Do not copy the user's cookie value into any file, log or report.** None was reused or stored by our scripts. Response header sample did not include Set-Cookie. User explicitly lifted initial10-request cap, requiring live count updates. No repeated budget permission needed for reasonable bounded diagnosis; continue respecting15sinterval, low volume and meaningful hypotheses.

Prepared `scripts/document-pilot/download-sequence.mjs`, `run-download-sequence.mjs`, `download-sequence.test.mjs`. It performs empty POST verification then GET only after exact200JSON-empty-string response, same origin/referrer, optional initial notice HTML GET, own response-cookie propagation in memory (no cookie values persisted), durable per-request reservations/single-use bounded allowances in original ledger, no redirects/retries, response size/time limits, archived/hash-addressed bytes. GET content must be PDF header or DER CMS parsed offline by OpenSSL; filename/source relationship requires validation. The specific URL comes from user observation; no established mapping to filename yet. Original frozen policy retained; user-authorized per-sequence budget addenda explicitly carry cumulative allowance and starting count. **32local-only tests passed** across transport and sequence (no external requests in tests).

Live outcomes, all reported to user:
-10POST exact user URL:HTTP400JSON `[system error reference, "Fisierul nu poate fi descarcat, nu se regaseste pe server!"]`. No GET sent.
-11GET correct www simplified-notice HTML page:HTTP200, static bytes only, one cookie emitted and forwarded by the script. No scripts/assets/browser navigation.
-12POST same exact user URL:HTTP400with same file-not-found message and different diagnostic reference. **No13threquest.** Correction after rechecking the durable attempt11record: sessionCookieCount=1. This cookie was forwarded by the Node script; an earlier commentary incorrectly reported none. Names were not logged in that run. The user session has not been reproduced.

Current remote count **12**, zero PDFs/CMS downloaded, stopped. Original9+onePOST+oneHTML+onePOST. Error bodies/cached HTML/durable grants remain private `.local/document-pilot-buzau-20260926/`; source reports updated. User-supplied P7S extraction/OCR remains a separate successful local validation. No app/DB/production changes/deploy.

Pending async clarification: does the user's provided URL actually download `CS ILUMINAT_semnat.pdf.p7s`, and was its GET200and file saved vs merely appearing in Network? Asked because exact matching POST from our runtime reports missing file. Avoid guessing auth or repeating unavailable file requests until this is clarified. A user-provided session cookie exists but was intentionally not reused; no proof it is required. Could inspect fresh browser request details (without secrets) once identity/result confirmed. Cached code only confirmed onDownload sequence, not server-side semantics. No extra external requests for this documentation.


## Latest — confirmed POST then GET download flow, awaiting browser details

User observed POST then successful GET on the same `https://www.e-licitatie.ro/api-pub/files/noticedoc/4333a84fdfb741059d25b48970751216`, with POST Preview `""`. This is a different file URL from our failed HC-127-2025.pdf attempts; actual filename of this new URL still needs confirmation. Requested POST Payload, Status, Content-Type/Origin/Referer and whether Set-Cookie exists (names only, no credentials).

Offline inspection **confirmed the exact flow in previously cached official app code**: `onDownload` directive calls `verifyFile(url).then(()=>downloadFile(url))`; OnDownload service implements verifyFile as `POST(url)` (no explicit payload) and downloadFile as `DOWNLOAD_GET(url,null)` (arraybuffer). Evidence snippets/offsets preserved in `docs/implementation/previews/batch5-document-pilot/download-flow-evidence.json`. Earlier `svc.downloadUrl/window.open` explanation was incomplete: it describes another function, not this directive. Corrected this candidly to user. POST may verify access or prepare download, but backend effects, cookie need and cause of earlier500 remain unknown. Preview is response, not request payload.

**No new SEAP requests: still stopped9/10.** Complete sequence needs at least2requests, exceeding remaining1; do not silently raise/reset budget. Once details are known, prepare a bounded exact POST→GET test, preserving same-origin cookie context only if needed, no redirects/retries, and request an explicit allowance of2additional attempts (cumulative11) before network. Existing transport only allows document-list POST; must add narrowly scoped verification POST support and downloaded P7S handling if this target is P7S. Do not treat verification response as the document, and do not spend final request on half the sequence. No code changes for this discovery yet.


## Latest — aligned www download/Origin/Referer, attempt9

User explicitly authorized «folosește-l» for the proposed consistent www host. One GET sent at2026-09-26T15:56:51.165Z to `https://www.e-licitatie.ro/api-pub/files/noticedoc/a26b2dc863ee4b2ab784a77dc760d9d4`, `Origin: https://www.e-licitatie.ro`, `Referer: https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/100231768`. Response **HTTP500**, 65-byte text `An error occurred, please try again or contact the administrator.` Not the prior403header mismatch. This demonstrates aligned headers alone did not resolve downloading; do not claim the remaining cause is known or that cookies/login are proven necessary.

**Stopped at9/10, zero remotely downloaded PDFs.** No tenth request or redirect follow-up. Need compare the browser's actual successful download request/URL for the same file before spending remaining allowance; user-supplied `CS ILUMINAT_semnat.pdf.p7s` is different from our failed `HC-127-2025.pdf`. Do not conflate successful manual download of one file with availability of another. No production/app/database changes, commits or deployment.

Bounded transport now supports an explicitly recorded single-use `align-public-origin` correction only for a prior403whose saved, hash-verified body exactly identifies Referer/Origin mismatch. Same document path/query and id, allowlisted www counterpart, matching Origin/referrer and correct SCN route required. Generic403 cannot qualify. Attempts now persist sent Origin/Referer. Existing budgets/timeouts/stops retained; **25local-only tests passed** before the live request. Approval consumed and original failure history preserved. No automatic continuation permitted.


## Latest — corrected Referer attempt8 returned explicit origin mismatch

User authorized retry with the corrected Referer. Exactly one request sent at 2026-09-26T15:54:08.556Z, same PDF endpoint `https://e-licitatie.ro/api-pub/files/noticedoc/a26b2dc863ee4b2ab784a77dc760d9d4`, new `Referer: https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/100231768`. All other request headers deliberately remained unchanged, including `Origin: https://e-licitatie.ro`. Result **HTTP403**, body `{"message":"Access Denied: Referer and Origin headers mismatch"}`. Original attempt7's generic500 did not identify this cause; do not retrospectively claim it did. This new response establishes a specific host-consistency check for the submitted request. Browser navigation may omit Origin, which remains an untested difference.

**Stopped at8/10, zero PDFs downloaded automatically.** No ninth request, alternate host request or automatic retry sent. Single-use approval `buzau-pdf-corrected-referer-attempt8` is consumed and audited in the existing durable ledger; no budget reset. Any subsequent explicitly authorized test should consistently use the actual browser www host and correct SCN route, with matching Origin if supplied, instead of changing only Referer. The existing single-retry helper only accepts previousHTTP500and will intentionally reject continuation after403; do not silently bypass it. Only a specifically documented user-directed correction may authorize another request. Local user-supplied P7S extraction/OCR remains independently successful. App source-link correction remains unimplemented.


## Authorized single retry — 26 September 2026, 15:34 UTC

The user explicitly approved one retry and requested the exact link. Attempt **7/10**, GET of the same `HC-127-2025.pdf` URL, again returned **HTTP 500**, with a 65-byte text body: `An error occurred, please try again or contact the administrator.` Zero PDFs collected. No redirects, additional files, alternate hosts or further retries were requested. The original six attempts, policy fingerprint and initial start time remain intact. A separately recorded, consumed single-use approval allowed one new 15-minute window; the original stop was preserved in its audit record. The runner remains stopped.

The request already included `Referer: https://e-licitatie.ro/pub/notices/c-notice/v2/view/100231768`. Separately, the user reported `Access Denied: Referrer cannot be null.` when opening the link. These are different observations: the user response indicates a referrer check, but does not explain the runner's HTTP 500. Do not claim adding the already-present header fixes the download, or that the origin server received it unchanged.

Offline inspection of the cached official app confirmed `downloadUrl=function(n){window.open(n)}` and the public HTML's `<base href="/">`. The chosen GET method and root URL resolution agree with that code. Browser session/cookie differences remain untested hypotheses.

Transport now archives at most 64 KiB of error-body diagnostic data separately from collected documents. Its single-use retry path refuses URL changes, expired/consumed approvals and redirects. **22 local-only tests passed**, including successful/failed retry consumption, no redirect follow-up, approval expiry and bounded error capture. No application/database changes or deployment.

## Original six-request run (historical)

26 September 2026. User selected **only MUNICIPIUL BUZAU**, CUI4233874. Frozen scope allowed two candidate notices but all six requests concerned **SCN1168231** (public cNoticeId100231768, internal noticeId101254381), festive lighting supply/rental/installation for winter2025–2026. No second authority or second notice was queried.

**Stopped as designed on HTTP500 during the first PDF download. No PDF collected.** Six of ten allowed HTTP requests consumed; no retries or redirects. Minimum observed start interval: **25.195s**, exceeding15s.18local transport tests passed without contacting SEAP. Responses and durable budget live in the ignored private `.local/document-pilot-buzau-20260926/` directory; main DB, webapp and existing monitoring are unchanged.

| Attempt | Operation | Observed result |
| --- | --- | --- |
|1|Section1metadata using historical archived endpoint guidance|HTTP200but API `hasError=true`, “Anuntul cautat nu a fost gasit in sistem”. Not a usable notice response.|
|2|Exact selected notice's public HTML page|HTTP200; static script references discovered. No browser assets/analytics loaded.|
|3|One exact `/app-pub` script reference from that page|HTTP200; inspected locally, never executed. Revealed public document-list API, filter shape and general-info helper.|
|4|Public general info for cNoticeId100231768|HTTP200; mapped back to archived internal ID101254381, matching title, DF1255997 and award SCNA1128762.|
|5|Read-only POST `/api-pub/NoticeDocument/GetAll/`, type17, initNoticeId100231768, page0/size5|HTTP200; source reports9documents and supplies5metadata rows. All five document codes startSCN1168231.|
|6|GET exact `items[0].noticeDocumentUrl`, documentSCN1168231/00054, `HC-127-2025.pdf`|HTTP500. Entire pilot latched stopped; no retry, second file or alternate host attempt.|

The source list exposes a plain PDF plus signed `.pdf.p7s` files among the inspected records, including clarification and court/CNSC document types. Nine is the endpoint's reported total, not nine downloaded or fully inspected files. No document contents, legal outcomes, authenticity or wrongdoing are inferred from these metadata labels.

## What the pilot established

Automatic discovery of public document metadata and a specific notice-bound file URL is possible through these observed routes. Merely treating HTTP200as success would have hidden the first API-level error. A returned document URL is still not an archived original: the actual file download failed and no PDF signature/hash/page/text validation was possible. Signed `.p7s` envelopes will need a separately scoped extraction path that preserves signed bytes and the embedded document; do not rename them to PDF or claim signature validity from a filename.

## Collection boundary

The transport hard-caps requests, serializes invocations with an exclusive lock, reserves attempts durably before transmission, waits between starts, follows GET redirects manually/counting each hop, caches successful bytes with SHA-256, validates formats/size, and refuses unapproved origins or notice IDs. It stops persistently on failed HTTP statuses, network failure, recognized HTML challenge or quota exhaustion. Only one exact verified **read-only** POST route is permitted; write-like routes are rejected. Returned JSON business errors still require caller assessment, as explicitly done for attempt1.

No requests beyond6have been sent. The last failure's cause is unknown; HTTP500alone does not establish rate limiting or permanent denial. No automatic restart is scheduled. The durable stop must not be cleared, time window reset, directory deleted or remaining budget reissued without a new explicit user decision. A future continuation should reuse cached discovery and declare both its new time window and cumulative request allowance; it must not silently start another ten-request run.

## Artifacts and reproduction

- `manifest.json`: targets, exact request URLs/body and provenance of every discovery step.
- `result.json`: minimal persisted request/count/status summary.
- `report.json`: metadata observations and honest pending file/extraction status.
- `transport-tests.tap`:18passed local-only tests.
- `scripts/document-pilot/transport.mjs`, `transport.test.mjs`, `run.mjs` implement the bounded runner. `node --test scripts/document-pilot/transport.test.mjs` uses only ephemeral localhost servers and disposable temp directories.

The standalone HTML document mock is unaffected. Real-file integration is pending a successful source download; fictional PDFs must never be represented as this pilot's result.

## Confirmed route correction from user and cached SEAP code

User supplied `https://www.e-licitatie.ro/pub/notices/simplified-notice/v2/view/100231768`. This is the correct public route family for SCN1168231: cached SEAP app code selects `SimplifiedNotice_PUBLIC_ViewV2` for `sysNoticeTypeId=17`, version2; that route is `/pub/notices/simplified-notice/v2/view/:id`. Archived metadata and the live cached general-info response identify the same Buzău winter2025–2026 procurement. Earlier pilot used `/c-notice/v2/view/100231768` from the application's generic `noticeUrl()` helper; that route family was incorrect for this type. An HTTP200 SPA HTML shell did not validate the notice route.

No new SEAP request was made to confirm this. Do not rewrite historical attempt URLs/referrers. Future bounded download diagnosis should use the user's actual `www` origin and correct notice route, and reproduce the actual document request's browser headers/session if needed. This correction has not yet been tested as a download fix and must not be presented as the proven cause of HTTP500. App source-link helper also needs a separately scoped type-aware correction rather than changing every notice to simplified-notice.
