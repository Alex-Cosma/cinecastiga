# Production document failures — 11 October 2026

Read-only investigation requested by owner. No jobs retried, no source traffic initiated, no settings or production records changed. Four already archived originals fetched from cinecastiga.ro for local diagnostics; private artifacts in `.local/document-failures-20261011/`.

## Snapshot around 11:10 Europe/Bucharest

Source control revision130, paused=false, maintenance=false, no global block. Automatic document collector enabled, paused=false, revision1, ten network/four processing lanes. 1,002 file jobs complete,348 failed file jobs and9 failed list jobs. Completion count advanced to1,005 distinct files during the investigation. 324 failed-file originals are retained;24 are absent.

Failure counts by final job message:

| Final error | Jobs | Originals retained |
|---|---:|---:|
| openssl processing failed |195|195|
| Content is not supported PDF |112|112|
| Download exceeds50MiB |18|0|
| More than150pages |13|13|
| Document identity validation failed (list jobs) |9|0|
| Generic interrupted operation |6|0|
| Page text exceeds100,000characters |4|4|

These are final-message categories, not mutually exclusive historical causes:4of the6generic interruption jobs also had oversized attempts (>50MiB received) before their last transport failure. Source request ledger includes53TIMEOUT and2TRANSPORT_FAILED diagnostics at snapshot; these are attempts, not55distinct failed documents.

## Reproduced P7S problem

Local exact current command `openssl cms -verify -binary -inform DER -in ORIGINAL -noverify -out OUTPUT` failed in four sampled originals with CMS verification failure / RSA bad signature / CMS_SignerInfo_verify. This demonstrates verification failure with this tool; it does not establish why source signatures fail, legal validity, or that every one of the195jobs has this identical root cause.

Adding `-nosigs` allowed extraction in all four sampled files:

- `3e519437-ba88-40f8-9541-66d4cbfd8a17` Decizie.pdf.p7s: PDF,6,325,861bytes.
- `9434eff8-0752-44e1-a27d-e1bae5814b6a` Clarificare oficiu_nr.20777.pdf.p7s: PDF,36,000bytes.
- `231e3405-0ca0-423b-b257-9e89db899dff` clarification PDF:35,093bytes.
- `47f8ec1e-d882-4f94-a7fd-01dfacc9d8c5` technical proposal form: ZIP/Office container,34,588bytes.

Important: OpenSSL prints "CMS Verification successful" even in this extraction mode. NEVER present that output as a verified signature when `-nosigs` was used. Separate content extraction from cryptographic verification; preserve original bytes/hash and show verification failure explicitly on any extracted derivative.

## Other causes

All112non-PDF jobs have inner extensions consistent with unsupported contents:42docx,33rar,24zip,7doc,2xlsx,2seven-zip,1xls,1nestedp7s. This breakdown is filename-based, not a byte-level examination of every payload. Current filename filter accepts any `.p7s`, but processPdf only accepts an extracted PDF. Distinguish unsupported format from transient failure; extraction/conversion requires dedicated support.

The50MiB download limit,150page limit and100kcharacters/page limit are code policies, not observed SEAP errors.50MiB is the pre-existing transport/parser ceiling retained in the last release; no10MiB ceiling was added. Current run retries permanent limits/formats three times. This wastes source requests for oversized originals and local work for retained originals. Recovery should classify these errors and retry only conditions that can change. Larger files need streaming/storage and bounded processing; increasing in-memory ceilings indiscriminately is not a complete solution.

Nine inventories are rejected by parseList's combined checks on numeric ID, filename, and notice-code prefix. Failed notice keys:17:100245684,17:100245566,17:100245301,17:100245158,17:100244906,17:100244853,17:100244640,17:100244591,17:100244432. Exact offending field/metadata was NOT recovered in this read-only investigation. Successful HTTP metadata bodies are omitted from the shared diagnostics and parsing subsequently fails; retain a bounded sanitized validation diagnostic in a future fix. Do not relax source identity checks or re-associate files without examining that evidence.

Generic interruption copy is misleading for6jobs with no original: "originalul păstrat poate fi reutilizat" implies retained bytes that are absent. Error presentation needs to use actual original_hash and preserve the safe specific failure. Four of these six also exceeded50MiB on earlier attempts.

## Resource observation on production

Documents container~2.058GiB/4GiB,1,277PIDs,9.48%CPU at snapshot; OOMKilled=false,restartCount0 for current container. Host313GiB used/1007GiB,654GiB available,33%use. This snapshot does not certify every earlier resource condition, but current errors are not evidence that the disk is full.

## Proposed order

1. Separate P7S extraction/verification, retain accurate verification status; recover archived PDFs without SEAP requests.
2. Classify permanent/unsupported/transient failures and expose truthful status; stop retrying permanent policy/format errors.
3. Support large originals via streaming, process PDFs in bounded page chunks, add Office/archive/nested-P7S handling with expansion/resource controls.
4. Inspect the9identity failures through controlled metadata rechecks with useful diagnostics; preserve linkage guards.

This report records investigation only; none of these fixes have been applied yet.
