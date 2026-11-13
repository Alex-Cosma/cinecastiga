import { cuiCorroborated, type DbSql } from "@seap/db";
import { RO_NUTS3_COUNTY } from "./nuts-county.js";

/**
 * Firm attributes from the ONRC register for Ask's filters (plan F5,
 * 24 October 2026), on the supplier profiles of marts.entity_profile
 * (migration 0086). Built by the marts stage from data already imported.
 *
 * - `registered_year`: the oldest year among the ONRC registration numbers of
 *   the CUI ("Înmatriculate din {an}"). Both formats carry the year: the old
 *   `J12/345/2004` (office, sequence, year) and the new `J2024000123408`
 *   (year, sequence, three check digits), with the prefix J (company), F
 *   (PFA, II, IF) or C (cooperative). A seat move registers the firm again in
 *   the new county under that year, so the oldest year is the registration
 *   and the newest one the current seat (5,959 suppliers on the local copy).
 * - `registered_on` (migration 0109, owner 13 November 2026): the oldest day among the same registrations
 *   (DATA_INMATRICULARE, kept by the ONRC import since then), for the signal "Contracte în prima lună de la
 *   înființare". A day before 1990 or after the snapshot is not read. Null on a register imported before the day
 *   was kept, so nothing reads as "new" by mistake.
 * - `seat_county` / `seat_source` (rule in packages/db/src/firm-seat.ts): the
 *   ONRC seat is the county of the latest registration: the newest year, then
 *   a new-format number before an old one (the new format replaced the old
 *   one, so it was issued later; the snapshot has no old number after 2024),
 *   then the highest sequence, then the number as text, so the choice never
 *   depends on row order. Sequences are counted by each county office (new
 *   numbers too, before 2025), so when the newest year has only old numbers,
 *   from several counties, they do not say which is later: the SEAP county is
 *   taken if it is one of them, else the ONRC seat is undecided (133 suppliers
 *   on the local copy of 24 October 2026; 58 left undecided).
 *   Counties are written in the spelling of `core.entities.county`, which the
 *   transaction rows carry as buyer county. When the ONRC seat is undecided,
 *   or its registration names no county, the SEAP county applies.
 *
 * Only a corroborated CUI is joined to ONRC (cuiCorroborated, audit F03). A
 * foreign seat has no registered_year: a foreign firm is not "registered in
 * {year}", whatever an ONRC namesake's number says. A year before 1990 (the
 * register's start) or after the snapshot is not read. Authority rows keep
 * the three columns null; an authority's county is `county`.
 */
export const ONRC_NUMBER_OLD = "^[JFC][0-9]{1,2}/[0-9]+/[0-9]{4}$";
export const ONRC_NUMBER_NEW = "^[JFC][0-9]{13}$";
export const ONRC_FIRST_YEAR = 1990;
/** The first day a registration can carry (the register's start). */
export const ONRC_FIRST_DAY = "1990-01-01";

/** Year and sequence of an ONRC registration number, as the SQL below reads them. */
export function onrcRegistration(jNumber: string): { year: number; sequence: number } | null {
  if (new RegExp(ONRC_NUMBER_NEW).test(jNumber))
    return { year: Number(jNumber.slice(1, 5)), sequence: Number(jNumber.slice(5, 11)) };
  if (new RegExp(ONRC_NUMBER_OLD).test(jNumber)) {
    const [, sequence, year] = jNumber.split("/");
    return { year: Number(year), sequence: Number(sequence) };
  }
  return null;
}

type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

export interface FirmRegistryReport {
  /** Supplier profiles with a registration year. */
  registeredYear: number;
  /** Supplier profiles with a registration day (0 on a register imported before the day was kept). */
  registeredOn: number;
  /** Supplier profiles per seat_source ('onrc' | 'seap' | 'foreign'), and without a seat. */
  seat: Record<string, number>;
}

/** Fill registered_year, registered_on, seat_county and seat_source of the supplier profiles, in the caller's transaction. */
export async function applyFirmRegistry(q: TransactionSql): Promise<FirmRegistryReport> {
  // The profiles were just written in this transaction. Without statistics (a
  // new or restored database before its first ANALYZE) the planner expects a
  // few hundred suppliers and joins the registrations by nested loop: over 10
  // minutes instead of ~4 s. TRUNCATE keeps pg_statistic, so later nights
  // already have them; the sample costs ~0.3 s.
  await q`analyze marts.entity_profile`;
  const counties = [...new Set(Object.values(RO_NUTS3_COUNTY))];
  // The day column exists only on a register created or migrated since 0109 (a fixture's own table may lack it).
  const [present] = await q`select to_regclass('reference.onrc_firm') is not null onrc,
    exists (select 1 from pg_attribute where attrelid = to_regclass('reference.onrc_firm') and attname = 'registered_on' and not attisdropped) has_day`;
  const day = present?.has_day ? q`o.registered_on` : q`null::date`;
  // A reference import, absent from a fresh database: the SEAP county still applies.
  const registrations = present?.onrc
    ? q`select o.cui, o.county, o.j_number, extract(year from o.snapshot_date)::int snapshot_year, o.snapshot_date, ${day} registered_on
        from reference.onrc_firm o where o.cui in (select cui from sup where cui is not null)`
    : q`select null::text cui, null::text county, null::text j_number, null::int snapshot_year, null::date snapshot_date, null::date registered_on where false`;
  await q`
    with k(county) as (select unnest(${q.array(counties)}::text[])),
    sup as (
      select ep.entity_id, e.is_foreign,
        coalesce(nullif(upper(trim(e.country_code)), ''), 'RO') <> 'RO' non_ro,
        ks.county seap_county,
        case when ${cuiCorroborated(q, "e")} then e.cui_canonical end cui
      from marts.entity_profile ep
      join core.entities e on e.id = ep.entity_id
      left join k ks on lower(ks.county) = lower(unaccent(trim(e.county)))
      where ep.role = 'supplier'),
    -- Materialized: parse only the CUIs' own numbers, not the 4.2M rows of the register.
    onrc as materialized (${registrations}),
    reg as (
      select * from (
        select o.cui, o.county, o.j_number, o.snapshot_year,
          case when o.registered_on between ${ONRC_FIRST_DAY}::date and o.snapshot_date then o.registered_on end registered_on,
          case when o.j_number ~ ${ONRC_NUMBER_NEW} then substr(o.j_number, 2, 4)::int
               when o.j_number ~ ${ONRC_NUMBER_OLD} then split_part(o.j_number, '/', 3)::int end y,
          case when o.j_number ~ ${ONRC_NUMBER_NEW} then substr(o.j_number, 6, 6)::bigint
               when o.j_number ~ ${ONRC_NUMBER_OLD} then split_part(o.j_number, '/', 2)::bigint end seq
        from onrc o) r
      where r.y between ${ONRC_FIRST_YEAR}::int and r.snapshot_year),
    first_reg as (select cui, min(y) y, min(registered_on) registered_on from reg group by cui),
    newest as (
      select r.cui, ko.county, r.seq, r.j_number, r.j_number ~ ${ONRC_NUMBER_NEW} is_new
      from reg r
      join (select cui, max(y) y from reg group by cui) t on t.cui = r.cui and t.y = r.y
      left join k ko on lower(ko.county) = lower(unaccent(trim(r.county)))),
    spread as (select cui, bool_or(is_new) has_new, count(distinct county) counties from newest group by cui),
    last_reg as (
      select distinct on (n.cui) n.cui,
        case when sp.has_new or sp.counties <= 1 or n.county = s.seap_county then n.county end county
      from newest n
      join spread sp on sp.cui = n.cui
      join sup s on s.cui = n.cui
      order by n.cui, n.is_new desc, (n.county = s.seap_county) desc nulls last, n.seq desc, n.j_number desc),
    seat as (
      select s.entity_id, f.y registered_year, f.registered_on,
        case when not s.is_foreign then coalesce(l.county, s.seap_county) end seat_county,
        case when s.is_foreign then 'foreign' when l.county is not null then 'onrc'
             when s.seap_county is not null then 'seap' when s.non_ro then 'foreign' end seat_source
      from sup s
      left join first_reg f on f.cui = s.cui
      left join last_reg l on l.cui = s.cui)
    update marts.entity_profile ep
    set registered_year = case when seat.seat_source is distinct from 'foreign' then seat.registered_year end,
        registered_on = case when seat.seat_source is distinct from 'foreign' then seat.registered_on end,
        seat_county = seat.seat_county, seat_source = seat.seat_source
    from seat
    where ep.entity_id = seat.entity_id and ep.role = 'supplier'
  `;
  const rows = await q`
    select coalesce(seat_source, 'unknown') source, count(*)::int n, count(registered_year)::int registered, count(registered_on)::int registered_on
    from marts.entity_profile where role = 'supplier' group by 1`;
  return {
    registeredYear: rows.reduce((sum, row) => sum + Number(row.registered), 0),
    registeredOn: rows.reduce((sum, row) => sum + Number(row.registered_on), 0),
    seat: Object.fromEntries(rows.map((row) => [String(row.source), Number(row.n)])),
  };
}
