import { describe, expect, it } from "vitest";
import { composeEntitySummary, divisionLabel, readableCpvName, shareLabel, type Segment, type SummaryInput } from "./entity-summary";
import { formatRon } from "./format";

const text = (sentence: Segment[]) => sentence.map((s) => (typeof s === "string" ? s : s.text)).join("");

// Shaped on Municipiul Buzău in the 1 October local snapshot.
const authority: SummaryInput = {
  role: "authority",
  totalExact: "1572884046.27",
  nDa: 782,
  nContracts: 155,
  dateFrom: "2018-01-15",
  dateTo: "2026-09-02",
  divisions: [
    { code: "45", name: "Lucrări de construcţii", valueExact: "864030065.26", n: 145 },
    { code: "90", name: "Servicii de evacuare a apelor reziduale, de eliminare a deşeurilor", valueExact: "369045915.86", n: 10 },
    { code: null, name: null, valueExact: "1000", n: 1 },
  ],
  nConsortium: 30,
  partners: [
    { partnerId: "2044213", partnerName: "RER SUD", totalRon: 332_500_000, pct: 0.2114, nConsortium: 0 },
    { partnerId: "2126729", partnerName: "CONCELEX", totalRon: 146_100_000, pct: 0.0929, nConsortium: 2 },
    { partnerId: "0", partnerName: null, totalRon: 5000, pct: 0, nConsortium: 0 },
  ],
};

describe("“Pe scurt” for an authority", () => {
  const s = composeEntitySummary(authority)!;
  it("repeats the KPI total and counts, saying the value is not a payment", () => {
    expect(text(s.sentences[0]!)).toBe(
      `A atribuit ${formatRon("1572884046.27")} (valoare înregistrată, nu plăți) prin 782 de achiziții directe și 155 de contracte prin proceduri, între 2018 și 2026.`);
    expect(s.sentences[0]).toContainEqual({ text: "1,6 mld. lei", strong: true });
  });
  it("names the largest supplier with its share and the largest subject area", () => {
    expect(text(s.sentences[1]!)).toBe("Cel mai mare furnizor este RER SUD, cu 21% din valoare. Cei mai mulți bani merg la lucrări de construcții (55%).");
    expect(s.sentences[1]).toContainEqual({ text: "RER SUD", href: "/entitati/2044213" });
  });
  it("explains consortium contracts without changing any amount", () => {
    expect(text(s.sentences[2]!)).toBe("30 de contracte au fost atribuite unor consorții: fiecare membru apare cu o parte egală din valoare, iar suma nu se adună de mai multe ori.");
  });
  it("builds two bar lists of at most three rows, shares of the same total", () => {
    expect(s.subjectsTitle).toBe("Pe ce cheltuie");
    expect(s.subjects.map((b) => [b.label, b.shareLabel, b.valueLabel])).toEqual([
      ["Lucrări de construcții", "55%", "864 mil. lei"],
      ["Servicii de evacuare a apelor reziduale, de eliminare a deșeurilor", "23%", "369 mil. lei"],
      ["Fără cod CPV", "<1%", "1.000 lei"],
    ]);
    expect(s.partnersTitle).toBe("De la cine cumpără");
    expect(s.partners[0]).toMatchObject({ label: "RER SUD", href: "/entitati/2044213", shareLabel: "21%", share: 0.2114 });
    expect(s.partners[0]!.consortium).toBeUndefined();
    expect(s.partners[1]!.consortium).toContain("2 contracte în consorțiu");
    expect(s.partners[2]).toMatchObject({ label: "Partener neidentificat", shareLabel: "0%" });
    expect(s.partners[2]!.href).toBeUndefined();
  });
});

describe("“Pe scurt” for a supplier", () => {
  it("uses the supplier wording, a single channel and a single year", () => {
    const s = composeEntitySummary({
      ...authority, role: "supplier", nDa: 15, nContracts: 0, dateFrom: "2025-03-01", dateTo: "2025-11-30",
      totalExact: "3300000", nConsortium: 0,
      divisions: [{ code: "45", name: "Lucrări de construcţii", valueExact: "2211000", n: 9 }],
      partners: [{ partnerId: "7", partnerName: "123456 COMUNA APAHIDA", totalRon: 3267000, pct: 0.99, nConsortium: 0 }],
    })!;
    expect(s.sentences.map(text)).toEqual([
      "A câștigat 3,3 mil. lei (valoare înregistrată, nu plăți) din 15 achiziții directe, în 2025.",
      "Cel mai mare client este COMUNA APAHIDA, cu 99% din valoare. Vinde mai ales lucrări de construcții (67%).",
    ]);
    expect(s.subjectsTitle).toBe("Ce vinde");
    expect(s.partnersTitle).toBe("Cui vinde");
  });
  it("says that a consortium winner's total holds only its estimated part", () => {
    const s = composeEntitySummary({ ...authority, role: "supplier", nDa: 0, nContracts: 1, nConsortium: 1, partners: [] })!;
    expect(text(s.sentences[0]!)).toContain("(valoare înregistrată, nu plăți) dintr-un contract prin procedură, între");
    expect(text(s.sentences.at(-1)!)).toBe("Un contract a fost câștigat în consorțiu: în total intră doar partea estimată a firmei (valoarea împărțită egal între membri).");
    expect(text(composeEntitySummary({ ...authority, role: "supplier", nConsortium: 349 })!.sentences.at(-1)!))
      .toBe("349 de contracte au fost câștigate în consorțiu: în total intră doar partea estimată a firmei (valoarea împărțită egal între membri).");
  });
});

describe("summary edge cases", () => {
  it("is absent without recorded value", () => {
    expect(composeEntitySummary({ ...authority, totalExact: "0" })).toBeNull();
    expect(composeEntitySummary({ ...authority, nDa: 0, nContracts: 0 })).toBeNull();
  });
  it("omits years it cannot read and skips an unidentified top partner", () => {
    const s = composeEntitySummary({ ...authority, dateFrom: null, nConsortium: 0, divisions: [],
      partners: [{ partnerId: "0", partnerName: null, totalRon: 10, pct: 1, nConsortium: 0 }] })!;
    expect(s.sentences.map(text)).toEqual([
      `A atribuit ${formatRon("1572884046.27")} (valoare înregistrată, nu plăți) prin 782 de achiziții directe și 155 de contracte prin proceduri.`,
    ]);
  });
  it("never rounds a partial share up to 100% or a positive one down to 0%", () => {
    expect(shareLabel(0.9987)).toBe(">99%");
    expect(shareLabel(1)).toBe("100%");
    expect(shareLabel(0.004)).toBe("<1%");
    expect(shareLabel(0)).toBe("0%");
    expect(shareLabel(Number.NaN)).toBe("0%");
  });
  it("shows Romanian comma letters and a fallback division name", () => {
    expect(readableCpvName("Lucrări de construcţii şi Ţări Şes")).toBe("Lucrări de construcții și Țări Șes");
    expect(divisionLabel({ code: "99", name: null, valueExact: "1", n: 1 })).toBe("Diviziunea CPV 99");
  });
});
