# Decisions: red-flags

**Task:** red-flags
**Created:** 2026-07-13
**Last Updated:** 2026-07-13

---

## Active Decisions

### DEC-001: Stream-split — DA flags on real data now, award flags dormant
**Status:** Active
**Context:** The db-old dump is DA-only (4.78M `directAcquisitionContract`); no
award/tender/offer/bid collections. Live award data (`core.awards`) is ~744 rows,
SICAP-blocked.
**Decision:** Ship a real, populated **DA red-flag engine** now. Build award-flag
schema + rules + synthetic-fixture tests so they light up automatically when live
award data flows. Flags compute over `core`, so both streams behave identically.
**Rationale:** Delivers demonstrable value on real data without waiting on SICAP;
avoids vaporware while keeping the award path ready.

### DEC-002: Import the FULL 4.78M DA transactions into core
**Status:** Active
**Context:** Options were full / above-a-floor / curated subset.
**Decision:** Import all 4.78M into `core.direct_acquisitions`. Resolve entities
via in-memory maps (authority = leading sicap id, supplier = leading CUI) — no
per-row DB lookups. Batched streaming import.
**Rationale:** Threshold-splitting detection REQUIRES the small DAs (they are the
structuring); full set also gives accurate totals + fills the empty concentration
/ partner marts. 4.78M is trivial for indexed Postgres.

### DEC-003: Binary CRI composite (DIGIWHIST-style)
**Status:** Active
**Decision:** Each flag is binary (0/1) per subject. Entity risk = share of
*applicable* flags triggered (a flag is "applicable" only where its inputs exist).
Continuous **severity** is stored per instance for sorting/detail but is NOT the
headline score.
**Rationale:** Transparent, academically grounded, defensible to journalists;
avoids a subjective black-box weighting.

### DEC-004: v1 DA flag set (7 flags)
**Status:** Active
**Decision:** Ship all selected groups:
- `da_split` — same authority→supplier (and →CPV) DAs summing past the legal DA
  ceiling within a window, each kept under it. **Flagship.**
- `da_concentration` — supplier = outsized share of an authority's DA spend (HHI +
  top-supplier %).
- `da_dependence` — supplier earns most revenue from a single authority.
- `da_rapid` — finalization − publication implausibly short (no market test).
- `da_estimate_match` — closing == estimate repeatedly (no negotiation).
- `da_round` — closing suspiciously round / bunched just under ceiling.
- `da_year_end` — December budget-dump spike.
(`da_repeat` relationship-intensity folded into concentration analysis; promote
later if needed.)

### DEC-005: `core.flags` — polymorphic, replayable
**Status:** Active
**Decision:** One store: (subject_type, subject_id, flag_code, period, triggered,
severity, evidence jsonb, methodology_version). Subjects: da | authority | supplier
| pair. Recompute = truncate + rebuild from core (like marts). Marts read from it.
**Rationale:** Uniform surface for transaction- and entity-level flags; no
hand-maintained state; live + snapshot identical.

### DEC-006: Date-aware versioned thresholds (`core.risk_thresholds`)
**Status:** Active
**Decision:** Legal + statistical thresholds live in a table keyed by (key,
valid_from, valid_to). DA ceiling changed across years, so `da_split` reads the
ceiling applicable to each DA's date. Statistical thresholds (e.g. rapid-cutoff
hours, concentration HHI cutoff) versioned the same way and shown on `/metodologie`.
**Confirmed values (Legea 98/2016 art. 7(5), RON, net of VAT — via ANAP / Lege5):**
- Data period (2018–2020): products/services **132.519**, works **441.730**
- Post-2023 raise: **270.120** / **900.400** (pin exact effective date only if/when
  post-2023 data is imported — irrelevant to the 2020 snapshot)
`da_split` uses 132.519 / 441.730 for all snapshot DAs. User (domain expert) to
sanity-check against firsthand 2020 experience.

### DEC-007: Methodology + transparency
**Status:** Active
**Decision:** "Signal, not proof" framing site-wide. `/metodologie` documents each
flag (definition, threshold, rationale, false-positive caveats, data coverage).
Every flag instance stamped with `methodology_version`. Evidence jsonb shown to users.
**Rationale:** Credibility with journalists/NGOs requires defensible, inspectable,
non-defamatory indicators.

---

## Deferred / v2
- Ownership/network flags (shared address, admin, phone) — needs ANAF/ONRC
  (`supplierOpenApiDetails` in dump is a start).
- Award-stream flags go live when SICAP backfill resumes (DEC-001).
- New-supplier-wins-big (needs reliable entity first-seen from live data).
