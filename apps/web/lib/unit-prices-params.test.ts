import { describe, expect, it } from "vitest";
import { applyPin, clampPage, flatParams, MAX_PAGE, parsePage, parsePin, parseYear, pinParam } from "./unit-prices-params";

describe("unit prices: the address", () => {
  it("keeps the first value of a repeated parameter and drops what is not text", () => {
    expect(flatParams({ judet: ["Cluj", "Alba"], an: "2019", gol: undefined, lista: [] })).toEqual({ judet: "Cluj", an: "2019" });
  });

  it("reads `pagina` as a whole page from 1, anything else as the first page", () => {
    expect(parsePage(undefined)).toBe(0);
    expect(parsePage("1")).toBe(0);
    expect(parsePage("3")).toBe(2);
    for (const bad of ["1.5", "1e30", "-5", "0", "Infinity", "abc", "", " 2", "2 "]) expect(parsePage(bad)).toBe(0);
    expect(parsePage("999999")).toBe(MAX_PAGE - 1);
    expect(Number.isInteger(parsePage("99999"))).toBe(true);
  });

  it("keeps the page inside the list's pages", () => {
    expect(clampPage(0, 0, 25)).toEqual({ page: 0, pages: 1 });
    expect(clampPage(99998, 21, 25)).toEqual({ page: 0, pages: 1 });
    expect(clampPage(5, 60, 25)).toEqual({ page: 2, pages: 3 });
    expect(clampPage(1, 50, 25)).toEqual({ page: 1, pages: 2 });
    expect(clampPage(Number.NaN, 50, 25)).toEqual({ page: 0, pages: 2 });
    expect(clampPage(-3, 50, 25)).toEqual({ page: 0, pages: 2 });
  });

  it("reads a year of this century only", () => {
    expect(parseYear("2019")).toBe(2019);
    for (const bad of [undefined, "1999", "20190", "abc", "2019,2018"]) expect(parseYear(bad)).toBeNull();
  });

  it("reads the pinned institution, with or without its year", () => {
    expect(parsePin("12345-2019")).toEqual({ authorityId: "12345", year: 2019 });
    expect(parsePin("12345")).toEqual({ authorityId: "12345", year: null });
    expect(parsePin(pinParam("77", 2025))).toEqual({ authorityId: "77", year: 2025 });
    for (const bad of [undefined, "", "0", "abc", "12-1999", "12-2019-1", "1234567890123456789", "1;drop"]) expect(parsePin(bad)).toBeNull();
  });
});

describe("unit prices: the pinned row", () => {
  const row = (authority_id: string, year: number) => ({ authority_id, year });
  const page = [row("1", 2019), row("2", 2019), row("3", 2018)];

  it("leaves the page alone without a pin", () => {
    expect(applyPin(page, [])).toEqual({ rows: page, extra: 0 });
  });

  it("moves a pinned row of this page to the top without adding a row", () => {
    expect(applyPin(page, [row("3", 2018)])).toEqual({ rows: [row("3", 2018), row("1", 2019), row("2", 2019)], extra: 0 });
  });

  it("adds a pinned row from another page and says so", () => {
    const out = applyPin(page, [row("9", 2019)]);
    expect(out.rows.map((r) => r.authority_id)).toEqual(["9", "1", "2", "3"]);
    expect(out.extra).toBe(1);
  });

  it("tells an institution's years apart: only the pinned year moves", () => {
    const rows = [row("1", 2019), row("1", 2018)];
    expect(applyPin(rows, [row("1", 2018)])).toEqual({ rows: [row("1", 2018), row("1", 2019)], extra: 0 });
  });
});
