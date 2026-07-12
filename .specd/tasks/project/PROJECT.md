# Project: seap-analytics

## Vision

A free, open, public-good platform that continuously ingests **all** public procurement data from Romania's SEAP/SICAP (e-licitatie.ro) — tenders, awards, contracts, and the direct-purchase firehose — stores it historically from 2018 onward, and presents it through a dramatically better interface: fast search, entity profiles, national statistics, and critical red-flag analytics that the official platform completely lacks.

## Problem Statement

E-licitatie.ro holds Romania's entire public spending trail but is nearly unusable: weak search, no aggregation, no history views, no analytics, hostile UX. Journalists, NGOs, and watchdogs who need to answer "who wins contracts from this authority?", "is this price anomalous?", "how concentrated is this market?" must scrape and crunch data manually, per-investigation. Existing tools (data.gov.ro dumps, ad-hoc parsers) are stale, partial, or require technical skill. Citizens have effectively no visibility into where public money goes.

## Target Users

- **Journalists / NGOs / watchdogs (primary)** — Investigate authorities and suppliers, detect red flags (single-bid awards, repeat winners, contract splitting, price anomalies), export evidence, track markets over time.
- **General public (secondary)** — Browse simple, fast views of public spending: by county, by institution, by supplier; national statistics dashboards.

## Key Goals

1. **Complete ingestion** — All SICAP notice types incl. direct purchases (millions/yr), refreshed on a regular schedule, with historical backfill to 2018.
2. **Fast** — Search and dashboards feel instant; heavy aggregations precomputed/cached. Speed is an explicit product requirement, not a nice-to-have.
3. **Critical analytics** — Red-flag detection (single-bid tenders, supplier concentration, price anomalies, threshold-splitting) surfaced automatically, not on request.
4. **Entity-centric** — Every contracting authority and supplier gets a profile page with full history, totals, partners, trends.
5. **Free and open** — No login, no paywall, Romanian-language UI.

## Technical Constraints

- **No official API** — Ingestion relies on unofficial frontend JSON endpoints + data.gov.ro dumps; must be resilient to rate limits, bans, schema drift. Scraper politeness/legality posture matters.
- **Volume** — Direct purchases alone are millions of records/year; storage and indexing must be designed for tens of millions of rows.
- **Performance-first** — Caching and precomputation are core architecture concerns (user constraint: "cached and move super fast").
- **Database TBD via research** — User hypothesis: MongoDB. To be evaluated against Postgres/ClickHouse/hybrid for analytics workloads.
- **Solo developer, personal project** — Boring, maintainable, low-ops tech preferred unless research argues otherwise.

## Sub-Projects

TBD from research. Suspected shape:

- **ingestion** — Scraper/ETL worker: SICAP endpoints + data.gov.ro backfill → canonical store.
- **api/analytics** — Query layer, precomputed aggregates, red-flag jobs.
- **web** — Public frontend: search, profiles, dashboards.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| DEC-001: Full data scope incl. direct purchases | Max coverage; direct purchases are where much abuse hides |
| DEC-002: Historical depth = SICAP era (2018→now) | Consistent schema, single source; old SEAP (2007–2018) deferred |
| DEC-003: Free + open, no accounts in v1 | Public-good watchdog mission |
| DEC-004: v1 = search, red-flags, entity profiles, dashboards | All four selected as must-have |
| DEC-005: Out of scope v1: accounts/alerts, registry enrichment, English UI, public API | Focus; all are v2 candidates |

## Open Questions

- Best ingestion strategy: unofficial SICAP JSON endpoints vs. data.gov.ro dumps vs. hybrid? Rate limits, ban risk, completeness of each?
- Database: MongoDB vs. Postgres vs. ClickHouse vs. hybrid (OLTP + OLAP) for tens of millions of records with heavy aggregation?
- Search: Postgres FTS vs. Meilisearch/Typesense/Elasticsearch for Romanian-language full-text?
- Which red-flag indicators are computable from SICAP data alone (without registry enrichment), and which are standard in procurement-integrity literature (OCP red flags, single-bid rate, etc.)?
- Entity resolution: how messy are authority/supplier identifiers (CUI) in SICAP, how much dedup work is needed?
- Legal posture: scraping public procurement data — any Romanian/EU constraints to respect (robots, ToS, GDPR re: natural persons in data)?
- Direct-purchase firehose: actual volume/day and endpoint pagination limits — feasible to keep up in near-real-time?
