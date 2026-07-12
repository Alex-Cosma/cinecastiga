# Architecture Research: seap-analytics

**Project type:** Public-good procurement transparency platform (ingestion pipeline + analytics + public search/dashboard site) — solo developer, no accounts, low-ops, tens of millions of rows.
**Confidence:** MEDIUM-HIGH overall (verified against two direct prior-art projects in the exact same domain, plus current industry consensus on modular monoliths and Postgres/ClickHouse tradeoffs)

## Recommended Architecture

**Pattern:** Modular monolith, split into exactly two deployables (a scheduled ingestion worker + a request-serving web app), sharing code through internal packages in a single monorepo.

**Why:**
- Solo dev + "low-ops, one VPS" constraint rules out microservices outright — industry trend is back toward modular monoliths for exactly this profile.
- Direct prior art in the same domain: **sicap.ai** (github.com/ciocan/sicap.ai) is a Turborepo/pnpm monorepo with one Next.js app and shared packages, not microservices.
- The real architectural fault line isn't "search vs profiles vs dashboards" (just read paths off the same data) — it's **scraping/batch (long-running, bursty, crash-and-retry) vs serving (fast, cacheable, always up)**. That's the only split worth paying deployment complexity for.

## Service Boundaries (Sub-Projects)

| Sub-project | Type | Responsibility | Technology | Communication |
|---|---|---|---|---|
| `apps/ingestion` | Scheduled worker (deployable #1) | Scrape e-licitatie.ro unofficial endpoints + data.gov.ro dumps; archive raw responses; normalize into canonical schema; entity resolution; compute aggregates + red flags; sync search index | Node.js/TypeScript, graphile-worker (Postgres-backed job queue) | Writes to shared Postgres; pushes docs to search engine |
| `apps/web` | Public site (deployable #2) | Search UI, entity profiles, national dashboards, red-flag surfacing. Reads only — never writes | Next.js (App Router), SSR/ISR + CDN caching | Reads Postgres (marts) + search engine; no dependency on ingestion internals |
| `packages/db` | Shared library | Postgres schema/migrations, typed client, defines `raw` / `core` / `marts` schemas | Drizzle or Prisma | Imported by both apps |
| `packages/domain` | Shared library | Canonical TS types: Notice, Award, Contract, Entity, RedFlag; shared validation | TypeScript | Imported by both apps |
| `packages/scraper-clients` | Shared library | e-licitatie.ro + data.gov.ro HTTP clients: rate limiting, retry/backoff, response versioning for schema drift | TypeScript | Used only by `ingestion` |
| `packages/search-sync` | Shared library | Postgres → search-engine indexers (incremental, not full-rebuild) | TypeScript | Used only by `ingestion` |
| Postgres | Infra dependency | System of record: raw archive, normalized entities/contracts, precomputed aggregates | PostgreSQL 16+ | — |
| Meilisearch | Infra dependency | Full-text search over notices/entities (Romanian diacritics-aware) | Meilisearch | Queried by `web` |

Two deployables, not three — do **not** stand up a separate "api" service. `apps/web`'s API routes are the API layer; a third service adds a network hop for no isolation benefit at this scale.

## Data Model

**Key Entities:**

| Entity | Description | Layer |
|--------|-------------|-------|
| `raw_documents` | Append-only archive: one row per fetched response — `source`, `external_id`, `payload jsonb` (or object-storage pointer), `content_hash`, `fetched_at`, `endpoint_version` | raw |
| `entities` | Canonical authority/supplier record keyed by CUI (fallback: fuzzy-matched cluster ID) | core |
| `entity_aliases` | Raw name/CUI variants seen in source → canonical `entity_id` (the dedup layer) | core |
| `procedures` (tenders) | Tender/procedure header: type, authority, CPV codes, estimated value, dates | core |
| `awards` | Award outcomes linked to a procedure: winning supplier(s), bid count, value | core |
| `contracts` | Signed contracts linked to awards; amendments if present | core |
| `direct_acquisitions` | High-volume firehose — modeled separately (different shape, much higher volume), partitioned by year | core |
| `red_flags` | Precomputed: flag_type (single-bid, concentration, price-anomaly, threshold-splitting), entity/procedure ref, severity, computed_at | marts |
| `entity_stats`, `national_stats_*` | Precomputed aggregates backing profiles + dashboards | marts |

**Key Relationships:**
- `entities` → `entity_aliases`: 1-to-many; CUI is the primary resolution key (validate via checksum), fuzzy-name fallback bucket for records missing usable identifiers.
- `procedures` → `awards` → `contracts`: sequential 1-to-many chain matching OCDS tender→award→contract→implementation stages. Adopt OCDS as a *field-naming reference*, not a literal schema import (OCDS is JSON-release-oriented; this project needs queryable relational shape).
- `direct_acquisitions` is **not** forced into the tender/award/contract shape — structurally simpler (buyer, supplier, item, value, date), vastly higher volume; distinct table avoids a huge sparse one-schema-fits-all table.
- `red_flags` and `*_stats` are never written by request-time code — only by the ingestion worker's batch jobs.

**Where red-flag computation lives:** Batch, in `apps/ingestion`, not query-time. Red-flag rules (single-bid rate, concentration, price z-scores, threshold-splitting clusters) require scanning/grouping across many rows — compute once per ingestion cycle, store in `red_flags`. `apps/web` only reads.

## Key Patterns

| Pattern | Where | Why |
|---|---|---|
| Medallion layering (raw → core → marts) as three Postgres schemas | Whole pipeline | Concrete home for "raw archive so reprocessing never requires re-scraping," without data-lake tooling a solo dev doesn't need |
| Content-addressable idempotent ingestion | `raw_documents` writes | Hash each payload; skip reprocessing when unchanged. Re-ingestion safe to re-run blindly |
| Postgres-backed job queue (graphile-worker) instead of Redis+BullMQ | `apps/ingestion` | One fewer infra dependency; idempotent retry-safe jobs via `FOR UPDATE SKIP LOCKED` — fits a scraper that will crash/retry against a flaky unofficial API |
| CQRS-lite: writes only via ingestion, reads only via marts + search index | `apps/web` | Read paths fast and cache-friendly (CDN-friendly, all pages public) |
| Batch polling, not streaming, for direct-purchase firehose | `apps/ingestion` | No webhooks exist; Kafka etc. pure overhead. Poll on schedule with date/ID cursor per source |

## Directory Structure

```
seap-analytics/
├── apps/
│   ├── web/                      # Next.js — search, entity profiles, dashboards
│   │   ├── app/
│   │   ├── lib/                  # server-side data access (marts + search only)
│   │   └── package.json
│   └── ingestion/                # scraper + normalizer + aggregator + red-flag jobs
│       ├── src/
│       │   ├── scrape/           # source-specific fetchers (e-licitatie, data.gov.ro)
│       │   ├── normalize/        # raw -> core transforms, entity resolution
│       │   ├── aggregate/        # marts + red-flag batch jobs
│       │   ├── jobs/             # graphile-worker task definitions + schedule
│       │   └── index.ts
│       └── package.json
├── packages/
│   ├── db/                       # Drizzle/Prisma schema + migrations (raw/core/marts)
│   ├── domain/                   # shared TS types
│   ├── scraper-clients/          # HTTP clients, rate limiting, retry/backoff, versioning
│   └── search-sync/              # Postgres -> Meilisearch incremental indexers
├── infra/
│   ├── docker-compose.yml        # postgres, meilisearch, ingestion, web — single VPS
│   └── migrations/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Direct Answers to Open Questions

- **Database: Postgres, not MongoDB, not ClickHouse (v1).** Data is inherently relational (procedure→award→contract, entity dedup via aliases) — Mongo buys nothing and hurts aggregation-heavy analytics. ClickHouse becomes compelling at hundreds of millions to billions of rows; this project is tens of millions — squarely Postgres-with-partitioning-and-rollups territory. ClickHouse = documented v2 escape hatch if `direct_acquisitions` alone crosses ~200–300M rows.
- **Search: Meilisearch (or Typesense) over Elasticsearch.** Prior art (sicap.ai, sicap-explorer) chose Elasticsearch, but those were better-resourced; ES ops burden (JVM tuning, cluster mgmt) disproportionate for solo VPS. Meilisearch has built-in diacritics normalization for Romanian.
- **Raw archive storage:** Postgres `raw_documents` initially; escape hatch to object storage (Cloudflare R2 — zero egress) if payload bloat degrades backup/WAL performance. Don't add a second storage system day one.
- **Entity resolution:** CUI primary key when present + checksum-valid; everything else in fuzzy-match alias bucket reviewed/merged over time. Genuinely hard ongoing problem — budget as maintenance, not one-time migration.
- **Real-world scale (from prior art sicap-explorer):** 22.1M direct acquisitions + 470,811 tenders covering 2007–2020 — confirms tens-of-millions row estimate for 2018→now scope.

## Sources

**MEDIUM confidence:**
- [sicap.ai GitHub](https://github.com/ciocan/sicap.ai) — direct prior art, same domain
- [sicap-explorer GitHub](https://github.com/ciocan/sicap-explorer) — real-world scale confirmation
- [Open Contracting Data Standard docs](https://standard.open-contracting.org/)
- [ClickHouse vs PostgreSQL](https://clickhouse.com/comparison/postgresql), [fiveonefour benchmark](https://www.fiveonefour.com/blog/PostgreSQL-vs-ClickHouse)
- [graphile-worker docs](https://worker.graphile.org/docs)
- [Databricks medallion architecture](https://www.databricks.com/blog/what-is-medallion-architecture)
- [Meilisearch language/diacritics docs](https://meilisearch.com/docs/learn/resources/language)

**LOW confidence:**
- General "modular monolith 2026" trend commentary — directionally consistent across independent sources.
