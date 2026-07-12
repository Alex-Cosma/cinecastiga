# Changelog: bronze-layer

### 2026-07-12 - Phase 5 live smoke findings

**Origin header: apex only**
- **What:** Client sent `Origin: https://www.e-licitatie.ro` → hard 403. Fixed to apex `https://e-licitatie.ro`.
- **Files:** `packages/scraper-clients/src/elicitatie/client.ts`

**Notice lists carry noticeStateDate, not publicationDate**
- **What:** Filter-echo invariant rewritten: item's state-date day must not PRECEDE the requested day (state date can postdate publication, never precede it).
- **Why:** Live items (both families) have no publicationDate field. Invariant correctly aborted the first run — worked as designed.
- **Files:** `apps/ingestion/src/scrape/elicitatie/notices.ts`, integration mocks

**cNoticeId vs caNoticeId**
- **What:** Participation lists key items as `cNoticeId`; awards as `caNoticeId`. `noticeIdOf()` helper handles both; detail endpoint accepts either id.
- **Files:** `packages/scraper-clients/src/elicitatie/types.ts`, scrape modules, mocks

**v2/eForms notices: list-only archive; detail deferred (FOLLOW-UP TASK)**
- **What:** `sysNoticeVersionId=2` notices 400 on `C_PUBLIC_CANotice/get`. Live smoke: 202/202 recent tenders are v2 — the eForms era is fully here. Archived list-only; per-section endpoints verified working (`GetSection{N}View/?initNoticeId=&sysNoticeTypeId=`) but cost 6-7 req/notice. Detail failures now dead-letter (counted, noted on scrape run) instead of failing the day.
- **Files:** `apps/ingestion/src/scrape/elicitatie/notices.ts`

**Live smoke results (2026-07-12)**
- Tenders 07-09..07-10: 202 notices archived, re-run after watermark reset → 0 inserted / 202 skipped (idempotency live-proven). All v2.
- DAs Sunday 07-05: 90 records (matches research probe exactly), 180 rows (list+detail), single unsliced slice, 0 lost, getView 90/90.
- PII check on all 382 archived rows: 0 rows containing assignedCAUser/assignedSupplierUser/email.
- No 429/403 throttling across ~800 requests at conc 3 / 400ms.
- DA award-notification detail endpoint: 2 candidates 404 — family stays deferred.

### 2026-07-12 - Phase 2 PLAN.md

**test:integration uses vitest substring filter, not glob**
- **What:** `vitest run integration.test` instead of the planned `vitest run 'test/*.integration.test.ts'`.
- **Why:** vitest CLI args are filename filters, not shell globs — the quoted glob matched zero files (silent no-op, worse than failing).
- **Files:** `apps/ingestion/package.json`
