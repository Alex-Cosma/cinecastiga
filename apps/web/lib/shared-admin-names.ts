import type { DbSql } from "@seap/db";
import { cleanName } from "./format";

/*
 * The names behind „Reprezentant comun” and Radiografie's „Administrator comun” (owner, 18 November 2026, legal
 * audit): a page that shows the signal does not carry the person's name. It is read here, on the reader's click, and
 * shown with the register's extraction date beside it — the register is today's, not the one at the award.
 */

export interface RevealedPerson { name: string; roles: string[] }
/** The people, grouped by how many firms each represents (null: the page already says the number). */
export interface RevealedNames { groups: { people: RevealedPerson[]; firms: number | null }[]; registry: string | null }

export const REVEAL_MAX_SIGNALS = 60;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The representatives named by the given „Reprezentant comun” signals (pairs of one institution's row, or one signal). */
export async function revealSignalNames(sql: DbSql, ids: readonly string[]): Promise<RevealedNames | null> {
  const rows = await sql`select f.evidence, e.cui_canonical cui
    from core.flags f left join core.entities e on e.id = f.subject_id and f.subject_type = 'supplier'
    where f.id = any(${ids as string[]}::bigint[]) and f.flag_code = 'net_shared_admin' and f.triggered`;
  if (!rows.length) return null;
  const people = new Map<string, { name: string; roles: string[]; firms: number }>();
  for (const r of rows) {
    const e = (r.evidence ?? {}) as Record<string, unknown>;
    const name = cleanName(text(e.person));
    if (!name) continue;
    const roles = Array.isArray(e.roles) ? e.roles.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
    const known = people.get(name) ?? { name, roles: [], firms: 0 };
    for (const role of roles) if (!known.roles.includes(role)) known.roles.push(role);
    known.firms = Math.max(known.firms, Number(e.n_firms) || 0);
    people.set(name, known);
  }
  const sorted = [...people.values()].sort((a, b) => b.firms - a.firms || a.name.localeCompare(b.name, "ro"));
  const groups: RevealedNames["groups"] = [];
  for (const p of sorted) {
    // One signal: its page says the number of firms in the title. Several: each group says its own.
    const firms = ids.length > 1 ? p.firms : null, last = groups[groups.length - 1];
    if (last && last.firms === firms) last.people.push({ name: p.name, roles: p.roles }); else groups.push({ people: [{ name: p.name, roles: p.roles }], firms });
  }
  const cuis = [...new Set(rows.map((r) => r.cui as string | null).filter((c): c is string => Boolean(c)))];
  const [snap] = cuis.length ? await sql`select max(snapshot_date)::text d from reference.company_reps where cui = any(${cuis}::text[])` : [];
  return { groups, registry: (snap?.d as string | null) ?? null };
}

/** The administrator a Radiografie lot pattern's members share, as the nightly mart recorded it. */
export async function revealPatternAdmin(sql: DbSql, authorityId: string, patternId: number): Promise<RevealedNames | null> {
  const [p] = await sql`select p.shared_admin, array(select m::bigint from unnest(p.member_ids) m) member_ids
    from marts.lot_patterns p where p.id = ${patternId} and p.authority_id = ${authorityId}`;
  const name = cleanName(text(p?.shared_admin));
  if (!name) return null;
  const [snap] = await sql`select max(r.snapshot_date)::text d from reference.company_reps r
    join core.entities e on e.cui_canonical = r.cui where e.id = any(${p!.member_ids as string[]}::bigint[])`;
  return { groups: [{ people: [{ name, roles: [] }], firms: null }], registry: (snap?.d as string | null) ?? null };
}
