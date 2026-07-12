# Feature: marts-layer (gold — precomputed read models)

**Sub-project:** apps/ingestion
**Created:** 2026-07-12
**Stage:** discussion

## Problem

`core` holds clean facts (contracts, DAs, entities), but answering a dashboard
question ("top suppliers", "spend by CPV", "this authority's concentration")
means scanning/aggregating large fact tables on every request — unusably slow at
firehose scale (millions of DAs/yr) and repeated for the same handful of
questions. Web should read tiny precomputed tables, never aggregate live.

## What this builds

A `marts` schema of **precomputed read models**, rebuilt from `core` by a job
(the medallion "gold" layer). Same replayable pattern as normalize:
`TRUNCATE marts.* ; INSERT ... SELECT FROM core`. User has built this exact
pattern before (MongoDB `$out` precomputed collections, indexed) — proven.

### v1 marts (DEC-002)

- **`marts.national_stats`** — counts + total RON spend across notices/awards/DAs,
  overall and by year, by procurement kind. Homepage headline + trend charts.
- **`marts.spend_by_cpv`** — spend grouped by CPV division (code + `name_ro`,
  n, total_ron). Treemap. (CPV is 100% valid in core.)
- **`marts.entity_profile`** — per authority/supplier: n, total_ron, first/last
  activity, top counterparties. Powers entity pages.
- **`marts.top_entities`** — leaderboards (biggest suppliers, biggest
  authorities) by total_ron.
- **`marts.authority_concentration`** — per authority: top-supplier %, Herfindahl
  index (HHI), distinct-supplier count. Watchdog signal + red-flag input; window
  functions.

### Deferred

- **`spend_by_county` (choropleth)** — county sits only on winner/supplier
  entities (from award address); contracting authorities from notice/DA strings
  have no geo. Buyer-side county is the interesting cut for a watchdog — waits
  for authority geo enrichment.
- **Meilisearch search index** — separate task.

## Integrates with

- **Reads:** `core.*` (contracts, contract_winners, direct_acquisitions,
  notices, awards, entities, cpv_codes).
- **Writes:** new `marts` pgSchema tables (`packages/db/src/schema/marts.ts` —
  currently placeholder).
- **Build:** a `marts` CLI (`--rebuild`) in apps/ingestion, mirroring `normalize`.
- **Downstream:** apps/web reads marts; red-flag engine consumes concentration.

## Key decisions (this discussion)

See DECISIONS.md DEC-001..005:
1. Job-built tables (truncate + recompute from core), own indexes.
2. v1 scope = the five marts above; county choropleth deferred.
3. Currency = RON only; historical FX out of scope v1.
4. Time grain = year + overall; primary date per fact (DA finalization_date,
   contract contract_date, notice state_date).
5. Meilisearch is a separate task.

## Data reality (verified against current core)

- Value coverage 100% (contracts + DAs); all RON in the sample.
- Dates 100% present → year grain reliable.
- County on 384/793 entities (winners/suppliers only) → choropleth deferred.
- Spend attribution: a contract has M:N winners — decide split vs full-credit
  (gray area).

## Out of scope (v1)

- County/choropleth; search index; red-flag engine (consumes marts, separate);
  FX/currency conversion; web UI.

## Gray areas (defer to /specd.discuss or research)

- **Spend attribution for consortia** (contract with N winners): full credit to
  each vs split N-ways. Affects supplier totals + concentration.
- **Contract vs DA in "spend"**: national_stats should separate the two streams
  (DAs are the firehose, small-value; contracts are large) — confirm the kinds.
- **Refresh trigger**: run marts build at end of `normalize`, or separate cadence.
- **Incremental** later vs full-rebuild now (full is fine at current scale).
