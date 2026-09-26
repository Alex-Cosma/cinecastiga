# Production collection restart — audit and proposal, 2026-09-26

Status: **planning only**. Production was inspected through SSH as `seap`, using read-only PostgreSQL transactions with 10–15 second statement timeouts. No production files, configuration, data or services were changed. No SEAP requests were issued (prior document-pilot cumulative total remains 23).

## Confirmed user decisions

- Collect on the application server: direct acquisitions, participation notices, award notices.
- One shared SEAP HTTP budget, including on-demand source document acquisition: random 50–70 second spacing, approximately one request/minute, one request in flight globally.
- No automatic PDF crawl. Existing archived files remain public and consume no SEAP budget.
- Process collected data daily at 05:00 with a maintenance page. Proposed timezone: Europe/Bucharest, including DST.
- Earlier document policy still requires at least 60 seconds between file-download attempt starts; satisfy both constraints when scheduling noticedoc GETs.

## Verified production state

- Running checkout: `7b9ae31`; web, Caddy, PostgreSQL and Meilisearch healthy. No ingestion/document container shown by `docker ps`.
- Database size: 25 GB. Host: approximately 921 GB disk available, 21 GiB memory available at inspection.
- 26 applied Drizzle migrations. The pending application/deployment changes are on the feature branch; this audit does not deploy them.
- `raw.raw_documents`: **0 rows**, consistent with the initial restore excluding raw payloads. Raw ID sequence last value **17,308,073**, equal to the largest copied normalization watermark. Therefore new raw IDs should follow the old range; do not reset sequences or watermarks. Verify sequence allocation/is_called before first ingestion. Preserve existing core identities and all app/auth data. An incremental path does not require recrawling all historic raw data; a raw-only full rebuild would lose history and is forbidden here.
- Known authority namespace: **35,810 IDs**.
- DA cursor: `{lastId:162972200}`; no date window. Never reuse it for a new date window.
- Participation and award cursors both point to `windowStart=2018-01-01`, `day=2018-01-02`, `page=0`.
- DA latest completed run has a window ending 2026-07-16; the latest run by start time is instead a historic 2020 scan. A completed DA run is not sufficient proof that all authorities or prior chunks were complete; reported totals are null.
- Latest recorded notice/award run windows end 2026-01-11. Earlier failed/running entries remain. This is not evidence that everything through that date is complete, nor that later source data is entirely absent.
- Maximum DA finalization: `2026-07-16 15:10:18+00`.
- Maximum contract date: `2026-07-09 21:00:00+00` (July 10 in Bucharest). This is a contract date, not source publication coverage.
- Latest notice state date: July 11; state changes do not establish publication dates or complete coverage.
- Production lacks the new `marts.data_coverage` table. Local coverage reports must not be presented as production observations.

**Conclusion:** no verified contiguous “through July 31” resume boundary exists. Do not start blindly on August 1 or run the old worker against its current cursors.

## Requests and cost

Base host: `https://www.e-licitatie.ro`. Paths and sizes below describe the current repository implementation, not fresh source verification:

| Method/path | Purpose and partition |
| --- | --- |
| POST `/api-pub/Participants/GetParticipants/` | Authority catalogue, pages of 2,000, type 2; save once per planned inventory, union with known IDs. |
| POST `/api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/` | DA, finalization-date range plus authority, page size 2,000. Split overflowing windows; do not use ignored publication/time-of-day filters. |
| POST `/api-pub/NoticeCommon/GetCNoticeList/` | Participation, publication day, pages of 100, type IDs 2/17/7/6/12/19. |
| POST `/api-pub/NoticeCommon/GetCANoticeList/` | Awards, publication day, pages of 100, type IDs 3/13/18/16/8/20. |
| GET `/api-pub/C_PUBLIC_CANotice/get/{id}` | Classic notice detail, one per applicable notice. Current implementation defers eForms v2 detail; mapping remains a gap, not silently complete. |
| POST `/api-pub/C_PUBLIC_CANotice/GetCANoticeContracts` | Award contracts/winners, `caNoticeId`, pages of 200 using skip/take. |

Do not enable DA detail-per-record (`PublicDirectAcquisition/getView/{id}`) by default: it adds one request for every DA. Optional corrections/details need an explicitly visible separate workload. Source-file jobs include their own HTML/session, metadata, verification POST and file GET in the same budget; one file is not one request.

Current authority-by-authority DA scan needs **at least 35,810 list calls for one catch-up window covering the known catalogue**, before new authorities, inventory pages, splits, failed attempts or either notice family. At 60 seconds mean spacing this is about 597 hours / 24.9 days nonstop. Maintenance, source latency and document jobs increase elapsed time. This is a strategy-specific floor, not a total estimate for all missing data.

Total = catalogue pages + DA list/split pages + participation list pages + award list pages + applicable classic details + award-contract pages + session/failed/repeated requests. Persist actual transport attempts separately from successful pages; existing `pages_fetched` undercounts HTTP traffic.

A finite exact total cannot be obtained from these cursors. Discovery expands the manifest using source counts and newly seen IDs. Report known pending, completed, failed and still-to-discover work separately, with bounds rather than a fabricated exact percentage. Freeze the first target at the previous closed day; new days form subsequent work.

Possible optimization: validate date-first DA partitions and only use finer supported filters when over the 2,000 result ceiling, instead of always querying 35,810 authorities. Must establish exhaustive/disjoint partition coverage, filter behavior and total reconciliation before adopting; do not assume national pagination can exceed the cap. Reusing a saved authority inventory avoids repeated enumeration every 200 authorities in the old task factory.

## Accepted recovery windows; proposed discovery pilot

- DA: July 1, 2026 through the last closed day, overlapping the apparent July cutoff.
- Participation/awards: January 1, 2026 through the last closed day, because current journals do not establish later coverage. Deduplicate by stable source identity and version/hash. This rechecks 2026; it does not certify older history.
- User accepted both recovery windows and keeping maintenance enabled on a processing error. At audit date, January 1–September 25 contains 268 days: 536 initial notice-list calls across both families, before pagination/details/contracts.
- After approving the plan, run a separately bounded discovery pilot from the production host, e.g. at most six HTTP attempts under the shared limiter, stop on denial/challenge. Save each useful response. This tests connectivity, current envelopes/counts and filter behavior; six calls cannot establish the total workload.
- No live pilot has run. Approval of recovery windows and maintenance behavior is planning input, not an instruction to start the collector before presenting the plan.

## Required collector changes before startup

1. Durable shared dispatcher for ingestion and document acquisition: persisted last attempt/next allowed time, one global in-flight lease/lock, restart-safe scheduling, no accumulated burst. Every transport attempt, including retries/session traffic, goes through it. Block unbudgeted automatic redirects/retries. Pause globally on 403/429/challenge, respect Retry-After, expose reason and manual resume.
2. Durable task identity includes source, date window, authority/other partition, page and schema/version. Archive each successful response and advance its checkpoint atomically. Separate pending detail/contract tasks from discovered lists; never mark a period complete while required work is missing. Handle changing pagination through bounded overlap/reconciliation and deduplication.
3. Replace the old Graphile schedules/concurrency/retry defaults. Existing jobs include 04:30 participation, 04:40 awards, 05:00 DA and separate rescans: they must not run alongside the new dispatcher.
4. Progress view/log: attempts today/total, current task, next request time, known queue, failed/deferred work, observed date ranges and verified partition coverage. Pause/resume survives restarts. Don't label every dataset current just because some institutions have recent records.
5. Test scheduler/restart/failure behavior against fixtures, then the bounded source pilot. No live source traffic in ordinary tests.

## Proposed 05:00 publication sequence

1. Scheduler fires once per Bucharest calendar date, excludes simultaneous deployment/refresh, stops admission of SEAP work and drains in-flight request/archive commit. Defer new document processing jobs too; preserve their queue.
2. Activate maintenance for public pages **and APIs**, with 503/Retry-After/no-cache. Stop or drain background analytic writers/readers that could observe mixed stages. CDN maintenance/cache behavior must also be tested.
3. Record a fixed raw upper bound/batch manifest; take and verify a recoverable backup of the existing production state. Current sequence remains monotonic. Never run normalize `--rebuild`, truncate historic core or reset identities.
4. Run incremental normalize/reconcile, TED-derived marts as applicable to already present data, marts, flags, Radiografie and coverage; rebuild/search-index changes need explicit inclusion (not currently part of monitoring-refresh). Use a shadow search index and switch after success where possible.
5. Validate integrity, totals, quarantine, checkpoint readiness and representative pages/source links; invalidate caches and wait for search-index tasks. Publish only verified data. Incomplete collection remains explicitly incomplete.
6. Reopen, resume collection with spacing intact, then allow watches to compare against the new validated checkpoint. No source requests during processing. If no new raw work, skip unnecessary maintenance/rebuild.

The current refresh pipeline commits stages separately. On failure it cannot safely serve the old dataset merely by removing maintenance. **User accepted remaining in maintenance until recovery/verified restore.** Automatically serving the previous version would need additional snapshot/staging infrastructure. Benchmark processing and backup/restore on a clone before promising a maintenance duration.

The TED source crawler is outside the confirmed three SEAP flows. Recomputing marts from existing TED data does not collect newer TED records; expose that coverage separately.
