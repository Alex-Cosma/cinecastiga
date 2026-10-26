import { describe, expect, it } from "vitest";
import { commonPeriod, generalCodes, isGeneralGroup, olderRecords, olderRecordsDetail, olderRecordsTip, peerFirmDetail, type PairYear } from "./compare-shared";

/*
 * F4, the comparison's shared rules (plan §4.6, final compare §3.1, §3.2,
 * §3.6): the codes above a domain, the general groups the suggestions leave
 * out, "Perioada comună" only when it changes at least 5% of one's value,
 * the records before 2018 apart.
 */

const year = (y: number, a: number, b: number, n = 1): PairYear => ({ year: y, a: { value: a, n: a ? n : 0 }, b: { value: b, n: b ? n : 0 } });

describe("the codes above a domain („+ X lei pe coduri mai generale”)", () => {
  it("are its division, group and class codes, never one the domain holds", () => {
    expect(generalCodes(["45233"])).toEqual(["45000000", "45200000", "45230000"]);
    // A domain at the group level holds its own code: only the division is above it.
    expect(generalCodes(["45200"])).toEqual(["45000000"]);
    expect(generalCodes(["4523", "45233"])).toEqual(["45000000", "45200000"]);
    expect(generalCodes(["45"])).toEqual([]);
    expect(generalCodes(["33600000"])).toEqual(["33000000"]);
  });
  it("leave out of the suggestions the division and group codes (45000, 45200), not a class (45230)", () => {
    expect(["45000", "45200", "45230", "45233"].map(isGeneralGroup)).toEqual([true, true, false, false]);
  });
});

describe("„Perioada comună” (final §3.1)", () => {
  const names = { a: "KARSAN", b: "SOLARIS" };
  it("is offered when the years outside it hold at least 5% of one's value, with who starts later and who stops earlier", () => {
    // SOLARIS 2018–2025, KARSAN 2021–2026: 2018–2020 hold 28.6% of SOLARIS (final §3.1).
    const years = [year(2018, 0, 138), year(2019, 0, 96), year(2020, 0, 229), year(2021, 207, 388), year(2022, 0, 425), year(2023, 59, 53),
      year(2024, 317, 113), year(2025, 323, 179), year(2026, 5, 0)];
    expect(commonPeriod(years, names)).toEqual({ from: 2021, to: 2025, detail: "KARSAN apare din 2021, SOLARIS până în 2025" });
  });
  it("is not offered when both have the same years from 2018, whatever they had before", () => {
    // Cluj and Timișoara: both 2018–2026 after the cut; Timișoara's 2014–2017 are "+17 mai vechi".
    expect(commonPeriod([year(2014, 0, 42), year(2017, 0, 2, 16), year(2018, 345, 22), year(2026, 688, 555)], { a: "Cluj", b: "Timișoara" })).toBeNull();
  });
  it("is not offered when the years outside it hold under 5% of each one's value", () => {
    expect(commonPeriod([year(2018, 1, 0), year(2019, 100, 100), year(2025, 100, 100)], names)).toBeNull();
  });
  it("is not offered without years in common", () => {
    expect(commonPeriod([year(2018, 10, 0), year(2025, 0, 10)], names)).toBeNull();
  });
});

describe("the records before 2018", () => {
  const years = [year(2014, 0, 42, 1), year(2017, 0, 2, 16), year(2018, 345, 22, 500)];
  it("are counted apart, said beside „Toți anii” and in its (?)", () => {
    expect(olderRecords(years)).toEqual({ a: { value: 0, n: 0 }, b: { value: 44, n: 17 } });
    expect(olderRecordsDetail(olderRecords(years))).toBe("+17 mai vechi");
    expect(olderRecordsTip(olderRecords(years), { a: "Cluj-Napoca", b: "Timișoara" })).toBe(
      "Unele înregistrări au date dinainte de 2018 (Timișoara: 17, 44 lei). Intră în „Toți anii”; graficul le strânge într-o coloană.");
    expect(olderRecordsDetail(olderRecords([year(2018, 1, 1)]))).toBeNull();
  });
});

describe("a suggested firm's basis (final §3.6)", () => {
  it("counts the shared clients with their noun", () => {
    expect(peerFirmDetail(16, "45")).toBe("16 clienți comuni · CPV 45");
    expect(peerFirmDetail(1, "15")).toBe("1 client comun · CPV 15");
    expect(peerFirmDetail(21, "45")).toBe("21 de clienți comuni · CPV 45");
  });
});
