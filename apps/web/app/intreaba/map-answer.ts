import { formatInt, formatRon } from "../../lib/format";
import { countWords, formatShare } from "../../lib/ask/answer-text";
import { countyDisplay } from "../../lib/ask/resolved-spec";
import { askedLens, mapFirm, mapLocalAdmin, type MapLensValue } from "../../lib/ask/map-lens";
import type { AskSpec } from "../../lib/ask/spec";
import type { BlockData } from "../../lib/ask/compile";
import type { MapCountyFacts, MapFacts, MapLocal } from "../../lib/ask/map-facts";
import type { AnswerFact } from "./answer/use-answer-fact";

/*
 * The map's lens and county card (F5, plan §4.4 P6, map final §3.7–§3.11),
 * for client and tests alike: which lenses „Harta arată” offers on a
 * question, the one shown, what each county is coloured by (or why it is
 * grey), the answer's title after the lens and the CSV's columns. The lens
 * never changes the selection: it is `measure` (value, records, per
 * inhabitant) or `map.lens` (seat, share) on the applied question, and draws
 * from the answer and its county facts (part `map`) with no request.
 */

type MapData = Extract<BlockData, { block: "map" }>;
export { askedLens, mapFirm, mapLocalAdmin, type MapLensValue };
export interface MapLensOption { value: MapLensValue; label: string; disabled?: string }

/** „Firme din județ” is grey under 20 records or past 10% of unknown seats (map final §3.9). */
export const SEAT_MIN_RECORDS = 20;
export const SEAT_MAX_UNKNOWN = 0.1;
/** „Cota firmei” is grey under 3 records of the firm or 20 of the county (map final §3.10). */
export const SHARE_MIN_FIRM = 3;
export const SHARE_MIN_COUNTY = 20;

export const FACTS_LOADING = "Se calculează.";
export const FACTS_NONE = "Nu e disponibil pentru această selecție.";
export const SEAT_WAITS = "Sediul firmei se completează la următoarea procesare.";

/**
 * The lenses of „Harta arată” (map final §3.7): with a firm or a person, Valoare · Cota firmei · Înregistrări; on
 * the local administrations, Valoare · Pe locuitor · Firme din județ · Înregistrări; elsewhere Valoare · Firme din
 * județ · Înregistrări (and the link „Pe locuitor →”, which changes the buyers). A lens the facts cannot draw yet is
 * disabled with the reason.
 */
export function mapLensOptions(spec: AskSpec, facts: AnswerFact<MapFacts>): MapLensOption[] {
  const why = facts.status === "loading" ? FACTS_LOADING : facts.status === "none" ? FACTS_NONE : null;
  const value: MapLensOption = { value: "value", label: "Valoare" }, count: MapLensOption = { value: "count", label: "Înregistrări" };
  if (mapFirm(spec)) {
    const label = spec.filters.adminPersonKey || spec.filters.adminName ? "Cota firmelor" : "Cota firmei";
    const share = why ?? (facts.status === "ready" && !facts.value.share ? FACTS_NONE : null);
    return [value, { value: "share", label, ...(share ? { disabled: share } : {}) }, count];
  }
  const seatWhy = why ?? (facts.status === "ready" && !facts.value.seat ? SEAT_WAITS : null);
  const seat: MapLensOption = { value: "seat", label: "Firme din județ", ...(seatWhy ? { disabled: seatWhy } : {}) };
  return mapLocalAdmin(spec) ? [value, { value: "value_per_capita", label: "Pe locuitor" }, seat, count] : [value, seat, count];
}

/** The lens drawn now: the asked one, or Valoare while its facts are not there. */
export function shownLens(spec: AskSpec, options: readonly MapLensOption[]): MapLensValue {
  const asked = askedLens(spec);
  return options.find((o) => o.value === asked && !o.disabled) ? asked : "value";
}

/** What a county shows on a lens: its number, or why it is grey (`muted`), or nothing (no record). */
export interface CountyMetric { metric: number | null; muted: string | null }

/** The share of the seat lens and why it is grey (map final §3.9). */
function seatMetric(f: MapCountyFacts | undefined): CountyMetric {
  if (!f?.seat || f.value <= 0) return { metric: null, muted: null };
  const share = f.seat.same.value / f.value;
  if (f.count < SEAT_MIN_RECORDS) return { metric: share, muted: `Sub ${SEAT_MIN_RECORDS} de înregistrări.` };
  if (f.seat.unknown.value > SEAT_MAX_UNKNOWN * f.value) return { metric: share, muted: "Sediu necunoscut pentru peste 10% din valoare." };
  return { metric: share, muted: null };
}

/** The firm's share of the county and why it is grey (map final §3.10). */
function shareMetric(value: number, count: number, f: MapCountyFacts | undefined): CountyMetric {
  if (count <= 0 || !f?.base || f.base.value <= 0) return { metric: null, muted: null };
  const share = value / f.base.value;
  if (count < SHARE_MIN_FIRM) return { metric: share, muted: `Firma are sub ${SHARE_MIN_FIRM} înregistrări în județ.` };
  if (f.base.count < SHARE_MIN_COUNTY) return { metric: share, muted: `Județul are sub ${SHARE_MIN_COUNTY} de înregistrări.` };
  return { metric: share, muted: null };
}

/** Each county's number on a lens, by its name as the answer writes it. */
export function countyMetrics(data: Pick<MapData, "counties" | "local">, lens: MapLensValue, facts: MapFacts | null): Map<string, CountyMetric> {
  const out = new Map<string, CountyMetric>();
  for (const c of data.counties) {
    const f = facts?.counties[c.county];
    if (lens === "count") out.set(c.county, { metric: c.count > 0 ? c.count : null, muted: null });
    else if (lens === "value_per_capita") {
      const population = data.local?.population[c.county];
      const missing = data.local?.missing.includes(c.county);
      out.set(c.county, { metric: population && c.value > 0 ? c.value / population : null, muted: missing ? "Consiliul județean nu e încă în listă." : null });
    } else if (lens === "seat") out.set(c.county, seatMetric(f));
    else if (lens === "share") out.set(c.county, shareMetric(c.value, c.count, f));
    else out.set(c.county, { metric: c.value > 0 ? c.value : null, muted: null });
  }
  return out;
}

/** A county's number in the words of its lens: "9 mil. lei", "4.716 lei/locuitor", "38,6%", "124 de înregistrări". */
export function metricWords(lens: MapLensValue, metric: number): string {
  if (lens === "count") return countWords(metric, "înregistrare", "înregistrări");
  if (lens === "value_per_capita") return `${formatInt(Math.round(metric))} lei/locuitor`;
  if (lens === "seat" || lens === "share") return formatShare(metric);
  return formatRon(metric);
}

/** The country's line under the map (map final §3.8–§3.10: „Pe țară”, with the same denominators). */
export function nationalMetric(data: Pick<MapData, "counties" | "unknown" | "local">, lens: MapLensValue, facts: MapFacts | null): number | null {
  const sum = (pick: (c: MapData["counties"][number]) => number) => data.counties.reduce((t, c) => t + pick(c), 0);
  if (lens === "value_per_capita") {
    const people = data.local ? Object.values(data.local.population).reduce((t, p) => t + p, 0) : 0;
    return people > 0 ? sum((c) => c.value) / people : null;
  }
  if (!facts) return null;
  const parts = Object.values(facts.counties);
  if (lens === "seat") {
    const total = parts.reduce((t, f) => t + f.value, 0);
    return total > 0 && facts.seat ? parts.reduce((t, f) => t + (f.seat?.same.value ?? 0), 0) / total : null;
  }
  if (lens === "share") {
    const base = parts.reduce((t, f) => t + (f.base?.value ?? 0), 0);
    return base > 0 ? sum((c) => c.value) / base : null;
  }
  return null;
}

/** The local map's notes under the map (map final §4): the list, CJ Ilfov at Ilfov, and the councils it lacks. */
export function localNotes(local: MapLocal): { text: string; tip: string }[] {
  const n = local.towns + local.sectors + local.councils;
  const notes = [{
    text: `Lista strictă: ${countWords(n, "administrație", "primării și consilii județene")}`,
    tip: `Aceeași listă ca la clasamentul pe locuitor: ${countWords(local.towns, "primărie", "primării")}, ${countWords(local.sectors, "primărie de sector", "primării de sector")}, ${countWords(local.councils, "consiliu județean", "consilii județene")}. Fără instituțiile, serviciile și companiile lor. Fiecare stă în județul pe care îl administrează: CJ Ilfov e la Ilfov.`,
  }];
  if (local.missing.length) notes.push({
    text: `Fără consiliul județean: ${local.missing.map(countyDisplay).join(", ")}`,
    tip: "Consiliul județean nu e încă în lista strictă. Pe locuitor, județul e gri: valoarea lui nu e completă.",
  });
  return notes;
}

/**
 * The map's CSV (map final §4 „Surse și CSV”): `inregistrari` for records; per inhabitant on the local map; the
 * card's buyer and record with their shares; the seat split; the firm's share beside a firm. The facts' columns
 * stay empty while they are not read.
 */
export function mapCsvRows(data: MapData, spec: AskSpec, facts: MapFacts | null, csvQ: (s: string | null | undefined) => string): string[] {
  const local = Boolean(data.local), firm = mapFirm(spec);
  const header = [
    "judet", "valoare_lei", "inregistrari",
    ...(local ? ["populatie", "lei_pe_locuitor"] : []),
    ...(firm ? ["cota_firmei"] : ["firme_din_judet", "firme_alte_judete", "din_bucuresti", "firme_straine", "sediu_necunoscut"]),
    "cel_mai_mare_cumparator", "pondere_cumparator", "cea_mai_mare_inregistrare", "pondere_inregistrare",
  ];
  const share = (part: number | undefined, whole: number) => part === undefined || whole <= 0 ? "" : String(Math.round((part / whole) * 1e6) / 1e6);
  const rows = data.counties.map((c) => {
    const f = facts?.counties[c.county];
    const population = data.local?.population[c.county];
    const seat = (k: "same" | "other" | "bucuresti" | "foreign" | "unknown") => f?.seat ? String(f.seat[k].value) : "";
    return [
      csvQ(c.county), c.value, c.count,
      ...(local ? [population ?? "", population && !data.local!.missing.includes(c.county) ? Math.round((c.value / population) * 100) / 100 : ""] : []),
      ...(firm ? [f?.base ? share(c.value, f.base.value) : ""] : [seat("same"), seat("other"), seat("bucuresti"), seat("foreign"), seat("unknown")]),
      csvQ(f?.buyer?.name ?? ""), share(f?.buyer?.value, c.value), f?.record?.value ?? "", share(f?.record?.value, c.value),
    ].join(",");
  });
  const unknown = data.unknown.count > 0
    ? [[csvQ("Județ necunoscut"), data.unknown.value, data.unknown.count, ...Array(header.length - 3).fill("")].join(",")] : [];
  return [header.join(","), ...rows, ...unknown];
}
