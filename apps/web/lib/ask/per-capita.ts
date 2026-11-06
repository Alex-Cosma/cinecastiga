import type { DbSql } from "@seap/db";
import { formatInt } from "../format";
import { COUNTIES } from "../counties";
import { countyFold, POPULATION_VERSION, readPopulationMappingRows, sectorTownHallPopulations, uniquePopulationMappings } from "../peer-population";
import catalog from "../reference/population-rpl2021.json" with { type: "json" };

/**
 * Per-capita denominators for Întreabă. They come from the same strict
 * primary-administration join as the population peer comparison and the
 * versioned INS RPL 2021 catalog (resident population on 1 December 2021).
 *
 * The older `reference.uat` / `reference.authority_uat` population, copied to
 * `marts.entity_profile.population`, is never used here: it holds unsourced
 * 2011-era values (some village-sized), and it gives every institution mapped
 * to a București sector (police, social services, companies) the whole sector
 * population. See docs/implementation/peer-population-audit.md.
 *
 * Owner decision F05 (21 October 2026): the six București sector town halls
 * rank with their own sector's RPL 2021 population (sectorTownHallUnit); their
 * subordinate institutions still have no denominator, and Primăria Municipiului
 * București keeps the population of the whole city. Population peers still
 * leave sectors out of the automatic cohort (readPopulationMappings).
 */
export interface PerCapitaPopulations {
  /** Entity ids, aligned with `populations`, for a parameterized SQL join. */
  ids: string[];
  populations: number[];
  byEntity: ReadonlyMap<string, number>;
  /** Each administration's level: a town hall (a București sector's too) or a county council (F4: "Pe locuitor" between two of one level). */
  levels: ReadonlyMap<string, "local" | "county">;
  local: number;
  /** București sector town halls, each with its own sector's population. */
  sector: number;
  county: number;
  /**
   * F5 (map final §3.3): the county each administration administers, in the marts' spelling ("Bistrita-Nasaud"),
   * aligned with `ids`: the catalog unit's for a town hall, its sector's (București) for a sector, the county's for a
   * county council (CJ Ilfov at Ilfov, though it sits in București). The map of "Primăriile și consiliile județene"
   * groups by it.
   */
  counties: string[];
  /**
   * The official SIRUTA code of the unit each administration administers, aligned with `ids`: a town hall's UAT, a
   * București sector's own code, null for a county council. The UATs of /harta are grouped by it.
   */
  sirutas: (number | null)[];
  /** The counties (marts spelling) whose county council is in the list: a county without one is no per-capita figure. */
  councils: ReadonlySet<string>;
}

/** The marts' spelling of a county (core.entities.county: the display name without diacritics), by its fold. */
const MARTS_COUNTY = new Map(COUNTIES.map((name) => [countyFold(name), name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")]));
/** A catalog county ("BISTRIȚA-NĂSĂUD", "MUNICIPIUL BUCUREȘTI") in the marts' spelling, or null. */
export const martsCounty = (name: string): string | null => MARTS_COUNTY.get(countyFold(name)) ?? null;

/**
 * The resident population of each county and of București (INS RPL 2021, the versioned catalog's `counties`; never
 * reference.uat, where București has 0), by the marts' spelling: the denominator of the map per inhabitant.
 */
export const COUNTY_POPULATION: ReadonlyMap<string, number> = new Map(
  (catalog.counties as { name: string; population: number }[]).flatMap((c) => { const county = martsCounty(c.name); return county ? [[county, c.population] as const] : []; }));
/** The country's resident population (19,053,815), the sum of the counties'. */
export const NATIONAL_POPULATION: number = catalog.nationalPopulation;

export async function readPerCapitaPopulations(q: DbSql): Promise<PerCapitaPopulations> {
  const rows = await readPopulationMappingRows(q);
  // The two indexes are disjoint: the strict join never maps a sector name.
  const index = new Map([...uniquePopulationMappings(rows), ...sectorTownHallPopulations(rows)]);
  const ids: string[] = [], populations: number[] = [], counties: string[] = [], sirutas: (number | null)[] = [], byEntity = new Map<string, number>(), levels = new Map<string, "local" | "county">();
  const councils = new Set<string>();
  let local = 0, sector = 0, county = 0;
  for (const [id, population] of [...index].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    // A non-positive value is not a denominator; a unit whose county the catalog does not name has no place on the map.
    const at = martsCounty(population.county);
    if (!(population.value > 0) || !at) continue;
    ids.push(id); populations.push(population.value); counties.push(at); byEntity.set(id, population.value);
    sirutas.push(population.level === "county" ? null : population.siruta ?? null);
    levels.set(id, population.level === "county" ? "county" : "local");
    if (population.level === "county") { county++; councils.add(at); } else if (population.level === "sector") sector++; else local++;
  }
  return { ids, populations, byEntity, levels, local, sector, county, counties, sirutas, councils };
}

export const PER_CAPITA_SOURCE =
  `populația rezidentă la 1 decembrie 2021 (INS, RPL 2021, tabelul 1.22; catalog ${POPULATION_VERSION})`;

export function perCapitaCaveat(p: Pick<PerCapitaPopulations, "local" | "sector" | "county">): string {
  return `Pe locuitor: valoarea se împarte la ${PER_CAPITA_SOURCE}. Intră doar administrațiile identificate strict, cu CUI valid — ` +
    `primării: ${formatInt(p.local)} (nume, județ și cod SIRUTA concordante); primării de sector din București: ${formatInt(p.sector)} (populația propriului sector); ` +
    `consilii județene: ${formatInt(p.county)} (populația județului). ` +
    "Primăria Municipiului București se împarte la populația întregului oraș; primăriile de sector sunt autorități separate, cu achizițiile lor. " +
    "Instituțiile subordonate (școli, servicii, poliție, companii), inclusiv cele ale sectoarelor, și asocierile ambigue sau din alt județ sunt excluse din clasament. " +
    "Asocierea autoritate–UAT este o inferență a aplicației, nu o listă oficială INS.";
}

/** Shown when a card displays a population without a per-capita ranking. */
export const POPULATION_CARD_NOTE =
  `Populația afișată este ${PER_CAPITA_SOURCE}, doar pentru primăriile (inclusiv cele de sector, cu populația sectorului) și consiliile județene identificate strict; altfel lipsește.`;
