# Decisions: project

**Task:** project
**Created:** 2026-07-12
**Last Updated:** 2026-07-12

---

## Active Decisions

### DEC-001: Full data scope including direct purchases

**Date:** 2026-07-12
**Status:** Active
**Context:** SICAP data spans tenders, awards, contracts, and a direct-purchase firehose (millions/yr). Scope choice drives ingestion and storage design.
**Decision:** Ingest everything, including achiziții directe.
**Rationale:**
- Maximum coverage — much abuse hides in direct purchases (threshold splitting, repeat micro-awards)
- "Grabs everything e-licitatie has to offer" is the stated vision
**Implications:**
- Storage/indexing designed for tens of millions of rows from day one
- Ingestion pipeline must sustain millions of records/year with backfill to 2018

### DEC-002: Historical depth = SICAP era (2018→now)

**Date:** 2026-07-12
**Status:** Active
**Context:** Old SEAP (2007–2018) exists only as data.gov.ro CSVs with a different schema.
**Decision:** Backfill to 2018 only; old SEAP deferred to v2+.
**Rationale:**
- Consistent schema, single source
- 8 years of data is a strong statistical baseline
**Implications:**
- Canonical data model targets SICAP schema only
- No schema-reconciliation layer needed in v1

### DEC-003: Free + open access, no accounts

**Date:** 2026-07-12
**Status:** Active
**Context:** Access/monetization model.
**Decision:** Everything public, no login, no paywall. Public-good project.
**Rationale:**
- Watchdog mission; maximize journalist/NGO/citizen reach
**Implications:**
- No auth system in v1
- Caching can be aggressive (all pages public → CDN-friendly)

### DEC-004: v1 feature set

**Date:** 2026-07-12
**Status:** Active
**Context:** v1 must-haves.
**Decision:** All four: powerful search + filters; red-flag analytics; entity profiles (authorities + suppliers); dashboards + national statistics.
**Rationale:**
- Each selected explicitly by user; together they form the "better and critical view"
**Implications:**
- Needs FTS engine, precomputed aggregates, entity resolution, red-flag batch jobs

### DEC-005: v1 non-goals

**Date:** 2026-07-12
**Status:** Active
**Context:** Scope control.
**Decision:** Out of v1: user accounts + saved alerts; company-registry enrichment (ANAF/ONRC/PEP); English UI; public third-party API.
**Rationale:**
- Focus; each is a large effort orthogonal to core value
**Implications:**
- Romanian-only strings; internal API unstable/undocumented; red flags limited to SICAP-native signals

---

## Superseded Decisions

_None._

---

## Revoked Decisions

_None._

---

## Decision Log

| ID | Date | Title | Status |
|----|------|-------|--------|
| DEC-001 | 2026-07-12 | Full data scope including direct purchases | Active |
| DEC-002 | 2026-07-12 | Historical depth = SICAP era (2018→now) | Active |
| DEC-003 | 2026-07-12 | Free + open access, no accounts | Active |
| DEC-004 | 2026-07-12 | v1 feature set | Active |
| DEC-005 | 2026-07-12 | v1 non-goals | Active |
