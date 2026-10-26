import { describe, expect, it } from "vitest";
import type { PairResult } from "../../../lib/ask/compare-shared";
import type { QuestionSpec } from "../../../lib/ask/question-ui";
import {
  comparePeriodPresets, comparePeriodTip, generalCodesNote, pairCountyOptions, pairDomainGroup, pairDomainOptions, pairNames, pairRest, peerResults, withPairShares,
} from "./compare-windows";
import type { ChoiceOption } from "./window-model";

/*
 * F4, a comparison's windows (final compare §3.1, §3.2, §3.5, §3.6; kit §6
 * compare): their rows from the pair's facts, and nothing of them before the
 * facts of the pair the draft names arrive.
 */

const firms: QuestionSpec = { block: "compare", measure: "value", filters: { supplierName: "KARSAN OTOMOTIV", supplierId: 2270150, compareWith: "SOLARIS BUS", compareWithId: 2270401 } };
const towns: QuestionSpec = { block: "compare", measure: "value", filters: { authorityName: "Municipiul Cluj-Napoca", authorityId: 2146445, compareWith: "Municipiul Timisoara", compareWithId: 2146647 } };
const span = { from: "2018-04-02", to: "2026-09-25", first: "2018-04-02" };
const side = (value: number) => ({ value, n: value ? 1 : 0 });
const pair = (patch: Partial<PairResult> = {}): PairResult => ({
  part: "pair", role: "supplier", domains: [], general: { a: 0, b: 0, totalA: 1, totalB: 1 }, kinds: null, counties: null, checkpoint: null, tookMs: 0,
  years: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({ year, a: side(year >= 2021 ? 300 : 0), b: side(200) })),
  ...patch,
});

describe("„În ce perioadă?” of a comparison (final §3.1, kit §6 compare 9)", () => {
  it("offers every year with the records before 2018, the common period where it changes the figures, the last three and the last complete year", () => {
    const { presets, value } = comparePeriodPresets(firms, span, 2026, null, pair({ years: [{ year: 2016, a: side(0), b: { value: 5, n: 3 } }, ...pair().years] }));
    expect(presets.map((p) => [p.label, p.detail ?? null])).toEqual([
      ["Toți anii", "apr. 2018 – 25 sept. 2026 · +3 mai vechi"],
      ["Perioada comună", "2021–2025 · KARSAN OTOMOTIV apare din 2021"],
      ["Ultimii 3 ani compleți", "2023–2025"],
      ["2025", null],
    ]);
    expect(presets[1]!.period).toEqual({ yearFrom: 2021, yearTo: 2025 });
    expect(value).toBe("all");
  });
  it("has no common period before the pair's facts arrive, nor when both have the same years", () => {
    expect(comparePeriodPresets(firms, span, 2026, null, null).presets.map((p) => p.label)).toEqual(["Toți anii", "Ultimii 3 ani compleți", "2025"]);
    const same = pair({ years: [2018, 2025].map((year) => ({ year, a: side(1), b: side(1) })) });
    expect(comparePeriodPresets(firms, span, 2026, null, same).presets.map((p) => p.label)).not.toContain("Perioada comună");
  });
  it("says in its (?) what the common period is, and the records before 2018 once the pair's facts arrive", () => {
    expect(comparePeriodTip(towns, null).text).toBe("De la primul la ultimul an în care apar amândouă în arhivă, în selecția aleasă. Nu e vechimea firmei sau a instituției.");
    const older = pair({ years: [{ year: 2014, a: side(0), b: { value: 44_000_000, n: 17 } }, ...pair().years] });
    expect(comparePeriodTip(towns, older).text).toMatch(/Unele înregistrări au date dinainte de 2018 \(Timisoara: 17, 44 mil\. lei\)\./);
  });
  it("checks the preset the draft holds", () => {
    expect(comparePeriodPresets({ ...firms, filters: { ...firms.filters, yearFrom: 2021, yearTo: 2025 } }, span, 2026, null, pair()).value).toBe("common");
  });
});

describe("„Ce s-a cumpărat?” of a comparison (final §3.2, kit §6 compare 7)", () => {
  const domains = [{ code: "45234", name: "Lucrări de construcţii de căi ferate", a: 473_918_781, b: 455_902_110 }];
  it("lists the groups both have, each with its code and both values, under what both buy or sell", () => {
    const [row] = pairDomainOptions(pair({ domains }));
    expect(row).toMatchObject({ label: "Lucrări de construcții de căi ferate", detail: "CPV 45234", choice: { filter: "cpvTerm", value: "45234" },
      pair: { a: 1, aText: "473,9 mil.", bText: "455,9 mil." } });
    expect(pairDomainGroup(towns)).toBe("Cumpără amândouă");
    expect(pairDomainGroup(firms)).toBe("Vând amândouă");
    expect(pairDomainOptions(null)).toEqual([]);
  });
  it("notes the general codes when either has at least 10% of its value there", () => {
    expect(generalCodesNote(pair({ general: { a: 11.9, b: 22.1, totalA: 100, totalB: 100 } }))).toBe("Pe coduri generale: 11,9% · 22,1% din valoare");
    expect(generalCodesNote(pair({ general: { a: 5, b: 9, totalA: 100, totalB: 100 } }))).toBeNull();
  });
});

describe("„Cine a cumpărat?” between two firms (final §3.5, kit §6 compare 1)", () => {
  const kinds = { options: [{ value: "oras_municipiu", a: 25.5, b: 15.9 }, { value: "spital", a: 0, b: 0 }], rest: { a: 58.2, b: 75.7 }, total: { a: 100, b: 100 } };
  const options: ChoiceOption[] = [
    { value: "all", label: "Toate instituțiile publice", choice: { filter: "authorityKind", value: undefined } },
    { value: "oras", label: "Primării de oraș și municipiu", choice: { filter: "authorityKind", value: "oras_municipiu" } },
    { value: "spital", label: "Spitale", choice: { filter: "authorityKind", value: "spital" } },
  ];
  it("gives each kind both firms' shares, disables one neither has, and says the rest", () => {
    const shared = withPairShares(options, kinds, (o) => o.choice.value === undefined ? null : String(o.choice.value));
    expect(shared[0]).toEqual(options[0]);
    expect(shared[1]).toMatchObject({ pair: { aText: "25,5%", bText: "15,9%" } });
    expect(shared[2]).toMatchObject({ disabled: "Niciuna nu are clienți de acest tip." });
    expect(pairRest("Alte instituții", kinds)).toEqual([{ label: "Alte instituții", count: "58,2% / 75,7%" }]);
    expect(pairRest("Alte instituții", null)).toEqual([{ label: "Alte instituții" }]);
  });
  it("lists the counties by both firms' value, then the others disabled", () => {
    const counties = pairCountyOptions({ options: [{ value: "București", a: 50, b: 10 }, { value: "Cluj", a: 5, b: 1 }], rest: { a: 8.7, b: 1.1 }, total: { a: 100, b: 100 } });
    expect(counties.slice(0, 2).map((o) => [o.label, o.pair?.aText])).toEqual([["București", "50,0%"], ["Județul Cluj", "5,0%"]]);
    expect(counties[2]!.disabled).toBe("Niciuna nu are clienți aici.");
    expect(counties).toHaveLength(42);
  });
});

describe("„Cu cine comparăm?” (final §3.6)", () => {
  it("suggests the chosen role's peers with their basis, never the first entity", () => {
    const results = peerResults({ part: "compare-peers", label: "Primării cu populație apropiată", tip: null, checkpoint: null, tookMs: 0, peers: [
      { id: 2146114, name: "Municipiul Iasi", county: "Iasi", detail: "271.692 de locuitori" }, { id: 2146445, name: "Municipiul Cluj-Napoca", county: "Cluj", detail: "x" },
    ] }, { id: 2146445 });
    expect(results).toEqual([{ id: "peer:2146114", name: "Municipiul Iasi", detail: "Iasi · 271.692 de locuitori", group: "Primării cu populație apropiată",
      choices: [{ filter: "compareWith", value: { name: "Municipiul Iasi", id: 2146114 } }] }]);
    expect(peerResults(null, {})).toEqual([]);
  });
  it("names the pair short in the presets' words", () => {
    expect(pairNames(towns)).toEqual({ a: "Cluj-Napoca", b: "Timisoara" });
  });
});
