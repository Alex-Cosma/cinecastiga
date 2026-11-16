import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";

/*
 * UX audit Z2-11 (16 November 2026): the note about „primăriile” is written after the final reading and says what the
 * answer keeps, never „arătăm toate instituțiile” over an answer about one kind.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = (q: string) => interpreter.interpret(q, { now: NOW });

describe("the town halls' note", () => {
  it("keeps the kind read and says the town halls are left out", async () => {
    const i = await read("firmele care câștigă de la consiliul județean și de la primăriile din județul Buzău");
    expect(i.authorityKind?.kind).toBe("consiliu_judetean");
    expect(i.notes[0]).toBe("Doar consiliile județene, fără primării.");
    expect(i.notes.join(" ")).not.toMatch(/arătăm toate instituțiile|pe locuitor/);
  });
  it("says every institution is ranked when no kind is read, once, without the per-inhabitant aside", async () => {
    const i = await read("ce firme câștigă la primăriile din județul Buzău");
    expect(i.notes.filter((x) => /primării/.test(x))).toEqual(["Nu putem restrânge clasamentul doar la primării (primăriile de comună și de oraș sunt tipuri separate); arătăm toate instituțiile."]);
  });
  it("says it once when the town halls are named twice", async () => {
    const i = await read("ce firme câștigă la primăriile din Buzău și la primăriile din Brăila");
    expect(i.notes.filter((x) => /Nu putem restrânge/.test(x))).toHaveLength(1);
  });
});
