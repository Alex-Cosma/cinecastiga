import type { DbSql } from "./client.js";

type Query = DbSql | Parameters<Parameters<DbSql['begin']>[1]>[0];

/**
 * marts.agg_authority_cpv_year (authority_id, y, src, cpv2): every row of the Ask population by its buying institution,
 * year, channel and CPV division, with the exact sum (v) and the number of records (n). The source of /harta, the value
 * per inhabitant of a county or a UAT (owner, 6 November 2026): which institutions count is a list of ids the web
 * resolves (per-capita.ts: the strictly identified town halls and county councils first; schools, hospitals and the
 * other kinds of authority-kind.ts later), so a new kind needs no rebuild; years and divisions are summed at read time,
 * so any set of years or of divisions is a sum of these rows.
 *
 * The population is agg_map_year's, the per-inhabitant map of Întreabă (buildAskMapRollup): accepted DAs with
 * 0 < closing_value <= 2,000,000 lei (the analysis ceiling, ASK_ROLLUP_DA_CEILING) and contract allocations with
 * closing_value > 0 (consortium shares and the contract ceiling are applied when contract_transactions is built), so
 * a county's sum for a year equals that map's to the leu. y is substr(finalization_date, 1, 4), null when undated;
 * cpv2 the first two digits of the code, null without one. Rows without an institution are left out (no map holds them).
 *
 * The full CPV group (three digits) would hold 3.77M rows on the local copy of 6 November 2026, the division 2.06M,
 * so the division is the grain; a drill below it reads the transaction marts. Built in the transaction that loads
 * da_transactions, after the Ask rollups: its comment names agg_cpv_year's oid, which the web probes (mapCpvRollupReady)
 * so a table left behind by an older build is never read beside newer ones.
 */
export const MAP_CPV_TABLE = 'agg_authority_cpv_year';

export async function buildMapCpvRollup(q: Query): Promise<number> {
  await q`drop table if exists marts.agg_authority_cpv_year`;
  const created = await q`
    create table marts.agg_authority_cpv_year as
    select x.authority_id, substr(x.finalization_date, 1, 4) y, x.src, substr(x.cpv_code, 1, 2) cpv2,
           sum(x.closing_value) v, count(*) n
    from (
      select authority_id, cpv_code, finalization_date, closing_value, 'da'::text src
      from marts.da_transactions where closing_value > 0 and closing_value <= 2000000 and authority_id is not null
      union all
      select authority_id, cpv_code, finalization_date, closing_value, 'contracts'
      from marts.contract_transactions where closing_value > 0 and authority_id is not null
    ) x
    group by 1, 2, 3, 4
  `;
  // The web reads one kind's institutions once per build (a few thousand ids, ~570k rows): a plain index is 97 ms
  // against 50 ms index-only on the local copy, at 14 MB instead of 112 MB (the table: 132 MB).
  await q`create index agg_authority_cpv_year_authority_idx on marts.agg_authority_cpv_year (authority_id)`;
  await q`analyze marts.agg_authority_cpv_year`;
  const [twin] = await q`select to_regclass('marts.agg_cpv_year')::oid::text oid`;
  await q.unsafe(`comment on table marts.agg_authority_cpv_year is 'agg_cpv_year ${Number(twin?.['oid'] ?? 0)}'`);
  return created.count;
}
