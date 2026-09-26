import type { DbSql } from "@seap/db";
import { DA_CEILING_SEED_ROWS, DA_CPV_TYPE_PATTERN } from "@seap/domain";

type Fragment = ReturnType<DbSql>;

/** Shared by the annual flags and the rolling Radiografie detector. */
export function daThresholdKeySql(sql: DbSql, cpv: Fragment, acquisitionType: Fragment): Fragment {
  return sql`case
    when lower(btrim(${acquisitionType})) in ('lucrari', 'lucrări') then 'da_ceiling_works'
    when lower(btrim(${acquisitionType})) in ('furnizare', 'produse', 'servicii') then 'da_ceiling_goods_services'
    when nullif(btrim(${acquisitionType}), '') is not null then null
    when btrim(${cpv}) ~ ${DA_CPV_TYPE_PATTERN}
    then case when left(btrim(${cpv}), 2) = '45'
      then 'da_ceiling_works' else 'da_ceiling_goods_services' end
    else null end`;
}

/** Publication is the available initiation proxy; missing publication is explicit in evidence. */
export function daThresholdDateSql(sql: DbSql, publication: Fragment, finalization: Fragment): Fragment {
  return sql`(coalesce(${publication}, ${finalization}) at time zone 'Europe/Bucharest')::date`;
}

/** Fail before destructive rebuild steps if legacy/overlapping/missing eras remain. */
export async function assertCeilingEras(sql: DbSql): Promise<number> {
  const rows = (await sql`
    select key, to_char(valid_from at time zone 'UTC', 'YYYY-MM-DD') valid_from,
      to_char(valid_to at time zone 'UTC', 'YYYY-MM-DD') valid_to, value_num::text value_num
    from core.risk_thresholds where key in ('da_ceiling_goods_services', 'da_ceiling_works')
  `) as unknown as { key: string; valid_from: string; valid_to: string | null; value_num: string }[];
  if (rows.length !== DA_CEILING_SEED_ROWS.length || !DA_CEILING_SEED_ROWS.every((expected) =>
    rows.some((r) => r.key === expected.key && r.valid_from === expected.validFrom &&
      r.valid_to === expected.validTo && Number(r.value_num) === Number(expected.valueNum)))) {
    throw new Error("DA ceiling eras are missing or outdated — run `pnpm --filter ingestion seed-thresholds` before rebuilding flags or Radiografie");
  }
  return rows.length;
}
