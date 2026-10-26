import type { BlockData, PartialYear } from "../../lib/ask/compile";
import type { EvidenceFilters, EvidenceScope } from "../../lib/ask/evidence";
import { countWords, formatChange, formatShare } from "../../lib/ask/answer-text";
import { monthsLabel } from "../../lib/ask/months-window";
import { retarget } from "../../lib/ask/filters/retarget";
import { CHANNEL_PARTS, OTHER_PART, type SeriesPart, type SeriesPoint } from "../../lib/ask/series";
import type { AskSpec } from "../../lib/ask/spec";
import type { AboveCapRow, BarsResult } from "../../lib/ask/facet-parts";
import { formatInt, formatRon, formatRonFull } from "../../lib/format";
import { seriesAxis, type AxisPoint, type BeforeAxis } from "./series-labels";

/*
 * The evolution's answer as words and links (plan §4.3; final timeseries
 * §3.8–§3.10, §4): its bars (years from 2018 or months, continuous), the
 * parts of a split, the marker of the incomplete last year and the sheet of a
 * bar (component 19): its facts and the three answers about its period
 * („Cine a câștigat în {an}? ›”, „Ce s-a cumpărat în {an}? ›”, „Cine a crescut
 * sau a scăzut față de {an−1}? ›”), each through retarget (R8). Pure:
 * SeriesAnswer.tsx draws it, answer-csv.ts exports the same bars.
 */

export type SeriesData = Extract<BlockData, { block: "timeseries" }>;

const MONTH_NAMES = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"] as const;
const MONTH_SHORT = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."] as const;

/** A bar's key, the one the bar facts are kept by ("2025", "2025-03"). */
export const barKey = (p: Pick<SeriesPoint, "year" | "month">): string => p.month ? `${p.year}-${String(p.month).padStart(2, "0")}` : String(p.year);
/** "2025", "martie 2025". */
export const barName = (p: Pick<SeriesPoint, "year" | "month">): string => p.month ? `${MONTH_NAMES[p.month - 1]} ${p.year}` : String(p.year);
/** The axis label of a month: "ian. 2025" on January, "iul." on July, the short name elsewhere. */
export const monthTick = (p: Pick<SeriesPoint, "year" | "month">): string => p.month === 1 ? `${MONTH_SHORT[0]} ${String(p.year).slice(2)}` : MONTH_SHORT[(p.month ?? 1) - 1]!;

/** An empty month of the axis (a bar of 0, not a button). */
export type MonthAxisPoint = SeriesPoint | { year: number; month: number; value: 0; count: 0; empty: true };

/**
 * The bars: year by year from 2018 with the older contracts as one footer row
 * (series-labels.ts seriesAxis), or month by month, every month of the period
 * (an empty one is a bar of 0).
 */
export function seriesBars(data: SeriesData): { bars: (AxisPoint<SeriesPoint> | MonthAxisPoint)[]; before: BeforeAxis | null } {
  if (data.grain !== "month") return seriesAxis(data.series);
  const points = [...data.series].sort((a, b) => barKey(a).localeCompare(barKey(b)));
  if (!points.length) return { bars: [], before: null };
  const byKey = new Map(points.map((p) => [barKey(p), p]));
  const bars: MonthAxisPoint[] = [];
  let y = points[0]!.year, m = points[0]!.month ?? 1;
  const last = barKey(points[points.length - 1]!);
  for (let guard = 0; guard < 60; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    bars.push(byKey.get(key) ?? { year: y, month: m, value: 0, count: 0, empty: true });
    if (key >= last) break;
    if (++m > 12) { m = 1; y++; }
  }
  return { bars, before: null };
}

/** A split's parts in drawing order (bottom up) with their values on one bar; absent parts are 0. */
export function barParts(data: SeriesData, point: SeriesPoint): { part: SeriesPart; value: number; count: number }[] {
  return (data.parts ?? []).map((part) => ({ part, value: point.parts?.[part.key]?.value ?? 0, count: point.parts?.[part.key]?.count ?? 0 }));
}
/** The class of a part's colour: the channels' (R7: --fk-proc, --fk-da), the divisions' in order, „Alte domenii” grey. */
export function partTone(data: SeriesData, part: SeriesPart): string {
  if (part.key === "contracts") return "proc";
  if (part.key === "da") return "da";
  if (part.key === OTHER_PART.key) return "other";
  return `c${(data.parts ?? []).filter((p) => p.code).findIndex((p) => p.key === part.key) + 1}`;
}

/** The sources of one part of a bar: a channel by the drawer's own stream filter, a division by its code, the rest by the named ones left out. */
export function partSources(data: SeriesData, part: SeriesPart): { scope?: EvidenceScope; filters?: EvidenceFilters } {
  if (CHANNEL_PARTS.some((p) => p.key === part.key)) return { filters: { stream: part.key as "da" | "contracts" } };
  if (part.code) return { scope: { cpvPrefixes: [part.code] } };
  const named = (data.parts ?? []).flatMap((p) => p.code ? [p.code] : []);
  return named.length ? { scope: { excludeCpvPrefixes: named } } : {};
}

/** A bar's records: the year (with the answer's same months, the spec carries them), or the month as the question's period. */
export function barSources(spec: AskSpec, point: Pick<SeriesPoint, "year" | "month">): { spec: AskSpec; scope?: EvidenceScope } {
  if (!point.month) return { spec, scope: { years: [point.year] } };
  return { spec: { ...spec, filters: { ...spec.filters, yearFrom: point.year, yearTo: point.year, monthFrom: point.month, monthTo: point.month } } };
}

const named = (spec: AskSpec) => ({
  authority: Boolean(spec.filters.authorityId || spec.filters.authorityName || spec.filters.uatSiruta),
  supplier: Boolean(spec.filters.supplierId || spec.filters.supplierName || spec.filters.adminPersonKey || spec.filters.adminName),
});

/** The period of a bar on another question: its year, or its month. */
function onBar(spec: AskSpec, point: Pick<SeriesPoint, "year" | "month">): AskSpec {
  const filters = { ...spec.filters, yearFrom: point.year, yearTo: point.year };
  if (point.month) Object.assign(filters, { monthFrom: point.month, monthTo: point.month });
  else { delete filters.monthFrom; delete filters.monthTo; }
  return { ...spec, filters };
}

export interface BarLink { label: string; spec: AskSpec }
/**
 * The answers about a bar's period (final timeseries §3.10): who won and what
 * was bought, unless an institution and a firm are both named (one row); the
 * change against the year before, on year bars only, between two complete
 * years, or on the same months for the incomplete last year (the marker's
 * months); never on 2018 or 2019 (2018 is incomplete), nor with a record
 * threshold (the trend refuses it). A count says the trend is by value.
 */
export function barLinks(spec: AskSpec, data: SeriesData, point: Pick<SeriesPoint, "year" | "month">, partial: readonly PartialYear[]): BarLink[] {
  const who = named(spec), both = who.authority && who.supplier;
  const name = barName(point);
  const links: BarLink[] = [];
  if (!both) {
    const winners = retarget(onBar(spec, point), "table");
    winners.dim = who.supplier ? "authority" : "supplier";
    winners.topN = 10;
    links.push({ label: `Cine a câștigat în ${name}?`, spec: winners });
    links.push({ label: `Ce s-a cumpărat în ${name}?`, spec: retarget(onBar(spec, point), "breakdown") });
  }
  const year = point.year, before = year - 1;
  const incomplete = (y: number) => partial.some((p) => p.year === y);
  // The same months: those the evolution runs on, or the marker's on the incomplete last year (the trend's `auto`).
  const marker = data.ref && year === data.ref.year + 1 ? data.ref.months : null;
  const cut = spec.timeseries?.months ?? (marker ? "auto" as const : undefined);
  const windowed = data.months && !(data.months.from === 1 && data.months.to === 12) ? data.months : marker ? { from: marker[0], to: marker[1] } : null;
  const trendable = !point.month && !both && !spec.minimumRecords && before >= 2019 && !incomplete(before) && (!incomplete(year) || cut !== undefined);
  if (trendable) {
    const trend = retarget({ ...spec, filters: { ...spec.filters, yearFrom: before, yearTo: year } }, "trend");
    delete trend.filters.monthFrom; delete trend.filters.monthTo;
    trend.dim = who.supplier ? "authority" : "supplier";
    trend.topN = 10;
    trend.trend = { change: "up", ...(cut !== undefined ? { months: Array.isArray(cut) ? [cut[0], cut[1]] as const : cut } : {}) };
    const window = windowed ? ` (${monthsLabel(windowed)})` : "";
    links.push({ label: `Cine a crescut sau a scăzut față de ${before}${window}${spec.measure === "count" ? " (după valoare)" : ""}?`, spec: trend });
  }
  return links;
}

export interface BarFact { label: string; value: string }
/**
 * A bar's facts: its value and records, each part, the change against the
 * year before only between two complete years (on the incomplete last year,
 * the same months against the same months of the year before).
 */
export function barFacts(data: SeriesData, point: SeriesPoint, partial: readonly PartialYear[]): { facts: BarFact[]; lines: string[] } {
  const facts: BarFact[] = [{ label: "Valoare", value: formatRonFull(point.value) }, { label: "Înregistrări", value: formatInt(point.count) }];
  const lines: string[] = [];
  for (const { part, value, count } of data.parts ? barParts(data, point) : [])
    lines.push(`${part.label}: ${formatRon(value)} · ${countWords(count, "înregistrare", "înregistrări")}${point.value > 0 ? ` · ${formatShare(value / point.value)}` : ""}`);
  if (!point.month) {
    const incomplete = (y: number) => partial.some((p) => p.year === y);
    const previous = data.series.find((p) => p.year === point.year - 1 && !p.month);
    if (previous && previous.value > 0 && point.year - 1 > 2018 && !incomplete(point.year) && !incomplete(point.year - 1))
      lines.push(`Față de ${point.year - 1}: ${formatChange((point.value / previous.value - 1) * 100)}`);
    const ref = data.ref;
    if (ref && point.year === ref.year + 1 && ref.value > 0) {
      const months = monthsLabel({ from: ref.months[0], to: ref.months[1] });
      lines.push(`${months} ${point.year}: ${formatRon(ref.current.value)} · ${months} ${ref.year}: ${formatRon(ref.value)} · aceleași luni ${formatChange((ref.current.value / ref.value - 1) * 100)}`);
    }
  }
  return { facts, lines };
}

/** The largest record of a bar, as its line says it („1 contract: 946 mil. lei, 0,5% din an”). */
export function largestWords(point: SeriesPoint, max: { value: number; src: "da" | "contracts" }): string {
  const share = point.value > 0 ? ` (${formatShare(max.value / point.value)} din ${point.month ? "lună" : "an"})` : "";
  return `Cea mai mare înregistrare: ${formatRon(max.value)}${share}`;
}
/** The contracts above the cap of a bar („2 contracte peste 1 mld. lei, în afara barei”). */
export function aboveWords(n: number): string {
  return `${countWords(n, "contract", "contracte")} peste 1 mld. lei, în afara barei`;
}
/** Every contract above the cap of the bars drawn: the note under the chart. */
export function aboveTotal(facts: Pick<BarsResult, "above"> | null, bars: readonly { year: number; month?: number }[]): { n: number; first: string | null } {
  if (!facts?.above) return { n: 0, first: null };
  let n = 0, first: string | null = null;
  for (const bar of bars) {
    const at = facts.above[barKey(bar)];
    if (!at?.n) continue;
    n += at.n;
    first ??= barKey(bar);
  }
  return { n, first };
}
export type { AboveCapRow };
