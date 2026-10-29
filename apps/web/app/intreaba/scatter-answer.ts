import { countWords, formatDecimal, formatShare } from "../../lib/ask/answer-text";
import { flagLabel } from "../../lib/flags";
import { KIND_ONE } from "../../lib/ask/question-ui";
import {
  RANK_WORDS, SCATTER_CLOUD_MIN_DAS, SCATTER_LIST_MIN_DAS, flagBit, flagDetail, scatterFlagsOf,
  type ScatterBands, type ScatterCloudPoint, type ScatterData, type ScatterFlag, type ScatterFlagFact, type ScatterListRow, type ScatterRole,
} from "../../lib/ask/scatter-shared";
import { formatInt, formatRon } from "../../lib/format";
import type { RowFact } from "./answer/RowFacts";

/*
 * The risk cloud as the screen draws it (scatter-2, final scatter §3.6): the
 * chart's geometry (one band per number of criteria, the value on a log
 * scale), the points, the words of a list row and of the card, and the CSV.
 * Pure: ScatterAnswer.tsx draws it, answer-csv.ts exports the same rows.
 */

export type ScatterV2 = Extract<ScatterData, { version: 2 }>;

/** The chart's size in px: 400 tall on a desktop, 300 on a phone (final §3.6). */
export interface ChartBox { width: number; height: number; compact: boolean }
export const chartBox = (width: number): ChartBox => {
  const compact = width < 600;
  return { width: Math.max(260, Math.round(width)), height: compact ? 300 : 400, compact };
};

/** Room around the plot: the bands' labels on the left, the decades under it. */
export function plotPad(box: ChartBox) {
  return { l: box.compact ? 44 : 58, r: 14, t: 14, b: box.compact ? 40 : 46 };
}

/** A stable spread inside a band: -0.5…0.5 from the id, so a point does not move between runs (no Math.random). */
export function jitter(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

/** A value on the horizontal axis in words: "1 mie", "50 mii", "2 mil.", "1 mld.". */
export function axisWords(value: number): string {
  if (value >= 1e9) return `${formatInt(value / 1e9)} mld.`;
  if (value >= 1e6) return `${formatInt(value / 1e6)} mil.`;
  const thousands = value / 1e3;
  return thousands === 1 ? "1 mie" : `${formatInt(thousands)} mii`;
}

/**
 * The ticks of the horizontal axis (a log scale): every decade from 1 mie to 1 mld.; a short range adds the 2 and the
 * 5 of each decade, so the axis is never one lonely label. A phone keeps the decades, every second one when crowded.
 */
export function axisTicks(x0: number, x1: number, compact: boolean): { lg: number; text: string }[] {
  const decades = Math.ceil(x1) - Math.floor(x0);
  const steps = decades <= 3 && !compact ? [1, 2, 5] : [1];
  const out: { lg: number; text: string }[] = [];
  for (let d = Math.floor(x0); d <= Math.ceil(x1); d++) for (const step of steps) {
    const value = step * 10 ** d, lg = Math.log10(value);
    if (d < 3 || d > 9 || lg < x0 || lg > x1) continue;
    out.push({ lg, text: axisWords(value) });
  }
  return compact && out.length > 4 ? out.filter((_, i) => i % 2 === 0) : out;
}

export interface Geometry {
  box: ChartBox;
  pad: ReturnType<typeof plotPad>;
  x0: number; x1: number;
  plotW: number; plotH: number; bandH: number;
  /** Pixels of a value / a band (0 at the bottom) / a point spread inside its band. */
  x(value: number): number;
  yBand(k: number): number;
  y(k: number, id: string): number;
  ticks: { lg: number; text: string; x: number }[];
}

/** The log10 range of the cloud: the points' or the cells' own, a little wider. */
export function logRange(data: ScatterV2): [number, number] {
  const c = data.cloud;
  const values = "points" in c ? c.points.map((p) => Math.log10(Math.max(p.value, 1))) : [c.bands.minLog, c.bands.maxLog, ...c.named.map((p) => Math.log10(Math.max(p.value, 1)))];
  const lo = values.length ? Math.min(...values) : 3, hi = Math.max(values.length ? Math.max(...values) : 9, lo + 0.5);
  const pad = (hi - lo) * 0.03;
  return [lo - pad, hi + pad];
}

export function geometry(data: ScatterV2, width: number): Geometry {
  const box = chartBox(width), pad = plotPad(box);
  const [x0, x1] = logRange(data);
  const plotW = box.width - pad.l - pad.r, plotH = box.height - pad.t - pad.b, bandH = plotH / (data.levels + 1);
  const x = (value: number) => pad.l + ((Math.log10(Math.max(value, 1)) - x0) / (x1 - x0)) * plotW;
  const yBand = (k: number) => box.height - pad.b - (k + 0.5) * bandH;
  const ticks = axisTicks(x0, x1, box.compact).map((t) => ({ ...t, x: pad.l + ((t.lg - x0) / (x1 - x0)) * plotW }));
  return { box, pad, x0, x1, plotW, plotH, bandH, x, yBand, y: (k, id) => yBand(k) + jitter(id) * bandH * 0.62, ticks };
}

/** The index beside a band: "0,6" with "3/5" under it (the index is shown unchanged, decision 22.10). */
export const bandIndex = (k: number, levels: number): { index: string; ratio: string } => ({ index: formatDecimal(k / levels, levels === 4 ? 2 : 1), ratio: `${k}/${levels}` });

/** The cells of the grey layer as rectangles, with an opacity that follows the square root of the count. */
export function cellRects(bands: ScatterBands, g: Geometry): { x: number; y: number; w: number; h: number; o: number; n: number }[] {
  const peak = Math.max(1, ...bands.cells.map((c) => c[2]));
  const cw = (bands.maxLog - bands.minLog) / bands.nx;
  return bands.cells.map(([bx, k, n]) => {
    const lg0 = bands.minLog + (bx - 1) * cw;
    const left = g.pad.l + ((lg0 - g.x0) / (g.x1 - g.x0)) * g.plotW, right = g.pad.l + ((lg0 + cw - g.x0) / (g.x1 - g.x0)) * g.plotW;
    return { x: left, y: g.yBand(k) - g.bandH * 0.36, w: Math.max(2, right - left), h: g.bandH * 0.72, o: 0.12 + 0.78 * Math.sqrt(n / peak), n };
  });
}

/** The line at the top 10%: the value above which a profile is among the group's largest tenth. */
export const p90Words = "cele mai mari 10%";

/** A point of the cloud with its marks (the chosen signal, in the list), for drawing and for the nearest-point search. */
export interface Dot { point: ScatterCloudPoint; x: number; y: number; flagged: boolean; listed: boolean }

export function dots(data: ScatterV2, g: Geometry, listed: ReadonlySet<string>): Dot[] {
  const c = data.cloud, flag = data.flag;
  const mask = flag ? flagBit(data.role, flag) : 0;
  const points = "points" in c ? c.points : c.named;
  return points.map((point) => ({ point, x: g.x(point.value), y: g.y(point.nFlags, point.id), flagged: mask !== 0 && (point.flags & mask) !== 0, listed: listed.has(point.id) }));
}

/** The point nearest to (x, y) within `reach` px, or null. */
export function nearest(all: readonly Dot[], x: number, y: number, reach = 16): Dot | null {
  let best: Dot | null = null, d2 = reach * reach;
  for (const dot of all) {
    const d = (dot.x - x) ** 2 + (dot.y - y) ** 2;
    if (d <= d2) { d2 = d; best = dot; }
  }
  return best;
}

// --- the words

/** "Primărie de comună", "Spital" (in the mixed group each row says its kind, final §3.6). */
export const kindWords = (kind: string | null | undefined): string | null => {
  const one = kind ? KIND_ONE[kind] : undefined;
  return one ? one.charAt(0).toLocaleUpperCase("ro-RO") + one.slice(1) : null;
};

/** "3 angajați · bilanț 2025", "fără bilanț" (a firm's size is a fact beside it, not a filter). */
export const employeesWords = (employees: number | null | undefined, year: number | null | undefined): string =>
  employees === null || employees === undefined ? "fără bilanț" : `${countWords(employees, "angajat", "angajați")} · bilanț ${year ?? "—"}`;

/** The line under a name in the list: the kind or the employees, the county, the acquisitions. */
export function rowMeta(row: ScatterListRow, role: ScatterRole): string {
  const first = role === "supplier" ? employeesWords(row.employees, row.employeesYear) : kindWords(row.kind);
  return [first, row.county, countWords(row.nDas, "achiziție directă", "achiziții directe")].filter(Boolean).join(" · ");
}

/** A signal's tag in the list and the card: the label with its years or share, orange (the official signals only). */
export function flagTag(fact: ScatterFlagFact): RowFact {
  const detail = flagDetail(fact);
  return { text: detail ? `${flagLabel(fact.code)} · ${detail}` : flagLabel(fact.code), tone: "signal" };
}

/** A row's signals with the facts that came after the answer (shares of the two rates, the records behind each). */
export function withFacts(flags: readonly ScatterFlagFact[], facts: readonly ScatterFlagFact[] | undefined): ScatterFlagFact[] {
  if (!facts) return [...flags];
  return flags.map((flag) => ({ ...flag, ...facts.find((f) => f.code === flag.code) }));
}

/** "Primele 10 din 82": the list head — the shown rows of the signal's list (all of the group's without one). */
export function listHeadWords(data: ScatterV2, shown: number): string {
  const total = data.chosen ? data.chosen.nList : data.group.nList;
  return `Primele ${formatInt(Math.min(shown, total))} din ${formatInt(total)}`;
}

/** The (?) of the head: the order, the 20-acquisition floor and how many are in the cloud alone. */
export function listHeadTip(data: ScatterV2): string {
  const order = data.rankBy === "risk" ? "Cele mai multe semnale; la egalitate, valoarea mai mare întâi." : "Cea mai mare valoare a achizițiilor directe.";
  if (data.group.small) return `${order} Grupul e mic: sunt listate toate profilurile cu cel puțin ${countWords(SCATTER_CLOUD_MIN_DAS, "achiziție directă", "achiziții directe")}.`;
  const only = data.group.n - data.group.nList;
  return `${order} În listă intră cine are cel puțin ${countWords(SCATTER_LIST_MIN_DAS, "achiziție directă", "achiziții directe")}.${only > 0 ? ` ${countWords(only, "profil e", "profiluri sunt")} doar în nor (${SCATTER_CLOUD_MIN_DAS}–${SCATTER_LIST_MIN_DAS - 1} achiziții).` : ""}`;
}

/** The sheet's facts line: "Achiziții directe: 21,0 mil. lei · Indice 0,6 · 3 din 5 semnale". */
export function cardFacts(value: number, cri: number, nFlags: number, levels: number): { label: string; value: string }[] {
  return [
    { label: "Achiziții directe:", value: formatRon(value) },
    { label: "Indice", value: formatDecimal(cri, levels === 4 ? 2 : 1) },
    { label: "", value: `${nFlags} din ${levels} semnale` },
  ];
}

/** The shown list as CSV rows (one row per profile of the 50): a place, the group's, the signals with their years or shares. */
export function scatterCsv(data: ScatterV2, csv: (value: unknown) => string): string[] {
  const firm = data.role === "supplier";
  const head = firm ? "loc,nume,angajati,an_bilant,sediu,valoare_lei,achizitii_directe,indice_de_risc,semnale,detalii_semnale"
    : "loc,nume,tip,judet,valoare_lei,achizitii_directe,indice_de_risc,semnale,detalii_semnale";
  return [head, ...data.list.map((r, i) => {
    const tags = r.flags.map((f) => flagTag(f).text);
    const own = firm ? [r.employees ?? "", r.employeesYear ?? "", csv(r.county)] : [csv(kindWords(r.kind) ?? ""), csv(r.county)];
    return [i + 1, csv(r.name), ...own, r.value, r.nDas, r.cri, r.nFlags, csv(r.flags.map((f) => f.code).join("|")), csv(tags.join("; "))].join(",");
  })];
}

export const rankHeading = (rank: "risk" | "value") => `după ${RANK_WORDS[rank]}`;
export const pctWords = (share: number) => formatShare(share).replace(/,0%$/, "%");
export { scatterFlagsOf, type ScatterFlag };
