import { describe, expect, it } from "vitest";
import { ceilingEraOn, daySpan, decimalDifference, joinWords, partyShares, patternTitle, radiografieWarnings, ratioNumber, shareWords } from "./signal-page-words";
import { groupSourceRecords, sharedTitleStart, sourcePage, SOURCE_PAGE_SIZE } from "./source-groups";
import type { SourceRecord } from "./source-evidence";

const rec = (over: Partial<SourceRecord>): SourceRecord => ({
  daCode: null, date: null, authorityId: "1", authority: "INSTITUȚIA", supplierId: "10", supplier: "FIRMA", county: null,
  cpvName: null, value: 0, src: "contracts", refId: "100", caNoticeId: null, tedPubnum: null, estimatedValueRon: null,
  valueSuspect: false, valueExact: "0", cpvCode: null, state: null, nWinners: 1, contractValueFull: null, ...over,
});

describe("shareWords", () => {
  it("never rounds a share short of all to 100%", () => {
    expect(shareWords(0.981)).toBe("98%");
    expect(shareWords(0.99996)).toBe("peste 99%");
    expect(shareWords(1)).toBe("100%");
    expect(shareWords(0.003)).toBe("sub 1%");
    expect(shareWords(0)).toBe("0%");
    expect(shareWords(Number.NaN)).toBe("0%");
  });
});

describe("ratioNumber", () => {
  it("writes a decimal comma", () => {
    expect(ratioNumber(4.4427)).toBe("4,4");
    expect(ratioNumber(1.0168, 2)).toBe("1,02");
  });
});

describe("partyShares", () => {
  it("sums each supplier exactly, counts a consortium contract once per member and orders by value", () => {
    const shares = partyShares([
      rec({ refId: "1", supplierId: "10", supplier: "A", valueExact: "17555332.93" }),
      rec({ refId: "2", supplierId: "11", supplier: "B", valueExact: "114669.93", nWinners: 2 }),
      rec({ refId: "2", supplierId: "12", supplier: "C", valueExact: "60210.08", nWinners: 2 }),
      rec({ refId: "3", supplierId: "11", supplier: "B", valueExact: "33269.03" }),
      rec({ refId: "4", supplierId: "13", supplier: "D", valueExact: "131000" }),
    ], "supplier");
    expect(shares.map((s) => s.name)).toEqual(["A", "B", "D", "C"]);
    expect(shares[0]!.valueExact).toBe("17555332.93");
    expect(shares[1]).toMatchObject({ id: "11", valueExact: "147938.96", count: 2 });
    expect(shareWords(shares[0]!.share)).toBe("98%");
  });
  it("groups the authority side and keeps an unidentified party by its name", () => {
    const shares = partyShares([
      rec({ refId: "1", authorityId: null, authority: "FĂRĂ ID", valueExact: "5" }),
      rec({ refId: "2", authorityId: "2", authority: "X", valueExact: "15" }),
    ], "authority");
    expect(shares).toEqual([
      expect.objectContaining({ id: "2", share: 0.75 }),
      expect.objectContaining({ id: null, name: "FĂRĂ ID", share: 0.25 }),
    ]);
  });
});

describe("decimalDifference", () => {
  it("subtracts exactly", () => {
    expect(decimalDifference("137330", "135060")).toBe("2270.00");
    expect(decimalDifference("0.1", "0.3")).toBe("-0.20");
  });
});

describe("joinWords", () => {
  it("joins with commas and a last „și”", () => {
    expect(joinWords(["A"]).join("")).toBe("A");
    expect(joinWords(["A", "B"]).join("")).toBe("A și B");
    expect(joinWords(["A", "B", "C"]).join("")).toBe("A, B și C");
  });
});

describe("ceilingEraOn", () => {
  it("finds the ceiling in force, its type and the last day of its era", () => {
    expect(ceilingEraOn("2021-06-04", "da_ceiling_goods_services")).toEqual({ from: "2018-06-04", to: "2022-09-09", value: 135_060, law: "OUG 45/2018 art. I(2)", works: false });
    expect(ceilingEraOn("2023-01-10", "da_ceiling_works")).toMatchObject({ value: 900_400, to: null, works: true });
    expect(ceilingEraOn("2015-01-01", "da_ceiling_works")).toBeNull();
    expect(ceilingEraOn("2021-06-04", null)).toBeNull();
  });
});

describe("daySpan", () => {
  it("counts both ends", () => {
    expect(daySpan("2021-06-04", "2021-07-22")).toBe(49);
    expect(daySpan("2021-06-04", "2021-06-04")).toBe(1);
    expect(daySpan("2021-07-22", "2021-06-04")).toBeNull();
  });
});

describe("groupSourceRecords", () => {
  it("puts a consortium contract's halves under one row with their exact sum", () => {
    const groups = groupSourceRecords([
      rec({ refId: "7", supplier: "MARC", valueExact: "6865832.54", nWinners: 2 }),
      rec({ refId: "7", supplier: "DYNAMIC", valueExact: "6865832.55", nWinners: 2 }),
      rec({ refId: "8", src: "da", valueExact: "10", originalValueExact: null }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ key: "contracts:7", valueExact: "13731665.09", missingValue: false });
    expect(groups[0]!.records.map((r) => r.supplier)).toEqual(["MARC", "DYNAMIC"]);
    expect(groups[1]).toMatchObject({ key: "da:8", missingValue: true });
  });
  it("pages the rows and keeps the page inside the pages there are", () => {
    const rows = Array.from({ length: SOURCE_PAGE_SIZE + 3 }, (_, i) => i);
    expect(sourcePage(rows, 1)).toMatchObject({ page: 1, pages: 2, rows: [50, 51, 52] });
    expect(sourcePage(rows, 9).page).toBe(1);
    expect(sourcePage([], 3)).toMatchObject({ page: 0, pages: 1, rows: [] });
  });
});

describe("patternTitle", () => {
  it("names each lot pattern with its notices, in Romanian plural", () => {
    expect(patternTitle("consortiu", 3)).toBe("Aceeași asociere a câștigat 3 anunțuri");
    expect(patternTitle("rotatie", 1)).toBe("Aceiași câștigători reapar împreună în 1 anunț");
    expect(patternTitle("impartire", 21)).toBe("Aceleași firme își împart loturile în 21 de anunțuri");
    expect(patternTitle("maturare", 4)).toBe("Același câștigător ia toate loturile în 4 anunțuri");
  });
});

describe("radiografieWarnings", () => {
  it("speaks of the table on the page, not of the Radiografie's matrix", () => {
    const out = radiografieWarnings(["Sunt prezentate cotele furnizorilor selectați din contractele disponibile pentru anunțurile tiparului. Valorile din matrice pot reprezenta contracte integrale.", "Alt avertisment."]);
    expect(out.join(" ")).not.toMatch(/matrice/);
    expect(out[1]).toBe("Alt avertisment.");
  });
});

describe("sharedTitleStart", () => {
  const notice = "Contract de achiziție publică de produse privind achiziția de echipamente pentru Spitalul Orășenesc Negrești-Oaș";
  it("says a long shared beginning once and keeps each row's own end", () => {
    const shared = sharedTitleStart([`${notice} Lot 2- Ecografe`, `${notice} Lot 8- Echipamente de laborator`, null]);
    expect(shared?.start).toBe(notice);
    expect(shared?.lots).toBe(true);
    expect(shared?.rest.get(`${notice} Lot 2- Ecografe`)).toBe("Lot 2 · Ecografe");
  });
  it("cuts straight to the lot across quote differences and lot spellings", () => {
    const a = `${notice} „Dotarea Ambulatoriului“ Anunț CN1083045 Lot 4-Echipamente pentru endoscopie`;
    const b = `${notice} „Dotarea Ambulatoriului““ Anunț CN1083045 Lotul 16: Lampa scialitica`;
    const shared = sharedTitleStart([a, b, `${notice} „Dotarea Ambulatoriului“ Anunț CN1083045 lot nr. 9`]);
    expect(shared?.lots).toBe(true);
    expect(shared?.start).toBe(`${notice} „Dotarea Ambulatoriului“ Anunț CN1083045`);
    expect(shared?.rest.get(a)).toBe("Lot 4 · Echipamente pentru endoscopie");
    expect(shared?.rest.get(b)).toBe("Lot 16 · Lampa scialitica");
    // Different texts before the lot: no lot rows, the shared beginning only.
    const other = sharedTitleStart([`${notice} Spital A Lot 1- X`, `${notice} Spital B Lot 2- Y`]);
    expect(other?.lots).toBe(false);
    expect(other?.rest.get(`${notice} Spital A Lot 1- X`)).toBe("Spital A Lot 1- X");
    // "Pilot 3" is not a lot.
    expect(sharedTitleStart([`${notice} Pilot 3 X`, `${notice} Pilot 4 Y`])?.lots).toBe(false);
  });
  it("cuts at a word's end and leaves short or different titles alone", () => {
    expect(sharedTitleStart([`${notice} Lotul A`, `${notice} Lotul B`])?.start).toBe(notice);
    // SEAP breaks lines in different places.
    expect(sharedTitleStart([`${notice.replace("produse ", "produse\n")} Lotul A`, `${notice} Lotul B`])?.start).toBe(notice);
    expect(sharedTitleStart(["Reparații acoperiș școala 1", "Reparații acoperiș școala 2"])).toBeNull();
    // A title that is all beginning keeps its last word as its own.
    expect(sharedTitleStart([notice, `${notice} Lot 1`])?.rest.get(notice)).toBe("Negrești-Oaș");
    expect(sharedTitleStart([`${notice} Lot 1`])).toBeNull();
  });
});
