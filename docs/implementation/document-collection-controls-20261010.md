# Continuous document collection and 02:00 daily data update

Implementation on `feat/document-collection-controls`. Deployment status is recorded below after verification; do not infer production activation from this file.

## Operator workflow

- `/admin` has a separate file-collection summary, alongside contract/data recovery. Data request statistics exclude `stream=documents`; the shared connection controls still apply to both streams.
- `/admin/fisiere` offers **Pornește colectarea fișierelor**, pause/resume, and explicit retry of terminal failures. Only administrators can read/control this endpoint; mutation requires same origin and the current revision.
- Deployment does **not** enable the continuous sweep. Migration0068 creates a disabled singleton. Existing manual document requests and the bounded pilot remain usable.
- Inventory, originals archived, and files processed are reported separately. The number of discovered files grows during inventory; it is not an estimate of all SEAP files. Failed work remains visible, with ten recent errors and a retry control. Existing queue pagination remains ten rows.
- The file dashboard retains actual filesystem usage and archived blob size. No new10MiB limit was introduced. Existing parser constraints (50MiB,150pages) remain; files exceeding these appear as failures rather than successful OCR.

## Scope and safety

The verified adapter supports simplified announcements with `sys_notice_type_id=17`, namespace `rfq`, positive public ID and known notice number. The inventory scans the entire normalized history, newest first, without source traffic. Missing identities/other notice families are counted separately. File extraction supports PDF/P7S; unsupported formats are counted, not silently treated as processed. Discovery runs periodically for newly normalized notices; this first version does not refresh every previously inventoried notice for later attachments.

The durable queue materializes at most40 pending/running inventory jobs and40 pending/running file jobs. A supervisor holds the existing session advisory lock, excluding the old serial worker and bounded pilot. Up to10 network lanes and4 processing lanes run in one worker, with a20-connection DB pool. Manual requests have priority and occupy a network slot within that limit. Each browser keeps its proxy/session for the complete notice/list/POST/GET chain. Shared per-IP delay, total request rate, concurrency, quiet hours and source blocks remain enforced. Automatic jobs bypass only the ordinary single-file60-second rule, after checking their DB control and running status.

Downloading and text extraction are separate durable phases. The original is archived before OCR; retries and restarts reuse it. Recoverable failures wait5minutes, then10minutes; a third failure is terminal. Manual failures retain their existing terminal behavior. Admin retry resets the job retry budget and is audited; request diagnostics remain archived. Global source pause permits already archived automatic files to finish processing. Automatic document pause stops new automatic work; manual contract requests remain independent. Nightly maintenance aborts active automatic work safely and preserves it for resumption.

Parent cancellation of an admitted HTTP request records diagnostics without blocking the entire SEAP connection or penalizing a proxy. Real transport failures and request timeouts retain existing protection. The worker remains disabled locally by default; all tests use isolated `seap_test_*` databases and fake transport.

## Daily data schedule

The persistent data worker checks for a new closed-day horizon once per minute. Beginning at **02:00 Europe/Bucharest**, it appends data through yesterday, preserving completed tasks, existing retry budgets, deduplication and late-change revisits. The schedule follows local summer/winter time. Existing pause02:59–03:30 stays in place. Processing stays05:00; unfinished collection work is retained across processing. Three wall-clock hours are available before processing, of which31minutes are the scheduled source pause; completion by05:00 is not guaranteed.

## Verification

- Isolated DB integration: durable phases, bounded queue/newest-first selection, unsupported identities, revision conflict, pause/resume, orphan recovery,10network/4OCR concurrency, cancellation without global block, no HTTP while paused.
- Daily extension:02:00 boundary, winter timezone, idempotency/concurrent invocation, maintenance and transactional rollback.
- Existing serial document/provenance/private evidence and bounded-pilot integration are rerun.
- Full workspace checks, host deployment tests and authenticated desktop/mobile UI verification are recorded on release.

### Local verification completed

-9 new isolated collector tests passed; existing5 bounded-pilot and2 provenance/serial-worker tests passed.
-7 daily scheduling integration tests passed, including summer/winter02:00 boundaries.
-Full Turbo typecheck/lint/test/build:20/20tasks successful. Unit suites:414web,243ingestion,35scraper,26domain,10db passed; database suites skipped by the ordinary unit invocation were run separately as specified above.
-22host deployment/nightly tests passed.
-Authenticated local Next preview on3115 against the isolated database: `/admin/fisiere` and `/admin`, desktop1440 andmobile390, light/dark, no horizontal overflow or browser errors. Real pause/resume API buttons verified; status200. Screenshots/logs in private `.local/document-pool-20261010/auto-*`. No source network requests were made.
