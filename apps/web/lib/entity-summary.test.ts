import { describe, expect, it } from "vitest";
import { aboveCapSentence, composeEntitySummary, divisionLabel, readableCpvName, shareLabel, shortTitle, type Segment, type SummaryInput } from "./entity-summary";
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
    expect(text(s.sentences[1]!)).toBe("Cel mai mare furnizor este RER SUD, cu 21% din valoare. Cea mai mare parte din valoare privește lucrări de construcții (55%).");
    expect(s.sentences[1]).toContainEqual({ text: "RER SUD", href: "/entitati/2044213" });
  });
  it("explains consortium contracts without changing any amount", () => {
    expect(text(s.sentences[2]!)).toBe("30 de contracte au fost atribuite unor consorții: fiecare membru apare cu o parte egală estimată din valoare, iar suma nu se adună de mai multe ori.");
  });
  it("builds two bar lists of at most three rows, shares of the same total", () => {
    expect(s.subjectsTitle).toBe("Ce a atribuit");
    expect(s.subjects.map((b) => [b.label, b.shareLabel, b.valueLabel])).toEqual([
      ["Lucrări de construcții", "55%", "864 mil. lei"],
      ["Servicii de evacuare a apelor reziduale, de eliminare a deșeurilor", "23%", "369 mil. lei"],
      ["Fără cod CPV", "<1%", "1.000 lei"],
    ]);
    expect(s.partnersTitle).toBe("Cui a atribuit");
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
      "Cel mai mare client este COMUNA APAHIDA, cu 99% din valoare. Cea mai mare parte din valoare privește lucrări de construcții (67%).",
    ]);
    expect(s.subjectsTitle).toBe("Ce a câștigat");
    expect(s.partnersTitle).toBe("Cine i-a atribuit");
  });
  it("says that a consortium winner's total holds only its estimated part", () => {
    const s = composeEntitySummary({ ...authority, role: "supplier", nDa: 0, nContracts: 1, nConsortium: 1, partners: [] })!;
    expect(text(s.sentences[0]!)).toContain("(valoare înregistrată, nu plăți) dintr-un contract prin procedură, între");
    expect(text(s.sentences.at(-1)!)).toBe("Un contract a fost câștigat în consorțiu: în total intră doar partea estimată a firmei (valoarea împărțită egal între membri).");
    expect(text(composeEntitySummary({ ...authority, role: "supplier", nConsortium: 349 })!.sentences.at(-1)!))
      .toBe("349 de contracte au fost câștigate în consorțiu: în total intră doar partea estimată a firmei (valoarea împărțită egal între membri).");
  });
});

describe("summary wording never overstates the top subject area", () => {
  const withTop = (valueExact: string) => composeEntitySummary({ ...authority, nConsortium: 0,
    divisions: [{ code: "45", name: "Lucrări de construcţii", valueExact, n: 1 }] })!;
  it("says “cea mai mare parte” only above half of the value", () => {
    // total 1.572.884.046,27: half is 786.442.023,135
    expect(text(withTop("786442023.14").sentences[1]!)).toContain("Cea mai mare parte din valoare privește lucrări de construcții (50%).");
    expect(text(withTop("786442023.13").sentences[1]!)).toContain("Cel mai mare domeniu: lucrări de construcții (50%).");
    expect(text(withTop("471865213.88").sentences[1]!)).toContain("Cel mai mare domeniu: lucrări de construcții (30%).");
  });
  it("uses the same rule for a supplier and never speaks of spending", () => {
    const s = composeEntitySummary({ ...authority, role: "supplier", nConsortium: 0,
      divisions: [{ code: "45", name: "Lucrări de construcţii", valueExact: "471865213.88", n: 1 }] })!;
    expect(text(s.sentences[1]!)).toContain("Cel mai mare domeniu: lucrări de construcții (30%).");
    const all = [s, composeEntitySummary(authority)!].flatMap((x) => [...x.sentences.map(text), x.subjectsTitle, x.partnersTitle]).join(" ");
    expect(all).not.toMatch(/cheltu|bani merg|mai ales|plătit/i);
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

describe("contracts above the 1 mld. lei cap", () => {
  // Shaped on Municipiul Cluj-Napoca (Vlad's evidence): metro line I and the TR35 contract.
  const aboveCap = {
    count: 2,
    totalExact: "13790000000.00",
    rows: [
      { natId: "1", title: "Proiectare si executie Magistrala I de metrou si tren metropolitan Cluj-Napoca, Etapa I - sectiune metrou", contractNo: null, valueRonExact: "9060000000.00" },
      { natId: "2", title: "TR35 Proiectare si executie", contractNo: "12", valueRonExact: "4730000000.00" },
    ],
  };
  it("says right after the total that they are left out, with their value, titles and the list", () => {
    const s = composeEntitySummary({ ...authority, aboveCap })!;
    const sentence = s.sentences[1]!;
    expect(text(sentence)).toBe(
      `Separat, 2 contracte de peste 1 mld. lei (${formatRon("13790000000.00")}) nu intră în aceste cifre: `
      + `„Proiectare si executie Magistrala I de metrou si tren metropolitan…” (${formatRon("9060000000.00")}) `
      + `și „TR35 Proiectare si executie” (${formatRon("4730000000.00")}). Vezi lista.`,
    );
    expect(sentence).toContainEqual({ text: "Vezi lista", href: "#peste-plafon" });
  });
  it("counts the ones not named and falls back to the list when no title is known", () => {
    const more = aboveCapSentence({ ...aboveCap, count: 5 })!;
    expect(text(more)).toContain(", plus încă 3 contracte. Vezi lista.");
    const one = aboveCapSentence({ count: 1, totalExact: "1200000000", rows: [{ natId: "9", title: null, contractNo: null, valueRonExact: "1200000000" }] })!;
    expect(text(one)).toBe(`Separat, un contract de peste 1 mld. lei (${formatRon("1200000000")}) nu intră în aceste cifre: vezi lista.`);
    expect(aboveCapSentence({ count: 0, totalExact: "0", rows: [] })).toBeNull();
    expect(aboveCapSentence(undefined)).toBeNull();
    // without such contracts the summary is unchanged
    expect(composeEntitySummary(authority)!.sentences.map(text).join(" ")).not.toContain("Separat");
  });
  it("cuts long titles at a word", () => {
    expect(shortTitle("Scurt")).toBe("Scurt");
    // the sentence quotes the title itself: the title's own quotes and a glued "Contract" go
    expect(shortTitle('Contract"Proiectare și Execuție"')).toBe("Proiectare și Execuție");
    expect(shortTitle('"PROIECTARE SI EXECUȚIE LUCRĂRI: „Drum TransRegio Feleac TR 35”')).toBe("PROIECTARE SI EXECUȚIE LUCRĂRI: Drum TransRegio Feleac TR 35");
    // a word boundary too early in the text is not used: the cut stays near the limit
    expect(shortTitle(`${"a".repeat(30)} ${"b".repeat(60)}`)).toBe(`${"a".repeat(30)} ${"b".repeat(39)}…`);
    expect(shortTitle(`${"a".repeat(50)} ${"b".repeat(60)}`)).toBe(`${"a".repeat(50)}…`);
  });
});
