/**
 * /harta (owner, 6 November 2026): the value contracted per inhabitant, by county and, inside one county, by UAT. The
 * shapes the API answers with and the pure arithmetic behind them, without the database (map-capita.ts reads it), so
 * the page can import the types and the tests can check the sums.
 *
 * Which institutions count is a kind of institution (`kind`). The first one is the strict list of the per-inhabitant
 * value (lib/ask/per-capita.ts): a UAT's own town hall, matched by name, county and SIRUTA to the INS RPL 2021
 * catalog, a București sector's town hall, and a county council. A county sums its town halls and its council; a UAT
 * its town hall. Values are contracted values (Ask's population: accepted DAs up to 2,000,000 lei and contract
 * allocations), never payments.
 */

export type MapLevel = "county" | "uat";
export type MapDataset = "all" | "da" | "contracts";
/** The kinds of institution the map can count; only the local administrations for now (owner: more kinds later). */
export const MAP_KINDS = ["local_admin"] as const;
export type MapKind = (typeof MAP_KINDS)[number];

export interface MapSelection {
  level: MapLevel;
  /** The county key (countyKey) whose UATs are asked; null on the county level. */
  county: string | null;
  /** "all": every year, the undated records included; else the chosen years, ascending. */
  years: "all" | string[];
  /** "all": every CPV division, records without a code included; else the chosen divisions ("45"), ascending. */
  cpv: "all" | string[];
  dataset: MapDataset;
  kind: MapKind;
}

/** Why an area has no value per inhabitant. */
export type MapGap =
  /** A UAT whose own administration the strict list does not hold: its value is unknown, not zero. */
  | "no_admin"
  /** A county whose county council the strict list does not hold: its sum lacks the council's, so no per-inhabitant figure. */
  | "no_council"
  /** No population to divide by. */
  | "no_population";

export interface MapArea {
  /** A county key ("bistrita-nasaud") or a UAT's SIRUTA code as text. */
  key: string;
  name: string;
  /** Resident population on 1 December 2021 (INS RPL 2021). */
  population: number | null;
  /**
   * The population the value is divided by. A UAT: its own. A county (owner, 6 November 2026): the population of the
   * UATs whose administration the list holds, the county council staying in the sum; București: the whole city.
   */
  denominator: number | null;
  /** Contracted value in lei of the selection; null where it is unknown (gap no_admin). */
  value: number | null;
  /** value / denominator; null with a gap. */
  perCapita: number | null;
  records: number;
  /** Institutions of the kind with at least one record in the selection. */
  buyers: number;
  /** Institutions of the kind the list holds for the area (a UAT: 0 or 1; a county: its town halls and its council). */
  institutions: number;
  gap: MapGap | null;
  /**
   * County level: denominator / population, the share of the county's people living in UATs whose administration the
   * list holds (1 for București: its city hall is the whole city's). The page says it under 90% („acoperire 70%”).
   */
  coverage?: number;
}

export interface MapResponse {
  selection: MapSelection;
  county: { key: string; name: string } | null;
  areas: MapArea[];
  /**
   * București's UAT level: the city hall (Primăria Municipiului București) buys for the whole city, so it has no
   * sector of its own; it is apart, divided by the city's population. Null elsewhere.
   */
  city: MapArea | null;
  totals: { value: number; records: number; buyers: number };
  /** Where the rows came from: the nightly table, or the transaction marts when it is not built yet. */
  source: "rollup" | "live";
  notes: { population: string; geometry: string; kind: string };
}

export interface MapOptions {
  kinds: { key: MapKind; label: string; levels: MapLevel[] }[];
  /** Years with records of the kind, with their value (every division, both channels); undated apart. */
  years: { year: string; value: number; records: number }[];
  undated: { value: number; records: number };
  /** CPV divisions with records of the kind, by value: the code, a short name and the official one. */
  cpv: { code: string; name: string; official: string | null; value: number; records: number }[];
  datasets: MapDataset[];
}

export class MapError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** A county's key: its name without diacritics, lower case, spaces as hyphens ("Satu Mare" → "satu-mare"); as the geometry files name it. */
export const countyKey = (name: string): string =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/^municipiul\s+/, "").replace(/\s+/g, "-");

const YEAR = /^(20[0-3]\d)$/;
const DIVISION = /^\d{2}$/;
const KEY = /^[a-z-]{2,20}$/;

function list(raw: string | null, valid: RegExp, what: string, max: number): "all" | string[] {
  if (raw === null || raw === "" || raw === "all") return "all";
  const items = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (!items.length || items.length > max || items.some((s) => !valid.test(s))) throw new MapError(`Parametrul ${what} nu e valid.`);
  return items.sort();
}

/** The selection of a request (`?level=uat&county=cluj&years=2024,2025&cpv=45,33&dataset=all&kind=local_admin`). */
export function parseMapSelection(params: URLSearchParams): MapSelection {
  const level = params.get("level") ?? "county";
  if (level !== "county" && level !== "uat") throw new MapError("Nivelul hărții e „county” sau „uat”.");
  const county = params.get("county");
  if (level === "uat" && (!county || !KEY.test(county))) throw new MapError("Alege un județ.");
  const dataset = params.get("dataset") ?? "all";
  if (dataset !== "all" && dataset !== "da" && dataset !== "contracts") throw new MapError("Setul de date nu e valid.");
  const kind = params.get("kind") ?? "local_admin";
  if (!(MAP_KINDS as readonly string[]).includes(kind)) throw new MapError("Tipul de instituție nu e disponibil pe hartă.");
  return {
    level, county: level === "uat" ? county : null,
    years: list(params.get("years"), YEAR, "years", 30), cpv: list(params.get("cpv"), DIVISION, "cpv", 100),
    dataset, kind: kind as MapKind,
  };
}

/** The query string of a selection, in a stable order (a cache key, a link). */
export function mapSelectionQuery(s: MapSelection): string {
  const p = new URLSearchParams({ level: s.level });
  if (s.county) p.set("county", s.county);
  p.set("years", s.years === "all" ? "all" : s.years.join(","));
  p.set("cpv", s.cpv === "all" ? "all" : s.cpv.join(","));
  p.set("dataset", s.dataset);
  p.set("kind", s.kind);
  return p.toString();
}

/** One grouped row: an institution (index into the administrations), its year, channel and division. */
export interface MapRow { a: number; y: string | null; src: "da" | "contracts"; c: string | null; v: number; n: number }
/** One institution of the kind: where it sits on the map. */
export interface MapInstitution { id: string; county: string; siruta: number | null; level: "local" | "county" }

/** Whether a row is in the selection's years, divisions and channel. */
export function rowSelected(row: MapRow, s: Pick<MapSelection, "years" | "cpv" | "dataset">, years: ReadonlySet<string> | null, cpv: ReadonlySet<string> | null): boolean {
  if (s.dataset !== "all" && row.src !== s.dataset) return false;
  if (years && (row.y === null || !years.has(row.y))) return false;
  if (cpv && (row.c === null || !cpv.has(row.c))) return false;
  return true;
}

/** Each institution's value, records in the selection (indexes of `institutions`). */
export function sumByInstitution(rows: readonly MapRow[], count: number, s: Pick<MapSelection, "years" | "cpv" | "dataset">): { v: Float64Array; n: Float64Array } {
  const v = new Float64Array(count), n = new Float64Array(count);
  const years = s.years === "all" ? null : new Set(s.years), cpv = s.cpv === "all" ? null : new Set(s.cpv);
  for (const row of rows) {
    if (!rowSelected(row, s, years, cpv)) continue;
    v[row.a]! += row.v; n[row.a]! += row.n;
  }
  return { v, n };
}

/** Lei per inhabitant, or null without a population. */
export const perCapita = (value: number | null, population: number | null): number | null =>
  value === null || !population || population <= 0 ? null : value / population;

/** Rounds a sum of lei to the ban, so float addition does not show (1234.5600000001). */
export const lei = (value: number): number => Math.round(value * 100) / 100;

/**
 * An area from its institutions' sums, divided by `denominator` (its own population unless given). `gap` set by the
 * caller wins; perCapita is null with any gap.
 */
export function areaOf(key: string, name: string, population: number | null, members: readonly number[], sums: { v: Float64Array; n: Float64Array }, gap: MapGap | null, denominator: number | null = population): MapArea {
  let value = 0, records = 0, buyers = 0;
  for (const i of members) { value += sums.v[i]!; records += sums.n[i]!; if (sums.n[i]! > 0) buyers++; }
  const known = gap === "no_admin" ? null : lei(value);
  const g = gap ?? (!denominator || denominator <= 0 ? "no_population" : null);
  return { key, name, population, denominator, value: known, perCapita: g ? null : perCapita(known, denominator), records, buyers, institutions: members.length, gap: g };
}
