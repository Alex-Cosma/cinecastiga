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

  await sql`set work_mem = '512MB'`;
  // Hard safety: a runaway join ERRORS instead of filling the disk (we hit that
  // twice — high-degree buyers/suppliers Cartesian-explode a range-only join).
  // 80GB: the log-bucket ±1 probe join legitimately spills more than the old
  // exact-value join did (30GB tripped it); disk has >100GB free.
  await sql`set temp_file_limit = '80GB'`;
  await sql`truncate core.award_links restart identity`;
  log(`matching (valueTol=${vtol}, dateTolDays=${dtol}) …`);

  // Two-sided projection joined on a COMPOSITE EQUI KEY: (buyer entity, WINNER
  // entity, value bucket). All three must be equalities for the hash join to stay
  // bounded: buyer+bucket alone Cartesian-explodes on value-clustered buyers
  // (pharma frameworks put thousands of same-magnitude awards inside one ±1%
  // band — that blew an 80GB temp_file_limit), and a range-only value join has
  // no equi key at all. With the winner in the key, the former EXISTS winner
  // check is implied and dropped; consortium pairs (two shared winners) dedupe
  // via ON CONFLICT.
  //
  // The bucket is LOGARITHMIC: floor(ln(value) / ln(1 + vtol)). Each bucket spans
  // exactly one tolerance step, so any pair within ±vtol lands in the same or an
  // adjacent bucket — the TED side probes b-1/b/b+1 (still an equi hash key, 3×
  // probes) and the precise ±vtol WHERE below makes the actual decision. (The old
  // round-to-the-leu bucket demanded values equal to the leu, which made valueTol
  // dead code and value_diff_pct identically 0 — see docs/RECONCILE-FINDINGS.md.)
  await sql`
    insert into core.award_links
      (ted_lot_result_id, contract_id, ted_notice_id, ca_notice_id,
       match_score, match_method, value_diff_pct, date_diff_days, evidence)
    with ted as (
      select tlr.id ted_lot_result_id, tlr.ted_notice_id, tn.publication_number,
             tn.buyer_entity_id, tlr.awarded_value, tlr.contract_date, tlr.cpv_code,
             lower(unaccent(coalesce(tlr.title, ''))) title_folded,
             floor(ln(tlr.awarded_value) / ln(1 + ${vtol}::float8))::bigint vbucket
      from core.ted_lot_results tlr
      join core.ted_notices tn on tn.id = tlr.ted_notice_id
      where tn.buyer_entity_id is not null
        and tlr.awarded_value is not null and tlr.awarded_value > 0
        and tlr.contract_date is not null
    ),
    eli as (
      select c.id contract_id, c.ca_notice_id, c.contract_value, c.contract_date,
             aw.authority_entity_id, aw.cpv_code,
             lower(unaccent(c.title || ' ' || coalesce(c.lots_caption, ''))) title_folded,
             floor(ln(c.contract_value) / ln(1 + ${vtol}::float8))::bigint vbucket
      from core.contracts c
      join core.awards aw on aw.ca_notice_id = c.ca_notice_id
      where c.contract_value is not null and c.contract_value > 0
        and c.contract_date is not null
        and aw.authority_entity_id is not null
        and (c.currency is null or c.currency ilike '%ron%')
    )
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
    from ted t
    join core.ted_lot_winners tlw on tlw.lot_result_id = t.ted_lot_result_id
    cross join lateral (values (t.vbucket - 1), (t.vbucket), (t.vbucket + 1)) probe(b)
    join core.contract_winners cw on cw.entity_id = tlw.entity_id
    join eli e
      on e.contract_id = cw.contract_id
     and e.authority_entity_id = t.buyer_entity_id
     and e.vbucket = probe.b
    cross join lateral (select similarity(t.title_folded, e.title_folded) tsim) sim
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
  await sql`
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

  const [tot] = await sql`select count(*)::int n from core.award_links`;
  const [lots] = await sql`select count(distinct ted_lot_result_id)::int n from core.award_links`;
  const [cons] = await sql`select count(distinct contract_id)::int n from core.award_links`;
  const [multi] = await sql`
    select count(*)::int n from (
      select ted_lot_result_id from core.award_links
      group by 1 having count(*) > 1
    ) s`;
  const [prim] = await sql`select count(*)::int n from core.award_links where is_primary`;
  const [buckets] = await sql`
    select
      count(*) filter (where match_score >= 0.90)::int ge90,
      count(*) filter (where match_score >= 0.70 and match_score < 0.90)::int ge70,
      count(*) filter (where match_score < 0.70)::int lt70
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
  return report;
}
