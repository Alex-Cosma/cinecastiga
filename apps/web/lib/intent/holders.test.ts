import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Owner, 23 November 2026: „primăria cu cele mai mari contracte pe iluminat în 2026” read as a town hall whose name was
 * missing and answered with a ranking of firms. The noun before the superlative is who the ranking lists; „primăriile”
 * are a kind (every town hall), not every institution with a note.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  return { i, spec: resultFor(i).spec! };
};

describe("who a superlative ranks", () => {
  it("ranks the town halls for «primăria / primăriile cu cele mai mari contracte»", async () => {
    for (const q of ["primaria cu cele mai mari contracte pe iluminat în 2026", "primariile cu cele mai mari contracte pe iluminat in 2026",
      "primariile care au cele mai mari contracte pe iluminat in 2026", "top primarii iluminat 2026"]) {
      const { i, spec } = await read(q);
      expect([q, i.intent, i.authorityKind?.kind, i.notes, i.leftover]).toEqual([q, "ranking_authorities", "primarie", [], []]);
      expect(spec).toMatchObject({ block: "table", dim: "authority", filters: { authorityKind: "primarie", yearFrom: 2026, yearTo: 2026 } });
    }
  });
  it("ranks the institutions of the kind the noun names, singular or plural", async () => {
    for (const [q, kind] of [["spitalul cu cele mai mari contracte pe medicamente in 2025", "spital"], ["spitalele cu cele mai mari contracte pe medicamente", "spital"],
      ["scoala cu cele mai multe achizitii directe in 2025", "scoala"], ["comuna cu cele mai mari cheltuieli pe iluminat", "comuna"],
      ["orasul cu cele mai mari contracte pe iluminat", "oras_municipiu"], ["top spitale medicamente", "spital"]] as const) {
      const { i, spec } = await read(q);
      expect([q, i.intent, i.authorityKind?.kind, i.leftover]).toEqual([q, "ranking_authorities", kind, []]);
      expect(spec).toMatchObject({ block: "table", dim: "authority", filters: { authorityKind: kind } });
    }
    expect((await read("scoala cu cele mai multe achizitii directe in 2025")).spec).toMatchObject({ measure: "count", dataset: "da" });
  });
  it("reads the other ways of saying it: «care au cheltuit cel mai mult», «spitale care cumpără», the indefinite forms", async () => {
    for (const [q, kind] of [["spitalele care au cheltuit cel mai mult pe medicamente in 2025", "spital"], ["spitale care cumpara medicamente", "spital"],
      ["consilii judetene cu cele mai mari contracte pe iluminat", "consiliu_judetean"], ["primariile de comuna cu cele mai mari contracte pe iluminat", "comuna"],
      ["primarii de oras care cumpara iluminat", "oras_municipiu"]] as const) {
      const { i, spec } = await read(q);
      expect([q, i.intent, i.authorityKind?.kind, i.leftover]).toEqual([q, "ranking_authorities", kind, []]);
      expect(spec).toMatchObject({ block: "table", dim: "authority", filters: { authorityKind: kind } });
    }
    expect((await read("consiliu judetean iluminat")).i.authorityKind?.kind).toBe("consiliu_judetean");
  });
  it("reads «top 10 primării», «care consiliu județean», and never applies a kind the words leave out", async () => {
    const top = await read("top 10 primarii dupa valoarea contractelor in 2024");
    expect([top.i.intent, top.i.authorityKind?.kind, top.i.topN, top.spec.block, top.spec.dim]).toEqual(["ranking_authorities", "primarie", 10, "table", "authority"]);
    const firms = await read("top 10 firme iluminat");
    expect([firms.i.intent, firms.i.topN, firms.spec.dim]).toEqual(["ranking_suppliers", 10, "supplier"]);
    const council = await read("care consiliu judetean a cheltuit cel mai mult pe iluminat in 2024");
    expect([council.i.intent, council.i.authorityKind?.kind, council.spec.dim]).toEqual(["ranking_authorities", "consiliu_judetean", "authority"]);
    const not = await read("iluminat in judetul Buzau dar nu de la primarii");
    expect(not.i.authorityKind).toBeNull();
    expect(not.i.notes).toContain("„nu de la primarii”: nu putem scoate un tip de instituții din căutare, așa că arătăm toate instituțiile.");
  });
  it("ranks every institution for «instituția cu…» and the firms for «firma cu…», without a word left over", async () => {
    const buyers = await read("institutia cu cele mai mari contracte pe iluminat");
    expect([buyers.i.intent, buyers.i.authorityKind, buyers.i.leftover, buyers.spec.dim]).toEqual(["ranking_authorities", null, [], "authority"]);
    const firms = await read("firma cu cele mai mari contracte pe iluminat in 2026");
    expect([firms.i.intent, firms.i.leftover, firms.spec.dim]).toEqual(["ranking_suppliers", [], "supplier"]);
  });
  it("leaves a named institution and a town hall without a name as they were", async () => {
    const named = await read("ce cumpara primaria din Ramnicu Sarat");
    expect(named.i.authorityKind).toBeNull();
    expect(named.i.place?.kind).toBe("locality");
    const unnamed = await read("cat a cheltuit primaria pe iluminat");
    expect(unnamed.i.authorityKind).toBeNull();
    expect(unnamed.i.notes).toContain("Nu am recunoscut numele primăriei. Scrie localitatea, de exemplu „primăria din Râmnicu Sărat”.");
  });
  it("keeps the per-inhabitant ranking on its own list of local administrations", async () => {
    const { i } = await read("ce primarii cheltuie cel mai mult pe locuitor");
    expect(i.authorityKind).toBeNull();
    expect(i.measure).toBe("value_per_capita");
  });
});

describe("a place or a year between the noun and the superlative", () => {
  it("still ranks the noun's holders, inside the place (owner, 23 November 2026: these read as the largest records)", async () => {
    const communes = await read("comunele din judetul Buzau cu cele mai mari contracte de iluminat");
    expect([communes.i.intent, communes.i.largest ?? null, communes.i.leftover]).toEqual(["ranking_authorities", null, []]);
    expect(communes.spec).toMatchObject({ block: "table", dim: "authority", filters: { cpvTerm: "iluminat", county: "Buzău", authorityKind: "comuna" } });
    const halls = await read("primariile din Buzau cu cele mai multe achizitii directe");
    expect(halls.spec).toMatchObject({ block: "table", dim: "authority", filters: { county: "Buzău", authorityKind: "primarie" } });
    const firms = await read("firmele din Cluj cu cele mai multe contracte in 2025");
    expect(firms.spec).toMatchObject({ block: "table", dim: "supplier", filters: { county: "Cluj", yearFrom: 2025, yearTo: 2025 } });
    const towns = await read("orasele din 2024 cu cele mai mari cheltuieli pe asfaltare");
    expect(towns.spec).toMatchObject({ block: "table", dim: "authority", filters: { cpvTerm: "asfaltare", authorityKind: "oras_municipiu", yearFrom: 2024, yearTo: 2024 } });
    const hospitals = await read("spitalele din Braila care au cele mai mari contracte");
    expect(hospitals.spec).toMatchObject({ block: "table", dim: "authority", filters: { county: "Brăila", authorityKind: "spital" } });
  });
  it("ranks a singular said with a county, and leaves one with a locality to the institution it may name", async () => {
    const county = await read("primaria din judetul Buzau cu cele mai mari contracte pe iluminat");
    expect(county.spec).toMatchObject({ block: "table", dim: "authority", filters: { cpvTerm: "iluminat", county: "Buzău", authorityKind: "primarie" } });
    const one = await read("primaria din Buzau cu cele mai mari contracte");
    expect([one.i.intent, Boolean(one.i.largest), one.i.holder ?? false]).toEqual(["total", true, false]);
    expect(one.spec.block).toBe("stat");
  });
  it("leaves the largest records of a kind as they were", async () => {
    const { i, spec } = await read("cele mai mari contracte ale comunelor din judetul Buzau");
    expect([i.intent, Boolean(i.largest), spec.block]).toEqual(["total", true, "stat"]);
  });
});
