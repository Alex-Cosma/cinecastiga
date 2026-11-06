import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { entityYearsFrom, type EntityYear } from "../../../lib/marts";
import { axisLabel, bucharestYear, entityTitle, evidenceWithPeriod, ledgerTotals, niceTop, tipLeft, yearsModel, yearWords } from "./entity-top";

// The entity page's top (owner, 2 November 2026): the risk on its bands, a ledger per channel, the value per year.
const AGNITA: EntityYear[] = [
  { year: 2018, nDa: 783, valueDa: "869546", nCt: 0, valueCt: "0" },
  { year: 2021, nDa: 497, valueDa: "1484822", nCt: 6, valueCt: "2409624" },
  { year: 2026, nDa: 318, valueDa: "878540", nCt: 0, valueCt: "0" },
];

describe("the entity's years", () => {
  it("folds the rows per channel into years and keeps the undated apart, so both add up to the total", () => {
    const { years, undated } = entityYearsFrom([
      { src: "da", y: "2021", n: 497, v: "1484822.10" },
      { src: "contracts", y: "2021", n: 6, v: "2409624" },
      { src: "da", y: "2018", n: 783, v: "869546" },
      { src: "contracts", y: null, n: 2, v: "1000.5" },
    ]);
    expect(years.map((y) => y.year)).toEqual([2018, 2021]);
    expect(years[1]).toEqual({ year: 2021, nDa: 497, valueDa: "1484822.10", nCt: 6, valueCt: "2409624.00" });
    expect(undated).toEqual({ nDa: 0, valueDa: "0", nCt: 2, valueCt: "1000.50" });
    expect(ledgerTotals(years, undated)).toEqual({ nDa: 1280, valueDa: "2354368.10", nCt: 8, valueCt: "2410624.50" });
  });

  it("draws every year from the first to the last, a gap included, on a scale over the bars and the turnover", () => {
    const model = yearsModel(AGNITA, null, 2026)!;
    expect(model.bars.map((b) => b.year)).toEqual([2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(model.bars[1]).toMatchObject({ nDa: 0, total: 0, daPct: 0 });
    // 2021: 3,9 mil. on a 4 mil. scale, split per channel.
    expect(model.bars[3]).toMatchObject({ total: 3894446, daPct: 37.1, ctPct: 60.2, partial: false });
    expect(model.bars.at(-1)!.partial).toBe(true);
    expect(model.ticks).toEqual([{ label: "0", pct: 0 }, { label: "2 mil.", pct: 50 }, { label: "4 mil.", pct: 100 }]);
    expect(model.turnover).toBe(false);
    // A firm's turnover sets the scale when it is larger, and only its years with bars are drawn.
    const firm = yearsModel(AGNITA, [{ year: 2017, value: 1 }, { year: 2021, value: 10_537_507 }], 2026)!;
    expect(firm.ticks.at(-1)!.label).toBe("15 mil.");
    expect(firm.bars.map((b) => b.turnover)).toEqual([null, null, null, 10_537_507, null, null, null, null, null]);
    expect(firm.turnover).toBe(true);
    expect(yearsModel([{ year: 2020, nDa: 0, valueDa: "0", nCt: 0, valueCt: "0" }], null, 2026)).toBeNull();
  });

  it("says a year as its tip does, the numerals with „de” from 20", () => {
    const model = yearsModel(AGNITA, [{ year: 2026, value: 2_000_000 }], 2026)!;
    expect(yearWords(model.bars[3]!)).toEqual({ head: "2021 · 3,9 mil. lei", da: "497 de achiziții directe · 1,5 mil. lei", ct: "6 contracte · 2,4 mil. lei", turnover: null });
    expect(yearWords(model.bars.at(-1)!)).toMatchObject({ head: "2026 (parțial) · 878.540 lei", ct: null, turnover: "cifră de afaceri · 2 mil. lei" });
  });

  it("says a signal's one-year period once, at the head of its line", () => {
    const label = "Perioada calculului: 2022";
    expect(evidenceWithPeriod(label, "2022", "2022: 36% din valoarea achizițiilor directe …")).toBe("2022: 36% din valoarea achizițiilor directe …");
    expect(evidenceWithPeriod("Perioada calculului: 2021", "2021", "Diferența față de prag nu poate fi calculată.")).toBe("2021: diferența față de prag nu poate fi calculată.");
    expect(evidenceWithPeriod("Perioada calculului: 2021", "2021", "CPV 3312 · licitație")).toBe("2021: CPV 3312 · licitație");
    // A named source or the whole archive keeps its label.
    expect(evidenceWithPeriod("Perioada calculului: 2021 (bilanț)", "2021", "2021: x")).toBe("Perioada calculului: 2021 (bilanț) · 2021: x");
    expect(evidenceWithPeriod("Întreaga perioadă disponibilă la calcul", "all", "Furnizorul principal: 40%")).toBe("Întreaga perioadă disponibilă la calcul · Furnizorul principal: 40%");
  });

  it("opens a year's tip under its column, inside the plot's width", () => {
    // 9 years on 450 px, a 200 px tip: centred on the 4th, then held at each edge.
    expect(tipLeft(3, 9, 450, 200)).toBe(75);
    expect(tipLeft(0, 9, 450, 200)).toBe(0);
    expect(tipLeft(8, 9, 450, 200)).toBe(250);
    expect(tipLeft(4, 9, 150, 200)).toBe(0);
  });

  it("names each entity in its browser title", () => {
    expect(entityTitle("BUG FOREST SRL", "supplier", "Vaslui")).toBe("BUG FOREST SRL · furnizor, Vaslui");
    expect(entityTitle("SPITALUL ORASENESC AGNITA", "authority", null)).toBe("SPITALUL ORASENESC AGNITA · autoritate");
  });

  it("keeps a short axis and a round scale", () => {
    expect([niceTop(3_894_446), niceTop(10_537_507), niceTop(870_000), niceTop(0)]).toEqual([4_000_000, 15_000_000, 1_000_000, 1]);
    expect([axisLabel(0), axisLabel(750_000), axisLabel(7_500_000), axisLabel(2_000_000_000)]).toEqual(["0", "750 mii", "7,5 mil.", "2 mld."]);
    expect(bucharestYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
  });
});

describe("the entity page's top", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./entity.css", import.meta.url), "utf8");
  it("drops the old cards and „Cum se formează?” from the top; the risk keeps its (?) and its group line", () => {
    expect(page).not.toMatch(/stat-grid ent-stats|className="hint">Cum se formează\?/);
    expect(page).toContain('<div className={`ent-top${years ? "" : " ent-top--no-years"}`}>');
    expect(page).toMatch(/<Term tip id="scor-risc" \/>/);
    expect(page).toContain("riskPeerWords(peerLine)");
    // Its explanation opens under its line, as wide as the region (critique 2 November 2026: 116 px, cut).
    expect(css).toContain(".ent-top .ent-tip{position:static}");
    expect(css).toContain(".ent-top .ent-risk-read,.ent-top .ent-ledger tbody th{position:relative}");
  });

  it("never cuts its text short: a signal's rule spans its card, names, objects and numbers wrap whole", () => {
    expect(css).toContain(".method-head .mh-rule>.mh-desc{margin:6px 0 2px;max-width:none;");
    expect(css).toContain(".ent-tx td.c-cpv,.ent-tx td.c-party{white-space:normal;overflow:visible;text-overflow:clip");
    expect(css).toContain(".ent-partners .bar-label{white-space:normal;overflow:visible;text-overflow:clip");
    expect(css).not.toMatch(/\.ent-tx \.c-no\{[^}]*text-overflow:ellipsis/);
  });

  it("lists the tabs in the page's order and gives the page its own title", () => {
    const tabs = page.slice(page.indexOf("<SectionNav"), page.indexOf("/>", page.indexOf("<SectionNav")));
    const at = ['"top"', '"conducere", label: "Conducere"', '"parteneri"', '"achizitii"', '"Titular"'].map((s) => tabs.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(page).toContain("export async function generateMetadata(");
  });

  it("orders the sections as the tabs: summary, partners, acquisitions (owner, 4 November 2026)", () => {
    const at = ['id="top"', 'id="parteneri"', 'id="achizitii"'].map((s) => page.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("has no signals section: the score's criteria are on the top's bar, the signals page among the analyses (owner, 6 November 2026)", () => {
    expect(page).not.toContain('id: "semnale"');
    expect(page).toContain("<ScoreSignals ");
    expect(page).toContain('label: "Semnale"');
    expect(page.indexOf('label: "Semnale"')).toBeLessThan(page.indexOf('label: "Legături"'));
    // Its links open each pattern's page on /semnale.
    expect(readFileSync(new URL("./ScoreSignals.tsx", import.meta.url), "utf8")).toContain("href={signalsHref(code)}");
    // What only the section read is no longer read.
    for (const gone of ["getEntityPartners(", "getEntityMonthly(", "getEntityFlagEvidence(", "getEntityFlagRowCounts(", "getSplitPairsPaged("]) expect(page).not.toContain(gone);
  });

  it("keeps ?rol= only for an entity that both buys and sells", () => {
    expect(page).toContain('rol: bothRoles ? rolParam : undefined');
    expect(page).toContain('{!bothRoles && sp["rol"] !== undefined && <DropRolParam />}');
    expect(page).toContain('const rolQuery = bothRoles ? `?rol=${rolParam}` : "";');
    expect(page).toContain('/legaturi${rolQuery}');
    expect(page).toContain('/comparatii${rolQuery}');
  });

  it("keeps two actions in the header and links each analysis once, beside the tabs (owner, 4 November 2026)", () => {
    expect(page).toContain('label="Urmărește" hint="Urmărește modificările" arrow={false}');
    expect(page).toContain("<ClipButton kind=\"entity\" refId={id} label={cleanName(row.name)} primary />");
    expect(page).toContain("...views,");
    expect(page).not.toContain("🩻");
    expect(page).toContain('className="ehead-reg"');
  });

  it("lists each channel with its records, its value and its link, then the recorded total", () => {
    for (const words of ["Achiziții directe&nbsp;→", "Contracte prin proceduri&nbsp;→", "Total înregistrat", "Înregistrări", "Valoare"]) expect(page).toContain(words);
    expect(page).toContain('<Term tip id="valoare-inregistrata" />');
    expect(page).toContain("{formatRon(Number(txCounts.valueExact))}");
  });

  it("centres each region in the strip and never colours the score's figure with a pill's background", () => {
    expect(css).toMatch(/\.ent-top>\*\{[^}]*display:grid;align-content:center\}/);
    expect(page).toContain('<b data-band={hasRiskScore ? band : "none"}>');
    expect(css).not.toMatch(/\.ent-risk-read>b\.risk-/);
  });
});
