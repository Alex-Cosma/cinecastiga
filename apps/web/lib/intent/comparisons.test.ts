import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Search probe, 23 November 2026: a comparison kept one side and dropped the other („primăria Cluj vs primăria Iași”
 * read as Cluj's total, „2024 față de 2023” as 2024). Two institutions or firms are compared whatever the connector;
 * two years are each its own figure; two counties are read on the counties' map; what cannot be compared is said.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const ask = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, r: resultFor(i) };
};
const COMPARE_HOW = "Pentru o comparație, numește două instituții sau două firme, de exemplu „compară Spitalul Județean de Urgență Buzău cu Spitalul Județean de Urgență Brăila”.";

describe("two institutions or firms, whatever the connector", () => {
  it("compares the names on each side of «vs», «față de», «comparativ cu», with the year and the subject said", async () => {
    const halls = await ask("primaria buzau vs primaria braila cheltuieli 2024");
    expect(halls.i.intent).toBe("compare");
    expect(halls.r.spec).toMatchObject({ block: "compare", filters: { authorityId: 2144364, compareWithId: 3000001, yearFrom: 2024, yearTo: 2024 } });
    expect(halls.i.leftover).toEqual([]);
    const hospitals = await ask("spitalul judetean de urgenta buzau vs spitalul judetean de urgenta braila la medicamente");
    expect(hospitals.r.spec).toMatchObject({ block: "compare", filters: { authorityId: 2144002, compareWithId: 3000002, cpvTerm: "medicamente" } });
    for (const q of ["medicamente spitalul judetean buzau fata de spitalul judetean braila", "spitalul judetean de urgenta buzau comparativ cu spitalul judetean de urgenta braila",
      "achizitii spitalul judetean de urgenta buzau versus spitalul judetean de urgenta braila"]) {
      const { i, r } = await ask(q);
      expect([q, i.intent, r.spec?.filters.authorityId, r.spec?.filters.compareWithId]).toEqual([q, "compare", 2144002, 3000002]);
      expect(i.notes).not.toContain(COMPARE_HOW);
    }
    const firms = await ask("constructii erbasu vs elbi energy projects in 2024");
    expect(firms.r.spec).toMatchObject({ block: "compare", filters: { supplierId: 9000001, compareWithId: 9000003, yearFrom: 2024, yearTo: 2024 } });
  });
  it("offers the pairs when one side's name has several institutions, never one side alone", async () => {
    const { i, r } = await ask("compara compania de utilitati publice cu spitalul judetean de urgenta buzau");
    expect(i.intent).toBe("compare");
    expect(i.compareAmbiguous).toBe(true);
    expect(i.compareChoices.map((p) => [p.focal.id, p.other.id])).toEqual([[2128336, 2144002], [2108930, 2144002]]);
    expect(r.spec).toBeNull();
    expect(r.problem).toBe("Mai multe instituții au acest nume. Alege perechea pe care o compari.");
    expect(r.alternatives.map((a) => a.spec.filters)).toEqual([expect.objectContaining({ authorityId: 2128336, compareWithId: 2144002 }), expect.objectContaining({ authorityId: 2108930, compareWithId: 2144002 })]);
  });
  it("names the second institution it cannot find", async () => {
    const { i } = await ask("compara spitalul judetean de urgenta buzau cu spitalul orasenesc inexistent");
    expect(i.authority?.id).toBe(2144002);
    expect(i.compareWith).toBeNull();
    expect(i.notes).toContain("Nu am găsit a doua instituție, „spitalul orasenesc inexistent”. Scrie numele complet, de exemplu cu localitatea.");
  });
  it("keeps «compară X cu Y» as it was", async () => {
    expect((await ask("compara spitalul judetean de urgenta buzau cu spitalul judetean de urgenta braila")).r.spec).toMatchObject({ block: "compare", filters: { authorityId: 2144002, compareWithId: 3000002 } });
    expect((await ask("compară primăria Buzău cu primăria Brăila")).r.spec).toMatchObject({ block: "compare", filters: { authorityId: 2144364, compareWithId: 3000001 } });
    const places = await ask("compara Buzau cu Braila");
    expect([places.i.intent, places.i.compareAmbiguous, places.r.alternatives.map((a) => a.spec.block)]).toEqual(["compare", undefined, ["compare"]]);
  });
});

describe("one selection, year against year", () => {
  it("reads «2024 față de 2023», «comparativ cu», «vs» as the two years, each its own figure", async () => {
    for (const [q, from, to] of [["cat a cheltuit primaria din Ramnicu Sarat in 2024 comparativ cu 2023", 2023, 2024], ["iluminat 2024 fata de 2023", 2023, 2024],
      ["catering scoli 2023 fata de 2024", 2023, 2024], ["achizitii directe primaria din Ramnicu Sarat 2023 vs 2024", 2023, 2024], ["ce cumpara consiliile judetene in 2025 in comparatie cu 2024", 2024, 2025]] as const) {
      const { i, r } = await ask(q);
      expect([q, i.intent, r.spec?.block, r.spec?.filters.yearFrom, r.spec?.filters.yearTo]).toEqual([q, "trend", "timeseries", from, to]);
      expect(i.notes.join(" ")).not.toMatch(/prima perioadă|Pentru o comparație/);
    }
    expect((await ask("achizitii directe primaria din Ramnicu Sarat 2023 vs 2024")).r.spec).toMatchObject({ dataset: "da" });
  });
  it("keeps a ranking asked in words on the first year, with its note", async () => {
    const { r } = await ask("Ce firme au câștigat în județul Cluj în 2025 față de 2024?");
    expect(r.spec).toMatchObject({ block: "table", filters: { yearFrom: 2025, yearTo: 2025 } });
    expect(r.interpretation.notes).toContain("Am folosit prima perioadă din întrebare; „2024” nu a fost aplicată.");
  });
});

describe("two counties", () => {
  it("are read on the counties' map, both named, with the subject and the year", async () => {
    for (const q of ["curatenie cluj vs timis", "compara judetul Dolj cu judetul Olt la curatenie in 2024", "iluminat cluj fata de timis"]) {
      const { i, r } = await ask(q);
      expect([q, i.intent, r.spec?.block, i.place, i.leftover]).toEqual([q, "counties", "map", null, []]);
      expect(r.spec?.filters.county).toBeUndefined();
      expect(i.notes.join(" ")).toMatch(/^Județul \S+ și Județul \S+: harta arată toate județele; cele două se citesc pe ea\./);
      expect(i.notes).not.toContain(COMPARE_HOW);
    }
    expect((await ask("compara judetul Dolj cu judetul Olt la curatenie in 2024")).r.spec).toMatchObject({ filters: { cpvTerm: "curatenie", yearFrom: 2024, yearTo: 2024 } });
  });
});

describe("what cannot be compared yet", () => {
  it("keeps the reading without a side applied as the question, and says how a comparison is written", async () => {
    for (const q of ["regiunea nord-est comparat cu regiunea vest la drumuri", "cat platesc spitalele pe curatenie fata de noi"]) {
      const { i } = await ask(q);
      expect([q, i.intent === "compare", i.compareWith, i.compareChoices]).toEqual([q, false, null, []]);
      expect(i.notes).toContain(COMPARE_HOW);
    }
  });
});
