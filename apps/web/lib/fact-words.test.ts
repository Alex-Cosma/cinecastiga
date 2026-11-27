import { describe, expect, it } from "vitest";
import { composeFact, factChart, factMoney, factPercent } from "./fact-words";

// „Știați că” (owner, 26 November 2026): the default words of a fact, composed from the numbers of a processing run.
describe("the words of a fact", () => {
  it("writes a share with one decimal under 20% and none from there up", () => {
    expect(factPercent(0.1764)).toBe("17,6%");
    expect(factPercent(0.225)).toBe("23%");
    expect(factPercent(0.9)).toBe("90%");
  });
  it("splits a sum into its figure and its unit", () => {
    expect(factMoney(6_630_000_000)).toEqual({ figure: "6,63", unit: "mld. lei" });
    expect(factMoney(29_392_976.53)).toEqual({ figure: "29,4", unit: "mil. lei" });
    expect(factMoney(8424)).toEqual({ figure: "8.424", unit: "lei" });
  });
  it("says the firms with one public client, with the count behind the share", () => {
    const f = composeFact("firms_one_client", { firms: 34006, one: 5998, share: 5998 / 34006 })!;
    expect(f.figure).toBe("17,6%");
    expect(f.statement).toBe("din firmele cu peste 1 milion de lei din contracte publice au un singur client public.");
    expect(f.context).toBe("5.998 din 34.006 firme: peste 90% din valoarea lor vine de la o singură instituție. În toți anii din arhivă.");
    expect(f.linkHref).toMatch(/^\/intreaba\?spec=/);
  });
  it("puts «de» after a count only where Romanian asks for it", () => {
    expect(composeFact("institutions_one_firm", { institutions: 5409, majority: 354, share: 0.065 })).toMatchObject({ figure: "354", unit: "de instituții" });
    expect(composeFact("most_da", { year: 2025, authorityId: "1", authority: "INSTITUTUL CLINIC FUNDENI", n: 4310, perDay: 12, total: 77321267.58 }))
      .toMatchObject({ figure: "4.310", unit: "achiziții directe", statement: "a făcut Institutul Clinic Fundeni în 2025.", linkHref: "/entitati/1" });
  });
  it("names the largest contract by its title, its parties and its day, and links to it", () => {
    const f = composeFact("largest_contract", { year: 2025, county: null, natId: "77", value: 6_630_000_000, authority: "COMPANIA NATIONALA DE DRUMURI S.A.",
      suppliers: [{ name: "ALFA CONSTRUCT SRL" }, { name: "BETA SA" }], title: "Proiectarea si executia \"Autostrazii\" de test.", signed: "2025-05-14" })!;
    expect(f).toMatchObject({ figure: "6,63", unit: "mld. lei", linkHref: "/contracte/77", linkLabel: "Vezi contractul" });
    expect(f.statement).toBe("e cel mai mare contract din 2025: Proiectarea si executia Autostrazii de test.");
    expect(f.context).toContain("semnat pe 14.05.2025.");
    expect(composeFact("largest_contract", { year: 2025, county: "Cluj", natId: "78", value: 60_000_000, authority: "A", suppliers: [{ name: "B" }], title: "T" })!.statement)
      .toBe("e cel mai mare contract din 2025 al unei instituții din județul Cluj: T.");
  });
  it("says a year's total against the year before, more or less", () => {
    expect(composeFact("year_total", { year: 2025, total: 201.07e9, previous: 164.32e9, change: 201.07 / 164.32 - 1 })!.statement)
      .toBe("s-au contractat în 2025, cu 22% mai mult decât în 2024.");
    expect(composeFact("year_total", { year: 2025, total: 150e9, previous: 164.32e9, change: 150 / 164.32 - 1 })!.statement)
      .toBe("s-au contractat în 2025, cu 8,7% mai puțin decât în 2024.");
  });
  it("never says a payment: an institution contracts", () => {
    for (const recipe of ["firms_one_client", "institutions_one_firm", "top_firms_share", "da_per_day", "most_da", "first_month", "december", "year_total", "one_firm_majority", "single_bidder"]) {
      const f = composeFact(recipe, { year: 2025, firms: 100, one: 10, share: 0.1, institutions: 100, majority: 10, top10: 0.2, top100: 0.5, total: 1e9, n: 1000, perDay: 3, average: 5,
        authority: "A", authorityId: "1", supplier: "B", supplierId: "2", top: 9e8, december: 2e8, previous: 9e8, change: 0.1, known: 10, single: 5 })!;
      expect(`${f.statement} ${f.context ?? ""}`).not.toMatch(/pl[aă]t|cheltui|a primit/i);
    }
  });
  it("draws a year against the one before as two bars, and a share as one bar, from the run's numbers", () => {
    expect(factChart("year_total", { year: 2025, total: 201.07e9, previous: 164.32e9 })).toEqual({
      kind: "two", bars: [{ label: "2024 · 164,32", value: 164.32e9 }, { label: "2025 · 201,07", value: 201.07e9 }],
      says: "164,32 mld. lei în 2024 și 201,07 mld. lei în 2025",
    });
    expect(factChart("firms_one_client", { firms: 34006, one: 5998, share: 5998 / 34006 })).toEqual({ kind: "share", share: 5998 / 34006, label: "5.998 din 34.006 firme, în toți anii din arhivă" });
    // Nothing to compare, or numbers that do not hold a share: no chart.
    expect(factChart("largest_contract", { value: 6.63e9 })).toBeNull();
    expect(factChart("most_da", { n: 10232 })).toBeNull();
    expect(factChart("december", { year: 2024, share: 0 })).toBeNull();
    expect(factChart("top_firms_share", { top10: 1.4, firms: 10 })).toBeNull();
  });
  it("gives nothing for a recipe it does not know", () => {
    expect(composeFact("unknown", {})).toBeNull();
  });
  // The second set of recipes (owner, 27 November 2026).
  it("names a domain in plain words and says its part of the year", () => {
    const d = { year: 2025, cpv2: "33", name: "Echipamente medicale, produse farmaceutice şi produse de îngrijire personală", value: 12_650_000_000, n: 415468, share: 0.063 };
    expect(composeFact("domain_year", d)).toMatchObject({ figure: "12,65", unit: "mld. lei", statement: "s-au contractat în 2025 pentru echipamente medicale și medicamente.",
      linkHref: "/domenii?year=2025&code=33" });
    expect(composeFact("domain_year", { ...d, cpv2: "41", name: "Apă captată şi epurată" })!.statement).toBe("s-au contractat în 2025 pentru apă captată și epurată.");
    expect(factChart("domain_year", d)).toEqual({ kind: "share", share: 0.063, label: "6,3% din tot ce s-a contractat în țară în 2025" });
  });
  it("counts what a signal marks and says it is a lead, not proof", () => {
    const f = composeFact("signal", { code: "fin_tiny_staff", what: "firms", n: 3468, instances: 5879 })!;
    expect(`${f.figure} ${f.unit} ${f.statement}`).toBe("3.468 de firme cu cel mult 5 salariați au câștigat, într-un an, cel puțin 2 milioane de lei din achiziții publice.");
    expect(f.context).toContain("o pistă de verificat, nu o dovadă");
    expect(f.linkHref).toContain("/semnale?tip=fin_tiny_staff");
    expect(composeFact("signal", { code: "unknown_code", n: 500 })).toBeNull();
  });
  it("sets a town hall's value per inhabitant beside the average, to scale", () => {
    const d = { year: 2025, authorityId: "7", authority: "COMUNA BREBU NOU", county: "Caras-Severin", population: 119, value: 7_642_180, perCapita: 64220, average: 1210 };
    const f = composeFact("per_capita_town", d)!;
    expect(`${f.figure} ${f.unit}`).toBe("64.220 lei pe locuitor");
    expect(f.context).toBe("7,6 mil. lei la 119 locuitori, în județul Caraș-Severin. Media primăriilor: 1.210 lei pe locuitor.");
    const chart = factChart("per_capita_town", d);
    expect(chart).toMatchObject({ kind: "two", bars: [{ value: 1210 }, { value: 64220 }] });
  });
  it("calls only the first county of a ranking the largest, and never writes «județul București»", () => {
    const d = { county: "Suceava", share: 0.593, bucharest: 0.107, national: 0.378, end: "top", rank: 2, from: 2018, to: 2026 };
    expect(composeFact("local_firms", d)!.statement).toContain("printre cele mai mari proporții din țară");
    expect(composeFact("local_firms", { ...d, rank: 1 })!.statement).toContain("cea mai mare proporție din țară");
    expect(composeFact("local_firms", { ...d, county: "Ilfov", end: "bottom", rank: 1, bucharest: 0.424 })!.context).toMatch(/^42% a revenit firmelor din București\. /);
    expect(composeFact("largest_contract", { year: 2025, county: "Bucuresti", value: 2e9, title: "Metrou", authority: "METROREX SA", suppliers: [{ name: "X SRL" }], natId: "1" })!.statement)
      .toContain("al unei instituții din București:");
  });
  it("closes a sentence on a firm's name with one full stop", () => {
    const d = { year: 2025, authorityId: "1", authority: "SPITALUL CLINIC JUDETEAN MURES", supplierId: "2", n: 436, value: 28_800_000 };
    expect(composeFact("pair_contracts", { ...d, supplier: "FARMEXIM S.A." })!.statement).toMatch(/: Farmexim S\.A\.$/);
    expect(composeFact("pair_contracts", { ...d, supplier: "MEDIPLUS EXIM" })!.statement).toMatch(/: Mediplus Exim\.$/);
  });
  it("says when one firm's majority happened: the institution's years in the sentence, the firm's years beside the sums", () => {
    const d = { authorityId: "1", authority: "COMUNA EXEMPLU", supplierId: "2", supplier: "FIRMA EXEMPLU S.A.", share: 0.92, total: 234_500_000, top: 215_000_000 };
    const f = composeFact("one_firm_majority", { ...d, from: 2018, to: 2026, years: [2026] })!;
    expect(f.statement).toBe("din valoarea contractată de Comuna Exemplu între 2018 și 2026 a revenit unei singure firme: Firma Exemplu S.A.");
    expect(f.context).toBe("215 mil. lei, contractate în 2026, din 234,5 mil. lei.");
    expect(factChart("one_firm_majority", { ...d, from: 2018, to: 2026, years: [2023, 2019, 2022] })).toMatchObject({ label: "215 mil. lei, contractate în 2019, 2022 și 2023, din 234,5 mil. lei" });
    expect(factChart("one_firm_majority", { ...d, from: 2018, to: 2026, years: [2018, 2019, 2020, 2021] })).toMatchObject({ label: "215 mil. lei, contractate în 2018–2021, din 234,5 mil. lei" });
    // One year in all: the sentence says it, the sums do not repeat it.
    const one = composeFact("one_firm_majority", { ...d, from: 2022, to: 2022, years: [2022] })!;
    expect(one.statement).toMatch(/de Comuna Exemplu în 2022 a revenit/);
    expect(one.context).toBe("215 mil. lei din 234,5 mil. lei.");
    // The firm's years are the institution's whole span: nothing to add.
    expect(composeFact("one_firm_majority", { ...d, from: 2022, to: 2023, years: [2022, 2023] })!.context).toBe("215 mil. lei din 234,5 mil. lei.");
    // Almost all is not written as all.
    expect(composeFact("one_firm_majority", { ...d, share: 0.9983 })!.figure).toBe("99,8%");
    expect(composeFact("one_firm_majority", { ...d, share: 1 })!.figure).toBe("100%");
    // Numbers of a run before the years were kept.
    expect(composeFact("one_firm_majority", d)!.context).toBe("215 mil. lei din 234,5 mil. lei, în toți anii din arhivă.");
  });
  it("says whose value a share of the year is part of", () => {
    const d = { year: 2025, authorityId: "1", authority: "MUNICIPIUL EXEMPLU", value: 5.19e9, n: 1200, share: 0.026 };
    expect(composeFact("biggest_buyer", d)!.context).toBe("2,6% din tot ce s-a contractat în țară în 2025, în 1.200 de înregistrări.");
    expect(factChart("biggest_buyer", d)).toMatchObject({ label: "2,6% din tot ce s-a contractat în țară în 2025" });
  });
  it("writes a day in words and the archive without decimals", () => {
    expect(composeFact("busiest_day_da", { year: 2025, day: "2025-02-14", n: 13905, perDay: 6117 })!.statement).toBe("s-au încheiat într-o singură zi: 14 februarie 2025.");
    expect(composeFact("busiest_day_da", { year: 2025, day: "", n: 1, perDay: 1 })).toBeNull();
    expect(composeFact("archive_value", { from: 2018, to: 2026, value: 1_152_700_000_000 })).toMatchObject({ figure: "1.153", unit: "mld. lei" });
    expect(composeFact("foreign_country", { year: 2025, country: "TR", value: 14.19e9, firms: 16, share: 0.071 })!.statement).toBe("au câștigat în 2025 firme din Turcia.");
    expect(composeFact("foreign_country", { year: 2025, country: "XX", value: 2e9, firms: 1, share: 0.01 })).toBeNull();
  });
});
