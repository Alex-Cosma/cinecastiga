# Task: setup

## What This Is

Initial setup for **web** — the public Next.js site: search, entity profiles, national dashboards, visualizations (treemaps, choropleth, trend charts), red-flag display, methodology pages. Romanian UI, no accounts, aggressively cached.

## Technical Requirements

### Must Create

- [ ] `apps/web/package.json`, Next.js 16 App Router scaffold, TypeScript strict
- [ ] `apps/web/app/layout.tsx`, `app/page.tsx` — shell with Romanian-language base strings
- [ ] `apps/web/lib/db.ts` — server-side data access importing `packages/db`; reads **marts schema and Meilisearch only** (enforced pattern: no raw/core queries from web)
- [ ] `apps/web/lib/search.ts` — Meilisearch client wrapper
- [ ] ISR/caching configuration — public pages, CDN-friendly cache headers
- [ ] Vitest + one passing component/route test; lint config matching workspace

### Must Integrate With

- Monorepo root created by `ingestion` setup task — `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- `packages/db` — typed marts access
- `packages/domain` — shared types (Entity, RedFlag, etc.)
- `infra/docker-compose.yml` — local Postgres + Meilisearch

### Constraints

- **Reads only marts + search index** (CQRS-lite from research ARCHITECTURE.md) — request-time code never joins raw multi-million-row tables
- **All pages public** → ISR + edge caching without cache-key complexity; design for Cloudflare in front
- **Romanian UI only** (DEC-005); no auth, no accounts (DEC-003)
- **Performance is a product requirement** — p95 targets from ROADMAP.md Phase 9 (<300ms dynamic, <100ms edge-cached) shape choices from the start
- Node 22 LTS, Next.js 16.x

---

## Success Criteria

- [ ] `pnpm --filter web dev` starts; home page renders in Romanian
- [ ] Server component reads a marts table and a Meilisearch index locally
- [ ] `pnpm --filter web build` green; CI passes
- [ ] Lint + test pass

---

## Out of Scope

- [X] Search UI, profiles, dashboards, visualizations — Phases 6-7 tasks
- [X] Red-flag display + methodology pages — Phase 8
- [X] English UI, accounts, public API — v2+ (DEC-005)

---

## Initial Context

### User Need
"Much, much better and critical view" of e-licitatie data for journalists/NGOs/watchdogs + public. See root `.specd/tasks/project/`: REQUIREMENTS.md (REQ-003→010, 015, 016), ROADMAP.md Phases 6-9, research/FEATURES.md (comparables: opentender.eu, zIndex, DataDriven.ro).

### Integration Points
Marts tables + Meilisearch produced by `ingestion`; shared `db`/`domain` packages.

### Key Constraints
Never query raw/core at request time; permalink/citation-stability matters to journalists; visualization suite (treemap drill-down, county choropleth, trend charts) is v1 scope per user.
