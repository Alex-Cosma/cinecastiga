import type { DbSql } from "@seap/db";

/**
 * Flag marts (red-flags Phase 4): recompute the read models over core.flags +
 * core.direct_acquisitions. Fills the previously-empty authority_concentration
 * and entity_top_partners from the DA pair spine, builds per-entity CRI
 * (entity_flags), and a browsable flag_instances explorer. Same plausibility
 * bound as the flag rules so corrupt values can't distort totals.
 */
const APPLICABLE = { authority: 5, supplier: 4 } as const;

export interface FlagMartsReport {
  authorityConcentration: number;
  entityTopPartners: number;
  entityFlags: number;
  flagInstances: number;
}

async function bound(sql: DbSql): Promise<number> {
  const r = (await sql`
    select value_num from core.risk_thresholds where key = 'da_max_plausible'
    order by valid_from desc limit 1
  `) as unknown as { value_num: string }[];
  return r[0] ? Number(r[0].value_num) : 2_000_000;
}

export async function runFlagMarts(
  sql: DbSql,
  opts: { log?: (m: string) => void } = {},
): Promise<FlagMartsReport> {
  const log = opts.log ?? (() => {});
  const b = await bound(sql);

  return sql.begin(async (q) => {
    // ── authority_concentration (all authorities with DA spend) ─────────────
    await q`truncate marts.authority_concentration`;
    await q`
      insert into marts.authority_concentration
        (authority_entity_id, distinct_suppliers, top_supplier_pct, hhi, total_ron)
      with per as (
        select authority_entity_id a, supplier_entity_id s, sum(closing_value) st
        from core.direct_acquisitions
        where authority_entity_id is not null and supplier_entity_id is not null
          and closing_value is not null and closing_value <= ${b}
        group by a, s
      ),
      agg as (
        select a, sum(st) total, count(*) sup, max(st) top, sum(power(st,2)) sq
        from per group by a
      )
      select a, sup, round(top/nullif(total,0),4), round(sq/nullif(power(total,2),0),4), total
      from agg where total > 0
    `;

    // ── entity_top_partners (top 5 counterparties per entity, both sides) ───
    await q`truncate marts.entity_top_partners`;
    await q`
      insert into marts.entity_top_partners
        (entity_id, role, partner_entity_id, rank, n, total_ron)
      with pair as (
        select authority_entity_id a, supplier_entity_id s, count(*) n, sum(closing_value) t
        from core.direct_acquisitions
        where authority_entity_id is not null and supplier_entity_id is not null
          and closing_value is not null and closing_value <= ${b}
        group by a, s
      ),
      sides as (
        select a entity_id, 'authority' role, s partner, n, t from pair
        union all
        select s, 'supplier', a, n, t from pair
      ),
      ranked as (
        select entity_id, role, partner, n, t,
          row_number() over (partition by entity_id, role order by t desc nulls last) rnk
        from sides
      )
      select entity_id, role, partner, rnk, n, t from ranked where rnk <= 5
    `;

    // ── entity_flags (CRI per entity+role) ──────────────────────────────────
    await q`truncate marts.entity_flags`;
    await q`
      insert into marts.entity_flags
        (entity_id, role, name_display, county, n_das, total_ron, cri, n_flags, flags)
      with base as (
        select authority_entity_id eid, 'authority' role, count(*) n, sum(closing_value) total
        from core.direct_acquisitions
        where authority_entity_id is not null and closing_value is not null and closing_value <= ${b}
        group by authority_entity_id
        union all
        select supplier_entity_id, 'supplier', count(*), sum(closing_value)
        from core.direct_acquisitions
        where supplier_entity_id is not null and closing_value is not null and closing_value <= ${b}
        group by supplier_entity_id
      ),
      daf_pivot as (
        select eid, role,
          count(*) filter (where flag_code = 'da_rapid') rapid_ct,
          count(*) filter (where flag_code = 'da_round') round_ct
        from (
          select da.authority_entity_id eid, 'authority' role, f.flag_code
          from core.flags f join core.direct_acquisitions da on da.id = f.subject_id
          where f.subject_type = 'da'
          union all
          select da.supplier_entity_id, 'supplier', f.flag_code
          from core.flags f join core.direct_acquisitions da on da.id = f.subject_id
          where f.subject_type = 'da'
        ) z where eid is not null group by eid, role
      ),
      ent_flag as (
        select subject_id eid, 'authority' role, 'da_concentration' code from core.flags where flag_code='da_concentration'
        union all select subject_id, 'supplier', 'da_dependence' from core.flags where flag_code='da_dependence'
        union all select distinct subject_id, 'authority', 'da_year_end' from core.flags where flag_code='da_year_end'
        union all select subject_id, 'authority', 'da_split' from core.flags where flag_code='da_split'
        union all select partner_id, 'supplier', 'da_split' from core.flags where flag_code='da_split'
      ),
      ecodes as (
        select eid, role, array_agg(distinct code) codes from ent_flag group by eid, role
      ),
      scored as (
        select b.eid, b.role, b.n, b.total,
          coalesce(ec.codes, array[]::text[]) ecodes,
          coalesce(dp.rapid_ct, 0) rapid_ct,
          coalesce(dp.round_ct, 0) round_ct
        from base b
        left join ecodes ec on ec.eid = b.eid and ec.role = b.role
        left join daf_pivot dp on dp.eid = b.eid and dp.role = b.role
      ),
      final as (
        select eid, role, n, total,
          ecodes
            || case when n >= 5 and rapid_ct::numeric/n > 0.25 then array['da_rapid'] else array[]::text[] end
            || case when n >= 5 and round_ct::numeric/n > 0.10 then array['da_round'] else array[]::text[] end
          as codes,
          case when role = 'authority' then ${APPLICABLE.authority}::int else ${APPLICABLE.supplier}::int end applicable
        from scored
      )
      select f.eid, f.role, e.name_display, e.county, f.n, f.total,
        round(coalesce(array_length(f.codes,1),0)::numeric / f.applicable, 4),
        coalesce(array_length(f.codes,1),0),
        to_jsonb(f.codes)
      from final f join core.entities e on e.id = f.eid
    `;

    // ── flag_instances (browsable): entity/pair flags + top per-DA examples ─
    await q`truncate marts.flag_instances`;
    await q`
      insert into marts.flag_instances
        (id, flag_code, subject_type, entity_id, entity_name, entity_county, partner_id, partner_name, severity, total_ron, period, evidence)
      select f.id, f.flag_code, f.subject_type,
        f.subject_id, e.name_display, e.county,
        f.partner_id, p.name_display,
        f.severity, nullif(f.evidence->>'total','')::numeric, f.period, f.evidence
      from core.flags f
      left join core.entities e on e.id = f.subject_id
      left join core.entities p on p.id = f.partner_id
      where f.subject_type in ('authority','supplier','pair')
    `;
    await q`
      insert into marts.flag_instances
        (id, flag_code, subject_type, entity_id, entity_name, entity_county, partner_id, partner_name, severity, total_ron, period, evidence)
      select f.id, f.flag_code, 'da',
        da.authority_entity_id, a.name_display, a.county,
        da.supplier_entity_id, s.name_display,
        f.severity, da.closing_value, f.period, f.evidence
      from (
        select *, row_number() over (partition by flag_code order by severity desc nulls last) rn
        from core.flags where subject_type = 'da'
      ) f
      join core.direct_acquisitions da on da.id = f.subject_id
      left join core.entities a on a.id = da.authority_entity_id
      left join core.entities s on s.id = da.supplier_entity_id
      where f.rn <= 500
    `;

    const [ac] = await q`select count(*)::int c from marts.authority_concentration`;
    const [tp] = await q`select count(*)::int c from marts.entity_top_partners`;
    const [ef] = await q`select count(*)::int c from marts.entity_flags`;
    const [fi] = await q`select count(*)::int c from marts.flag_instances`;
    log(
      `flag marts: authority_concentration=${ac!.c} entity_top_partners=${tp!.c} ` +
        `entity_flags=${ef!.c} flag_instances=${fi!.c}`,
    );
    return {
      authorityConcentration: ac!.c as number,
      entityTopPartners: tp!.c as number,
      entityFlags: ef!.c as number,
      flagInstances: fi!.c as number,
    };
  });
}
