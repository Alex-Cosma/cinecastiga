---
task: bronze-layer
phase: 2
depends_on: [1]
creates:
  - apps/ingestion/src/scrape/redact.ts
  - apps/ingestion/src/scrape/hash.ts
  - apps/ingestion/src/scrape/archive.ts
  - apps/ingestion/test/redact-hash.test.ts
  - apps/ingestion/test/archive.integration.test.ts
  - packages/db/migrations/0001_*.sql (generated)
modifies:
  - packages/db/src/schema/core.ts
  - apps/ingestion/package.json
---

# Phase 2: Archive plumbing

## Objective

Everything between a fetched payload and its raw_documents row: PII redaction (DEC-006), canonical hashing, idempotent archive writer, plus the `core.scrape_runs` reconciliation table.

## Context

**Relevant Decisions:** DEC-006 (redact BEFORE write, versioned denylist per endpoint_version, hash post-redaction), conventions from RESEARCH.md §6 (externalId namespacing `tender:123`/`da:987`, endpointVersion `{family}-{list|detail}:v1`, scrape_runs columns).
**PII fields known live:** `assignedCAUser`, `assignedSupplierUser` (nested objects with names/emails/phones) in detail payloads; contact fields in notice section1.

---

## Tasks

### Task 1: `core.scrape_runs` migration

**Files:** `packages/db/src/schema/core.ts`, generated migration

**Action:**
Add `scrapeRuns` table per RESEARCH.md §6: id bigserial PK, source text notNull, startedAt timestamptz notNull defaultNow, finishedAt timestamptz, windowStart/windowEnd timestamptz, status text notNull, reportedTotal integer, fetchedCount/insertedCount/skippedCount/pagesFetched integer notNull default 0, deviation integer, error text. Index (source, startedAt). `pnpm --filter @seap/db db:generate && db:migrate`.

**Verify:**
```bash
pnpm --filter @seap/db build && pnpm --filter @seap/db db:migrate && docker compose -f infra/docker-compose.yml exec -T postgres psql -U seap -d seap -c "\d core.scrape_runs"
```

**Done when:**
- [ ] Table live; re-migrate no-op

---

### Task 2: redaction + canonical hash

**Files:** `apps/ingestion/src/scrape/redact.ts`, `src/scrape/hash.ts`, `test/redact-hash.test.ts`

**Action:**
- `redact.ts`: `redactPayload(payload, endpointVersion)` — denylist registry keyed by endpointVersion prefix; v1 denylist: deep-remove keys `assignedCAUser`, `assignedSupplierUser`, and any key matching `/^(contact(Person|Email|Phone)|email|phone|fax)$/i` inside detail payloads (list payloads pass through with same walk — cheap, harmless). Replaced with `"[REDACTED]"` sentinel? NO — remove entirely (retention is the harm). Export `REDACTION_VERSION` string stored nowhere yet but exported for future audit fields.
- `hash.ts`: `contentHash(payload)` — SHA-256 hex of deterministic stringify (recursively sorted object keys, arrays in order), `node:crypto`.
- Unit tests: denylisted keys absent post-redaction (nested); hash stable under key reordering; hash differs on value change; redaction idempotent.

**Verify:**
```bash
pnpm --filter ingestion build && pnpm --filter ingestion test
```

**Done when:**
- [ ] Tests green (unit, no DB)

---

### Task 3: archive writer + run recorder

**Files:** `apps/ingestion/src/scrape/archive.ts`, `apps/ingestion/package.json` (add drizzle-orm), `test/archive.integration.test.ts`

**Action:**
- `archive.ts`:
  - `archiveDocuments(db, docs: {source, externalId, endpointVersion, payload}[])` — redact → hash → bulk insert `.onConflictDoNothing({target: [source, externalId, contentHash]}).returning({id})` → `{inserted, skipped}`
  - `startScrapeRun(db, {source, windowStart, windowEnd})` / `finishScrapeRun(db, id, {status, reportedTotal, fetchedCount, insertedCount, skippedCount, pagesFetched, error?})` — computes deviation
- Add `drizzle-orm` to ingestion deps (same range as @seap/db)
- Widen ingestion `test:integration` script to glob `test/*.integration.test.ts`
- Integration test: archive batch → all inserted; re-archive same batch → all skipped; payload with PII → stored payload lacks denylisted keys; scrape_run lifecycle start→finish with deviation math

**Verify:**
```bash
pnpm --filter ingestion build && pnpm --filter ingestion test:integration
```

**Done when:**
- [ ] Idempotency + PII-absence asserted against real Postgres

---

## Verification

```bash
pnpm -r build && pnpm -r test && pnpm --filter ingestion test:integration && pnpm turbo typecheck
```

**Phase is complete when:**
- [ ] All tasks done, all green

---

## Implementation Log

Capture deviations to `.specd/tasks/bronze-layer/CHANGELOG.md`.
