import type { DbSql } from "@seap/db";
import catalog from "./reference/population-rpl2021.json";
import type { PeerPopulation } from "./peers-shared";
import type { ConnectionRole } from "./connections-shared";

export const POPULATION_VERSION = catalog.version;
export const POPULATION_SOURCE = catalog.source;
export const populationFold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/^u a t /,"uat ");
const units = new Map(catalog.units.map(unit => [unit.siruta, unit]));
const localPrefix = /^(?:(?:unitatea administrativ teritoriala|uat) )?(?:(?:primaria|consiliul local)(?: al| a)? )?(?:(?:municipiul|municipiului|municipiu|orasul|orasului|oras|comuna|comunei) )/;
// Two bounded spelling variants used in legacy SICAP names, not fuzzy matching.
const spelling = (name: string) => name.replace(/\btirgu\b/g,"targu").replace(/\brimnicu\b/g,"ramnicu");
export function populationSearchVariants(value:string):string[]{
  const modern=spelling(populationFold(value));
  return [...new Set([modern,modern.replace(/\btargu\b/g,"tirgu"),modern.replace(/\bramnicu\b/g,"rimnicu"),modern.replace(/\btargu\b/g,"tirgu").replace(/\bramnicu\b/g,"rimnicu")])];
}
const cleanUnit = (name: string) => spelling(populationFold(name).replace(/^(municipiul|municipiu|orasul|oras) /, ""));
const countyFold=(name:string)=>populationFold(name).replace(/^municipiul bucuresti$/,"bucuresti");
/**
 * Owner decision F05/F15 (21 October 2026): a SICAP name matches a catalog UAT
 * when it differs only by diacritics (populationFold drops them, so ș/ş, ț/ţ, ă,
 * î and â compare as their base letter) or by the pre-1993 spelling that wrote a
 * word-internal â as î ("COMUNA CIRJITI" for CÂRJIȚI). The î variants are
 * derived from the catalog's own â letters, never from an arbitrary a/i swap,
 * and every caller still requires the authority's county to be the unit's.
 */
export function unitNameKeys(name: string): Set<string> {
  const parts = name.split(/[âÂ]/);
  const keys = new Set<string>();
  // Catalog names hold at most two â; the bound only guards the combinations.
  for (let mask = 0; mask < 2 ** Math.min(parts.length - 1, 4); mask++)
    keys.add(cleanUnit(parts.reduce((text, part, i) => i === 0 ? part : text + (mask & (1 << (i - 1)) ? "î" : "â") + part, "")));
  return keys;
}
const keysBySiruta=new Map(catalog.units.map(unit=>[unit.siruta,unitNameKeys(unit.name)]));
const byNameCounty=new Map<string,typeof catalog.units>();
for(const unit of catalog.units)for(const name of keysBySiruta.get(unit.siruta)!){const key=`${countyFold(unit.county)}:${name}`;byNameCounty.set(key,[...(byNameCounty.get(key)??[]),unit]);}
/** Official RPL 2021 resident population of a UAT or București sector, only when the catalog county corroborates the code. */
export function officialUnitPopulation(siruta: number, county: string | null): number | null {
  const unit = units.get(siruta);
  if (!unit || !county || countyFold(unit.county) !== countyFold(county)) return null;
  return unit.population;
}
/** RPL 2021 rows "BUCUREȘTI SECTORUL N", by sector number. */
const sectorUnits = new Map<number, (typeof catalog.units)[number]>();
for (const unit of catalog.units) {
  const match = unit.kind === "sector" ? /SECTORUL ([1-6])$/.exec(unit.name) : null;
  if (match) sectorUnits.set(Number(match[1]), unit);
}
/** The catalog row of a București sector, by its official SIRUTA code. */
export function sectorUnit(siruta: number): { siruta: number; name: string; county: string; population: number } | undefined {
  const unit = units.get(siruta);
  return unit?.kind === "sector" ? unit : undefined;
}
// The whole name is the sector administration, optionally repeated with the same number:
// "Sectorul 2 al Municipiului București", "Sector 4 (Primăria Sectorului 4 București)",
// "Sector 1 (Sectorul 1 al municipiului București)". Anything else ("Poliția Locală Sector 1",
// "Clubul Copiilor Sector 6", "DGASPC Sector 3") is a subordinate institution.
const sectorTownHallName = /^(?:primaria )?sector(?:ul|ului)? ([1-6])(?:(?: al)? (?:municipiului )?bucuresti)?(?: (?:primaria )?sector(?:ul|ului)? ([1-6])(?:(?: al)? (?:municipiului )?bucuresti)?)?$/;
/**
 * Owner decision F05 (21 October 2026): the town hall of a București sector is
 * its own administration, with its own sector's RPL 2021 population. Only the
 * sector administration itself qualifies: valid CUI, county București, a name
 * that is only "Sectorul N" (see sectorTownHallName) and, when the legacy table
 * holds a code, the same sector's synthetic code (-N) or official SIRUTA. The
 * sector's subordinate institutions share the legacy code but never match, and
 * Primăria Municipiului București keeps the population of the whole city.
 */
export function sectorTownHallUnit(row: PopulationMappingRow): { siruta: number; name: string; county: string; population: number; sourceRow: number } | undefined {
  if (!row.cui || !row.county || countyFold(row.county) !== "bucuresti") return undefined;
  const match = sectorTownHallName.exec(populationFold(row.name));
  if (!match || (match[2] !== undefined && match[2] !== match[1])) return undefined;
  const unit = sectorUnits.get(Number(match[1]));
  if (!unit) return undefined;
  if (row.siruta !== null && row.siruta !== -Number(match[1]) && row.siruta !== unit.siruta) return undefined;
  return unit;
}
/** Sector town halls with their sector's population, only when exactly one entity qualifies for the sector. */
export function sectorTownHallPopulations(rows: PopulationMappingRow[]): Map<string, PeerPopulation> {
  const perUnit = new Map<number, Map<string, boolean>>();
  for (const row of rows) {
    const unit = sectorTownHallUnit(row);
    if (unit) perUnit.set(unit.siruta, (perUnit.get(unit.siruta) ?? new Map()).set(row.id, row.siruta !== null));
  }
  const result = new Map<string, PeerPopulation>();
  for (const [siruta, ids] of perUnit) {
    if (ids.size !== 1) continue;
    const unit = units.get(siruta)!, [[id, coded]] = [...ids] as [[string, boolean]];
    result.set(id, { value:unit.population, siruta:unit.siruta, unitName:unit.name, county:unit.county, level:"sector", referenceDate:catalog.referenceDate,
      sourceUrl:catalog.source.url, sourceSha256:catalog.source.sha256, sourceRow:unit.sourceRow, catalogVersion:POPULATION_VERSION, differencePercent:null, mappingMethod:coded?"siruta_name_county":"exact_name_county" });
  }
  return result;
}
/** București sectors for the locality picker: "sector 3", "sectorul 3", "bucurești sector 3". */
export function sectorSuggestions(query: string, county: string): { siruta: number; name: string; population: number; pos: number }[] {
  if (county && countyFold(county) !== "bucuresti") return [];
  const q = populationFold(query).replace(/\bsector(?:ul|ului)?\b/g, "sector");
  if (q.length < 2 || "municipiul ".includes(q)) return [];
  return [...sectorUnits].flatMap(([n, unit]) => {
    // A city search gets the same position as "municipiul bucuresti", so the city ranks first by population.
    const pos = `municipiul bucuresti sector ${n}`.indexOf(q) + 1 || `sector ${n} bucuresti`.indexOf(q) + 1;
    return pos > 0 ? [{ siruta: unit.siruta, name: `Sectorul ${n}`, population: unit.population, pos }] : [];
  });
}
export function governmentLevel(name: string): "local" | "county" | "sector" | null {
  const normalized = populationFold(name);
  if (/^(?:(?:primaria|consiliul local)(?: al)? )?sector(?:ul|ului)? [1-6](?: |$)/.test(normalized)) return "sector";
  if (/^(?:(?:unitatea administrativ teritoriala|uat) )?(consiliul judetean|consiliu judetean|judetul|judet) /.test(normalized)) return "county";
  if (localPrefix.test(normalized) || /^primaria /.test(normalized)) return "local";
  return null;
}
/** The locality name of a local administration, plus the name its legal suffix repeats (both must name the same UAT). */
function localName(name: string,county:string): string[] | null {
  if (governmentLevel(name) !== "local") return null;
  let normalized=populationFold(name);
  const countySuffix=normalized.match(/ (?:judetul|judet|jud) (.+)$/);
  if(countySuffix){
    if(countyFold(countySuffix[1]!)!==countyFold(county))return null;
    normalized=normalized.slice(0,countySuffix.index);
  }
  const clean=(part:string)=>spelling(part.replace(localPrefix,"").replace(/^primaria /,"").trim());
  const repeated=normalized.match(/ (primaria|consiliul local)(?: al| a)?(?: |$)/);
  if(repeated){
    const primary=clean(normalized.slice(0,repeated.index));
    const qualifier=normalized.slice(repeated.index!+repeated[0].length);
    // Legal suffixes may repeat the SAME administration or be a bare label.
    // "Comuna Corabia (Primăria Cobia)" is conflicting and must never match;
    // "Comuna Gircov (Primăria comunei Gârcov)" spells one UAT two ways, so
    // both spellings must be names of the matched unit (unitNameKeys).
    return qualifier ? [primary,clean(qualifier)] : [primary];
  }
  return [clean(normalized)];
}
export interface PopulationMappingRow { id: string; name: string; county: string | null; cui: string | null; siruta: number | null }
export function populationForMapping(row: PopulationMappingRow): PeerPopulation | undefined {
  if (!row.cui) return undefined;
  const level = governmentLevel(row.name);
  if (level === "county") {
    const countyName = populationFold(row.name).replace(/^(?:(?:unitatea administrativ teritoriala|uat) )?(consiliul judetean|consiliu judetean|judetul|judet) /, "");
    const county = catalog.counties.find(item => {
      const name=populationFold(item.name);
      return item.kind === "county" && [name,`${name} consiliul judetean`,`${name} consiliul judetean ${name}`].includes(countyName);
    });
    if (!county) return undefined;
    return { value:county.population, unitName:county.name, county:county.name, level:"county", referenceDate:catalog.referenceDate,
      sourceUrl:catalog.source.url, sourceSha256:catalog.source.sha256, sourceRow:county.sourceRow, catalogVersion:POPULATION_VERSION, differencePercent:null, mappingMethod:"exact_name_county" };
  }
  if (level !== "local" || !row.county) return undefined;
  const names=localName(row.name,row.county);
  if (!names) return undefined;
  const exact = (byNameCounty.get(`${countyFold(row.county)}:${names[0]}`)??[]).filter(unit=>unit.kind!=="sector");
  // A conflicting existing positive SIRUTA never falls back to a name guess.
  const unit = row.siruta!==null && row.siruta>0 ? units.get(row.siruta) : exact.length===1 ? exact[0] : undefined;
  if (!unit || unit.kind === "sector" || countyFold(row.county) !== countyFold(unit.county) || !names.every(name=>keysBySiruta.get(unit.siruta)!.has(name))) return undefined;
  return { value:unit.population, siruta:unit.siruta, unitName:unit.name, county:unit.county, level:"local", referenceDate:catalog.referenceDate,
    sourceUrl:catalog.source.url, sourceSha256:catalog.source.sha256, sourceRow:unit.sourceRow, catalogVersion:POPULATION_VERSION, differencePercent:null,
    mappingMethod:row.siruta!==null&&row.siruta>0?"siruta_name_county":"exact_name_county" };
}
export function uniquePopulationMappings(rows: PopulationMappingRow[]): Map<string, PeerPopulation> {
  const perEntity = new Map<string, Map<string,PeerPopulation>>(), perUnit = new Map<string, Set<string>>();
  for (const row of rows) {
    const population = populationForMapping(row); if (!population) continue;
    const key = `${population.level}:${population.siruta ?? populationFold(population.county)}`;
    if (!perEntity.has(row.id)) perEntity.set(row.id,new Map());
    perEntity.get(row.id)!.set(key,population);
    if (!perUnit.has(key)) perUnit.set(key,new Set());
    perUnit.get(key)!.add(row.id);
  }
  const result = new Map<string,PeerPopulation>();
  for (const [entityId, matches] of perEntity) {
    if (matches.size !== 1) continue;
    const [key,population] = [...matches][0]!;
    if (perUnit.get(key)!.size === 1) result.set(entityId,population);
  }
  return result;
}
/** Only strict primary administrations with valid CUI are matched; schools/services sharing a UAT never qualify. */
export function peerRolePredicate(q:DbSql,role:ConnectionRole) {
  const column=q(role==="authority"?"authority_id":"supplier_id");
  return q`(exists(select 1 from core.entity_sicap_ids s where s.entity_id=e.id and s.namespace=${role})
    or exists(select 1 from marts.entity_profile p where p.entity_id=e.id and p.role=${role})
    or exists(select 1 from marts.da_transactions d where d.${column}=e.id)
    or exists(select 1 from marts.contract_transactions c where c.${column}=e.id))`;
}
// Legal forms under which a UAT's own administration buys in SICAP, beyond the
// governmentLevel prefixes ("UAT X", "Unitatea administrativ-teritorială X",
// "Consiliul local X", "X (Consiliul local X)").
const administrationForm = /^(?:uat|unitatea? administrativ teritoriala|consiliul local) | consiliul local /;
/**
 * Locality scope of Întreabă (finding F15): the valid-CUI authorities that are
 * the local administration of one UAT. The legacy `reference.authority_uat`
 * code was matched by name without a county (five Vânători communes from five
 * counties share one code, Sfântu Gheorghe CV points to an Ialomița commune),
 * so a positive legacy code counts only when the official county of that code
 * is the authority's own county and the name has a local-administration legal
 * form. When no such row exists, the strict exact name+county fallback of the
 * population join applies to authorities without a positive legacy code
 * (Pitești, Târgu Jiu, București), only when it yields a single candidate. As
 * in that join, a conflicting legacy code never falls back to a name guess.
 * Unlike the population index, two corroborated legacy identities of the same
 * administration are both kept: this is a filter, not a denominator, and
 * dropping them would hide the administration's own records. Schools,
 * services, companies, sector institutions and entities without a county never
 * enter. A București sector selects only its own town hall (sectorTownHallUnit),
 * and the city selects Primăria Municipiului București, never the sectors.
 */
export function localAuthorityIdsForUnit(rows: PopulationMappingRow[], siruta: number): string[] {
  const unit = units.get(siruta);
  if (!unit) return [];
  const legacy = new Set<string>(), fallback = new Set<string>();
  if (unit.kind === "sector") {
    // Owner decision F05: a sector selects only its own town hall (sectorTownHallUnit).
    for (const row of rows) if (sectorTownHallUnit(row)?.siruta === siruta) (row.siruta !== null ? legacy : fallback).add(row.id);
    const ids = legacy.size > 0 ? legacy : fallback.size === 1 ? fallback : new Set<string>();
    return [...ids].sort((a, b) => Number(a) - Number(b));
  }
  for (const row of rows) {
    if (row.siruta !== null && row.siruta > 0) {
      if (row.siruta === siruta && row.county && countyFold(row.county) === countyFold(unit.county)
        && (governmentLevel(row.name) === "local" || administrationForm.test(populationFold(row.name)))) legacy.add(row.id);
      continue;
    }
    const population = populationForMapping(row);
    if (population?.level === "local" && population.siruta === siruta) fallback.add(row.id);
  }
  // The name fallback recovers a missing mapping; it never adds a second
  // identity beside a corroborated one or chooses between several candidates.
  const ids = legacy.size > 0 ? legacy : fallback.size === 1 ? fallback : new Set<string>();
  return [...ids].sort((a, b) => Number(a) - Number(b));
}
export async function readLocalAuthorityIds(q: DbSql, siruta: number): Promise<string[]> {
  return localAuthorityIdsForUnit(await readPopulationMappingRows(q), siruta);
}
export async function readPopulationMappings(q: DbSql): Promise<Map<string,PeerPopulation>> {
  return uniquePopulationMappings(await readPopulationMappingRows(q));
}
export async function readPopulationMappingRows(q: DbSql): Promise<PopulationMappingRow[]> {
  const [tables] = await q`select to_regclass('reference.authority_uat') is not null present`;
  const localRows = tables?.present ? await q`select e.id::text id,e.name_display name,e.county,e.cui_canonical cui,au.uat_siruta siruta
    from reference.authority_uat au join core.entities e on e.id=au.entity_id where e.cui_valid and e.cui_canonical is not null and e.id<=9007199254740991 and ${peerRolePredicate(q,"authority")}` : [];
  const prefixes=['consiliul judetean %','consiliu judetean %','judetul %','judet %','uat %','unitatea administrativ teritoriala %',
    'municipiul %','municipiu %','orasul %','oras %','comuna %','primaria %','consiliul local %','u a t %','sector %','sectorul %'];
  const missingMappings=tables?.present?q`not exists(select 1 from reference.authority_uat au where au.entity_id=e.id)`:q`true`;
  const countyRows = await q`select e.id::text id,e.name_display name,e.county,e.cui_canonical cui,null::integer siruta from core.entities e
    where e.cui_valid and e.cui_canonical is not null and e.id<=9007199254740991
      and e.name_normalized like any(${prefixes}::text[]) and ${missingMappings} and ${peerRolePredicate(q,"authority")}`;
  return [...localRows,...countyRows] as unknown as PopulationMappingRow[];
}
export function nearestPopulationMembers(index: Map<string,PeerPopulation>, focalId: string, county?: string): [string,PeerPopulation][] {
  const focal = index.get(focalId); if (!focal) return [];
  return [...index].filter(([id,population]) => id!==focalId && population.level===focal.level && (!county || populationFold(population.county)===populationFold(county)))
    .sort((a,b) => Math.abs(a[1].value-focal.value)-Math.abs(b[1].value-focal.value) || Number(a[0])-Number(b[0])).slice(0,10)
    .map(([id,population]) => [id,{...population,differencePercent:Math.round((population.value-focal.value)/focal.value*10000)/100}]);
}
