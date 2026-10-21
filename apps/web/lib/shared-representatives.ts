import { isOnrcIdentityBirthDate } from "@seap/db";

/**
 * "Administrator comun" between investigation members, from the ONRC file of
 * legal representatives (reference.company_reps).
 *
 * Two firms are linked only through a solid person identity: normalised name
 * + birth date + birth locality (person_key with a birth date). A row without
 * a birth date has the key "name||locality", which merges namesakes and
 * matches placeholders ("FARA REPREZENTANT", ~36.6k firms) and legal-person
 * representatives such as insolvency practitioners (one IPURL across ~2.3k
 * firms). Such rows never link two firms, the same rule as net_shared_admin,
 * the persons typeahead and getCompanyReps (audit F32). Neither does a
 * placeholder (1910-01-01, 1910-10-10) or implausible birth date: namesakes
 * would share it (audit F37, isOnrcIdentityBirthDate).
 */
export interface MemberRepRow {
  entity_id: string;
  person_key: string | null;
  person_name: string | null;
  birth_date: string | null;
  snapshot_date?: string | null;
}

export interface SharedRepresentative {
  a: string;
  b: string;
  personKey: string;
  name: string;
}

export function sharedRepresentativePairs(rows: MemberRepRow[]): SharedRepresentative[] {
  const byPerson = new Map<string, { name: string; entities: Set<string> }>();
  for (const r of rows) {
    if (!r.person_key || !isOnrcIdentityBirthDate(r.birth_date, r.snapshot_date)) continue;
    let p = byPerson.get(r.person_key);
    if (!p) byPerson.set(r.person_key, (p = { name: "", entities: new Set() }));
    const name = r.person_name ?? "";
    if (name > p.name) p.name = name;
    p.entities.add(r.entity_id);
  }
  const out: SharedRepresentative[] = [];
  for (const [personKey, p] of byPerson) {
    const ids = [...p.entities].sort((x, y) => (BigInt(x) < BigInt(y) ? -1 : BigInt(x) > BigInt(y) ? 1 : 0));
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) out.push({ a: ids[i]!, b: ids[j]!, personKey, name: p.name });
  }
  return out;
}
