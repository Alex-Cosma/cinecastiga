import type { DbSql } from "@seap/db";
import population from "./reference/population-rpl2021.json" with { type: "json" };
import { townHallIds } from "./locality-institutions";
import { entityHref } from "./entity-href";

/*
 * „Ce a cumpărat primăria ta?” (owner, 13 November 2026; mockup D): a town hall by its locality's name, opened on its
 * entity page. Every UAT of the 2021 census (communes, towns, municipalities, București and its sectors), named with
 * its diacritics; the town hall is the identity Întreabă counts as „primăria X” with the most records.
 */

interface Unit { siruta: number; name: string; county: string; countyKey: string; kind: "commune" | "city" | "municipality" | "sector"; population: number }
const UNITS = (population as unknown as { units: Unit[] }).units;

/** `href` null: the town hall has no record in the data (its locality is still named, never „not found”). */
export interface TownHallHit { id: string; href: string | null; name: string; detail: string }

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const title = (s: string) => s.toLocaleLowerCase("ro-RO").replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toLocaleUpperCase("ro-RO"));

/** „ORAȘ CISNĂDIE” → „Cisnădie”, „BUCUREȘTI SECTORUL 3” → „Sectorul 3”, „MUNICIPIUL BUCUREȘTI” → „București”. */
export function unitName(u: Pick<Unit, "name" | "kind">): string {
  const sector = /SECTORUL\s+(\d)/.exec(u.name);
  if (sector) return `Sectorul ${sector[1]}`;
  return title(u.name.replace(/^(?:ORAȘ|ORAŞ|MUNICIPIUL|COMUNA)\s+/, ""));
}

/** „Primăria Orașului Cisnădie · județul Sibiu”. */
export function unitDetail(u: Unit): string {
  const name = unitName(u);
  if (u.kind === "sector") return `Primăria ${name.replace("Sectorul", "Sectorului")} · București`;
  if (u.countyKey === "bucuresti") return "Primăria Municipiului București";
  const of = u.kind === "commune" ? "Comunei" : u.kind === "city" ? "Orașului" : "Municipiului";
  return `Primăria ${of} ${name} · județul ${title(u.county)}`;
}

const INDEX = UNITS.map((u) => ({ unit: u, key: fold(unitName(u)) }));

/** Up to `limit` units whose name starts with the words (then each word starting a word of the name, then anywhere), the larger first. */
export function matchUnits(term: string, limit = 8): Unit[] {
  const q = fold(term);
  if (q.length < 2) return [];
  const typed = q.split(" ");
  // „sector 3”, „ramnicu s”: each word typed starts a word of the name
  const words = (key: string) => { const own = key.split(" "); return typed.every((w) => own.some((k) => k.startsWith(w))); };
  const rank = (key: string) => key === q ? 0 : key.startsWith(q) ? 1 : words(key) ? 2 : key.includes(q) ? 3 : 9;
  return INDEX.map((x) => ({ ...x, r: rank(x.key) })).filter((x) => x.r < 9)
    .sort((a, b) => a.r - b.r || b.unit.population - a.unit.population).slice(0, limit).map((x) => x.unit);
}

export async function searchTownHalls(sql: DbSql, term: string): Promise<TownHallHit[]> {
  const units = matchUnits(term);
  if (!units.length) return [];
  const ids = new Map(await Promise.all(units.map(async (u) => [u.siruta, await townHallIds(sql, u.siruta)] as const)));
  const all = [...new Set([...ids.values()].flat())];
  const totals = all.length ? (await sql`
    select entity_id::text id, coalesce(total_ron_full, 0)::float8 v from marts.entity_profile where role = 'authority' and entity_id = any(${sql.array(all)}::bigint[])
  `) as unknown as { id: string; v: number }[] : [];
  const value = new Map(totals.map((t) => [t.id, t.v]));
  const out: TownHallHit[] = [];
  for (const u of units) {
    const best = (ids.get(u.siruta) ?? []).filter((id) => value.has(id)).sort((a, b) => (value.get(b) ?? 0) - (value.get(a) ?? 0))[0];
    out.push(best
      ? { id: best, href: entityHref(best, "authority"), name: unitName(u), detail: unitDetail(u) }
      : { id: `uat:${u.siruta}`, href: null, name: unitName(u), detail: `${unitDetail(u)} · fără achiziții în date` });
  }
  return out;
}
