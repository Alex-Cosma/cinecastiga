# Information Architecture — SEAP watchdog frontend

Structure derived from `docs/PRINCIPLES.md`. This is the skeleton the page/visual
design is built against — routes, navigation, the layering model, cross-linking.
Written 2026-07-14 (IA session, follows the principles session).

---

## 1. The layering vocabulary (the spine)

Progressive disclosure is principle #1, so it's defined once and applied on EVERY
page. Four levels; every page opens at **L1**.

| Level | Name | What | For |
|---|---|---|---|
| **L0** | Glance (5s) | one headline + verdict-free summary | citizen |
| **L1** | Read (default) | key numbers + one visual + caveated flags + context (percentile/peer) | everyone |
| **L2** | Dig | full tables, all flags w/ evidence, filters | journalist |
| **L3** | Source | the raw record → e-licitatie deep link (proof) | anyone verifying |

## 2. Global navigation

Lean, search always present:

```
[SEAP logo]   [ 🔍 search box (typeahead) ]   Explorează ▾   Analize   Despre
                                                │
                          Clasamente · Hartă · Domenii · Semnale
```

- Search is a permanent fixture, not a destination (principles #5, #8).
- **Explorează** groups the four discovery surfaces (dropdown; no heavy hub page).
- **Analize** = Story. **Despre** carries mission + coverage + methodology links.
- A persistent **coverage chip** rides in the header/footer (see §6).

## 3. Route inventory

| Route | Mode | Purpose | Opens | Cross-links out |
|---|---|---|---|---|
| `/` | Home | Search-forward: hero search + 3–4 headline stats (era-labeled) + notable-findings teaser + explore entries | L0/L1 | everything |
| `/cauta?q=` | Search | Entity results (the spine's front door) | L1 | → entity |
| `/entitati/[id]` | **Entity (center)** | Profile — identity, risk, money-flows, transactions | L1 | → methodology, partner entities, map, domains, e-licitatie |
| `/entitati/[id]/tranzactii` | Entity | Full paginated/filterable transaction table (L2 spun out) | L2 | → e-licitatie, entities |
| `/clasamente` | Explore | Leaderboards: top by spend, riskiest authorities, riskiest suppliers (fully public, each caveated) | L1 | → entity |
| `/harta` | Explore | County choropleth (per-county distribution) | L1 | → entity, county drill |
| `/domenii` | Explore | CPV domains treemap (what's bought) | L1 | → entity, cpv drill |
| `/semnale` | Explore | Flag-pattern browser (all splits, all single-bids…) | L1 | → entity, methodology |
| `/analize` | Story | ONE blended reverse-chron feed: auto notable findings + featured curated pieces | L0/L1 | → entity, transactions |
| `/analize/[slug]` | Story | One flagship investigation, evidence-embedded | L1 | → entity, e-licitatie |
| `/metodologie` | Trust | How every flag is computed (plain Romanian) | L1 | ← every flag |
| `/despre` | Trust | Mission, sources, "signal not proof", coverage + gaps, license | L1 | → methodology |

**New vs current app:** `/clasamente` (risk leaderboard pulled OUT of `/semnale`),
`/analize` (+ `[slug]`), `/despre`, `/entitati/[id]/tranzactii`.
**Restructured:** home → search-forward; `/semnale` → pure pattern browser.
**Reused as-is-ish:** `/cauta`, `/harta`, `/domenii`, `/metodologie`, `/entitati/[id]`.

## 4. Entity profile — the gravitational center (layering template)

Everything cross-links here, so its layering is the model for the whole app.

- **L0 — Identity band:** name, CUI, county, role(s), one-line "what & when" + honest
  era note (e.g. "activitate: 2018–2019 + 2026").
- **L1 — Risk summary:** caveated flag chips ("posibilă fracționare — poate fi și
  nevoie recurentă") + CRI shown IN CONTEXT (percentile vs peers). Facts + evidence
  first; flags as sourced annotations, never a bare score (principles #1, #2).
- **L1 — Money-flows:** top counterparties (→ entities), spend sparkline (honest gaps).
- **L2 — Transactions:** full table → sub-route `/entitati/[id]/tranzactii`.
- **L3 — Source:** every transaction row → e-licitatie deep link.

## 5. Cross-linking graph (entity-centric)

```
        ┌────────── /cauta ──────────┐
        │              │             │
 /clasamente   /harta /domenii  /semnale   /analize
        └──────┬───────┴──────┬──────┴────────┘
               ▼              ▼
         ┌──────────  /entitati/[id]  ──────────┐   ← the hub
         ▼         ▼          ▼         ▼        ▼
   /metodologie  partner    /harta   /domenii  e-licitatie
                 entities   (county) (cpv)     (L3 proof)
```

Every entity name anywhere is a link. Every flag → methodology. Every transaction →
e-licitatie. The profile is where all three modes (Search / Explore / Story) converge.

## 6. Cross-cutting: coverage honesty (principle #7)

Not a page — an ambient affordance. A small persistent **coverage chip**
("Date: AD 2018–2019 · contracte 2026 · lipsă 2020–2025") in header/footer, full
story on `/despre`. Every stats view additionally era-labels its own data. No separate
`/acoperire` page — it folds into `/despre`.

## 7. Modes → principles they lean on

- **Search** → #5 (entity-centric), #8 (plain language).
- **Explore** (`/clasamente`, `/harta`, `/domenii`, `/semnale`; fully public naming) →
  #2 (caveated), #3 (methodology linked), #6 (contextualized), #7 (era-labeled).
- **Story** (`/analize`, one blended feed) → #1 (evidence-embedded), #2 (humble),
  #9 (citable).

## Decisions locked (IA session)

- Layering: 4 levels (L0–L3), pages open at L1.
- Nav: lean top bar, permanent search, Explorează dropdown, no explore hub page.
- Profile: one scrolling page; heavy transaction table spun to a sub-route.
- Risk leaderboard → `/clasamente`; `/semnale` becomes pattern-only.
- Story: `/analize` = ONE blended reverse-chron feed (auto + featured curated),
  flagship pieces at `/analize/[slug]`.
- Coverage: persistent chip + `/despre` (no standalone coverage page).

## Next

IA → visual/page design (wireframes, then component + visual system). Data functions
already exist for most views (getRiskLeaderboard, getFlagInstances, getEntityProfile,
getSpendByCounty, getCpv*, getTopEntities…); `/analize` auto-feed + `/despre` +
`/clasamente` split are the main new data/route work.
