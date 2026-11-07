import { describe, expect, it } from "vitest";
import { daState, durationLabel, isGenericTitle, kindLabel, meaningfulLot, procedureLabel, recordHeadline } from "./record-labels";

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
});
