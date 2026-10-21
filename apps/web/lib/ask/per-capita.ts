import type { DbSql } from "@seap/db";
import { formatInt } from "../format";
import { POPULATION_VERSION, readPopulationMappingRows, sectorTownHallPopulations, uniquePopulationMappings } from "../peer-population";

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
  local: number;
  /** București sector town halls, each with its own sector's population. */
  sector: number;
  county: number;
}

export async function readPerCapitaPopulations(q: DbSql): Promise<PerCapitaPopulations> {
  const rows = await readPopulationMappingRows(q);
  // The two indexes are disjoint: the strict join never maps a sector name.
  const index = new Map([...uniquePopulationMappings(rows), ...sectorTownHallPopulations(rows)]);
  const ids: string[] = [], populations: number[] = [], byEntity = new Map<string, number>();
  let local = 0, sector = 0, county = 0;
  for (const [id, population] of [...index].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    // A non-positive value is not a denominator.
    if (!(population.value > 0)) continue;
    ids.push(id); populations.push(population.value); byEntity.set(id, population.value);
    if (population.level === "county") county++; else if (population.level === "sector") sector++; else local++;
  }
  return { ids, populations, byEntity, local, sector, county };
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
