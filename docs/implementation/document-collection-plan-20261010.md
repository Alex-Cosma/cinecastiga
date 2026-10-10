# Historical procurement documents — proposed rollout, 10 October 2026

Owner chose the entire available history, newest procedures first, and subsequently authorized a bounded production pilot through all currently active proxies. This document distinguishes the implemented pilot from the larger historical rollout, which is not yet implemented.

## Accepted pilot implementation

- Explicit CLI: `apps/web/scripts/documents/pool-pilot.ts --batch=document-pool-20261010-<name>`. Without `--run`, this is a read-only preflight. Reusing an existing batch ID is refused. No pilot starts automatically after deployment.
- Up to 20 recent uniquely linked simplified notices, 50 PDF/P7S files, 300 source attempts, 10 download sessions, four processing workers, 45-minute overall deadline. Other notice families remain unsupported by this pilot, not absent from SEAP.
- All configured active proxies are eligible. Preserve current shared/per-IP limits; never enable disabled proxies or use direct-IP fallback. A small pilot need not use every IP.
- Migration 0067 adds durable operator batches and mutually exclusive processing/download slots. The existing supervisor advisory lock excludes the ordinary worker throughout the pilot. Its user-triggered jobs remain queued and keep their original serial policy.
- A batch-bound source admission counter is incremented atomically under the shared control lock. Only batch requests bypass the old global 60-second file-start interval. Per-IP spacing, total HTTP concurrency, shared starts/minute, quiet hours, maintenance and source blocks remain enforced.
- Downloads save originals before releasing the browser session and queueing processing. Four workers extract/OCR retained bytes without source traffic. Per-file failures remain visible and do not discard successful originals or stop unrelated jobs. Interrupted operator batches require inspection, not silent automatic replay.
- **No new 10 MiB limit.** The existing 50 MiB archive/processing technical limit and 150-page processing limit remain. Oversized streamed responses are canceled without archiving partial content; HTTP refusal status remains visible to the common source gate.
- `/admin/fisiere` reports total filesystem usage, available capacity, archived original/derived bytes (content-deduplicated), and sample time. Sample shared/cached for 60 seconds. Missing samples are shown unavailable, not zero. The production web overlay was checked against the host `/srv/seap` filesystem: same total/free blocks. Set `DOCUMENT_STORAGE_MOUNT` if future deployment places storage on another mounted filesystem. Logical blob bytes exclude PostgreSQL indexes, TOAST overhead, WAL and backups; filesystem usage includes them.
- Isolated fixture verification: 38 integration/unit checks including concurrent request admission, atomic cap, per-IP/session reservation, bounded parallel OCR with parallel downloads, ordinary queue exclusion, missing-original processing, oversized HTTP bodies, and filesystem reserved-block semantics. Source traffic is never part of these tests.

Production run results are recorded below once observed. Until then this section describes code, not successful production collection.

## Verified production state, approximately 13:37 RO

- Collection control revision 118: active, no maintenance or source block. Batch target 9 October 2026, national DA strategy. No pending/running collection tasks; seven older award-detail failures remain. Batch is consequently `incomplete`, not certified gap-free.
- Latest successful publication is the full run completed 10 October at 09:49 RO. Subsequent collected payloads are not necessarily normalized/published yet; the document inventory must incorporate them after successful normal processing, without forcing an extra rebuild.
- `app.document_notices`, `app.procurement_documents`, `app.document_jobs`, pages and blobs are empty. The document worker is running and idle.
- Normalized participation notices: 207,998 total: type 17 = 154,151; type 2 = 49,534; type 19 = 2,618; type 7 = 1,248; type 12 = 437; type 6 = 10. These are notice counts, NOT counts of eligible procedures, files, contracts with verified links, or the fully updated raw inventory.
- Server reports about 674 GiB available. This does not establish enough capacity for the full corpus, derivatives and backups.

## Existing implementation and actual limitations

Relevant code: `apps/web/lib/documents/{store,seap,worker,process}.ts`, `packages/db/src/schema/documents.ts`, shared collection/proxy gate in `packages/db/src/collection.ts`.

- User-triggered list/download queue, backend authentication, public retained originals/PDF/text, per-page native extraction or Romanian/English OCR, reader and saved investigation quotes already exist. Search is also integrated with topic search.
- Contract association uses verified procedure/authority identity or `notice_award_sources`, requires a unique match, and currently restricts support to simplified notice type 17. Other families and direct acquisitions are not established document adapters. Collecting a notice form/eForm does not collect its attachments.
- One job performs browser session establishment, fresh metadata pagination (5 entries/page), verification POST, file GET, archival and full processing. One global document worker/job; minimum 60 seconds between file GET starts, in addition to shared/per-IP budgets. Proxy and browser session are pinned throughout the source chain.
- Only compatible PDF/DER CMS is accepted as an original. Processing supports an embedded PDF up to 50 MiB / 150 pages. Office/ZIP/other formats need explicit handling; unsupported must not become "no documents".
- Original and derivative bytes currently live in PostgreSQL. This was suitable for the small pilot, not a deliberate national-archive storage design.
- File jobs have no automatic retry policy equivalent to collection. `runWorkerOnce` also refuses to start if *any* collection retry is pending; review this legacy global hold against current isolated proxy behavior before bulk operation.
- Current metadata inserts ignore conflicting records, and one `original_hash` is retained. National collection requires metadata observations and immutable content versions, not overwriting previously cited evidence.
- Page search currently uses substring scans. Scale testing and a maintained search index are required before treating it as a national full-text corpus.

## Proposed stages

### 1. Durable inventory and verified source adapters

Build a resumable inventory from existing verified source identities, including newly normalized records after each nightly publication. Identify notice namespace, public and internal IDs, type/version, procedure/lot and explicit links to contracts; never match only on title or assume numerical IDs are globally unique.

Inventory attachments once per verified source notice and reuse relationships across contracts. Different notices in one procedure may carry different files; do not merge away their provenance. Prefer authoritative existing metadata, then source enumeration as needed. Empty, not checked, access restricted, unsupported, ambiguous and failed are different outcomes.

Extend and test adapters for the remaining notice families, supporting eForms and legacy variants only after observing the actual attachment route and identity contract. Track unsupported families visibly. Include direct acquisitions where a validated source actually exposes attachments; do not request details of every DA merely to guess whether files exist.

Global ordering is newest first among eligible work, with unsupported families visible as coverage gaps. Enabling a new adapter adds its backlog at the correct date priority. Periodic refresh of recently active procedures captures clarifications/replacements; old documents need a separate revisit policy because publication date is not a modification feed.

### 2. Storage and separate durable stages

Keep originals and derivatives in a dedicated content-addressed persistent file/object store, with identity, hashes, versions, source, extraction metadata and job state in PostgreSQL. Pilot may use a dedicated server volume; external storage is an independent capacity/backup decision, not a required paid service for the first test.

Write atomically, verify size/hash, then publish the database reference. Coordinate backup manifests and database recovery; garbage collection must never remove a cited or retained version. Add explicit disk/bytes limits and reserve capacity for nightly database backups before unattended downloading.

Separate discovery, download and processing checkpoints/queues. The accepted bounded pilot separates concurrent downloads from independently bounded processing. Unattended historical rollout still needs durable recovery, resource controls and complete inventory coverage. A retained original can retry processing without SEAP traffic. Duplicate bytes share storage and, where compatible, extraction work; distinct source associations and versions remain visible.

### 3. Bounded source and extraction pilot

Proposed pilot: up to 20 representative procedures, 50 files and 300 source HTTP attempts, stopping at the first reached limit. These limits are authorized for the first pilot. Only the existing verified simplified-notice adapter is exercised first; broader family coverage follows separately. Cover both recent and legacy source routes, available signed/plain PDFs, scanned/native/mixed pages, larger documents and unsupported formats.

Preserve same proxy + cookie session + correct Referer through notice, metadata, verification POST and GET; no direct-IP fallback. Validate session reuse for several files from one notice instead of reopening/re-enumerating per file. Do not persist short-lived download URLs as permanent identities. Test larger metadata page sizes before relying on them.

Measure attempts per notice/file, size and pages, source latency, extraction/OCR time, quality, CPU/RAM, errors and dedup. Verify sources and page-linked text in the actual reader, restart recovery, partial failures, hashes and reused originals.

Transient failures may get bounded 5/10-minute retries after confirming request/session semantics. Refresh expired sessions/URLs within a bounded attempt. A file failure remains a visible gap and must not stop unrelated work; preserve shared source-block and maintenance policies. Challenges/rate limits are not instructions to rotate indefinitely.

### 4. Extraction and continuous publication

Native text first; OCR only where needed, with mixed-page quality checks rather than relying solely on character count. Retain original PDF/P7S, derived PDF, physical page, method/version and extraction quality. A CMS container may embed a PDF; detached signatures or other payloads are explicitly unsupported until handled. Signature integrity is not certificate trust.

Separate successful download from successful processing. Preserve originals of validated supported non-PDF formats even when extraction is pending; archives require bounded extraction and office documents isolated conversion. Oversize, encrypted and unsupported records stay visible, never count as fully searchable. Processing revisions cannot invalidate saved quotes.

Run resource-limited local processing incrementally, with no need to rebuild contract marts for each file. Index completed content and show it in contract files, the reader, search and investigations as it becomes ready. Pause/drain resource-heavy document work for scheduled nightly processing; resume safely afterward. Owner subsequently approved testing four processing workers. Production has 12 CPUs and 31 GiB RAM (about 20 GiB available at preflight); document service allocation becomes 4 CPU / 4 GiB and 512 PIDs for browsers plus OCR. Existing OMP_THREAD_LIMIT=1 keeps each Tesseract process single-threaded. Pilot resource usage must be observed.

### 5. Admin controls and historical rollout

Dedicated document section/tab, using existing admin navigation and pagination conventions. Show:

- Notices checked / eligible, explicit unsupported and unresolved associations.
- Discovered / downloaded / processed files, pending pages and OCR coverage.
- Bytes stored and capacity limits, measured download throughput and OCR pages/minute.
- Independent download and processing ETAs; until inventory is sufficient, label estimates as applying only to known work.
- Recent successes/errors and request diagnostics; paginate at 10 rows.
- Pause/resume by stage, ordering, source budget, file/day/bytes ceilings and future download/OCR concurrency settings.

User-requested files get priority without starving historical collection. Anonymous visitors keep access to retained public files; manual requests to SEAP still require authentication. Automatic batches are explicitly scheduled/audited by the admin, not anonymous queue access or fake user activity.

Roll through the entire available history newest first, alongside automatic daily catch-up. Never mark the historical corpus complete merely because the executable queue is empty while unsupported/unverified/failed coverage remains.

## Cost and decisions

No defensible exact file/request/storage/ETA total exists before the attachment inventory. Current one-file/minute rule permits at most 1,440 starts/day before quiet windows, maintenance, source-chain delays and OCR: 100,000 files alone imply at least about 69.4 days. This is a hypothetical capacity example, not the observed file count.

For a notice with F files and source metadata page size P, an ideal validated shared-session chain would take approximately `1 + max(1, ceil(F/P)) + 2F` requests, excluding adapter-specific identity lookups, independent inventory passes, session refreshes and retries. Current per-file session/list repetition costs more. Measure before setting estimates or raising throughput.

Owner confirmed scope: entire history, newest first, and authorized the proxy pilot. National inventory, all-family adapters, archive versions, automatic recovery and storage/index scale work remain separate follow-up deliverables.
