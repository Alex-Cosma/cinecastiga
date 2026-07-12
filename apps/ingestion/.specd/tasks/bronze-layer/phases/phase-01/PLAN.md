---
task: bronze-layer
phase: 1
depends_on: []
creates:
  - packages/scraper-clients/src/elicitatie/types.ts
  - packages/scraper-clients/src/elicitatie/client.ts
  - packages/scraper-clients/src/elicitatie/notices.ts
  - packages/scraper-clients/src/elicitatie/direct-acquisitions.ts
  - packages/scraper-clients/src/elicitatie/cpv.ts
  - packages/scraper-clients/test/elicitatie.test.ts
modifies:
  - packages/scraper-clients/src/http-client.ts
  - packages/scraper-clients/src/index.ts
---

# Phase 1: Elicitatie endpoint clients

## Objective

Typed clients for the live-verified api-pub surface (RESEARCH.md §1), composing one shared polite HTTP client. All header/rate-limit/envelope concerns end here — jobs above never touch HTTP details.

## Context

**Relevant Decisions:** DEC-005 (conc 3 / 400ms / Retry-After / env-tunable), DEC-009 (mandatory same-site Referer, honest UA).
**From RESEARCH.md:** endpoint table + request bodies §1; envelope `{total, items, searchTooLong}`; GetCANoticeContracts uses skip/take; notice type ID constants; DA list filters = finalizationDate ONLY.

---

## Tasks

### Task 1: http-client extensions (POST + Retry-After)

**Files:** `packages/scraper-clients/src/http-client.ts`, existing test file

**Action:**
- Add `postJson<T>(path, body, init?)` — same politeness path as getJson (semaphore, throttle, retries), JSON body, method POST
- Honor `Retry-After` header on 429: wait max(retryAfterSeconds, backoff) before next attempt
- Extend default headers merge so per-client baseline headers (Referer etc.) can be set once via new `defaultHeaders` option
- Add tests: postJson body delivery, Retry-After respected (mock returns 429 with header once)

**Verify:**
```bash
pnpm --filter @seap/scraper-clients build && pnpm --filter @seap/scraper-clients test
```

**Done when:**
- [ ] postJson + Retry-After + defaultHeaders tested green

---

### Task 2: types + client factory

**Files:** `src/elicitatie/types.ts`, `src/elicitatie/client.ts`

**Action:**
- `types.ts`: `ListEnvelope<T> = {total, items, searchTooLong?}`; list-item interfaces per family (fields from RESEARCH.md §1 — keep to fields we page/reconcile on + passthrough index signature); request-body types; `NOTICE_TYPE_IDS = {participation: [2,17,7,6,12,19], award: [3,13,18,16,8,20]}` constants
- `client.ts`: `createElicitatieClient(opts: {baseUrl?, userAgent, httpClientFactory?})` — builds ONE internal `createHttpClient` with concurrency 3 / minDelay 400 (env-overridable via explicit opts, not process.env here — env reading happens in the app), defaultHeaders: Referer `https://e-licitatie.ro/pub/notices/contract-notices/list/1`, Accept, Content-Type. Returns object exposing raw `getJson`/`postJson` for family modules

**Verify:**
```bash
pnpm --filter @seap/scraper-clients build
```

**Done when:**
- [ ] Client cannot be constructed without userAgent; Referer always present

---

### Task 3: notice + DA + CPV endpoint modules

**Files:** `src/elicitatie/notices.ts`, `src/elicitatie/direct-acquisitions.ts`, `src/elicitatie/cpv.ts`, `src/index.ts`

**Action:**
- `notices.ts`: `listNotices({types, startPublicationDate, endPublicationDate, pageIndex, pageSize})` → POST GetCNoticeList or GetCANoticeList (pick endpoint by type set); `getNoticeDetail(caNoticeId)` → GET C_PUBLIC_CANotice/get; `getNoticeContracts(caNoticeId, {skip, take})` → POST GetCANoticeContracts
- `direct-acquisitions.ts`: `listDirectAcquisitions({finalizationDateStart, finalizationDateEnd, cpvCategoryId?, cpvCodeId?, pageIndex, pageSize})` — type forbids publicationDate params (decorative per DEC-003); `getDirectAcquisitionDetail(id)` → getView; `getQuickView(id)`
- `cpv.ts`: `searchCpvs({filter, pageIndex, pageSize})` → ComboPub/searchCpvs (paged fetch-all helper)
- Dates typed as `IsoDate` string (YYYY-MM-DD); all methods return `ListEnvelope`/detail with `fetchedAt` + status from FetchResult
- Re-export everything from package index

**Verify:**
```bash
pnpm --filter @seap/scraper-clients build
```

**Done when:**
- [ ] Six+ methods typed; DA list type-level rejects publicationDate

---

### Task 4: mock-server tests

**Files:** `test/elicitatie.test.ts`

**Action:**
Mock `node:http` server pattern from http-client.test.ts. Assert:
- Correct paths + methods hit per family; POST bodies match RESEARCH.md shapes (types array, date fields)
- Referer + Content-Type + UA headers present on every request
- Envelope parsed; `searchTooLong: true` passed through verbatim, not swallowed
- GetCANoticeContracts sends skip/take
- 429 with Retry-After → retried after header value (reuse fast timings)

**Verify:**
```bash
pnpm --filter @seap/scraper-clients test && pnpm -r build && pnpm turbo typecheck
```

**Done when:**
- [ ] All green, no live network

---

## Verification

```bash
pnpm --filter @seap/scraper-clients build && pnpm --filter @seap/scraper-clients test
pnpm -r build && pnpm -r test && pnpm turbo typecheck
```

**Phase is complete when:**
- [ ] All tasks done, all commands green

---

## Implementation Log

Capture deviations to `.specd/tasks/bronze-layer/CHANGELOG.md`.
