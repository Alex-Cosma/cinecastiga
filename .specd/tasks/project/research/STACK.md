# Stack Research: seap-analytics

**Project type:** Scraping-heavy public-data ingestion platform + fast public analytics/search frontend. Closest existing analogues: `ciocan/SICAP.ai` and `ciocan/sicap-parser`, both scraping the same e-licitatie.ro endpoints.
**Confidence:** MEDIUM-HIGH overall (HIGH on DB/search architecture patterns; MEDIUM on hosting cost specifics; LOW items flagged explicitly).

## Recommended Stack

| Layer | Technology | Version | Purpose | Confidence |
|-------|-----------|---------|---------|------------|
| System-of-record DB | PostgreSQL | 18.x | Canonical store: tenders, awards, contracts, entities, dedup, referential integrity | HIGH |
| Analytics/serving DB | ClickHouse | 25.8 LTS / 26.3 LTS | Precomputed aggregates for dashboards + red-flag analytics over tens of millions of rows | HIGH (pattern) — but see Alternatives: Postgres-only viable v1 |
| Search engine | Meilisearch | v1.41+ | FTS over tender/authority/supplier names — Romanian diacritics, typo tolerance, facets | MEDIUM |
| Ingestion/scraping | Python | 3.13 | Scrapers for e-licitatie.ro JSON endpoints, entity resolution, red-flag/statistics batch jobs | HIGH |
| HTTP client | httpx | latest | Async, HTTP/2 client for unofficial API | MEDIUM |
| Schema validation | Pydantic | v2.x | Fail-loud parsing of API responses — catches schema drift immediately | MEDIUM |
| Job queue | Procrastinate (Postgres-native) or cron + advisory locks | latest | Schedule/retry scrape jobs without Redis | MEDIUM |
| Frontend/SSR | Next.js | 16.2.x | Server-rendered + ISR-cached public pages | HIGH |
| DB clients (Node) | postgres.js / Drizzle, @clickhouse/client | latest | Query Postgres/ClickHouse from Next.js server components — no separate API service | MEDIUM |
| Runtime (frontend) | Node.js | 22 LTS | Next.js runtime | HIGH |

## Why This Stack

Fundamentally two workloads wearing one product: (1) **write-heavy, schema-fragile ingestion pipeline** hitting an undocumented government API; (2) **read-heavy, aggregation-heavy public dashboard** that must feel instant.

**MongoDB verdict:** Mongo would give flexible-schema ingestion but terrible aggregation performance/tooling at this scale. The schema-flexibility problem is better solved with Pydantic validation at the ingestion boundary + JSONB raw layer, not by relaxing the database.

**Postgres + ClickHouse hybrid:** established pattern for this workload shape. At tens of millions of rows Postgres alone is workable with careful partitioning/indexing, but ClickHouse gives 10-100x faster aggregations and 5-10x smaller storage via columnar compression — and the product is exactly group-by-heavy queries ("single-bid rate by CPV by year", "supplier concentration by authority", "price z-scores across millions of contract lines"). Ingestion is batch, so no Kafka/CDC needed — scheduled `INSERT INTO ... SELECT ... FROM postgresql(...)` (ClickHouse's native Postgres table function) or nightly batch export suffices.

**Meilisearch over Elasticsearch/Typesense:** SICAP.ai chose Elasticsearch 8.x but is a funded multi-index project — JVM cluster is disproportionate for solo dev. Meilisearch = single binary, built-in diacritic handling (better out-of-box for Romanian than Typesense's manual locale config), indexes millions of docs on modest RAM via memory-mapped storage.

**Python for ingestion, not Go:** bottleneck is rate-limit politeness, not CPU — prior art (`sicap-parser`) defaults to ~5 concurrent connections against this exact API. Python wins on ecosystem: pandas/numpy for statistical red-flag detection, Pydantic for drift detection, richest entity-resolution tooling.

**Next.js over SvelteKit:** product is hundreds of thousands of semi-static public pages (entity profiles, stats pages) needing periodic background revalidation at CDN edge — Next.js ISR is a direct fit; SvelteKit would need hand-rolled cache invalidation.

## Key Libraries

| Library | Purpose | Confidence |
|---------|---------|------------|
| httpx | Async HTTP with HTTP/2 for e-licitatie.ro endpoints | MEDIUM |
| tenacity | Exponential backoff/retry on 429s and transient failures | MEDIUM |
| Pydantic v2 | Runtime schema validation — loud failures instead of silent corruption | MEDIUM |
| Procrastinate | Postgres-native Python task queue (no Redis) | LOW — verify fit once job shape concrete |
| Drizzle ORM / postgres.js | Type-safe Postgres access from Next.js | MEDIUM |
| @clickhouse/client | Official Node client for ClickHouse from Next.js | MEDIUM |
| unaccent + Romanian tsearch config | Diacritic-insensitive fallback search / entity matching inside Postgres | HIGH |

## Infrastructure

- **Hosting:** Hetzner VPS (mid-tier CCX/AX — Postgres + ClickHouse + Meilisearch + Next.js all fit on one box at this volume) behind **Cloudflare** CDN. All pages public/anonymous → aggressive edge caching with no cache-key complexity. Dramatically cheaper than serverless PaaS at sustained traffic + heavy background compute. ⚠️ Hetzner raised prices materially through 2026 — reconfirm tier pricing.
- **CI/CD:** GitHub Actions (free tier generous; public-good/open-source qualifies for extended minutes). Pipeline: test → build Docker images → deploy via **Coolify** (self-hosted PaaS on same VPS) for push-to-deploy without raw docker-compose wrangling.
- **Monitoring:** Uptime Kuma (single container) for uptime/status page; Sentry free tier for error tracking in both Next.js and Python jobs. Grafana+Prometheus only when deeper query-performance visibility needed — not day one.

## Alternatives Considered

| Instead of | Could Use | When |
|------------|-----------|------|
| Postgres + ClickHouse hybrid | Postgres alone (partitioned + materialized rollups) | Genuinely viable at "tens of millions" — good starting point deferring ClickHouse to v2 once real query patterns known |
| ClickHouse | TimescaleDB (Postgres extension) | Stay 100% inside Postgres ops; accept 2-10x compression instead of 10-100x |
| Meilisearch | Postgres FTS (unaccent + Romanian tsearch) only | Zero extra services for v1; live without typo-tolerance/facet UX until justified |
| Python ingestion | Go | If scrape volume/CPU becomes bottleneck (unlikely — politeness-bound) or single-binary deployment wanted |
| Next.js | SvelteKit | If minimal JS payload matters more than built-in ISR |
| Self-hosted Hetzner + Cloudflare | Managed (ClickHouse Cloud, Vercel, Timescale) | Trade ongoing cost for zero ops |

## Sources

**HIGH confidence:**
- [ClickHouse vs PostgreSQL](https://clickhouse.com/comparison/postgresql), [ClickHouse changelog](https://clickhouse.com/docs/whats-new/changelog), [PostgreSQL release notes](https://www.postgresql.org/about/news/postgresql-184-1710-1614-1518-and-1423-released-3297/), [Postgres unaccent docs](https://www.postgresql.org/docs/current/unaccent.html), [Next.js EOL tracker](https://eosl.date/eol/product/nextjs/)

**MEDIUM confidence:**
- [Meilisearch vs Typesense](https://www.meilisearch.com/docs/resources/comparisons/typesense), [TimescaleDB vs ClickHouse](https://sanj.dev/post/postgresql-timescaledb-clickhouse-comparison/), [Postgres job queues vs Redis](https://dev.to/aws-builders/i-removed-redis-from-my-stack-and-used-postgresql-for-job-queues-instead-2lp5), [Go vs Python scraping](https://use-apify.com/blog/web-scraping-languages-compared-2026), [Uptime Kuma vs Grafana](https://ossalt.com/guides/grafana-vs-uptime-kuma-2026)

**LOW confidence (awareness only):**
- Procrastinate as the specific queue pick — validate against actual job shapes (alternative: cron + `FOR UPDATE SKIP LOCKED`, simpler still)
- Hetzner exact pricing (multiple 2026 increases, 30-200%+ by region/tier)
- `sicap-parser` concurrency detail ("5 concurrent connections") from secondary aggregator — GitHub fetch 404'd; inspect repo directly before finalizing scrape concurrency

## Cross-Agent Conflict (noted for synthesis)

Architecture agent recommends TypeScript/Node ingestion (shared types with web app, graphile-worker) + Postgres-only v1. Stack agent recommends Python ingestion (pandas/Pydantic ecosystem) + ClickHouse hybrid. Both agree: no Mongo, Postgres core, Meilisearch, Next.js, single VPS. Resolution deferred to SUMMARY.md.
