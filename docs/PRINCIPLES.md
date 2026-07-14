# Guiding Principles — SEAP watchdog frontend

The constitution the UI is designed against. When a design decision is contested,
these resolve it. Written 2026-07-14 in a discovery session; revisit as the product
and audience mature.

**North star:** _Trust is the product._ Everything else is downstream of whether a
journalist, NGO, or citizen believes what they see and can prove it themselves.

**Identity:** A public-interest watchdog for Romanian public procurement
(e-licitatie.ro / SICAP) — **entity-centric**, a **live monitor honestly catching
up**, sober and cross-linked. Not a dashboard, not a tabloid. Free and open.

**Audience:** Journalists, NGOs, watchdogs, and citizens — served by one layered
surface, not two products. When depth and simplicity conflict, progressive
disclosure is the answer, never dumbing down.

---

## Tier 1 — Load-bearing walls (the right to name names)

The app _publicly ranks and names_ companies and authorities as risky. That is only
defensible if these three never crack.

1. **Evidence is always one click away.** Every flag, every number links to its
   primary source on e-licitatie. No unsourced claim ever appears. Naming is earned
   by sourcing.
2. **Signal, not verdict.** A flag is a question worth asking, never a finding of
   guilt — and it carries its caveat _inline_, in the same breath as the claim.
   Humble language is legal armor and credibility at once.
3. **Methodology is transparent and linked.** Every flag has a plain-language "how we
   calculate this." The public counterweight to public rankings. (v1: prominent
   "signal not proof" notice + methodology link on every signal.)

## Tier 2 — The experience

4. **One surface, layered depth.** A citizen gets value in 5 seconds; a journalist
   drills to the raw record. Default density is _balanced_ — a few key numbers + one
   clear visual, then drill. Progressive disclosure is the spine, not a feature.
5. **The entity is the center.** Company / authority profiles are the gravitational
   core; flags, transactions, partners, and money-flows all hang off entities and
   cross-link. Everything is a link (OpenCorporates DNA).
6. **A number alone is meaningless — always contextualize.** Every metric answers "is
   this normal?" via percentile / rank, peer group, historical baseline, and
   distribution. (Historical is thin now — build the hooks, fill as coverage grows.)

## Tier 3 — Honesty & voice

7. **Honest about coverage.** Gaps are shown _as_ gaps — the timeline displays the
   2020–2025 hole, each stream carries its era, nothing implies completeness we lack.
   "Monitor, catching up" sets the expectation.
8. **Plain Romanian, sober voice.** Translate SICAP bureaucratese, CPV codes, and
   legal thresholds into human language. Trust through soberness — the polish of
   ProPublica, the restraint of a statistics office, never sensational.
9. **Built to be cited.** Permalinks, exports, shareable findings. A tool journalists
   quote and NGOs build on — not a walled garden.

---

## The three modes inherit these

- **Search** (the front door) → #5, #8: fast entity lookup, plain language.
- **Explore** (rankings, county maps, leaderboards; fully public naming — authorities
  _and_ suppliers) → #2, #3, #6, #7: every rank caveated, contextualized, era-labeled.
- **Story** (auto "notable findings" feed + occasional flagship investigations) →
  #1, #2, #9: evidence-embedded, humble, citable.

## Decisions locked in this session

- Primary user: **both, layered** (progressive disclosure is the spine).
- Flag stance: **signal, not proof** (caveat inline, never a bare verdict).
- Entry: **search-forward home** that fans out to Explore (stats/county) and Story.
- Data spine: **entity-centric** (OpenCorporates model).
- Time: **explicit gaps, honest timeline** — never hide the hole.
- Exposure: **fully public rankings** (authorities + suppliers) — hence Tier 1 is
  non-negotiable.
- Story mode: **both** — algorithmic notable-findings feed + hand-curated flagship
  pieces.
- Fairness mechanism (v1): **disclaimer + methodology link** on every signal.
- Context lenses: **all four** — percentile, peer, historical, distribution.
- Identity: **monitor, honestly catching up.**
- Default density: **balanced** (key numbers + one visual, then drill).
- Reference kinship: opentender.eu/DIGIWHIST (rigor) · OpenCorporates (cross-linked
  clarity) · ProPublica/OCCRP (storytelling polish) · gov/stat portals (soberness).

## The principles as tie-breakers (proof they guide decisions)

- _"Riskiest-suppliers leaderboard — show a big red score?"_ → #2: show the metric +
  caveat, not a bare verdict.
- _"County map — just show total spend 2018–2026?"_ → #7: no — era-mixed totals
  mislead; label or split by stream.
- _"Profile page — lead with flags or facts?"_ → #1 + #5: facts and evidence first;
  flags as sourced, caveated annotations.
- _"Add a slick risk-percentile without explaining it?"_ → #3: no — every derived
  number links its method.
