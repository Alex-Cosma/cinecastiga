import type { DbSql } from "@seap/db";
import { METHODOLOGY_VERSION } from "./methodology.js";

/**
 * DA red-flag build (red-flags DEC-005). Truncate + recompute `core.flags` from
 * `core.direct_acquisitions`. Each rule is one SQL statement writing binary
 * flag instances with evidence. Legal ceilings come from `core.risk_thresholds`
 * (date-aware, DEC-006); statistical cutoffs are read from the same table with
 * documented fallbacks. DA acquisition type is inferred from CPV (division 45 =
 * works) since the imported DA rows carry no explicit type.
 *
 * NOTE: snapshot data is 2018–2020, so a single pre-2023 ceiling applies; live
 * data spanning the 2023 raise will need a per-row date join (TODO).
 */
const V = METHODOLOGY_VERSION;

const DEFAULTS: Record<string, number> = {
  // A DA is legally capped near the works ceiling (441.730); closing values far
  // above are corrupt source data (~275 rows carry billions). Exclude them from
  // every rule so one garbage row can't dominate a concentration total.
  da_max_plausible: 2_000_000,
  da_rapid_hours: 1,
  da_conc_top_pct: 0.6,
  da_conc_min_suppliers: 3,
  da_conc_min_total: 100_000,
  da_dep_top_pct: 0.85,
  da_dep_min_total: 50_000,
  da_split_min_count: 3,
  da_round_floor_pct: 0.9,
  da_year_end_share: 0.35,
  da_year_end_min_total: 100_000,
};

export interface FlagsReport {
  [code: string]: number;
}

async function num(sql: DbSql, key: string, fallback: number): Promise<number> {
  const rows = (await sql`
    select value_num from core.risk_thresholds where key = ${key}
    order by valid_from desc limit 1
  `) as unknown as { value_num: string }[];
  return rows[0] ? Number(rows[0].value_num) : fallback;
}

/** Ceiling applicable to the snapshot period (a 2019 reference date). */
async function ceiling(sql: DbSql, key: string, fallback: number): Promise<number> {
  const rows = (await sql`
    select value_num from core.risk_thresholds
    where key = ${key} and valid_from <= '2019-01-01'::timestamptz
      and (valid_to is null or valid_to > '2019-01-01'::timestamptz)
    order by valid_from desc limit 1
  `) as unknown as { value_num: string }[];
  return rows[0] ? Number(rows[0].value_num) : fallback;
}

export async function runFlags(
  sql: DbSql,
  opts: { log?: (m: string) => void } = {},
): Promise<FlagsReport> {
  const log = opts.log ?? (() => {});
  const t = async (k: string) => num(sql, k, DEFAULTS[k]!);

  const goods = await ceiling(sql, "da_ceiling_goods_services", 132_519);
  const works = await ceiling(sql, "da_ceiling_works", 441_730);
  const maxPlausible = await t("da_max_plausible");
  const rapidHours = await t("da_rapid_hours");
  const concTopPct = await t("da_conc_top_pct");
  const concMinSup = await t("da_conc_min_suppliers");
  const concMinTot = await t("da_conc_min_total");
  const depTopPct = await t("da_dep_top_pct");
  const depMinTot = await t("da_dep_min_total");
  const splitMinN = await t("da_split_min_count");
  const roundFloor = await t("da_round_floor_pct");
  const yeShare = await t("da_year_end_share");
  const yeMinTot = await t("da_year_end_min_total");
  log(
    `thresholds: goods=${goods} works=${works} rapidH=${rapidHours} concTop=${concTopPct} ` +
      `depTop=${depTopPct} splitN=${splitMinN} roundFloor=${roundFloor} yeShare=${yeShare}`,
  );

  await sql`truncate core.flags`;

  // ── da_rapid (per DA) ────────────────────────────────────────────────────
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    select 'da', id, 'da_rapid', to_char(finalization_date,'YYYY'), true,
      greatest(0, least(1, 1 - (extract(epoch from (finalization_date - publication_date))/3600) / ${rapidHours}::float8)),
      jsonb_build_object(
        'minutes', round(extract(epoch from (finalization_date - publication_date))/60)::int,
        'closing', closing_value),
      ${V}
    from core.direct_acquisitions
    where publication_date is not null and finalization_date is not null
      and finalization_date >= publication_date
      and (closing_value is null or closing_value <= ${maxPlausible})
      and extract(epoch from (finalization_date - publication_date)) < ${rapidHours}::float8 * 3600
  `;

  // da_estimate_match was DROPPED after calibration: closing == estimate holds
  // for ~96% of DAs (the catalog-price process norm), so it carries no signal.

  // ── da_round: closing just under the applicable ceiling (per DA) ─────────
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    select 'da', id, 'da_round', to_char(finalization_date,'YYYY'), true,
      least(1, closing_value / ceil),
      jsonb_build_object('closing', closing_value, 'ceiling', ceil, 'type', typ), ${V}
    from (
      select id, finalization_date, closing_value,
        case when left(cpv_code,2) = '45' then ${works}::numeric else ${goods}::numeric end as ceil,
        case when left(cpv_code,2) = '45' then 'lucrari' else 'produse/servicii' end as typ
      from core.direct_acquisitions
      where closing_value is not null and closing_value > 0 and closing_value <= ${maxPlausible}
    ) d
    where closing_value >= ${roundFloor}::float8 * ceil and closing_value < ceil
  `;

  // ── da_split: sub-ceiling DAs from a pair summing past ceiling (per pair) ─
  await sql`
    insert into core.flags (subject_type, subject_id, partner_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with da as (
      select authority_entity_id a, supplier_entity_id s,
        extract(year from finalization_date)::int y, closing_value cv,
        case when left(cpv_code,2) = '45' then ${works}::numeric else ${goods}::numeric end ceil
      from core.direct_acquisitions
      where authority_entity_id is not null and supplier_entity_id is not null
        and closing_value is not null and closing_value > 0 and closing_value <= ${maxPlausible}
        and finalization_date is not null
    ),
    g as (
      select a, s, y, count(*) n, sum(cv) total, max(ceil) ceil
      from da where cv < ceil
      group by a, s, y
      having count(*) >= ${splitMinN} and sum(cv) > max(ceil)
    )
    select 'pair', a, s, 'da_split', y::text, true,
      least(1, (total / ceil) / 3),
      jsonb_build_object('year', y, 'count', n, 'total', total, 'ceiling', ceil), ${V}
    from g
  `;

  // ── da_concentration: one supplier captures an authority (per authority) ─
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with per as (
      select authority_entity_id a, supplier_entity_id s, sum(closing_value) st
      from core.direct_acquisitions
      where authority_entity_id is not null and supplier_entity_id is not null
        and closing_value is not null and closing_value <= ${maxPlausible}
      group by a, s
    ),
    agg as (
      select a, sum(st) total, count(*) suppliers, max(st) top, sum(power(st,2)) sumsq
      from per group by a
    )
    select 'authority', a, 'da_concentration', 'all', true,
      least(1, top / nullif(total,0)),
      jsonb_build_object('total', total, 'suppliers', suppliers,
        'top_supplier_pct', round(top/nullif(total,0),4),
        'hhi', round(sumsq/nullif(power(total,2),0),4)), ${V}
    from agg
    where total >= ${concMinTot} and suppliers >= ${concMinSup}
      and top/nullif(total,0) >= ${concTopPct}
  `;

  // ── da_dependence: supplier lives off one authority (per supplier) ───────
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with per as (
      select supplier_entity_id s, authority_entity_id a, sum(closing_value) st
      from core.direct_acquisitions
      where authority_entity_id is not null and supplier_entity_id is not null
        and closing_value is not null and closing_value <= ${maxPlausible}
      group by s, a
    ),
    agg as (
      select s, sum(st) total, count(*) authorities, max(st) top from per group by s
    )
    select 'supplier', s, 'da_dependence', 'all', true,
      least(1, top / nullif(total,0)),
      jsonb_build_object('total', total, 'authorities', authorities,
        'top_authority_pct', round(top/nullif(total,0),4)), ${V}
    from agg
    where total >= ${depMinTot} and top/nullif(total,0) >= ${depTopPct}
  `;

  // ── da_year_end: December spend spike (per authority-year) ────────────────
  await sql`
    insert into core.flags (subject_type, subject_id, flag_code, period, triggered, severity, evidence, methodology_version)
    with m as (
      select authority_entity_id a, extract(year from finalization_date)::int y,
        sum(closing_value) tot,
        sum(case when extract(month from finalization_date) = 12 then closing_value else 0 end) dec
      from core.direct_acquisitions
      where authority_entity_id is not null and closing_value is not null
        and closing_value <= ${maxPlausible} and finalization_date is not null
      group by a, y
    )
    select 'authority', a, 'da_year_end', y::text, true,
      least(1, dec / nullif(tot,0)),
      jsonb_build_object('year', y, 'total', tot, 'december', dec,
        'december_pct', round(dec/nullif(tot,0),4)), ${V}
    from m
    where tot >= ${yeMinTot} and dec/nullif(tot,0) >= ${yeShare}
  `;

  const rows = (await sql`
    select flag_code, count(*)::int c from core.flags group by flag_code order by flag_code
  `) as unknown as { flag_code: string; c: number }[];
  const report: FlagsReport = {};
  for (const r of rows) report[r.flag_code] = r.c;
  return report;
}
