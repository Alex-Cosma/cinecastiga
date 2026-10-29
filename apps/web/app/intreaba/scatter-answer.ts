import { countWords, formatDecimal, formatShare } from "../../lib/ask/answer-text";
import { flagLabel } from "../../lib/flags";
import { KIND_ONE, questionKey, type QuestionSpec } from "../../lib/ask/question-ui";
import type { ProfileFactsResult } from "../../lib/ask/facet-parts";
import type { AskSpec } from "../../lib/ask/spec";
import {
  RANK_WORDS, SCATTER_CLOUD_MIN_DAS, SCATTER_LIST_MAX, SCATTER_LIST_MIN_DAS, flagBit, flagDetail, scatterFlagsOf, withScatterChoice,
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

/** Room around the plot: the bands' labels on the left, the decades under it, the words of the top 10% over it. */
export function plotPad(box: ChartBox) {
  return { l: box.compact ? 44 : 58, r: 14, t: 24, b: box.compact ? 40 : 46 };
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

/** A box on the chart, in px. */
export interface LabelBox { x0: number; x1: number; y0: number; y1: number }
/** Approximate width of a chart text in px (11–11.5 px type). */
const textWidth = (text: string): number => text.length * 6.3;

/**
 * The words of the top 10% over the plot, beside the line (before it when they would leave the chart): above the
 * top band, so they never sit on its points (F6b review: on a phone they covered a point of the band 4/4).
 */
export function p90Label(g: Geometry, p90: number): { x: number; y: number; anchor: "start" | "end"; box: LabelBox } {
  const line = g.x(p90), w = textWidth(p90Words), end = line + 4 + w > g.box.width;
  const x = end ? line - 4 : line + 4, y = g.pad.t - 8;
  return { x, y, anchor: end ? "end" : "start", box: { x0: end ? x - w : x, x1: end ? x : x + w, y0: y - 10, y1: y + 3 } };
}

/** A name on the chart is skipped when its box would sit on more points than this. */
export const LABEL_COVER_MAX = 3;
export interface ChartLabel { id: string; x: number; y: number; anchor: "start" | "end"; text: string }

/**
 * The first names of the list on the chart, each where it fits: the side with the room first (right on the left of
 * the chart), then the side over fewer points. A name that would sit on another label or on the words of the top 10%,
 * cross its line, or cover a cluster on both sides is left to the list (a phone's narrow chart; F6b review: at 390 px
 * a firm's name crossed the line and its points).
 */
export function chartLabels(names: readonly { id: string; text: string }[], all: readonly Dot[], g: Geometry, p90: number): ChartLabel[] {
  const line = p90 > 0 ? g.x(p90) : null;
  const placed: LabelBox[] = line === null ? [] : [p90Label(g, p90).box], out: ChartLabel[] = [];
  for (const { id, text } of names) {
    const d = all.find((x) => x.point.id === id);
    if (!d) continue;
    const w = textWidth(text);
    const sides = (d.x < g.box.width * 0.62 ? [true, false] : [false, true]).map((right) => {
      const x = d.x + (right ? 8 : -8), box = { x0: right ? x : x - w, x1: right ? x + w : x, y0: d.y - 8, y1: d.y + 6 };
      const fits = box.x0 >= g.pad.l && box.x1 <= g.box.width && (line === null || line <= box.x0 || line >= box.x1)
        && !placed.some((p) => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1);
      return { right, x, box, fits, covers: all.filter((o) => o !== d && o.x >= box.x0 && o.x <= box.x1 && o.y >= box.y0 && o.y <= box.y1).length };
    }).filter((side) => side.fits && side.covers <= LABEL_COVER_MAX);
    const side = sides.sort((a, b) => a.covers - b.covers)[0];
    if (!side) continue;
    placed.push(side.box);
    out.push({ id, x: side.x, y: d.y + 3, anchor: side.right ? "start" : "end", text });
  }
  return out;
}

/** A point of the cloud with its marks (the chosen signal, in the list), for drawing and for the nearest-point search. */
export interface Dot { point: ScatterCloudPoint; x: number; y: number; flagged: boolean; listed: boolean }

export function dots(data: ScatterV2, g: Geometry, listed: ReadonlySet<string>): Dot[] {
  const c = data.cloud, flag = data.flag;
  const mask = flag ? flagBit(data.role, flag) : 0;
  const points = "points" in c ? c.points : c.named;
  return points.map((point) => ({ point, x: g.x(point.value), y: g.y(point.nFlags, point.id), flagged: mask !== 0 && (point.flags & mask) !== 0, listed: listed.has(point.id) }));
}

/**
 * A profile the search found or a row of the list's tail, exact on a chart of cells (final §3.6: the named, found and
 * chosen points stay exact): from its value, its criteria and its signals, with no request.
 */
export function exactDot(data: ScatterV2, g: Geometry, p: { id: string; name: string; value: number; nFlags: number; nDas: number; codes: readonly string[] }): Dot {
  const point: ScatterCloudPoint = { id: p.id, name: p.name, value: p.value, nFlags: p.nFlags, nDas: p.nDas, flags: 0 };
  for (const code of scatterFlagsOf(data.role)) if (p.codes.includes(code)) point.flags |= flagBit(data.role, code);
  const mask = data.flag ? flagBit(data.role, data.flag) : 0;
  return { point, x: g.x(point.value), y: g.y(point.nFlags, point.id), flagged: mask !== 0 && (point.flags & mask) !== 0, listed: false };
}

/** Whether id `a` comes before `b` (bigint ids as text: shorter is smaller), the list's last tie-break. */
const idBefore = (a: string, b: string): boolean => a.length !== b.length ? a.length < b.length : a < b;

/**
 * A point's place in the list of the strip's order and signal, from the cloud drawn point by point (every profile of
 * the group is there): the same order as the server (scatter.ts scatterOrder), so a point past the first 50 still says
 * "locul 73 din 120". Null when it is not in the list (under the floor, without the signal) or the cloud is cells.
 */
export function pointPlace(data: ScatterV2, id: string): number | null {
  if (!("points" in data.cloud)) return null;
  const floor = data.group.small ? SCATTER_CLOUD_MIN_DAS : SCATTER_LIST_MIN_DAS;
  const mask = data.flag ? flagBit(data.role, data.flag) : 0;
  const listed = data.cloud.points.filter((p) => p.nDas >= floor && (mask === 0 || (p.flags & mask) !== 0));
  const me = listed.find((p) => p.id === id);
  if (!me) return null;
  const ahead = (p: ScatterCloudPoint) => data.rankBy === "risk"
    ? p.nFlags > me.nFlags || p.nFlags === me.nFlags && (p.value > me.value || p.value === me.value && idBefore(p.id, me.id))
    : p.value > me.value || p.value === me.value && idBefore(p.id, me.id);
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

/**
 * The shown list as CSV rows (one row per profile of the 50): a place, the group's, the number of signals, their codes
 * and their tags with the years or shares — the shares of the two rates from `facts` (part=profile), as on screen.
 */
export function scatterCsv(data: ScatterV2, csv: (value: unknown) => string, facts?: ReadonlyMap<string, ScatterFlagFact[]>): string[] {
  const firm = data.role === "supplier";
  const head = firm ? "loc,nume,angajati,an_bilant,sediu,valoare_lei,achizitii_directe,indice_de_risc,nr_semnale,semnale,detalii_semnale"
    : "loc,nume,tip,judet,valoare_lei,achizitii_directe,indice_de_risc,nr_semnale,semnale,detalii_semnale";
  return [head, ...data.list.map((r, i) => {
    const tags = withFacts(r.flags, facts?.get(r.entityId)).map((f) => flagTag(f).text);
    const own = firm ? [r.employees ?? "", r.employeesYear ?? "", csv(r.county)] : [csv(kindWords(r.kind) ?? ""), csv(r.county)];
    return [i + 1, csv(r.name), ...own, r.value, r.nDas, r.cri, r.nFlags, csv(r.flags.map((f) => f.code).join("|")), csv(tags.join("; "))].join(",");
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
 * "Toată lista pe /semnale": without a signal the index's list (view=cri), with one the signal's own list; the county
 * of the group either way. A profile's signal (concentration, dependence) lists profiles; the others list occurrences.
 */
export function signalsPageLink(data: ScatterV2, spec: AskSpec): { href: string; label: string } {
  const q = new URLSearchParams(data.flag ? { tip: data.flag, rol: data.role } : { view: "cri", rol: data.role });
  const county = groupCounty(spec, data.role);
  if (county) q.set("jud", county);
  const profiles = !data.flag || data.flag === "da_concentration" || data.flag === "da_dependence";
  return { href: `/semnale?${q.toString()}`, label: profiles ? "Toată lista pe /semnale" : "Aparițiile semnalului pe /semnale" };
}

/** What a screen reader hears when the strip's answer arrives: "46 cu Posibilă fracționare, după semnale". */
export function stripStatusWords(data: ScatterV2): string {
  const total = data.chosen ? data.chosen.nList : data.group.nList;
  return `${formatInt(total)} ${data.flag ? `cu ${flagLabel(data.flag)}` : "în listă"}, după ${RANK_WORDS[data.rankBy]}`;
}

export const rankHeading = (rank: "risk" | "value") => `după ${RANK_WORDS[rank]}`;
export const pctWords = (share: number) => formatShare(share).replace(/,0%$/, "%");
export { scatterFlagsOf, type ScatterFlag };
