import type { DbSql } from "@seap/db";
import { readAuthorityKinds } from "./ask/authority-kind";
import reference from "./reference/local-institutions-2026.json" with { type: "json" };

/*
 * The institutions of the town halls and county councils (/harta, "Primării și CJ, cu instituțiile lor"; owner,
 * 8 November 2026). Two lists keyed by CUI, so they hold on any copy of the database
 * (lib/reference/local-institutions-2026.json, built outside the repository from the sources):
 * - A: the Ministry of Finance's list of public entities (data.gov.ro, 01.11.2026): every public institution whose
 *   principal credit officer is one local administration (a UAT, a county, a București sector, the capital's city
 *   hall). The officer is the link: no name is guessed.
 * - B: the companies one town hall or county council owns alone or as the majority shareholder, each verified by
 *   hand on a primary document that states it (the candidates: public enterprises (AMEPIP) with more than 10 million
 *   lei contracted). Companies of several UATs (regional water operators, ADIs) and the state's stay out.
 * Schools and hospitals are kinds of their own: an institution Întreabă names a school or a hospital is left out.
 */

interface ReferenceInstitution { cui: string; name: string; parent: string }
const LIST: readonly ReferenceInstitution[] = [...(reference.institutions as ReferenceInstitution[]), ...(reference.companies as ReferenceInstitution[])];

export const INSTITUTIONS_SOURCE = "Instituțiile: Ministerul Finanțelor, Lista entităților publice la 01.11.2026 (ordonatorul principal de credite); companiile în care o primărie sau un consiliu județean e singurul acționar ori cel majoritar, verificate de mână pe sursă.";

/**
 * The institutions of the administrations `admins` (entity ids, the map's strict list): each identity of an
 * institution's CUI with an authority profile, with the index of its administration in `admins`. An institution
 * whose administration the strict list does not hold is left out (its value would have nowhere to go).
 */
export async function localInstitutions(sql: DbSql, admins: readonly string[]): Promise<{ id: string; parent: number }[]> {
  const cuis = [...new Set(LIST.flatMap((x) => [x.cui, x.parent]))];
  const [rows, kinds] = await Promise.all([
    sql`select e.id::text id, e.cui_canonical cui from core.entities e
      where e.cui_valid and e.cui_canonical = any(${sql.array(cuis)}::text[]) and e.id <= 9007199254740991
        and exists (select 1 from marts.entity_profile p where p.entity_id = e.id and p.role = 'authority')` as unknown as Promise<{ id: string; cui: string }[]>,
    readAuthorityKinds(sql),
  ]);
  const byCui = new Map<string, string[]>();
  for (const r of rows) byCui.set(r.cui, [...(byCui.get(r.cui) ?? []), r.id]);
  const adminIndex = new Map(admins.map((id, i) => [id, i]));
  // An administration's CUI may hold several identities: the one in the strict list is the parent.
  const parentOf = new Map<string, number>();
  for (const cui of new Set(LIST.map((x) => x.parent))) {
    const at = (byCui.get(cui) ?? []).map((id) => adminIndex.get(id)).find((i) => i !== undefined);
    if (at !== undefined) parentOf.set(cui, at);
  }
  const skip = new Set<string>([...kinds.ids.spital, ...kinds.ids.scoala, ...admins]);
  const out: { id: string; parent: number }[] = [], taken = new Set<string>();
  for (const x of LIST) {
    const parent = parentOf.get(x.parent);
    if (parent === undefined) continue;
    for (const id of byCui.get(x.cui) ?? []) {
      if (skip.has(id) || taken.has(id)) continue;
      taken.add(id); out.push({ id, parent });
    }
  }
  return out;
}
