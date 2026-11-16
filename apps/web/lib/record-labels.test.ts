import { describe, expect, it } from "vitest";
import { recordCaveat, contractValueState, daState, durationLabel, isGenericTitle, kindLabel, lotParts, lotTitle, meaningfulLot, noticeGapNote, procedureLabel, recordHeadline } from "./record-labels";

describe("record labels", () => {
  it("writes procedures in Romanian", () => {
    expect(procedureLabel("NEGOCIERE FARA PUBLICARE PREALABILA")).toBe("Negociere fără publicare prealabilă");
    expect(procedureLabel("Licitatie deschisa")).toBe("Licitație deschisă");
    expect(procedureLabel("Altceva nou")).toBe("Altceva nou");
    expect(procedureLabel(null)).toBeNull();
  });
  it("classifies direct acquisition states: only an accepted offer is a purchase", () => {
    expect(daState("Oferta acceptata")).toEqual({ label: "Ofertă acceptată", kind: "accepted" });
    expect(daState("Conditii refuzate").kind).toBe("refused");
    expect(daState("Oferta neacceptata in termen").kind).toBe("unaccepted");
    expect(daState(null).kind).toBe("other");
  });
  it("finds titles that name nothing", () => {
    for (const t of ["Contract", "Contract 707", "Contract subsecvent", "CONTRACT SUBSECVENT NR. 12/2024", "Contract de furnizare", "Acord-cadru", "SCN1168231"]) expect(isGenericTitle(t)).toBe(true);
    expect(isGenericTitle("Servicii de pază pentru sediul primăriei")).toBe(false);
    expect(isGenericTitle("Lucrari", null)).toBe(true);
    expect(isGenericTitle("CAN1234567", "CAN1234567")).toBe(true);
  });
  it("keeps a lot line only when it says something new", () => {
    expect(meaningfulLot("Default lot", "x")).toBeNull();
    expect(meaningfulLot("Lot 1", "x")).toBeNull();
    expect(meaningfulLot("1. Default lot", "x")).toBeNull();
    expect(isGenericTitle("1. Default lot")).toBe(true);
    expect(meaningfulLot("4. Serviciu APN privat", "Servicii de comunicații")).toBe("4. Serviciu APN privat");
    expect(meaningfulLot("Servicii", "Servicii")).toBeNull();
    // The lot's number does not make it new (UX audit bug 5, /contracte/556750).
    expect(meaningfulLot("1. Elaborarea hartilor strategice de zgomot", "Elaborarea hărților strategice de zgomot")).toBeNull();
    expect(meaningfulLot("1. Elaborarea hartilor strategice de zgomot.", "Elaborarea hartilor strategice de zgomot")).toBeNull();
  });
  it("reads a lot's number and object, and names a page after a lot only when it says something", () => {
    expect(lotParts("123. DOPAMINUM clorhidrat")).toEqual({ no: "123", object: "DOPAMINUM clorhidrat" });
    expect(lotParts("Pulpa vita")).toEqual({ no: null, object: "Pulpa vita" });
    expect(lotParts("  ")).toBeNull();
    expect(lotTitle("123. DOPAMINUM clorhidrat")).toEqual({ no: "123", object: "DOPAMINUM clorhidrat" });
    expect(lotTitle("Lot 3")).toBeNull();
    expect(lotTitle("1. Default lot")).toBeNull();
    expect(lotTitle("2. A1")).toBeNull();
    expect(lotTitle("4. LOT 4 - Conexiuni")).toEqual({ no: "4", object: "LOT 4 - Conexiuni" });
    expect(lotTitle(null)).toBeNull();
  });
  it("chooses a headline, never the notice number", () => {
    expect(recordHeadline({ title: "Contract subsecvent", lot: "4. Serviciu APN privat", cpvName: "Servicii", kind: "Contract" })).toBe("4. Serviciu APN privat");
    expect(recordHeadline({ title: null, noticeTitle: "SCN1168231", noticeNo: "SCN1168231", cpvName: "Lucrări de construcții", kind: "Contract" })).toBe("Lucrări de construcții");
    expect(recordHeadline({ title: null, kind: "Achiziție directă" })).toBe("Achiziție directă");
  });
  it("names the kind and the duration", () => {
    expect(kindLabel("calloff")).toBe("Comandă subsecventă");
    expect(kindLabel("legacy")).toBe("Contract");
    expect(durationLabel("2026-03-01 10:00", "2026-03-01 10:16")).toBe("16 minute");
    expect(durationLabel("2026-03-01 10:00", "2026-03-03 10:00")).toBe("2 zile");
    expect(durationLabel("2026-03-01 10:00", "2026-03-01 13:00")).toBe("3 ore");
    expect(durationLabel("2026-03-01 10:00", "2026-03-11 10:00")).toBe("10 zile");
    expect(durationLabel(null, "2026-03-01 10:00")).toBeNull();
  });
  it("names a value in another currency as published but not converted", () => {
    expect(contractValueState({ contractValueExact: "10.5", legacyForeignValue: false, currency: "RON" })).toBe("amount");
    expect(contractValueState({ contractValueExact: null, legacyForeignValue: true, currency: "EUR" })).toBe("foreign");
    expect(contractValueState({ contractValueExact: null, legacyForeignValue: false, currency: "EUR" })).toBe("missing");
    expect(contractValueState({ contractValueExact: null, legacyForeignValue: false, currency: null })).toBe("missing");
  });
  it("says the gap between the contracts found and the notice's value only when both count the same things", () => {
    const e = { total: "568985433.5", award: "502664194.82", frameworks: null, everyValue: "568985433.5" };
    expect(noticeGapNote(e)).toBe("Contractele găsite însumează 568.985.433,50 lei, cu 66.321.238,68 lei mai mult. Diferența nu e explicată în sursă.");
    expect(noticeGapNote({ ...e, total: "400000000", everyValue: "400000000" })).toBe("Contractele găsite însumează 400.000.000 lei, cu 102.664.194,82 lei mai puțin. Diferența nu e explicată în sursă.");
    expect(noticeGapNote({ ...e, frameworks: "1000" })).toBeNull();
    expect(noticeGapNote({ ...e, everyValue: "600000000" })).toBeNull();
    expect(noticeGapNote({ ...e, total: "503000000", everyValue: "503000000" })).toBeNull();
    expect(noticeGapNote({ ...e, award: null })).toBeNull();
  });
  it("keeps two sentences of why a signal is not proof, never the counting rules (Z7-06)", () => {
    expect(recordCaveat("award_calloffs_over_ceiling")).toBe("Poate fi o eroare de introducere a datelor, mai ales când comenzile au aceeași sumă ca plafonul acordului-cadru (plafonul copiat în fiecare comandă). Un act adițional sau o ajustare de preț pot mări puțin plafonul.");
    expect(recordCaveat("award_single_bid")).toBe("Piețele de nișă pot avea legitim o singură ofertă. Un lot cu o ofertă nu descrie toate loturile anunțului.");
    expect(recordCaveat("da_split")).toBe("O clasă CPV comună nu dovedește o nevoie unică; achizițiile recurente pot fi legitime. Obligația estimării e a instituției, nu a firmei.");
    expect(recordCaveat("da_round")).toBe("O achiziție sub plafon este normală. Legea privește valoarea estimată, iar semnalul compară valoarea de închidere.");
    for (const code of ["award_no_competition", "award_single_bid", "award_calloffs_over_ceiling"]) expect(recordCaveat(code)).not.toContain("anunț de atribuire (apariții)");
    expect(recordCaveat("nu_exista")).toBeNull();
  });
});
