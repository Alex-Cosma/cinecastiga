import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { runRows, runSpec } from "./compile";
import { ground, splitSynonymRows, type Grounding, type SynonymRow } from "./ground";
import type { AskSpec } from "./spec";
import { RETIRED_TERMS, retiredTerm, retiredText } from "./retired-terms";

/** A tagged-template stand-in that records every statement and bound value. */
function database() {
  const statements: string[] = [];
  const values: unknown[] = [];
  class Fragment {
    constructor(public text: string) {}
    then(resolve: (value: unknown[]) => unknown) {
      statements.push(this.text);
      return Promise.resolve(resolve([]));
    }
  }
  const tag = ((chunks: TemplateStringsArray | string, ...params: unknown[]) => typeof chunks === "string" ? new Fragment(chunks) : new Fragment(chunks.reduce((query, text, i) => {
    const value = params[i];
    if (i >= params.length) return query + text;
    if (value instanceof Fragment) return query + text + value.text;
    values.push(value);
    return query + text + `?${values.length}`;
  }, ""))) as unknown as DbSql;
  Object.assign(tag, {
    array: (items: unknown[]) => { values.push(items); return new Fragment(`?${values.length}`); },
    begin: async (_options: string, fn: (tx: DbSql) => Promise<unknown>) => fn(tag),
    unsafe: async () => [],
  });
  return { sql: tag, statements, values };
}

const row = (term: string, cpv_prefix: string, exclude = false, note: string | null = null): SynonymRow => ({ term, cpv_prefix, note, exclude });

describe("synonym exclusions", () => {
  it("splits include and exclude rows; an exclusion counts only inside an included sub-tree", () => {
    expect(splitSynonymRows([row("medicamente", "33600000"), row("medicamente", "33696000", true), row("medicamente", "33682000", true), row("medicamente", "45000000", true)]))
      .toEqual({ prefixes: ["336"], excludePrefixes: ["33682", "33696"], notes: [] });
    // another picked term that includes the excluded sub-tree keeps it
    expect(splitSynonymRows([row("medicamente", "33600000"), row("medicamente", "33696000", true), row("reactivi", "33696000")]).excludePrefixes).toEqual([]);
    // notes come from included rows only
    expect(splitSynonymRows([row("x", "45000000", false, "Notă."), row("x", "45200000", true, "ignorată")]).notes).toEqual(["Notă."]);
  });

  it("removes the excluded sub-trees from statistics, source rows and the displayed SQL, and says so", async () => {
    const grounding: Grounding = { cpv: { term: "medicamente", prefixes: ["336"], matchedNames: ["Produse farmaceutice (33600000-6)"], method: "synonym", notes: [], excludePrefixes: ["33682", "33696"], excludedNames: ["Dale de cauciuc (33682000-1)", "Reactivi şi produse de contrast (33696000-5)"] } };
    const spec: AskSpec = { block: "stat", dataset: "all", measure: "value", filters: { cpvTerm: "medicamente" } };
    const db = database();
    const result = await runSpec(db.sql, spec, grounding);
    if ("error" in result) throw new Error(result.error);
    expect(db.statements.some((s) => /not \(d\.cpv_code like \?\d+ or d\.cpv_code like \?\d+\)/.test(s))).toBe(true);
    expect(db.values).toEqual(expect.arrayContaining(["336%", "33682%", "33696%"]));
    expect(result.displaySql).toContain("not (cpv_code like '33682%' or cpv_code like '33696%')");
    expect(result.caveats).toContain("Din „medicamente” nu sunt numărate: Dale de cauciuc (33682000-1); Reactivi şi produse de contrast (33696000-5).");
    const rows = database();
    const sources = await runRows(rows.sql, spec, grounding, 0);
    if ("error" in sources) throw new Error(sources.error);
    expect(rows.statements.some((s) => s.includes("not (d.cpv_code like"))).toBe(true);
    expect(rows.values).toEqual(expect.arrayContaining(["33696%"]));
  });

  it("never guesses a retired word: saved links get the choices instead of a fuzzy match", async () => {
    for (const term of ["mese", "lucrari", "Lucrări", "programe", "mesele", "Lucrările", "programelor", "lucrari de", "mese si"]) {
      const db = database();
      const grounding = await ground(db.sql, { cpvTerm: term });
      expect(grounding.cpv, term).toMatchObject({ prefixes: [], method: "none", retired: expect.objectContaining({ message: expect.any(String) }) });
      // no trigram query against the catalogue
      expect(db.statements.some((s) => s.includes("similarity(")), term).toBe(false);
      const result = await runSpec(db.sql, { block: "stat", dataset: "all", measure: "value", filters: { cpvTerm: term } }, grounding);
      expect("error" in result && result.error, term).toContain("Poți alege:");
    }
    const mese = await runSpec(database().sql, { block: "stat", dataset: "all", measure: "value", filters: { cpvTerm: "mese" } }, await ground(database().sql, { cpvTerm: "mese" }));
    expect("error" in mese && mese.error).toBe("„Mese” poate însemna masa servită sau mobilierul. Alege la care te gândești. Poți alege: „catering (mese servite)”, „mobilier: mese”.");
  });

  it("grounds normally when a real subject stands next to the retired word, and never matches other words", async () => {
    for (const term of ["lucrari de pavare", "lucrari de instalatii electrice", "programe de formare", "mese si scaune", "meserii", "mesaje", "mesager"]) {
      const grounding = await ground(database().sql, { cpvTerm: term });
      expect(grounding.cpv?.retired, term).toBeUndefined();
    }
    expect(retiredTerm("meserii")).toBeNull();
    expect(retiredTerm("mesele")?.forms).toContain("meselor");
    expect(retiredText("lucrarile de")).toBe(RETIRED_TERMS["lucrari"]);
    expect(retiredText("lucrari de pavare")).toBeNull();
  });

  it("leaves groundings stored before exclusions unchanged", async () => {
    const db = database();
    const result = await runSpec(db.sql, { block: "stat", dataset: "all", measure: "value", filters: { cpvTerm: "medicamente" } }, { cpv: { term: "medicamente", prefixes: ["336"], matchedNames: [], method: "synonym" } });
    if ("error" in result) throw new Error(result.error);
    expect(db.statements.some((s) => s.includes("not (d.cpv_code like"))).toBe(false);
    expect(result.caveats.some((c) => c.includes("nu sunt numărate"))).toBe(false);
  });
});
