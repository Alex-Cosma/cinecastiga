import { SEAT_BUCURESTI, SEAT_CLASSES, type DbSql } from "@seap/db";
type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

/**
 * marts.agg_map_county: the unfiltered national map of Ask (both channels,
 * closing_value > 0; v_plaf/n_plaf with the 2M DA analysis ceiling, v_all/n_all
 * without), per buyer county. Since plan F5 also split by the seat of the
 * winning firm against that county (packages/db/src/firm-seat.ts):
 * v_plaf_same … n_all_unknown, from entity_profile.seat_county/seat_source,
 * which the marts stage builds before this one. same + other + foreign +
 * unknown = the county; bucuresti is part of other. A DA without supplier, and
 * a firm without supplier profile (only DAs above the ceiling: v_all), count
 * as unknown, as a live join on entity_profile does. Class names and the
 * ceiling are literals, as in the other agg_* builds.
 */
export async function buildAggMapCounty(q: TransactionSql): Promise<void> {
  const seatColumns = (["plaf", "all"] as const).flatMap((scope) => SEAT_CLASSES.flatMap((seat) => {
    const where = [scope === "plaf" ? "plaf" : null, seat === "bucuresti" ? "buc" : `seat = '${seat}'`].filter(Boolean).join(" and ");
    return [`coalesce(sum(cv) filter (where ${where}), 0) v_${scope}_${seat}`, `count(*) filter (where ${where}) n_${scope}_${seat}`];
  }));
  await q.unsafe(`
    create table marts.agg_map_county as
    select county,
           coalesce(sum(cv) filter (where plaf), 0) v_plaf, count(*) filter (where plaf) n_plaf,
           coalesce(sum(cv), 0) v_all, count(*) n_all,
           ${seatColumns.join(",\n           ")}
    from (
      select x.county, x.cv, x.plaf,
             case when ep.seat_source = 'foreign' then 'foreign'
                  when ep.seat_county is null then 'unknown'
                  when ep.seat_county = x.county then 'same' else 'other' end seat,
             coalesce(ep.seat_county = '${SEAT_BUCURESTI}' and x.county <> '${SEAT_BUCURESTI}', false) buc
      from (
        select county, supplier_id, closing_value cv, (closing_value <= 2000000) plaf
        from marts.da_transactions where closing_value > 0
        union all
        select county, supplier_id, closing_value, true from marts.contract_transactions where closing_value > 0
      ) x
      left join marts.entity_profile ep on ep.entity_id = x.supplier_id and ep.role = 'supplier'
    ) x where county is not null group by county
  `);
  await q`alter table marts.agg_map_county add primary key (county)`;
}

/**
 * marts.agg_map_county_top: the county card of the map (plan F5, map final
 * §3.11, step 8), "Cel mai mare cumpărător" and "Cea mai mare înregistrare",
 * per buyer county, for the unfiltered maps. One row per scope ('plaf' with
 * the 2M DA analysis ceiling, as every Ask aggregate; 'all' without, as v_all),
 * channel ('all', 'da', 'contracts') and county: the county's v/n (= the
 * agg_map_county value for channel 'all'), the authority with the largest sum
 * (ties: the lower id) and the largest single record with its source id
 * (sicap_da_id or contract_id, as the sources link it; ties: a contract before
 * a DA, then the lower authority and record id). The authority name is
 * core.entities.name_display, the name the transaction rows carry. One
 * grouping of the union by (county, channel, authority); the record id is then
 * looked up by authority and value (da_tx_authority_value_idx).
 */
export async function buildAggMapCountyTop(q: TransactionSql): Promise<number> {
  await q`drop table if exists marts.agg_map_county_top`;
  const created = await q`
    create table marts.agg_map_county_top as
    with g as materialized (
      select county, src, authority_id,
             coalesce(sum(cv) filter (where plaf), 0) v_plaf, count(*) filter (where plaf) n_plaf,
             sum(cv) v_all, count(*) n_all,
             max(cv) filter (where plaf) max_plaf, max(cv) max_all
      from (
        select county, 'da'::text src, authority_id, closing_value cv, (closing_value <= 2000000) plaf
        from marts.da_transactions where closing_value > 0 and county is not null
        union all
        select county, 'contracts', authority_id, closing_value, true
        from marts.contract_transactions where closing_value > 0 and county is not null
      ) x group by county, src, authority_id
    ),
    s as (
      select sc.scope, ch.channel, g.county, g.src, g.authority_id,
             case when sc.scope = 'plaf' then g.v_plaf else g.v_all end v,
             case when sc.scope = 'plaf' then g.n_plaf else g.n_all end n,
             case when sc.scope = 'plaf' then g.max_plaf else g.max_all end mx
      from g cross join (values ('plaf'), ('all')) sc(scope)
      cross join lateral (values ('all'), (g.src)) ch(channel)
    ),
    total as (select scope, channel, county, sum(v) v, sum(n) n from s group by 1, 2, 3 having sum(n) > 0),
    buyer as (
      select distinct on (scope, channel, county) scope, channel, county, authority_id, v, n
      from (select scope, channel, county, authority_id, sum(v) v, sum(n) n from s
            where authority_id is not null group by 1, 2, 3, 4) b
      where n > 0
      order by scope, channel, county, v desc, authority_id),
    record as (
      select distinct on (scope, channel, county) scope, channel, county, src, authority_id, mx
      from s where mx is not null
      order by scope, channel, county, mx desc, src, authority_id nulls last),
    da_ref as (
      select d.authority_id, d.county, d.closing_value, min(d.sicap_da_id) id
      from marts.da_transactions d
      join (select distinct authority_id, county, mx from record where src = 'da') r
        on d.authority_id = r.authority_id and d.county = r.county and d.closing_value = r.mx
      group by 1, 2, 3),
    contract_ref as (
      select c.authority_id, c.county, c.closing_value, min(c.contract_id) id
      from marts.contract_transactions c
      join (select distinct authority_id, county, mx from record where src = 'contracts') r
        on c.authority_id = r.authority_id and c.county = r.county and c.closing_value = r.mx
      group by 1, 2, 3)
    select t.scope, t.channel, t.county, t.v, t.n,
           b.authority_id top_buyer_id, e.name_display top_buyer_name, b.v top_buyer_v, b.n top_buyer_n,
           r.src top_record_src, coalesce(dr.id, cr.id) top_record_id, r.mx top_record_v
    from total t
    left join buyer b on (b.scope, b.channel, b.county) = (t.scope, t.channel, t.county)
    left join core.entities e on e.id = b.authority_id
    left join record r on (r.scope, r.channel, r.county) = (t.scope, t.channel, t.county)
    left join da_ref dr on r.src = 'da' and (dr.authority_id, dr.county, dr.closing_value) = (r.authority_id, r.county, r.mx)
    left join contract_ref cr on r.src = 'contracts' and (cr.authority_id, cr.county, cr.closing_value) = (r.authority_id, r.county, r.mx)
  `;
  await q`alter table marts.agg_map_county_top add primary key (scope, channel, county)`;
  return created.count;
}
