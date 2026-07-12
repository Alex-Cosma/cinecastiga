# Context: setup

**Last Updated:** 2026-07-12
**Sessions:** 0

## Discussion Summary

Task fully specified by project-level planning (see root `.specd/tasks/project/`): FEATURE.md seeded from research STACK.md/ARCHITECTURE.md; all stack decisions already made at project level (DEC-001..006, notably DEC-006: TypeScript end-to-end, Kotlin/Spring declined).

---

## Resolved Questions

### Stack + shape
**Resolution:** All resolved at project level — pnpm/Turborepo monorepo, Postgres 16+ (raw/core/marts schemas), Drizzle, graphile-worker (no Redis), zod, Meilisearch, Node 22 LTS. This setup task bootstraps the monorepo root + ingestion app skeleton per FEATURE.md.

### Local vs deployed fetching
**Resolution:** Bronze-layer replay model — scrape once anywhere, `pg_dump` raw schema moves data between machines; scraper gets a `--sample` mode for local dev. (Discussed in planning session 2026-07-12.)

---

## Deferred Questions

_None at task level — domain data-quality questions (CPV mess, unit normalization) live at project level and gate Phase 8 (red flags), not setup._

---

## Discussion History

| Date | Topics Covered | Key Outcomes |
|------|----------------|--------------|
| 2026-07-12 | Seeded from project-level planning | FEATURE.md created by scaffold |

---

## Gray Areas Remaining

_None — requirements, constraints, and success criteria fully specified in FEATURE.md._

---

## Quick Reference

- **Task:** `.specd/tasks/setup/FEATURE.md`
- **Project docs:** root `.specd/tasks/project/` (PROJECT, REQUIREMENTS, ROADMAP, research/)
