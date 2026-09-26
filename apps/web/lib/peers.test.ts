import { describe,expect,it } from "vitest";
import { authorityPeerKind,parsePeerInput } from "./peers";
import { peerSourceSpec } from "./peers-shared";
const parse=(extra="")=>parsePeerInput(new URLSearchParams(`entityId=123&role=authority${extra}`));
describe("peer comparison scope",()=>{
  it("requires exact identity role and keeps suggestions distinguishable from explicit year/domain",()=>{
    expect(parse()).toEqual({entityId:"123",role:"authority",dataset:"all",page:1});
    expect(parse("&year=2024&cpv=45&county=Cluj&dataset=da&page=2")).toMatchObject({year:2024,cpv:"45",county:"Cluj",dataset:"da",page:2});
  });
  it("distinguishes all years from an omitted suggested year and removes source date bounds",()=>{
    expect(parse("&year=all").year).toBe("all");
    expect(parse().year).toBeUndefined();
    const spec=peerSourceSpec({id:"42",name:"Company",role:"supplier"},{dataset:"all",year:"all",cpv:"45",page:1});
    expect(spec.filters).toEqual({supplierId:42,supplierName:"Company"});
    expect(spec.population?.groups[0]?.conditions).toEqual([{field:"cpv",op:"in",values:["45"]}]);
    for(const extra of ["&year=ALL","&year=null","&year=0","&year=all&year=2025"])expect(()=>parse(extra)).toThrow();
  });
  it("distinguishes all domains from a CPV prefix and rejects partial or malformed codes",()=>{
    expect(parse("&cpv=all").cpv).toBe("all");expect(parse().cpv).toBeUndefined();
    const spec=peerSourceSpec({id:"42",name:"Company",role:"supplier"},{dataset:"all",year:"all",cpv:"all",page:1});
    expect(spec.population).toBeUndefined();expect(spec.filters).toEqual({supplierId:42,supplierName:"Company"});
    for(const extra of ["&cpv=ALL","&cpv=45%25","&cpv=all&cpv=45"])expect(()=>parse(extra)).toThrow();
  });
  it("rejects unsupported or malformed filters instead of broadening a comparison",()=>{
    for(const extra of ["&year=2024&year=2025","&cpv=450","&cpv=%25","&county=","&dataset=ted","&page=0","&identity=wrong","&checkpointId=x","&year=1999","&search=abc"])
      expect(()=>parse(extra)).toThrow();
  });
  it("reuses name-pattern categories and refuses unknown or ambiguous authority names",()=>{
    expect(authorityPeerKind("COMUNA Măgura")).toBe("comuna");expect(authorityPeerKind("Primăria Buzău")).toBe("oras_municipiu");
    expect(authorityPeerKind("Spitalul Județean")).toBe("spital");expect(authorityPeerKind("Școala Generală")).toBe("scoala");
    expect(authorityPeerKind("Ministerul Educației")).toBeNull();expect(authorityPeerKind("Comuna Școala Nouă")).toBeNull();
  });
  it("keeps registered county out of source geography and carries CPV prefix/year/role exactly",()=>{
    const spec=peerSourceSpec({id:"42",name:"Company",role:"supplier"},{dataset:"contracts",year:2024,cpv:"45",county:"Cluj",page:1});
    expect(spec.filters).toEqual({supplierId:42,supplierName:"Company",yearFrom:2024,yearTo:2024});
    expect(spec.population?.groups[0]?.conditions).toEqual([{field:"cpv",op:"in",values:["45"]}]);
    expect(()=>peerSourceSpec({id:"42",name:"Company",role:"supplier"},{dataset:"all",year:null,cpv:null,page:1})).toThrow();
  });
});
