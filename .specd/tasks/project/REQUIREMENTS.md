# Requirements: seap-analytics

**Scoped:** 2026-07-12
**Total v1:** 16

---

## v1 Requirements

| REQ-ID | Category | Feature | Description | Complexity | Dependencies |
|--------|----------|---------|-------------|------------|--------------|
| REQ-001 | table-stakes | Complete ingestion pipeline | Scrape all SICAP notice types incl. direct purchases; raw archive; 2018 backfill; scheduled refresh | High | None |
| REQ-002 | table-stakes | Entity resolution layer | Canonical authorities/suppliers keyed by CUI; alias dedup; review queue for unmatched | High | REQ-001 |
| REQ-003 | table-stakes | Faceted search | Filter by authority, supplier, CPV, county, value range, date, procedure type | Med | REQ-001, REQ-002 |
| REQ-004 | table-stakes | Full-text search | Titles + descriptions, Romanian diacritics-aware, typo-tolerant | Med | REQ-001 |
| REQ-005 | table-stakes | Entity profile pages | Per authority/supplier: totals, contract count, top counterparties, history | Med | REQ-002, REQ-013 |
| REQ-006 | table-stakes | Source traceability | Every record links to originating SEAP notice + procedure ID | Low | REQ-001 |
| REQ-007 | table-stakes | National dashboards | Spend by year/county/CPV sector, trends | Med | REQ-013 |
| REQ-008 | table-stakes | CPV taxonomy browsing | Drill-down CPV hierarchy, versioned lookup | Low | REQ-001 |
| REQ-009 | table-stakes | CSV/Excel export | Search results exportable | Low | REQ-003 |
| REQ-010 | table-stakes | Stable permalinks | URL reproduces result set/record; citable | Low | REQ-003 |
| REQ-011 | differentiator | Curated red-flag suite | ~10-15 transparent indicators, batch-computed, aggregated across tenders (never single-tender verdicts) | High | REQ-001, REQ-002, REQ-013 |
| REQ-012 | differentiator | Published methodology pages | Exact formula + caveats + dispute mechanism per flag; ships WITH red flags | Low-Med | REQ-011 |
| REQ-013 | differentiator | Precomputed aggregates layer (marts) | Incremental rollup tables (entity_stats, national_stats); never query raw at request time | High | REQ-001, REQ-002 |
| REQ-014 | differentiator | Direct-purchase analysis at scale | Threshold-splitting/split-purchase detection over the achiziții directe firehose | High | REQ-001, REQ-011 |
| REQ-015 | differentiator | Buyer-supplier relationship view + percentile benchmarking | "Who wins from whom" per profile; rank vs national/county peers per indicator | Med | REQ-011, REQ-013 |
| REQ-016 | differentiator | Interactive visualizations | Treemaps (spend by CPV/authority/supplier, drill-down), county choropleth, trend charts on every profile/dashboard | Med-High | REQ-007, REQ-013 |

Note: REQ-001, REQ-002, REQ-013 added as infrastructure requirements implied by all selected features (ingestion, entity resolution, marts are prerequisites, not user-facing features).

---

## v2+ (Deferred)

| Feature | Category | Rationale for Deferral |
|---------|----------|----------------------|
| No-login RSS topic feeds | differentiator | Deferred by user during scoping; builds on permalinks when wanted |
| Buyer-supplier network graph (interactive viz) | differentiator | Deferred by user; treemap + relationship table covers most value |
| User accounts + saved alerts | nice-to-have | DEC-005; topic feeds first if demand appears |
| Company-registry enrichment (ANAF/ONRC, PEP) | nice-to-have | DEC-005; needs registry matching accuracy work |
| Public third-party API | nice-to-have | DEC-005; after schema/indicators stabilize |
| ML anomaly scoring | nice-to-have | Rule-based trust + labeled dataset first |
| DoZorro-style comments/annotations | nice-to-have | Needs moderation capacity |
| TED cross-linking | nice-to-have | Deferred by user during scoping |
| English UI | nice-to-have | DEC-005 |
| Data storytelling / report templates | nice-to-have | Deferred by user during scoping |
| Mobile app | nice-to-have | Desktop-first users |
| Old SEAP backfill (2007–2018) | nice-to-have | DEC-002; schema reconciliation effort |
| ClickHouse analytics layer | infrastructure | Escape hatch if direct_acquisitions >200-300M rows or rollup refresh grows superlinear |

---

## Out of Scope

| Feature | Rationale |
|---------|-----------|
| "Most corrupt" leaderboards / company verdicts | Defamation exposure; indicators have legitimate non-corrupt causes. Neutral statistical framing only |
| Unmoderated crowdsourced allegations | Liability without moderation capacity |
| ML "corruption probability" percentages | False precision, indefensible if challenged |
| Ownership/PEP matching without verified registry data | Wrong-identity matches → false accusations |
| Paywalls or account-gating | DEC-003; mission-defeating |
| B2B bid-intelligence features | DataDriven.ro's commercial niche; dilutes watchdog mission |
| All 70+ OCP flags unprioritized | Cognitive overload; curated ~10-15 instead |
| Supplier-oriented bidding alerts | Commercial niche already served |

---

## Requirement Details

### REQ-001: Complete ingestion pipeline
**Category:** table-stakes (infrastructure) | **Complexity:** High | **Dependencies:** None
**Description:** Scheduled scraper over unofficial e-licitatie.ro JSON endpoints + data.gov.ro dumps as reconciliation source. Bronze layer: every raw response archived (source, external_id, JSONB payload, content_hash, fetched_at, endpoint_version) before parsing. Durable cursors/watermarks; conservative rate limiting with honest User-Agent; 2018→now backfill; direct purchases as separate parallel track.
**Acceptance Criteria:**
- [ ] Raw responses archived append-only; reprocessing never re-scrapes
- [ ] Per-run reconciliation: fetched count vs source-reported count, alert on deviation
- [ ] Ingestion resumes from cursor after crash/ban without gaps
- [ ] Daily ingestion-volume dashboard (records/day per notice type)

### REQ-002: Entity resolution layer
**Category:** table-stakes (infrastructure) | **Complexity:** High | **Dependencies:** REQ-001
**Description:** Canonical `entities` keyed by checksum-valid CUI; `entity_aliases` maps every raw name/CUI variant; fuzzy-match fallback bucket with review queue; resolution decisions versioned and reversible; confidence field on every link.
**Acceptance Criteria:**
- [ ] All records with valid CUI resolve to canonical entity
- [ ] No silent name-similarity merges; ambiguous cases queued
- [ ] Merge decisions auditable and reversible

### REQ-003–REQ-010: Search, profiles, dashboards, browsing, export, permalinks
Standard table stakes per FEATURES.md. Search via Meilisearch (facets + FTS); profiles and dashboards read only marts; export streams search results as CSV; permalinks encode full query state.

### REQ-011: Curated red-flag suite
**Category:** differentiator | **Complexity:** High | **Dependencies:** REQ-001, REQ-002, REQ-013
**Description:** ~10-15 indicators computed in batch during ingestion cycles: single-bid rate, non-competitive procedure share, short submission deadlines, price-per-unit outliers vs CPV peer group, amendment value inflation, repeat-winner HHI per authority, direct-purchase threshold splitting, framework overuse. Flags aggregate across multiple tenders/time windows; sample size + base rate shown with every indicator. Pre-work: manual read of OCP red-flags PDF + opentender methodology; formulas finalized before build.
**Acceptance Criteria:**
- [ ] Every flag traceable to reproducible rule + cited public records
- [ ] No company-level flag from a single tender
- [ ] Sample size and base rate displayed alongside every indicator

### REQ-012: Published methodology pages
**Category:** differentiator | **Complexity:** Low-Med | **Dependencies:** REQ-011
**Description:** Per-indicator page: exact formula, data sources, known false-positive causes, caveats. Visible correction/dispute mechanism. GDPR notes: lawful-basis statement, contact-data stripping policy, data-subject request path. Launches simultaneously with red flags — legal precondition, not documentation nicety.

### REQ-013: Precomputed aggregates layer (marts)
**Category:** differentiator (infrastructure) | **Complexity:** High | **Dependencies:** REQ-001, REQ-002
**Description:** Incrementally-maintained rollups updated per ingestion batch (not full recomputation): entity_stats, national_stats by year/county/CPV, red_flags. Web app never joins raw multi-million-row tables at request time. Refresh duration monitored for superlinear growth.

### REQ-014: Direct-purchase analysis at scale
**Category:** differentiator | **Complexity:** High | **Dependencies:** REQ-001, REQ-011
**Description:** Year-partitioned `direct_acquisitions` table; threshold-proximity detection (clusters of purchases just under legal direct-award thresholds, same buyer+supplier+period); feeds red-flag suite and profiles. Strongest "nobody else does this" differentiator.

### REQ-015: Buyer-supplier relationships + percentile benchmarking
**Category:** differentiator | **Complexity:** Med | **Dependencies:** REQ-011, REQ-013
**Description:** Award-pair aggregation per profile ("supplier X won N contracts worth Y from authority Z, P% of Z's spend"); percentile rank vs national/county peer cohorts per indicator, zIndex-style framing ("worst 5% nationally for single-bidding").

### REQ-016: Interactive visualizations
**Category:** differentiator | **Complexity:** Med-High | **Dependencies:** REQ-007, REQ-013
**Description:** Treemaps with drill-down (national → CPV sector → authority → supplier); Romania county choropleth (spend, red-flag density); trend charts on every profile and dashboard (spend, single-bid rate, concentration over 2018→now). Server-rendered data, client-interactive. Network graph deferred to v2.
**Acceptance Criteria:**
- [ ] Treemap drill-down from national totals to individual entities
- [ ] County map with selectable metric
- [ ] Every profile page has at least one trend chart

---

## Dependencies

```
REQ-001 (ingestion)
├── REQ-002 (entity resolution)
│   ├── REQ-003 (faceted search) ── REQ-009 (export), REQ-010 (permalinks)
│   ├── REQ-005 (profiles)
│   └── REQ-013 (marts)
│       ├── REQ-007 (dashboards) ── REQ-016 (visualizations)
│       ├── REQ-011 (red flags) ── REQ-012 (methodology), REQ-014 (direct purchases), REQ-015 (relationships/benchmarking)
│       └── REQ-005 (profiles)
├── REQ-004 (full-text search)
├── REQ-006 (traceability)
└── REQ-008 (CPV browsing)
```

---

## Summary

| Metric | Count |
|--------|-------|
| v1 Requirements | 16 |
| Table Stakes | 10 (incl. 2 infrastructure) |
| Differentiators | 6 (incl. 1 infrastructure) |
| Nice-to-Have (included) | 0 |
| Deferred to v2+ | 13 |
| Out of Scope | 8 |

**Complexity Distribution:**
- Low: 3
- Medium: 6
- High: 7
