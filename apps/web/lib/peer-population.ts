import type { DbSql } from "@seap/db";
import catalog from "./reference/population-rpl2021.json";
import type { PeerPopulation } from "./peers-shared";
import type { ConnectionRole } from "./connections-shared";

export const POPULATION_VERSION = catalog.version;
export const POPULATION_SOURCE = catalog.source;
export const populationFold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/^u a t /,"uat ");
const units = new Map(catalog.units.map(unit => [unit.siruta, unit]));
const localPrefix = /^(?:(?:unitatea administrativa? teritoriala|uat|administratia publica locala)(?: a)? )?(?:(?:primaria|primarie|consiliul local|consiliu local)(?: al| a)? )?(?:(?:municipiul|municipiului|municipiu|orasul|orasului|oras|comuna|comunei) )/;
/**
 * Owner, 6 November 2026 (the UATs the map could not place): the legal forms F15 already counts as a UAT's own
 * administration ("UAT X", "Unitatea administrativ-teritorială X", "Consiliul local X", "Administrația publică locală X")
 * name the town hall also without the unit's type word; the name must still reduce to a unit of the same county.
 */
const bareLocalForm = /^(?:uat|unitatea administrativa? teritoriala|consiliu(?:l)? local|administratia publica locala) /;
/** Words a legal suffix may put before the locality: "(Primăria localității Târnova)", "(Consiliul Local al Primăriei Comunei X)". */
const qualifierWords = /^(?:(?:uat|unitatea administrativa? teritoriala|administratia publica locala|primaria|primariei|primarie|consiliul local|consiliu local|localitatii|comunei|comuna|orasului|orasul|oras|municipiului|municipiul)(?: al| a)? )+/;
// Bounded spelling variants used in legacy SICAP names, not fuzzy matching: tîrgu, rîmnicu and the abbreviation
// "Tg." (owner, 6 November 2026: "Orașul Tg. Ocna", "Primăria Tg. Cărbunești").
const spelling = (name: string) => name.replace(/\btirgu\b/g,"targu").replace(/\brimnicu\b/g,"ramnicu").replace(/\btg\b/g,"targu");
export function populationSearchVariants(value:string):string[]{
  const modern=spelling(populationFold(value));
  return [...new Set([modern,modern.replace(/\btargu\b/g,"tirgu"),modern.replace(/\bramnicu\b/g,"rimnicu"),modern.replace(/\btargu\b/g,"tirgu").replace(/\bramnicu\b/g,"rimnicu")])];
}
const cleanUnit = (name: string) => spelling(populationFold(name).replace(/^(municipiul|municipiu|orasul|oras) /, ""));
export const countyFold=(name:string)=>populationFold(name).replace(/^municipiul bucuresti$/,"bucuresti");
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
// The legal forms of a county council's own name; "Consiliul Județului" (D2: CJ Prahova buys as "Consiliul Judetul
// Prahova, Directia Servicii si Achizitii Publice") is the council itself.
const countyForm = /^(?:(?:unitatea administrativ teritoriala|uat) )?(?:consiliul judetean|consiliu judetean|consiliul judetul|judetul|judet) /;
/**
 * D2: the one label a county council's own name may carry after the county: its public procurement directorate, a
 * department of the council under the council's CUI (CJ Prahova, CUI 2842889: county roads, public transport, waste).
 * A subordinate institution with its own CUI ("Direcția Generală de Asistență Socială …") never has this label.
 */
const councilDepartment = / directia servicii si achizitii publice$/;
export function governmentLevel(name: string): "local" | "county" | "sector" | null {
  const normalized = expandLegalWords(populationFold(name));
  if (/^(?:(?:primaria|consiliul local)(?: al)? )?sector(?:ul|ului)? [1-6](?: |$)/.test(normalized)) return "sector";
  if (countyForm.test(normalized)) return "county";
  if (localPrefix.test(normalized) || /^primaria /.test(normalized) || bareLocalForm.test(normalized)) return "local";
  return null;
}
/** The locality name of a local administration, plus the name its legal suffix repeats (both must name the same UAT). */
/** Abbreviations of the legal words in SICAP names ("com.", "cons. local", "comunal", "Unitate administrativ…"). */
const expandLegalWords = (name: string) => name.replace(/\bcons local\b/g, "consiliul local").replace(/\bcom\b/g, "comuna")
  .replace(/\bcomunal\b/g, "comuna").replace(/\bunitate administrativ/g, "unitatea administrativ");
/** Where a name repeats its administration: "… (Primăria X)", "… (Consiliul local X)", "… (Comuna X)". */
const repeatMarker = / (?:primaria|primarie|consiliul local|consiliu local|unitatea administrativa? teritoriala|comuna|orasul|municipiul)(?: al| a)?(?= |$)/g;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function localName(name: string,county:string): string[] | null {
  let normalized=expandLegalWords(populationFold(name));
  // The county may be named anywhere ("Comuna Cosoba Judetul Giurgiu (Primaria)", "COMUNA DEDA JUD.MURES (…)"):
  // the unit's own county is dropped; any other county left in the name refuses it (owner, 6 November 2026).
  normalized=normalized.replace(new RegExp(` (?:judetul|judet|jud) ${escapeRegex(countyFold(county))}(?= |$)`,"g"),"").trim();
  if (/ (?:judetul|judet|jud) /.test(normalized)) return null;
  // A local administration's form, or a name that repeats its administration ("Orașu Nou (Consiliul local Orașu Nou)").
  if (governmentLevel(normalized) !== "local" && !new RegExp(repeatMarker.source).test(normalized)) return null;
  const clean=(part:string)=>spelling(`${part.trim()} `.replace(localPrefix,"").replace(/^primaria /,"").replace(bareLocalForm,"").replace(qualifierWords,"").trim());
  // Legal suffixes may repeat the SAME administration or be a bare label.
  // "Comuna Corabia (Primăria Cobia)" is conflicting and must never match;
  // "Comuna Gircov (Primăria comunei Gârcov)" spells one UAT two ways, so
  // every spelling must be a name of the matched unit (unitNameKeys).
  // "(Primăria comunei)", "(Primăria)", "Comuna (Primăria Jilavele)": an empty part is a bare label.
  const parts=normalized.split(repeatMarker).map(clean).filter(Boolean);
  return parts.length ? parts : null;
}
/**
 * Owner-approved town halls (6 November 2026), one CUI each, its county still the unit's: names with an evident small
 * typo ("Cele 17 sunt greșeli mici și evidente"), identities whose SICAP name is not the town hall's (Alba Iulia,
 * Cobia, Suatu; also renamed in the pipeline, reviewed-entity-names.ts), and units another identity also claims: an
 * approved town hall wins over them (Cluj-Napoca: CUI 14920794 only pays parking, kept separate since 1 October), and
 * two approved CUIs of one unit are summed (Lunca Ilvei).
 */
export const APPROVED_TOWN_HALLS: ReadonlyMap<string, { siruta: number; sicapName: string }> = new Map([
  ["4352832", { siruta: 20313, sicapName: "Comuna Hemeiusi (Consiliul Local Hemeius)" }],
  ["4593474", { siruta: 30915, sicapName: "Orasul Sacuieni (Primaria Orasului Sacueni Bihor)" }],
  ["4512356", { siruta: 35152, sicapName: "ComunaTarlisua (Consiliul local Tarlisua)" }],
  ["4777280", { siruta: 40991, sicapName: "COMUNEA FUNDATA (PRIMARIA COMUNEI FUNDATA)" }],
  ["4801400", { siruta: 42076, sicapName: "PRIMARIA TICUS" }],
  ["5001902", { siruta: 70673, sicapName: "COMUNA AMARASTII DE SUS (CONSILIUL LOCAL AMARASTI DE SUS)" }],
  ["17352737", { siruta: 179926, sicapName: "COMUNA RASCAIETI (PRIMARIA RASCAETI DAMBOVITA)" }],
  ["3963714", { siruta: 137844, sicapName: "COMUNA HODOD (RIMARIA COMUNEI HODOD)" }],
  ["4241150", { siruta: 145355, sicapName: "Comuna Racovita (Primaria Rracovita)" }],
  ["4637635", { siruta: 142676, sicapName: "COMUNA SINMIHAIUL-ALMASULUI" }],
  ["4469027", { siruta: 151834, sicapName: "Comunai Poroschia (primaria)" }],
  ["4652694", { siruta: 151870, sicapName: "Primaria Rosiorii de Vede" }],
  ["5517173", { siruta: 155797, sicapName: "COMUNA BELINT (PRIMARIEA BELINT)" }],
  ["4793910", { siruta: 159883, sicapName: "Comuna CA Rosetti" }],
  ["4793880", { siruta: 161231, sicapName: "Comuna Sf. Gheorghe (Primaria Comunei Sfantul Gheorghe)" }],
  ["3394236", { siruta: 163137, sicapName: "Comuna Costeti (Consiliul Local Costesti)" }],
  ["4297789", { siruta: 177879, sicapName: "Comuna Tanasoaia (Consiliul Local Tanasoia)" }],
  ["4562923", { siruta: 1017, sicapName: "Municipiul Alba Iulia - Directia Politia Locala" }],
  ["4449429", { siruta: 66580, sicapName: "Comuna Corabia (Primaria Cobia)" }],
  ["5303080", { siruta: 59657, sicapName: "Comuna Suatu (primariasuatu,suatu nr685,jud.cluj)" }],
  ["4305857", { siruta: 54975, sicapName: "Municipiul Cluj-Napoca" }],
  ["4730598", { siruta: 33603, sicapName: "Comunei Lunca Ilvei (Primaria Lunca Ilvei)" }],
  ["13564982", { siruta: 33603, sicapName: "Comuna Lunca Ilvei" }],
]);
export interface PopulationMappingRow {
  id: string; name: string; county: string | null; cui: string | null; siruta: number | null;
  /** D2: false when the identity has no records in the marts (no authority profile); absent when unknown. */
  records?: boolean;
}
export function populationForMapping(row: PopulationMappingRow): PeerPopulation | undefined {
  if (!row.cui) return undefined;
  const level = governmentLevel(row.name);
  if (level === "county") {
    const countyName = populationFold(row.name).replace(countyForm, "").replace(councilDepartment, "");
    const county = catalog.counties.find(item => {
      const name=populationFold(item.name);
      return item.kind === "county" && [name,`${name} consiliul judetean`,`${name} consiliul judetean ${name}`].includes(countyName);
    });
    if (!county) return undefined;
    return { value:county.population, unitName:county.name, county:county.name, level:"county", referenceDate:catalog.referenceDate,
      sourceUrl:catalog.source.url, sourceSha256:catalog.source.sha256, sourceRow:county.sourceRow, catalogVersion:POPULATION_VERSION, differencePercent:null, mappingMethod:"exact_name_county" };
  }
  // localName also reads a name that only repeats its administration ("Orașu Nou (Consiliul local Orașu Nou)").
  if (level === "sector" || !row.county) return undefined;
  const approved=APPROVED_TOWN_HALLS.get(row.cui), approvedUnit=approved ? units.get(approved.siruta) : undefined;
  if (approvedUnit && countyFold(approvedUnit.county)===countyFold(row.county))
    return { value:approvedUnit.population, siruta:approvedUnit.siruta, unitName:approvedUnit.name, county:approvedUnit.county, level:"local", referenceDate:catalog.referenceDate,
      sourceUrl:catalog.source.url, sourceSha256:catalog.source.sha256, sourceRow:approvedUnit.sourceRow, catalogVersion:POPULATION_VERSION, differencePercent:null, mappingMethod:"owner_approved" };
  const names=localName(row.name,row.county);
  if (!names) return undefined;
  // Owner, 6 November 2026: the county's name written after the locality ("Comuna Poșaga Alba", "(Primăria Godeni
  // Argeș)") is dropped only when the name without it is a unit of that county, so "Dărăști-Ilfov" stays whole.
  const county=countyFold(row.county);
  // The reverse too: a unit whose own name ends with its county ("Dărăști-Ilfov") written without it ("Comuna Dărăști").
  const variants=(name:string)=>name.endsWith(` ${county}`)&&name.length>county.length+1?[name,name.slice(0,-county.length-1)]:[name,`${name} ${county}`];
  const exact=[...new Set(variants(names[0]!).flatMap(name=>(byNameCounty.get(`${county}:${name}`)??[]).filter(unit=>unit.kind!=="sector")))];
  // A conflicting existing positive SIRUTA never falls back to a name guess, unless the legacy table placed the
  // authority in another county: such a code is wrong (owner, 6 November 2026: four communes Vânători sharing one
  // code), so the name in the authority's own county decides.
  const legacy=row.siruta!==null && row.siruta>0 ? units.get(row.siruta) : undefined;
  const trusted=legacy && countyFold(legacy.county)===countyFold(row.county) ? legacy : undefined;
  const unit = trusted ?? (legacy || row.siruta===null || row.siruta<=0 ? (exact.length===1 ? exact[0] : undefined) : undefined);
  if (!unit || unit.kind === "sector" || countyFold(row.county) !== countyFold(unit.county) || !names.every(name=>variants(name).some(v=>keysBySiruta.get(unit.siruta)!.has(v)))) return undefined;
  return { value:unit.population, siruta:unit.siruta, unitName:unit.name, county:unit.county, level:"local", referenceDate:catalog.referenceDate,
    sourceUrl:catalog.source.url, sourceSha256:catalog.source.sha256, sourceRow:unit.sourceRow, catalogVersion:POPULATION_VERSION, differencePercent:null,
    mappingMethod:trusted?"siruta_name_county":"exact_name_county" };
}
/**
 * One identity per unit, the denominator's: a unit that two identities claim has none. D2: an identity without
 * records (`records: false`, registered in SEAP as a buyer but never buying) does not compete with one that has
 * records: CJ Suceava (CUI 4244512, every record) against a second "Consiliul Judetean Suceava" (CUI 6728926, none).
 */
export function uniquePopulationMappings(rows: PopulationMappingRow[]): Map<string, PeerPopulation> {
  const perEntity = new Map<string, Map<string,PeerPopulation>>(), perUnit = new Map<string, Set<string>>();
  const mapped = rows.flatMap((row) => {
    const population = populationForMapping(row);
    return population ? [{ row, population, key: `${population.level}:${population.siruta ?? populationFold(population.county)}` }] : [];
  });
  // The units an identity with records claims.
  const bought = new Set(mapped.filter((m) => m.row.records !== false).map((m) => m.key));
  for (const { row, population, key } of mapped) {
    if (row.records === false && bought.has(key)) continue;
    if (!perEntity.has(row.id)) perEntity.set(row.id,new Map());
    perEntity.get(row.id)!.set(key,population);
    if (!perUnit.has(key)) perUnit.set(key,new Set());
    perUnit.get(key)!.add(row.id);
  }
  // An owner-approved town hall wins its unit; two approved ones of the same unit both stay (their values are summed).
  const approvedIds = new Set(mapped.filter((m) => {
    const approved = m.row.cui ? APPROVED_TOWN_HALLS.get(m.row.cui) : undefined;
    return approved !== undefined && m.population.siruta !== undefined && approved.siruta === m.population.siruta;
  }).map((m) => m.row.id));
  const result = new Map<string,PeerPopulation>();
  for (const [entityId, matches] of perEntity) {
    if (matches.size !== 1) continue;
    const [key,population] = [...matches][0]!;
    const claimers = [...perUnit.get(key)!], approved = claimers.filter((id) => approvedIds.has(id));
    if (approved.length ? approved.includes(entityId) : claimers.length === 1) result.set(entityId,population);
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
/** A name with a legal form of a UAT's own administration (F15): the locality scope's rule, and the town halls' kind (lib/ask/authority-kind.ts). */
export const localAdministrationName = (name: string): boolean =>
  governmentLevel(name) === "local" || administrationForm.test(populationFold(name));
// The units of each name key in the whole country (sectors apart): an identity without a county is placed only by a
// name no other unit carries.
const unitsByName = new Map<string, number>();
for (const unit of catalog.units) if (unit.kind !== "sector") for (const key of keysBySiruta.get(unit.siruta)!) unitsByName.set(key, (unitsByName.get(key) ?? 0) + 1);
/**
 * D2: a legacy code on an identity without a county (Cluj-Napoca's second identity, 2165580) counts when the name is a
 * local administration's and names that unit and no other in the country. The code alone cannot place it: it was
 * matched by name without a county (five Vânători share one), so a name that several units carry adds nothing.
 */
export function countylessLegacyCode(row: PopulationMappingRow): boolean {
  const unit = row.siruta !== null && row.siruta > 0 ? units.get(row.siruta) : undefined;
  if (!unit || unit.kind === "sector" || row.county || !row.cui) return false;
  const names = localName(row.name, unit.county);
  return !!names && names.every((name) => keysBySiruta.get(unit.siruta)!.has(name)) && unitsByName.get(names[0]!) === 1;
}
/**
 * Locality scope of Întreabă (finding F15): the valid-CUI authorities that are
 * the local administration of one UAT. The legacy `reference.authority_uat`
 * code was matched by name without a county (five Vânători communes from five
 * counties share one code, Sfântu Gheorghe CV points to an Ialomița commune),
 * so a positive legacy code counts only when the official county of that code
 * is the authority's own county and the name has a local-administration legal
 * form, or, for an identity without a county, when its name names that unit
 * alone in the country (countylessLegacyCode). Authorities without a positive
 * legacy code enter by the strict exact name+county match of the population
 * join (Pitești, Târgu Jiu, București). As in that join, a conflicting legacy
 * code never falls back to a name guess.
 *
 * D2 (plan §9 trusa 10, table 4): "primăria X" is the union of the UAT's
 * identities, on every question at once. This is a filter, not a denominator
 * (uniquePopulationMappings keeps one identity per unit): two corroborated
 * identities, a name match beside a corroborated one and several name matches
 * are all the same administration's records. Schools, services, companies,
 * sector institutions and entities of another county never enter. A București
 * sector selects only its own town hall's identities (sectorTownHallUnit), and
 * the city selects Primăria Municipiului București, never the sectors.
 */
export function localAuthorityIdentities(rows: PopulationMappingRow[], siruta: number): { ids: string[]; joined: string[] } {
  const unit = units.get(siruta);
  if (!unit) return { ids: [], joined: [] };
  const legacy = new Set<string>(), fallback = new Set<string>(), countyless = new Set<string>();
  if (unit.kind === "sector") {
    // Owner decision F05: a sector selects only its own town hall (sectorTownHallUnit).
    for (const row of rows) if (sectorTownHallUnit(row)?.siruta === siruta) (row.siruta !== null ? legacy : fallback).add(row.id);
  } else {
    for (const row of rows) {
      if (row.siruta !== null && row.siruta > 0) {
        if (row.siruta !== siruta || !localAdministrationName(row.name)) continue;
        if (row.county ? countyFold(row.county) === countyFold(unit.county) : countylessLegacyCode(row)) (row.county ? legacy : countyless).add(row.id);
        continue;
      }
      const population = populationForMapping(row);
      if (population?.level === "local" && population.siruta === siruta) fallback.add(row.id);
    }
  }
  const sort = (ids: Iterable<string>) => [...new Set(ids)].sort((a, b) => Number(a) - Number(b));
  // Before D2: the corroborated codes, else a single name match; never a county-less identity.
  const before = new Set(legacy.size > 0 ? legacy : fallback.size === 1 ? fallback : []);
  const ids = sort([...legacy, ...countyless, ...fallback]);
  // `joined` moves a number only with records: an identity without an authority profile (`records: false`, Pătulele's
  // second) is in the list but changes no answer, so it raises no methodology alert (uat-2, S5 review).
  const bought = new Set(rows.filter((row) => row.records !== false).map((row) => row.id));
  return { ids, joined: ids.filter((id) => !before.has(id) && bought.has(id)) };
}
/** The ids of "primăria X" (localAuthorityIdentities): the one function every question reads. */
export function localAuthorityIdsForUnit(rows: PopulationMappingRow[], siruta: number): string[] {
  return localAuthorityIdentities(rows, siruta).ids;
}
export async function readLocalAuthorityIds(q: DbSql, siruta: number): Promise<string[]> {
  return localAuthorityIdsForUnit(await readPopulationMappingRows(q), siruta);
}
export async function readLocalAuthorityIdentities(q: DbSql, siruta: number): Promise<{ ids: string[]; joined: string[] }> {
  return localAuthorityIdentities(await readPopulationMappingRows(q), siruta);
}
export async function readPopulationMappings(q: DbSql): Promise<Map<string,PeerPopulation>> {
  return uniquePopulationMappings(await readPopulationMappingRows(q));
}
export async function readPopulationMappingRows(q: DbSql): Promise<PopulationMappingRow[]> {
  const [tables] = await q`select to_regclass('reference.authority_uat') is not null present`;
  // D2: whether the identity has records (an authority profile), for uniquePopulationMappings.
  const records=q`exists(select 1 from marts.entity_profile p where p.entity_id=e.id and p.role='authority') records`;
  const localRows = tables?.present ? await q`select e.id::text id,e.name_display name,e.county,e.cui_canonical cui,au.uat_siruta siruta,${records}
    from reference.authority_uat au join core.entities e on e.id=au.entity_id where e.cui_valid and e.cui_canonical is not null and e.id<=9007199254740991 and ${peerRolePredicate(q,"authority")}` : [];
  // Owner, 6 November 2026: also the other legal forms and their abbreviations the map's missing town halls carry.
  const prefixes=['consiliul judetean %','consiliu judetean %','consiliul judetul %','judetul %','judet %','uat %','unitatea administrativ teritoriala %',
    'unitatea administrativa teritoriala %','unitate administrativ%','administratia publica locala %','comunei %','consiliu local %','cons local %','primarie %',
    'municipiul %','municipiu %','orasul %','oras %','comuna %','primaria %','consiliul local %','u a t %','sector %','sectorul %',
    // A name that only repeats its administration: "orasu nou consiliul local orasu nou".
    '% consiliul local %','% primaria %'];
  const missingMappings=tables?.present?q`not exists(select 1 from reference.authority_uat au where au.entity_id=e.id)`:q`true`;
  const countyRows = await q`select e.id::text id,e.name_display name,e.county,e.cui_canonical cui,null::integer siruta,${records} from core.entities e
    where e.cui_valid and e.cui_canonical is not null and e.id<=9007199254740991
      and (e.name_normalized like any(${prefixes}::text[]) or e.cui_canonical = any(${[...APPROVED_TOWN_HALLS.keys()]}::text[])) and ${missingMappings} and ${peerRolePredicate(q,"authority")}`;
  return [...localRows,...countyRows] as unknown as PopulationMappingRow[];
}
export function nearestPopulationMembers(index: Map<string,PeerPopulation>, focalId: string, county?: string): [string,PeerPopulation][] {
  const focal = index.get(focalId); if (!focal) return [];
  return [...index].filter(([id,population]) => id!==focalId && population.level===focal.level && (!county || populationFold(population.county)===populationFold(county)))
    .sort((a,b) => Math.abs(a[1].value-focal.value)-Math.abs(b[1].value-focal.value) || Number(a[0])-Number(b[0])).slice(0,10)
    .map(([id,population]) => [id,{...population,differencePercent:Math.round((population.value-focal.value)/focal.value*10000)/100}]);
}
