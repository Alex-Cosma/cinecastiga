import { cuiCorroborated, onrcIdentityBirthDate, repRoleLinksFirms, type DbSql } from "@seap/db";

/*
 * "De la cine?" at a verification finds a firm through a person (plan §4.10,
 * final fact_check §3.4): the firms an ONRC identity represents today, those
 * that appear as suppliers in our data, each with its CUI, county and the
 * person's role. The choice is still one firm (supplierId): no new key.
 *
 * - Only identities a birth date can tell apart (onrcIdentityBirthDate): a key
 *   without one merges namesakes, so it groups no firms (audit F32/F37).
 * - No insolvency or liquidation mandates and no supervisory seat
 *   (repRoleLinksFirms, @seap/db onrc-roles.ts): a liquidator would "have"
 *   hundreds of firms.
 * - A CUI ONRC corroborates (cuiCorroborated), as groundAdmin.
 * One snapshot of the register, without mandate dates: "azi", never at the
 * date of the purchases.
 */

export interface PersonFirm { entityId: string; name: string; cui: string | null; county: string | null; role: string | null }
export interface PersonFirms {
  /** The person's firms (the mandates above left out), with or without public purchases. */
  firms: number;
  /** Those that appear as suppliers, the largest first (at most PERSON_FIRMS_LIMIT). */
  suppliers: PersonFirm[];
}
export const PERSON_FIRMS_LIMIT = 50;

export async function personFirms(sql: DbSql, personKey: string): Promise<PersonFirms> {
  const [row] = (await sql`
    with reps as (
      select r.cui, r.calitate from reference.company_reps r
      where r.person_key = ${personKey} and ${onrcIdentityBirthDate(sql, "r")} and ${repRoleLinksFirms(sql, "r")} and r.cui is not null
    ), firms as (
      select distinct on (e.id) e.id::text entity_id, ep.name_display name, e.cui_canonical cui, coalesce(ep.county, e.county) county,
             reps.calitate role, ep.total_ron_full total
      from reps
      join core.entities e on e.cui_canonical = reps.cui and ${cuiCorroborated(sql, "e")}
      join marts.entity_profile ep on ep.entity_id = e.id and ep.role = 'supplier'
      order by e.id, reps.calitate
    )
    select (select count(distinct cui) from reps)::int firms,
           coalesce((select json_agg(json_build_object('entityId', entity_id, 'name', name, 'cui', cui, 'county', county, 'role', role) order by total desc nulls last, entity_id)
             from (select * from firms order by total desc nulls last, entity_id limit ${PERSON_FIRMS_LIMIT}) f), '[]'::json) suppliers
  `) as unknown as { firms: number; suppliers: PersonFirm[] }[];
  return { firms: row?.firms ?? 0, suppliers: row?.suppliers ?? [] };
}
