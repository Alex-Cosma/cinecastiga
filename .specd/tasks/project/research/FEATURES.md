# Features Research: seap-analytics

**Project type:** Free, open public-good procurement transparency/analytics platform for Romania's SEAP/SICAP data, targeting journalists/NGOs/watchdogs with search, red-flag analytics, entity profiles, and dashboards.
**Confidence:** MEDIUM-HIGH overall. Comparable-platform features well corroborated across independent sources. Exact red-flag *formulas* (OCP's 73-indicator guide, opentender's 9-11 integrity indicators) could not be extracted verbatim (PDF extraction failed) — indicator names below from partial extraction + literature consensus (OECD, World Bank, zIndex); flagged LOW where formula-level specificity matters.

## Table Stakes (must have for v1)

Confirmed non-negotiable by every comparable platform (opentender.eu, Tenders.guru, DataDriven.ro, zIndex).

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| Faceted search | Filter by authority, supplier, CPV code, county, value range, date range, procedure type | Med | Indexed SICAP dataset |
| Full-text search | Search tender/contract titles and descriptions, not just structured fields | Med | Search index |
| Entity profile pages | Per authority and per supplier: total spend/revenue, contract count, top counterparties, history over time | Med | Search + aggregation layer |
| Source traceability | Every record links back to originating SEAP/SICAP notice, shows procedure ID | Low | Ingestion retains source IDs |
| National/aggregate dashboards | Spend by year, county, CPV sector; trends over time | Med | Aggregation queries |
| CPV taxonomy browsing | Navigate/drill down CPV code hierarchy | Low | CPV reference table |
| CSV/Excel export of search results | Raw data journalists load into their own tools | Low | Export endpoint |
| Stable permalinks per record/search | URL reliably reproduces same result set or record, for citation in articles | Low | URL-encoded query state, stable record IDs |

## Differentiators (competitive advantage)

Romania's existing commercial tools (DataDriven.ro, SICAP.ai) serve *bidders*, not watchdogs — this is the open lane.

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| Curated red-flag indicator suite | Focused ~10-15 indicators (not OCP's 73), transparently computed from SICAP data alone: single-bid rate, non-competitive procedure share, short submission-deadline flag, price-per-unit outlier vs CPV peer group, value inflation via amendments, repeat-winner concentration (HHI) per authority, direct-purchase splitting near thresholds, framework-agreement overuse, missing-documentation flag | High | Published methodology per indicator; peer-group price baselines |
| Achiziții directe analysis at scale | Nobody currently analyzes the millions/yr direct-purchase firehose systematically for split-purchase/threshold-gaming — the most under-covered source, strongest "nobody else does this" angle | High | Full-volume ingestion + threshold-proximity detection |
| Buyer-supplier relationship view | Bipartite "who always wins from whom" per profile — gives journalists a lead without ownership/registry data | Med | Aggregation of award pairs |
| Authority/supplier percentile benchmarking | Rank authority vs national/county peers per red flag (zIndex model) — "worst 5% nationally for single-bidding" with defensible framing | Med | Peer cohorts, statistical baseline |
| Continuous 2018→present time series | Longitudinal stories (behavior across election cycles) a one-off dump can't support | Med-High | Historical backfill pipeline |
| No paywall, no accounts, fully open | Direct contrast to DataDriven.ro (70-290 RON/mo); public-infrastructure positioning matters for NGO/journalist trust | Low | Policy, not technical |
| Published methodology per indicator | Every flag ships exact formula + caveats (OCP/Cardinal, opentender model) — defamation defense; critical with no in-house legal | Low-Med | Documentation discipline |
| No-login topic feeds (RSS per filter) | ~80% of "alerts" value without accounts/auth — filtered search saved as RSS/JSON feed URL | Med | Stable saved-filter URLs (needed for permalinks anyway) |

## Nice-to-Have (v2+)

| Feature | Description | Complexity |
|---------|-------------|------------|
| User accounts + saved alerts | Decided out of scope; classic v2 once topic-feeds prove demand | Med |
| Company-registry/ownership enrichment (ANAF/ONRC, PEP) | Decided out of scope; unlocks beneficial-ownership flags but needs registry matching accuracy work | High |
| Public third-party API | Decided out of scope; natural v2 once schema/indicators stabilize | Med |
| Rule-based → ML anomaly scoring | TheyBuyForYou approach — after rule-based system builds trust + labeled dataset exists | High |
| Crowdsourced comments per tender (DoZorro-style) | Citizen-flagged suspicions | High (moderation) |
| Cross-border linking to TED | Trace foreign suppliers into Romanian SICAP and vice versa | High |
| English UI | Decided out of scope; relevant for donor reporting / TransparenCEE collaborations | Med |
| Data storytelling / report templates | Auto-generated narrative summaries per authority/sector | Med-High |
| Mobile app | Journalists/NGOs are desktop-first | Med |

## Anti-Features (explicitly avoid)

| Feature | Why Avoid |
|---------|-----------|
| "Most corrupt authority" leaderboard / naming-and-shaming without caveats | Indicators have legitimate non-corrupt causes (niche markets, rural counties with few suppliers); raw rankings as accusations = defamation risk. Opentender deliberately uses neutral "integrity indicators," not verdicts |
| Unmoderated crowdsourced allegations against named entities | Requires legal moderation capacity v1 doesn't have; unverified public accusations = real liability |
| ML "corruption probability" score as percentage/verdict | False precision — black-box score looks authoritative but isn't defensible if challenged. Transparent formula-published rules first |
| Ownership/PEP matching without verified registry data | Wrong-identity matches (common with similar Romanian names) → false accusations against innocent namesakes |
| Paywalling or account-gating core search/data | Undermines mission; imitates the commercial positioning this project differentiates from |
| B2B competitor-intelligence / bid-strategy features | DataDriven.ro's actual product for suppliers — dilutes accountability mission, conflict-of-interest optics |
| All 70+ raw OCP flags at once, unprioritized | Cognitive overload for journalist under deadline; curate defensible top ~10-15 with plain-language explanations |
| Real-time bidding-opportunity alerts for suppliers | Commercial niche already served; compete on accountability analytics instead |

## Sources

**MEDIUM confidence (multi-source corroborated):**
- [Red Flags in Public Procurement — OCP](https://www.open-contracting.org/resources/red-flags-in-public-procurement-a-guide-to-using-data-to-detect-and-mitigate-risks/) (73 indicators; category-level only, PDF extraction failed)
- [Cardinal — OCP open-source red-flags library](https://github.com/open-contracting/cardinal-rs)
- [Corruption Risk Indicators — opentender.eu framework, iMonitor/GovTransparency](https://imonitor.govtransparency.eu/2026/03/12/corruption-risk-indicators-in-public-procurement-an-updated-opentender-eu-framework/) (9→11 integrity indicators, 0-100 scale)
- [zIndex methodology wiki (Czech, EconLab)](https://wiki.zindex.cz/doku.php?id=en:start) — 9 indicators, extracted in full
- [DataDriven.ro](https://www.datadriven.ro/) — Romanian commercial platform, full feature set extracted (search, alerts, OCR, competitor stats, API/MCP, PowerBI export, 70-290 RON/mo tiers)
- [Tenders.guru — Access Info Europe](https://www.access-info.org/tenders-guru/)
- [DoZorro / ProZorro — OCP](https://www.open-contracting.org/2020/09/14/dozorro-a-network-of-citizen-corruption-fighters/), [TI Ukraine](https://ti-ukraine.org/en/news/dozorro-artificial-intelligence-to-find-violations-in-prozorro-how-it-works/)
- [TheyBuyForYou — Semantic Web Journal](https://www.semantic-web-journal.net/content/theybuyforyou-platform-and-knowledge-graph-expanding-horizons-public-procurement-open-linked)
- [Buletin de București / Funky Citizens](https://funky.ong/proiecte/buletin-de-bucuresti/), [TransparenCEE](https://funky.ong/en/reteaua-transparencee/)
- [OECD Anti-Corruption Outlook 2026](https://www.oecd.org/en/publications/anti-corruption-and-integrity-outlook-2026_16708b78-en/full-report/component-14.html), [World Bank on single-bidding](https://blogs.worldbank.org/en/governance/measuring-corruption-risk-using-big-public-procurement-data-central-eastern-europe)

**LOW confidence (validate before implementing red-flag engine):**
- Exact OCP 73-indicator list and opentender indicator formulas — read OCP PDF + opentender "D2.2 Risk-assessment-methodology.pdf" directly before finalizing formula set.
- SICAP.ai feature details — page returned HTTP 429, unverified.
