import { describe, expect, it } from "vitest";
import { GLOSSARY } from "../glossary";
import { readFileSync } from "node:fs";

/**
 * Audit F36: contract amounts are recorded/contracted values, not payments.
 * Visible labels on /harta and in Întreabă called them "cheltuieli" / "s-a
 * cheltuit" (the /harta h1 read "Harta cheltuielilor pe județe" while its own
 * subtitle said "Valoarea contractată"). `kw` strings are search
 * synonyms for what a visitor may type, not labels, so they are ignored.
 */
const files = [
  "../../app/harta/page.tsx",
  "../../app/intreaba/AskPanel.tsx",
  "../../app/intreaba/QuestionBuilder.tsx",
  "../../app/intreaba/blocks.tsx",
  // The example questions are the reader's first words for an answer (1 November 2026: "Pe ce cheltuie primăria…").
  "../../app/intreaba/ask-examples.ts",
  "./compile.ts",
  "./pills.ts",
  "../../app/entitati/[id]/YearMiniChart.tsx",
  "../../app/metodologie/page.tsx",
];
const spendingWords = /cheltui|încasea/i;
// Saying what a value is not ("nu o cheltuială", "nu cheltuială zero") is the intended caveat.
const negated = /\bnu (?:o |înseamnă )?cheltui\p{L}*/giu;

describe("value wording (audit F36)", () => {
  it.each(files)("%s labels values as contracted, not spent", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8").replace(/kw: "[^"]*"/g, "").replace(negated, "");
    const offending = source.split("\n").filter((line) => spendingWords.test(line));
    expect(offending).toEqual([]);
  });

  it("titles the county map with contracted values for both roles", () => {
    const source = readFileSync(new URL("../../app/harta/page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Valori contractate pe județe");
    expect(source).toContain('aria-label="Hartă a valorilor contractate pe județe"');
  });

  it("names the monthly DA chart and the mutual-dependence share by contracted value", () => {
    const chart = readFileSync(new URL("../../app/entitati/[id]/YearMiniChart.tsx", import.meta.url), "utf8");
    expect(chart).toContain("aria-label={`Valoarea lunară a achizițiilor directe, ${year}`}");
    const method = readFileSync(new URL("../../app/metodologie/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
    expect(method).toContain("ponderea lui în valoarea contractată de autoritate");
  });

  it("has the network's groups in the methodology, with their rule and that signals are leads (S4 leftover)", () => {
    const method = readFileSync(new URL("../../app/metodologie/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
    expect(method).toContain('id="grupele-retelei"');
    for (const words of ["Noi, cu prima înregistrare a relației din acel an încoace", "Nu mai apar, fără nicio înregistrare din acel an",
      "perioada se aplică doar la Toți", "Semnalele sunt piste, nu dovezi; valorile sunt înregistrate, nu plăți."]) expect(method).toContain(words);
  });
});

// Audit F09: every page that shows totals states the 1 mld. lei contract cap.
describe("value cap disclosure on /harta (audit F09)", () => {
  it("states the contract cap next to the county totals", () => {
    const source = readFileSync(new URL("../../app/harta/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
    expect(source).toContain('<Term id="plafoane-totaluri" tip />');
    expect(GLOSSARY["plafoane-totaluri"].text).toContain("contractele din proceduri de cel mult 1 miliard lei. Contractele peste acest plafon sunt separate de totaluri");
  });
});
