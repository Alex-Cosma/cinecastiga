import type { CompareEntity } from "../../lib/ask/compile";
import { countWords } from "../../lib/ask/answer-text";
import { COMPARE_FIRST_YEAR } from "../../lib/ask/compare-shared";
import { formatInt, formatRon } from "../../lib/format";

/*
 * F4, the comparison's answer (plan §4.6 P6, P8; final compare §3.4, §4): the
 * words and figures of its cards and its years, pure, for CompareBlock and its
 * tests. Every row defends a number that would mislead without it; an answer
 * saved before F4 lacks the fields and keeps today's card.
 */

/** "2018–2026" from the years of the selection; the records before 2018 apart ("+17 mai vechi"). An older answer: its profile's years. */
export function cardSpan(e: CompareEntity): { years: string | null; older: number } {
  const recent = (e.years ?? []).filter((y) => y.year >= COMPARE_FIRST_YEAR && y.value > 0).map((y) => y.year);
  const older = (e.years ?? []).filter((y) => y.year < COMPARE_FIRST_YEAR).reduce((n, y) => n + (y.count ?? 0), 0);
  const counted = (e.years ?? []).some((y) => y.count !== undefined);
  if (!counted) {
    const a = e.active;
    return { years: a?.from && a.to ? a.from === a.to ? String(a.from) : `${a.from}–${a.to}` : null, older: 0 };
  }
  if (!recent.length) return { years: null, older };
  const from = Math.min(...recent), to = Math.max(...recent);
  return { years: from === to ? String(from) : `${from}–${to}`, older };
}

/** One column of "Pe ani": a year, or every year before 2018 together ("înainte de 2018", "<2018" on a phone). */
export interface YearColumn { key: string; label: string; short: string; older: boolean; a: { value: number; count: number | null }; b: { value: number; count: number | null } }

/**
 * The columns of "Pe ani" (final §4.6): the years before 2018 in one faded
 * column, then every year from the first to the last either has, the empty
 * ones too (a gap is a fact). One year alone draws no chart.
 */
export function yearColumns(a: CompareEntity, b: CompareEntity): YearColumn[] {
  const all = [...(a.years ?? []), ...(b.years ?? [])];
  const side = (e: CompareEntity, pick: (year: number) => boolean) => {
    const rows = (e.years ?? []).filter((y) => pick(y.year));
    // A year without records counts 0 where the answer counts its years (F4); an older answer has no counts.
    const counted = (e.years ?? []).some((y) => y.count !== undefined);
    return { value: rows.reduce((sum, y) => sum + y.value, 0), count: counted ? rows.reduce((n, y) => n + (y.count ?? 0), 0) : null };
  };
  const recent = all.filter((y) => y.year >= COMPARE_FIRST_YEAR).map((y) => y.year);
  const columns: YearColumn[] = [];
  if (all.some((y) => y.year < COMPARE_FIRST_YEAR)) {
    const old = (year: number) => year < COMPARE_FIRST_YEAR;
    columns.push({ key: "older", label: "înainte de 2018", short: "<2018", older: true, a: side(a, old), b: side(b, old) });
  }
  if (recent.length) {
    for (let year = Math.min(...recent); year <= Math.max(...recent); year++) {
      const one = (y: number) => y === year;
      columns.push({ key: String(year), label: String(year), short: String(year), older: false, a: side(a, one), b: side(b, one) });
    }
  }
  return columns.length > 1 ? columns : [];
}

/** A year's readout, for both: "2024 · Cluj-Napoca: 757,3 mil. lei · 867 înregistrări". */
export function yearReadout(column: YearColumn, names: { a: string; b: string }): string[] {
  const one = (name: string, side: YearColumn["a"]) =>
    `${name}: ${formatRon(side.value)}${side.count !== null ? ` · ${countWords(side.count, "înregistrare", "înregistrări")}` : ""}`;
  return [one(names.a, column.a), one(names.b, column.b)];
}

/** "Sediul furnizorilor" (final §4.2, kit §6 compare 5): each class's share of the value, the unknown seat apart. */
export function seatParts(seats: NonNullable<CompareEntity["seats"]>): { same: number; other: number; abroad: number; unknown: number } | null {
  const total = seats.same + seats.other + seats.abroad + seats.unknown;
  if (total <= 0) return null;
  return { same: seats.same / total, other: seats.other / total, abroad: seats.abroad / total, unknown: seats.unknown / total };
}

/**
 * The card's row "Sediul furnizorilor" (S4 review): the four parts and their words, the unknown seat its own
 * (hatched, R7), said only when there is some; without the institution's county no class can be said, so one line
 * says that instead of „0% în același județ”. Null without the seats (a firm, an answer saved before F4).
 */
export function seatRow(e: Pick<CompareEntity, "county" | "seats">):
  { parts: { same: number; other: number; abroad: number; unknown: number }; words: string[] } | { none: string } | null {
  const parts = e.seats ? seatParts(e.seats) : null;
  if (!parts) return null;
  if (!e.county) return { none: "Județul instituției nu e cunoscut." };
  return {
    parts,
    words: [`în același județ ${percent(parts.same)}`, `în alt județ ${percent(parts.other)}`, `în străinătate ${percent(parts.abroad)}`,
      ...(parts.unknown > 0 ? [`sediu necunoscut ${percent(parts.unknown)}`] : [])],
  };
}

/**
 * "Pe locuitor" only between two administrations of one level (final §4.3):
 * two town halls (a București sector's too) or two county councils. An answer
 * saved before F4 has no level: both populations, as before.
 */
export function perCapitaShown(a: CompareEntity, b: CompareEntity): boolean {
  if (!(a.population && a.population > 0 && b.population && b.population > 0)) return false;
  if (a.populationLevel === undefined && b.populationLevel === undefined) return true;
  return a.populationLevel === b.populationLevel;
}

/** A share in whole percents, "<1%" below one (the cards' rows). */
export const percent = (share: number): string => share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`;

/** "la 15 clienți comuni · 59% din totalul firmei" (final §3.4): the card's subtitle with P. */
export function sharedSubtitle(e: CompareEntity): string | null {
  if (!e.whole) return null;
  const share = e.whole.value > 0 ? ` · ${percent(e.value / e.whole.value)} din totalul firmei` : "";
  return `la ${countWords(e.partners ?? 0, "client comun", "clienți comuni")}${share}`;
}

/** "15 din 73" (final §3.4): the shared clients among all of the firm's. */
export const partnersOfWhole = (e: CompareEntity): string | null =>
  e.whole && e.partners !== undefined ? `${formatInt(e.partners)} din ${formatInt(e.whole.partners)}` : null;

/** "Din care câștigate împreună": "1,4 mld. lei · 37 de contracte · 19%" (final §3.4), its share of the card's value. */
export function jointRow(e: CompareEntity): string | null {
  if (!e.joint || e.joint.contracts === 0) return null;
  const share = e.value > 0 ? ` · ${percent(e.joint.value / e.value)}` : "";
  return `${formatRon(e.joint.value)} · ${countWords(e.joint.contracts, "contract", "contracte")}${share}`;
}

/**
 * An institution's records against its contracts (final §4.5, "în asociere"):
 * "Proceduri: 667 de înregistrări din 569 de contracte.", only where they
 * differ (a consortium has one record per winner).
 */
export function consortiumWords(e: CompareEntity): string | null {
  const c = e.streams?.contracts;
  if (!c || c.distinct === undefined || c.distinct === c.count) return null;
  return `Proceduri: ${countWords(c.count, "înregistrare", "înregistrări")} din ${countWords(c.distinct, "contract", "contracte")}.`;
}

/** "+ 483,3 mil. lei pe coduri mai generale" (final §3.2): with a CPV domain, what is coded above it. */
export const generalRow = (e: CompareEntity): string | null =>
  e.general !== undefined && e.general > 0 ? `+ ${formatRon(e.general)} pe coduri mai generale` : null;
