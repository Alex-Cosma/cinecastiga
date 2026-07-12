import { describe, expect, it } from "vitest";
import {
  addDays,
  bucharestDayOf,
  bucharestToday,
  closedWindow,
  eachDay,
  inWindow,
  windowLengthDays,
} from "../src/scrape/window.js";

describe("bucharest window helpers", () => {
  it("computes bucharest-today across the UTC midnight gap", () => {
    // 2026-07-11 23:30 UTC = 2026-07-12 02:30 Bucharest (EEST, +03:00)
    expect(bucharestToday(new Date("2026-07-11T23:30:00Z"))).toBe("2026-07-12");
    // 2026-07-12 01:00 UTC = 2026-07-12 04:00 Bucharest
    expect(bucharestToday(new Date("2026-07-12T01:00:00Z"))).toBe("2026-07-12");
  });

  it("handles DST transitions (calendar math immune)", () => {
    // spring forward: 2026-03-29 in Romania
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    // fall back: 2026-10-25
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    // winter: 22:30 UTC = 00:30 Bucharest next day (EET, +02:00)
    expect(bucharestToday(new Date("2026-12-01T22:30:00Z"))).toBe("2026-12-02");
  });

  it("closedWindow ends at D-1", () => {
    const w = closedWindow(30, new Date("2026-07-12T10:00:00Z"));
    expect(w.end).toBe("2026-07-11");
    expect(w.start).toBe("2026-06-12");
    expect(windowLengthDays(w)).toBe(30);
  });

  it("eachDay iterates inclusively", () => {
    const days = [...eachDay({ start: "2026-06-29", end: "2026-07-02" })];
    expect(days).toEqual(["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02"]);
  });

  it("inWindow is inclusive on both edges", () => {
    const w = { start: "2026-07-01", end: "2026-07-10" };
    expect(inWindow("2026-07-01", w)).toBe(true);
    expect(inWindow("2026-07-10", w)).toBe(true);
    expect(inWindow("2026-06-30", w)).toBe(false);
    expect(inWindow("2026-07-11", w)).toBe(false);
  });

  it("bucharestDayOf converts SEAP timestamps", () => {
    // SEAP timestamps carry local offsets
    expect(bucharestDayOf("2026-07-01T00:23:00+03:00")).toBe("2026-07-01");
    // near-midnight UTC lands on the next Bucharest day
    expect(bucharestDayOf("2026-06-30T22:30:00Z")).toBe("2026-07-01");
  });
});
