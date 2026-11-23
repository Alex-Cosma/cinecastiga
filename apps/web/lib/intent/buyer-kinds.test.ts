import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { MINISTRIES_NOTE, RulesInterpreter, STATE_COMPANIES_NOTE } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Search probe, 23 November 2026: „ministerele”, „universitățile” had no kind (the answer covered every institution, or
 * became the country's total) and „companiile de stat” ranked firms. The ministries (with the units that buy under a
 * ministry's name) and the universities are lists by name (lib/ask/authority-kind.ts NAME_LIST_RULES); the state-owned
 * companies have no list yet, which is said.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  const r = resultFor(i);
  return { i, spec: r.spec!, sentence: r.sentence };
};

describe("the ministries and the universities as kinds", () => {
  it("ranks them when the noun says who is ranked", async () => {
    for (const [q, kind, sentence] of [
      ["ministerele cu cele mai mari achizitii in 2024", "minister", "Ce ministere din toată țara cumpără cel mai mult, prin toate achizițiile, în 2024?"],
      ["ministerul cu cele mai mari achizitii in 2024", "minister", "Ce ministere din toată țara cumpără cel mai mult, prin toate achizițiile, în 2024?"],
      ["ce ministere cumpara cel mai mult iluminat", "minister", "Ce ministere din toată țara cumpără cel mai mult pentru „iluminat”, prin toate achizițiile, în toți anii?"],
      ["ministere top cheltuieli 2025", "minister", "Ce ministere din toată țara cumpără cel mai mult, prin toate achizițiile, în 2025?"],
      ["top universitati la iluminat", "universitate", "Ce universități din toată țara cumpără cel mai mult pentru „iluminat”, prin toate achizițiile, în toți anii?"],
      ["universitatile care au cheltuit cel mai mult pe iluminat in 2025", "universitate", "Ce universități din toată țara cumpără cel mai mult pentru „iluminat”, prin toate achizițiile, în 2025?"],
    ] as const) {
      const { i, spec, sentence: said } = await read(q);
      expect([q, i.intent, i.authorityKind?.kind, i.leftover, said]).toEqual([q, "ranking_authorities", kind, [], sentence]);
      expect(spec).toMatchObject({ block: "table", dim: "authority", filters: { authorityKind: kind } });
    }
  });
  it("reads «care minister», a total, the firms that win there, and a county", async () => {
    const one = await read("care minister a dat cele mai multe contracte fara licitatie");
    expect([one.i.intent, one.i.authorityKind?.kind, one.spec.block, one.spec.dataset, one.sentence]).toEqual(["ranking_authorities", "minister", "entity_card", "da",
      "Care minister din toată țara cumpără cel mai mult, prin achiziții directe, în toți anii?"]);
    const total = await read("cat au cheltuit universitatile pe iluminat in 2025");
    expect([total.spec.block, total.spec.filters.authorityKind, total.sentence]).toEqual(["stat", "universitate", "Cât valorează achizițiile pentru „iluminat” făcute de universitățile din toată țara, în 2025?"]);
    const firms = await read("firmele care castiga la ministere");
    expect([firms.spec.dim, firms.spec.filters.authorityKind, firms.sentence]).toEqual(["supplier", "minister", "Ce firme câștigă achizițiile făcute de ministerele din toată țara, în toți anii?"]);
    const county = await read("universitatile din judetul Buzau");
    expect(county.spec.filters).toMatchObject({ authorityKind: "universitate", county: "Buzău" });
  });
  it("says once what the ministries' list holds, and nothing for the universities", async () => {
    expect((await read("ministerele cu cele mai mari achizitii in 2024")).i.notes).toEqual([MINISTRIES_NOTE]);
    expect((await read("top universitati la iluminat")).i.notes).toEqual([]);
  });
  it("keeps a named ministry or university a named institution, in the nominative or the genitive", async () => {
    for (const q of ["ce cumpara ministerul sanatatii", "achizitiile ministerului sanatatii din 2020 pana in 2023", "cat a cheltuit Ministerul Sanatatii pe iluminat"]) {
      const { i } = await read(q);
      expect([q, i.authority?.id, i.authorityKind, i.notes.includes(MINISTRIES_NOTE)]).toEqual([q, 6000001, null, false]);
    }
    for (const q of ["ce cumpara Universitatea din Craiova", "contractele universitatii din craiova in 2024"]) {
      const { i } = await read(q);
      expect([q, i.authority?.id, i.authorityKind]).toEqual([q, 6000002, null]);
    }
  });
});

describe("state-owned companies", () => {
  it("are buyers the data cannot tell apart yet: said, never a ranking of firms", async () => {
    for (const q of ["companiile de stat cu cele mai mari achizitii de iluminat", "regiile autonome cu cele mai mari achizitii de iluminat", "top companii nationale la iluminat",
      "ce companii de stat cheltuie cei mai multi bani pe iluminat"]) {
      const { i, spec } = await read(q);
      expect([q, i.intent, i.authorityKind, i.leftover, i.notes]).toEqual([q, "ranking_authorities", null, [], [STATE_COMPANIES_NOTE]]);
      expect(spec).toMatchObject({ block: "table", dim: "authority" });
    }
    const total = await read("cat au cheltuit companiile de stat pe iluminat in 2024");
    expect([total.spec.block, total.i.notes, total.i.leftover]).toEqual(["stat", [STATE_COMPANIES_NOTE], []]);
  });
  it("leaves «companiile» and «firmele» alone the firms", async () => {
    const { i, spec } = await read("companiile cu cele mai mari contracte pe iluminat");
    expect([i.intent, spec.dim, i.notes]).toEqual(["ranking_suppliers", "supplier", []]);
  });
});
