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
  "../../app/harta/MapExplorer.tsx",
  "../../app/intreaba/AskPanel.tsx",
  "../../app/intreaba/QuestionBuilder.tsx",
  "../../app/intreaba/blocks.tsx",
  // The example questions are the reader's first words for an answer (1 November 2026: "Pe ce cheltuie primăria…").
  "../../app/intreaba/ask-examples.ts",
  "./compile.ts",
  "./pills.ts",
  "../../app/metodologie/MethodologyStory.tsx",
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

  // Owner, 7 November 2026: a firm "contracted" (not "received") a value, and a share "is" with a firm (not "the money
  // went to it"); the pattern is "O firmă are mare parte din valoare".
  it.each(["./../signal-case-words.ts", "../../app/semnale/[id]/page.tsx", "../flags.ts", "../../app/metodologie/MethodologyStory.tsx",
    "../../app/metodologie/MethodologyBehavior.tsx", "../../app/page.tsx", "../risk-presentation.ts", "../../app/semnale/case/CasePage.tsx", "../../app/semnale/CaseMeter.tsx",
    "../../app/semnale/SignalsExplorer.tsx"])("%s says contracted, not received", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const offending = source.split("\n").filter((line) => /\ba primit\b|\bau mers la\b|\bbanii\b[^.„”]{0,80}\bau mers\b/.test(line));
    expect(offending).toEqual([]);
    expect(source.replace(/„O firmă ia mare parte din bani” → „O firmă primește mare parte din bani”|„O firmă primește mare parte din bani” → /g, "")).not.toContain("primește mare parte din bani");
    // UX audit Z6-22 (16 November 2026): a supplier "has" a share, it does not "receive" it; a share is of the value, not "of the money".
    // A rename note („old” → „new”) quotes the old words on purpose.
    expect(source.split("\n").filter((line) => !line.includes("→")).filter((line) => /\b(?:furnizor|firmă|firma)\s+primește\b|\bprimește o parte (?:mare )?din valoare|\bdin banii achizițiilor\b|\bdin bani, la\b/.test(line))).toEqual([]);
  });

  // UX audit Z1-29 (16 November 2026): the home page's question is the site's own verb, „cine câștigă”.
  it("asks who wins the contracts on the home page, not who receives them", () => {
    const source = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Cine câștigă contractele?");
    expect(source).not.toMatch(/primește contractele/);
  });

  it("says the map's values are contracted, not paid (owner, 6 November 2026: lei per inhabitant)", () => {
    const source = readFileSync(new URL("../../app/harta/MapExplorer.tsx", import.meta.url), "utf8");
    expect(source).toContain("Ce au contractat primăriile și consiliile județene");
    expect(source).toContain("Valori contractate, nu plăți");
  });

  it("names the mutual-dependence share by contracted value", () => {
    const method = readFileSync(new URL("../../app/metodologie/MethodologyStory.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
    expect(method).toContain("ponderea lui în valoarea contractată de autoritate");
  });

  it("has the network's groups in the methodology, with their rule and that signals are leads (S4 leftover)", () => {
    const method = readFileSync(new URL("../../app/metodologie/MethodologyStory.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
    expect(method).toContain('id="grupele-retelei"');
    for (const words of ["Noi, cu prima înregistrare a relației din acel an încoace", "Nu mai apar, fără nicio înregistrare din acel an",
      "perioada se aplică doar la Toți", "Semnalele sunt piste, nu dovezi; valorile sunt înregistrate, nu plăți."]) expect(method).toContain(words);
  });
});

// Audit F09: every page that shows totals states the 1 mld. lei contract cap.
describe("value cap disclosure on /harta (audit F09)", () => {
  it("states the contract cap next to the ranking", () => {
    const source = readFileSync(new URL("../../app/harta/MapExplorer.tsx", import.meta.url), "utf8").replace(/\s+/g, " ");
    expect(source).toContain('<Term id="plafoane-totaluri" tip />');
    expect(GLOSSARY["plafoane-totaluri"].text).toContain("contractele din proceduri de cel mult 1 miliard lei. Contractele peste acest plafon sunt separate de totaluri");
  });
});
