import { describe, expect, it } from "vitest";
import { assembleSeries, CHANNEL_PARTS, MAX_SERIES_DIVISIONS, OTHER_PART, pickDivisions, seriesMonthsSpan, type SeriesRow } from "./series";
import { divisionShortName, SHORT_DIVISIONS } from "./cpv-divisions";

// The evolution's options as the engine assembles them (plan §4.3; final timeseries §3.7–§3.9).

const row = (k: string | null, part: string | null, v: string, n: number, same?: [string, number]): SeriesRow =>
  ({ k, part, v, n: String(n), ...(same ? { vm: same[0], nm: String(same[1]) } : {}) });

describe("the months of a series", () => {
  it("counts both ends, from January and to December when the months are not chosen", () => {
    expect(seriesMonthsSpan({ yearFrom: 2025, yearTo: 2025 })).toBe(12);
    expect(seriesMonthsSpan({ yearFrom: 2023, yearTo: 2025 })).toBe(36);
    expect(seriesMonthsSpan({ yearFrom: 2022, yearTo: 2025 })).toBe(48);
    expect(seriesMonthsSpan({ yearFrom: 2024, yearTo: 2025, monthFrom: 3, monthTo: 2 })).toBe(12);
    expect(seriesMonthsSpan({ yearTo: 2025 })).toBeNull();
  });
});

describe("the divisions of a split by domain", () => {
  it("names at most four, each at least 5% of the value, largest first; never the records without a code", () => {
    const values = new Map<string | null, number>([["45", 50], ["33", 20], ["09", 10], ["34", 8], ["79", 6], ["90", 4], [null, 30]]);
    expect(pickDivisions(values)).toEqual(["45", "33", "09", "34"]);
    expect(pickDivisions(values)).toHaveLength(MAX_SERIES_DIVISIONS);
    expect(pickDivisions(new Map([["45", 96], ["33", 4]]))).toEqual(["45"]);
    expect(pickDivisions(new Map())).toEqual([]);
  });

  it("have a short name for every division of the catalogue", () => {
    // The 45 divisions of CPV 2008 (03 … 98); a legend's name stays short enough for one line.
    expect(SHORT_DIVISIONS).toHaveLength(45);
    expect(SHORT_DIVISIONS.every((code) => /^\d{2}$/.test(code))).toBe(true);
    expect(divisionShortName("45")).toBe("Construcții");
    expect(divisionShortName("45233140")).toBe("Construcții");
    for (const code of SHORT_DIVISIONS) expect(divisionShortName(code).length, code).toBeLessThanOrEqual(28);
    expect(divisionShortName("99")).toBe("CPV 99");
  });
});

describe("a series assembled from the grouped rows", () => {
  it("is today's answer without options: one point per dated year, the undated left out", () => {
    const { series, parts, ref } = assembleSeries([row("2024", null, "10.5", 2), row("2025", null, "20", 3), row(null, null, "99", 9)], { grain: "year", split: null });
    expect(series).toEqual([{ year: 2024, value: 10.5, count: 2 }, { year: 2025, value: 20, count: 3 }]);
    expect(parts).toBeUndefined();
    expect(ref).toBeUndefined();
  });

  it("month by month: the month of each point, in order", () => {
    const { series } = assembleSeries([row("2025-02", null, "2", 1), row("2025-01", null, "1", 1), row("2025", null, "7", 7)], { grain: "month", split: null });
    expect(series).toEqual([{ year: 2025, month: 1, value: 1, count: 1 }, { year: 2025, month: 2, value: 2, count: 1 }]);
  });

  it("by channel: procedures at the bottom, each part's exact sum adding up to the bar", () => {
    const { series, parts } = assembleSeries([
      row("2025", "contracts", "1130000000.12", 3), row("2025", "da", "481712345.67", 40), row("2024", "da", "0.1", 1), row("2024", "da", "0.2", 1),
    ], { grain: "year", split: "channel" });
    expect(parts).toEqual(CHANNEL_PARTS);
    // 0.1 + 0.2 as decimals, not floats; the bar is the exact sum of its parts.
    expect(series[0]).toEqual({ year: 2024, value: 0.3, count: 2, parts: { da: { value: 0.3, count: 2 } } });
    expect(series[1]).toEqual({ year: 2025, value: 1611712345.79, count: 43, parts: { contracts: { value: 1130000000.12, count: 3 }, da: { value: 481712345.67, count: 40 } } });
    expect(assembleSeries([row("2025", "da", "1", 1)], { grain: "year", split: "channel" }).parts).toEqual([{ key: "da", label: "Directe" }]);
  });

  it("by domain: the divisions over the whole series, the rest and the records without a code as „Alte domenii”", () => {
    const { series, parts } = assembleSeries([
      row("2024", "45", "60", 1), row("2024", "33", "30", 3), row("2024", "79", "2", 1),
      row("2025", "45", "50", 1), row("2025", null, "5", 2), row("2025", "33", "10", 1),
    ], { grain: "year", split: "domain" });
    expect(parts).toEqual([{ key: "45", code: "45", label: "Construcții" }, { key: "33", code: "33", label: divisionShortName("33") }, OTHER_PART]);
    expect(series.map((p) => [p.year, p.value, p.parts])).toEqual([
      [2024, 92, { "45": { value: 60, count: 1 }, "33": { value: 30, count: 3 }, other: { value: 2, count: 1 } }],
      [2025, 65, { "45": { value: 50, count: 1 }, other: { value: 5, count: 2 }, "33": { value: 10, count: 1 } }],
    ]);
    for (const p of series) expect(Object.values(p.parts!).reduce((t, x) => t + x.value, 0)).toBeCloseTo(p.value, 6);
  });

  it("marks the year before the incomplete last one on the same months, only when it has records", () => {
    const rows = [row("2024", null, "100", 10, ["40", 4]), row("2025", null, "50", 5, ["50", 5])];
    expect(assembleSeries(rows, { grain: "year", split: null, ref: { year: 2025, to: 5 } }).ref)
      .toEqual({ year: 2024, months: [1, 5], value: 40, count: 4, current: { value: 50, count: 5 } });
    expect(assembleSeries([row("2025", null, "50", 5, ["50", 5])], { grain: "year", split: null, ref: { year: 2025, to: 5 } }).ref).toBeUndefined();
    // A split adds its parts' same months.
    const split = [row("2024", "da", "60", 6, ["20", 2]), row("2024", "contracts", "40", 4, ["20", 2]), row("2025", "da", "30", 3, ["30", 3])];
    expect(assembleSeries(split, { grain: "year", split: "channel", ref: { year: 2025, to: 5 } }).ref).toMatchObject({ value: 40, count: 4 });
  });
});
