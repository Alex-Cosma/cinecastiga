import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Audit F36: contract amounts are recorded/contracted values, not payments.
 * Visible labels on /harta and in Întreabă called them "cheltuieli" / "s-a
 * cheltuit" (the /harta h1 read "Harta cheltuielilor pe județe" while its own
 * subtitle said "Valoarea contractată"). Builder `kw` strings are search
 * synonyms for what a visitor may type, not labels, so they are ignored.
 */
const files = [
  "../../app/harta/page.tsx",
  "../../app/intreaba/AskPanel.tsx",
  "../../app/intreaba/Builder.tsx",
  "../../app/intreaba/blocks.tsx",
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
    expect(source).toContain("Harta valorilor contractate pe județe");
    expect(source).toContain('aria-label="Hartă a valorilor contractate pe județe"');
  });

  it("names the monthly DA chart and the mutual-dependence share by contracted value", () => {
    const chart = readFileSync(new URL("../../app/entitati/[id]/YearMiniChart.tsx", import.meta.url), "utf8");
    expect(chart).toContain("aria-label={`Valoarea lunară a achizițiilor directe, ${year}`}");
    const method = readFileSync(new URL("../../app/metodologie/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
    expect(method).toContain("ponderea lui în valoarea contractată de autoritate");
  });
});

// Audit F09: every page that shows totals states the 1 mld. lei contract cap.
describe("value cap disclosure on /harta (audit F09)", () => {
  it("states the contract cap next to the county totals", () => {
    const source = readFileSync(new URL("../../app/harta/page.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
    expect(source).toContain("contracte din proceduri de cel mult 1 miliard lei; contractele peste acest plafon sunt separate de totaluri");
  });
});
