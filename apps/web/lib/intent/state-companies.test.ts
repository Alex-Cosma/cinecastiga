import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter, STATE_COMPANIES_NOTE } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Owner, 23 November 2026 (variant A): „companii de stat” are every public enterprise on the Ministry of Finance list
 * of 21.10.2026, central and local, as one kind of buyer (lib/ask/spec.ts STATE_COMPANY_KIND, migration 0115). The
 * search probe of the same day had them rank firms, then say they could not be told apart.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  const r = resultFor(i);
  return { i, spec: r.spec!, sentence: r.sentence };
};

describe("the public enterprises as a kind of buyer", () => {
  it("ranks them for every way of naming them, never the firms that win", async () => {
    for (const q of ["companiile de stat cu cele mai mari achizitii de iluminat", "regiile autonome cu cele mai mari achizitii de iluminat", "top companii nationale la iluminat",
      "ce companii de stat cheltuie cei mai multi bani pe iluminat", "top companii de stat 2024", "intreprinderile publice cu cele mai mari achizitii de iluminat",
      "companiile municipale care cumpara iluminat", "firmele de stat cu cele mai mari contracte de iluminat", "societatile nationale cu cele mai mari achizitii"]) {
      const { i, spec } = await read(q);
      expect([q, i.intent, i.authorityKind?.kind, i.leftover, i.notes]).toEqual([q, "ranking_authorities", "companie_stat", [], [STATE_COMPANIES_NOTE]]);
      expect(spec).toMatchObject({ block: "table", dim: "authority", filters: { authorityKind: "companie_stat" } });
    }
  });
  it("says them in the sentence, and where the list comes from in one note", async () => {
    const { sentence, i } = await read("companiile de stat cu cele mai mari achizitii de iluminat in 2024");
    expect(sentence).toBe("Ce companii de stat și locale din toată țara cumpără cel mai mult pentru „iluminat”, prin toate achizițiile, în 2024?");
    expect(i.notes).toEqual(["Companiile de stat și locale sunt întreprinderile publice din lista Ministerului Finanțelor din 21.10.2026."]);
  });
  it("answers a total and what they buy within the kind", async () => {
    const total = await read("cat au cheltuit regiile autonome pe iluminat in 2025");
    expect([total.spec.block, total.spec.filters.authorityKind, total.spec.filters.yearFrom, total.i.leftover]).toEqual(["stat", "companie_stat", 2025, []]);
    const firms = await read("ce firme castiga la companiile de stat");
    expect([firms.i.intent, firms.spec.dim, firms.spec.filters.authorityKind]).toEqual(["ranking_suppliers", "supplier", "companie_stat"]);
  });
  it("uses the county for a locality: a town's records are its town hall's alone", async () => {
    const { spec, i } = await read("ce companii de stat din Ramnicu Sarat cumpara cel mai mult");
    expect([i.intent, spec.block, spec.dim]).toEqual(["ranking_authorities", "table", "authority"]);
    expect(spec.filters).toMatchObject({ authorityKind: "companie_stat", county: "Buzău" });
    expect(spec.filters.uatSiruta).toBeUndefined();
  });
  it("leaves «companiile» and «firmele» alone the firms, and a named company the company", async () => {
    const firms = await read("companiile cu cele mai mari contracte pe iluminat");
    expect([firms.i.intent, firms.spec.dim, firms.i.authorityKind, firms.i.notes]).toEqual(["ranking_suppliers", "supplier", null, []]);
  });
});
