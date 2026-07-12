# Research: bronze-layer

**Date:** 2026-07-12. Three agents: endpoint discovery (live production Angular bundle + prior-art code), codebase integration (repo read), pitfalls (~80 live API probes — primary source; live findings override repo lore where they conflict).

## Key Recommendation

Build fetchers against the verified `api-pub` surface with: mandatory same-site Referer header, adaptive day→CPV slicing driven by the `searchTooLong` flag, `finalizationDate`-based cursors for direct acquisitions (publicationDate filter is DECORATIVE there — live-verified), PII stripping BEFORE the bronze write, and Europe/Bucharest cursor math. One shared HTTP client instance per source; a new `core.scrape_runs` table carries reconciliation.

---

## 1. Verified endpoint reference (live, 2026-07-12)

Base: `https://e-licitatie.ro/api-pub/...` (historic 2007–2018 mirror: `istoric.e-licitatie.ro`, same routes, still alive).

**Mandatory headers on every call** (403 without Referer — live-verified; UA irrelevant to the WAF):
```
Content-Type: application/json;charset=UTF-8
Referer: https://e-licitatie.ro/pub/... (same-site, matching section)
User-Agent: <honest, stable — works fine WITH Referer>
Accept: application/json, text/plain, */*
```
No auth/cookies/CSRF. `Server: SICAP`, no Incapsula/JS challenge observed on api-pub today (historically associated — could return).

| Purpose | Endpoint | Confidence |
|---|---|---|
| Tender list | `POST /api-pub/NoticeCommon/GetCNoticeList/` | HIGH |
| Award list | `POST /api-pub/NoticeCommon/GetCANoticeList/` | HIGH (live) |
| Notice detail | `GET /api-pub/C_PUBLIC_CANotice/get/{caNoticeId}` | HIGH (live, ~20KB payloads) |
| Award winners/contracts | `POST /api-pub/C_PUBLIC_CANotice/GetCANoticeContracts` | HIGH — skip/take pagination, take≤200 |
| DA list | `POST /api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/` | HIGH (live) |
| DA detail | `GET /api-pub/PublicDirectAcquisition/getView/{id}` | HIGH (live; contains PII + correction flags + `daAwardNoticeID`) |
| DA quick view | `GET /api-pub/DirectAcquisitionCommon/getQuickView/{id}` | HIGH (cheap alternative) |
| DA award notifications list | `POST /api-pub/DaAwardNoticeCommon/GetDaAwardNoticeList/` | HIGH exists; detail endpoint LOW — probe at impl |
| ADV notices list | `POST /api-pub/AdvNoticeCommon/GetAdvNoticeList/` | HIGH (optional family) |
| Entities | `GET /api-pub/Entity/getCAEntityView/{id}`, `getSUEntityView/{id}` | HIGH — cache aggressively |
| CPV combo | `GET /api-pub/ComboPub/searchCpvs?filter=&pageIndex=N&pageSize=100` | HIGH — rebuild CPV id list (~9,455 ids; SEAP-internal `cpvCodeId` ≠ CPV code) |

**Notice list body** (GetCNoticeList / GetCANoticeList):
```json
{
  "sysNoticeTypeIds": [3, 13, 18, 16, 8],
  "sortProperties": [], "pageSize": 100, "pageIndex": 0,
  "startPublicationDate": "2026-07-01", "endPublicationDate": "2026-07-11",
  "sysNoticeStateId": null, "contractingAuthorityId": null, "winnerId": null,
  "cPVCategoryId": null, "cPVId": null, "sysAcquisitionContractTypeId": null,
  "sysContractAssigmentTypeId": null, "assignedUserId": null
}
```
Type IDs — participation: 2=CN, 17=SCN(simplified), 7=RFQ, 6=PC, 12=DC, 19=LR. Award: 3=CAN, 13=SCAN, 18=PCAN, 16=RFQAN, 8=DCAN, 20=LRAN.

**DA list body** — ⚠️ CONFLICT RESOLVED LIVE: `publicationDateStart/End` fields are silently IGNORED on this endpoint (sending only them returned unfiltered 2019 data). **Only `finalizationDateStart/End` filters work.** Day granularity only — time components silently ignored.
```json
{
  "pageSize": 100, "pageIndex": 0, "showOngoingDa": false, "cookieContext": null,
  "finalizationDateStart": "2026-07-01", "finalizationDateEnd": "2026-07-01",
  "cpvCategoryId": null, "cpvCodeId": null, "sysDirectAcquisitionStateId": null,
  "contractingAuthorityId": null, "supplierId": null
}
```

**Response envelope everywhere:** `{ total, items[], searchTooLong }` (GetCANoticeContracts: `{total, items}` with skip/take).

Key list-item fields — notices: `caNoticeId` (detail key), `noticeNo`, `sysNoticeTypeId`, `sysNoticeState{}`, `noticeStateDate`, `contractingAuthorityNameAndFN`, `contractTitle`, `cpvCode`, `ronContractValue`, `publicationDate`... DAs: `directAcquisitionId` (detail key), `uniqueIdentificationCode`, `cpvCode`, `publicationDate`, `finalizationDate`, `supplier`, `contractingAuthority`, `closingValue`, `isOpenForCorrection`, `isOpenForContractCorrection`.

---

## 2. Critical API behaviors (live-verified)

**2000-record hard cap + `searchTooLong`.** `total` caps at 2000; page beyond it → HTTP 200 `{total:2000, items:[], searchTooLong:true}`. Flag appears on page 0 whenever the true set exceeds cap; `total` is truthful iff `searchTooLong:false`. `pageSize` silently clamps to 2000. **Treat searchTooLong at leaf slice = data loss, abort/alert, never trust its total.**

**Adaptive slicing required for DAs.** One weekday ≈ 8,200–12,000 finalizations (live: cat 6 alone overflowed); Sunday = 90. Strategy: probe day unsliced → overflow? fan out by `cpvCategoryId` (~12) → still overflowing categories fan out by `cpvCodeId` within category. ~15–800 list calls/day vs prior art's brute-force 9,455. Slices disjoint within ONE dimension only — never mix category- and code-level counts of the same day.

**Silently-ignored unknown filter fields.** Typo/wrong field name = unfiltered firehose, no 400. **Invariant check every list response: every item's date must fall in the requested window; violation → abort run, don't advance cursor.**

**Maintenance/outages.** Multi-day outages documented (Dec 2023: ~5 days). During downtime, front door may serve 200-HTML — validate Content-Type + schema before archiving. Cursor-driven catch-up must tolerate multi-day gaps; suppress volume alerts in known maintenance windows.

**Transient 5xx routine on detail endpoints** (prior art: 8 retries, exp backoff). Retry 5xx/network; never retry 400; dead-letter individual record IDs, don't fail the day.

**No robots.txt** (404 both hosts) — politeness is on us.

---

## 3. Cursor / watermark design

- **DAs:** watermark on `finalizationDate` (near-append-only; nightly batch finalizations 00:00–02:30 local). No modified-date filter exists; corrections mutate detail payloads without re-surfacing in lists → (a) 2–3 day trailing lookback re-scan every run; (b) re-fetch details flagged `isOpenForCorrection`/`isOpenForContractCorrection` until closed; (c) quarterly full reconcile vs data.gov.ro catches arbitrary late edits.
- **Notices:** `publicationDate` cursor sound for discovery (~239/day — day windows trivially safe; don't exceed ~1 week). State changes (suspension/cancel) mutate `sysNoticeState`/`noticeStateDate` WITHOUT changing publicationDate → trailing 30–60-day list-only re-scan, diff noticeStateDate vs archive, re-fetch changed details. Awards arrive as new notices (discovered normally); contracts via GetCANoticeContracts (paginate if >200).
- **Timezone:** all timestamps Romania-local with offset; date filters = Europe/Bucharest calendar days. Compute cursors in Europe/Bucharest; daily job after ~03:00 local; only ingest closed windows (D-1 and older — paginating an open day shifts pages).
- **Cursor payload:** JSON in `ingestion_watermarks.cursor` (`{"windowStart":..., "page":N}`), advance in same transaction as the page's raw inserts.

---

## 4. Politeness / rate limits

Conflicting intel: two 2026 repos claim rate-limiting since ~March 2025 (429 + Retry-After; one uses 1 conc + 2s delay); live probing today at ~2.5 req/s (80 requests) drew zero throttling, and 2021 prior art ran concurrency 5 for years unbanned. **Posture: default concurrency 3, minDelay 400ms (~2–2.5 req/s effective), honor Retry-After, automatic cool-down on any 429/403 streak; make it config so it can drop to 1/2s instantly.** Don't discover the threshold.

Volume math at that rate: 30-day DA sample ≈ 200–230k records → ~210k detail calls ≈ **~24h spread over runs** (chunked jobs make this resumable); daily incremental ≈ 9.5k details + ~50 lists ≈ **~1h**. Notices 30d ≈ 7.2k × 2 calls ≈ 1.5h. Entity lookups: cache hits skip fetch.

WAF vs honesty: Referer must be same-site (hard 403 otherwise), UA can stay honest — record the optics note, keep contact info in UA.

---

## 5. GDPR at the bronze boundary (design change)

Detail payloads contain contact-person PII: `assignedCAUser`, `assignedSupplierUser` (names/emails/phones — live-verified in getView). Prior art strips them and its README warns collecting violates GDPR. **Append-only raw archive = PII retention: strip/redact these fields BEFORE the raw_documents write.** A small documented redaction transform (field allowlist/denylist per endpoint_version) runs between fetch and archive; redaction list versioned with the endpoint clients. "We archive raw JSON" is not a GDPR defense. (Aligns with project PITFALLS.md GDPR section.)

---

## 6. Codebase integration (repo-verified)

- **Client composition:** politeness state (semaphore, throttle) is per-`createHttpClient` instance — **exactly one instance per source per process** or budgets multiply. `createElicitatieClient({httpClient})` factory in `packages/scraper-clients/src/elicitatie/`; module-level lazy singleton in `apps/ingestion/src/scrape/elicitatie/client.ts`; DI at task-construction time (`makeScrapeTendersTask(deps)`) so tests point baseUrl at a mock server. Re-export from `packages/scraper-clients/src/index.ts` (no subpath exports configured).
- **Watermarks:** existing table suffices; keys `elicitatie:tenders|awards|direct_acquisitions`; upsert `onConflictDoUpdate` in same tx as page inserts.
- **New table `core.scrape_runs`** (migration): id, source, startedAt/finishedAt, windowStart/windowEnd, status(running|completed|failed), reportedTotal (nullable), fetchedCount/insertedCount/skippedCount, pagesFetched, deviation, error; index (source, startedAt). This is what the kill/resume success criterion inspects.
- **raw_documents unchanged:** encode family in `endpointVersion` (`tender-detail:v1`) + namespace `externalId` (`tender:123`, `da:987`) — the unique index is (source, external_id, content_hash) with source='elicitatie' for all families; raw numeric IDs could collide cross-family.
- **Content hash:** SHA-256 of deterministic stringify (sorted keys) of the **post-redaction** parsed JSON, in `archive.ts` (single chokepoint) — jsonb discards key order, so raw-bytes hashing breaks idempotency. Insert `.onConflictDoNothing().returning()` → inserted/skipped counts feed scrape_runs.
- **Job shape:** per-family cron job processes a bounded date-window chunk, watermark per page, re-enqueues itself for next chunk (`helpers.addJob` + jobKey/named queue for overlap protection; crontab `?max=1`). NOT one monolith (graphile-worker 4h lock traps SIGKILL) and NOT job-per-page. Worker concurrency counts jobs; shared HTTP client caps requests globally — jobs may Promise.all detail fetches freely.
- **Sample mode:** `SCRAPE_SAMPLE=30d` env + `dev:scrape` enqueue script via makeWorkerUtils — not a cron concern.
- **Friction:** add `drizzle-orm` to ingestion deps (pnpm strict); ESM `.js` suffixes; `pnpm --filter ingestion dev` uses stale package dist — build deps first or run `tsc -w` alongside; widen ingestion `test:integration` to glob; consider demoting every-minute heartbeat.

---

## 7. Reconciliation + alerting

- Trustworthy count: slice `total` iff `searchTooLong:false`, re-queried after window closes; reconcile archived == total per slice.
- data.gov.ro `achizitii-publice-{year}`: quarterly XLSX (7 files/quarter mapping 1:1 to our families), ~1 quarter lag, OGL-ROU-1.0 — quarterly ground-truth reconcile; alert if archive misses >0.5% of a closed quarter.
- **Page immediately:** searchTooLong surviving at leaf depth; 200 with non-JSON/schema violation; filter-echo invariant violation; cursor stuck >48h outside maintenance.
- **Daily digest:** slice mismatch after window-close; volume outside ±40% of trailing 4-week same-weekday median (weekends/holidays: 90 vs 8,227 is NORMAL); retry rate >5%.
- Per-source freshness monitoring — SICAP.ai's index once silently stalled for tenders while DAs kept flowing (issue #24).

---

## 8. Confidence + open items (updated post-live-smoke, 2026-07-12)

| Area | Level |
|---|---|
| Endpoint surface + bodies | HIGH (live bundle + live probes + smoke runs) |
| DA filter semantics, cap, searchTooLong | HIGH (live-verified) |
| Rate-limit threshold | LOW — no throttling observed at conc 3/400ms across ~800 smoke requests; posture stays conservative |
| eForms v2 notice details | RESOLVED-DEFERRED — classic detail 400s v2 (`sysNoticeVersionId=2`); **100% of recent participation notices are v2**; per-section endpoints (`GET NoticeCommon/GetSection{N}View/?initNoticeId={noticeId}&sysNoticeTypeId={t}`) verified 200 but 6-7 req/notice; v2 archived list-only for now — dedicated follow-up task |
| DA award-notification detail endpoint | UNRESOLVED — 2 candidates 404'd; list endpoint HIGH and rich; family optional |
| DA detail `getView` | HIGH — verified at scale (90 live calls, 0 failures) |

### Live-smoke corrections to §1 (authoritative)

- **Notice list items carry NO `publicationDate`** — only `noticeStateDate` (mutates on state change; can postdate, never precede publication). Filter-echo invariant uses "state date must not precede requested day".
- **Participation lists key items as `cNoticeId`**; award lists as `caNoticeId`. Detail endpoint `C_PUBLIC_CANotice/get/{id}` accepts either — but 400s v2 notices.
- **`Origin` header must be apex** (`https://e-licitatie.ro`) — the www variant hard-403s.
- Smoke volumes: tenders 2026-07-09/10 = 94 + 108 notices (all v2); DAs Sunday 2026-07-05 = 90 (matches probe exactly).

**Local artifacts** (scratchpad, this session): sicap-parser client + postman collection, seap-monitor-demo client, SICAP.ai ES types, live app-pub bundle. Prior-art fork `upbeside/sicap-parser` is load-bearing (original deleted) — consider vendoring.
