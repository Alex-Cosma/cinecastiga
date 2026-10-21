import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { runRows, runSpec, uatScopeCaveat } from "./compile";
import { ground } from "./ground";
import type { AskSpec } from "./spec";
import { localAuthorityIdsForUnit, type PopulationMappingRow } from "../peer-population";
import catalog from "../reference/population-rpl2021.json";

const unit = (name: string, county: string) => catalog.units.find((u) => u.name === name && u.county === county)!.siruta;
const vanatoriMH = unit("VÂNĂTORI", "MEHEDINȚI"), vanatoriGL = unit("VÂNĂTORI", "GALAȚI");
const sfGheorgheIL = unit("SFÂNTU GHEORGHE", "IALOMIȚA"), sfGheorgheCV = unit("MUNICIPIUL SFÂNTU GHEORGHE", "COVASNA");
const pitesti = unit("MUNICIPIUL PITEȘTI", "ARGEȘ"), slanic = unit("ORAȘ SLĂNIC-MOLDOVA", "BACĂU");
const luncaIlvei = unit("LUNCA ILVEI", "BISTRIȚA-NĂSĂUD"), patulele = unit("PĂTULELE", "MEHEDINȚI"), gagesti = unit("GĂGEȘTI", "VASLUI");

const row = (id: string, name: string, county: string | null, siruta: number | null): PopulationMappingRow => ({ id, name, county, cui: `4${id}`, siruta });
/** reference.authority_uat rows as seen on the 1 Oct 2026 snapshot (finding F15). */
const rows: PopulationMappingRow[] = [
  // One legacy code for five communes in five counties; only Mehedinți's is its own.
  row("2139010", "COMUNA VANATORI (PRIMARIA VANATORI)", "Mehedinti", vanatoriMH),
  row("2142023", "COMUNA VANATORI (PRIMARIA VANATORI)", "Galati", vanatoriMH),
  row("2140064", "COMUNA VANATORI", "Iasi", vanatoriMH),
  row("2143042", "COMUNA VANATORI", "Mures", vanatoriMH),
  row("2144406", "Comuna Vânători (Primaria Vinatori)", "Vrancea", vanatoriMH),
  // Covasna's municipality pointed at an Ialomița commune.
  row("2146546", "Municipiul Sfantu Gheorghe", "Covasna", sfGheorgheIL),
  // No legacy row: exact name+county recovery.
  row("2146442", "MUNICIPIUL PITESTI", "Arges", null),
  // A town service and a company in the town's county are not its administration.
  row("2144064", "ORASUL SLANIC MOLDOVA", "Bacau", slanic),
  row("2129990", "SPAS SLANIC MOLDOVA", "Bacau", slanic),
  row("1968696", "ANDREI TEHNOMETAL", "Vaslui", gagesti),
  // Two corroborated identities of the same administration are both kept.
  row("2032360", "Comuna Lunca Ilvei", "Bistrita-Nasaud", luncaIlvei),
  row("2140013", "Comunei Lunca Ilvei (Primaria Lunca Ilvei)", "Bistrita-Nasaud", luncaIlvei),
  // The name fallback never adds a second identity beside a corroborated one.
  row("2137074", "Primaria comunei Patulele", "Mehedinti", patulele),
  row("2142681", "COMUNA PATULELE (PRIMARIA PATULELE)", "Mehedinti", null),
];

describe("locality scope of Întreabă (finding F15)", () => {
  it("keeps only authorities whose legacy code is in their own county, and recovers unmapped administrations by exact name+county", () => {
    expect(localAuthorityIdsForUnit(rows, vanatoriMH)).toEqual(["2139010"]);
    expect(localAuthorityIdsForUnit(rows, sfGheorgheIL)).toEqual([]);
    expect(localAuthorityIdsForUnit(rows, pitesti)).toEqual(["2146442"]);
    expect(localAuthorityIdsForUnit(rows, slanic)).toEqual(["2144064"]);
    expect(localAuthorityIdsForUnit(rows, gagesti)).toEqual([]);
    expect(localAuthorityIdsForUnit(rows, luncaIlvei)).toEqual(["2032360", "2140013"]);
    expect(localAuthorityIdsForUnit(rows, patulele)).toEqual(["2137074"]);
  });

  it("never turns a conflicting legacy code into a name guess, and rejects ambiguous or county-less identities", () => {
    // Galați's Vânători and Covasna's Sfântu Gheorghe hold a wrong legacy code: no silent re-mapping.
    expect(localAuthorityIdsForUnit(rows, vanatoriGL)).toEqual([]);
    expect(localAuthorityIdsForUnit(rows, sfGheorgheCV)).toEqual([]);
    const twoCandidates = [row("1", "MUNICIPIUL PITESTI", "Arges", null), row("2", "Primaria Municipiului Pitesti", "Arges", null)];
    expect(localAuthorityIdsForUnit(twoCandidates, pitesti)).toEqual([]);
    expect(localAuthorityIdsForUnit([row("3", "COMUNA VANATORI", null, vanatoriMH)], vanatoriMH)).toEqual([]);
  });
});

function database(legacy: PopulationMappingRow[]) {
  const statements: string[] = [];
  const values: unknown[] = [];
  class Fragment {
    constructor(public text: string) {}
    then(resolve: (value: unknown[]) => unknown) {
      statements.push(this.text);
      if (this.text.includes("to_regclass('reference.authority_uat')")) return Promise.resolve(resolve([{ present: true }]));
      if (this.text.includes("from reference.authority_uat au join core.entities e")) return Promise.resolve(resolve(legacy.filter((r) => r.siruta !== null)));
      if (this.text.includes("null::integer siruta from core.entities e")) return Promise.resolve(resolve(legacy.filter((r) => r.siruta === null)));
      if (this.text.includes("from reference.uat u")) return Promise.resolve(resolve([{ name: "VÂNATORI", county: "mehedinti" }]));
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

const stat = (uatSiruta: number): AskSpec => ({ block: "stat", dataset: "all", measure: "value", filters: { uatSiruta, uatName: "Vânători (Mehedinți)" } });

describe("Întreabă locality filter (finding F15)", () => {
  it("grounds a locality to its strictly associated administration, not to every legacy row on the code", async () => {
    const { sql } = database(rows);
    const grounding = await ground(sql, stat(vanatoriMH).filters);
    expect(grounding.uat).toMatchObject({ siruta: vanatoriMH, authorityIds: ["2139010"], nAuthorities: 1 });
  });

  it("filters statistics and source rows by those ids, with a caveat that says which authorities are included", async () => {
    const db = database(rows);
    const grounding = await ground(db.sql, stat(vanatoriMH).filters);
    const result = await runSpec(db.sql, stat(vanatoriMH), grounding);
    if ("error" in result) throw new Error(result.error);
    const filtered = db.statements.filter((s) => s.includes("d.authority_id = any("));
    expect(filtered.length).toBeGreaterThan(0);
    expect(db.statements.some((s) => s.includes("au.uat_siruta ="))).toBe(false);
    expect(db.values).toContainEqual(["2139010"]);
    const caveat = result.caveats.find((c) => c.startsWith("Localitatea"))!;
    expect(caveat).toContain("doar administrația locală a UAT-ului");
    expect(caveat).toContain("nu și școlile");
    expect(caveat).not.toMatch(/toate cele|o singură autoritate/);
    expect(uatScopeCaveat("București", 1, unit("MUNICIPIUL BUCUREȘTI", "MUNICIPIUL BUCUREȘTI"))).toContain("sectoare");
    expect(uatScopeCaveat("Lunca Ilvei", 2, luncaIlvei)).toContain("cele 2 identități înregistrate ale administrației locale");
    const rowsDb = database(rows);
    const sources = await runRows(rowsDb.sql, stat(vanatoriMH), await ground(rowsDb.sql, stat(vanatoriMH).filters), 0);
    if ("error" in sources) throw new Error(sources.error);
    expect(rowsDb.statements.some((s) => s.includes("d.authority_id = any("))).toBe(true);
    expect(rowsDb.values).toContainEqual(["2139010"]);
  });

  it("discloses an unassociated locality instead of claiming it has no contracting authorities", async () => {
    const db = database(rows);
    const spec: AskSpec = { block: "stat", dataset: "all", measure: "value", filters: { uatSiruta: sfGheorgheIL, uatName: "Sfântu Gheorghe (Ialomița)" } };
    const result = await runSpec(db.sql, spec, await ground(db.sql, spec.filters));
    expect(result).toMatchObject({ error: expect.stringContaining("Nu am putut asocia sigur nicio autoritate contractantă") });
    expect("error" in result && result.error).toContain("nu înseamnă că localitatea nu are achiziții");
    const sources = await runRows(db.sql, spec, await ground(db.sql, spec.filters), 0);
    expect(sources).toMatchObject({ error: expect.stringContaining("Nu am putut asocia sigur") });
  });
});
