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
];
const spendingWords = /cheltui|încasea/i;

describe("value wording (audit F36)", () => {
  it.each(files)("%s labels values as contracted, not spent", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8").replace(/kw: "[^"]*"/g, "");
    const offending = source.split("\n").filter((line) => spendingWords.test(line));
    expect(offending).toEqual([]);
  });

  it("titles the county map with contracted values for both roles", () => {
    const source = readFileSync(new URL("../../app/harta/page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Harta valorilor contractate pe județe");
    expect(source).toContain('aria-label="Hartă a valorilor contractate pe județe"');
  });
});
