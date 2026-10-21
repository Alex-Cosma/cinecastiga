import { cuiCorroborated, type DbSql } from "@seap/db";
import { AUTHORITY_UAT_CORRECTIONS } from "../reference/authority-uat-repair.js";
import { RO_NUTS3_COUNTY } from "./nuts-county.js";

/**
 * County from the ONRC registered office and from strict UAT links (owner
 * decision F13, 21 October 2026).
 *
 * After the NUTS-3 step, DA suppliers created by live ingestion and a few
 * authorities still had no county: the DA lists carry no address. Two sources
 * fill it, only where the entity has no county and only for entities without a
 * foreign marker (not is_foreign, country RO or unknown), as for NUTS-3:
 *
 * - Suppliers (a contract, DA or TED winner) take the county of their ONRC
 *   registered office, joined only through a corroborated CUI
 *   (`cuiCorroborated`, audit F03), when every ONRC record of that CUI names
 *   the same county.
 * - Authorities take the county of their `reference.authority_uat` code only
 *   when the link is strict: a București sector code (-1…-6) or the city code
 *   (-9) with a name that names that sector or the city, or a positive SIRUTA
 *   whose catalog name exists in a single county and which the authority's name
 *   states as a local administration ("Comuna X", "UAT Comuna X (Consiliul
 *   local)"). A name shared by UATs of several counties never decides a county:
 *   that is how the legacy table tied five Vânători communes to Mehedinți
 *   (audit F15). A row the F15 repair has not yet moved off its wrong code is
 *   never used.
 *
 * Every source the entity has must agree. A Romanian NUTS-3 code naming another
 * county, a foreign NUTS code, ONRC records of the CUI in another county, or a
 * strict UAT link to another county leaves the county unknown. An existing
 * county is never changed. Runs in normalize after the NUTS-3 step, before the
 * marts copy `core.entities.county`.
 */
export interface RegistryCounties {
  onrc: bigint[];
  authorityUat: bigint[];
}

type TransactionSql = Parameters<Parameters<DbSql["begin"]>[1]>[0];

/** Folded name: unaccented, lower-case, anything but letters and digits as one space. */
const fold = (q: TransactionSql, expression: ReturnType<TransactionSql>) =>
  q`trim(regexp_replace(lower(unaccent(coalesce(${expression}, ''))), '[^a-z0-9]+', ' ', 'g'))`;

/** Legal forms under which a UAT's own administration buys (strict links only). */
const LOCAL_FORM = "^((uat|u a t|unitatea administrativ teritoriala) )?(comuna|orasul|oras|municipiul|primaria( comunei| orasului| municipiului)?) ";
/**
 * What may follow the locality in a strict name, with K for the locality:
 * "Comuna Racova (Consiliul local)", "Comuna Tibucani (Primaria Comunei Tibucani)".
 * Names are compared with i read as a (`coarse`), so the legacy î spelling,
 * modern â and names written without diacritics give one key: VÎNATORI (Galați)
 * and VÂNATORI (Mehedinți) share the key "vanatora" and so decide no county.
 */
const LOCAL_SUFFIX = "( consiliul local( K)?| primaria( comunei| orasului| municipiului)? K)?$".replace(/i/g, "a");
const coarse = (q: TransactionSql, expression: ReturnType<TransactionSql>) => q`translate(${expression}, 'i', 'a')`;

export async function applyRegistryCounties(q: TransactionSql): Promise<RegistryCounties> {
  const counties = [...new Set(Object.values(RO_NUTS3_COUNTY))];
  const codes = Object.keys(RO_NUTS3_COUNTY);
  const nutsCounties = codes.map((code) => RO_NUTS3_COUNTY[code]!);
  const [present] = await q`select to_regclass('reference.onrc_firm') is not null onrc,
    to_regclass('reference.authority_uat') is not null and to_regclass('reference.uat') is not null uat`;
  // Both are reference imports, absent from a fresh database.
  const onrc = present?.onrc
    ? q`select c.id, count(distinct lower(unaccent(trim(o.county)))) n, max(k.county) county, bool_and(k.county is not null) mapped
        from cand c join reference.onrc_firm o on o.cui = c.cui
        left join k on lower(k.county) = lower(unaccent(trim(o.county)))
        where nullif(trim(o.county), '') is not null
        group by c.id`
    : q`select null::bigint id, 0::bigint n, null::text county, true mapped where false`;
  const wrongIds = AUTHORITY_UAT_CORRECTIONS.map((row) => row.entityId);
  const wrongCodes = AUTHORITY_UAT_CORRECTIONS.map((row) => row.from);
  const uat = present?.uat
    ? q`, unit as (
          select u.siruta, k.county,
            ${coarse(q, q`regexp_replace(${fold(q, q`u.name`)}, '^(municipiul|orasul|oras) ', '')`)} unit_key
          from reference.uat u join k on replace(lower(k.county), '-', ' ') = lower(unaccent(trim(u.county)))),
        shared as (select unit_key from unit group by unit_key having count(distinct county) > 1),
        auat as (
          select c.id, case
            when au.uat_siruta between -6 and -1 and c.folded ~ ('(^| )sector(ul)? ?' || (-au.uat_siruta) || '( |$)') then 'Bucuresti'
            when au.uat_siruta = -9 and c.folded ~ '(^| )bucuresti( |$)' then 'Bucuresti'
            when au.uat_siruta > 0 and c.folded ~ ${LOCAL_FORM}
              and not exists (select 1 from shared s where s.unit_key = un.unit_key)
              and ${coarse(q, q`regexp_replace(c.folded, ${LOCAL_FORM}, '')`)} ~ ('^' || un.unit_key || replace(${LOCAL_SUFFIX}, 'K', un.unit_key))
            then un.county end county
          from cand c join reference.authority_uat au on au.entity_id = c.id
          left join unit un on un.siruta = au.uat_siruta
          where not exists (select 1 from unnest(${q.array(wrongIds)}::bigint[], ${q.array(wrongCodes)}::int[]) w(entity_id, siruta)
            where w.entity_id = au.entity_id and w.siruta = au.uat_siruta))`
    : q`, auat as (select null::bigint id, null::text county where false)`;
  const rows = await q`
    with k(county) as (select unnest(${q.array(counties)}::text[])),
    m(nuts, county) as (select * from unnest(${q.array(codes)}::text[], ${q.array(nutsCounties)}::text[])),
    cand as (
      select e.id, case when ${cuiCorroborated(q, "e")} then e.cui_canonical end cui,
        nullif(trim(e.nuts_code), '') nuts_code, m.county nuts_county, ${fold(q, q`e.name_display`)} folded,
        (exists (select 1 from core.contract_winners w where w.entity_id = e.id)
          or exists (select 1 from core.direct_acquisitions d where d.supplier_entity_id = e.id)
          or exists (select 1 from core.ted_lot_winners t where t.entity_id = e.id)) supplier
      from core.entities e
      left join m on m.nuts = upper(substring(trim(e.nuts_code) from '^[Rr][Oo][0-9]{3}(?![0-9A-Za-z])'))
      where nullif(trim(e.county), '') is null
        and not e.is_foreign and coalesce(nullif(upper(trim(e.country_code)), ''), 'RO') = 'RO'),
    onrc as (${onrc}) ${uat},
    evidence as (
      select c.id, c.nuts_code, c.nuts_county, o.n onrc_n, o.county onrc_county,
        case when c.supplier and o.n = 1 and o.mapped then o.county end onrc_fill, a.county auat_county
      from cand c left join onrc o on o.id = c.id
      -- authority_uat holds one row per entity.
      left join auat a on a.id = c.id),
    decided as (
      select v.id, coalesce(v.onrc_fill, v.auat_county) county, v.onrc_fill is not null from_onrc
      from evidence v
      where coalesce(v.onrc_fill, v.auat_county) is not null
        and (v.auat_county is null or v.auat_county = coalesce(v.onrc_fill, v.auat_county))
        and (v.onrc_n is null or (v.onrc_n = 1 and v.onrc_county = coalesce(v.onrc_fill, v.auat_county)))
        and (v.nuts_code is null
          or (v.nuts_county is null and upper(v.nuts_code) ~ '^RO')
          or v.nuts_county = coalesce(v.onrc_fill, v.auat_county)))
    update core.entities e set county = d.county
    from decided d
    where e.id = d.id and nullif(trim(e.county), '') is null
    returning e.id, d.from_onrc
  `;
  const ids = (from: boolean) =>
    rows.filter((row) => row.from_onrc === from).map((row) => BigInt(row.id as string | number | bigint));
  return { onrc: ids(true), authorityUat: ids(false) };
}
