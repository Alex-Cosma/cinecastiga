# Context: project

**Last Updated:** 2026-07-12
**Sessions:** 1

## Discussion Summary

User wants a platform that "regularly grabs everything e-licitatie has to offer and presents it in a much, much better and critical view, with statistics and all of that." Scoping via structured questions resolved users, data scope, history depth, access model, v1 features, and non-goals. Stack deliberately left to research.

---

## Resolved Questions

### Primary users

**Question:** Who is this for?
**Resolution:** Journalists/NGOs/watchdogs "YES - 100%", plus general public as secondary audience.

### Data scope

**Question:** Tenders+awards only, or full firehose?
**Resolution:** Everything, including direct purchases (achiziții directe) — millions of records/year.

### Historical depth

**Question:** How far back?
**Resolution:** SICAP era, 2018→now. Old SEAP (2007–2018 CSVs) deferred.

### Access model

**Question:** Free vs. paid tiers?
**Resolution:** Free + open public good. No login. Monetization not a v1 concern.

### v1 capabilities

**Resolution:** All four selected: powerful search+filters, red-flag analytics, entity profiles (authority + supplier pages), dashboards + national stats.

### v1 non-goals

**Resolution:** User accounts + saved alerts, company-registry enrichment (ANAF/ONRC/PEP cross-linking), English UI, public third-party API — all explicitly out of v1.

---

## Deferred Questions

### Database choice

**Reason:** User hypothesized MongoDB but explicitly deferred to research ("research agents should do their work first and then we decide").
**Default for now:** None — research must compare MongoDB vs. relational/OLAP options for heavy-aggregation workloads.
**Revisit when:** Research findings in.

### Old-SEAP backfill (2007–2018)

**Reason:** Schema reconciliation effort; 2018+ gives clean baseline.
**Default for now:** SICAP only.
**Revisit when:** v2 planning.

---

## Discussion History

| Date | Topics Covered | Key Outcomes |
|------|----------------|--------------|
| 2026-07-12 | Vision, users, data scope, history, constraints, v1 features, non-goals | PROJECT.md written; DEC-001..005 recorded; stack/DB left to research |

---

## Domain Knowledge (user firsthand, from prior 2020 build)

User built a SEAP scraper/analyzer before (2020, Spring, manual — "lots and lots of work"). Hard-won data-quality facts to design around:

- **CPV codes are a mess in practice** — not just taxonomy versioning (already in PITFALLS.md); real-world assignment quality in SICAP records is poor/inconsistent. CPV-based peer grouping (price baselines, sector dashboards) must tolerate misclassification noise.
- **Quantity + unit-of-measure fields are not standardized** — free-ish text: "Bucată", "Litru", "100 Bucăți", etc. Same unit expressed multiple ways, including multiplier-embedded forms ("100 Bucăți" = 100× piece). Directly undermines per-unit price computation.
- **Consequence for REQ-011:** the price-per-unit outlier indicator requires a unit-normalization layer (canonical unit table + multiplier parsing + unmappable-unit bucket) before it can be trusted. Options when Phase 8 arrives: (a) build normalization for the top-N most common units and compute the indicator only where mapping confidence is high; (b) defer that single indicator to v1.x; other indicators (single-bid, HHI, threshold splitting) don't depend on units and are unaffected.

---

## Gray Areas Remaining

- [ ] Unit-of-measure normalization strategy (canonical unit table, multiplier parsing, confidence threshold) — gates the price-per-unit red-flag indicator; decide in Phase 8 pre-work
- [ ] Ingestion source strategy (SICAP unofficial API vs. data.gov.ro dumps vs. hybrid) — determines architecture + reliability
- [ ] DB + search engine choice — performance is an explicit product requirement
- [ ] Red-flag indicator set — which are computable from SICAP data alone
- [ ] Entity resolution quality (CUI dedup) — affects entity profiles credibility
- [ ] Scraping legal/politeness posture — public-good project must be clean
- [ ] Hosting/cost envelope for tens of millions of rows — solo dev budget

---

## Quick Reference

- **Task:** `.specd/tasks/project/PROJECT.md`
- **Decisions:** `.specd/tasks/project/DECISIONS.md`
- **Research:** `.specd/tasks/project/research/` (after research stage)
