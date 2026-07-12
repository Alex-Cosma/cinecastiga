# Pitfalls Research: seap-analytics

**Project type:** Public-good procurement transparency platform — continuous scraping of e-licitatie.ro/SICAP + data.gov.ro, tens of millions of rows, red-flag analytics, public search/dashboards, solo developer, Romanian jurisdiction, GDPR-applicable.
**Confidence:** MEDIUM-HIGH overall (strong triangulation from OpenTender/DIGIWHIST, ProZorro/DoZorro/OCP, GAO, and scraping/DB engineering postmortems; Romania-specific legal points are MEDIUM since no case law was found directly on point).

---

## Critical Pitfalls (causes failures/rewrites)

### Coupling scraper schema to display schema (no raw-response archive)

- **What goes wrong:** Parsing e-licitatie.ro/SICAP JSON directly into normalized "clean" tables. When the source silently changes a field name, adds a nested object, or the unofficial endpoint changes shape, the pipeline either breaks loudly (best case) or silently drops/nulls fields — and there is no way to reprocess history because the original payload was never kept.
- **Why it happens:** Feels efficient to skip the "extra" storage step; teams underestimate how often unofficial government JSON endpoints change without notice or versioning.
- **Prevention:** Land every raw HTTP response verbatim in a "bronze" layer (object storage or a `raw_documents` table keyed by source+id+fetched_at, compressed) before any parsing. Treat normalization as a replayable, versioned transform (bronze → silver → gold), so a schema fix can be backfilled from archived raw data without re-hitting e-licitatie.ro.
- **Detection:** Any incident where a bug fix requires "we'll just re-scrape everything."
- **Confidence:** HIGH

### Silent ingestion gaps (pagination/backfill/incremental drift)

- **What goes wrong:** A pagination bug, rate-limit block, or endpoint change causes the scraper to "complete successfully" while missing records — stops at page 40 of 400, or misses a notice type. No error, just a quieter dataset. For a procurement watchdog, reputationally fatal: a missed award for a politically connected company looks like intentional suppression.
- **Why it happens:** Unofficial endpoints have no reliable "total count" contract, inconsistent pagination, undocumented rate limiting (often blank responses, not HTTP errors).
- **Prevention:** Every run reconciles fetched-count vs. source-reported-count (or cross-check against data.gov.ro dumps as an independent second source). Track ingestion state (cursors, last-successful-id, per-endpoint watermarks) durably so failures resume rather than silently truncate. Periodic diff of DB against fresh independent sample pulls.
- **Detection:** Daily dashboard of records-ingested per day/CPV/authority; alert on sudden drops; compare row counts to data.gov.ro aggregates.
- **Confidence:** HIGH

### Entity deduplication treated as one-time or purely string-matching

- **What goes wrong:** Authorities and suppliers appear under dozens of name variants (diacritics, "S.R.L." vs "SRL", typos, renames, mergers). Naive dedup produces false merges (defamation risk — wrong company linked to red flags) and false splits (undercounting supplier concentration — the platform's core analytical feature).
- **Prevention:** CUI (Romanian fiscal ID) is the canonical entity key wherever present — always resolve to CUI, not name. Where CUI is missing/malformed (common in older records), build an explicit review queue rather than silently merging on name similarity. Version entity-resolution decisions so a bad merge is auditable and reversible.
- **Detection:** Spot-audit high-concentration flags against manual CUI lookups; track a "confidence" field on every entity link.
- **Confidence:** MEDIUM-HIGH

### Defamation / reputational-harm exposure from automated red-flag labeling

- **What goes wrong:** A "single-bid" or "price anomaly" flag is statistically suggestive of risk, not proof — but a public site showing "Compania X: 15 red flags" reads as an accusation of corruption. If a flag is wrong (bad entity match, data error, legitimate explanation), the named company has a real claim. Different risk profile from OpenTender/ProZorro, which have institutional legitimacy and methodology papers; a solo-dev site has neither.
- **Prevention:** (1) Frame everything as statistical indicators about contracts/procedures, not accusations about companies. (2) Publish methodology openly with per-indicator false-positive caveats (OCP approach). (3) Visible correction/dispute mechanism. (4) Avoid superlative company scores ("riskiest supplier in Romania") in favor of itemized, sourced facts. (5) One-time legal read on Romanian defamation law (calomnie decriminalized 2014, but civil liability + GDPR Art. 82 damages remain) before launch.
- **Detection:** Leading indicator — any flag that can't be traced to a reproducible rule + underlying public record with citation.
- **Confidence:** MEDIUM

### GDPR exposure from natural persons in the data (PFA/II suppliers, contact persons)

- **What goes wrong:** A meaningful share of "companies" are natural persons (PFA/II/sole traders); notices include named contact persons, signatories, CVs for services contracts. Republishing at scale, cross-indexed and permanently searchable, is a new, higher-risk processing activity under GDPR even though the data was originally public.
- **Why it happens:** "It was already public on e-licitatie.ro" does not discharge GDPR — re-publication/aggregation by a new controller is its own processing requiring its own lawful basis.
- **Prevention:** Draft a lawful-basis note (legitimate interest, GDPR Art. 6(1)(f), balancing test documented) before storing natural-person identifiers; strip/mask CVs, phone numbers, emails at ingestion (keep organization + role only); documented data-subject request/erasure policy. Treat PFA/II supplier names with natural-person care.
- **Confidence:** MEDIUM (EU guidance HIGH; Romanian enforcement posture untested)

### Scraping posture toward e-licitatie.ro (unofficial endpoints, no ToS clarity)

- **What goes wrong:** Entire ingestion built on undocumented endpoints = no contractual right of access; an IP block or administrative mood change cuts ingestion overnight. Aggressive scraping could be construed as unauthorized access.
- **Prevention:** Rate-limit conservatively; identify scraper honestly (User-Agent with contact info); prefer data.gov.ro official dumps (Open Government License) as primary source where coverage overlaps, live endpoints only for the freshness gap; abstraction layer between "source fetcher" and everything downstream so a source swap doesn't require a rewrite; never authenticate — stay in unambiguously public territory. Note: sicap.ai, licitatia.ro, expertforum's detector already operate this way (normalizes, doesn't legally validate).
- **Detection:** Sudden 403/429 pattern or structural change across whole scraper → back off automatically, don't retry-hammer.
- **Confidence:** MEDIUM

### Materialized-view/aggregation strategy that doesn't survive 10x growth

- **What goes wrong:** Dashboards on materialized views / naive GROUP BY over the full contracts table work at dev scale, then refresh blows up from seconds to hours after 2018 backfill completes; refreshes overlap, dashboards stale or locked; vanilla PostgreSQL has no incremental refresh.
- **Prevention:** Incrementally-maintained summary tables from day one (rollups updated per ingestion batch), or staging-table-then-atomic-rename for full rebuilds; pre-flattened denormalized "gold" analytics tables so dashboard queries never join raw multi-million-row tables. Core architecture, not a later optimization.
- **Detection:** Graph rollup refresh duration over time — superlinear growth is the early warning.
- **Confidence:** HIGH

---

## Moderate Pitfalls (causes bugs/debt)

### Normalizing/typing too early loses backfill fidelity
Strict typed columns at ingestion break when 2018-era data (different SICAP version/conventions) doesn't match today's shape. **Prevention:** bronze layer as flexible JSON/JSONB regardless of era; strict typing only in silver/gold transform with era-aware parsing rules. **Confidence:** MEDIUM

### Single-tender/single-flag reasoning presented as fact
OpenTender's own retrospective: "any indicator based on a single tender is usually not reliable enough." Flagging one contract in isolation produces noisy, low-precision flags that erode trust. **Prevention:** require flags to aggregate across multiple tenders/time windows before surfacing company/authority-level flags; show sample size and base rates alongside every indicator. **Confidence:** HIGH

### Search index treated as afterthought
Full reindex of tens of millions of docs locks/degrades search for hours; crash mid-reindex duplicates or loses documents. **Prevention:** aliased indices (write to `contracts_v2`, atomically swap alias); if Postgres FTS, use `CONCURRENTLY` variants and batch updates (large batch updates can hold locks tens of minutes). **Confidence:** MEDIUM-HIGH

### Index bloat from constant ingestion
Continuous daily inserts/updates cause Postgres index bloat, silently degrading queries. **Prevention:** monitor bloat (alert >20%), periodic `REINDEX CONCURRENTLY`, tune autovacuum for high-write tables. **Confidence:** HIGH

### No independent secondary source for verification
Sole reliance on live scraping means "source has a gap" vs "our scraper has a bug" are indistinguishable. **Prevention:** cross-validate against data.gov.ro dumps (independent code path) as reconciliation source. **Confidence:** MEDIUM

---

## Minor Pitfalls (causes friction)

### CPV code / classification inconsistency across years
Taxonomies revised over the backfill window; joins against a single "current" lookup miscategorize old records. **Prevention:** version classification lookups by effective date range. **Confidence:** MEDIUM

### Diacritics/encoding inconsistency in Romanian text
ș/ț cedilla vs comma-below Unicode variants + mixed encodings break exact-match search, entity matching, sorting. **Prevention:** normalize Unicode (NFC) and diacritic-insensitive search/matching at earliest normalization checkpoint. **Confidence:** MEDIUM

### Treating "open data license" as blanket legal cover
OGL on data.gov.ro / Directive 2019/1024 does not override GDPR (Art. 1(4)) and doesn't apply to unofficial e-licitatie.ro endpoints. **Prevention:** track which dataset came from which legal regime (OGL dump vs. unofficial scrape). **Confidence:** MEDIUM

---

## Sources

**HIGH confidence:**
- [Red Flags in Public Procurement — Open Contracting Partnership](https://www.open-contracting.org/wp-content/uploads/2024/12/OCP2024-RedFlagProcurement-1.pdf) (reliability/single-tender caveats, 73-indicator methodology)
- [Opentender.eu — How Opentender works](https://opentender.eu/dk/about/how-opentender-works)
- [Directive (EU) 2019/1024 — EUR-Lex](https://eur-lex.europa.eu/eli/dir/2019/1024/oj/eng)
- [PostgreSQL materialized views / REINDEX CONCURRENTLY docs](https://www.postgresql.org/docs/current/rules-materializedviews.html)
- [Federal Spending Transparency — GAO-25-107469](https://www.gao.gov/products/gao-25-107469)

**MEDIUM confidence:**
- [GDPR & Procurement — Lexology/Kilpatrick](https://www.lexology.com/library/detail.aspx?g=af8aded4-876d-442a-95ee-774bfa1cb779)
- [Data protection in public procurement — European Commission](https://commission.europa.eu/funding-tenders/procedures-guidelines-tenders/data-protection-public-procurement-procedures_en)
- [DOZORRO AI — Transparency International Ukraine](https://ti-ukraine.org/en/news/dozorro-artificial-intelligence-to-find-violations-in-prozorro-how-it-works/)
- [Data Ladder — Deduplication for Government Agencies](https://dataladder.com/data-deduplication-for-government-agencies-risks-and-solutions/)
- [Scaling PostgreSQL to 1.2bn records/month — Gajus Kuizinas](https://gajus.medium.com/lessons-learned-scaling-postgresql-database-to-1-2bn-records-month-edc5449b3067)
- [Is Web Scraping Legal? — cloro.dev](https://cloro.dev/blog/website-scraping-legal/)
- [sicap-parser GitHub repo (unofficial e-licitatie.ro API pattern)](https://github.com/ciocan/sicap-parser)
- [RO-CUI identifier scheme — org-id.guide](https://org-id.guide/list/RO-CUI)
- [Schema Drift in ETL Pipelines — Airbyte](https://airbyte.com/data-engineering-resources/schema-drift-in-etl-pipelines)
- [Reindex Elasticsearch — GOV.UK](https://docs.publishing.service.gov.uk/manual/reindex-elasticsearch.html)
- [Index Bloat in Postgres — Kendra Little](https://kendralittle.com/2025/12/01/index-bloat-postgres-why-it-matters-how-to-identify-and-resolve/)

**LOW confidence (awareness only):**
- Romanian-specific defamation/GDPR enforcement posture toward a procurement-watchdog site — no direct precedent found; validate with Romanian legal counsel before launch.
- Romanian precedent projects (sicap.ai, licitatia.ro, DataDriven.ro, expertforum.ro "Detector de bani publici") surfaced but not deeply audited — follow up on data-quality/legal issues they've publicly hit.
