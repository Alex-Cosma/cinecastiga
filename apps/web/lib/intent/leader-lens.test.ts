import { describe, expect, it } from "vitest";
import { memoryVocabulary } from "./memory-vocabulary";
import { RulesInterpreter } from "./rules";
import { FIXTURE } from "./rules.fixture";
import { resultFor } from "./to-spec";

/*
 * F6c in words (plan §2.7 „Cine conduce?”, final entity_card decisions 2 and 3): „cea mai riscantă firmă / instituție
 * (din X)” is the index, „cel mai mare spital din X” the value of the kind, „cel mai mare client al firmei X” the
 * buyer of a named firm; „firmă din X” and „firmă cu sediul în X” are the firm's seat, „în județul X” after the
 * verb its buyers' county; a size of the firms stays on the index.
 */

const NOW = new Date("2026-10-22T12:00:00Z");
const interpreter = new RulesInterpreter(memoryVocabulary(FIXTURE));
async function ask(q: string) {
  return resultFor(await interpreter.interpret(q, { now: NOW }));
}

describe("«Cine conduce?» in words", () => {
  it("the riskiest firm or institution is the index (it used to reach the breakdown or nothing)", async () => {
    expect((await ask("care este cea mai riscantă firmă din Buzău")).spec)
      .toEqual({ block: "entity_card", dim: "supplier", rankBy: "risk", measure: "value", filters: { seatCounty: "Buzău" } });
    expect((await ask("cea mai riscanta firma")).spec).toEqual({ block: "entity_card", dim: "supplier", rankBy: "risk", measure: "value", filters: {} });
    expect((await ask("care e cea mai riscantă instituție din Buzău")).spec)
      .toEqual({ block: "entity_card", dim: "authority", rankBy: "risk", measure: "value", filters: { county: "Buzău" } });
    const hospital = await ask("care este cel mai riscant spital din Buzău");
    expect(hospital.spec).toEqual({ block: "entity_card", dim: "authority", rankBy: "risk", measure: "value", filters: { county: "Buzău", authorityKind: "spital" } });
    expect(hospital.sentence).toBe("Care spital din județul Buzău are cel mai ridicat indice de risc?");
    // The plural is the cloud, as before.
    expect((await ask("care sunt cele mai riscante firme")).spec).toMatchObject({ block: "scatter", dim: "supplier" });
  });

  it("the biggest hospital of a county is the value of its kind; the biggest client of a firm, its buyers' ranking at place 1", async () => {
    expect((await ask("care e cel mai mare spital din Buzău")).spec)
      .toEqual({ block: "entity_card", dim: "authority", rankBy: "value", measure: "value", filters: { county: "Buzău", authorityKind: "spital" } });
    const client = await ask("cine este cel mai mare client al firmei Constructii Erbasu");
    expect(client.spec).toEqual({
      block: "entity_card", dim: "authority", rankBy: "value", measure: "value", filters: { supplierName: "CONSTRUCTII ERBASU S.A.", supplierId: 9000001 },
    });
    expect(client.sentence).toBe("Care instituție din toată țara cumpără cel mai mult de la CONSTRUCTII ERBASU S.A., prin toate achizițiile, în toți anii?");
    expect((await ask("care este cel mai mare client al Constructii Erbasu în 2025")).spec?.filters).toMatchObject({ supplierId: 9000001, yearFrom: 2025, yearTo: 2025 });
  });

  it("a firm «din Buzău» or «cu sediul în Buzău» is the seat; «în județul Buzău» after the verb is the buyers' county", async () => {
    const seat = await ask("care firmă din Buzău a câștigat cel mai mult");
    expect(seat.spec).toEqual({ block: "entity_card", dim: "supplier", rankBy: "value", measure: "value", filters: { seatCounty: "Buzău" } });
    expect(seat.sentence).toBe("Care firmă cu sediul în județul Buzău câștigă cel mai mult din achizițiile făcute de instituțiile publice din toată țara, în toți anii?");
    expect((await ask("care firmă cu sediul în Buzău a câștigat cel mai mult în 2025")).spec?.filters).toEqual({ seatCounty: "Buzău", yearFrom: 2025, yearTo: 2025 });
    expect((await ask("care firmă a câștigat cel mai mult în județul Buzău")).spec?.filters).toEqual({ county: "Buzău" });
  });

  it("keeps the size of the firms on the index, and says nothing was dropped", async () => {
    const r = await ask("cea mai riscantă firmă din Buzău fără angajați");
    expect(r.spec).toEqual({ block: "entity_card", dim: "supplier", rankBy: "risk", measure: "value", filters: { seatCounty: "Buzău", maxEmployees: 0 } });
    expect(r.interpretation.notes.join(" ")).not.toMatch(/mărimea firmelor/);
    expect((await ask("cea mai mare firmă din Buzău fără angajați")).spec?.filters).toEqual({ seatCounty: "Buzău", maxEmployees: 0 });
    // The risk cloud still cannot (F6b): the size is dropped there, with its note.
    const cloud = await ask("ce firme sunt suspecte fără angajați");
    expect(cloud.spec?.block).toBe("scatter");
  });
});
