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
/**
 * The kinds of institution the map can count: the local administrations, and since 8 November 2026 the public
 * hospitals (owner): CNAS's 2025 list of public hospitals with their approved beds (lib/reference/hospitals-cnas-2025.json,
 * linked by hand to the buying institutions) and every other institution named a hospital (lib/ask/authority-kind.ts).
 */
export const MAP_KINDS = ["local_admin", "hospitals"] as const;
export type MapKind = (typeof MAP_KINDS)[number];
/** The kind's word in an address (`?inst=spitale`); the local administrations have none, as before. */
export const KIND_URL: Record<MapKind, string | null> = { local_admin: null, hospitals: "spitale" };

/**
 * The year of the hospitals' beds: CNAS publishes the structure approved at 31 December 2025, with no history. Owner,
 * 8 November 2026: lei per bed only when 2025 alone is chosen; any other choice of years shows the total contracted.
 */
export const BEDS_YEAR = "2025";
/** What an area's figure is: lei per inhabitant (local administrations), lei per bed (hospitals, 2025 alone), or lei. */
export type MapMetric = "perCapita" | "perBed" | "value";
export function mapMetric(s: Pick<MapSelection, "kind" | "years">): MapMetric {
  if (s.kind === "local_admin") return "perCapita";
  return s.years !== "all" && s.years.length === 1 && s.years[0] === BEDS_YEAR ? "perBed" : "value";
}
/** An area's figure in a metric: what the map's tint, the ranking's bars and its order read. */
export function figure(a: MapArea, metric: MapMetric): number | null {
  return metric === "perCapita" ? a.perCapita : metric === "perBed" ? a.perBed ?? null : a.value;
}

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
  | "no_population"
  /** Hospitals, 2025 alone: no bed in CNAS's list (a hospital it does not hold, or a county without one). */
  | "no_beds";

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
  /** Hospitals: the approved beds of the area's hospitals in CNAS's list (31 December 2025); null without any. */
  beds?: number | null;
  /** Hospitals, 2025 alone: the 2025 value of the hospitals with beds / their beds; null otherwise. */
  perBed?: number | null;
  /** A hospital (the open county's list): the UAT it is drawn in (SIRUTA; București's 179132 for the city's). */
  siruta?: number | null;
  /** A hospital: the institution its name links to (the identity with the largest value). */
  entityId?: string | null;
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
  /** What each area's figure is (mapMetric): the tint, the bars and the order read it. */
  metric: MapMetric;
  notes: { population: string; geometry: string; kind: string; beds?: string };
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

/** A hospital of the map (lib/map-hospitals.ts): one of CNAS's list (its code, beds and place), or one named a hospital outside it (no beds). */
export interface MapHospital { code: string; name: string; county: string; siruta: number | null; beds: number | null }

function summed(members: readonly number[], sums: { v: Float64Array; n: Float64Array }): { value: number; records: number } {
  let value = 0, records = 0;
  for (const i of members) { value += sums.v[i]!; records += sums.n[i]!; }
  return { value, records };
}

/**
 * One hospital (owner, 8 November 2026): its identities' sums (`members`, indexes of the institutions). Lei per bed only
 * with `perBed` (2025 alone, mapMetric) and beds; a hospital without beds then has the gap no_beds, its value still shown.
 */
export function hospitalArea(h: MapHospital, members: readonly number[], sums: { v: Float64Array; n: Float64Array }, perBed: boolean, entityId: string | null): MapArea {
  const { value, records } = summed(members, sums);
  const beds = h.beds !== null && h.beds > 0 ? h.beds : null;
  return {
    key: h.code, name: h.name, population: null, denominator: perBed ? beds : null, value: lei(value), perCapita: null,
    records, buyers: records > 0 ? 1 : 0, institutions: 1, gap: perBed && beds === null ? "no_beds" : null,
    beds, perBed: perBed && beds !== null ? value / beds : null, siruta: h.siruta, entityId,
  };
}

/**
 * A county's hospitals: every one in the value; lei per bed (2025 alone) is the 2025 value of the hospitals with beds
 * over their beds, so a hospital CNAS does not list neither adds lei nor hides a county's figure.
 */
export function hospitalCountyArea(key: string, name: string, hospitals: readonly { h: MapHospital; members: readonly number[] }[], sums: { v: Float64Array; n: Float64Array }, perBed: boolean): MapArea {
  let value = 0, records = 0, buyers = 0, beds = 0, bedsValue = 0;
  for (const { h, members } of hospitals) {
    const t = summed(members, sums);
    value += t.value; records += t.records;
    if (t.records > 0) buyers++;
    if (h.beds !== null && h.beds > 0) { beds += h.beds; bedsValue += t.value; }
  }
  return {
    key, name, population: null, denominator: perBed && beds ? beds : null, value: lei(value), perCapita: null,
    records, buyers, institutions: hospitals.length, gap: perBed && !beds ? "no_beds" : null,
    beds: beds || null, perBed: perBed && beds ? bedsValue / beds : null,
  };
}

/**
 * One UAT's panel (/harta, a click on a UAT; owner, 6 November 2026, "Povestea în trei întrebări"): its area in the
 * selection, its place among the county's UATs, the county's figure, its years (every year, for the selection's CPV and
 * channel), its CPV divisions and channels (for the selection's years), its largest suppliers and its neighbours.
 */
export interface MapUatResponse {
  selection: MapSelection;
  county: { key: string; name: string; perCapita: number | null };
  uat: MapArea & { kind: string };
  /** The UAT's own administration(s), the largest first: the name links to its page. */
  townHalls: { id: string; name: string; value: number }[];
  /** 1-based place by lei per inhabitant among the county's UATs with a figure; null with a gap. */
  place: number | null;
  ranked: number;
  years: { year: string; value: number; records: number; perCapita: number | null; countyPerCapita: number | null; selected: boolean }[];
  cpv: { code: string | null; name: string; value: number; records: number }[];
  channels: { da: number; contracts: number };
  suppliers: { id: string; name: string; value: number; records: number }[];
  neighbours: { key: string; name: string; perCapita: number | null }[];
}
