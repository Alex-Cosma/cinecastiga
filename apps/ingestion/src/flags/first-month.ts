import { cuiCorroborated, onrcIdentityBirthDate, repRoleLinksFirms, type DbSql } from "@seap/db";
import { daThresholdDateSql, daThresholdKeySql } from "./thresholds.js";

type Fragment = ReturnType<DbSql>;

/**
 * "Contracte în prima lună de la înființare" (owner, 13 November 2026, rf-2026.24; after the article "Firma născută
 * ieri și banii statului"): a firm whose accepted direct awards published in the first 30 days from its registration
 * at the trade register add up to at least 100,000 lei. Two sides of the same fact:
 *
 *   da_first_month        the firm: every counted institution together reaches the sum (one case per firm);
 *   da_first_month_buyer  the institution ("the reverse"): its own awards to one such firm reach the sum
 *                         (one case per institution and firm).
 *
 * Informative, never in the score: a new firm that sells at once is common (about one new supplier in ten has its
 * first award in its first month), and three in ten of these firms have a legal representative with an older firm.
 *
 * The rules:
 * - the day is the publication (the initiation), with the finalization as fallback, in Romanian civil time, as for
 *   the ceilings; the age is that day minus the firm's registration day (marts.entity_profile.registered_on: the
 *   oldest ONRC registration of a corroborated CUI, so a seat move does not make a firm new);
 * - only institutions the direct-award rules bind count (the caller's buyers: regime "classic"), not private
 *   companies or associations;
 * - a firm with an award dated before its registration is left out: its registration day cannot be the real one;
 * - "close to the ceiling": the award nearest to the direct-award ceiling of its day and type, from 90% of it;
 * - an older supplier firm of one of the firm's legal representatives (a solid ONRC identity, a role that represents
 *   the firm, a person with at most 15 firms) is named in the evidence and never removes the case: it is the usual
 *   explanation (the new firm of an existing supplier) and, with the same institution, a lead of its own.
 */
export const FIRST_MONTH = {
  /** Days from the registration, its own day included: ages 0 to 30. */
  days: 30,
  /** Lei contracted in the window: by all the institutions for the firm's case, by one of them for the institution's. */
  minTotal: 100_000,
  /** The award nearest to its ceiling counts as "close to the ceiling" from this share of it. */
  nearCeiling: 0.9,
  /** A representative of more firms than this is a professional administrator: no "older firm of the same person". */
  maxPersonFirms: 15,
  /** The window value that maps to severity 1. */
  severityReference: 1_000_000,
} as const;

export interface FirstMonthTables {
  /** As core.direct_acquisitions: sicap_da_id, authority_entity_id, supplier_entity_id, state, closing_value,
   *  publication_date, finalization_date, cpv_code, acquisition_type. */
  acquisitions?: Fragment;
  /** Supplier profiles with their registration day: (entity_id, registered_on). */
  registrations?: Fragment;
  /** As core.risk_thresholds (the direct-award ceilings by era). */
  thresholds?: Fragment;
  /** The legal representatives of the case firms and every firm they represent: (person_key, sid, firms), `firms`
   *  being how many firms the person represents in the register. May read the CTE `firm_case` (s). */
  representatives?: Fragment;
  /** As core.entities: (id, name_display). */
  entities?: Fragment;
}

/**
 * The cases of both sides: (side 'supplier' | 'authority', subject_id, partner_id, period, severity, evidence).
 * `buyers` is the set of institutions that count, as (eid). A firm's case has a partner only when one institution
 * alone bought in the window (the evidence always names the largest one); an institution's case has the firm.
 */
export function firstMonthCasesSql(sql: DbSql, limits: { maxPlausible: number; buyers: Fragment }, tables: FirstMonthTables = {}): Fragment {
  const acquisitions = tables.acquisitions ?? sql`core.direct_acquisitions`;
  const registrations = tables.registrations ?? sql`(select entity_id, registered_on from marts.entity_profile where role = 'supplier')`;
  const thresholds = tables.thresholds ?? sql`core.risk_thresholds`;
  const entities = tables.entities ?? sql`core.entities`;
  // One person, by a solid identity and a role that represents the firm, and every supplier entity they represent.
  const representatives = tables.representatives ?? sql`
    select cp.person_key, e2.id sid,
      (select count(distinct rc.cui) from reference.company_reps rc
        where rc.person_key = cp.person_key and ${repRoleLinksFirms(sql, "rc")})::int firms
    from (
      select distinct r.person_key
      from firm_case f
      join core.entities e on e.id = f.s
      join reference.company_reps r on r.cui = e.cui_canonical
      where ${cuiCorroborated(sql, "e")} and ${onrcIdentityBirthDate(sql, "r")} and ${repRoleLinksFirms(sql, "r")}
    ) cp
    join reference.company_reps r2 on r2.person_key = cp.person_key
    join core.entities e2 on e2.cui_canonical = r2.cui
    where ${onrcIdentityBirthDate(sql, "r2")} and ${repRoleLinksFirms(sql, "r2")} and ${cuiCorroborated(sql, "e2")}
    group by cp.person_key, e2.id`;
  const day = daThresholdDateSql(sql, sql`d.publication_date`, sql`d.finalization_date`);
  const key = daThresholdKeySql(sql, sql`d.cpv_code`, sql`d.acquisition_type`);
  const { days, minTotal, nearCeiling, maxPersonFirms, severityReference } = FIRST_MONTH;
  const accepted = sql`d.state = 'Oferta acceptata' and d.authority_entity_id is not null
    and d.supplier_entity_id <> d.authority_entity_id -- not a supplier (audit F12)
    and d.closing_value > 0 and d.closing_value <= ${limits.maxPlausible}::numeric`;
  return sql`
    with firm as materialized (
      select r.entity_id s, r.registered_on reg from ${registrations} r where r.registered_on is not null
    ),
    -- Every accepted award of a registered firm up to the end of its window, the ones before the registration included.
    -- Materialized on its own: the ceilings are then joined to these few thousand rows, not to every direct award
    -- (the planner expects the age filter to keep a third of them and joined the ceilings first: 8 minutes locally).
    early as materialized (
      select d.supplier_entity_id s, d.authority_entity_id a, d.sicap_da_id, d.closing_value v, ${day} award_day,
        d.publication_date is null date_fallback, f.reg, ${day} - f.reg age, d.cpv_code, d.acquisition_type
      from ${acquisitions} d
      join firm f on f.s = d.supplier_entity_id
      where ${accepted}
        and coalesce(d.publication_date, d.finalization_date) is not null
        and ${day} - f.reg <= ${days}::int
    ),
    da as materialized (
      select d.s, d.a, d.sicap_da_id, d.v, d.award_day, d.date_fallback, d.reg, d.age,
        exists (select 1 from (${limits.buyers}) b where b.eid = d.a) counted,
        th.value_num::numeric ceil
      from early d
      left join ${thresholds} th
        on th.key = ${key}
       and (th.valid_from at time zone 'UTC')::date <= d.award_day
       and (th.valid_to is null or (th.valid_to at time zone 'UTC')::date > d.award_day)
    ),
    w as (
      select * from da
      where age >= 0 and counted and s not in (select s from da where age < 0)
    ),
    pair as (
      select s, a, max(reg) reg, sum(v) total, count(*)::int n, min(award_day) first_day, max(award_day) last_day, min(age) first_age,
        count(*) filter (where date_fallback)::int date_fallback_count,
        (array_agg(v order by v / ceil desc nulls last, sicap_da_id))[1] closest_value,
        (array_agg(ceil order by v / ceil desc nulls last, sicap_da_id))[1] closest_ceiling,
        jsonb_agg(sicap_da_id::text order by award_day, sicap_da_id) source_ids
      from w group by s, a
    ),
    firm_case as materialized (
      select s, max(reg) reg, sum(total) total, sum(n)::int n, count(*)::int buyers, min(first_day) first_day,
        max(last_day) last_day, min(first_age) first_age, sum(date_fallback_count)::int date_fallback_count
      from pair group by s
      having sum(total) >= ${minTotal}::numeric
    ),
    firm_awards as (
      select w.s, jsonb_agg(w.sicap_da_id::text order by w.award_day, w.sicap_da_id) source_ids,
        (array_agg(w.v order by w.v / w.ceil desc nulls last, w.sicap_da_id))[1] closest_value,
        (array_agg(w.ceil order by w.v / w.ceil desc nulls last, w.sicap_da_id))[1] closest_ceiling
      from w join firm_case f on f.s = w.s group by w.s
    ),
    top as (
      select distinct on (p.s) p.s, p.a, p.total from pair p join firm_case f on f.s = p.s order by p.s, p.total desc, p.a
    ),
    -- Every institution of the firm in the archive's direct awards, whatever its regime: "its only public buyer".
    ever as (
      select d.supplier_entity_id s, count(distinct d.authority_entity_id)::int buyers
      from ${acquisitions} d
      where d.supplier_entity_id in (select s from firm_case) and ${accepted}
      group by 1
    ),
    rep as materialized (${representatives}),
    kin as (
      select distinct mine.sid s, other.sid older
      from rep mine
      join firm_case f on f.s = mine.sid
      join rep other on other.person_key = mine.person_key and other.sid <> mine.sid
      join firm fo on fo.s = other.sid and fo.reg < f.reg
      where mine.firms <= ${maxPersonFirms}::int
    ),
    -- What the older firm had contracted with each institution before the new firm's first award.
    kin_sales as (
      select k.s, k.older, d.authority_entity_id a, sum(d.closing_value) v
      from kin k
      join firm_case f on f.s = k.s
      join ${acquisitions} d on d.supplier_entity_id = k.older
      where ${accepted} and coalesce(d.publication_date, d.finalization_date) is not null and ${day} < f.first_day
      group by 1, 2, 3
    ),
    kin_firm as (
      select distinct on (t.s) t.s, t.older, t.same_v > 0 same_buyer
      from (
        select ks.s, ks.older, sum(ks.v) v,
          coalesce(sum(ks.v) filter (where exists (select 1 from pair p where p.s = ks.s and p.a = ks.a)), 0) same_v
        from kin_sales ks group by 1, 2
      ) t
      order by t.s, t.same_v desc, t.v desc, t.older
    ),
    kin_pair as (
      select distinct on (ks.s, ks.a) ks.s, ks.a, ks.older from kin_sales ks order by ks.s, ks.a, ks.v desc, ks.older
    )
    -- The firm's partner is its institution only when the window has a single one; else the evidence names the largest.
    select 'supplier' side, f.s subject_id, case when f.buyers = 1 then t.a end partner_id, extract(year from f.first_day)::int::text period,
      least(1, f.total / ${severityReference}::numeric) severity,
      jsonb_strip_nulls(jsonb_build_object(
        'total', f.total, 'count', f.n, 'buyers', f.buyers, 'buyers_all', ev.buyers,
        'registered_on', f.reg, 'first_award_on', f.first_day, 'last_award_on', f.last_day, 'age_days', f.first_age,
        'window_days', ${days}::int, 'top_buyer', t.a, 'top_buyer_total', t.total,
        'closest_value', case when fa.closest_ceiling is not null then fa.closest_value end, 'closest_ceiling', fa.closest_ceiling,
        'near_ceiling', coalesce(fa.closest_value >= ${nearCeiling}::numeric * fa.closest_ceiling, false),
        'older_firm', kf.older, 'older_firm_name', eo.name_display, 'older_firm_same_buyer', kf.same_buyer,
        'date_fallback_count', f.date_fallback_count, 'source_ids', fa.source_ids)) evidence
    from firm_case f
    join top t on t.s = f.s
    join firm_awards fa on fa.s = f.s
    left join ever ev on ev.s = f.s
    left join kin_firm kf on kf.s = f.s
    left join ${entities} eo on eo.id = kf.older
    union all
    select 'authority', p.a, p.s, extract(year from p.first_day)::int::text,
      least(1, p.total / ${severityReference}::numeric),
      jsonb_strip_nulls(jsonb_build_object(
        'total', p.total, 'count', p.n, 'firm_total', f.total, 'firm_buyers', f.buyers, 'buyers_all', ev.buyers,
        'registered_on', p.reg, 'first_award_on', p.first_day, 'last_award_on', p.last_day, 'age_days', p.first_age,
        'window_days', ${days}::int,
        'closest_value', case when p.closest_ceiling is not null then p.closest_value end, 'closest_ceiling', p.closest_ceiling,
        'near_ceiling', coalesce(p.closest_value >= ${nearCeiling}::numeric * p.closest_ceiling, false),
        'older_firm', kp.older, 'older_firm_name', eo.name_display,
        'date_fallback_count', p.date_fallback_count, 'source_ids', p.source_ids))
    from pair p
    join firm_case f on f.s = p.s
    left join ever ev on ev.s = p.s
    left join kin_pair kp on kp.s = p.s and kp.a = p.a
    left join ${entities} eo on eo.id = kp.older
    where p.total >= ${minTotal}::numeric
  `;
}
