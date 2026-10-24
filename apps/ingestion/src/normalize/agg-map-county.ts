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
