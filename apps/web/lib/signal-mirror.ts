/**
 * The case page's mirror (/entitati/{id}/semnale?tip=…, owner, 6 November 2026, "Oglinda"): every pattern is a comparison
 * between what happened and its reference, and these are the numbers of its two faces, read from what each signal's
 * build stored (core.flags.evidence) and from its records. Pure: the page draws them, the tests pin them.
 * Values are recorded, not payments; a pattern is a lead, not proof.
 */
import type { DrillRow } from "./ask/compile";
import { riskSplitRecurring } from "./risk-score";

const num = (value: unknown): number => {
  const x = typeof value === "number" ? value : Number(value);
  return Number.isFinite(x) ? x : 0;
};
const optNum = (value: unknown): number | null => (value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);

/** A group of repeated purchases counts from above 1,2 times its ceiling (packages/db profile-flags: nothing at 1.2×, full from 2×). */
export const SPLIT_COUNTS_ABOVE = 1.2;

/** "3,0×": a multiple of the ceiling, one decimal. */
export const ratioWords = (r: number): string => `${(Math.round(r * 10) / 10).toFixed(1).replace(".", ",")}×`;

const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** "25 iulie 2022" from an ISO date; null when the date is not one. */
export function dayWords(iso: string | null | undefined): string | null {
  const m = ISO_DAY.exec(iso ?? "");
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : null;
}

/**
 * When a case's acquisitions happened, in words: "toate în aceeași zi: 25 iulie 2022", "toate în iulie 2022",
 * "din martie până în decembrie" (one year), "din 14 noiembrie 2018 până în 24 iulie 2026"; null without dates.
 */
export function datesWords(dates: readonly (string | null | undefined)[]): string | null {
  const days = dates.map((d) => ISO_DAY.exec(d ?? "")?.[0]).filter((d): d is string => Boolean(d)).sort();
  if (!days.length) return null;
  const first = days[0]!, last = days[days.length - 1]!;
  if (first === last) return days.length > 1 ? `toate în aceeași zi: ${dayWords(first)}` : dayWords(first);
  const [fy, fm] = [first.slice(0, 4), Number(first.slice(5, 7))];
  const [ly, lm] = [last.slice(0, 4), Number(last.slice(5, 7))];
  if (fy === ly && fm === lm) return `toate în ${MONTHS[fm - 1]} ${fy}`;
  if (fy === ly) return `din ${MONTHS[fm - 1]} până în ${MONTHS[lm - 1]}`;
  return `din ${dayWords(first)} până în ${dayWords(last)}`;
}

type Recordish = Pick<DrillRow, "date" | "value" | "valueExact" | "refId"> & { title?: string | null; cpvName?: string | null };
export interface CaseInput {
  id: string;
  partnerId: string | null;
  partnerName: string | null;
  period: string | null;
  evidence: Record<string, unknown> | null;
  records: readonly Recordish[];
}

/** "Adunate, trec de plafon": one firm and year, each purchase under the ceiling, their sum above it. */
export interface SplitGroup {
  id: string;
  partnerId: string | null;
  partnerName: string | null;
  year: string | null;
  cpvClass: string | null;
  works: boolean;
  count: number;
  total: number;
  ceiling: number;
  ratio: number;
  /** Whether the group adds to the score: above 1,2× and not recurring supply (rf-2026.22, S5). */
  counted: boolean;
  recurring: "medical" | "small_orders" | null;
  /** Each purchase as a share of the ceiling, in date order, with what the chart's hover tells of it. */
  items: { value: number; ofCeiling: number; date: string | null; title: string | null }[];
  dates: string | null;
}

export function splitGroup(c: CaseInput): SplitGroup {
  const e = c.evidence ?? {};
  const ceiling = num(e.ceiling), total = num(e.total) || c.records.reduce((a, r) => a + r.value, 0);
  const count = num(e.count) || c.records.length;
  const cpvClass = e.cpv_class == null ? null : String(e.cpv_class);
  const ratio = ceiling > 0 ? total / ceiling : 0;
  const recurring = riskSplitRecurring({ total, n: count, ceiling, cpvClass });
  const items = [...c.records].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")))
    .map((r) => ({ value: r.value, ofCeiling: ceiling > 0 ? r.value / ceiling : 0, date: r.date ?? null, title: r.title ?? r.cpvName ?? null }));
  return {
    id: c.id, partnerId: c.partnerId, partnerName: c.partnerName, year: e.year == null ? c.period : String(e.year), cpvClass,
    works: String(e.type ?? "").includes("works"), count, total, ceiling, ratio,
    counted: ratio > SPLIT_COUNTS_ABOVE && recurring === null, recurring, items, dates: datesWords(c.records.map((r) => r.date)),
  };
}

/** The faces of "Adunate, trec de plafon": every purchase on its own, and the groups summed. */
export interface SplitSummary {
  groups: number;
  counted: number;
  acquisitions: number;
  /** The largest single purchase against its own ceiling. */
  largest: { value: number; ceiling: number } | null;
  allUnder: boolean;
  topRatio: number;
  years: { from: string; to: string } | null;
}

export function splitSummary(groups: readonly SplitGroup[]): SplitSummary {
  let largest: { value: number; ceiling: number; share: number } | null = null;
  for (const g of groups) for (const it of g.items) if (!largest || it.ofCeiling > largest.share) largest = { value: it.value, ceiling: g.ceiling, share: it.ofCeiling };
  const years = groups.map((g) => g.year).filter((y): y is string => Boolean(y)).sort();
  return {
    groups: groups.length, counted: groups.filter((g) => g.counted).length,
    acquisitions: groups.reduce((a, g) => a + g.count, 0),
    largest: largest ? { value: largest.value, ceiling: largest.ceiling } : null,
    allUnder: groups.every((g) => g.items.every((it) => it.ofCeiling < 1)),
    topRatio: Math.max(0, ...groups.map((g) => g.ratio)),
    years: years.length ? { from: years[0]!, to: years[years.length - 1]! } : null,
  };
}

/** "Multe sume imediat sub plafon": one purchase, how close to its ceiling it stopped. */
export interface NearCeiling {
  id: string;
  partnerId: string | null;
  partnerName: string | null;
  value: number;
  ceiling: number;
  ofCeiling: number;
  gap: number;
  date: string | null;
}

export function nearCeiling(c: CaseInput): NearCeiling {
  const e = c.evidence ?? {};
  const value = num(e.closing) || c.records[0]?.value || 0, ceiling = num(e.ceiling);
  return { id: c.id, partnerId: c.partnerId, partnerName: c.partnerName, value, ceiling,
    ofCeiling: ceiling > 0 ? value / ceiling : 0, gap: Math.max(0, ceiling - value), date: c.records[0]?.date ?? null };
}

/** Sums that repeat to the leu ("5 de exact 135.000 lei"), most frequent first; only those found at least twice. */
export function repeatedAmounts(items: readonly NearCeiling[]): { value: number; ceiling: number; n: number }[] {
  const by = new Map<string, { value: number; ceiling: number; n: number }>();
  for (const it of items) {
    const key = `${it.value}|${it.ceiling}`;
    const seen = by.get(key);
    if (seen) seen.n += 1; else by.set(key, { value: it.value, ceiling: it.ceiling, n: 1 });
  }
  return [...by.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n || b.value - a.value);
}

/** Who most of the near-ceiling purchases went to: the firms with at least two, most first. */
export function topPartners(items: readonly { partnerId: string | null; partnerName: string | null }[], min = 2): { id: string | null; name: string; n: number }[] {
  const by = new Map<string, { id: string | null; name: string; n: number }>();
  for (const it of items) {
    const key = it.partnerId ?? it.partnerName ?? "";
    if (!key) continue;
    const seen = by.get(key);
    if (seen) seen.n += 1; else by.set(key, { id: it.partnerId, name: it.partnerName ?? "", n: 1 });
  }
  return [...by.values()].filter((x) => x.n >= min).sort((a, b) => b.n - a.n);
}

/** "Declarate directe, peste plafon": the purchase against its ceiling, by the value that crossed it. */
export interface AboveCeiling {
  id: string;
  partnerId: string | null;
  partnerName: string | null;
  value: number;
  ceiling: number;
  over: number;
  /** The estimate crossed the ceiling, or the final sum did (even with VAT, rf-2026.20). */
  basis: "estimate" | "final";
  date: string | null;
}

export function aboveCeiling(c: CaseInput): AboveCeiling {
  const e = c.evidence ?? {};
  const basis = e.basis === "estimate" ? "estimate" : "final";
  const value = (basis === "estimate" ? num(e.estimate) : num(e.closing)) || num(e.closing) || c.records[0]?.value || 0;
  const ceiling = num(e.ceiling);
  return { id: c.id, partnerId: c.partnerId, partnerName: c.partnerName, value, ceiling, over: Math.max(0, value - ceiling), basis, date: c.records[0]?.date ?? null };
}

/** "Mulți bani contractați în decembrie": a year's December against the rest of it, and the reference share. */
export interface YearEnd {
  id: string;
  year: string;
  december: number;
  total: number;
  share: number;
  /** The share 95% of the institutions of the same kind stay under. */
  reference: number | null;
}

export function yearEnd(c: CaseInput): YearEnd {
  const e = c.evidence ?? {};
  const total = num(e.total), december = num(e.december);
  const share = optNum(e.december_pct) ?? (total > 0 ? december / total : 0);
  return { id: c.id, year: String(e.year ?? c.period ?? ""), december, total, share, reference: optNum(e.peer_p95) ?? optNum(e.threshold) };
}

/** December's purchases of a flagged year, the ones the signal is about. */
export const decemberRecords = <T extends Pick<DrillRow, "date">>(records: readonly T[], year: string): T[] =>
  records.filter((r) => String(r.date ?? "").startsWith(`${year}-12`));

/**
 * "O firmă are mare parte din valoare" (an institution's main supplier) and "Un singur client public mare" (a firm's
 * main client): the partner's share for the profile, and the profile's share for the partner when the build stored it.
 */
export interface PartnerShare {
  partnerId: string | null;
  share: number;
  /** The share without the largest purchase (concentration only). */
  adjusted: number | null;
  /** The profile's share in the partner's direct acquisitions (dependence only). */
  reverse: number | null;
  /** All the profile's direct acquisitions the share is of. */
  total: number;
  /** Partners in the profile's data, the main one included. */
  partners: number | null;
  count: number | null;
  years: number | null;
}

export function partnerShare(code: "da_concentration" | "da_dependence", evidence: Record<string, unknown> | null, partReverse?: unknown): PartnerShare {
  const e = evidence ?? {};
  const dep = code === "da_dependence";
  return {
    partnerId: (dep ? e.top_authority : e.top_supplier) == null ? null : String(dep ? e.top_authority : e.top_supplier),
    share: num(dep ? e.top_authority_pct : e.top_supplier_pct),
    adjusted: dep ? null : optNum(e.adjusted_pct),
    reverse: dep ? optNum(e.authority_share) ?? optNum(partReverse) : null,
    total: num(e.total),
    partners: optNum(dep ? e.authorities : e.suppliers),
    count: optNum(dep ? e.top_authority_count : e.top_supplier_count),
    years: optNum(dep ? e.top_authority_years : e.top_supplier_years),
  };
}

/** "Contracte directe peste cifra de afaceri": what the firm got directly in a year against its balance sheet. */
export interface Capacity {
  year: string;
  daValue: number;
  daCount: number | null;
  turnover: number | null;
  turnoverYear: string | null;
  employees: number | null;
  ratio: number | null;
  implausible: boolean;
  zeroStaff: boolean;
  young: boolean;
}

export function capacity(c: CaseInput): Capacity {
  const e = c.evidence ?? {};
  return {
    year: String(e.year ?? c.period ?? ""), daValue: num(e.da_value), daCount: optNum(e.da_count), turnover: optNum(e.turnover),
    turnoverYear: e.turnover_year == null ? null : String(e.turnover_year), employees: optNum(e.employees), ratio: optNum(e.ratio),
    implausible: e.implausible === true, zeroStaff: e.zero_staff === true, young: e.young === true,
  };
}

/**
 * "Contracte în prima lună de la înființare" (rf-2026.24; owner, 13 November 2026), from the firm's side or, as its
 * reverse, the institution's (one case per firm): the registration day, the firm's age at its first direct award, and
 * what was contracted in the window. Two facts sharpen or explain a case: an award close to the ceiling, and an
 * older firm of one of the firm's legal representatives.
 */
export interface FirstMonth {
  id: string;
  partnerId: string | null;
  partnerName: string | null;
  total: number;
  count: number | null;
  /** The institutions of the window (the firm's side only). */
  buyers: number | null;
  /** Every institution of the firm in the archive's direct awards. */
  buyersAll: number | null;
  registeredOn: string | null;
  firstAwardOn: string | null;
  lastAwardOn: string | null;
  /** Days from the registration to the first award of the case. */
  ageDays: number | null;
  windowDays: number;
  closestValue: number | null;
  closestCeiling: number | null;
  nearCeiling: boolean;
  olderFirmId: string | null;
  olderFirmName: string | null;
  olderFirmSameBuyer: boolean;
  /** The institution's side: what the firm contracted with every institution in the window, and with how many. */
  firmTotal: number | null;
  firmBuyers: number | null;
}

const optDay = (value: unknown): string | null => (typeof value === "string" && ISO_DAY.test(value) ? value.slice(0, 10) : null);

export function firstMonth(c: CaseInput): FirstMonth {
  const e = c.evidence ?? {};
  const ceiling = optNum(e.closest_ceiling), closest = ceiling ? optNum(e.closest_value) : null;
  return {
    id: c.id, partnerId: c.partnerId, partnerName: c.partnerName, total: num(e.total), count: optNum(e.count),
    buyers: optNum(e.buyers), buyersAll: optNum(e.buyers_all),
    registeredOn: optDay(e.registered_on), firstAwardOn: optDay(e.first_award_on), lastAwardOn: optDay(e.last_award_on),
    ageDays: optNum(e.age_days), windowDays: optNum(e.window_days) ?? 30,
    closestValue: closest, closestCeiling: closest == null ? null : ceiling, nearCeiling: e.near_ceiling === true && closest != null,
    olderFirmId: e.older_firm == null ? null : String(e.older_firm), olderFirmName: typeof e.older_firm_name === "string" && e.older_firm_name ? e.older_firm_name : null,
    olderFirmSameBuyer: e.older_firm_same_buyer === true,
    firmTotal: optNum(e.firm_total), firmBuyers: optNum(e.firm_buyers),
  };
}
