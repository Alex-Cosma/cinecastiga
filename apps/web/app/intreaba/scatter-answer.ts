import { countWords, formatDecimal, formatShare } from "../../lib/ask/answer-text";
import { KIND_ONE, questionKey, type QuestionSpec } from "../../lib/ask/question-ui";
import type { ProfileFactsResult } from "../../lib/ask/facet-parts";
import type { AskSpec, RankBy } from "../../lib/ask/spec";
import {
  RANK_WORDS, RANK_WORDS_V2, SCATTER_CLOUD_MIN_DAS, SCATTER_LIST_MAX, SCATTER_LIST_MIN_DAS, codeBit, flagDetail, isScatterFlag, scatterCodes, scatterFlagLabel, scatterFlagsOf, withScatterChoice,
  type ScatterBands, type ScatterCloudPoint, type ScatterCloudPointV2, type ScatterData, type ScatterDataV2, type ScatterDataV3, type ScatterFlag, type ScatterFlagFact,
  type ScatterListRow, type ScatterListRowV2, type ScatterRole,
} from "../../lib/ask/scatter-shared";
import { RISK_BAND_MIN, RISK_BAND_WORD, riskBand, riskPercent } from "../../lib/risk-score";
import { formatInt, formatRon } from "../../lib/format";
import type { RowFact } from "./answer/RowFacts";

/*
 * The risk cloud as the screen draws it (scatter-3, rf-2026.18; final scatter
 * §3.6): the chart's geometry (the risk score from 0 to 100% upwards, the
 * value on a log scale), the points, the words of a list row and of the card,
 * and the CSV. A stored scatter-2 (a watch's, a capture's) keeps its own
 * geometry, one band per number of criteria with the index beside it, and its
 * words. Pure: ScatterAnswer.tsx draws it, answer-csv.ts exports the same rows.
 */

export type ScatterV3 = ScatterDataV3;
/** A stored scatter-2 answer (before rf-2026.18). */
export type ScatterV2 = ScatterDataV2;
/** A point of either version. */
export type AnyCloudPoint = ScatterCloudPoint | ScatterCloudPointV2;
/** A row of either version. */
export type AnyListRow = ScatterListRow | ScatterListRowV2;

/** The chart's size in px: 400 tall on a desktop, 300 on a phone (final §3.6). */
export interface ChartBox { width: number; height: number; compact: boolean }
export const chartBox = (width: number): ChartBox => {
  const compact = width < 600;
  return { width: Math.max(260, Math.round(width)), height: compact ? 300 : 400, compact };
};

/** Room around the plot: the risk's labels on the left, the decades under it, the words of the top 10% over it. */
export function plotPad(box: ChartBox) {
  return { l: box.compact ? 44 : 58, r: 14, t: 24, b: box.compact ? 40 : 46 };
}

/** A stable spread: -0.5…0.5 from the id, so a point does not move between runs (no Math.random). */
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
 * 5 of each decade, so the axis is never one lonely label. A phone keeps the decades while they are three or more,
 * else the 2 and the 5 too, at most four, evenly spaced.
 */
export function axisTicks(x0: number, x1: number, compact: boolean): { lg: number; text: string }[] {
  const decades = Math.ceil(x1) - Math.floor(x0);
  const at = (steps: readonly number[]) => {
    const out: { lg: number; text: string }[] = [];
    for (let d = Math.floor(x0); d <= Math.ceil(x1); d++) for (const step of steps) {
      const value = step * 10 ** d, lg = Math.log10(value);
      if (d < 3 || d > 9 || lg < x0 || lg > x1) continue;
      out.push({ lg, text: axisWords(value) });
    }
    return out;
  };
  if (!compact) return at(decades <= 3 ? [1, 2, 5] : [1]);
  const plain = at([1]), out = plain.length >= 3 || decades > 3 ? plain : at([1, 2, 5]);
  const every = Math.ceil(out.length / 4);
  return every > 1 ? out.filter((_, i) => i % every === 0) : out;
}

/**
 * The risk axis (scatter-3): a line at the lowest score of a pattern (20%: one criterion at level 1) and at the first
 * score of each stronger band (moderat 40%, puternic 68%), the bands of lib/risk-score.ts.
 */
export const RISK_GRID: readonly number[] = [20, RISK_BAND_MIN.moderat, RISK_BAND_MIN.puternic];
/** The labels beside the risk axis, in %. */
export const RISK_AXIS: readonly number[] = [0, ...RISK_GRID, 100];
/** The tinted zones of the bands: slab 20–39, moderat 40–67, puternic 68–100 (0 has none). */
export const RISK_ZONES: readonly { from: number; to: number; band: "slab" | "moderat" | "puternic" }[] = [
  { from: 20, to: RISK_BAND_MIN.moderat, band: "slab" },
  { from: RISK_BAND_MIN.moderat, to: RISK_BAND_MIN.puternic, band: "moderat" },
  { from: RISK_BAND_MIN.puternic, to: 100, band: "puternic" },
];
/** A point's spread around its score, in px (±half): it tells apart the profiles of one score, never moves one by a band. */
export const SCORE_SPREAD = 4;
/** Room inside the plot at 0 and 100, so the spread stays inside it. */
const SCORE_INSET = 6;

export interface Geometry {
  box: ChartBox;
  pad: ReturnType<typeof plotPad>;
  x0: number; x1: number;
  plotW: number; plotH: number;
  /** A stored scatter-2: one band per number of criteria met, this tall. 0 on scatter-3's continuous risk axis. */
  bandH: number;
  /** Pixels of a value; of a level (scatter-3: the score 0–100; scatter-2: the middle of the band of k criteria). */
  x(value: number): number;
  yAt(level: number): number;
  /** A point at its level, spread by a stable hash (inside its band on scatter-2; SCORE_SPREAD px on scatter-3). */
  y(level: number, id: string): number;
  ticks: { lg: number; text: string; x: number }[];
  /** scatter-2's bands. */
  legacy: boolean;
}

/** The log10 range of the cloud: the points' or the cells' own, a little wider. */
export function logRange(data: ScatterData): [number, number] {
  const c = data.cloud;
  const values = "points" in c ? c.points.map((p) => Math.log10(Math.max(p.value, 1))) : [c.bands.minLog, c.bands.maxLog, ...c.named.map((p) => Math.log10(Math.max(p.value, 1)))];
  const lo = values.length ? Math.min(...values) : 3, hi = Math.max(values.length ? Math.max(...values) : 9, lo + 0.5);
  const pad = (hi - lo) * 0.03;
  return [lo - pad, hi + pad];
}

export function geometry(data: ScatterData, width: number): Geometry {
  const box = chartBox(width), pad = plotPad(box);
  const [x0, x1] = logRange(data);
  const plotW = box.width - pad.l - pad.r, plotH = box.height - pad.t - pad.b, bottom = box.height - pad.b;
  const x = (value: number) => pad.l + ((Math.log10(Math.max(value, 1)) - x0) / (x1 - x0)) * plotW;
  const ticks = axisTicks(x0, x1, box.compact).map((t) => ({ ...t, x: pad.l + ((t.lg - x0) / (x1 - x0)) * plotW }));
  if (data.version === 2) {
    const bandH = plotH / (data.levels + 1);
    const yAt = (k: number) => bottom - (k + 0.5) * bandH;
    return { box, pad, x0, x1, plotW, plotH, bandH, x, yAt, y: (k, id) => yAt(k) + jitter(id) * bandH * 0.62, ticks, legacy: true };
  }
  const yAt = (score: number) => bottom - SCORE_INSET - (Math.min(100, Math.max(0, score)) / 100) * (plotH - 2 * SCORE_INSET);
  return { box, pad, x0, x1, plotW, plotH, bandH: 0, x, yAt, y: (score, id) => yAt(score) + jitter(id) * SCORE_SPREAD, ticks, legacy: false };
}

/** The index beside a band of a stored scatter-2: "0,6" with "3/5" under it (the index was shown unchanged, decision 22.10). */
export const bandIndex = (k: number, levels: number): { index: string; ratio: string } => ({ index: formatDecimal(k / levels, levels === 4 ? 2 : 1), ratio: `${k}/${levels}` });

/**
 * The cells of the grey layer as rectangles, with an opacity that follows the square root of the count: a tenth of the
 * score each (scatter-3), or a band of criteria (scatter-2).
 */
export function cellRects(bands: ScatterBands, g: Geometry): { x: number; y: number; w: number; h: number; o: number; n: number }[] {
  const peak = Math.max(1, ...bands.cells.map((c) => c[2]));
  const cw = (bands.maxLog - bands.minLog) / bands.nx;
  return bands.cells.map(([bx, k, n]) => {
    const lg0 = bands.minLog + (bx - 1) * cw;
    const left = g.pad.l + ((lg0 - g.x0) / (g.x1 - g.x0)) * g.plotW, right = g.pad.l + ((lg0 + cw - g.x0) / (g.x1 - g.x0)) * g.plotW;
    const o = 0.12 + 0.78 * Math.sqrt(n / peak), w = Math.max(2, right - left);
    if (g.legacy) return { x: left, y: g.yAt(k) - g.bandH * 0.36, w, h: g.bandH * 0.72, o, n };
    // A tenth: from its lowest score to the next tenth's (90–100 the last), a pixel apart from its neighbours.
    const top = g.yAt(Math.min(100, (k + 1) * 10)), low = g.yAt(k * 10);
    return { x: left, y: top + 0.5, w, h: Math.max(1, low - top - 1), o, n };
  });
}

/** The line at the top 10%: the value above which a profile is among the group's largest tenth. */
export const p90Words = "cele mai mari 10%";

/** A box on the chart, in px. */
export interface LabelBox { x0: number; x1: number; y0: number; y1: number }
/** Approximate width of a chart text in px (11–11.5 px type). */
const textWidth = (text: string): number => text.length * 6.3;

/**
 * The words of the top 10% over the plot, beside the line (before it when they would leave the chart): above the
 * plot, so they never sit on its points (F6b review: on a phone they covered a point of the top band).
 */
export function p90Label(g: Geometry, p90: number): { x: number; y: number; anchor: "start" | "end"; box: LabelBox } {
  const line = g.x(p90), w = textWidth(p90Words), end = line + 4 + w > g.box.width;
  const x = end ? line - 4 : line + 4, y = g.pad.t - 8;
  return { x, y, anchor: end ? "end" : "start", box: { x0: end ? x - w : x, x1: end ? x : x + w, y0: y - 10, y1: y + 3 } };
}

/**
 * The largest dot's radius (a listed point, ScatterAnswer.tsx): a name's box keeps this far from every other point,
 * so a name never sits on another dot (S6, F6b verify: at 390 px „Comuna Sageata” covered Largu's dot).
 */
export const LABEL_DOT_R = 4.5;
export interface ChartLabel { id: string; x: number; y: number; anchor: "start" | "end"; text: string }

/**
 * The first names of the list on the chart, each where it fits: the side with the room first (right on the left of
 * the chart), then the other. A name that would sit on another label, on the words of the top 10% or on another
 * point, or cross the line, is left to the list (a phone's narrow chart; F6b review: at 390 px a firm's name crossed
 * the line and its points; S6: a commune's name covered another commune's dot).
 *
 * `focus`, the point chosen and the ones „Unde e …?” found, keeps its name at every width (final §3.6, „inel + nume”;
 * S6 review: at 390 px no name was left): placed first, where it fits if it can; else on the side with more room,
 * shortened to it, over whatever lies there. The list's names then keep off it.
 */
export function chartLabels(names: readonly { id: string; text: string }[], all: readonly Dot[], g: Geometry, p90: number,
  focus: readonly { id: string; text: string }[] = []): ChartLabel[] {
  const line = p90 > 0 ? g.x(p90) : null;
  const placed: LabelBox[] = line === null ? [] : [p90Label(g, p90).box], out: ChartLabel[] = [];
  for (const { id, text } of focus) {
    const d = all.find((x) => x.point.id === id);
    if (!d || out.some((l) => l.id === id)) continue;
    const fit = fitLabel(d, text, all, g, line, placed);
    const right = fit ? fit.right : g.box.width - d.x >= d.x - g.pad.l;
    const room = right ? g.box.width - (d.x + 8) : d.x - 8 - g.pad.l;
    const shown = fit ? text : shorten(text, room);
    if (!shown) continue;
    const x = d.x + (right ? 8 : -8), w = textWidth(shown);
    placed.push({ x0: right ? x : x - w, x1: right ? x + w : x, y0: d.y - 8, y1: d.y + 6 });
    out.push({ id, x, y: d.y + 3, anchor: right ? "start" : "end", text: shown });
  }
  for (const { id, text } of names) {
    const d = all.find((x) => x.point.id === id);
    if (!d || out.some((l) => l.id === id)) continue;
    const side = fitLabel(d, text, all, g, line, placed);
    if (!side) continue;
    placed.push(side.box);
    out.push({ id, x: side.x, y: d.y + 3, anchor: side.right ? "start" : "end", text });
  }
  return out;
}

/** A name shortened to `room` px with „…”, or null when not even a few letters fit. */
function shorten(text: string, room: number): string | null {
  if (textWidth(text) <= room) return text;
  const n = Math.floor(room / 6.3) - 1;
  return n >= 4 ? `${text.slice(0, n).trimEnd()}…` : null;
}

/** The first side of a dot where its name fits: inside the chart, off the line, the other labels and every other point. */
function fitLabel(d: Dot, text: string, all: readonly Dot[], g: Geometry, line: number | null, placed: readonly LabelBox[]):
  { right: boolean; x: number; box: LabelBox } | null {
  const w = textWidth(text);
  const sides = (d.x < g.box.width * 0.62 ? [true, false] : [false, true]).map((right) => {
    const x = d.x + (right ? 8 : -8), box = { x0: right ? x : x - w, x1: right ? x + w : x, y0: d.y - 8, y1: d.y + 6 };
    const fits = box.x0 >= g.pad.l && box.x1 <= g.box.width && (line === null || line <= box.x0 || line >= box.x1)
      && !placed.some((p) => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1);
    const covers = all.some((o) => o !== d && o.x + LABEL_DOT_R > box.x0 && o.x - LABEL_DOT_R < box.x1 && o.y + LABEL_DOT_R > box.y0 && o.y - LABEL_DOT_R < box.y1);
    return { right, x, box, fits: fits && !covers };
  }).filter((side) => side.fits);
  const side = sides[0];
  return side ? { right: side.right, x: side.x, box: side.box } : null;
}

/** A point of the cloud with its marks (the chosen signal, in the list), for drawing and for the nearest-point search. */
export interface Dot { point: AnyCloudPoint; x: number; y: number; flagged: boolean; listed: boolean }

/** A point's level on the chart: its unrounded score (scatter-3), or its number of criteria (scatter-2's band). */
export const pointLevel = (data: ScatterData, point: AnyCloudPoint): number =>
  data.version === 2 ? point.nFlags : (point as ScatterCloudPoint).scoreRaw;

/** The bit of the chosen signal on the answer's points (0 without one). */
const chosenMask = (data: ScatterData): number => (data.flag ? codeBit(scatterCodes(data), data.flag) : 0);

export function dots(data: ScatterData, g: Geometry, listed: ReadonlySet<string>): Dot[] {
  const c = data.cloud, mask = chosenMask(data);
  const points: readonly AnyCloudPoint[] = "points" in c ? c.points : c.named;
  return points.map((point) => ({ point, x: g.x(point.value), y: g.y(pointLevel(data, point), point.id), flagged: mask !== 0 && (point.flags & mask) !== 0, listed: listed.has(point.id) }));
}

/**
 * A profile the search found or a row of the list's tail, exact on a chart of cells (final §3.6: the named, found and
 * chosen points stay exact): from its value, its level (the score, or the criteria of a scatter-2) and its signals,
 * with no request.
 */
export function exactDot(data: ScatterData, g: Geometry, p: { id: string; name: string; value: number; level: number; nFlags: number; nDas: number; codes: readonly string[] }): Dot {
  const codes = scatterCodes(data);
  let flags = 0;
  for (const code of codes) if (p.codes.includes(code)) flags |= codeBit(codes, code);
  const point: AnyCloudPoint = data.version === 2 ? { id: p.id, name: p.name, value: p.value, nFlags: p.nFlags, nDas: p.nDas, flags }
    : { id: p.id, name: p.name, value: p.value, score: p.level, scoreRaw: p.level, nFlags: p.nFlags, nDas: p.nDas, flags };
  const mask = chosenMask(data);
  return { point, x: g.x(point.value), y: g.y(p.level, point.id), flagged: mask !== 0 && (flags & mask) !== 0, listed: false };
}

/** Whether id `a` comes before `b` (bigint ids as text: shorter is smaller), the list's last tie-break. */
const idBefore = (a: string, b: string): boolean => a.length !== b.length ? a.length < b.length : a < b;

/**
 * A point's place in the list of the strip's order and signal, from the cloud drawn point by point (every profile of
 * the group is there): the same order as the server (scatter.ts scatterOrder: the unrounded score, then the value, then
 * the id), so a point past the first 50 still says "locul 73 din 120". Null when it is not in the list (under the
 * floor, without the signal) or the cloud is cells.
 */
export function pointPlace(data: ScatterData, id: string): number | null {
  if (!("points" in data.cloud)) return null;
  const floor = data.group.small ? SCATTER_CLOUD_MIN_DAS : SCATTER_LIST_MIN_DAS;
  const mask = chosenMask(data);
  const points: readonly AnyCloudPoint[] = data.cloud.points;
  const listed = points.filter((p) => p.nDas >= floor && (mask === 0 || (p.flags & mask) !== 0));
  const me = listed.find((p) => p.id === id);
  if (!me) return null;
  const mine = pointLevel(data, me);
  const ahead = (p: AnyCloudPoint) => {
    const level = pointLevel(data, p);
    const byValue = p.value > me.value || p.value === me.value && idBefore(p.id, me.id);
    return data.rankBy === "risk" ? level > mine || level === mine && byValue : byValue;
  };
  return 1 + listed.filter((p) => p !== me && ahead(p)).length;
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

/** The strip's words for the order: "risc" (scatter-3), "semnale" on a stored scatter-2. */
export const rankWords = (data: { version: 2 | 3 }): Readonly<Record<RankBy, string>> => (data.version === 2 ? RANK_WORDS_V2 : RANK_WORDS);

/** "Primărie de comună", "Spital" (in the mixed group each row says its kind, final §3.6). */
export const kindWords = (kind: string | null | undefined): string | null => {
  const one = kind ? KIND_ONE[kind] : undefined;
  return one ? one.charAt(0).toLocaleUpperCase("ro-RO") + one.slice(1) : null;
};

/** "3 angajați · bilanț 2025", "fără bilanț" (a firm's size is a fact beside it, not a filter). */
export const employeesWords = (employees: number | null | undefined, year: number | null | undefined): string =>
  employees === null || employees === undefined ? "fără bilanț" : `${countWords(employees, "angajat", "angajați")} · bilanț ${year ?? "—"}`;

/** The line under a name in the list: the kind or the employees, the county, the acquisitions. */
export function rowMeta(row: AnyListRow, role: ScatterRole): string {
  const first = role === "supplier" ? employeesWords(row.employees, row.employeesYear) : kindWords(row.kind);
  return [first, row.county, countWords(row.nDas, "achiziție directă", "achiziții directe")].filter(Boolean).join(" · ");
}

/** A signal's tag in the list and the card: the label with its years or share, orange (the official signals only). */
export function flagTag(fact: ScatterFlagFact<string>): RowFact {
  const detail = flagDetail(fact);
  const label = scatterFlagLabel(fact.code);
  return { text: detail ? `${label} · ${detail}` : label, tone: "signal" };
}

/** A row's signals with the facts that came after the answer (shares of the per-acquisition signals, the records behind each). */
export function withFacts<C extends string>(flags: readonly ScatterFlagFact<C>[], facts: readonly ScatterFlagFact<string>[] | undefined): ScatterFlagFact<C>[] {
  if (!facts) return [...flags];
  return flags.map((flag) => ({ ...flag, ...facts.find((f) => f.code === flag.code), code: flag.code }));
}

/** "Primele 10 din 82": the list head — the shown rows of the signal's list (all of the group's without one). */
export function listHeadWords(data: ScatterData, shown: number): string {
  const total = data.chosen ? data.chosen.nList : data.group.nList;
  return `Primele ${formatInt(Math.min(shown, total))} din ${formatInt(total)}`;
}

/** The (?) of the head: the order, the 20-acquisition floor and how many are in the cloud alone. */
export function listHeadTip(data: ScatterData): string {
  const order = data.rankBy === "value" ? "Cea mai mare valoare a achizițiilor directe."
    : data.version === 2 ? "Cele mai multe semnale; la egalitate, valoarea mai mare întâi." : "Cel mai mare risc; la egalitate, valoarea mai mare întâi.";
  if (data.group.small) return `${order} Grupul e mic: sunt listate toate profilurile cu cel puțin ${countWords(SCATTER_CLOUD_MIN_DAS, "achiziție directă", "achiziții directe")}.`;
  const only = data.group.n - data.group.nList;
  return `${order} În listă intră cine are cel puțin ${countWords(SCATTER_LIST_MIN_DAS, "achiziție directă", "achiziții directe")}.${only > 0 ? ` ${countWords(only, "profil e", "profiluri sunt")} doar în nor (${SCATTER_CLOUD_MIN_DAS}–${SCATTER_LIST_MIN_DAS - 1} achiziții).` : ""}`;
}

/** The band's word beside a score: "puternic", "moderat", "slab", or "niciun tipar găsit" at 0. */
export const scoreBandWord = (score: number): string => RISK_BAND_WORD[riskBand(score)];
/** A score in words, for the chart's tip and the card: "73% · risc puternic", "0% · niciun tipar găsit". */
export function scoreWords(score: number): string {
  const band = riskBand(score);
  return `${riskPercent(score)} · ${band === "none" ? RISK_BAND_WORD.none : `risc ${RISK_BAND_WORD[band]}`}`;
}

/** The sheet's facts line (scatter-3): "Achiziții directe: 21 mil. lei · Risc 73% · puternic · 2 tipare". */
export function cardFacts(value: number, score: number, nFlags: number): { label: string; value: string }[] {
  return [
    { label: "Achiziții directe:", value: formatRon(value) },
    { label: "Risc", value: `${riskPercent(score)} · ${scoreBandWord(score)}` },
    ...(nFlags > 0 ? [{ label: "", value: countWords(nFlags, "tipar", "tipare") }] : []),
  ];
}
/** The sheet's facts line of a stored scatter-2: "Achiziții directe: 21,0 mil. lei · Indice 0,6 · 3 din 5 semnale". */
export function cardFactsV2(value: number, cri: number, nFlags: number, levels: number): { label: string; value: string }[] {
  return [
    { label: "Achiziții directe:", value: formatRon(value) },
    { label: "Indice", value: formatDecimal(cri, levels === 4 ? 2 : 1) },
    { label: "", value: `${nFlags} din ${levels} semnale` },
  ];
}

/**
 * The shown list as CSV rows (one row per profile of the 50): a place, the group's, the risk (the score in %, its
 * band), the number of patterns, their codes and their tags with the years or shares — the shares of the
 * per-acquisition signals from `facts` (part=profile), as on screen. A stored scatter-2 exports its index and signals.
 */
export function scatterCsv(data: ScatterData, csv: (value: unknown) => string, facts?: ReadonlyMap<string, ScatterFlagFact[]>): string[] {
  const firm = data.role === "supplier";
  const own = (r: AnyListRow) => firm ? [r.employees ?? "", r.employeesYear ?? "", csv(r.county)] : [csv(kindWords(r.kind) ?? ""), csv(r.county)];
  const who = firm ? "loc,nume,angajati,an_bilant,sediu" : "loc,nume,tip,judet";
  if (data.version === 2) {
    return [`${who},valoare_lei,achizitii_directe,indice_de_risc,nr_semnale,semnale,detalii_semnale`, ...data.list.map((r, i) => {
      const tags = withFacts(r.flags, facts?.get(r.entityId)).map((f) => flagTag(f).text);
      return [i + 1, csv(r.name), ...own(r), r.value, r.nDas, r.cri, r.nFlags, csv(r.flags.map((f) => f.code).join("|")), csv(tags.join("; "))].join(",");
    })];
  }
  return [`${who},valoare_lei,achizitii_directe,risc_pct,banda,nr_tipare,tipare,detalii_tipare`, ...data.list.map((r, i) => {
    const tags = withFacts(r.flags, facts?.get(r.entityId)).map((f) => flagTag(f).text);
    return [i + 1, csv(r.name), ...own(r), r.value, r.nDas, r.score, csv(scoreBandWord(r.score)), r.nFlags, csv(r.flags.map((f) => f.code).join("|")), csv(tags.join("; "))].join(",");
  })];
}

// --- the facts asked after the answer (part=profile), kept per question for the list, the sheet and the CSV

const FACTS_KEPT = new Map<string, Map<string, ScatterFlagFact[]>>();
/** The facts are the profiles', whatever the strip: one store per question without its cloud options. */
export const scatterFactsKey = (spec: AskSpec): string => questionKey({ ...spec, scatter: undefined } as unknown as QuestionSpec);
export const keptScatterFacts = (spec: AskSpec): ReadonlyMap<string, ScatterFlagFact[]> | undefined => FACTS_KEPT.get(scatterFactsKey(spec));

/** Asks the facts of `ids` (at most 50) and keeps them; null when the request failed. */
export async function fetchScatterFacts(spec: AskSpec, ids: readonly string[]): Promise<Map<string, ScatterFlagFact[]> | null> {
  const answer = await fetch("/api/ask/facets", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ spec: withScatterChoice(spec, "flag:"), part: "profile", ids: ids.slice(0, SCATTER_LIST_MAX) }),
  }).then(async (r) => (await r.json().catch(() => null)) as ({ ok: boolean } & ProfileFactsResult) | null).catch(() => null);
  if (!answer?.ok) return null;
  const key = scatterFactsKey(spec);
  const next = new Map(FACTS_KEPT.get(key) ?? []);
  for (const row of answer.rows) next.set(row.id, row.flags);
  FACTS_KEPT.set(key, next);
  return next;
}

/** The facts of every listed row before an export, so the CSV carries the shares the screen shows (asked once). */
export async function ensureScatterFacts(spec: AskSpec, ids: readonly string[]): Promise<void> {
  const kept = keptScatterFacts(spec);
  const missing = ids.filter((id) => !kept?.has(id));
  if (missing.length) await fetchScatterFacts(spec, missing);
}

// --- links and spoken words

/** The place of the question (an institution's county, a firm's seat): what "Toată țara" takes away. */
export const groupCounty = (spec: AskSpec, role: ScatterRole): string | null =>
  (role === "supplier" ? spec.filters.seatCounty ?? spec.filters.county : spec.filters.county) ?? null;

/**
 * "Toată lista pe /semnale": without a signal the risk list (view=cri, by the score), with one the signal's own list;
 * the county of the group either way. A profile's signal (concentration, dependence) lists profiles; the others list
 * occurrences. A retired signal of a stored answer has no list: the risk list.
 */
export function signalsPageLink(data: ScatterData, spec: AskSpec): { href: string; label: string } {
  const flag = data.flag && isScatterFlag(data.flag) ? data.flag : null;
  const q = new URLSearchParams(flag ? { tip: flag, rol: data.role } : { view: "cri", rol: data.role });
  const county = groupCounty(spec, data.role);
  if (county) q.set("jud", county);
  const profiles = !flag || flag === "da_concentration" || flag === "da_dependence";
  return { href: `/semnale?${q.toString()}`, label: profiles ? "Toată lista pe /semnale" : "Aparițiile semnalului pe /semnale" };
}

/** What a screen reader hears when the strip's answer arrives: "46 cu Chiar sub plafon, după risc". */
export function stripStatusWords(data: ScatterData): string {
  const total = data.chosen ? data.chosen.nList : data.group.nList;
  return `${formatInt(total)} ${data.flag ? `cu ${scatterFlagLabel(data.flag)}` : "în listă"}, după ${rankWords(data)[data.rankBy]}`;
}

export const pctWords = (share: number) => formatShare(share).replace(/,0%$/, "%");
export { scatterFlagsOf, type ScatterFlag };
