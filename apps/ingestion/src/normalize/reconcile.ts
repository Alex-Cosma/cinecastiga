import { contractRonValue, canonicalContract, assertContractIdentityQuality } from "@seap/db";
import type { DbSql } from "@seap/db";

/**
 * Reconciliation (#3): link TED lot-awards to their e-licitatie contract twins.
 * Both are above-threshold awards of the SAME procurement (SICAP is TED's
 * eSender). Entities already unify by CUI in core.entities, so the join anchors
 * on buyer + winner ENTITY ids (exact), then value / date / CPV agreement scores
 * the match. Fully derived: truncate core.award_links + rebuild. Idempotent.
 *
 * A TED lot may match several contracts (and vice-versa) — all qualifying pairs
 * are kept with a 0–1 score; downstream can pick the best per lot. Tolerances
 * are tunable (loosen/tighten after seeing real data).
 */
export interface ReconcileOpts {
  /** Max fractional value gap to still count as the same award (default 0.01 = 1%). */
  valueTol?: number;
  /** Max |days| between TED contract date and e-licitatie contract date (default 45). */
  dateTolDays?: number;
  log?: (m: string) => void;
}

export interface ReconcileReport {
  links: number;
  tedLotsMatched: number;
  contractsMatched: number;
  tedLotsMultiMatch: number;
  primaryLinks: number;
  scoreBuckets: { ge90: number; ge70: number; lt70: number };
}

export async function runReconcile(
  sql: DbSql,
  opts: ReconcileOpts = {},
): Promise<ReconcileReport> {
  const vtol = opts.valueTol ?? 0.01;
  const dtol = opts.dateTolDays ?? 45;
  const log = opts.log ?? (() => {});
  if (!Number.isFinite(vtol) || vtol <= 0 || vtol >= 1) {
    throw new RangeError("valueTol must be finite and strictly between 0 and 1");
  }
  if (!Number.isFinite(dtol) || dtol <= 0) {
    throw new RangeError("dateTolDays must be finite and positive");
  }

  // Replace the crosswalk atomically with its primary flags. TRUNCATE holds an
  // exclusive lock, so readers may wait; failures restore the old rows and
  // identity sequence. Temporary projections roll back with replacement writes.
  return sql.begin(async (q) => {
    await assertContractIdentityQuality(q);
    await q`set local work_mem = '512MB'`;
    await q`set local temp_file_limit = '32GB'`;

    // Materialize winners BEFORE matching the two sources. Inlining the old
    // CTEs let the planner join each TED buyer to every SEAP award, deferring
    // winner equality until last. JSON eligibility was estimated at 1,093 rows
    // versus 2,099,926 actual rows, turning that order into a runaway nested loop.
    // Separate temporary relations prevent this reordering; ANALYZE supplies
    // real cardinalities. Materialize all three TED probe buckets here too:
    // leaving a lateral probe in the final join allowed it to run AFTER a
    // buyer+winner-only index lookup, scanning entire high-volume relationships.
    log("preparing TED winner projection …");
    await q`
      create temporary table _reconcile_ted on commit drop as
      with eligible as materialized (
      select tlr.id ted_lot_result_id, tlr.ted_notice_id, tn.publication_number,
             tn.buyer_entity_id, tlw.entity_id winner_entity_id, tlr.awarded_value, tlr.contract_date, tlr.cpv_code,
             lower(unaccent(coalesce(tlr.title, ''))) title_folded,
             floor(ln(tlr.awarded_value) / (-ln(1 - ${vtol}::float8)))::bigint value_bucket
      from core.ted_lot_results tlr
      join core.ted_notices tn on tn.id = tlr.ted_notice_id
      join core.ted_lot_winners tlw on tlw.lot_result_id = tlr.id
      where tn.buyer_entity_id is not null
        and tlr.awarded_value is not null and tlr.awarded_value > 0
        and tlr.currency = 'RON'
        and tlr.amount_kind in ('payable', 'contract_value')
        and tlr.amount_details->>'matchEligible' = 'true'
        and tlr.contract_date is not null
      )
      select t.ted_lot_result_id, t.ted_notice_id, t.publication_number,
             t.buyer_entity_id, t.winner_entity_id, t.awarded_value, t.contract_date,
             t.cpv_code, t.title_folded, probe.vbucket
      from eligible t
      cross join lateral (values (t.value_bucket - 1), (t.value_bucket), (t.value_bucket + 1)) probe(vbucket)
    `;
    await q`create index on _reconcile_ted (buyer_entity_id, winner_entity_id, vbucket)`;
    await q`analyze _reconcile_ted`;

    log("preparing SEAP winner projection …");
    await q`
      create temporary table _reconcile_eli on commit drop as
      select c.id contract_id, c.ca_notice_id, ${contractRonValue(q)} as contract_value, c.contract_date,
             aw.authority_entity_id, cw.entity_id winner_entity_id, aw.cpv_code,
             lower(unaccent(c.title || ' ' || coalesce(c.lots_caption, ''))) title_folded,
             floor(ln(${contractRonValue(q)}) / (-ln(1 - ${vtol}::float8)))::bigint vbucket
      from core.contracts c
      join core.awards aw on aw.ca_notice_id = c.ca_notice_id
      join core.contract_winners cw on cw.contract_id = c.id
      where ${canonicalContract(q)} and ${contractRonValue(q)} is not null and ${contractRonValue(q)} > 0
        and c.contract_date is not null
        and aw.authority_entity_id is not null
    `;
    await q`create index on _reconcile_eli (authority_entity_id, winner_entity_id, vbucket)`;
    await q`analyze _reconcile_eli`;

    await q`truncate core.award_links restart identity`;
    log(`matching (valueTol=${vtol}, dateTolDays=${dtol}) …`);

    // abs(a-b) <= vtol*max(a,b) means max/min <= 1/(1-vtol).
    // This logarithmic width therefore covers every eligible pair in the same
    // or an adjacent bucket (ln(1+vtol) could miss a thin boundary interval).
    // The exact tolerance/date/CPV/title guards and per-lot primary selection
    // still make the final decision.
    // Each probe joins buyer + winner + value bucket as equalities. Consortium
    // pairs sharing several winners still deduplicate through ON CONFLICT.
    await q`
      insert into core.award_links
        (ted_lot_result_id, contract_id, ted_notice_id, ca_notice_id,
         match_score, match_method, value_diff_pct, date_diff_days, evidence)
      select
        t.ted_lot_result_id, e.contract_id, t.ted_notice_id, e.ca_notice_id,
        round((
            0.30 * greatest(0, 1 - (abs(t.awarded_value - e.contract_value)
                  / nullif(greatest(t.awarded_value, e.contract_value), 0)) / ${vtol})
          + 0.15 * greatest(0, 1 - (abs(extract(epoch from (t.contract_date - e.contract_date)) / 86400.0)) / ${dtol})
          + 0.25 * (case when t.cpv_code = e.cpv_code then 1.0 else 0.6 end)
          + 0.30 * least(1.0, sim.tsim * 1.25)
        )::numeric, 4),
        'buyer+winner+value+date+cpv+title',
        round((abs(t.awarded_value - e.contract_value)
              / nullif(greatest(t.awarded_value, e.contract_value), 0) * 100)::numeric, 3),
        round(abs(extract(epoch from (t.contract_date - e.contract_date)) / 86400.0))::int,
        jsonb_build_object(
          'ted_pubnum', t.publication_number,
          'ted_value', t.awarded_value, 'eli_value', e.contract_value,
          'ted_date', t.contract_date, 'eli_date', e.contract_date,
          'ted_cpv', t.cpv_code, 'eli_cpv', e.cpv_code,
          'title_sim', round(sim.tsim::numeric, 3),
          'buyer_entity', t.buyer_entity_id
        )
      from _reconcile_ted t
      join _reconcile_eli e
        on e.authority_entity_id = t.buyer_entity_id
       and e.winner_entity_id = t.winner_entity_id
       and e.vbucket = t.vbucket
      cross join lateral (select coalesce(similarity(t.title_folded, e.title_folded), 0) tsim) sim
      where abs(t.awarded_value - e.contract_value) <= ${vtol} * greatest(t.awarded_value, e.contract_value)
        and abs(extract(epoch from (t.contract_date - e.contract_date)) / 86400.0) <= ${dtol}
        and (t.cpv_code is null or e.cpv_code is null
             or left(t.cpv_code, 2) = left(e.cpv_code, 2))
        -- Coincidence guard: a pair must show at least one CATEGORICAL agreement —
        -- exact value, exact CPV, or a similar item title. Same buyer + same
        -- supplier + "close enough" value/date alone is not evidence inside
        -- high-volume relationships (pharma frameworks: thousands of small drug
        -- lots to one distributor; a ±1% window on a 2.000-lei lot is ±20 lei).
        and (t.awarded_value = e.contract_value
             or t.cpv_code = e.cpv_code
             or sim.tsim >= 0.3)
      on conflict (ted_lot_result_id, contract_id) do nothing
    `;

    // Best-per-lot: mark the single strongest contract per TED lot as primary
    // (highest score, tie-broken by closest date, then contract id for stability).
    // Frameworks yield many candidates per lot; the primary rows are the clean 1:1
    // crosswalk for dedup / unified spend.
    log("marking primary (best-per-lot) …");
    await q`
      with ranked as (
        select id, row_number() over (
          partition by ted_lot_result_id
          order by match_score desc, date_diff_days asc nulls last, contract_id
        ) rn
        from core.award_links
      )
      update core.award_links al
        set is_primary = (r.rn = 1)
        from ranked r
       where r.id = al.id
    `;

    const [tot] = await q`select count(*)::int n from core.award_links`;
    const [lots] = await q`select count(distinct ted_lot_result_id)::int n from core.award_links`;
    const [cons] = await q`select count(distinct contract_id)::int n from core.award_links`;
    const [multi] = await q`
      select count(*)::int n from (
        select ted_lot_result_id from core.award_links
        group by 1 having count(*) > 1
      ) s`;
    const [prim] = await q`select count(*)::int n from core.award_links where is_primary`;
    const [buckets] = await q`
      select
        count(*) filter (where match_score >= 0.90::real)::int ge90,
        count(*) filter (where match_score >= 0.70::real and match_score < 0.90::real)::int ge70,
        count(*) filter (where match_score < 0.70::real)::int lt70
      from core.award_links`;

    const report: ReconcileReport = {
      links: tot!.n,
      tedLotsMatched: lots!.n,
      contractsMatched: cons!.n,
      tedLotsMultiMatch: multi!.n,
      primaryLinks: prim!.n,
      scoreBuckets: { ge90: buckets!.ge90, ge70: buckets!.ge70, lt70: buckets!.lt70 },
    };
    log(
      `links=${report.links} tedLots=${report.tedLotsMatched} contracts=${report.contractsMatched} ` +
        `multi=${report.tedLotsMultiMatch} primary=${report.primaryLinks} score[>=.9=${report.scoreBuckets.ge90} ` +
        `.7-.9=${report.scoreBuckets.ge70} <.7=${report.scoreBuckets.lt70}]`,
    );
    // Explicit cleanup also permits another rebuild within an enclosing
    // transaction (integration fixtures); ON COMMIT DROP protects error paths.
    await q`drop table _reconcile_ted, _reconcile_eli`;
    return report;
  });
}
