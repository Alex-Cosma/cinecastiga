import { countWords } from "./ask/answer-text";

/*
 * „Reprezentant comun, aceeași autoritate” on a firm's case page (UX audit Z6-23, owner 16 November 2026): one row per
 * institution, not per person × institution. Each pair (a signal) says a person who represents several firms that all
 * contracted with the institution (core.flags.evidence: person, n_firms, combined, roles); the row names the people,
 * each with how many firms, and its sum is the largest of its groups. The pairs and their sources stay as they are.
 */

export interface SharedAdminPair { id: string; partnerId: string | null; partnerName: string | null; totalRon: number; evidence: Record<string, unknown> | null }
export interface SharedAdminPerson { name: string; firms: number; roles: string[] }
export interface SharedAdminRow { partnerId: string | null; partnerName: string | null; people: SharedAdminPerson[]; largest: { id: string; value: number; firms: number }; pairs: number }

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The pairs grouped by institution, the largest group first (its sum, then the name). */
export function groupSharedAdmin(pairs: readonly SharedAdminPair[]): SharedAdminRow[] {
  const rows = new Map<string, SharedAdminRow>();
  for (const p of pairs) {
    const key = p.partnerId ?? `name:${p.partnerName ?? text(p.evidence?.authority)}`;
    const e = p.evidence ?? {};
    const person: SharedAdminPerson = { name: text(e.person) || "—", firms: Number(e.n_firms) || 0,
      roles: Array.isArray(e.roles) ? e.roles.filter((r): r is string => typeof r === "string" && r.trim() !== "") : [] };
    const row = rows.get(key) ?? { partnerId: p.partnerId, partnerName: p.partnerName ?? (text(e.authority) || null), people: [], largest: { id: p.id, value: -1, firms: 0 }, pairs: 0 };
    row.pairs++;
    if (!row.people.some((x) => x.name === person.name)) row.people.push(person);
    if (p.totalRon > row.largest.value) row.largest = { id: p.id, value: p.totalRon, firms: person.firms };
    rows.set(key, row);
  }
  for (const r of rows.values()) r.people.sort((a, b) => b.firms - a.firms || a.name.localeCompare(b.name, "ro"));
  return [...rows.values()].sort((a, b) => b.largest.value - a.largest.value || String(a.partnerName).localeCompare(String(b.partnerName), "ro"));
}

/** The people of a row by how many firms each represents: [["A", "B"], 3], [["C"], 2]. */
export function peopleByFirms(people: readonly SharedAdminPerson[]): { people: SharedAdminPerson[]; firms: number }[] {
  const out: { people: SharedAdminPerson[]; firms: number }[] = [];
  for (const p of people) {
    const last = out[out.length - 1];
    if (last && last.firms === p.firms) last.people.push(p); else out.push({ people: [p], firms: p.firms });
  }
  return out;
}

/** „4 reprezentanți comuni”. */
export const sharedPeopleWords = (n: number): string => countWords(n, "reprezentant comun", "reprezentanți comuni");

/** One key for a row's people (the same people and counts on every row are said once, above the list). */
export const peopleKey = (people: readonly SharedAdminPerson[]): string => people.map((p) => `${p.name}:${p.firms}`).join("|");
