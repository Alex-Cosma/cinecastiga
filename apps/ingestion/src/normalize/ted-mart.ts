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
        ted_lot_result_id, ted_notice_id, publication_number,
        buyer_entity_id, buyer_name, buyer_county,
        winner_names, winner_entity_ids, winner_countries, is_foreign,
        cpv_code, cpv_name, contract_nature, title,
        awarded_value, currency, award_date, publication_date, procedure_type,
        tenders_received, is_single_bidder, eu_funded,
        label, matched_contract_id, match_score
      )
      select
        tlr.id, tn.id, tn.publication_number,
        tn.buyer_entity_id, be.name_display, be.county,
        w.names, w.ids, w.countries, coalesce(w.is_foreign, false),
        tlr.cpv_code, cpv.name_ro, tlr.contract_nature, tlr.title,
        tlr.awarded_value, tlr.currency,
        to_char(tlr.contract_date, 'YYYY-MM-DD'),
        to_char(tn.publication_date, 'YYYY-MM-DD'),
        tn.procedure_type,
        tlr.tenders_received, tlr.is_single_bidder, tn.eu_funded,
        case when pl.contract_id is not null then 'also-in-seap' else 'ted-only' end,
        pl.contract_id, pl.match_score
      from core.ted_lot_results tlr
      join core.ted_notices tn on tn.id = tlr.ted_notice_id
      left join core.entities be on be.id = tn.buyer_entity_id
      left join core.cpv_codes cpv on cpv.code = tlr.cpv_code
      left join lateral (
        select
          array_agg(e.name_display order by e.name_display) names,
          array_agg(e.id order by e.name_display) ids,
          array_agg(distinct e.country_code) filter (where e.country_code is not null) countries,
          bool_or(e.is_foreign) is_foreign
        from core.ted_lot_winners tlw
        join core.entities e on e.id = tlw.entity_id
        where tlw.lot_result_id = tlr.id
      ) w on true
      left join lateral (
        select al.contract_id, al.match_score
        from core.award_links al
        where al.ted_lot_result_id = tlr.id and al.is_primary
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
      select distinct on (al.contract_id)
        al.contract_id, al.ca_notice_id, al.ted_lot_result_id, al.match_score,
        tlr.tenders_received, tlr.is_single_bidder
      from core.award_links al
      join core.ted_lot_results tlr on tlr.id = al.ted_lot_result_id
      where al.is_primary and al.match_score >= 0.9
        and (tlr.tenders_received is not null or tlr.is_single_bidder is not null)
      order by al.contract_id, al.match_score desc, al.ted_lot_result_id
    `;

    // Headline stats — TED-scoped, never blended.
    await q`
      insert into marts.ted_stats (metric, dimension, n, total_ron)
      select 'total', 'all', count(*), sum(awarded_value) from marts.ted_awards`;
    await q`
      insert into marts.ted_stats (metric, dimension, n, total_ron)
      select 'label', label, count(*), sum(awarded_value)
      from marts.ted_awards group by label`;
    await q`
      insert into marts.ted_stats (metric, dimension, n, total_ron)
      select 'single_bidder', case when is_single_bidder then 'yes' else 'no' end,
             count(*), sum(awarded_value)
      from marts.ted_awards where is_single_bidder is not null
      group by is_single_bidder`;
    // Foreign spend by winner country (only the foreign-won awards).
    await q`
      insert into marts.ted_stats (metric, dimension, n, total_ron)
      select 'country', c, count(*), sum(awarded_value)
      from marts.ted_awards ta, unnest(coalesce(ta.winner_countries, '{}')) c
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
