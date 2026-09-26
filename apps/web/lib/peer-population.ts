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
const byNameCounty=new Map<string,typeof catalog.units>();
for(const unit of catalog.units){const key=`${countyFold(unit.county)}:${cleanUnit(unit.name)}`;byNameCounty.set(key,[...(byNameCounty.get(key)??[]),unit]);}
export function governmentLevel(name: string): "local" | "county" | "sector" | null {
  const normalized = populationFold(name);
  if (/^(?:(?:primaria|consiliul local)(?: al)? )?sector(?:ul|ului)? [1-6](?: |$)/.test(normalized)) return "sector";
  if (/^(?:(?:unitatea administrativ teritoriala|uat) )?(consiliul judetean|consiliu judetean|judetul|judet) /.test(normalized)) return "county";
  if (localPrefix.test(normalized) || /^primaria /.test(normalized)) return "local";
  return null;
}
function localName(name: string,county:string): string | null {
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
    // "Comuna Corabia (Primăria Cobia)" is conflicting and must never match.
    if(qualifier && clean(qualifier)!==primary)return null;
    return primary;
  }
  return clean(normalized);
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
  const name=localName(row.name,row.county);
  const exact = (byNameCounty.get(`${countyFold(row.county)}:${name}`)??[]).filter(unit=>unit.kind!=="sector");
  // A conflicting existing positive SIRUTA never falls back to a name guess.
  const unit = row.siruta!==null && row.siruta>0 ? units.get(row.siruta) : exact.length===1 ? exact[0] : undefined;
  if (!unit || unit.kind === "sector" || countyFold(row.county) !== countyFold(unit.county) || name !== cleanUnit(unit.name)) return undefined;
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
export async function readPopulationMappings(q: DbSql): Promise<Map<string,PeerPopulation>> {
  const [tables] = await q`select to_regclass('reference.authority_uat') is not null present`;
  const localRows = tables?.present ? await q`select e.id::text id,e.name_display name,e.county,e.cui_canonical cui,au.uat_siruta siruta
    from reference.authority_uat au join core.entities e on e.id=au.entity_id where e.cui_valid and e.cui_canonical is not null and e.id<=9007199254740991 and ${peerRolePredicate(q,"authority")}` : [];
  const prefixes=['consiliul judetean %','consiliu judetean %','judetul %','judet %','uat %','unitatea administrativ teritoriala %',
    'municipiul %','municipiu %','orasul %','oras %','comuna %','primaria %','consiliul local %','u a t %'];
  const missingMappings=tables?.present?q`not exists(select 1 from reference.authority_uat au where au.entity_id=e.id)`:q`true`;
  const countyRows = await q`select e.id::text id,e.name_display name,e.county,e.cui_canonical cui,null::integer siruta from core.entities e
    where e.cui_valid and e.cui_canonical is not null and e.id<=9007199254740991
      and e.name_normalized like any(${prefixes}::text[]) and ${missingMappings} and ${peerRolePredicate(q,"authority")}`;
  return uniquePopulationMappings([...localRows,...countyRows] as unknown as PopulationMappingRow[]);
}
export function nearestPopulationMembers(index: Map<string,PeerPopulation>, focalId: string, county?: string): [string,PeerPopulation][] {
  const focal = index.get(focalId); if (!focal) return [];
  return [...index].filter(([id,population]) => id!==focalId && population.level===focal.level && (!county || populationFold(population.county)===populationFold(county)))
    .sort((a,b) => Math.abs(a[1].value-focal.value)-Math.abs(b[1].value-focal.value) || Number(a[0])-Number(b[0])).slice(0,10)
    .map(([id,population]) => [id,{...population,differencePercent:Math.round((population.value-focal.value)/focal.value*10000)/100}]);
}
