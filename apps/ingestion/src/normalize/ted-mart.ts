import type { DbSql } from "@seap/db";

/**
 * TED award mart build — the LABELED, NO-BLEND surfacing of TED into the app.
 * Rebuilds `marts.ted_awards` (per-lot read model) + `marts.ted_stats` (headline)
 * from core.ted_* + core.award_links (primary crosswalk) + core.entities. Fully
 * derived (truncate + rebuild); independent of the e-licitatie marts build, so it
 * can run standalone. TED value is NEVER summed into national_stats — the same
 * award (also-in-seap) can't be double-counted.
 */
export interface TedMartReport {
  tedAwards: number;
  alsoInSeap: number;
  tedOnly: number;
  foreign: number;
  singleBidder: number;
  /** e-licitatie contracts that inherited competition data from their TED twin. */
  contractsWithCompetition: number;
  contractsSingleBidder: number;
}

/** A contract inherits a count only when its eligible confirmed links agree. */
type TedSql = DbSql | Parameters<Parameters<DbSql["begin"]>[1]>[0];
export function tedCompetitionRows(sql: TedSql, tables: { links?: ReturnType<DbSql>; results?: ReturnType<DbSql> } = {}) {
  return sql`
      with eligible as (
        select al.contract_id, al.ca_notice_id, al.ted_lot_result_id, al.match_score,
               tlr.tenders_received
        from ${tables.links ?? sql`core.award_links`} al
        join ${tables.results ?? sql`core.ted_lot_results`} tlr on tlr.id = al.ted_lot_result_id
        where al.is_primary and al.match_score >= 0.9::real
          and tlr.amount_details->>'matchEligible' = 'true'
          and tlr.currency = 'RON'
          and tlr.amount_kind in ('payable', 'contract_value')
      ), consistent as (
        select contract_id from eligible group by contract_id
        having count(tenders_received) = count(*) and min(tenders_received) >= 0
          and min(tenders_received) = max(tenders_received)
      )
      select distinct on (e.contract_id)
        e.contract_id, e.ca_notice_id, e.ted_lot_result_id, e.match_score,
        e.tenders_received, e.tenders_received = 1 as is_single_bidder
      from eligible e join consistent c on c.contract_id = e.contract_id
      order by e.contract_id, e.match_score desc, e.ted_lot_result_id
  `;
}

export async function runTedMart(
  sql: DbSql,
  opts: { log?: (m: string) => void } = {},
): Promise<TedMartReport> {
  const log = opts.log ?? (() => {});

  const report = await sql.begin(async (q) => {
    await q`truncate marts.ted_awards, marts.ted_stats, marts.contract_competition`;

    // One row per TED lot-award, denormalized. Winners aggregated (consortium →
    // arrays); is_foreign = any winner non-RO. label from the primary crosswalk.
    await q`
      insert into marts.ted_awards (
        ted_lot_result_id, ted_notice_id, publication_number, lot_id, winner_selection_status,
        buyer_entity_id, buyer_name, buyer_county,
        winner_names, winner_entity_ids, winner_countries, is_foreign,
        cpv_code, cpv_name, contract_nature, title,
        awarded_value, amount_kind, amount_details, currency, award_date, publication_date, procedure_type,
        tenders_received, is_single_bidder, eu_funded,
        label, matched_contract_id, match_score
      )
      select
        tlr.id, tn.id, tn.publication_number, tlr.lot_id, tlr.winner_selection_status,
        tn.buyer_entity_id, be.name_display, be.county,
        w.names, w.ids, w.countries, coalesce(w.is_foreign, false),
        tlr.cpv_code, cpv.name_ro, tlr.contract_nature, tlr.title,
        tlr.awarded_value, tlr.amount_kind, tlr.amount_details, tlr.currency,
        to_char(tlr.contract_date, 'YYYY-MM-DD'),
        to_char(tn.publication_date, 'YYYY-MM-DD'),
        tn.procedure_type,
        tlr.tenders_received, tlr.is_single_bidder, tn.eu_funded,
        case when pl.contract_id is null then 'ted-only'
          when pl.match_score >= 0.9::real and tlr.amount_details->>'matchEligible' = 'true' then 'also-in-seap'
          else 'possible-match' end,
        pl.contract_id, pl.match_score
      from core.ted_lot_results tlr
      join core.ted_notices tn on tn.id = tlr.ted_notice_id
      left join core.entities be on be.id = tn.buyer_entity_id
      left join core.cpv_codes cpv on cpv.code = tlr.cpv_code
      left join lateral (
        select
          array_agg(e.name_display order by e.name_display, e.id) names,
          array_agg(e.id order by e.name_display, e.id) ids,
          array_agg(e.country_code order by e.name_display, e.id) countries,
          bool_or(e.is_foreign) is_foreign
        from core.ted_lot_winners tlw
        join core.entities e on e.id = tlw.entity_id
        where tlw.lot_result_id = tlr.id
      ) w on true
      left join lateral (
        select al.contract_id, al.match_score
        from core.award_links al
        where al.ted_lot_result_id = tlr.id and al.is_primary
        order by al.match_score desc, al.contract_id
        limit 1
      ) pl on true
    `;

    // Competition inheritance: e-licitatie contracts adopt tenders_received /
    // is_single_bidder from their TED twin — CONFIRMED links only (is_primary,
    // score ≥ 0.9; the tier human-validated on a stratified sample 2026-07-24).
    // Lower tiers link the right procedure but too often the wrong lot (pharma
    // frameworks), so they must never surface as fact. Best link per contract.
    await q`
      insert into marts.contract_competition
        (contract_id, ca_notice_id, ted_lot_result_id, match_score,
         tenders_received, is_single_bidder)
      ${tedCompetitionRows(q)}
    `;

    // These are publication-result counts, never payment or spend totals.
    // Offer values/ranges/ceilings and currencies are deliberately not summed.
    await q`
      insert into marts.ted_stats (metric, dimension, n, total_ron)
      select 'total', 'all', count(*), null::numeric from marts.ted_awards
      union all select 'total', 'notices', count(distinct ted_notice_id), null::numeric from marts.ted_awards
      union all select 'total', 'foreign', count(*), null::numeric from marts.ted_awards where is_foreign
      union all select 'total', 'legacy', count(*), null::numeric from marts.ted_awards where amount_kind is null
      union all select 'total', 'missing_winners', count(*), null::numeric from marts.ted_awards where coalesce(cardinality(winner_entity_ids), 0) = 0`;
    await q`
      insert into marts.ted_stats (metric, dimension, n, total_ron)
      select 'label', label, count(*), null::numeric from marts.ted_awards group by label`;
    await q`
      insert into marts.ted_stats (metric, dimension, n, total_ron)
      select 'single_bidder', case when is_single_bidder is null then 'unknown' when is_single_bidder then 'yes' else 'no' end,
             count(*), null::numeric from marts.ted_awards group by is_single_bidder`;
    await q`
      insert into marts.ted_stats (metric, dimension, n, total_ron)
      select 'amount_kind', coalesce(amount_kind, 'legacy_unknown'), count(*), null::numeric
      from marts.ted_awards group by amount_kind`;
    // A multinational consortium can occur in several country buckets, but only
    // once within each country. The foreign headline counts distinct result rows.
    await q`
      insert into marts.ted_stats (metric, dimension, n, total_ron)
      select 'country', c, count(*), null::numeric
      from marts.ted_awards ta
      cross join lateral (select distinct unnest(ta.winner_countries) c) countries
      where ta.is_foreign and c <> 'RO'
      group by c`;

    const one = async (where: string): Promise<number> => {
      const rows = (await q.unsafe(
        `select count(*)::int n from marts.ted_awards ${where}`,
      )) as unknown as { n: number }[];
      return rows[0]?.n ?? 0;
    };
    const cc = (await q`
      select count(*)::int n, count(*) filter (where is_single_bidder)::int sb
      from marts.contract_competition
    `) as unknown as { n: number; sb: number }[];
    return {
      tedAwards: await one(""),
      alsoInSeap: await one("where label='also-in-seap'"),
      tedOnly: await one("where label='ted-only'"),
      foreign: await one("where is_foreign"),
      singleBidder: await one("where is_single_bidder"),
      contractsWithCompetition: cc[0]?.n ?? 0,
      contractsSingleBidder: cc[0]?.sb ?? 0,
    };
  });

  log(
    `ted mart: ${report.tedAwards} awards (also-in-seap=${report.alsoInSeap}, ted-only=${report.tedOnly}), ` +
      `foreign=${report.foreign}, single-bidder=${report.singleBidder}; ` +
      `contract competition inherited=${report.contractsWithCompetition} (single-bidder=${report.contractsSingleBidder})`,
  );
  return report;
}
