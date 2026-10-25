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
