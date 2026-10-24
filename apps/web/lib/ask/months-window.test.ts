import { describe, expect, it } from "vitest";
import {
  autoMonthsUnresolved, defaultTrendYears, monthsLabel, noCompleteMonth, partialMonths, sameMonthsWindow, trendYearsFrom, WHOLE_YEAR,
  type CoveragePeriods,
} from "./months-window";

// Plan §2.6, §2.8; trend final §3.2–3.3: the years a new trend compares and the months of `auto`.

/** The local copy (1 Oct 2026): both channels to 25 September 2026, no "complet până la" day yet. */
const local: CoveragePeriods = { da: { from: "2018-04-02", to: "2026-09-25" }, contracts: { from: "2000-01-06", to: "2026-09-25" } };
/** Production on 21 Oct 2026 (audit F10): contracts complete through June, the DA rule computed too. */
const prod = (da: string | null, contracts: string | null, to = "2026-10-20"): CoveragePeriods => ({
  da: { from: "2018-04-02", to, completeUntil: da }, contracts: { from: "2018-01-03", to, completeUntil: contracts }, checkpoint: "c1",
});

describe("the default years of a new trend", () => {
  it("compare the latest year every channel has complete with the year before", () => {
    // Without "complet până la": a year the archive has gone past.
    expect(defaultTrendYears(local, "all")).toEqual({ yearFrom: 2024, yearTo: 2025 });
    expect(defaultTrendYears(prod("2026-10-18", "2026-06-30"), "all")).toEqual({ yearFrom: 2024, yearTo: 2025 });
    // January–March 2027: December's contracts are still being published.
    expect(defaultTrendYears(prod("2027-02-10", "2026-11-30", "2027-02-12"), "all")).toEqual({ yearFrom: 2024, yearTo: 2025 });
    expect(defaultTrendYears(prod("2027-04-10", "2026-12-31", "2027-04-12"), "all")).toEqual({ yearFrom: 2025, yearTo: 2026 });
    // The source's own channels: direct acquisitions alone are complete through 2026 earlier.
    expect(defaultTrendYears(prod("2027-02-10", "2026-11-30", "2027-02-12"), "da")).toEqual({ yearFrom: 2025, yearTo: 2026 });
    expect(defaultTrendYears(prod("2027-02-10", "2026-11-30", "2027-02-12"), "contracts")).toEqual({ yearFrom: 2024, yearTo: 2025 });
  });

  it("start in 2019 at the earliest, and are unknown without the periods", () => {
    expect(defaultTrendYears(null, "all")).toBeNull();
    const early: CoveragePeriods = { da: { from: "2018-04-02", to: "2020-03-01" }, contracts: { from: "2018-01-03", to: "2020-03-01" } };
    expect(defaultTrendYears(early, "all")).toBeNull();
    const two: CoveragePeriods = { da: { from: "2018-04-02", to: "2021-01-05" }, contracts: { from: "2018-01-03", to: "2021-01-05" } };
    expect(defaultTrendYears(two, "all")).toEqual({ yearFrom: 2019, yearTo: 2020 });
  });

  it("follow another question's period: a range keeps its ends, one year is compared with the year before", () => {
    const defaults = { yearFrom: 2024, yearTo: 2025 };
    expect(trendYearsFrom({ yearFrom: 2021, yearTo: 2025 }, defaults)).toEqual({ yearFrom: 2021, yearTo: 2025 });
    expect(trendYearsFrom({ yearFrom: 2025, yearTo: 2025 }, defaults)).toEqual({ yearFrom: 2024, yearTo: 2025 });
    expect(trendYearsFrom({ yearTo: 2023 }, defaults)).toEqual({ yearFrom: 2022, yearTo: 2023 });
    expect(trendYearsFrom({ yearFrom: 2019 }, defaults)).toEqual({ yearFrom: 2019, yearTo: 2020 });
    expect(trendYearsFrom({ yearFrom: 2018, yearTo: 2018 }, defaults)).toEqual({ yearFrom: 2019, yearTo: 2020 });
    expect(trendYearsFrom({}, defaults)).toEqual(defaults);
    expect(trendYearsFrom({}, null)).toBeNull();
  });
});

describe("the same months of both years (sameMonthsWindow)", () => {
  it("are whole years without the key, after the chip is removed, and the chosen months as chosen", () => {
    expect(sameMonthsWindow(null, "all", 2026, undefined)).toEqual(WHOLE_YEAR);
    expect(sameMonthsWindow(null, "all", 2026, "whole")).toEqual(WHOLE_YEAR);
    expect(sameMonthsWindow(null, "all", 2026, [2, 7])).toEqual({ from: 2, to: 7, mode: "chosen" });
  });

  it("resolve `auto` to January through the last whole month both channels have complete", () => {
    // The owner's example: 2026 complete through 31 May on both channels → ian.–mai.
    expect(sameMonthsWindow(prod("2026-05-31", "2026-06-30"), "all", 2026, "auto")).toEqual({ from: 1, to: 5, mode: "auto" });
    // A day inside a month: that month is not whole yet.
    expect(sameMonthsWindow(prod("2026-10-18", "2026-06-15"), "all", 2026, "auto")).toEqual({ from: 1, to: 5, mode: "auto" });
    // Only the source's channels count.
    expect(sameMonthsWindow(prod("2026-10-18", "2026-06-30"), "contracts", 2026, "auto")).toEqual({ from: 1, to: 6, mode: "auto" });
    expect(sameMonthsWindow(prod("2026-09-30", "2026-06-30"), "da", 2026, "auto")).toEqual({ from: 1, to: 9, mode: "auto" });
  });

  it("is whole years when the later year is complete", () => {
    expect(sameMonthsWindow(prod("2026-10-18", "2026-06-30"), "all", 2025, "auto")).toEqual({ from: 1, to: 12, mode: "auto" });
    // A closed year needs no "complet până la" day: the archive has gone past it (the local copy).
    expect(sameMonthsWindow(local, "all", 2025, "auto")).toEqual({ from: 1, to: 12, mode: "auto" });
    expect(sameMonthsWindow(prod(null, "2026-06-30"), "all", 2025, "auto")).toEqual({ from: 1, to: 12, mode: "auto" });
  });

  it("asks for chosen months when the current year's complete months are not established", () => {
    // Plan §2.6: never a part of a year compared with a whole one.
    expect(sameMonthsWindow(local, "all", 2026, "auto")).toEqual({ error: autoMonthsUnresolved(2026) });
    expect(sameMonthsWindow(prod(null, "2026-06-30"), "all", 2026, "auto")).toEqual({ error: autoMonthsUnresolved(2026) });
    expect(sameMonthsWindow(prod(null, "2026-06-30"), "contracts", 2026, "auto")).toEqual({ from: 1, to: 6, mode: "auto" });
    expect(sameMonthsWindow(null, "all", 2025, "auto")).toEqual({ error: autoMonthsUnresolved(2025) });
    // No whole month of the year yet.
    expect(sameMonthsWindow(prod("2027-01-20", "2026-12-31", "2027-01-21"), "all", 2027, "auto")).toEqual({ error: noCompleteMonth(2027) });
    expect(sameMonthsWindow(prod("2027-02-10", "2026-11-30", "2027-02-12"), "all", 2027, "auto")).toEqual({ error: noCompleteMonth(2027) });
  });

  it("are named the kit's way and handed to the engine only when they are not the whole year", () => {
    expect(monthsLabel({ from: 1, to: 5 })).toBe("ian.–mai");
    expect(monthsLabel({ from: 9, to: 12 })).toBe("sept.–dec.");
    expect(monthsLabel({ from: 6, to: 6 })).toBe("iun.");
    expect(partialMonths({ from: 1, to: 5, mode: "auto" })).toEqual([1, 5]);
    expect(partialMonths({ from: 1, to: 12, mode: "auto" })).toBeNull();
    expect(partialMonths(null)).toBeNull();
  });
});
