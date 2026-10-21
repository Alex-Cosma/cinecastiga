import { describe, expect, it } from "vitest";
import type { DbSql } from "@seap/db";
import { runRows, runSpec } from "./compile";
import { ground } from "./ground";
import { readPerCapitaPopulations } from "./per-capita";
import type { AskSpec } from "./spec";
import { localAuthorityIdsForUnit, officialUnitPopulation, sectorSuggestions, sectorTownHallPopulations, uniquePopulationMappings, type PopulationMappingRow } from "../peer-population";
import catalog from "../reference/population-rpl2021.json";

const unit = (name: string, county: string) => catalog.units.find((u) => u.name === name && u.county === county)!;
const bechet = unit("ORAȘ BECHET", "DOLJ"), corabia = unit("ORAȘ CORABIA", "OLT"), slanic = unit("ORAȘ SLĂNIC-MOLDOVA", "BACĂU");
const bucuresti = unit("MUNICIPIUL BUCUREȘTI", "MUNICIPIUL BUCUREȘTI");
const sector = (n: number) => unit(`BUCUREȘTI SECTORUL ${n}`, "MUNICIPIUL BUCUREȘTI");

/** Legacy authority_uat rows as seen on 1 Oct 2026 (entity ids from finding F05). */
const legacyMappings: PopulationMappingRow[] = [
  { id: "2139832", name: "ORAS BECHET", county: "Dolj", cui: "4554360", siruta: bechet.siruta },
  // Sector subsidiaries carried the whole sector population on the sector's synthetic code.
  { id: "2129126", name: "COMPANIA DE INVESTITII SI DEZVOLTARE IN SANATATE SI DOMENII DE INTERES PUBLIC-PRIVAT SECTOR1 S.A", county: "Bucuresti", cui: "40311936", siruta: -1 },
  { id: "2144505", name: "POLITIA LOCALA SECTOR 1", county: "Bucuresti", cui: "17182756", siruta: -1 },
  // Sector town halls (owner decision F05) and the city on its own synthetic code.
  { id: "2146321", name: "Sector 1 (Sectorul 1 al municipiului Bucuresti)", county: "Bucuresti", cui: "4505359", siruta: -1 },
  { id: "2144029", name: "SECTOR 4 (PRIMARIA SECTORULUI 4 BUCURESTI)", county: "Bucuresti", cui: "4316422", siruta: -4 },
  { id: "2144903", name: "MUNICIPIUL BUCURESTI", county: "Bucuresti", cui: "4267117", siruta: -9 },
  { id: "2161655", name: "ASOCIATIA DE DEZVOLTARE INTERCOMUNITARA PENTRU GESTIONAREA INTEGRATA A DESEURILOR MUNICIPALE IN MUNICIPIUL BUCURESTI", county: null, cui: "46199077", siruta: -9 },
  // A sector name that names two sectors, and a sector name on another sector's code.
  { id: "900000003", name: "SECTOR 2 (PRIMARIA SECTORULUI 3 BUCURESTI)", county: "Bucuresti", cui: "40000004", siruta: -2 },
  { id: "900000004", name: "Sectorul 5 al Municipiului Bucuresti", county: "Bucuresti", cui: "40000005", siruta: -6 },
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
    // Bechet, Sector 4 town hall, Primăria Municipiului București (whole city), Sector 1 town hall.
    expect(result.ids).toEqual(["2139832", "2144029", "2144903", "2146321"]);
    expect(result.populations).toEqual([4355, sector(4).population, bucuresti.population, sector(1).population]);
    expect(result).toMatchObject({ local: 2, sector: 2, county: 0 });
  });

  it("ranks by the official population and states the real source, date and count", async () => {
    const db = database([{ id: "2139832", nm: "ORAS BECHET", co: "Dolj", v: "33367000", n: "5", pop: "4355" }]);
    const result = await runSpec(db.sql, perCapita, {});
    if ("error" in result) throw new Error(result.error);
    expect(result.data).toMatchObject({ block: "table", rows: [{ entityId: "2139832", population: 4355 }] });
    const ranking = db.statements.find((s) => s.includes("unnest("))!;
    expect(ranking).not.toContain("entity_profile");
    expect(db.values).toContainEqual(["2139832", "2144029", "2144903", "2146321"]);
    expect(db.values).toContainEqual([4355, 268018, 1716961, 217367]);
    const caveat = result.caveats.find((c) => c.startsWith("Pe locuitor"))!;
    expect(caveat).toContain("1 decembrie 2021");
    expect(caveat).toContain(catalog.version);
    expect(caveat).toContain("primării: 2 ");
    expect(caveat).toContain("primării de sector din București: 2 (populația propriului sector)");
    expect(caveat).toContain("Primăria Municipiului București se împarte la populația întregului oraș");
    expect(caveat).toContain("consilii județene: 0 ");
    expect(caveat).not.toContain("Sectoarele Bucureștiului");
    expect(result.caveats.join(" ")).not.toMatch(/5\.575|recensământ 2021|populație estimată/);
  });

  it("restricts the source rows to the same administrations as the ranking", async () => {
    const db = database();
    const result = await runRows(db.sql, perCapita, {}, 0);
    if ("error" in result) throw new Error(result.error);
    const query = db.statements.find((s) => s.includes("group by d.state"))!;
    expect(query).toContain("d.authority_id = any(");
    expect(query).not.toContain("population > 0");
    expect(db.values).toContainEqual(["2139832", "2144029", "2144903", "2146321"]);
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

describe("București sector town halls (owner decision F05, 21 October 2026)", () => {
  const sectorRows = legacyMappings.filter((r) => r.county === "Bucuresti" || r.county === null);

  it("give only the sector's own town hall that sector's population, and keep sectors out of the peer index", () => {
    const sectors = sectorTownHallPopulations(sectorRows);
    expect([...sectors.keys()].sort()).toEqual(["2144029", "2146321"]);
    expect(sectors.get("2146321")).toMatchObject({ value: 217367, siruta: sector(1).siruta, level: "sector", catalogVersion: catalog.version });
    expect(sectors.get("2144029")).toMatchObject({ value: 268018, siruta: sector(4).siruta });
    // Population peers keep sectors out of the automatic cohort; the city keeps the whole city.
    const peers = uniquePopulationMappings(sectorRows);
    expect([...peers.keys()]).toEqual(["2144903"]);
    expect(peers.get("2144903")).toMatchObject({ value: 1716961, level: "local" });
  });

  it("reject subordinate institutions, conflicting numbers or codes, other counties and two candidates for one sector", () => {
    const row = (name: string, siruta: number | null, county: string | null = "Bucuresti", id = "1"): PopulationMappingRow => ({ id, name, county, cui: "4000000", siruta });
    const one = (r: PopulationMappingRow) => [...sectorTownHallPopulations([r]).values()][0]?.value ?? null;
    expect(one(row("SECTORUL 6 AL MUNICIPIULUI BUCURESTI", -6))).toBe(324994);
    expect(one(row("Sectorul 2 al Municipiului Bucuresti", null))).toBe(291557);
    expect(sectorTownHallPopulations([row("Sectorul 2 al Municipiului Bucuresti", null)]).get("1")).toMatchObject({ mappingMethod: "exact_name_county" });
    expect(one(row("Primăria Sectorului 3", sector(3).siruta))).toBe(374737);
    expect(one(row("Sector 5 (Primaria Sectorului 5 Bucuresti)", -5))).toBe(240288);
    expect(one(row("DIRECTIA GENERALA DE POLITIE LOCALA SECTOR 6", -6))).toBeNull();
    expect(one(row("CLUBUL COPIILOR SECTOR 6", -6))).toBeNull();
    expect(one(row("Sectorul 6 Directia de Asistenta Sociala", -6))).toBeNull();
    expect(one(row("SECTORUL 6 AL MUNICIPIULUI BUCURESTI", -9))).toBeNull();
    expect(one(row("SECTORUL 6 AL MUNICIPIULUI BUCURESTI", bucuresti.siruta))).toBeNull();
    expect(one(row("SECTORUL 6 AL MUNICIPIULUI BUCURESTI", -6, "Ilfov"))).toBeNull();
    expect(one(row("SECTORUL 6 AL MUNICIPIULUI BUCURESTI", -6, null))).toBeNull();
    expect(one({ ...row("SECTORUL 6 AL MUNICIPIULUI BUCURESTI", -6), cui: null })).toBeNull();
    expect(sectorTownHallPopulations([row("Sectorul 6 al Municipiului Bucuresti", -6, "Bucuresti", "1"), row("Primaria Sectorului 6", -6, "Bucuresti", "2")]).size).toBe(0);
  });

  it("scope the locality picker's sector to its town hall, and București to the city hall only", async () => {
    expect(localAuthorityIdsForUnit(sectorRows, sector(4).siruta)).toEqual(["2144029"]);
    expect(localAuthorityIdsForUnit(sectorRows, sector(1).siruta)).toEqual(["2146321"]);
    expect(localAuthorityIdsForUnit(sectorRows, sector(2).siruta)).toEqual([]);
    expect(localAuthorityIdsForUnit(sectorRows, bucuresti.siruta)).toEqual(["2144903"]);
    const spec: AskSpec = { block: "stat", dataset: "all", measure: "value", filters: { uatSiruta: sector(4).siruta, uatName: "Sectorul 4 (bucuresti)" } };
    const db = database();
    const grounding = await ground(db.sql, spec.filters);
    expect(grounding.uat).toMatchObject({ siruta: sector(4).siruta, authorityIds: ["2144029"], nAuthorities: 1 });
    const result = await runSpec(db.sql, spec, grounding);
    if ("error" in result) throw new Error(result.error);
    expect(db.values).toContainEqual(["2144029"]);
    const caveat = result.caveats.find((c) => c.startsWith("Localitatea"))!;
    expect(caveat).toContain("doar primăria sectorului");
    expect(caveat).toContain("Primăria Municipiului București și instituțiile subordonate sectorului");
  });

  it("offer the sectors in the locality picker with their own RPL 2021 population", () => {
    expect(sectorSuggestions("sectorul 3", "").map((s) => [s.name, s.siruta, s.population])).toEqual([["Sectorul 3", sector(3).siruta, 374737]]);
    expect(sectorSuggestions("sector", "bucuresti")).toHaveLength(6);
    expect(sectorSuggestions("sector 3", "cluj")).toEqual([]);
    expect(sectorSuggestions("municipiul", "")).toEqual([]);
    // A city search ranks the sectors at the city's position, so the city comes first by population.
    expect(sectorSuggestions("bucuresti", "").every((s) => s.pos === "municipiul bucuresti".indexOf("bucuresti") + 1)).toBe(true);
    expect(officialUnitPopulation(sector(3).siruta, "bucuresti")).toBe(374737);
    expect(officialUnitPopulation(sector(3).siruta, "Ilfov")).toBeNull();
    expect(officialUnitPopulation(bucuresti.siruta, "bucuresti")).toBe(1716961);
  });
});
