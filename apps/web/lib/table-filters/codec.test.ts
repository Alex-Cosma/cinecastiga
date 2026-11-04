import { describe, expect, it } from "vitest";
import { txColumns } from "../entity-tx-columns";
import { activeOnly, filterParams, isActive, readFilters, withValue, writeFilters } from "./codec";
import { chipsOf, datesText, monthLabel, rangeText } from "./describe";
import type { FilterState } from "./types";

const columns = txColumns(true);
const read = (search: string): FilterState => {
  const p = new URLSearchParams(search);
  return readFilters(columns, (k) => p.get(k));
};

describe("a table's filters in the address", () => {
  it("reads every kind of column and writes it back the same, beside the page's own parameters", () => {
    const search = "?rol=autoritate&an=2019,2021&tip=directe&furnizor=2015685,2070573&cpv=71621000-7&valoare=1000..50000&sem=da_round";
    const state = read(search);
    expect(state).toEqual({
      data: { kind: "dates", years: ["2019", "2021"], from: null, to: null },
      tip: { kind: "options", values: ["directe"] },
      partener: { kind: "pick", values: ["2015685", "2070573"] },
      cpv: { kind: "pick", values: ["71621000-7"] },
      valoare: { kind: "range", min: 1000, max: 50000 },
      semnale: { kind: "options", values: ["da_round"] },
    });
    expect(writeFilters(columns, "?rol=autoritate&an=2018", state)).toBe(search);
  });

  it("reads an interval of months and open ends", () => {
    expect(read("?an=2020-03..2021-12").data).toEqual({ kind: "dates", years: [], from: "2020-03", to: "2021-12" });
    expect(read("?an=..2021-12").data).toEqual({ kind: "dates", years: [], from: null, to: "2021-12" });
    expect(read("?valoare=50000..").valoare).toEqual({ kind: "range", min: 50000, max: null });
  });

  it("drops what is malformed instead of guessing", () => {
    expect(read("?an=2021-12..2020-01&valoare=9..1&cpv=7162&furnizor=abc&tip=toate&sem=DROP%20TABLE")).toEqual({});
    expect(read("?an=2021,20x1,2021").data).toEqual({ kind: "dates", years: ["2021"], from: null, to: null });
  });

  it("still reads the addresses before the funnels, and writes only the new ones", () => {
    expect(read("?canal=contracte").tip).toEqual({ kind: "options", values: ["contracte"] });
    expect(read("?excluse=1&canal=directe").tip).toEqual({ kind: "options", values: ["excluse"] });
    expect(writeFilters(columns, "?canal=directe&excluse=1&rol=autoritate", read("?canal=contracte"))).toBe("?rol=autoritate&tip=contracte");
  });

  it("writes nothing for no filter and leaves empty values out of the state", () => {
    expect(writeFilters(columns, "?an=2021&sem=da_split", {})).toBe("");
    const state = withValue({ tip: { kind: "options", values: ["directe"] } }, "tip", { kind: "options", values: [] });
    expect(state).toEqual({});
    expect(isActive({ kind: "range", min: null, max: null })).toBe(false);
    expect(activeOnly({ data: { kind: "dates", years: [], from: null, to: null } })).toEqual({});
    expect(filterParams(columns, read("?an=2021")).toString()).toBe("an=2021");
  });
});

describe("the band's words", () => {
  it("says a date, an interval and a value the way the site does", () => {
    expect(monthLabel("2021-02")).toBe("feb. 2021");
    expect(datesText({ kind: "dates", years: ["2021"], from: null, to: null })).toBe("anul 2021");
    expect(datesText({ kind: "dates", years: ["2019", "2021"], from: null, to: null })).toBe("anii 2019, 2021");
    expect(datesText({ kind: "dates", years: [], from: "2020-03", to: "2021-12" })).toBe("din mar. 2020 până în dec. 2021");
    expect(datesText({ kind: "dates", years: [], from: null, to: "2021-12" })).toBe("până în dec. 2021");
    expect(rangeText({ kind: "range", min: 10000, max: 100000 }, "lei")).toBe("10.000–100.000 lei");
    expect(rangeText({ kind: "range", min: 50000, max: null }, "lei")).toBe("peste 50.000 lei");
    expect(rangeText({ kind: "range", min: null, max: 5000 }, "lei")).toBe("sub 5.000 lei");
  });

  it("gives each chosen option its own chip, named, which takes out only that option", () => {
    const state = read("?an=2021&furnizor=1,2&tip=excluse&sem=fara");
    const chips = chipsOf(columns, state, { partener: { "1": "ROTACO" } });
    expect(chips.map((c) => [c.lead, c.value])).toEqual([
      ["", "anul 2021"], ["", "excluse din total"], ["furnizor", "ROTACO"], ["furnizor", "2"], ["", "fără semnal"],
    ]);
    expect(chips[2]!.without["partener"]).toEqual({ kind: "pick", values: ["2"] });
    expect(chips[3]!.without["partener"]).toEqual({ kind: "pick", values: ["1"] });
    expect(chips[0]!.without["data"]).toBeUndefined();
  });
});
