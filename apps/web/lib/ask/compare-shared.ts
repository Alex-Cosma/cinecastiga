import { cleanName, formatInt, formatRon } from "../format";
import { countWords } from "./answer-text";

/*
 * F4, the comparison (plan §4.6, final compare §3–§5): what the builder and the
 * answer both read, without SQL, for the client and the server alike.
 * - The pair's facts (POST /api/ask/facets part=pair): each entity's years,
 *   the CPV groups both have, the share of general codes and, between firms,
 *   their clients by kind and county. The builder's windows read them only
 *   for the pair the draft names, never an earlier answer's.
 * - The suggestions of "Cu cine comparăm?" (part=compare-peers).
 * - The rules of "Perioada comună", of a general CPV group and of the codes
 *   above a domain ("+ X lei pe coduri mai generale").
 */

/** The archive's first full year of direct acquisitions: older records are one column, "înainte de 2018". */
export const COMPARE_FIRST_YEAR = 2018;
/** "Perioada comună" is offered when the years outside it hold at least this share of one entity's value (final §3.1). */
export const COMMON_PERIOD_SHARE = 0.05;
/** The groups "Cumpără amândouă" lists at most (final §3.2). */
export const PAIR_DOMAINS = 6;
/** The note "Pe coduri generale" shows from this share of one entity's value (final §3.2). */
export const GENERAL_NOTE_SHARE = 0.1;

export interface PairSide { value: number; n: number }
export interface PairYear { year: number; a: PairSide; b: PairSide }
/** A CPV group (5 digits) both have: its catalogue name and each one's value. */
export interface PairDomain { code: string; name: string | null; a: number; b: number }
/** One option of a client window (a kind or a county) with each firm's value in it. */
export interface PairShare { value: string; a: number; b: number }
export interface PairShares { options: PairShare[]; rest: { a: number; b: number }; total: { a: number; b: number } }

/**
 * The facts of a pair (part=pair), each on the draft without the key of the
 * window it serves (kit R5): the years without the period, the domains without
 * the domain and the kind of purchase, the clients' kinds without the kind and
 * their counties without the county.
 */
export interface PairResult {
  part: "pair";
  role: "authority" | "supplier";
  /** Every year with records of either, the years before 2018 included, oldest first. */
  years: PairYear[];
  /** The CPV groups both have, without the general ones, by the smaller of the two values, at most PAIR_DOMAINS. */
  domains: PairDomain[];
  /** Each one's value on division or group codes, and its whole value (the base of the share). */
  general: { a: number; b: number; totalA: number; totalB: number };
  /** Firms only: their clients by kind („Alte instituții” the rest) and by county („Județ necunoscut”). */
  kinds: PairShares | null;
  counties: PairShares | null;
  checkpoint: string | null;
  tookMs: number;
}

/** A suggestion of "Cu cine comparăm?": the entity and the basis of its row. */
export interface ComparePeer { id: number; name: string; county: string | null; detail: string }
export interface ComparePeersResult {
  part: "compare-peers";
  /** The group's heading ("Primării cu populație apropiată"), null without suggestions. */
  label: string | null;
  /** The heading's (?), where the basis needs one. */
  tip: string | null;
  peers: ComparePeer[];
  checkpoint: string | null;
  tookMs: number;
}

/** A CPV group (its first five digits) of a division or group code (45000, 45200): too general to suggest (final §3.2). */
export const isGeneralGroup = (cpv5: string): boolean => /^\d{3}00$/.test(cpv5);

/**
 * The codes above a domain (final §3.2 "+ X lei pe coduri mai generale"): for
 * each prefix of the domain, the division, group, class… codes it belongs to,
 * as eight digits (45233 → 45000000, 45200000, 45230000), without those the
 * domain itself holds. A record coded there is not in the domain.
 */
export function generalCodes(prefixes: readonly string[]): string[] {
  const out = new Set<string>();
  for (const prefix of prefixes) {
    const digits = prefix.replace(/\D/g, "");
    for (let k = 2; k < Math.min(digits.length, 8); k++) {
      const code = digits.slice(0, k).padEnd(8, "0");
      if (!prefixes.some((p) => code.startsWith(p.replace(/\D/g, "")))) out.add(code);
    }
  }
  return [...out].sort();
}

const span = (years: readonly PairYear[], side: "a" | "b") => {
  const present = years.filter((y) => y.year >= COMPARE_FIRST_YEAR && y[side].value > 0).map((y) => y.year);
  return present.length ? { from: Math.min(...present), to: Math.max(...present) } : null;
};

/**
 * "Perioada comună · 2021–2025" (final §3.1, kit §6 compare 9): from the
 * first to the last year both have records in the selection, from 2018. Only
 * when their years differ and the years outside it hold at least 5% of one
 * one's value (from 2018): otherwise the preset changes nothing worth a row.
 * `detail` says who starts later and who stops earlier.
 */
export function commonPeriod(years: readonly PairYear[], names: { a: string; b: string }): { from: number; to: number; detail: string } | null {
  const a = span(years, "a"), b = span(years, "b");
  if (!a || !b || a.from === b.from && a.to === b.to) return null;
  const from = Math.max(a.from, b.from), to = Math.min(a.to, b.to);
  if (from > to) return null;
  const outside = (side: "a" | "b") => {
    const total = years.filter((y) => y.year >= COMPARE_FIRST_YEAR).reduce((sum, y) => sum + y[side].value, 0);
    const out = years.filter((y) => y.year >= COMPARE_FIRST_YEAR && (y.year < from || y.year > to)).reduce((sum, y) => sum + y[side].value, 0);
    return total > 0 ? out / total : 0;
  };
  if (Math.max(outside("a"), outside("b")) < COMMON_PERIOD_SHARE) return null;
  const parts: string[] = [];
  if (a.from !== b.from) parts.push(`${a.from > b.from ? names.a : names.b} apare din ${from}`);
  if (a.to !== b.to) parts.push(`${a.to < b.to ? names.a : names.b} până în ${to}`);
  return { from, to, detail: parts.join(", ") };
}

/** The records dated before 2018, each entity's: "+17 mai vechi" beside "Toți anii" and the chart's first column. */
export function olderRecords(years: readonly { year: number; a?: PairSide; b?: PairSide }[]): { a: PairSide; b: PairSide } {
  const sum = (side: "a" | "b") => years.filter((y) => y.year < COMPARE_FIRST_YEAR)
    .reduce((acc, y) => ({ value: acc.value + (y[side]?.value ?? 0), n: acc.n + (y[side]?.n ?? 0) }), { value: 0, n: 0 });
  return { a: sum("a"), b: sum("b") };
}

/** "Unele înregistrări au date dinainte de 2018 (Timișoara: 17, 44,0 mil. lei)…": the (?) of "Toți anii", null without them. */
export function olderRecordsTip(older: { a: PairSide; b: PairSide }, names: { a: string; b: string }): string | null {
  const parts = (["a", "b"] as const).filter((side) => older[side].n > 0)
    .map((side) => `${names[side]}: ${formatInt(older[side].n)}, ${formatRon(older[side].value)}`);
  if (!parts.length) return null;
  return `Unele înregistrări au date dinainte de 2018 (${parts.join("; ")}). Intră în „Toți anii”; graficul le strânge într-o coloană.`;
}

/** "+17 mai vechi": the detail beside "Toți anii". */
export function olderRecordsDetail(older: { a: PairSide; b: PairSide }): string | null {
  const n = older.a.n + older.b.n;
  return n > 0 ? `+${formatInt(n)} mai vechi` : null;
}

/** A short name for the pair's words ("Cluj-Napoca", "PORR CONSTRUCT"): the first two words of the clean name. */
export const pairName = (name: string): string => cleanName(name).replace(/^(?:municipiul|orașul|oraşul|comuna|judetul|județul)\s+/i, "").split(/\s+/).slice(0, 2).join(" ");

/** "16 clienți comuni · CPV 45", the basis of a suggested firm (final §3.6). */
export const peerFirmDetail = (shared: number, division: string): string =>
  `${countWords(shared, "client comun", "clienți comuni")} · CPV ${division}`;
