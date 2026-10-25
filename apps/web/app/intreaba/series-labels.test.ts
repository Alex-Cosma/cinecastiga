import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seriesAxis, seriesLabels } from "./series-labels";

/*
 * F1b-tests: the year chart's selective labels (final timeseries §231). The
 * browser check found 20 bars of "toți anii" whose values overlapped at every
 * width and ran past the edge of a 320–390 px screen.
 */

const sorted = (set: ReadonlySet<number>) => [...set].sort((a, b) => a - b);

describe("the year chart's labels", () => {
  it("draws every label while they fit", () => {
    const few = seriesLabels(3, 1);
    expect(sorted(few.value)).toEqual([0, 1, 2]);
    expect(sorted(few.valuePhone)).toEqual([0, 1, 2]);
    expect(sorted(few.yearPhone)).toEqual([0, 1, 2]);
    expect(sorted(seriesLabels(8, 5).value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(sorted(seriesLabels(9, 5).yearPhone)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("keeps the values of the peak, the last and the first bar, the peak only on a phone", () => {
    // 2000–2026 without the empty years: 20 bars, the peak in 2024 (17), the last 2026 (19).
    const many = seriesLabels(20, 17);
    expect(sorted(many.value)).toEqual([0, 17, 19]);
    expect(sorted(many.valuePhone)).toEqual([17]);
    // A last bar beside the peak gives way to it.
    expect(sorted(seriesLabels(20, 18).value)).toEqual([0, 18]);
    expect(sorted(seriesLabels(4, 3).valuePhone)).toEqual([3]);
  });

  it("thins the years on a phone: the peak's, then counted back from the last, never two side by side", () => {
    const many = seriesLabels(20, 17);
    // The peak's year (2024) wins over the last one beside it; then every fifth back from 2026.
    expect(sorted(many.yearPhone)).toEqual([0, 4, 9, 14, 17]);
    expect(sorted(seriesLabels(20, 10).yearPhone)).toEqual([0, 4, 10, 14, 19]);
    for (const [count, peak] of [[20, 17], [12, 0], [12, 11], [15, 7], [10, 9], [27, 13]] as const) {
      const years = sorted(seriesLabels(count, peak).yearPhone);
      const gap = count < 15 ? 2 : 3;
      expect(years, `${count}/${peak}`).toContain(peak);
      if (count - 1 - peak >= gap) expect(years, `${count}/${peak}`).toContain(count - 1);
      for (let i = 1; i < years.length; i++) expect(years[i]! - years[i - 1]!, `${count}/${peak}`).toBeGreaterThanOrEqual(gap);
    }
  });

  it("draws the axis from 2018, continuous, with the older years in one row that keeps the total", () => {
    const p = (year: number, value: number, count = 1) => ({ year, value, count });
    const series = [p(2000, 5), p(2007, 10, 2), p(2017, 1), p(2018, 100, 10), p(2020, 300, 30), p(2026, 50, 5)];
    const { bars, before } = seriesAxis(series);
    expect(bars.map((b) => [b.year, b.value, "empty" in b])).toEqual([
      [2018, 100, false], [2019, 0, true], [2020, 300, false], [2021, 0, true], [2022, 0, true], [2023, 0, true], [2024, 0, true], [2025, 0, true], [2026, 50, false],
    ]);
    expect(before).toEqual({ from: 2000, to: 2017, years: [2000, 2007, 2017], value: 16, count: 4 });
    // Bars + the row = today's total (plan §4.3 Teste).
    expect(bars.reduce((n, b) => n + b.value, 0) + before!.value).toBe(series.reduce((n, b) => n + b.value, 0));
    // An old period entirely before 2018 keeps its own years; one year is one bar.
    expect(seriesAxis([p(2012, 1), p(2010, 2)]).bars.map((b) => b.year)).toEqual([2010, 2011, 2012]);
    expect(seriesAxis([p(2012, 1), p(2010, 2)]).before).toBeNull();
    expect(seriesAxis([p(2025, 7)])).toEqual({ bars: [p(2025, 7)], before: null });
    expect(seriesAxis([])).toEqual({ bars: [], before: null });
  });

  it("hides a label from sight only: it keeps its line and stays in the bar's link text", () => {
    const css = readFileSync(new URL("./question-results.css", import.meta.url), "utf8");
    // Transparent, not removed: every bar measures from the same space and a screen reader still reads the value.
    expect(css).toMatch(/\.ask-ts \.ts-off \{\s*color: transparent;\s*max-width: 100%;\s*overflow: hidden;/);
    const phone = css.slice(css.lastIndexOf("@media (max-width: 600px) {"));
    expect(phone).toMatch(/\.ask-ts \.ts-off-sm \{\s*color: transparent;\s*max-width: 100%;\s*overflow: hidden;/);
    expect(css).not.toMatch(/\.ts-off[^{]*\{[^}]*(display: none|visibility: hidden|position: absolute)/);
  });
});
