import { describe, expect, it } from "vitest";
import { memoryVocabulary, type MemoryFixture } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { buildSpelling, spell } from "./spelling";
import { resultFor } from "./to-spec";
import { applyInterpretation } from "../topic-search/interpretation";
import { parseTopicScope } from "../topic-search/shared";

/**
 * What the „Pe scurt” rework left to the interpreter (owner, 10 November 2026): a comparison of two firms where one
 * name has several firms, labels without diacritics, and an institution word inside a curated phrase.
 */
const NOW = new Date("2026-11-10T16:00:00Z");
const fx: MemoryFixture = {
  ...FIXTURE,
  catalog: [
    ...FIXTURE.catalog,
    { code: "90620000-9", name: "Servicii de deszăpezire" },
    { code: "33192100-3", name: "Paturi medicale" },
    { code: "39511100-8", name: "Pături" },
    { code: "45212224-2", name: "Lucrări de construcţii de stadioane" },
    { code: "34144510-6", name: "Vehicule pentru transportul deşeurilor menajere" },
    { code: "34110000-1", name: "Autoturisme" },
    { code: "90500000-2", name: "Servicii privind deşeurile menajere şi deşeurile" },
  ],
  synonyms: [
    ...FIXTURE.synonyms, { term: "deszapezire", prefix: "90620000" }, { term: "paturi de spital", prefix: "33192100" },
    { term: "stadion", prefix: "45212224" }, { term: "masini", prefix: "34110000" }, { term: "gunoi", prefix: "90500000" },
    { term: "masini de gunoi", prefix: "34144510" },
  ],
  authorities: [...FIXTURE.authorities, { id: 9300001, name: "JUDETUL CLUJ (CONSILIUL JUDETEAN)", county: "Cluj", total: 9_000_000_000 }],
  suppliers: [
    // one „Strabag” exactly, another carrying the name
    ...FIXTURE.suppliers.filter((e) => e.id !== 9000007),
    { id: 9200001, name: "STRABAG CONSTRUCT", county: "Bucuresti", total: 50_000_000 },
    { id: 9200002, name: "PORR CONSTRUCT", county: "Bucuresti", total: 3_000_000_000 },
  ],
};
const interpreter = new RulesInterpreter(memoryVocabulary(fx));
const read = (q: string) => interpreter.interpret(q, { now: NOW });
const page = async (q: string) => {
  const scope = parseTopicScope(new URLSearchParams(`q=${encodeURIComponent(q)}`));
  return applyInterpretation(scope, resultFor(await read(q)), null, NOW);
};

describe("follow-ups of the „Pe scurt” rework (10 November 2026)", () => {
  it("writes folded words in Romanian, from the catalogue's labels", () => {
    const spelling = buildSpelling(["Servicii de deszăpezire", "Amenajare şi întreţinere de spaţii verzi", "Paturi medicale", "Pături", "Paturi de campanie"]);
    expect(spell("deszapezire", spelling)).toBe("deszăpezire");
    // ş/ţ with a cedilla in the catalogue are written with a comma
    expect(spell("spatii verzi", spelling)).toBe("spații verzi");
    // the catalogue writes „paturi” more often than „pături”: it stays
    expect(spell("paturi", spelling)).toBe("paturi");
    // words typed with diacritics, or unknown, stay as typed; a capital stays
    expect(spell("spațiile verzi", spelling)).toBe("spațiile verzi");
    expect(spell("Deszapezire", spelling)).toBe("Deszăpezire");
    // words of the curated list the catalogue does not have
    expect(spell("mentenanta", spelling)).toBe("mentenanță");
  });

  it("labels a curated subject with diacritics, whatever was typed", async () => {
    const t = await page("deszapezire 2024");
    expect(t.subject).toMatchObject({ term: "deszapezire", label: "deszăpezire" });
    expect(t.answer?.total.sentence).toMatch(/„deszăpezire”/);
  });

  it("compares two firms when one name is carried by several firms and one has it exactly", async () => {
    for (const q of ["compară Strabag cu Porr Construct", "compară Porr Construct cu Strabag"]) {
      const i = await read(q);
      expect(i.intent, q).toBe("compare");
      expect(i.leftover, q).toEqual([]);
      expect([i.supplier?.name, i.compareWith?.name].sort(), q).toEqual(["PORR CONSTRUCT", "STRABAG SRL"]);
      expect(i.notes.join(" "), q).toMatch(/Am comparat „STRABAG SRL”, singura cu exact acest nume; încă una are „Strabag” în nume\./);
    }
    // the order typed is the order compared
    const first = await read("compară Strabag cu Porr Construct");
    expect(first.supplier?.name).toBe("STRABAG SRL");
    expect(first.compareWith?.name).toBe("PORR CONSTRUCT");
  });

  it("never adds two curated subjects joined by „de”: the phrase has no domain, its titles are searched", async () => {
    const i = await read("iluminat de stadion");
    expect(i.subjects).toEqual([]);
    expect(i.notes).toContain("„iluminat de stadion”: nu avem un domeniu pentru această expresie; căutăm titlurile cu aceste cuvinte, fără total.");
    const t = await page("iluminat de stadion");
    expect(t.answer).toBeNull();
    expect(t.applied).toMatchObject({ q: "iluminat de stadion", names: "exact" });
    // a curated phrase is its own subject („mașini de gunoi” are waste collection vehicles, not cars and waste)
    expect((await read("mașini de gunoi")).subjects.map((s) => s.term)).toEqual(["masini de gunoi"]);
    // two subjects without „de” stay a list
    expect((await read("iluminat stadion")).subjects.length).toBeGreaterThan(0);
  });

  it("says that „CJ” without a county is every county council", async () => {
    const note = "Toate consiliile județene; pentru unul anume scrie județul, de exemplu „CJ Cluj”.";
    const i = await read("cine câștigă la CJ");
    expect(i.authorityKind?.kind).toBe("consiliu_judetean");
    expect(i.notes).toContain(note);
    expect((await read("cine câștigă la consiliul județean")).notes).toContain(note);
    expect((await read("cine câștigă la consiliile județene")).notes).not.toContain(note);
    expect((await read("cine câștigă la CJ Cluj")).notes).not.toContain(note);
  });

  it("keeps an institution word inside a curated phrase („paturi de spital”)", async () => {
    const i = await read("paturi de spital");
    expect(i.subjects.map((s) => s.term)).toEqual(["paturi de spital"]);
    expect(i.authorityKind).toBeNull();
    // the word alone still names the buyers
    expect((await read("cine câștigă la spitale pe deszapezire")).authorityKind?.kind).toBe("spital");
  });
});
