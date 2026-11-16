import { describe, expect, it } from "vitest";
import { entityCsvName, entityTxCsv } from "./entity-tx-csv";
import type { DaTx } from "./marts";

const row = (over: Partial<DaTx>): DaTx => ({
  src: "da", sicapDaId: "114737259", daCode: "DA123", partnerId: "10", partnerName: "=FIRMA", county: null, cpvCode: "33141110-4",
  cpvName: "Pansamente", estimatedValueRon: null, closingValue: 2430, closingValueExact: "2430.10", finalizationDate: "2021-06-04",
  daFlags: ["da_round"], procedureType: null, caNoticeId: null, singleBidder: null, natId: null, valueSuspect: false, nWinners: null,
  contractValueFull: null, consortiumOthers: [], title: "Comprese sterile", ...over,
});

describe("the entity table's CSV", () => {
  it("writes every row with its exact value, its signals and both links, Excel-safe", () => {
    const csv = entityTxCsv([row({}), row({ src: "contract", sicapDaId: "9", natId: "107767548", caNoticeId: "215", title: null, daFlags: [], singleBidder: true, nWinners: 3, contractValueFull: 7290.3 })], "https://cinecastiga.ro");
    const [header, da, contract] = csv.replace("﻿", "").trim().split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(header).toBe("data,tip,partener,id_partener,cod_cpv,domeniu_cpv,titlu,valoare_ron,numar_castigatori,valoare_contract_integral,semnale,numar,link_seap,link_site");
    expect(da).toContain('"2021-06-04",achizitie_directa,"\'=FIRMA","10"');
    expect(da).toContain(',"Comprese sterile",2430.10,,,"da_round","DA123"');
    expect(da).toContain('"https://cinecastiga.ro/achizitii/114737259"');
    expect(contract).toContain(',3,7290.3,"un_ofertant"');
    expect(contract).toContain('"https://cinecastiga.ro/contracte/107767548"');
  });
  it("names the file, and says when it was cut", () => {
    expect(entityCsvName("2146445", 120, 120)).toBe("inregistrari-2146445.csv");
    expect(entityCsvName("2146445", 20000, 31234)).toBe("inregistrari-2146445-primele-20000-din-31234.csv");
  });
});
