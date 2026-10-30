import type { DbSql } from "@seap/db";
import { localAuthorityIdentities, populationForMapping, readPopulationMappingRows, sectorTownHallUnit, sectorUnit, type PopulationMappingRow } from "../peer-population";
import { prettyUat, TIP_LABEL } from "../intent/vocabulary-queries";

/**
 * D2 (plan §9 F5/D2, final table §3.2): a town hall (or its local council) chosen from an institution search is
 * written as its locality, "primăria X", the union of its identities, so it gives the same numbers however it was
 * chosen (Cluj-Napoca 2024–2025: 413 firms by the locality, 393 by one identity). Only an identity the union holds
 * (localAuthorityIdentities) is a town hall here; schools, services and county councils stay institutions. Old links
 * with an authorityId keep it.
 */

/** A locality as /api/suggest writes it (the builder labels it „Municipiul Cluj-Napoca (Cluj)”). */
export interface TownHallUnit { siruta: number; name: string; tip: string; county: string }

const CACHE_MS = 10 * 60_000;
let cached: { at: number; rows: Promise<PopulationMappingRow[]> } | null = null;
function mappingRows(q: DbSql): Promise<PopulationMappingRow[]> {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const rows = readPopulationMappingRows(q);
    cached = { at: Date.now(), rows };
    rows.catch(() => { if (cached?.rows === rows) cached = null; });
  }
  return cached.rows;
}
/** Tests: read the identities again. */
export function forgetTownHalls(): void { cached = null; }

/** The unit an identity names (its corroborated code, its sector, its name), before the union checks it. */
function unitOf(row: PopulationMappingRow): number | null {
  const sector = sectorTownHallUnit(row);
  if (sector) return sector.siruta;
  if (row.siruta !== null && row.siruta > 0) return row.siruta;
  const population = populationForMapping(row);
  return population?.level === "local" && population.siruta ? population.siruta : null;
}

/** The town halls among `ids` (institutions found by a search), by id: the locality each is an identity of. */
export function townHallSirutas(rows: readonly PopulationMappingRow[], ids: readonly string[]): Map<string, number> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const out = new Map<string, number>();
  for (const id of ids) {
    const row = byId.get(id);
    const siruta = row ? unitOf(row) : null;
    if (siruta !== null && localAuthorityIdentities([...rows], siruta).ids.includes(id)) out.set(id, siruta);
  }
  return out;
}

/** The town halls among `ids`, with the locality's words; read-only. */
export async function townHallUnits(q: DbSql, ids: readonly string[]): Promise<Map<string, TownHallUnit>> {
  if (!ids.length) return new Map();
  const sirutas = townHallSirutas(await mappingRows(q), ids);
  if (!sirutas.size) return new Map();
  const codes = [...new Set(sirutas.values())];
  const [tables] = await q`select to_regclass('reference.uat') is not null present`;
  const found = tables?.present
    ? (await q`select siruta, name, tip::text tip, county from reference.uat where siruta = any(${q.array(codes)}::integer[])`) as unknown as { siruta: number; name: string; tip: string | null; county: string | null }[]
    : [];
  const named = new Map(found.map((u) => [Number(u.siruta), { siruta: Number(u.siruta), name: prettyUat(u.name), tip: TIP_LABEL[String(u.tip ?? "")] ?? "localitate", county: u.county ?? "" }]));
  for (const siruta of codes) {
    // reference.uat has no București sectors: the RPL 2021 catalog's, as /api/suggest writes them.
    const sector = named.has(siruta) ? undefined : sectorUnit(siruta);
    if (sector) named.set(siruta, { siruta, name: prettyUat(sector.name), tip: "sector", county: "bucuresti" });
  }
  return new Map([...sirutas].flatMap(([id, siruta]) => named.has(siruta) ? [[id, named.get(siruta)!] as const] : []));
}
