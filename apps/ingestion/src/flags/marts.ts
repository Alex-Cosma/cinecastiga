import type { DbSql } from "@seap/db";
import {buildTransactionMarts} from "../normalize/transaction-marts.js";
import { applyProfileScores } from "./score.js";

/**
 * Flag marts (red-flags Phase 4): recompute the read models over core.flags +
 * core.direct_acquisitions. Fills the previously-empty authority_concentration
 * and entity_top_partners from the DA pair spine, builds the per-entity risk
 * score (entity_flags, score.ts), and a browsable flag_instances explorer.
 * Same plausibility bound as the flag rules so corrupt values can't distort totals.
 */

async function threshold(sql: DbSql, key: string, fallback: number): Promise<number> {
  const r = (await sql`
    select value_num from core.risk_thresholds where key = ${key}
    order by valid_from desc limit 1
  `) as unknown as { value_num: string }[];
  return r[0] ? Number(r[0].value_num) : fallback;
}

export interface FlagMartsReport {
  authorityConcentration: number;
  entityTopPartners: number;
  entityFlags: number;
  /** Supplier profiles with a main CPV division. */
  mainCpvDivisions: number;
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

type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

/**
 * entity_flags.main_cpv_div (F6a phase 2, migration 0086): the CPV division
 * (first two digits) holding at least half of a supplier profile's value, over
 * the profile's own population (accepted DAs, 0 < value <= ceiling, the recorded
 * supplier not the authority). A DA without CPV stays in the denominator. An
 * exact 50/50 tie names no division, nor do authority profiles. Ask's "același
 * domeniu principal" compares firms on it; a scan at question time took 4.5 s.
 */
export async function applyMainCpvDivisions(q: TransactionSql, ceiling: number): Promise<number> {
  const updated = await q`
    update marts.entity_flags ef set main_cpv_div = d.division
    from (
      select eid, division, v,
        row_number() over (partition by eid order by v desc, division) rank,
        lead(v) over (partition by eid order by v desc, division) next_v
      from (
        select supplier_entity_id eid, left(cpv_code, 2) division, sum(closing_value) v
        from core.direct_acquisitions
        where supplier_entity_id is not null and supplier_entity_id <> authority_entity_id and state = 'Oferta acceptata'
          and closing_value > 0 and closing_value <= ${ceiling} and cpv_code ~ '^[0-9]{2}'
        group by 1, 2
      ) per_division
    ) d
    where d.rank = 1 and ef.entity_id = d.eid and ef.role = 'supplier'
      and d.v * 2 >= ef.total_ron and (d.next_v is null or d.next_v < d.v)
  `;
  return updated.count;
}

export async function runFlagMarts(
  sql: DbSql,
  opts: { log?: (m: string) => void; transactions?: boolean } = {},
): Promise<FlagMartsReport> {
  const log = opts.log ?? (() => {});
  const b = await bound(sql);
  if (b !== 2_000_000) throw new Error("DA plausibility bound differs from the query population (2000000)");

  return sql.begin(async (q) => {
    // Calendar days/years must match SEAP detail pages in Romanian time.
    await q`set local time zone 'Europe/Bucharest'`;
    // NOTE: authority_concentration + entity_top_partners are now owned by
    // `runMarts` (built from the DA + award pair spine, bounded). They are NOT
    // rebuilt here — doing so would clobber the award-inclusive versions with a
    // DA-only one. This job owns only the flag-specific marts below.

    // ── entity_flags (risk score per entity+role) ───────────────────────────
    // The profiles first, then their score (score.ts): cri, n_flags and flags
    // are rewritten by applyProfileScores from the strengths of the criteria.
    await q`truncate marts.entity_flags`;
    await q`
      insert into marts.entity_flags
        (entity_id, role, name_display, cui_canonical, county, n_das, total_ron, cri, n_flags, flags)
      with base as (
        select authority_entity_id eid, 'authority' role, count(*) n, sum(closing_value) total
        from core.direct_acquisitions
        where authority_entity_id is not null and state = 'Oferta acceptata' and closing_value > 0 and closing_value <= ${b}
        group by authority_entity_id
        union all
        -- A recorded supplier equal to the authority is not a supplier (audit F12).
        select supplier_entity_id, 'supplier', count(*), sum(closing_value)
        from core.direct_acquisitions
        where supplier_entity_id is not null and supplier_entity_id <> authority_entity_id and state = 'Oferta acceptata' and closing_value > 0 and closing_value <= ${b}
        group by supplier_entity_id
      )
      select b.eid, b.role, e.name_display, e.cui_canonical, e.county, b.n, b.total, 0, 0, '[]'::jsonb
      from base b join core.entities e on e.id = b.eid
    `;
    const scores = await applyProfileScores(q as unknown as DbSql, {
      maxPlausible: b,
      yearEndMinTotal: await threshold(q as unknown as DbSql, 'da_year_end_min_total', 100_000),
      yearEndShare: await threshold(q as unknown as DbSql, 'da_year_end_share', 0.35),
    });
    log(`risk score: profiles=${scores.profiles} scored=${scores.scored}`);
    const mainCpvDivisions = await applyMainCpvDivisions(q, b);

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
        nullif(da.supplier_entity_id, da.authority_entity_id), s.name_display,
        f.severity, da.closing_value, f.period, f.evidence
      from (
        select *, row_number() over (partition by flag_code order by severity desc nulls last) rn
        from core.flags where subject_type = 'da'
      ) f
      join core.direct_acquisitions da on da.id = f.subject_id
      left join core.entities a on a.id = da.authority_entity_id
      left join core.entities s on s.id = nullif(da.supplier_entity_id, da.authority_entity_id)
      where f.rn <= 500
    `;
    // ── per-award flags (award_no_competition / award_single_bid): top examples ─
    await q`
      insert into marts.flag_instances
        (id, flag_code, subject_type, entity_id, entity_name, entity_county, partner_id, partner_name, severity, total_ron, period, evidence)
      select f.id, f.flag_code, 'award',
        aw.authority_entity_id, a.name_display, a.county,
        w.entity_id, s.name_display,
        f.severity, coalesce(nullif(f.evidence->>'value','')::numeric, aw.ron_contract_value), f.period, f.evidence
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
        -- The authority recorded as its own winner is not a partner (audit F12).
        where c.ca_notice_id = aw.ca_notice_id and cw.entity_id is distinct from aw.authority_entity_id
        limit 1
      ) w on true
      left join core.entities s on s.id = w.entity_id
      where f.rn <= 500
    `;

    if(opts.transactions!==false)await buildTransactionMarts(q);

    const [ac] = await q`select count(*)::int c from marts.authority_concentration`;
    const [tp] = await q`select count(*)::int c from marts.entity_top_partners`;
    const [ef] = await q`select count(*)::int c from marts.entity_flags`;
    const [fi] = await q`select count(*)::int c from marts.flag_instances`;
    const [dt] = await q`select count(*)::int c from marts.da_transactions`;
    log(
      `flag marts: authority_concentration=${ac!.c} entity_top_partners=${tp!.c} ` +
        `entity_flags=${ef!.c} main_cpv_div=${mainCpvDivisions} flag_instances=${fi!.c} da_transactions=${dt!.c}`,
    );
    return {
      authorityConcentration: ac!.c as number,
      entityTopPartners: tp!.c as number,
      entityFlags: ef!.c as number,
      mainCpvDivisions,
      flagInstances: fi!.c as number,
      daTransactions: dt!.c as number,
    };
  });
}
