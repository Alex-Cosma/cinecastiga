import { describe,expect,it } from "vitest";
import { monitoringPreferences,monitoringScope,monitoringCursor,monitoringHasLocalSelection } from "./monitoring-input";
import { monitoredEntityIds,sameMonitoringEntity,type MonitoringEntityBinding } from "./monitoring-identity";
import { daCoverageYears,useSnapshotCoverage } from "./ask/compile";
import type { DbSql } from "@seap/db";

describe("private monitoring input and identity",()=>{
  it("keeps exact numeric trigger strings and explicit types",()=>{
    expect(monitoringPreferences({types:["changed","changed"],minimumValueExact:"50000.000000000001",digest:false})).toEqual({types:["changed"],minimumValueExact:"50000.000000000001",digest:false});
    expect(monitoringPreferences(undefined).digest).toBe(false);
  });
  it.each([{types:[]},{types:["all"]},{minimumValueExact:100},{minimumValueExact:"-1"},{minimumValueExact:"1e5"},{digest:"true"},{unexpected:1}])("rejects unsupported trigger input %j",value=>{expect(()=>monitoringPreferences(value)).toThrow();});
  it("preserves exact query, grouped predicates and drawer scope",()=>{
    const population={operator:"and",groups:[{operator:"or",conditions:[{field:"cpv",op:"in",values:["45","7731"]}]}]};
    const input={spec:{block:"stat",measure:"value",filters:{authorityId:12},population},options:{scope:{role:"supplier",entityIds:["13"]},state:"Oferta acceptata",search:"mobilier",stream:"da"}};
    expect(monitoringScope(input)).toEqual(input);
    expect(()=>monitoringScope({...input,options:{...input.options,capture:{persist:"attack"}}})).toThrow();
  });
  it("does not drop unsupported historical conditions",()=>{
    expect(()=>monitoringScope({spec:{block:"distribution",measure:"value",filters:{authorityId:12,yearFrom:2025}}})).toThrow();
  });
  it("binds included, excluded, compared and admin-associated identities",()=>{
    const spec={block:"stat" as const,measure:"value" as const,filters:{authorityId:1,compareWithId:2},population:{operator:"and" as const,groups:[{operator:"and" as const,conditions:[{field:"supplier" as const,op:"not_in" as const,values:["3"]}]}]}};
    expect(monitoredEntityIds(spec,{admin:{query:"p",personKey:"p",display:"p",supplierIds:["4"],nFirms:1,alternatives:[]}},{scope:{entityIds:["5"],excludeEntityIds:["6"]}})).toEqual(["1","2","3","4","5","6"]);
  });
  it("fails closed on reused internal IDs but accepts name corrections with unchanged verified identity",()=>{
    const original:MonitoringEntityBinding={id:"1",cui:"123456",foreign:null,sicap:[],fallback:"old-name"};
    expect(sameMonitoringEntity(original,{...original,fallback:"new-name"})).toBe(true);
    expect(sameMonitoringEntity(original,{...original,cui:"999999"})).toBe(false);
    expect(sameMonitoringEntity({...original,cui:null},{...original,cui:null,fallback:"new-name"})).toBe(false);
    expect(sameMonitoringEntity({...original,cui:null,sicap:["authority:1"]},{...original,cui:null,sicap:["authority:1","supplier:2"]})).toBe(true);
  });
  it("rejects invalid source cursors",()=>{expect(monitoringCursor("100")).toBe(100);for(const value of [-1,1.5,"NaN","9007199254740992"])expect(()=>monitoringCursor(value)).toThrow();});
  it("treats subgroup, search, status and stream as source-only selections",()=>{
    expect(monitoringHasLocalSelection({})).toBe(false);expect(monitoringHasLocalSelection({scope:{},search:" "})).toBe(false);
    for(const options of [{scope:{entityIds:[]}},{search:"medicamente"},{state:"Oferta acceptata"},{stream:"contracts" as const}])expect(monitoringHasLocalSelection(options)).toBe(true);
  });
  it("reads coverage within each monitoring snapshot instead of reusing an earlier refresh's year bounds",async()=>{
    const stale=(async()=>[{year:2025}]) as unknown as DbSql;
    await daCoverageYears(stale,"award");
    let years=[2025,2026];
    const current=useSnapshotCoverage((async()=>years.map(year=>({year}))) as unknown as DbSql);
    expect(await daCoverageYears(current,"award")).toEqual([2025,2026]);
    years=[2025,2026,2027];
    expect(await daCoverageYears(current,"award")).toEqual([2025,2026,2027]);
  });
});
