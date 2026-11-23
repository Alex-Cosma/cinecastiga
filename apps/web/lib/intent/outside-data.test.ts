import { describe, expect, it } from "vitest";
import { applyInterpretation } from "../topic-search/interpretation";
import { parseTopicScope } from "../topic-search/shared";
import { memoryVocabulary } from "./memory-vocabulary";
import { EXECUTION_NOTE, GUILT_NOTE, OFFICIALS_NOTE, OPEN_TENDERS_NOTE, PAYMENTS_NOTE, RulesInterpreter, TOWN_HALL_UNKNOWN } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * Search probe, 23 November 2026, family 11: questions the data cannot answer (payments, guilt, who holds an office or
 * is related to whom, how a work went, the tenders still open) were answered as something else, in silence. The closest
 * reading stays and one note says what the data holds. No person is named anywhere here.
 */
const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
const read = async (q: string) => {
  const i = await interpreter.interpret(q, { now: NOW });
  const r = resultFor(i);
  return { i, r, spec: r.spec, notes: r.interpretation.notes };
};
const onSearch = async (q: string) => applyInterpretation(parseTopicScope(new URLSearchParams(`q=${encodeURIComponent(q)}`)), (await read(q)).r);

describe("what the data does not hold is said", () => {
  it("payments: the contracted value answers, with the note; «cât a plătit» alone is how people ask the value", async () => {
    const paid = await read("cat a platit efectiv primaria buzau pe iluminat");
    expect([paid.spec?.block, paid.i.leftover, paid.notes]).toEqual(["stat", [], [PAYMENTS_NOTE]]);
    expect(paid.r.sentence).toBe("Cât valorează achizițiile pentru „iluminat” făcute de primăria Buzău, în toți anii?");
    expect((await read("plati iluminat buzau 2024")).notes).toEqual([PAYMENTS_NOTE]);
    expect((await read("cat a platit primaria buzau pe iluminat")).notes).toEqual([]);
  });
  it("guilt: the signals answer, and the note says they are leads, once", async () => {
    for (const q of ["care sunt cele mai corupte institutii din romania", "furt", "care primarie e corupta la achizitii"]) {
      const { i, notes } = await read(q);
      expect([q, i.intent, i.leftover, notes]).toEqual([q, "signals", [], [GUILT_NOTE]]);
    }
    const arranged = await read("care licitatii de iluminat sunt aranjate");
    expect(arranged.i.intent).toBe("signals");
    expect(arranged.notes.filter((n) => /nu dovezi/.test(n))).toEqual([GUILT_NOTE]);
    // the mayor's institution is the town hall
    const mayor = await read("primarul din buzau e corupt?");
    expect([mayor.i.intent, mayor.notes]).toEqual(["signals", [GUILT_NOTE]]);
    expect(mayor.r.sentence).toMatch(/^Unde se situează MUNICIPIUL BUZAU după risc/);
    expect((await read("care primar e corupt in buzau")).i.leftover).toEqual([]);
  });
  it("offices and kinship: not in the data, and the mayor's town still names the town hall", async () => {
    const firms = await read("firmele care lucreaza cu primaria si apartin primarului din buzau");
    expect([firms.spec?.block, firms.spec?.dim, firms.i.place?.kind, firms.i.leftover]).toEqual(["table", "supplier", "locality", []]);
    expect(firms.notes).toEqual([OFFICIALS_NOTE]);
    expect(firms.notes).not.toContain(TOWN_HALL_UNKNOWN);
    expect((await read("rudele primarului din buzau au firme")).notes).toEqual([OFFICIALS_NOTE]);
  });
  it("how a work went and the tenders still open: one honest note each", async () => {
    expect((await read("s-a terminat lucrarea de iluminat din buzau")).notes).toContain(EXECUTION_NOTE);
    const open = await read("ce licitatii sunt deschise acum pentru iluminat");
    expect([open.i.subjects.map((s) => s.term), open.i.procedure, open.notes]).toEqual([["iluminat"], null, [OPEN_TENDERS_NOTE]]);
    // „licitații deschise” without „acum” is still the procedure type
    const procedure = await read("licitatii deschise iluminat 2024");
    expect([procedure.i.procedure, procedure.notes]).toEqual(["deschisa", []]);
  });
  it("shows the notes on /cauta too, even when nothing else is read", async () => {
    expect((await onSearch("cat a platit efectiv primaria buzau pe iluminat")).notes).toContain(PAYMENTS_NOTE);
    expect((await onSearch("furt")).notes).toContain(GUILT_NOTE);
    expect((await onSearch("cat s-a platit efectiv pe contractul de modernizare a DN1")).notes).toContain(PAYMENTS_NOTE);
  });
});
