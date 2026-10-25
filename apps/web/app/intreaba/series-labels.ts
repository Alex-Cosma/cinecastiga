/*
 * Which labels the year chart of "Cum evoluează…" draws (final timeseries
 * §231, "etichete selective"). With many bars every value label overlapped
 * its neighbours and the first and last ran past a phone's edge (F1b-tests:
 * 20 bars of "toți anii" at 320–390 px, and at 1280 px). The values then
 * stay on the peak, the last bar and the first one (not beside the peak),
 * and under 600 px on the peak only. Under 600 px the years thin out to
 * the peak's, then every second or fifth one counted back from the last,
 * and the first, never two too close. A label that is not drawn stays in the
 * bar's link text (screen readers), and every value is in «Tabel».
 */

export interface SeriesLabels {
  /** Bars whose value is drawn on a wide screen. */
  value: ReadonlySet<number>;
  /** Bars whose value is drawn under 600 px. */
  valuePhone: ReadonlySet<number>;
  /** Bars whose year is drawn under 600 px. */
  yearPhone: ReadonlySet<number>;
}

/** Up to 8 bars every value fits beside its neighbours on a wide screen; up to 3 on a phone; up to 9 years. */
const ALL_VALUES = 8, ALL_VALUES_PHONE = 3, ALL_YEARS_PHONE = 9;

const range = (count: number) => new Set(Array.from({ length: count }, (_, i) => i));

/** Keeps candidates in order, skipping any closer than `gap` bars to one already kept. */
function spaced(candidates: readonly number[], gap: number): Set<number> {
  const kept: number[] = [];
  for (const index of candidates) if (!kept.some((k) => Math.abs(k - index) < gap)) kept.push(index);
  return new Set(kept);
}

/** The first year of the chart's axis (final timeseries §4): the archive's direct acquisitions start in April 2018. */
export const CHART_FIRST_YEAR = 2018;

export interface YearPoint { year: number; value: number; count: number }
/** A year the axis draws without data: a bar of 0, not a link (the axis is continuous). */
export type AxisPoint<P extends YearPoint> = P | { year: number; value: 0; count: 0; empty: true };
/** The years before the axis, as one footer row ("3.330 de înregistrări datate 2000–2017 nu apar pe axă"). */
export interface BeforeAxis { from: number; to: number; years: number[]; value: number; count: number }

/**
 * The year chart's axis, a display rule only (final timeseries §4, §6): from
 * 2018 to the last year, continuous (an empty year is a bar of 0); the older
 * contracts are one row under it, never dropped (the bars and that row add up
 * to the total). A series with no year from 2018 on keeps its own years.
 */
export function seriesAxis<P extends YearPoint>(series: readonly P[], first = CHART_FIRST_YEAR): { bars: AxisPoint<P>[]; before: BeforeAxis | null } {
  const sorted = [...series].sort((a, b) => a.year - b.year);
  const late = sorted.filter((p) => p.year >= first);
  const early = late.length ? sorted.filter((p) => p.year < first) : [];
  const drawn = late.length ? late : sorted;
  const bars: AxisPoint<P>[] = [];
  if (drawn.length) {
    const byYear = new Map(drawn.map((p) => [p.year, p]));
    for (let year = drawn[0]!.year; year <= drawn[drawn.length - 1]!.year; year++) bars.push(byYear.get(year) ?? { year, value: 0, count: 0, empty: true });
  }
  const before = early.length ? {
    from: early[0]!.year, to: early[early.length - 1]!.year, years: early.map((p) => p.year),
    value: early.reduce((n, p) => n + p.value, 0), count: early.reduce((n, p) => n + p.count, 0),
  } : null;
  return { bars, before };
}

export function seriesLabels(count: number, peak: number): SeriesLabels {
  const last = count - 1;
  // The peak first: when the last or the first bar is its neighbour, the peak keeps its value.
  const value = count <= ALL_VALUES ? range(count) : spaced([peak, last, 0], 2);
  const valuePhone = count <= ALL_VALUES_PHONE ? range(count) : new Set([peak]);
  let yearPhone: Set<number>;
  if (count <= ALL_YEARS_PHONE) yearPhone = range(count);
  else {
    const step = count < 15 ? 2 : 5;
    const ticks = Array.from({ length: Math.floor(last / step) + 1 }, (_, i) => last - i * step);
    // The peak's year first (its value is the one drawn), then the last, the ticks and the first.
    yearPhone = spaced([peak, last, ...ticks, 0], step === 2 ? 2 : 3);
  }
  return { value, valuePhone, yearPhone };
}
