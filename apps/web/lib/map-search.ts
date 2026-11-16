import geo from "./reference/uat-geo.json" with { type: "json" };
import catalog from "./reference/population-rpl2021.json" with { type: "json" };
import hospitalList from "./reference/hospitals-cnas-2025.json" with { type: "json" };
import schoolList from "./reference/schools-me-2025.json" with { type: "json" };
import { COUNTIES } from "./counties";
import { countyKey } from "./map-capita-shared";

/*
 * /harta's search (UX audit Z4-01, owner 16 November 2026): a locality or an institution by its name, so „primăria mea”
 * is one choice instead of finding a county and then one of its 40–100 shapes. The localities are the map's own UATs
 * (the ANCPI geometry's index, named as on the map) and București as a whole; the institutions are the map's hospitals
 * (CNAS's list) and schools (the Ministry of Education's network). Pure, without the database: the page opens the
 * county, the UAT's panel or the institution's circle itself.
 */

export interface MapSearchPlace {
  /** The UAT's SIRUTA; București as a whole has its own (179132) and no shape: the page opens the city. */
  siruta: number;
  name: string;
  /** „comună”, „oraș”, „municipiu”, „sector”. */
  kind: string;
  /** The county's key (`?judet=`) and its name with diacritics. */
  county: string;
  countyName: string;
}
export interface MapSearchInstitution {
  kind: "hospitals" | "schools";
  /** The map's key of the institution (its code in the list): the page lights its circle. */
  key: string;
  name: string;
  county: string;
  /** „Cisnădie, Sibiu”: where the map draws it. */
  place: string;
}
export interface MapSearchResult { places: MapSearchPlace[]; institutions: MapSearchInstitution[] }

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const COUNTY_NAME = new Map(COUNTIES.map((name) => [countyKey(name), name]));
const POPULATION = new Map((catalog.units as { siruta: number; population: number }[]).map((u) => [u.siruta, u.population]));
const UATS = (geo.uats as [number, string, string, string][]).map(([siruta, name, county, kind]) => ({ siruta, name, county, kind }));
const NAME_OF = new Map(UATS.map((u) => [u.siruta, u.name]));
const BUCHAREST = { siruta: 179132, name: "București", county: "bucuresti", kind: "municipiu" };

const PLACES = [BUCHAREST, ...UATS].map((u) => ({ u, key: fold(u.name), size: POPULATION.get(u.siruta) ?? 0 }));
type Listed = { kind: "hospitals" | "schools"; code: string; name: string; county: string; siruta: number | null; size: number };
const INSTITUTIONS: { x: Listed; key: string }[] = [
  ...[...hospitalList.hospitals, ...hospitalList.outside].map((h) => ({ kind: "hospitals" as const, code: h.code, name: h.name, county: h.county, siruta: h.siruta ?? null, size: h.beds ?? 0 })),
  ...(schoolList.schools as unknown as [string, string, string, number, number, string[]][]).map(([code, name, county, siruta, pupils]) => ({ kind: "schools" as const, code, name, county, siruta, size: pupils })),
].filter((x) => COUNTY_NAME.has(x.county)).map((x) => ({ x, key: fold(x.name) }));

/** 0: the whole name; 1: the name starts with the words; 2: every word typed starts a word of the name; 3: anywhere; 9: no. */
function rank(key: string, q: string, typed: readonly string[]): number {
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  const own = key.split(" ");
  if (typed.every((w) => own.some((k) => k.startsWith(w)))) return 2;
  return key.includes(q) ? 3 : 9;
}

/** Up to `places` localities and `institutions` institutions whose name matches the words, the closest and larger first. */
export function searchMap(term: string, limits: { places?: number; institutions?: number } = {}): MapSearchResult {
  const q = fold(term);
  if (q.length < 2) return { places: [], institutions: [] };
  const typed = q.split(" ");
  const places = PLACES.map((p) => ({ ...p, r: rank(p.key, q, typed) })).filter((p) => p.r < 9)
    .sort((a, b) => a.r - b.r || (a.u.kind === "sector" && b.u.kind === "sector" ? a.u.siruta - b.u.siruta : b.size - a.size))
    .slice(0, limits.places ?? 6)
    .map(({ u }) => ({ siruta: u.siruta, name: u.name, kind: u.kind, county: u.county, countyName: COUNTY_NAME.get(u.county) ?? u.county }));
  // Institutions only once the words are a little longer: two letters match half the country's schools.
  const institutions = q.length < 3 ? [] : INSTITUTIONS.map((i) => ({ ...i, r: rank(i.key, q, typed) })).filter((i) => i.r < 9)
    .sort((a, b) => a.r - b.r || (a.x.kind === b.x.kind ? 0 : a.x.kind === "hospitals" ? -1 : 1) || b.x.size - a.x.size)
    .slice(0, limits.institutions ?? 4)
    .map(({ x }) => {
      const county = COUNTY_NAME.get(x.county) ?? x.county;
      const town = x.siruta !== null ? NAME_OF.get(x.siruta) ?? (x.siruta === BUCHAREST.siruta ? "București" : null) : null;
      return { kind: x.kind, key: x.code, name: x.name, county: x.county, place: town && town !== county ? `${town}, ${county}` : county };
    });
  return { places, institutions };
}
