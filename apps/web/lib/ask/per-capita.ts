import type { DbSql } from "@seap/db";
import { formatInt } from "../format";
import { POPULATION_VERSION, readPopulationMappings } from "../peer-population";

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
 */
export interface PerCapitaPopulations {
  /** Entity ids, aligned with `populations`, for a parameterized SQL join. */
  ids: string[];
  populations: number[];
  byEntity: ReadonlyMap<string, number>;
  local: number;
  county: number;
}

export async function readPerCapitaPopulations(q: DbSql): Promise<PerCapitaPopulations> {
  const index = await readPopulationMappings(q);
  const ids: string[] = [], populations: number[] = [], byEntity = new Map<string, number>();
  let local = 0, county = 0;
  for (const [id, population] of [...index].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    // Sectors never map (see governmentLevel); a non-positive value is not a denominator.
    if (population.level === "sector" || !(population.value > 0)) continue;
    ids.push(id); populations.push(population.value); byEntity.set(id, population.value);
    if (population.level === "county") county++; else local++;
  }
  return { ids, populations, byEntity, local, county };
}

export const PER_CAPITA_SOURCE =
  `populația rezidentă la 1 decembrie 2021 (INS, RPL 2021, tabelul 1.22; catalog ${POPULATION_VERSION})`;

export function perCapitaCaveat(p: Pick<PerCapitaPopulations, "local" | "county">): string {
  return `Pe locuitor: valoarea se împarte la ${PER_CAPITA_SOURCE}. Intră doar administrațiile identificate strict, cu CUI valid — ` +
    `primării: ${formatInt(p.local)} (nume, județ și cod SIRUTA concordante); consilii județene: ${formatInt(p.county)} (populația județului). ` +
    "Sectoarele Bucureștiului, instituțiile subordonate (școli, servicii, poliție, companii) și asocierile ambigue sau din alt județ sunt excluse din clasament. " +
    "Asocierea autoritate–UAT este o inferență a aplicației, nu o listă oficială INS.";
}

/** Shown when a card displays a population without a per-capita ranking. */
export const POPULATION_CARD_NOTE =
  `Populația afișată este ${PER_CAPITA_SOURCE}, doar pentru primăriile și consiliile județene identificate strict; altfel lipsește.`;
