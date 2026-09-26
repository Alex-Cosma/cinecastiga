import { describe, expect, it } from "vitest";
import { peerEvidenceSpec, validatePeerEvidence, type PeerEvidenceSelection } from "./peers-evidence-shared";
import { validateCaptureRequest } from "./evidence-capture-input";

const marker:PeerEvidenceSelection={version:"peer-evidence-1",checkpointId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",entityId:"101",identity:"a".repeat(64),role:"supplier",dataset:"all",year:2025,cpv:"45",county:"Cluj",selection:{kind:"comparison"}};
const {county: _county,...base}=marker;
const current = {...base,version:"peer-evidence-2" as const,method:"manual" as const,populationVersion:"ins-rpl-2021-table-1.22-v1",members:[{id:"103",identity:"c".repeat(64)},{id:"102",identity:"b".repeat(64)}]};
describe("comparison evidence boundary",()=>{
  it("keeps registered county out of transaction source filters",()=>{
    expect(validatePeerEvidence(marker)).toEqual(marker);
    const spec=peerEvidenceSpec(marker);expect(spec.filters).toEqual({yearFrom:2025,yearTo:2025});
    expect(spec.population?.groups[0]?.conditions).toEqual([{field:"cpv",op:"in",values:["45"]}]);
    expect(peerEvidenceSpec({...marker,selection:{kind:"member",entityId:"102",identity:"b".repeat(64)}}).filters.supplierId).toBe(102);
  });
  it("rejects invalid period, CPV, identities, scope and unsupported receipt variants",()=>{
    for(const changed of [{year:1999},{cpv:"45000000"},{identity:"bad"},{entityId:"9007199254740992"},{checkpointId:"latest"},{selection:{kind:"all"}},{selection:{kind:"member",entityId:"102"}},{county:""}])
      expect(validatePeerEvidence({...marker,...changed})).toHaveProperty("error");
    expect(validateCaptureRequest("query",null,{}, {peer:marker,evidenceScope:{county:"Cluj"}})).toHaveProperty("error");
  });
  it("rebuilds a canonical placeholder and strips browser monetary claims and names",()=>{
    expect(validateCaptureRequest("query",null,{forged:true},{peer:{...marker,title:"False",median:"999999"},valueRon:999,title:"False"}))
      .toEqual({kind:"query",refId:null,spec:peerEvidenceSpec(marker),options:{},peer:marker});
  });
  it("refuses filtered complete-group saves but permits explicitly filtered member sources",()=>{
    expect(validateCaptureRequest("query",null,{}, {peer:marker,evidenceOptions:{search:"road"}})).toHaveProperty("error");
    const member={...marker,selection:{kind:"member" as const,entityId:"102",identity:"b".repeat(64)}};
    expect(validateCaptureRequest("query",null,{}, {peer:member,evidenceOptions:{search:"road"}}))
      .toMatchObject({peer:member,options:{search:"road"}});
    expect(validateCaptureRequest("query",null,{}, {peer:marker,connection:{}})).toHaveProperty("error");
  });
  it("pins population method/catalog and preserves ordered manual identities without accepting browser context",()=>{
    expect(validatePeerEvidence({...current,population:{value:999},median:888})).toEqual(current);
    expect(validatePeerEvidence({...current,members:[{...current.members[0],name:"Forged",population:999},current.members[1]]})).toEqual(current);
    const result=validateCaptureRequest("query",null,{filters:{authorityId:999}}, {peer:current,population:1});
    expect(result).toMatchObject({peer:current,spec:peerEvidenceSpec(current)});
    expect(peerEvidenceSpec(current).filters).toEqual({yearFrom:2025,yearTo:2025});
  });
  it("rejects missing catalog, duplicate/self/invalid/manual-overflow members and ambiguous methods",()=>{
    for(const changed of [{populationVersion:undefined},{populationVersion:"../latest"},{method:"nearest"},{members:undefined},{county:"Cluj"},
      {members:[current.members[0],current.members[0]]},{members:[{id:marker.entityId,identity:marker.identity}]},
      {members:[{id:"102",identity:"bad"}]},{members:Array.from({length:51},(_,i)=>({id:String(i+200),identity:"b".repeat(64)}))},
      {method:"population"},{method:"activity"}])expect(validatePeerEvidence({...current,...changed})).toHaveProperty("error");
    const {members:_,...population}=current;
    expect(validatePeerEvidence({...population,method:"population"})).toMatchObject({version:"peer-evidence-2",method:"population"});
    expect(validatePeerEvidence({...current,members:[]})).toMatchObject({members:[]});
  });
  it("supports explicit all-year v2 evidence without reinterpreting historical receipts",()=>{
    const all={...current,year:"all" as const};
    expect(validatePeerEvidence(all)).toEqual(all);
    expect(peerEvidenceSpec(all).filters).toEqual({});
    expect(validateCaptureRequest("query",null,{filters:{yearFrom:2025}},{peer:all})).toMatchObject({peer:all,spec:peerEvidenceSpec(all)});
    expect(validatePeerEvidence({...marker,year:"all"})).toHaveProperty("error");
    for(const year of [undefined,null,"ALL",0])expect(validatePeerEvidence({...current,year})).toHaveProperty("error");
  });
  it("binds all-domain evidence without an all% prefix or changed v1 scope",()=>{
    const all={...current,cpv:"all",year:"all" as const};
    expect(validatePeerEvidence(all)).toEqual(all);expect(peerEvidenceSpec(all).population).toBeUndefined();
    expect(peerEvidenceSpec(all).filters).toEqual({});
    expect(validatePeerEvidence({...marker,cpv:"all"})).toHaveProperty("error");
  });
  it("keeps historical v1 receipts in their original shape despite newer client fields",()=>{
    expect(validatePeerEvidence({...marker,method:"population",populationVersion:current.populationVersion,members:current.members})).toEqual(marker);
    expect(validateCaptureRequest("query",null,{}, {peer:current,evidenceScope:{entityIds:["999"]}})).toHaveProperty("error");
    expect(validateCaptureRequest("query",null,{}, {peer:current,evidenceOptions:{state:"other"}})).toHaveProperty("error");
  });
});
