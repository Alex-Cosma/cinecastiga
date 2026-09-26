import { describe,expect,it } from "vitest";
import { governmentLevel,populationForMapping,uniquePopulationMappings,nearestPopulationMembers,POPULATION_VERSION } from "./peer-population";
import { parsePeerInput,parsePeerCandidatesInput } from "./peers";
import type { PeerPopulation } from "./peers-shared";
import catalog from "./reference/population-rpl2021.json";
const entity=(name:string,county:string|null,siruta:number|null=null,id="1")=>({id,name,county,siruta,cui:"12345"});
const lookup=(text:string)=>catalog.units.find(unit=>unit.name===text)!;
const identity="a".repeat(64);
describe("official population comparison identity",()=>{
  it("corroborates SIRUTA with primary authority name/county and never uses the old stored population",()=>{
    const unit=lookup("MUNICIPIUL BUZĂU"),row=entity("MUNICIPIUL BUZAU","Buzau",unit.siruta);
    expect(populationForMapping(row)).toMatchObject({value:103481,siruta:unit.siruta,referenceDate:"2021-12-01",catalogVersion:POPULATION_VERSION,mappingMethod:"siruta_name_county",sourceSha256:catalog.source.sha256});
    expect(populationForMapping({...row,county:"Cluj"})).toBeUndefined();
    expect(populationForMapping({...row,cui:null})).toBeUndefined();
    expect(populationForMapping({...row,name:"Școala Municipiului Buzău"})).toBeUndefined();
    expect(populationForMapping({...row,siruta:lookup("MUNICIPIUL CLUJ-NAPOCA").siruta})).toBeUndefined();
  });
  it("recovers only unique exact locality/county identities, with bounded legacy spelling and legal suffixes",()=>{
    for(const [name,county]of [["Primaria Municipiului Targu Jiu","Gorj"],["Primaria Municipiului Tirgu-Mures","Mures"],["MUNICIPIUL PITESTI - CONSILIUL LOCAL AL MUNICIPIULUI PITESTI","Arges"],["COMUNA SANTANDREI (PRIMARIA)","Bihor"],["COMUNA SCRIOASTEA (PRIMARIA COMUNEI SCRIOASTEA)","Teleorman"],["ORASUL LUDUS (Primaria Orasului Ludus)","Mures"]])
      expect(populationForMapping(entity(name!,county!)),name).toMatchObject({mappingMethod:"exact_name_county",level:"local"});
    expect(populationForMapping(entity("COMUNA CORABIA (PRIMARIA COBIA)","Olt"))).toBeUndefined();
    expect(populationForMapping(entity("MUNICIPIUL PITESTI - CONSILIUL LOCAL AL MUNICIPIULUI BUZAU","Arges"))).toBeUndefined();
    expect(populationForMapping(entity("MUNICIPIUL BUZAU JUDETUL CLUJ","Buzau"))).toBeUndefined();
    expect(populationForMapping(entity("MUNICIPIUL BUZAU JUDETUL BUZAU","Buzau"))).toBeDefined();
  });
  it("uses county resident totals and served county, not the council office county",()=>{
    expect(populationForMapping(entity("JUDETUL ILFOV - CONSILIUL JUDETEAN","Bucuresti",-100))).toMatchObject({value:542704,county:"ILFOV",level:"county"});
    expect(populationForMapping(entity("U.A.T. JUDETUL HUNEDOARA","Hunedoara",-100))).toMatchObject({level:"county"});
    expect(populationForMapping(entity("JUDETUL MARAMURES (CONSILIUL JUDETEAN MARAMURES)","Maramures",-100))).toBeDefined();
    expect(populationForMapping(entity("JUDETUL CLUJ (CONSILIUL JUDETEAN BUZAU)","Cluj",-100))).toBeUndefined();
    expect(populationForMapping(entity("CONSILIUL JUDETEAN CLUJ DIRECTIA SOCIALA","Cluj",-100))).toBeUndefined();
  });
  it("deduplicates both authority identities and served units, refusing ambiguous distinct entities",()=>{
    const row=entity("MUNICIPIUL BUZAU","Buzau");
    expect(uniquePopulationMappings([row,row]).size).toBe(1);
    expect(uniquePopulationMappings([row,{...row,id:"2",cui:"54321"}]).size).toBe(0);
    expect(uniquePopulationMappings([row,entity("MUNICIPIUL PITESTI","Arges",null,"1")]).size).toBe(0);
  });
  it("keeps cities, municipalities and communes together; excludes counties and orders nearest ten independently of spend",()=>{
    const base=populationForMapping(entity("MUNICIPIUL BUZAU","Buzau"))!;
    const index=new Map<string,PeerPopulation>([["100",{...base,value:10000}],...[...Array(12)].map((_,n)=>[String(n+1),{...base,value:10000+(n%2?-1:1)*(n+1)*10,siruta:n+1}] as [string,PeerPopulation]),["200",{...base,value:10000,level:"county"}]]);
    const nearest=nearestPopulationMembers(index,"100");
    expect(nearest.map(([id])=>id)).toEqual([...Array(10)].map((_,n)=>String(n+1)));
    expect(nearest[0]![1].differencePercent).toBe(0.1);expect(nearest[1]![1].differencePercent).toBe(-0.2);
    expect(nearestPopulationMembers(index,"100","Cluj")).toHaveLength(0);
    expect(governmentLevel("Comuna Măgura")).toBe("local");expect(governmentLevel("Oraș Abrud")).toBe("local");expect(governmentLevel("Municipiul Buzău")).toBe("local");
    expect(governmentLevel("Sectorul 1 București")).toBe("sector");expect(populationForMapping(entity("Sectorul 1 București","Bucuresti",-1))).toBeUndefined();
  });
});
describe("personal comparison requests",()=>{
  const parse=(members:unknown,extra="")=>parsePeerInput(new URLSearchParams(`entityId=1&role=authority&method=manual&members=${encodeURIComponent(JSON.stringify(members))}${extra}`));
  it("preserves explicit member order, identities and deliberate empty selection",()=>{
    expect(parse([{id:"3",identity},{id:"2",identity}]).members?.map(item=>item.id)).toEqual(["3","2"]);
    expect(parse([]).members).toEqual([]);
  });
  it("rejects self, duplicate, unbound, oversized and conflicting county selections",()=>{
    for(const members of [[{id:"1",identity}],[{id:"2",identity},{id:"2",identity}],[{id:"2"}],[...Array(51)].map((_,n)=>({id:String(n+2),identity})),[{id:"2",identity,name:"forged"}]])expect(()=>parse(members)).toThrow();
    expect(()=>parse([],"&county=Cluj")).toThrow();
    expect(()=>parsePeerInput(new URLSearchParams("entityId=1&role=authority&method=manual"))).toThrow();
    expect(()=>parsePeerInput(new URLSearchParams("entityId=1&role=authority&method=activity&members=[]"))).toThrow();
  });
  it("validates focused candidate search and checkpoint identity without accepting cohort filters",()=>{
    expect(parsePeerCandidatesInput(new URLSearchParams("entityId=1&role=authority&search=Buzău"))).toMatchObject({search:"Buzău",role:"authority"});
    for(const extra of ["search=a","search=Cluj&year=2025","search=Cluj&search=Buzau","search=Cluj&identity=no"])expect(()=>parsePeerCandidatesInput(new URLSearchParams(`entityId=1&role=authority&${extra}`))).toThrow();
  });
});
