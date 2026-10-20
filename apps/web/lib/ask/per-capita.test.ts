import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { runRows, runSpec } from "./compile";
import { readPerCapitaPopulations } from "./per-capita";
import type { AskSpec } from "./spec";
import { officialUnitPopulation } from "../peer-population";
import catalog from "../reference/population-rpl2021.json";

const unit = (name: string, county: string) => catalog.units.find((u) => u.name === name && u.county === county)!;
const bechet = unit("ORAȘ BECHET", "DOLJ"), corabia = unit("ORAȘ CORABIA", "OLT"), slanic = unit("ORAȘ SLĂNIC-MOLDOVA", "BACĂU");

/** Legacy authority_uat rows as seen on 1 Oct 2026 (entity ids from finding F05). */
const legacyMappings = [
  { id: "2139832", name: "ORAS BECHET", county: "Dolj", cui: "4554360", siruta: bechet.siruta },
  // Sector subsidiaries and the sector primary carried the whole sector population.
  { id: "2129126", name: "COMPANIA DE INVESTITII SI DEZVOLTARE SECTOR 1 SA", county: "Bucuresti", cui: "40000001", siruta: -1 },
  { id: "2144029", name: "SECTORUL 4 BUCURESTI", county: "Bucuresti", cui: "4283864", siruta: -4 },
  // A Dâmbovița administration wrongly mapped to an Olt town; a social service mapped to its town.
  { id: "900000001", name: "COMUNA CORABIA (PRIMARIA COBIA)", county: "Dambovita", cui: "40000002", siruta: corabia.siruta },
  { id: "900000002", name: "SPAS SLANIC MOLDOVA", county: "Bacau", cui: "40000003", siruta: slanic.siruta },
];

function database(rankedRows: unknown[] = []) {
  const statements: string[] = [];
  const values: unknown[] = [];
  class Fragment {
    constructor(public text: string) {}
    then(resolve: (value: unknown[]) => unknown) {
      statements.push(this.text);
      if (this.text.includes("to_regclass('reference.authority_uat')")) return Promise.resolve(resolve([{ present: true }]));
      if (this.text.includes("from reference.authority_uat au join core.entities e")) return Promise.resolve(resolve(legacyMappings));
      if (this.text.includes("unnest(")) return Promise.resolve(resolve(rankedRows));
      if (this.text.includes("from marts.entity_flags ef")) return Promise.resolve(resolve([
        { entity_id: "2139832", name_display: "ORAS BECHET", county: "Dolj", role: "authority", n_das: 30, total_ron: "100", cri: "0.5", n_flags: 1, flags: ["da_split"] },
      ]));
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

const perCapita: AskSpec = { block: "table", dataset: "all", dim: "authority", measure: "value_per_capita", topN: 10, filters: {} };

describe("per-capita denominators (finding F05)", () => {
  it("use the RPL 2021 catalog and the strict peer join, never sector institutions or conflicting mappings", async () => {
    const result = await readPerCapitaPopulations(database().sql);
    expect(result.ids).toEqual(["2139832"]);
    expect(result.populations).toEqual([4355]);
    expect(result).toMatchObject({ local: 1, county: 0 });
  });

  it("ranks by the official population and states the real source, date and count", async () => {
    const db = database([{ id: "2139832", nm: "ORAS BECHET", co: "Dolj", v: "33367000", n: "5", pop: "4355" }]);
    const result = await runSpec(db.sql, perCapita, {});
    if ("error" in result) throw new Error(result.error);
    expect(result.data).toMatchObject({ block: "table", rows: [{ entityId: "2139832", population: 4355 }] });
    const ranking = db.statements.find((s) => s.includes("unnest("))!;
    expect(ranking).not.toContain("entity_profile");
    expect(db.values).toContainEqual(["2139832"]);
    expect(db.values).toContainEqual([4355]);
    const caveat = result.caveats.find((c) => c.startsWith("Pe locuitor"))!;
    expect(caveat).toContain("1 decembrie 2021");
    expect(caveat).toContain(catalog.version);
    expect(caveat).toContain("primării: 1 ");
    expect(caveat).toContain("consilii județene: 0 ");
    expect(result.caveats.join(" ")).not.toMatch(/5\.575|recensământ 2021|populație estimată/);
  });

  it("restricts the source rows to the same administrations as the ranking", async () => {
    const db = database();
    const result = await runRows(db.sql, perCapita, {}, 0);
    if ("error" in result) throw new Error(result.error);
    const query = db.statements.find((s) => s.includes("group by d.state"))!;
    expect(query).toContain("d.authority_id = any(");
    expect(query).not.toContain("population > 0");
    expect(db.values).toContainEqual(["2139832"]);
  });

  it("shows only the official population on authority cards", async () => {
    const result = await runSpec(database().sql, { block: "entity_card", dim: "authority", measure: "value", filters: {} }, {});
    if ("error" in result) throw new Error(result.error);
    expect(result.data).toMatchObject({ block: "entity_card", card: { population: 4355 } });
    expect(result.caveats.join(" ")).toContain("1 decembrie 2021");
  });

  it("locality picker population comes from the catalog, corroborated by county", () => {
    expect(officialUnitPopulation(bechet.siruta, "Dolj")).toBe(4355);
    expect(officialUnitPopulation(bechet.siruta, "Olt")).toBeNull();
    // Legacy reference.uat stored 0 for Orăștie; RPL 2021 has its resident total.
    const orastie = unit("MUNICIPIUL ORĂȘTIE", "HUNEDOARA");
    expect(officialUnitPopulation(orastie.siruta, "Hunedoara")).toBe(orastie.population);
    expect(orastie.population).toBeGreaterThan(0);
  });
});
