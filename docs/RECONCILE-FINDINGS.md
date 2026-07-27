# Reconcile (#3) — findings & handoff

> **RESOLVED 2026-07-24 (terminal session).** Problem 1 fixed and rerun; see
> "Resolution" at the bottom. Two factual corrections to this doc:
>
> 1. `core.award_links` was **not** empty when this was written — the buggy run
>    had already landed 2.496.498 rows on 2026-07-23 08:50 and
>    `marts.ted_awards` had been rebuilt from them (2.03M lots carried a
>    `matched_contract_id` from the broken join, feeding the "doar în TED"
>    stats). The claim below reflected stale state.
> 2. "Expect the match rate to fall" points the wrong way: the fix *widens* the
>    join (exact-leu → ±1% band), which can only add pairs. It rose ~5,8%.
>    Over-matching (Problem 2) is a precision question — settled by sampling,
>    not by watching the rate.

Investigated 2026-07-24 from the Telegram-bridge session while working on the
search mock.

Handing this to whoever picks up ingestion. Two problems: one blocker in the
query, one judgement call about whether the output is trustworthy.

---

## State

- Disk: fixed. Docker VM was at 98% (1.3G free) and that is what killed the
  first run with `code: '53100' … mdzeroextend`. Now **107.6G free**.
- `core.award_links`: exists, correct schema, **0 rows**.
- `.reconcile-done` marker: absent. `reconcile.log` ends in the disk-full stack.
- Normalize: complete, all 7 transforms at 0 remaining, 29 quarantined rows total.

## Sizing (measured)

| | rows |
|---|---|
| TED candidates (`ted_lot_results` ⋈ `ted_notices`, buyer + value + date present) | 2.606.855 |
| e-licitatie candidates (`contracts` ⋈ `awards`, value + date + authority, RON) | 1.020.264 |
| distinct TED buyer entities | 3.461 |
| distinct e-licitatie authorities | 8.005 |
| **shared buyer entities** | **3.357** |
| candidate pairs, before winner check | 2.733.355 |

Dry run **with** the winner-overlap check:

| | |
|---|---|
| linked pairs | **2.497.547** |
| TED lots matched | **2.031.234** (78% of candidates) |
| contracts matched | **382.578** (37,5% of candidates) |

That 2,7M intermediate is why it needed disk. It should complete now, but see
below before running it.

---

## Problem 1 (blocker) — the `vbucket` equijoin makes `valueTol` dead code

`apps/ingestion/src/normalize/reconcile.ts`, in the big INSERT:

```sql
from ted t
join eli e
  on e.authority_entity_id = t.buyer_entity_id
 and e.vbucket = t.vbucket                      -- vbucket = round(value)::bigint
where abs(t.awarded_value - e.contract_value)
      <= ${vtol} * greatest(t.awarded_value, e.contract_value)   -- can never bind
```

`vbucket` is `round(value)::bigint` on both sides, so the join demands the two
values be **equal to the leu**. The `WHERE` tolerance underneath is therefore
unreachable — `--value-tol` does nothing, and `value_diff_pct` is written as
`0` on every single row.

Two consequences:

1. **Real twins are dropped.** Any pair differing by one leu — rounding, VAT
   treatment, RON/EUR conversion, a contract amended post-publication — never
   matches. Loosening the tolerance will not recover them.
2. **`match_score` is not diagnostic.** The value term is `0.40 × 1` on every
   row by construction, so score is driven only by date and CPV. The score
   buckets in `ReconcileReport` will look reassuringly high no matter how bad
   the matching is. Do not calibrate against them as-is.

**Fix direction:** replace the exact equijoin with a range join so the tolerance
binds. Options, cheapest first:

- Coarse bucket + neighbour check — join on `floor(value/1000)` and also probe
  bucket ±1, then let the `WHERE` tolerance do the real filtering. Keeps a hash
  key for speed.
- `range` type + GiST index on the value interval.
- Straight band join with the tolerance inline, if the planner copes at this
  scale (it may not — that is what the bucket was avoiding).

Whatever is chosen, afterwards `value_diff_pct` must show a real distribution.
If it is still all zeros, the fix did not take.

## Problem 2 (judgement) — a 78% match rate is not plausible

Two signals that the join is over-matching:

- **The winner check removed only 8,6%** of candidates (2.733.355 → 2.497.547).
  Buyer + winner agreement is supposed to be the *selective* anchor. Removing
  almost nothing means buyer + exact-value + date + CPV was already admitting
  pairs that share a winner incidentally.
- **The density makes coincidence cheap.** 2,6M TED lots over 3.461 buyers is
  ~750 lots per buyer; 1,02M contracts over 8.005 authorities is ~127 each.
  Within a single buyer that is ~95k pairs to filter, and round-number contract
  values collide constantly.

Note the fan-out is *not* itself the problem: 2,03M lots → 382k contracts is
expected for framework agreements (many lots, one contract), and `is_primary`
handles it correctly — it ranks best-per-lot partitioned by
`ted_lot_result_id`, tie-broken by date then contract id. That part is sound.

**Suggested order:**

1. Fix the vbucket join.
2. Re-run the dry count. **Expect the match rate to fall** — that is success,
   not regression. 78% is not a believable cross-system twin rate.
3. Hand-verify ~20 links against real TED publication numbers on ted.europa.eu
   before trusting any of it. The `evidence` jsonb already carries
   `ted_pubnum`, both values, both dates, both CPVs.
4. Only then write `award_links` and tune tolerances.

---

## Why the search work cares

`singleBidder` as a search filter is currently unshippable, and reconcile is
what unblocks it. Bidder-count coverage today:

| source | rows | competition data |
|---|---|---|
| `core.ted_lot_results` | 4.032.082 lots | `is_single_bidder` explicit — 847.437 single (21%); `tenders_received` on 3.305.752 |
| `core.awards` (e-licitatie) | 312.524 | **none** |
| `core.direct_acquisitions` | 20.795.132 | none — DAs are single-supplier by definition |

The only e-licitatie proxy is `lowest_offer_value = highest_offer_value`, which
fires on **201.849 of the 214.860 rows that have the data (94%)**. A 94% rate is
not evidence that 94% of tenders had one bidder — it is evidence the field is
recording the winning offer twice. It is not a competition signal; do not use it.

After reconcile, above-threshold e-licitatie contracts can inherit
`tenders_received` from their TED twin. The 20,8M DAs never will — they are
below threshold and never reach TED. That is acceptable as long as the UI says
so: "achiziție directă" is a *category*, not a competition failure.

## Resolution (2026-07-24, terminal session)

Fix shipped in `apps/ingestion/src/normalize/reconcile.ts`:

- **Log bucket**: `vbucket = floor(ln(value) / ln(1 + valueTol))` — every bucket
  spans exactly one tolerance step, so any pair within ±tol is in the same or an
  adjacent bucket; the TED side probes b−1/b/b+1 (still an equi hash key). The
  precise `±valueTol` WHERE now actually decides. A fixed-width bucket (e.g.
  1000 lei ±1) would NOT work: 1% of a 10M contract is 100 buckets.
- **Winner moved into the join key** (buyer + winner + bucket): buyer+band alone
  Cartesian-exploded on value-clustered buyers (pharma frameworks) past an 80GB
  `temp_file_limit`. With the winner as a third equality the intermediate
  collapses; the old `EXISTS` winner check is implied and was dropped.
- `work_mem 512MB`, `temp_file_limit 80GB` (disk now has >100G free).

Rerun results (valueTol=0.01, dateTol=45d):

| | buggy run (Jul 23) | fixed run (Jul 24) |
|---|---|---|
| links | 2.496.498 | **2.641.953** |
| TED lots matched | 2.031.234 | 2.046.317 |
| contracts matched | 382.578 | 385.518 |
| `value_diff_pct` = 0 | 99,8% | 94,3% |
| non-exact links | 5.259 (sub-leu only) | **150.243** (real 0–1% spread) |

122.793 lots match *only* thanks to the working tolerance. Score buckets:
≥0.9 = 1.897.705 · 0.7–0.9 = 638.250 · <0.7 = 105.998.

Verification sample (step 3 above): **25 stratified primary links** with TED
URLs in `seap-heartbeat/reconcile-sample.md` — awaiting human eyeball before
the crosswalk is trusted for `tenders_received` inheritance.
`marts.ted_awards` rebuilt from the fixed links.

## Guardrails

- The bridge session has not written to `award_links` and will not without an
  explicit go-ahead. If both sessions might touch it, coordinate first — it is
  `truncate`-and-rebuild, so a concurrent run would clobber.
- `normalize --rebuild` remains forbidden (wipes the 4,78M dump-era DAs, which
  are not in raw and unrecoverable).
