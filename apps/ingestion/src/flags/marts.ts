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
  daTransactions: number;
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
    // NOTE: authority_concentration + entity_top_partners are now owned by
    // `runMarts` (built from the DA + award pair spine, bounded). They are NOT
    // rebuilt here — doing so would clobber the award-inclusive versions with a
    // DA-only one. This job owns only the flag-specific marts below.

    // ── entity_flags (CRI per entity+role) ──────────────────────────────────
    await q`truncate marts.entity_flags`;
    await q`
      insert into marts.entity_flags
        (entity_id, role, name_display, cui_canonical, county, n_das, total_ron, cri, n_flags, flags)
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
      select f.eid, f.role, e.name_display, e.cui_canonical, e.county, f.n, f.total,
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
    // ── per-award flags (award_no_competition / award_single_bid): top examples ─
    await q`
      insert into marts.flag_instances
        (id, flag_code, subject_type, entity_id, entity_name, entity_county, partner_id, partner_name, severity, total_ron, period, evidence)
      select f.id, f.flag_code, 'award',
        aw.authority_entity_id, a.name_display, a.county,
        w.entity_id, s.name_display,
        f.severity, aw.ron_contract_value, f.period, f.evidence
      from (
        select *, row_number() over (partition by flag_code order by severity desc nulls last) rn
        from core.flags where subject_type = 'award'
      ) f
      join core.awards aw on aw.id = f.subject_id
      left join core.entities a on a.id = aw.authority_entity_id
      left join lateral (
        select cw.entity_id
        from core.contracts c
        join core.contract_winners cw on cw.contract_id = c.id
        where c.ca_notice_id = aw.ca_notice_id
        limit 1
      ) w on true
      left join core.entities s on s.id = w.entity_id
      where f.rn <= 500
    `;

    // ── da_transactions (per-DA investigative read model) ───────────────────
    await q`truncate marts.da_transactions`;
    await q`
      insert into marts.da_transactions
        (sicap_da_id, da_code, authority_id, authority_name, supplier_id, supplier_name,
         county, cpv_code, cpv_name, acquisition_type, estimated_value_ron, closing_value,
         publication_date, finalization_date, gap_minutes, da_flags, value_suspect)
      select da.sicap_da_id, da.da_code,
        da.authority_entity_id, a.name_display, da.supplier_entity_id, s.name_display,
        a.county, da.cpv_code, cpv.name_ro, da.acquisition_type,
        da.estimated_value_ron, da.closing_value,
        to_char(da.publication_date, 'YYYY-MM-DD HH24:MI'),
        to_char(da.finalization_date, 'YYYY-MM-DD HH24:MI'),
        case when da.publication_date is not null and da.finalization_date is not null
              and da.finalization_date >= da.publication_date
          then round(extract(epoch from (da.finalization_date - da.publication_date))/60)::int end,
        fl.codes,
        -- implausible recorded value, both directions: over the 2M cap /
        -- ≥100× the estimate (thousand-separator typos: 400.000 instead of
        -- 400), or ≤1% of the estimate (symbolic 1-leu entries: a unit price
        -- or placeholder typed as the total)
        (da.closing_value is not null and (
          da.closing_value > 2000000
          or (da.estimated_value_ron is not null and da.estimated_value_ron > 0
              and (da.closing_value >= 100 * da.estimated_value_ron
                   or da.closing_value <= da.estimated_value_ron / 100))
        ))
      from core.direct_acquisitions da
      left join core.entities a on a.id = da.authority_entity_id
      left join core.entities s on s.id = da.supplier_entity_id
      left join core.cpv_codes cpv on cpv.code = da.cpv_code
      left join (
        select subject_id, array_agg(flag_code) codes
        from core.flags where subject_type = 'da' group by subject_id
      ) fl on fl.subject_id = da.id
      where da.state = 'Oferta acceptata'
    `;
    // Pair-level flags stamped onto their constituent rows: the entity page's
    // "Fracționare sub prag" table filter must surface the acquisitions that
    // make up the flagged pattern (all pair-year rows, incl. the odd above-prag
    // one — it belongs to the same pattern even if the sum didn't count it).
    await q`
      update marts.da_transactions dt
      set da_flags = array_append(coalesce(dt.da_flags, '{}'), 'da_split')
      from core.flags f
      where f.flag_code = 'da_split' and f.subject_type = 'pair'
        and f.subject_id = dt.authority_id and f.partner_id = dt.supplier_id
        and left(dt.finalization_date, 4) = f.period
        and not ('da_split' = any(coalesce(dt.da_flags, '{}')))
    `;

    const [ac] = await q`select count(*)::int c from marts.authority_concentration`;
    const [tp] = await q`select count(*)::int c from marts.entity_top_partners`;
    const [ef] = await q`select count(*)::int c from marts.entity_flags`;
    const [fi] = await q`select count(*)::int c from marts.flag_instances`;
    const [dt] = await q`select count(*)::int c from marts.da_transactions`;
    log(
      `flag marts: authority_concentration=${ac!.c} entity_top_partners=${tp!.c} ` +
        `entity_flags=${ef!.c} flag_instances=${fi!.c} da_transactions=${dt!.c}`,
    );
    return {
      authorityConcentration: ac!.c as number,
      entityTopPartners: tp!.c as number,
      entityFlags: ef!.c as number,
      flagInstances: fi!.c as number,
      daTransactions: dt!.c as number,
    };
  });
}
