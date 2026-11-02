import { countWords } from "../../../lib/ask/answer-text";
import { sumDecimalStrings } from "../../../lib/ask/evidence";
import { formatRon } from "../../../lib/format";
import type { EntityYear } from "../../../lib/marts";

/*
 * The entity page's top (owner, 2 November 2026): the risk against its bands, a ledger of the activity per channel
 * (its swatches are the chart's legend) and the value per year, as bars per channel; for a firm, its turnover per year
 * as a dashed line over them. Pure: the page computes it on the server, the chart (EntityYears) only draws it.
 */

/** Where the risk scale's „slab” starts: the lowest score a weak band displays (risk-score.ts, „0 · 20–39 · 40–67 · 68–100”). */
export const RISK_SCALE_SLAB = 20;

/** A year of the chart: per channel, its records, its value and its share of the scale; `partial` is the year in progress. */
export interface YearBar {
  year: number;
  nDa: number; valueDa: number;
  nCt: number; valueCt: number;
  total: number;
  daPct: number; ctPct: number;
  turnover: number | null; turnoverPct: number | null;
  partial: boolean;
}
export interface YearsModel { bars: YearBar[]; ticks: { label: string; pct: number }[]; turnover: boolean }

/** The scale's top: the first of 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ᵏ at or above the largest value. */
export function niceTop(max: number): number {
  if (!(max > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * power >= max) ?? 10) * power;
}

const decimal = (v: number) => v.toLocaleString("ro-RO", { maximumFractionDigits: 1 });
/** An axis value in the chart's short words: „0”, „750 mii”, „1,5 mil.”, „2 mld.”. */
export function axisLabel(v: number): string {
  if (v >= 1e9) return `${decimal(v / 1e9)} mld.`;
  if (v >= 1e6) return `${decimal(v / 1e6)} mil.`;
  if (v >= 1e3) return `${decimal(v / 1e3)} mii`;
  return decimal(v);
}

/**
 * The chart from the years with records: every calendar year from the first to the last (a year without records is a
 * gap, never skipped), the turnover of those years only, and a scale over both so the line and the bars share one axis.
 */
export function yearsModel(years: readonly EntityYear[], turnover: readonly { year: number; value: number }[] | null, currentYear: number): YearsModel | null {
  const withRecords = years.filter((y) => y.nDa + y.nCt > 0);
  if (withRecords.length === 0) return null;
  const first = withRecords[0]!.year, last = withRecords.at(-1)!.year;
  const byYear = new Map(years.map((y) => [y.year, y]));
  const turnoverByYear = new Map((turnover ?? []).map((t) => [t.year, t.value]));
  const rows = Array.from({ length: last - first + 1 }, (_, i) => {
    const year = first + i, y = byYear.get(year);
    const valueDa = Number(y?.valueDa ?? 0), valueCt = Number(y?.valueCt ?? 0);
    return { year, nDa: y?.nDa ?? 0, valueDa, nCt: y?.nCt ?? 0, valueCt, total: valueDa + valueCt, turnover: turnoverByYear.get(year) ?? null };
  });
  const top = niceTop(Math.max(...rows.map((r) => Math.max(r.total, r.turnover ?? 0))));
  const pct = (v: number) => Math.round((v / top) * 1000) / 10;
  return {
    bars: rows.map((r) => ({ ...r, daPct: pct(r.valueDa), ctPct: pct(r.valueCt), turnoverPct: r.turnover === null ? null : pct(r.turnover), partial: r.year === currentYear })),
    ticks: [0, top / 2, top].map((v) => ({ label: axisLabel(v), pct: pct(v) })),
    turnover: rows.some((r) => r.turnover !== null),
  };
}

/** The ledger's rows: per channel, the years with the undated rest, so they add up to the page's total. */
export function ledgerTotals(years: readonly EntityYear[], undated: Omit<EntityYear, "year">): { nDa: number; valueDa: string; nCt: number; valueCt: string } {
  const all = [...years, undated];
  return {
    nDa: all.reduce((n, y) => n + y.nDa, 0), valueDa: sumDecimalStrings(all.map((y) => y.valueDa)),
    nCt: all.reduce((n, y) => n + y.nCt, 0), valueCt: sumDecimalStrings(all.map((y) => y.valueCt)),
  };
}

/** A year's figures as its tip and its name say them: „2021 · 3,9 mil. lei”, then a line per channel and the turnover. */
export function yearWords(bar: YearBar): { head: string; da: string; ct: string | null; turnover: string | null } {
  return {
    head: `${bar.year}${bar.partial ? " (parțial)" : ""} · ${formatRon(bar.total)}`,
    da: `${countWords(bar.nDa, "achiziție directă", "achiziții directe")} · ${formatRon(bar.valueDa)}`,
    ct: bar.nCt > 0 ? `${countWords(bar.nCt, "contract", "contracte")} · ${formatRon(bar.valueCt)}` : null,
    turnover: bar.turnover !== null ? `cifră de afaceri · ${formatRon(bar.turnover)}` : null,
  };
}

/**
 * A signal's evidence line with its period, said once (critique 2 November 2026: „Perioada calculului: 2022 · 2022: 36%
 * din …”): a plain one-year period leads its line as „2021: …”; any other period (a source named, several years, the
 * whole archive) keeps its label.
 */
export function evidenceWithPeriod(label: string, period: string | null, line: string): string {
  if (!period || !/^\d{4}$/.test(period) || label !== `Perioada calculului: ${period}`) return `${label} · ${line}`;
  if (line.startsWith(`${period}:`)) return line;
  // The line's first word in lower case after the year, unless it is an acronym („CPV …”, „HHI …”).
  const first = /^\p{Lu}\p{Ll}/u.test(line) ? line.charAt(0).toLocaleLowerCase("ro-RO") + line.slice(1) : line;
  return `${period}: ${first}`;
}

/** The event a year of the chart sends the records table (TxTable): its year as the table's only filter. */
export const ENTITY_YEAR_EVENT = "entity:year";

/**
 * Where a year's tip starts, under the plot (critique 2 November 2026: over it, it hid the bar under inspection and
 * took its click; the plot is too narrow for a tip beside a bar): centred on its column, inside the plot's width.
 */
export function tipLeft(index: number, count: number, width: number, tipWidth: number): number {
  const center = ((index + 0.5) / count) * width;
  return Math.min(Math.max(0, center - tipWidth / 2), Math.max(0, width - tipWidth));
}

/** The current calendar year in Romania: the chart's year in progress. */
export const bucharestYear = (now = new Date()): number =>
  Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric" }).format(now));

/**
 * The page's own browser title (critique 2 November 2026: every entity tab read „cinecâștigă? — Cine câștigă …”):
 * „BUG FOREST SRL · furnizor, Vaslui”, the layout adding „ — cinecâștigă?”.
 */
export function entityTitle(name: string, role: "supplier" | "authority", county: string | null): string {
  return `${name} · ${role === "supplier" ? "furnizor" : "autoritate"}${county ? `, ${county}` : ""}`;
}
