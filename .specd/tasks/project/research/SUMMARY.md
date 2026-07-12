# Research Summary: seap-analytics

## Key Recommendation

Build a **modular monolith in one monorepo with exactly two deployables** — a scheduled ingestion worker and a public Next.js site — on **PostgreSQL (not MongoDB)** with a medallion raw→core→marts layering, Meilisearch for Romanian full-text search, all on a single Hetzner VPS behind Cloudflare. The single most load-bearing architectural rule: **archive every raw API response before parsing** (bronze layer), because the unofficial e-licitatie.ro endpoints will drift and reprocessing must never require re-scraping. The strongest product differentiator is systematic analysis of the direct-purchase firehose (nobody does it) plus a curated ~10-15 red-flag indicator suite with published methodology — framed as statistical indicators, never accusations (defamation + GDPR exposure is the top non-technical risk).

## Stack

Postgres 18 (system of record, partitioned, incremental rollup tables) + Meilisearch (single binary, built-in diacritics for Romanian) + Next.js 16 with ISR behind Cloudflare CDN (all pages public → aggressive edge caching). Hosting: Hetzner VPS + Coolify deploy + GitHub Actions + Uptime Kuma/Sentry. **MongoDB rejected by both stack and architecture agents**: data is inherently relational (procedure→award→contract, entity dedup), and Mongo's schema flexibility is better provided by a JSONB bronze layer + fail-loud validation at the parse boundary.

**Two conflicts between agents, resolved as follows:**
1. **ClickHouse hybrid vs Postgres-only:** Stack agent recommends Postgres+ClickHouse; architecture agent (and stack agent's own alternatives table) says Postgres-only is genuinely viable at tens of millions of rows. → **Postgres-only for v1**, ClickHouse documented as escape hatch if `direct_acquisitions` crosses ~200-300M rows or rollup refresh times grow superlinearly.
2. **Python vs TypeScript ingestion:** Stack agent says Python (pandas/Pydantic ecosystem); architecture agent says TypeScript (shared types with web, graphile-worker, one language). → **Lean TypeScript end-to-end** for a solo dev: red-flag math (single-bid rate, HHI, z-scores, threshold clustering) is SQL-shaped, not pandas-shaped; zod replaces Pydantic for fail-loud parsing; one toolchain. Final call at setup time.

## Features

- **Table stakes:** 8 identified — faceted + full-text search, entity profiles, source traceability, dashboards, CPV browsing, CSV export, stable permalinks
- **Differentiators:** 9 identified — curated red-flag suite, direct-purchase analysis at scale, buyer-supplier relationship view, percentile benchmarking, 2018→now time series, free/open positioning, published methodology, no-login RSS topic feeds
- **v2+:** 9 deferred — accounts/alerts, registry enrichment, public API, ML scoring, DoZorro-style comments, TED linking, English UI, report templates, mobile

## Architecture

Monorepo (pnpm/Turborepo): `apps/ingestion` (scraper→normalize→aggregate→red-flags, graphile-worker on Postgres — no Redis) + `apps/web` (Next.js, reads only marts + search index, never raw/core). Shared packages: `db`, `domain`, `scraper-clients`, `search-sync`. Data model: `raw_documents` (append-only JSONB archive) → core (`entities` keyed by CUI + `entity_aliases` dedup layer, `procedures`→`awards`→`contracts`, `direct_acquisitions` as separate year-partitioned table) → marts (`red_flags`, `entity_stats`, `national_stats_*` — batch-computed, never at query time). OCDS as field-naming reference, not literal schema.

## Pitfalls

- **Critical:** 7 — no raw archive (rewrite guarantee), silent ingestion gaps, naive entity dedup (defamation vector), red-flag defamation exposure, GDPR on natural persons (PFA/II), scraping posture toward e-licitatie.ro, aggregation strategy that dies at 10x
- **Moderate:** 5 — premature typing, single-tender flags as fact, search reindex as afterthought, index bloat, no independent verification source
- **Minor:** 3 — CPV taxonomy versioning, diacritics normalization, open-data license ≠ GDPR cover

## Confidence

| Area | Level | Notes |
|------|-------|-------|
| Stack | MEDIUM-HIGH | DB/search patterns well corroborated; hosting prices move quarterly; Python-vs-TS conflict resolved by synthesis |
| Features | MEDIUM-HIGH | Comparables well corroborated; exact red-flag formulas need manual read of OCP PDF + opentender D2.2 before implementing |
| Architecture | MEDIUM-HIGH | Verified against direct prior art (sicap.ai, sicap-explorer: 22.1M direct acquisitions + 470k tenders 2007-2020 confirms scale estimate) |
| Pitfalls | MEDIUM-HIGH | Engineering pitfalls HIGH; Romanian legal specifics MEDIUM (no case law on point — get legal read before launch) |

## Roadmap Implications

1. **Ingestion foundation first, and its first deliverable is the bronze layer** — raw archive + ingestion-state tracking + reconciliation counts, before any parsing.
2. **Entity resolution is its own phase** — CUI-keyed canonical entities + alias review queue; profiles and concentration analytics are only as credible as this layer.
3. **Rollups/marts are core architecture, not optimization** — incremental summary tables designed before dashboards, or the 2018 backfill kills refresh times.
4. **Red flags last among analytics, with methodology pages shipped simultaneously** — legal defensibility requires published formulas + dispute mechanism at launch, and flags must aggregate across multiple tenders (never single-tender verdicts).
5. **Direct-purchase firehose can be a separate backfill track** — start tenders+awards live ingestion early, backfill the heavier `direct_acquisitions` volume in parallel.
6. **Before red-flag implementation:** manual read of OCP red-flags PDF + opentender methodology; one-time Romanian legal consult (defamation + GDPR lawful-basis note).
