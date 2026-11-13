import { describe, expect, it } from "vitest";
import type { IntentResult } from "../../lib/intent/types";
import type { AskSpec } from "../../lib/ask/spec";
import { noteClause, titleSearch, understoodLine } from "./intent-line";

/*
 * Enter → the answer, with how the question was understood as one line under
 * its title (owner, 1 November 2026; the 22 October "Enter → results + the
 * interpretation" decision).
 */

const ranking: AskSpec = { block: "table", measure: "value", dim: "supplier", topN: 10, filters: { cpvTerm: "deszapezire", county: "Suceava", yearFrom: 2024, yearTo: 2024 } };
const hall: AskSpec = { ...ranking, filters: { cpvTerm: "deszapezire", uatSiruta: 146593, uatName: "Municipiul Suceava (Suceava)", yearFrom: 2024, yearTo: 2024 } };
const result = (over: { notes?: string[]; placeNote?: string | null; leftover?: string[] } = {}): IntentResult => ({
  spec: ranking,
  sentence: "Ce firme câștigă achizițiile pentru „deszăpezire” făcute de instituțiile publice din județul Suceava, în 2024?",
  problem: null,
  alternatives: [{ kind: "place", label: "Doar primăria Municipiului Suceava", sentence: "Ce firme câștigă … primăria Suceava, în 2024?", spec: hall }],
  interpretation: { notes: over.notes ?? [], placeNote: over.placeNote === undefined ? "„Suceava”: am ales tot județul." : over.placeNote, leftover: over.leftover ?? [] },
} as unknown as IntentResult);

describe("the interpretation line", () => {
  it("says the place assumption in a clause and offers the other reading", () => {
    const line = understoodLine(result(), { spec: ranking, sentence: "…" })!;
    expect(line.notes).toEqual(["am ales tot județul Suceava"]);
    // "Am înțeles: am ales tot județul Suceava · Altfel (1) ›": the menu names the town hall whole.
    expect(line.options.map((o) => o.label)).toEqual(["Doar primăria Municipiului Suceava"]);
    expect(line.ignored).toEqual([]);
  });

  it("offers the first reading back once another was chosen, without the main reading's place note", () => {
    const line = understoodLine(result(), { spec: hall, sentence: "…", label: "Doar primăria Municipiului Suceava" })!;
    expect(line.notes).toEqual([]);
    expect(line.options.map((o) => o.label)).toEqual(["Cum am înțeles la început"]);
  });

  it("keeps the words left out, and has no line when there is nothing to say", () => {
    expect(understoodLine(result({ leftover: ["frumos", "albastru"] }), { spec: ranking, sentence: "…" })!.ignored).toEqual(["frumos", "albastru"]);
    const plain = { ...result({ placeNote: null }), alternatives: [] } as IntentResult;
    expect(understoodLine(plain, { spec: ranking, sentence: "…" })).toBeNull();
  });

  it("searches the titles for the subject, never the verb, with the place and the years (Cisnădie feedback, 13 November 2026)", () => {
    const asked = { ...result(), interpretation: { notes: [], placeNote: null, leftover: [], subjects: [{ matched: { text: "deszăpezire", from: 20, to: 31 } }] } } as unknown as IntentResult;
    expect(titleSearch(asked, ranking)).toEqual({ href: "/cauta?q=desz%C4%83pezire&place=county%3Asuceava&from=2024&to=2024", words: "deszăpezire", where: "județul Suceava", period: "în 2024" });
    expect(titleSearch(asked, hall)).toMatchObject({ href: "/cauta?q=desz%C4%83pezire&place=uat%3A146593&from=2024&to=2024", where: "Suceava" });
    // a line with nothing else to say still offers the title search
    expect(understoodLine({ ...asked, alternatives: [] } as IntentResult, { spec: ranking, sentence: "…" })?.titles?.words).toBe("deszăpezire");
  });

  it("writes the interpreter's notes as clauses after «Am înțeles:», names kept", () => {
    expect(noteClause("Am ales tot Bucureștiul, cu sectoarele.")).toBe("am ales tot Bucureștiul, cu sectoarele");
    expect(noteClause("Am înțeles „cluj” ca Municipiul Cluj-Napoca.")).toBe("„cluj” ca Municipiul Cluj-Napoca");
    expect(noteClause("Arătăm cel mult 50 de rânduri; lista surselor păstrează toată selecția.")).toBe("arătăm cel mult 50 de rânduri; lista surselor păstrează toată selecția");
    expect(noteClause("Dolj este un județ, nu o localitate.")).toBe("Dolj este un județ, nu o localitate");
    expect(noteClause("„Firme mici” = cel mult 49 de angajați, din ultimul bilanț depus; firmele fără bilanț sunt excluse."))
      .toBe("„Firme mici” = cel mult 49 de angajați, din ultimul bilanț depus; firmele fără bilanț sunt excluse");
  });
});
