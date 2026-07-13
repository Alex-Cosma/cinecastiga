# Task: red-flags

## What This Is

A corruption-risk **red-flag engine** over Romanian public procurement — the
platform's core differentiator ("critical view"). Computes objective, documented
risk indicators per transaction and aggregates them into entity risk profiles,
surfaced for journalists/NGOs/watchdogs. Grounded in the Open Contracting /
DIGIWHIST Corruption Risk Index (CRI) methodology, adapted to what SICAP data
supports.

## Data reality (the constraint that shapes everything)

- **Direct acquisitions (achiziții directe):** 4.78M real 2018–2020 transactions
  in the db-old dump (`directAcquisitionContract`), with values, both timing
  dates, CPV, and authority+supplier. DA flags are computable on **real data now**.
- **Awards/tenders (proceduri de atribuire):** NOT in the dump — the 2020 build
  was DA-only. Only the live pipeline's `core.awards/notices/contracts` schema
  exists (~744 rows, SICAP-blocked). Award flags are **designed + tested now,
  computed when live data flows**. `core.awards` also lacks a bid-count column
  (needed for single-bidder) — to be added.

## Technical Requirements

### Must Create
- [ ] **DA import** — `directAcquisitionContract` (4.78M) → `core.direct_acquisitions`
      (transaction grain), resolving entities via the in-memory maps from the
      entity import (authority = sicap-id prefix, supplier = CUI prefix). Also
      backfills `marts.authority_concentration` + `marts.entity_top_partners`.
- [ ] **`core.flags`** — polymorphic flag store (subject_type ∈ {da, authority,
      supplier, pair}, subject_id, flag_code, period, triggered 0/1, severity,
      evidence jsonb, methodology_version). Replayable (truncate + recompute).
- [ ] **`core.risk_thresholds`** — date-aware, versioned legal/statistical
      thresholds (DA ceiling by date range, etc.), never hardcoded.
- [ ] **DA flag rules (v1, 7 flags)** — see DECISIONS DEC-004.
- [ ] **CRI composite** — entity risk = share of *applicable* flags triggered
      (binary), per DEC-003.
- [ ] **Marts** — `marts.entity_flags` (per-entity counts + CRI + top flags),
      `marts.flag_instances` (browsable per flag type), fill `authority_concentration`.
- [ ] **Web** — flag badges on entity profiles, `/semnale` browser, risk
      leaderboard, `/metodologie` methodology page.
- [ ] **Award engine (schema + rules + fixtures)** — ready but dormant.

### Must Integrate With
- `core.direct_acquisitions`, `core.entities`, `core.entity_sicap_ids`
- The entity + marts import (`apps/ingestion/src/import-old/`)
- Marts build (`apps/ingestion/src/normalize/marts.ts`) — flags recompute alongside
- Web marts-only read pattern (denormalize display fields into flag marts)

### Constraints
- **"Signal, not proof"** — every flag shows evidence + false-positive caveats.
- **Transparent + versioned** — CRI (not black-box), documented methodology,
  `methodology_version` stamped on every flag instance.
- **Replayable** — flags recompute from core; no hand-maintained state.
- **Date-aware** — thresholds vary by year (DA ceiling changed); never hardcode.
- **Stream-uniform** — flags compute over `core`, so live + snapshot behave identically.

---

## Success Criteria
- [ ] 4.78M DAs in core; totals reconcile to national spend.
- [ ] 7 DA flags compute; instances carry evidence; recompute is idempotent.
- [ ] Every entity has a CRI score; risk leaderboard + `/semnale` render real cases.
- [ ] The 4-minute `da_rapid` case is findable and cited on a profile.
- [ ] Award rules unit-tested against synthetic fixtures (dormant on real data).
- [ ] `/metodologie` documents each flag, threshold, rationale, caveat.

## Out of Scope (v1)
- [X] Network/ownership graph flags (shared address/admin) — needs ANAF/ONRC (v2).
- [X] ML/anomaly detection — start rule-based + transparent.
- [X] Cross-border / EU-notice flags.

## Initial Context
See root `.specd/tasks/project/` REQUIREMENTS (red-flag reqs) + ROADMAP Phase 8.
Domain grounding: DIGIWHIST/opentender CRI, Open Contracting red-flag guide,
World Bank procurement risk indicators. User is a domain expert (2020 SEAP build).
