import { describe, expect, it } from "vitest";
import type { BreakdownGroup, PartialYear } from "../../lib/ask/compile";
import type { AskSpec } from "../../lib/ask/spec";
import { answerCsv } from "./answer-csv";
import { breakdownSuggestion, channelShares, sameMonthsSwitch, seriesAfterStrip, seriesSplitOptions, STRIP_QUERY_KEYS, SUGGEST_SHARE } from "./answer-state";
import { breakdownKinds, breakdownShown, generalTag, largestTag } from "./breakdown-answer";
import { mixLabel, mixOnly, mixTabs } from "./answer/StatMix";
import { aboveTotal, barFacts, barKey, barLinks, barName, barParts, barSources, monthTick, partSources, partTone, seriesBars, type SeriesData } from "./series-answer";

// F3-rows on the answer (plan §4.1, §4.3, §4.5; finals stat, timeseries, breakdown): the pure parts the screen draws and the CSV exports.

const ts: AskSpec = { block: "timeseries", measure: "value", filters: {} };
const point = (year: number, value: number, count: number, extra: Partial<SeriesData["series"][number]> = {}) => ({ year, value, count, ...extra });

describe("the evolution's bars (final timeseries §3.7–§3.10)", () => {
  it("draws every month of the period, an empty one as a bar of 0, and names it", () => {
    const data: SeriesData = { block: "timeseries", grain: "month", series: [point(2024, 5, 1, { month: 11 }), point(2025, 7, 2, { month: 2 })] };
    const { bars, before } = seriesBars(data);
    expect(bars.map((b) => [barKey(b), "empty" in b])).toEqual([["2024-11", false], ["2024-12", true], ["2025-01", true], ["2025-02", false]]);
    expect(before).toBeNull();
    expect([barName({ year: 2025, month: 3 }), monthTick({ year: 2025, month: 1 }), monthTick({ year: 2025, month: 7 }), barName({ year: 2025 })])
      .toEqual(["martie 2025", "ian. 25", "iul.", "2025"]);
  });

  it("gives a split's parts bottom up, their colours and their sources", () => {
    const data: SeriesData = { block: "timeseries", series: [point(2025, 10, 3, { parts: { "45": { value: 6, count: 1 }, other: { value: 4, count: 2 } } })],
      parts: [{ key: "45", code: "45", label: "Construcții" }, { key: "33", code: "33", label: "Medicale" }, { key: "other", label: "Alte domenii" }] };
    expect(barParts(data, data.series[0]!).map((p) => [p.part.key, p.value, p.count])).toEqual([["45", 6, 1], ["33", 0, 0], ["other", 4, 2]]);
    expect(data.parts!.map((p) => partTone(data, p))).toEqual(["c1", "c2", "other"]);
    expect(partSources(data, data.parts![0]!)).toEqual({ scope: { cpvPrefixes: ["45"] } });
    expect(partSources(data, data.parts![2]!)).toEqual({ scope: { excludeCpvPrefixes: ["45", "33"] } });
    const channels: SeriesData = { block: "timeseries", series: [], parts: [{ key: "contracts", label: "Proceduri" }, { key: "da", label: "Directe" }] };
    expect(channels.parts!.map((p) => [partTone(channels, p), partSources(channels, p)])).toEqual([["proc", { filters: { stream: "contracts" } }], ["da", { filters: { stream: "da" } }]]);
  });

  it("opens a bar's records on its year, or on its month as the question's period", () => {
    expect(barSources(ts, { year: 2025 })).toEqual({ spec: ts, scope: { years: [2025] } });
    expect(barSources(ts, { year: 2025, month: 3 }).spec.filters).toEqual({ yearFrom: 2025, yearTo: 2025, monthFrom: 3, monthTo: 3 });
  });

  it("links a bar to who won, what was bought and the change, only where the trend answers it (final §3.10)", () => {
    const data: SeriesData = { block: "timeseries", series: [point(2023, 1, 1), point(2024, 1, 1), point(2025, 1, 1), point(2026, 1, 1)] };
    const partial: PartialYear[] = [{ year: 2026, note: "date până la 25.09.2026" }];
    const labels = (p: { year: number; month?: number }, spec = ts, d = data) => barLinks(spec, d, p, partial).map((l) => l.label);
    expect(labels({ year: 2025 })).toEqual(["Cine a câștigat în 2025?", "Ce s-a cumpărat în 2025?", "Cine a crescut sau a scăzut față de 2024?"]);
    const trend = barLinks(ts, data, { year: 2025 }, partial)[2]!.spec;
    expect([trend.block, trend.dim, trend.filters.yearFrom, trend.filters.yearTo, trend.trend]).toEqual(["trend", "supplier", 2024, 2025, { change: "up" }]);
    // 2019 against 2018 (incomplete), a month, the incomplete last year without the same months: no change.
    expect(labels({ year: 2019 })).toHaveLength(2);
    expect(labels({ year: 2025, month: 3 })).toEqual(["Cine a câștigat în martie 2025?", "Ce s-a cumpărat în martie 2025?"]);
    expect(labels({ year: 2026 })).toHaveLength(2);
    // With the marker of the incomplete year, on the same months (the trend's `auto`).
    const marked: SeriesData = { ...data, ref: { year: 2025, months: [1, 8], value: 1, count: 1, current: { value: 1, count: 1 } } };
    expect(labels({ year: 2026 }, ts, marked)[2]).toBe("Cine a crescut sau a scăzut față de 2025 (ian.–aug.)?");
    expect(barLinks(ts, marked, { year: 2026 }, partial)[2]!.spec.trend).toEqual({ change: "up", months: "auto" });
    // An institution and a firm both named: one row, no ranking; the count says the trend is by value.
    expect(labels({ year: 2025 }, { ...ts, filters: { authorityId: 1, authorityName: "X", supplierId: 2, supplierName: "Y" } })).toEqual([]);
    expect(labels({ year: 2025 }, { ...ts, measure: "count" })[2]).toBe("Cine a crescut sau a scăzut față de 2024 (după valoare)?");
    expect(barLinks({ ...ts, filters: { supplierId: 2, supplierName: "Y" } }, data, { year: 2025 }, partial)[0]!.spec.dim).toBe("authority");
  });

  it("says a bar's facts: its parts, the change between two complete years, the same months on the incomplete one", () => {
    const data: SeriesData = { block: "timeseries", series: [point(2024, 100, 10), point(2025, 110, 11), point(2026, 60, 6)],
      ref: { year: 2025, months: [1, 8], value: 80, count: 8, current: { value: 60, count: 6 } } };
    const partial: PartialYear[] = [{ year: 2026, note: "date până la 25.09.2026" }];
    expect(barFacts(data, data.series[1]!, partial).lines).toEqual(["Față de 2024: +10%"]);
    expect(barFacts(data, data.series[2]!, partial).lines).toEqual(["ian.–aug. 2026: 60 lei · ian.–aug. 2025: 80 lei · aceleași luni −25%"]);
    expect(barFacts(data, data.series[0]!, partial).facts).toEqual([{ label: "Valoare", value: "100 lei" }, { label: "Înregistrări", value: "10" }]);
  });

  it("counts the contracts above the cap of the bars drawn, and the first bar that has them", () => {
    const above = { "2024": { n: 2, rows: [] }, "2025": { n: 0, rows: [] }, "2026": { n: 1, rows: [] } };
    expect(aboveTotal({ above }, [{ year: 2025 }, { year: 2026 }])).toEqual({ n: 1, first: "2026" });
    expect(aboveTotal({ above }, [{ year: 2024 }, { year: 2026 }])).toEqual({ n: 3, first: "2024" });
    expect(aboveTotal(null, [{ year: 2024 }])).toEqual({ n: 0, first: null });
  });
});

describe("the evolution's strip (final timeseries §3.8–§3.9)", () => {
  it("asks again on a split or the same months, one option at a time", () => {
    expect(STRIP_QUERY_KEYS.has("timeseries")).toBe(true);
    const split = seriesAfterStrip(ts, "split:domain");
    expect(split.timeseries).toEqual({ split: "domain" });
    expect(seriesAfterStrip(seriesAfterStrip(split, "months:auto"), "split:").timeseries).toEqual({ months: "auto" });
    expect(seriesAfterStrip(seriesAfterStrip(split, "split:"), "months:")).not.toHaveProperty("timeseries");
  });

  it("offers the parts the selection can show, the others disabled with the reason", () => {
    expect(seriesSplitOptions(ts).map((o) => [o.value, Boolean(o.disabled)])).toEqual([["split:", false], ["split:channel", false], ["split:domain", false]]);
    expect(seriesSplitOptions({ ...ts, dataset: "da" })[1]!.disabled).toBe("„Directe / proceduri” împarte toate achizițiile.");
    expect(seriesSplitOptions({ ...ts, filters: { cpvTerm: "45" } })[2]!.disabled).toBe("Un singur domeniu nu se împarte pe domenii.");
  });

  it("switches the same months on from the marker, off with the months the answer ran on; never month by month", () => {
    const series = [{ year: 2025 }, { year: 2026 }];
    expect(sameMonthsSwitch({ series, ref: { year: 2025, months: [1, 8] } }, ts)).toEqual({ label: "ian.–aug.", on: false, year: 2026 });
    expect(sameMonthsSwitch({ series, months: { from: 1, to: 8 } }, { timeseries: { months: "auto" } })).toEqual({ label: "ian.–aug.", on: true, year: 2026 });
    expect(sameMonthsSwitch({ series }, ts)).toBeNull();
    expect(sameMonthsSwitch({ series, grain: "month", ref: { year: 2025, months: [1, 8] } }, ts)).toBeNull();
  });
});

describe("the breakdown (final breakdown §3.5–§3.10)", () => {
  const group = (code: string, value: number, count: number, extra: Partial<BreakdownGroup> = {}): BreakdownGroup => ({ code, name: `Diviziunea ${code}`, value, count, ...extra });
  const base = [group("45", 500, 10), group("33", 300, 200), group("09", 50, 30), group("34", 40, 20), group("79", 30, 300), group("90", 20, 5),
    group("72", 20, 5), group("50", 15, 50), group("71", 10, 40), group("80", 10, 4), group("15", 5, 100)];

  it("shows eight groups, more while the rest is over a fifth, the rest as one row, by value or by records", () => {
    const shown = breakdownShown(base.slice(0, 8), { value: 0, count: 0 }, base, false, false);
    expect(shown.groups.map((g) => g.code)).toEqual(["45", "33", "09", "34", "79", "72", "90", "50"]);
    expect([shown.rest, shown.restGroups, shown.total]).toEqual([{ value: 25, count: 144 }, 3, { value: 1000, count: 764 }]);
    // By records: the order changes and the rest over a fifth keeps more rows (up to 15).
    expect(breakdownShown([], { value: 0, count: 0 }, base, true, false).groups.map((g) => g.code).slice(0, 3)).toEqual(["79", "33", "15"]);
    expect(breakdownShown([], { value: 0, count: 0 }, base, false, true).groups).toHaveLength(base.length);
    // An answer stored before F3 (no base): its slices and „alte domenii”.
    expect(breakdownShown([group("45", 5, 1)], { value: 5, count: 1 }, undefined, false, false)).toEqual({ groups: [group("45", 5, 1)], rest: { value: 5, count: 1 }, restGroups: 0, more: 0, total: { value: 10, count: 2 } });
  });

  it("gives each kind's share of the level, from its groups' divisions", () => {
    const kinds = breakdownKinds(base, false);
    expect(kinds.map((k) => k.kind)).toEqual(["lucrari", "produse", "servicii"]);
    expect(kinds.reduce((t, k) => t + k.share, 0)).toBeCloseTo(1, 9);
    expect(kinds[0]!.share).toBeCloseTo(0.5, 9);
  });

  it("tags a group made by one record: at least a tenth of the level, its largest record at least half of it", () => {
    expect(largestTag(group("45", 500, 10, { max: 300, maxSrc: "contracts" }), 1000)?.text).toBe("1 contract: 60,0%");
    expect(largestTag(group("45", 500, 10, { max: 200, maxSrc: "contracts" }), 1000)).toBeNull();
    expect(largestTag(group("09", 50, 10, { max: 50, maxSrc: "da" }), 1000)).toBeNull();
  });

  it("tags the group coded as its parent itself „cod general”, never at the divisions (S4 review, final §3.5)", () => {
    expect(generalTag("4500", "45")).toMatchObject({ text: "cod general", tip: { title: "Cod general" } });
    expect(generalTag("4500", "45")?.tone).toBeUndefined();
    expect(generalTag("452300", "4523")?.text).toBe("cod general");
    expect([generalTag("4523", "45"), generalTag("45", null), generalTag("3300", "medicamente")]).toEqual([null, null, null]);
  });

  it("gives the channels their share of the selection, and goes down a level from 90% of one group", () => {
    const shares = channelShares({ streams: { da: { value: 25, count: 90 }, contracts: { value: 75, count: 10 } } }, false)!;
    expect(shares.unit).toBe("% din valoare");
    expect(shares.options([{ value: "all", label: "Toate" }, { value: "da", label: "Directe" }, { value: "contracts", label: "Proceduri" }]).map((o) => o.count ?? null))
      .toEqual([null, "25,0%", "75,0%"]);
    expect(channelShares({ streams: { da: { value: 0, count: 0 }, contracts: { value: 5, count: 1 } } }, true)!.options([{ value: "da", label: "Directe" }])[0]).toMatchObject({ count: "—" });
    expect(channelShares({}, false)).toBeNull();
    const breakdown: AskSpec = { block: "breakdown", measure: "value", filters: { yearFrom: 2025, yearTo: 2025 } };
    expect(breakdownSuggestion({ slices: [{ code: "45", name: "Lucrări de construcții", value: 95 }], other: { value: 5 } }, breakdown, null)?.text).toBe("95,0% e Construcții");
    expect(SUGGEST_SHARE).toBe(0.9);
    expect(breakdownSuggestion({ slices: [{ code: "45", name: null, value: 85 }], other: { value: 15 } }, breakdown, null)).toBeNull();
    expect(breakdownSuggestion({ slices: [{ code: "45233140", name: null, value: 99 }], other: { value: 1 } }, breakdown, null)).toBeNull();
  });
});

describe("„Din care” under a total (final stat §3.7)", () => {
  const stat: AskSpec = { block: "stat", measure: "value", filters: {} };
  const row = (value: string) => ({ value, n: 1, value_ron: 1, share: 0.5 });
  const mix = { kind: [row("lucrari"), row("produse")], procedure: [row("da"), row("deschisa")], size: [row("0"), row("1")], offers: { known: 0.5, rows: [row("one"), row("unknown")] } };

  it("draws the tabs the question can still choose, and the offers from a fifth of the contracts' value known", () => {
    expect(mixTabs(stat, mix)).toEqual(["kind", "procedure", "size", "offers"]);
    expect(mixTabs({ ...stat, filters: { purchaseKind: "lucrari" } }, mix)).toEqual(["procedure", "size", "offers"]);
    expect(mixTabs({ ...stat, dataset: "da" }, mix)).toEqual(["kind", "size"]);
    expect(mixTabs(stat, { ...mix, offers: { known: 0.1, rows: [] } })).toEqual(["kind", "procedure", "size"]);
    expect(mixTabs(stat, { ...mix, kind: [row("lucrari"), row("none")] })).toEqual(["procedure", "size", "offers"]);
  });

  it("asks the total again with a row's condition („Doar acestea ›”), never for records without a code or the offers", () => {
    expect(mixOnly(stat, "kind", "lucrari")).toEqual({ spec: { ...stat, filters: { purchaseKind: "lucrari" } }, words: "Doar lucrări" });
    expect(mixOnly(stat, "procedure", "da")?.spec.dataset).toBe("da");
    expect(mixOnly(stat, "procedure", "deschisa")?.spec).toMatchObject({ dataset: "contracts", filters: { procedure: "deschisa" } });
    expect(mixOnly(stat, "size", "1")?.spec.filters).toHaveProperty("purchaseValueMin");
    expect(mixOnly(stat, "kind", "none")).toBeNull();
    expect(mixOnly(stat, "offers", "one")).toBeNull();
    expect([mixLabel("kind", "none"), mixLabel("procedure", "da"), mixLabel("offers", "unknown")]).toEqual(["Fără cod CPV", "Achiziții directe", "Nu știm"]);
  });
});

describe("the shown result as CSV (plan §2.3)", () => {
  it("has a month's column month by month and a value column per part of a split", () => {
    const monthly = answerCsv({ block: "timeseries", grain: "month", series: [point(2025, 10.5, 2, { month: 3 })] }, ts, "Evoluție").text.split("\r\n");
    expect(monthly.slice(0, 2)).toEqual(["﻿an,luna,valoare_lei,achizitii", "2025,3,10.5,2"]);
    const split = answerCsv({ block: "timeseries", series: [point(2025, 10, 3, { parts: { da: { value: 4, count: 2 }, contracts: { value: 6, count: 1 } } })],
      parts: [{ key: "contracts", label: "Proceduri" }, { key: "da", label: "Directe" }] }, ts, "Evoluție").text.split("\r\n");
    expect(split.slice(0, 2)).toEqual(['﻿an,valoare_lei,achizitii,"valoare_Proceduri","valoare_Directe"', "2025,10,3,6,4"]);
  });

  it("exports every group of a breakdown's level in the legend's order", () => {
    const base = [{ code: "33", name: "B", value: 3, count: 30 }, { code: "45", name: "A", value: 7, count: 1 }];
    const rows = (measure: "value" | "count") => answerCsv({ block: "breakdown", slices: base, other: { value: 0, count: 0 }, base }, { block: "breakdown", measure, filters: {} }, "Domenii").text.split("\r\n");
    expect(rows("value").slice(1, 3)).toEqual(['"A",45,7,1', '"B",33,3,30']);
    expect(rows("count").slice(1, 3)).toEqual(['"B",33,3,30', '"A",45,7,1']);
  });
});
