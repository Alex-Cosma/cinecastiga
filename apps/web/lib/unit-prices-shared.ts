import type { PriceGroup } from "@seap/db";

/**
 * Unit prices, the parts both the server pages and the browser use: where a multiple of the median sits on the strip,
 * and how prices, multiples and quantities read. The strip's axis is log2 of the multiple, from about a third (left
 * edge) to eight times (right edge), so half and double sit at the same distance from the median; leads are on the
 * right, so the right gets the room.
 */
export const AXIS_FROM = -1.5;
export const AXIS_TO = 3;
export const AXIS_TICKS: { ratio: number; label: string }[] = [
  { ratio: 0.5, label: "jumătate" }, { ratio: 1, label: "mediana" }, { ratio: 2, label: "2×" }, { ratio: 4, label: "4×" }, { ratio: 8, label: "8×+" },
];

/** Percent from the strip's left edge for a multiple of the median (clamped to the strip). */
export function axisPos(ratio: number): number {
  if (!(ratio > 0)) return 0;
  const x = (Math.log2(ratio) - AXIS_FROM) / (AXIS_TO - AXIS_FROM) * 100;
  return Math.round(Math.min(100, Math.max(0, x)) * 100) / 100;
}

const price2 = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const one = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
const small = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 });

/** „35,00”: prices per unit keep two decimals, below one leu three when they need them („0,152”). */
export function formatUnitPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 1 && n > 0) return new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(n);
  return price2.format(n);
}

/** „4,7×”, never rounded down to 2,0× from a lead below it: a lead's multiple reads at one decimal, floored. */
export function formatRatio(r: number): string {
  if (!Number.isFinite(r)) return "—";
  return `${one.format(Math.floor(r * 10) / 10)}×`;
}

/** „de 4,7 ori mediana”, the owner's wording for a lead (10 November 2026). */
export function ratioWords(r: number): string {
  return `de ${one.format(Math.floor(r * 10) / 10)} ori mediana`;
}

const UNIT_WORDS: Record<string, [string, string]> = {
  "lei/kg": ["kg", "kg"], "lei/l": ["l", "l"], "lei/buc.": ["buc.", "buc."], "lei/top": ["top", "topuri"], "lei/mc": ["mc", "mc"], "lei/ster": ["ster", "steri"],
};
/** „2.510 kg”, „1.330 topuri”, „12.000 buc.”: a quantity in the product's unit. */
export function formatQuantity(n: number, per: string): string {
  const [single, plural] = UNIT_WORDS[per] ?? ["", ""];
  const v = n >= 100 ? whole.format(n) : small.format(n);
  return `${v} ${n === 1 ? single : plural}`.trim();
}

const PER_WORD: Record<string, string> = { "lei/kg": "Pe kilogram", "lei/l": "Pe litru", "lei/buc.": "Pe bucată", "lei/top": "Pe top", "lei/mc": "Pe mc", "lei/ster": "Pe ster" };
/** „Pe litru”: the header of a price per the product's unit. */
export const perWord = (per: string) => PER_WORD[per] ?? "Pe unitate";

/** The leu amount of a lead, rounded to the leu (an aggregate of many lines, not a record's exact value). */
export function formatLei(n: number): string {
  return `${whole.format(Math.round(n))} lei`;
}

/** „19 produse”, „21 de produse”: Romanian puts „de” before 20–99 in the last two digits (and 0, 100, 200…). */
export function countWord(n: number, one: string, many: string): string {
  if (n === 1) return one;
  return n % 100 >= 20 || n % 100 === 0 ? `${whole.format(n)} de ${many}` : `${whole.format(n)} ${many}`;
}

/**
 * „24 de prețuri peste dublu”, „un preț peste dublu”, „niciun preț peste dublu” (owner, 11 November 2026: not „piste”);
 * `long` names the median: „peste dublul medianei”.
 */
export function leadsWord(n: number, long = false): string {
  const tail = long ? "peste dublul medianei" : "peste dublu";
  return n === 0 ? `niciun preț ${tail}` : countWord(n, `un preț ${tail}`, `prețuri ${tail}`);
}

/** „1.656 peste dublu”: a total, in the column's own words (owner, 11 November 2026: the long form was too long). */
export function leadsCount(n: number): string {
  return n === 0 ? "niciun preț peste dublu" : `${whole.format(n)} peste dublu`;
}

/** „Niciun preț peste dublu”: a sentence opens with a capital. */
export const sentenceCase = (text: string) => text.charAt(0).toLocaleUpperCase("ro-RO") + text.slice(1);

/**
 * „cele mai mari 14 din 195”: the dots of a strip are the largest leads by lei above the median, not all of them
 * (owner, 11 November 2026: the strip says so). Null when every lead has its dot.
 */
export function largestOf(shown: number, total: number): string | null {
  return total > shown && shown > 0 ? `cele mai mari ${whole.format(shown)} din ${whole.format(total)}` : null;
}

/**
 * Every lead of a strip as one path of ticks on the strip's axis (an SVG of viewBox "0 0 100 1", stretched): the
 * place of each multiple to a quarter of a percent, drawn once, so a product with hundreds of leads is one node and
 * the reader sees where they all sit, not only the named dots.
 */
export function leadTicksPath(ratios: readonly number[]): string {
  const at = [...new Set(ratios.filter((r) => r > 0).map((r) => Math.round(axisPos(r) * 4) / 4))].sort((a, b) => a - b);
  // The edges keep their tick inside the strip.
  return at.map((x) => `M${Math.min(99.75, Math.max(0.25, x))} 0V1`).join("");
}

/** „442 de instituții”, „o instituție”. */
export function buyersWord(n: number): string {
  return countWord(n, "o instituție", "instituții");
}

/**
 * A dot of a strip: one lead (an institution in one year). The list of every product sends the light form (the name,
 * the price, the multiple and the lei above the median); the product page adds the rest for its hover card.
 */
export interface StripDot {
  id: string; year: number; name: string; price: number; ratio: number; excess: number;
  /** Always true on a dot today (only leads are drawn); carried so a mark never decides it from the multiple. */
  lead: boolean;
  county?: string | null; median?: number; quantity?: number; awards?: number;
}
/** A lead as the product page's dots need it (the full form), from the server's shape. */
export const dotOf = (l: { authorityId: string; year: number; name: string; county: string | null; price: number; median: number; ratio: number; quantity: number; excess: number; awards: number; lead: boolean }): StripDot =>
  ({ id: l.authorityId, year: l.year, name: l.name, county: l.county, price: l.price, median: l.median, ratio: l.ratio, quantity: l.quantity, excess: l.excess, awards: l.awards, lead: l.lead });

/** „2019”, „2018 și 2019”, „2018, 2019, 2025 și 2026”: the years a view holds. */
export function yearsWord(years: readonly number[]): string {
  const ys = [...years].sort((a, b) => a - b).map(String);
  return ys.length <= 1 ? ys.join("") : `${ys.slice(0, -1).join(", ")} și ${ys[ys.length - 1]}`;
}

/** „1,28 lei/kg”, or „1,20–1,31 lei/kg” when the medians of several years differ. */
export function medianRange(lo: number, hi: number, per: string): string {
  return Math.abs(hi - lo) < 0.005 ? `${formatUnitPrice(lo)} ${per}` : `${formatUnitPrice(lo)}–${formatUnitPrice(hi)} ${per}`;
}

// ── the address of a view ──────────────────────────────────────────────────
export type PriceOrder = "dublu" | "multiplu" | "lei";
/** The list opens by the lei above the median (owner, 11 November 2026). */
export const DEFAULT_PRICE_ORDER: PriceOrder = "lei";
export const PRICE_ORDERS: { value: PriceOrder; label: string }[] = [
  { value: "lei", label: "Lei peste mediană" },
  { value: "dublu", label: "Cele mai multe peste dublu" },
  { value: "multiplu", label: "Cel mai mare multiplu" },
];

export interface PriceState { year: number | null; group: PriceGroup | null; product: string | null; county: string | null; order: PriceOrder }

/** An entry of the „Grupă sau produs” typeahead. */
export interface PriceOption { kind: "group" | "product"; value: string; label: string; detail: string }
export function priceHref(state: PriceState, patch: Partial<PriceState> = {}): string {
  const s = { ...state, ...patch };
  const p = new URLSearchParams();
  if (s.year) p.set("an", String(s.year));
  if (s.product) p.set("produs", s.product); else if (s.group) p.set("grupa", s.group);
  if (s.county) p.set("judet", s.county);
  if (s.order !== DEFAULT_PRICE_ORDER) p.set("ordine", s.order);
  const q = p.toString();
  return q ? `/preturi?${q}` : "/preturi";
}

export function productHref(family: string, pack: string, year: number | null, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (pack) p.set("ambalaj", pack);
  if (year) p.set("an", String(year));
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const q = p.toString();
  return `/preturi/${family}${q ? `?${q}` : ""}`;
}


/** The product page opened on one institution in one year: its row first, opened (`deschis`, unit-prices-params.ts). */
export function leadHref(family: string, pack: string, year: number | null, lead: { authorityId: string; year: number }): string {
  return `${productHref(family, pack, year, { deschis: `${lead.authorityId}-${lead.year}` })}#institutie-${lead.authorityId}-${lead.year}`;
}
