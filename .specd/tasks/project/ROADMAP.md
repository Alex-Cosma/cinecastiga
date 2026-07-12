# Roadmap: seap-analytics

## Overview

| Metric | Value |
|--------|-------|
| Total Phases | 9 |
| Sub-Projects | 2 |
| v1 Requirements | 16 |

---

## Sub-Projects

| Name | Type | Technology | Description |
|------|------|-----------|-------------|
| ingestion | worker | TypeScript, graphile-worker, Postgres | Scraper + normalizer + entity resolution + marts/red-flag batch jobs + search sync |
| web | frontend | Next.js (App Router), ISR + Cloudflare CDN | Public site: search, profiles, dashboards, visualizations, methodology pages |

Both live in one pnpm/Turborepo monorepo with shared packages (`db`, `domain`, `scraper-clients`, `search-sync`). Infra: Postgres 16+/18, Meilisearch, docker-compose on single VPS.

---

## Phases

- [ ] **Phase 1: Monorepo + infra foundation** — workspace, docker-compose (Postgres+Meilisearch), CI, schemas raw/core/marts (setup)
- [ ] **Phase 2: Ingestion foundation — bronze layer** — scraper clients, raw archive, cursors, reconciliation (REQ-001 partial, REQ-006)
- [ ] **Phase 3: Normalization + entity resolution** — core schema, CUI-keyed entities, alias dedup (REQ-002)
- [ ] **Phase 4: Backfill + direct-purchase firehose** — 2018→now history, direct_acquisitions track (REQ-001 complete)
- [ ] **Phase 5: Marts + search index** — incremental rollups, Meilisearch sync (REQ-013, REQ-004 index)
- [ ] **Phase 6: Web — search + records** — faceted/FTS UI, record pages, traceability, permalinks, export, CPV browsing (REQ-003, 004, 006, 008, 009, 010)
- [ ] **Phase 7: Web — profiles + dashboards + visualizations** — entity profiles, national dashboards, treemaps/choropleth/trends (REQ-005, 007, 016)
- [ ] **Phase 8: Red-flag engine + critical views** — indicator batch jobs, methodology pages, direct-purchase analytics, relationships + benchmarking (REQ-011, 012, 014, 015)
- [ ] **Phase 9: Performance + launch hardening** — CDN/ISR tuning, monitoring, GDPR/legal checklist, load validation (cross-cutting)

---

## Phase Details

### Phase 1: Monorepo + infra foundation

**Goal:** Running skeleton: pnpm/Turborepo workspace, `packages/db` with raw/core/marts Postgres schemas + migrations, `packages/domain` types, docker-compose (Postgres, Meilisearch), GitHub Actions CI, deploy path to VPS.
**Sub-project:** both (root scaffolding via ingestion setup task)
**Requirements:** infrastructure prerequisite for all
**Creates:** workspace config, docker-compose, migration tooling, CI pipeline
**Dependencies:** none
**Success Criteria:**
1. `pnpm install && pnpm build` green in CI
2. `docker compose up` yields Postgres with three schemas + Meilisearch
3. Migration tool applies/rolls back cleanly

### Phase 2: Ingestion foundation — bronze layer

**Goal:** Politely scrape e-licitatie.ro tender/award endpoints into an append-only raw archive with durable cursors and count reconciliation. THE load-bearing phase — no parsing before archiving.
**Sub-project:** ingestion
**Requirements:** REQ-001 (partial), REQ-006 (source IDs retained)
**Creates:** `packages/scraper-clients` (rate limiting, retry/backoff, honest User-Agent, response versioning), `raw_documents` writes, graphile-worker job scheduling, ingestion-state tracking, reconciliation alerts, ingestion-volume dashboard (internal)
**Dependencies:** Phase 1
**Success Criteria:**
1. Daily scheduled run lands new notices in `raw_documents` with content_hash dedup
2. Kill mid-run → resumes from cursor, no gap, no duplicates
3. Fetched-vs-reported count mismatch raises alert
4. data.gov.ro dump cross-check job reconciles record counts for a sample period

### Phase 3: Normalization + entity resolution

**Goal:** Replayable raw→core transforms; canonical entities.
**Sub-project:** ingestion
**Requirements:** REQ-002
**Creates:** normalize pipeline (era-aware parsers, fail-loud zod validation), `entities`/`entity_aliases` with CUI checksum validation, fuzzy-match review queue, versioned merge decisions, Unicode NFC + diacritics normalization
**Dependencies:** Phase 2
**Success Criteria:**
1. Full reprocess from raw archive without network access
2. Valid-CUI records resolve to canonical entities; ambiguous → queue, never silent merge
3. Schema drift in source → loud validation error, raw still archived

### Phase 4: Backfill + direct-purchase firehose

**Goal:** Complete history 2018→now, including `direct_acquisitions` (year-partitioned, ~20M+ rows expected).
**Sub-project:** ingestion
**Requirements:** REQ-001 (complete)
**Creates:** backfill orchestration (resumable, rate-limited, runs for days safely), direct-purchase fetchers + parsers, partition management
**Dependencies:** Phase 3
**Success Criteria:**
1. Tenders+awards 2018→now complete, reconciled vs data.gov.ro counts
2. Direct acquisitions ingested into partitioned table
3. Backfill and live incremental run concurrently without interference

### Phase 5: Marts + search index

**Goal:** Precomputed read layer: incremental rollups + Meilisearch.
**Sub-project:** ingestion
**Requirements:** REQ-013, REQ-004 (index side)
**Creates:** `entity_stats`, `national_stats_*` incremental rollup jobs (per-batch update, not full recompute), `packages/search-sync` incremental indexers (aliased indices, atomic swap), refresh-duration monitoring
**Dependencies:** Phase 4 (works against partial data from Phase 3 onward)
**Success Criteria:**
1. Rollups update incrementally per ingestion batch
2. Search index syncs incrementally; full rebuild possible without downtime (alias swap)
3. Refresh durations graphed; no superlinear growth on backfill volume

### Phase 6: Web — search + records

**Goal:** Public site core: search everything, open any record, cite it.
**Sub-project:** web
**Requirements:** REQ-003, REQ-004, REQ-006, REQ-008, REQ-009, REQ-010
**Creates:** Next.js app, faceted+FTS search UI (Meilisearch), record detail pages with SEAP source links, CPV drill-down, CSV export, permalink query-state encoding, Romanian UI strings
**Dependencies:** Phase 5
**Success Criteria:**
1. Search with all facets returns in <300ms p95 (cached edge hits near-instant)
2. Every record page links to originating e-licitatie.ro notice
3. Permalink reproduces exact result set; CSV export streams full result set

### Phase 7: Web — profiles + dashboards + visualizations

**Goal:** The "better view": entity profiles, national dashboards, treemaps/choropleth/trend charts.
**Sub-project:** web
**Requirements:** REQ-005, REQ-007, REQ-016
**Creates:** authority/supplier profile pages (reads entity_stats only), national dashboard pages, treemap drill-down (national→CPV→authority→supplier), Romania county choropleth, trend charts on every profile/dashboard, ISR revalidation strategy
**Dependencies:** Phase 6
**Success Criteria:**
1. Profile pages render from marts only — zero raw/core queries at request time
2. Treemap drills national→entity; choropleth metric selectable
3. Every profile shows at least one 2018→now trend chart

### Phase 8: Red-flag engine + critical views

**Goal:** The "critical view": indicator suite computed in batch, displayed with methodology + benchmarking. Pre-work gate: manual read of OCP red-flags PDF + opentender D2.2 to finalize formulas; legal framing checklist.
**Sub-project:** ingestion (compute) + web (display)
**Requirements:** REQ-011, REQ-012, REQ-014, REQ-015
**Creates:** red-flag batch jobs (~10-15 indicators; multi-tender aggregation, sample sizes, base rates), `red_flags` mart, threshold-splitting detection over direct_acquisitions, buyer-supplier award-pair aggregation, percentile peer cohorts, methodology page per indicator (formula + caveats + dispute mechanism), flag display on profiles/records
**Dependencies:** Phases 4, 5, 7
**Success Criteria:**
1. Every displayed flag traces to reproducible rule + cited records
2. No company-level flag from single tender; sample size + base rate always shown
3. Methodology pages live simultaneously with first public flag
4. Threshold-splitting detector finds known synthetic test patterns

### Phase 9: Performance + launch hardening

**Goal:** "Cached and move super fast" verified; legal/ops checklist done.
**Sub-project:** both
**Requirements:** cross-cutting (performance goal from PROJECT.md; GDPR/defamation posture from PITFALLS.md)
**Creates:** Cloudflare edge-cache rules + ISR tuning, Uptime Kuma + Sentry, index-bloat/autovacuum monitoring, GDPR items (lawful-basis note, contact-data stripping verification, data-subject request path), load test on realistic traffic, launch checklist
**Dependencies:** Phases 6–8
**Success Criteria:**
1. p95 <300ms on uncached dynamic pages; edge-cached pages <100ms
2. Contact persons' phones/emails/CVs verifiably stripped from public output
3. Monitoring alerts on ingestion gaps, refresh growth, error spikes
4. Legal read (defamation + GDPR) obtained before public launch

---

## Execution Order

```
Phase 1 (foundation)
└── Phase 2 (bronze layer)
    └── Phase 3 (normalize + entities)
        └── Phase 4 (backfill + firehose)
            └── Phase 5 (marts + search)
                └── Phase 6 (web: search)
                    └── Phase 7 (web: profiles + viz)
                        └── Phase 8 (red flags + critical views)
                            └── Phase 9 (hardening + launch)

Parallelism notes:
- Phase 4 backfill runs for days — Phases 5-6 development proceeds against partial data
- Phase 8 pre-work (OCP formula reading, legal consult) can start any time
```

---

## Requirements Coverage

| REQ-ID | Feature | Phase |
|--------|---------|-------|
| REQ-001 | Complete ingestion pipeline | 2, 4 |
| REQ-002 | Entity resolution layer | 3 |
| REQ-003 | Faceted search | 6 |
| REQ-004 | Full-text search | 5 (index), 6 (UI) |
| REQ-005 | Entity profile pages | 7 |
| REQ-006 | Source traceability | 2, 6 |
| REQ-007 | National dashboards | 7 |
| REQ-008 | CPV taxonomy browsing | 6 |
| REQ-009 | CSV/Excel export | 6 |
| REQ-010 | Stable permalinks | 6 |
| REQ-011 | Curated red-flag suite | 8 |
| REQ-012 | Published methodology pages | 8 |
| REQ-013 | Precomputed aggregates (marts) | 5 |
| REQ-014 | Direct-purchase analysis | 4 (ingest), 8 (analytics) |
| REQ-015 | Relationships + benchmarking | 8 |
| REQ-016 | Interactive visualizations | 7 |

Coverage: 16/16.
