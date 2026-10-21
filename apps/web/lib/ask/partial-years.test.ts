import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { partialYears, partialYearsCaveat, PERIOD_UNKNOWN_CAVEAT, runSpec, useSnapshotCoverage, type CoveragePeriods } from "./compile";
import type { AskSpec } from "./spec";

// Local snapshot of 1 Oct 2026 (marts.data_coverage): DA from 2 April 2018,
// both channels to 25 September 2026.
const periods: CoveragePeriods = {
  da: { from: "2018-04-02", to: "2026-09-25" },
  contracts: { from: "2018-01-03", to: "2026-09-25" },
};

/** SQL tag harness: answers the coverage reads, records nothing else. */
function database(coverage: { present: boolean; rows?: { dataset: string; date_from: string; date_to: string; complete_until?: string | null }[] }) {
  const statements: string[] = [];
  class Fragment {
    constructor(public text: string) {}
    then(resolve: (value: unknown[]) => unknown) {
      statements.push(this.text);
      if (this.text.includes("to_regclass")) return Promise.resolve(resolve([{ ok: coverage.present }]));
      if (this.text.includes("from marts.data_coverage")) return Promise.resolve(resolve(coverage.rows ?? []));
      if (this.text.includes("marts.national_stats")) return Promise.resolve(resolve([2018, 2019, 2025, 2026].map((year) => ({ year }))));
      if (this.text.includes("marts.agg_years")) return Promise.resolve(resolve([
        { y: "2018", v: "45376692338.45", n: "2067252" },
        { y: "2019", v: "77219759074.89", n: "2559759" },
        { y: "2025", v: "180471454904.73", n: "2390346" },
        { y: "2026", v: "77110350942.17", n: "1253945" },
      ]));
      return Promise.resolve(resolve([]));
    }
  }
  const tag = ((chunks: TemplateStringsArray | string, ...params: unknown[]) => typeof chunks === "string" ? new Fragment(chunks) : new Fragment(chunks.reduce((query, text, i) => {
    const value = params[i];
    if (i >= params.length) return query + text;
    return query + text + (value instanceof Fragment ? value.text : "?");
  }, ""))) as unknown as DbSql;
  Object.assign(tag, {
    array: () => new Fragment("?array"),
    begin: async (_options: string, fn: (tx: DbSql) => Promise<unknown>) => fn(tag),
    unsafe: async () => [],
  });
  return { sql: useSnapshotCoverage(tag), statements };
}
const coverageRows = [
  { dataset: "da", date_from: periods.da.from!, date_to: periods.da.to! },
  { dataset: "contracts", date_from: periods.contracts.from!, date_to: periods.contracts.to! },
];

// Regression (audit F19, 21 Oct 2026): the default "evoluție pe ani" showed
// 2018 (DA from 2 April) and 2026 (data to 25 September) as full years, so
// 2019 read as +70% and 2026 as a collapse.
describe("partially covered years", () => {
  it("marks only the first and last archive years, naming each channel's boundary", () => {
    expect(partialYears(periods, "all", [2018, 2019, 2020, 2025, 2026])).toEqual([
      { year: 2018, note: "achizițiile directe de la 02.04.2018; contractele de la 03.01.2018, începutul arhivei" },
      { year: 2026, note: "date până la 25.09.2026" },
    ]);
    expect(partialYears(periods, "da", [2018, 2026])).toEqual([
      { year: 2018, note: "date de la 02.04.2018, începutul arhivei" },
      { year: 2026, note: "date până la 25.09.2026" },
    ]);
  });
  it("treats a calendar-complete archive as complete", () => {
    const full: CoveragePeriods = { da: { from: "2018-01-01", to: "2025-12-31" }, contracts: { from: "2018-01-01", to: "2025-12-31T00:00:00" } };
    expect(partialYears(full, "all", [2018, 2025])).toEqual([]);
  });
  it("judges the selected months, not the whole year, at the ends of a month range", () => {
    expect(partialYears(periods, "all", [2026], { yearFrom: 2026, yearTo: 2026, monthFrom: 1, monthTo: 6 })).toEqual([]);
    expect(partialYears(periods, "all", [2026], { yearFrom: 2026, yearTo: 2026, monthFrom: 1, monthTo: 9 })).toEqual([
      { year: 2026, note: "date până la 25.09.2026" },
    ]);
    expect(partialYears(periods, "da", [2018], { yearFrom: 2018, yearTo: 2018, monthFrom: 5, monthTo: 12 })).toEqual([]);
  });
  it("says when a channel has no records in a year at all", () => {
    const early: CoveragePeriods = { da: periods.da, contracts: { from: "2017-03-01", to: "2026-09-25" } };
    expect(partialYears(early, "all", [2017])).toEqual([
      { year: 2017, note: "achizițiile directe încep la 02.04.2018; contractele de la 01.03.2017, începutul arhivei" },
    ]);
  });
  it("words one and several years", () => {
    expect(partialYearsCaveat([], "series")).toBeNull();
    expect(partialYearsCaveat([{ year: 2026, note: "date până la 25.09.2026" }], "series"))
      .toBe("An acoperit parțial de date: 2026 (date până la 25.09.2026). Totalul lui nu acoperă un an întreg; nu îl compara direct cu ceilalți ani din grafic.");
    expect(partialYearsCaveat([{ year: 2016, note: "x" }, { year: 2017, note: "x" }, { year: 2026, note: "y" }], "selection"))
      .toBe("Perioada aleasă include ani acoperiți parțial de date: 2016, 2017 (x), 2026 (y). Valorile lor nu acoperă un an întreg.");
    expect(partialYearsCaveat(partialYears(periods, "da", [2018, 2026]), "comparison")).toContain("Ani acoperiți parțial de date: 2018 (date de la 02.04.2018, începutul arhivei), 2026");
  });
});

describe("Ask answers over partially covered years", () => {
  it("the national yearly series carries the period caveat and per-year markers, beside unchanged data", async () => {
    const db = database({ present: true, rows: coverageRows });
    const result = await runSpec(db.sql, { block: "timeseries", dataset: "all", measure: "value", filters: {} }, {});
    if ("error" in result) throw new Error(result.error);
    expect(result.partialYears?.map((p) => p.year)).toEqual([2018, 2026]);
    expect(result.caveats.join(" ")).toContain("Ani acoperiți parțial de date: 2018 (achizițiile directe de la 02.04.2018; contractele de la 03.01.2018, începutul arhivei), 2026 (date până la 25.09.2026).");
    // Watched results compare `data`; the markers must not change its shape.
    expect(result.data).toEqual({ block: "timeseries", series: [
      { year: 2018, value: 45376692338.45, count: 2067252 },
      { year: 2019, value: 77219759074.89, count: 2559759 },
      { year: 2025, value: 180471454904.73, count: 2390346 },
      { year: 2026, value: 77110350942.17, count: 1253945 },
    ] });
  });
  it("a year comparison with a partial endpoint says the difference includes the uncovered period", async () => {
    const db = database({ present: true, rows: coverageRows });
    const spec: AskSpec = { block: "trend", dataset: "all", measure: "value", dim: "authority", filters: { yearFrom: 2019, yearTo: 2026 } };
    const result = await runSpec(db.sql, spec, {});
    if ("error" in result) throw new Error(result.error);
    expect(result.partialYears).toEqual([{ year: 2026, note: "date până la 25.09.2026" }]);
    expect(result.caveats.join(" ")).toContain("Diferența dintre cei doi ani reflectă și perioada neacoperită");
  });
  it("an annual total discloses a partial selected year and stays silent for a complete one", async () => {
    const stat = (year: number): AskSpec => ({ block: "stat", dataset: "all", measure: "value", filters: { yearFrom: year, yearTo: year } });
    const partial = await runSpec(database({ present: true, rows: coverageRows }).sql, stat(2026), {});
    const complete = await runSpec(database({ present: true, rows: coverageRows }).sql, stat(2025), {});
    if ("error" in partial || "error" in complete) throw new Error("unexpected error");
    expect(partial.caveats.join(" ")).toContain("Perioada aleasă include un an acoperit parțial de date: 2026 (date până la 25.09.2026).");
    expect(partial.partialYears).toBeUndefined();
    expect(complete.caveats.join(" ")).not.toContain("parțial");
  });
  it("a series without a readable coverage inventory says its edge years may be partial", async () => {
    const db = database({ present: false });
    const result = await runSpec(db.sql, { block: "timeseries", dataset: "all", measure: "value", filters: {} }, {});
    if ("error" in result) throw new Error(result.error);
    expect(result.caveats).toContain(PERIOD_UNKNOWN_CAVEAT);
    expect(db.statements.some((q) => q.includes("from marts.data_coverage"))).toBe(false);
  });
});

// Regression (audit F10, 21 Oct 2026): production had DA to 20.10.2026 but contracts
// reliable only through 30.06.2026 (July 79%, September 57%, October 15% of the year
// before), while the yearly charts showed only "date până la 20.10.2026". Contract months
// after the nightly "complet până la" day are marked provisional.
describe("provisional contract months", () => {
  const prod: CoveragePeriods = {
    da: { from: "2018-04-02", to: "2026-10-20" },
    contracts: { from: "2018-01-03", to: "2026-10-20", completeUntil: "2026-06-30" },
  };
  it("adds the provisional contracts to the partial last year, for contracts only", () => {
    expect(partialYears(prod, "all", [2025, 2026])).toEqual([
      { year: 2026, note: "date până la 20.10.2026; contractele datate după 30.06.2026 sunt provizorii", provisional: true },
    ]);
    expect(partialYears(prod, "contracts", [2026])).toEqual([
      { year: 2026, note: "date până la 20.10.2026; contractele datate după 30.06.2026 sunt provizorii", provisional: true },
    ]);
    expect(partialYears(prod, "da", [2026])).toEqual([{ year: 2026, note: "date până la 20.10.2026" }]);
  });
  it("marks a calendar-complete year whose last contract months are still provisional", () => {
    const january: CoveragePeriods = {
      da: { from: "2018-04-02", to: "2027-01-20" },
      contracts: { from: "2018-01-03", to: "2027-01-20", completeUntil: "2026-09-30" },
    };
    expect(partialYears(january, "all", [2025, 2026])).toEqual([
      { year: 2026, note: "contractele datate după 30.09.2026 sunt provizorii", provisional: true },
    ]);
    expect(partialYears(january, "da", [2026])).toEqual([]);
    expect(partialYearsCaveat(partialYears(january, "all", [2025, 2026]), "series")).toBe(
      "An cu date parțiale sau provizorii: 2026 (contractele datate după 30.09.2026 sunt provizorii). Totalul lui nu este complet; nu îl compara direct cu ceilalți ani din grafic. SEAP publică multe contracte la câteva săptămâni sau luni după semnare: cifrele provizorii pot crește la actualizările următoare.",
    );
  });
  it("judges selected months against the complete-until day", () => {
    expect(partialYears(prod, "all", [2026], { yearFrom: 2026, yearTo: 2026, monthFrom: 1, monthTo: 6 })).toEqual([]);
    expect(partialYears(prod, "contracts", [2026], { yearFrom: 2026, yearTo: 2026, monthFrom: 7, monthTo: 7 })).toEqual([
      { year: 2026, note: "contractele datate după 30.06.2026 sunt provizorii", provisional: true },
    ]);
  });
  it("leaves the F19 marking unchanged without a complete-until day", () => {
    const unknown: CoveragePeriods = { da: prod.da, contracts: { from: "2018-01-03", to: "2026-10-20", completeUntil: null } };
    expect(partialYears(unknown, "all", [2026])).toEqual([{ year: 2026, note: "date până la 20.10.2026" }]);
  });
  it("a year comparison and an annual total name the provisional contracts", async () => {
    const rows = [
      { dataset: "da", date_from: "2018-04-02", date_to: "2026-10-20" },
      { dataset: "contracts", date_from: "2018-01-03", date_to: "2026-10-20", complete_until: "2026-06-30" },
    ];
    const trend = await runSpec(database({ present: true, rows }).sql, { block: "trend", dataset: "contracts", measure: "value", dim: "authority", filters: { yearFrom: 2025, yearTo: 2026 } }, {});
    if ("error" in trend) throw new Error(trend.error);
    expect(trend.partialYears).toEqual([{ year: 2026, note: "date până la 20.10.2026; contractele datate după 30.06.2026 sunt provizorii", provisional: true }]);
    expect(trend.caveats.join(" ")).toContain("reflectă și perioada neacoperită sau încă nepublicată");
    const stat = await runSpec(database({ present: true, rows }).sql, { block: "stat", dataset: "contracts", measure: "value", filters: { yearFrom: 2026, yearTo: 2026, monthFrom: 7, monthTo: 9 } }, {});
    if ("error" in stat) throw new Error(stat.error);
    expect(stat.caveats.join(" ")).toContain("Perioada aleasă include un an cu date parțiale sau provizorii: 2026 (contractele datate după 30.06.2026 sunt provizorii).");
  });
});
