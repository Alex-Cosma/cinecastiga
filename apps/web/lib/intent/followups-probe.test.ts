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
  ],
  synonyms: [...FIXTURE.synonyms, { term: "deszapezire", prefix: "90620000" }, { term: "paturi de spital", prefix: "33192100" }],
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

  it("keeps an institution word inside a curated phrase („paturi de spital”)", async () => {
    const i = await read("paturi de spital");
    expect(i.subjects.map((s) => s.term)).toEqual(["paturi de spital"]);
    expect(i.authorityKind).toBeNull();
    // the word alone still names the buyers
    expect((await read("cine câștigă la spitale pe deszapezire")).authorityKind?.kind).toBe("spital");
  });
});
