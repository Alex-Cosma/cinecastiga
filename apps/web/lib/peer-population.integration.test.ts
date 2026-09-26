import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb,type DbSql } from "@seap/db";
import { getPeers,getLegacyPeersInSnapshot,getPeerCandidates } from "./peers";
import { readConnectionEntity } from "./connections";
import { POPULATION_VERSION,populationFold } from "./peer-population";
import type { PeerInput } from "./peers-shared";
import catalog from "./reference/population-rpl2021.json";
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1)))throw new Error("Population fixtures require seap_test_* database");
const focalUnit=catalog.units.find(unit=>unit.name==="MUNICIPIUL AIUD")!;
const closest=catalog.units.filter(unit=>unit.kind!=="sector"&&unit.siruta!==focalUnit.siruta)
  .sort((a,b)=>Math.abs(a.population-focalUnit.population)-Math.abs(b.population-focalUnit.population)||a.siruta-b.siruta).slice(0,10);
const fixtureUnits=[focalUnit,...closest];
describe.skipIf(!url)("population and personally chosen peers (isolated PostgreSQL)",()=>{
  let sql:DbSql;const checkpoint=randomUUID(),focal="897710000",supplier="897719999";
  const input=(extra:Partial<PeerInput>={}):PeerInput=>({entityId:focal,role:"authority",dataset:"all",year:2025,cpv:"45",page:1,...extra});
  beforeAll(async()=>{
    sql=createDb(url).sql;
    for(let index=0;index<=36;index++){
      const unit=fixtureUnits[index],name=unit?unit.kind==="commune"?`COMUNA ${unit.name}`:unit.name:index===36?"Primaria Municipiului Tirgu-Mures":`Liceul Fixture ${index}`;
      await sql`insert into core.entities(id,name_display,name_normalized,cui_canonical,cui_valid,county,country_code)
        values(${897710000+index},${name},${populationFold(name)},${String(99001000+index)},true,${unit?.county??(index===36?"Mures":"Buzau")},'RO')`;
    }
    await sql`insert into core.entities(id,name_display,name_normalized,cui_canonical,cui_valid,county,country_code)
      values(${supplier},'Firma Test Comparatii','firma test comparatii','99001999',true,'Cluj','RO')`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date,cpv_code)
      select 897720000+n,897710000+n,${supplier}::bigint,3,'2023-01-01','71000000-8'from generate_series(0,36)n`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date,cpv_code)
      select 897730000+n,897710000+n,${supplier}::bigint,(n+1)*10+0.0001,'2025-01-01','45000000-7'from generate_series(0,9)n`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date,cpv_code)
      values(897739001,${focal},${supplier},10.0001,'2025-01-02','45000000-7')`;
    await sql`insert into core.entities(id,name_display,name_normalized,cui_canonical,cui_valid,county,country_code)
      select 897710100+n,'Asociatia Fixture Targu Mures '||n,'asociatia fixture targu mures '||n,(99001100+n)::text,true,'Mures','RO'from generate_series(0,25)n`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date,cpv_code)
      select 897720100+n,897710100+n,${supplier}::bigint,3,'2023-01-01','71000000-8'from generate_series(0,25)n`;
    await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at,source_coverage)values(${checkpoint},'baseline','ready',now(),'{}')`;
  });
  afterAll(async()=>{
    if(!sql)return;
    await sql`delete from marts.da_transactions where sicap_da_id between 897720000 and 897739999`;
    await sql`delete from core.entities where id between 897710000 and 897710125 or id=${supplier}`;
    await sql`delete from app.monitoring_refreshes where id=${checkpoint}`;await sql.end();
  });
  const members=async(ids:string[])=>Promise.all(ids.map(async id=>({id,identity:(await readConnectionEntity(sql,id,"authority")).identity})));
  it("selects ten by resident population across legal categories, independent of recorded activity",async()=>{
    const result=await getPeers(input(),sql);
    expect(result.filters).toMatchObject({method:"population",populationVersion:POPULATION_VERSION});
    expect(result.focal?.population).toMatchObject({value:focalUnit.population,siruta:focalUnit.siruta});
    expect(result.members.map(member=>member.entity.id)).toEqual(closest.map((_,n)=>String(897710001+n)));
    expect(result.members.map(member=>member.population?.value)).toEqual(closest.map(unit=>unit.population));
    expect(closest.some(unit=>unit.kind==="city")).toBe(true);expect(closest.some(unit=>unit.kind==="commune")).toBe(true);
    expect(result.cohort).toMatchObject({count:10,observedMemberCount:9,medianTotalExact:"60.0001",enoughPeers:true});
    expect(result.members[9]).toMatchObject({recordCount:0,totalExact:"0"});
  });
  it("preserves the same roster when year or domain has no records, with missing values outside the median",async()=>{
    const first=await getPeers(input(),sql),empty=await getPeers(input({year:2022,cpv:"79",dataset:"contracts"}),sql);
    expect(empty.members.map(item=>item.entity.id)).toEqual(first.members.map(item=>item.entity.id));
    expect(empty.focal?.recordCount).toBe(0);expect(empty.cohort).toMatchObject({count:10,observedMemberCount:0,medianTotalExact:null,enoughPeers:false});
  });
  it("keeps population and manual membership while aggregating multiple years and undated acquisitions",async()=>{
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date,cpv_code) values
      (897739010,${focal},${supplier},7.0001,'2024-01-01','45000000-7'),
      (897739011,${focal},${supplier},0.0002,null,'45000000-7'),
      (897739012,897710010,${supplier},25.0001,'2024-01-01','45000000-7')`;
    try{
      const annual=await getPeers(input(),sql),all=await getPeers(input({year:"all"}),sql);
      expect(all.filters.year).toBe("all");expect(all.suggested.year).toBe(false);
      expect(all.members.map(item=>item.entity.id)).toEqual(annual.members.map(item=>item.entity.id));
      expect(all.focal).toMatchObject({recordCount:4,totalExact:"27.0005"});
      expect(all.cohort).toMatchObject({count:10,observedMemberCount:10,medianTotalExact:"55.0001"});
      const chosen=await members(["897710010","897710001"]),manual=await getPeers(input({year:"all",method:"manual",members:chosen}),sql);
      expect(manual.filters.members).toEqual(chosen);expect(manual.members.map(item=>item.recordCount)).toEqual([1,1]);
      expect(all.focal?.spec.filters.yearFrom).toBeUndefined();expect(all.focal?.spec.filters.yearTo).toBeUndefined();
      const allDomains=await getPeers(input({year:"all",cpv:"all"}),sql);
      expect(allDomains.members.map(item=>item.entity.id)).toEqual(annual.members.map(item=>item.entity.id));
      expect(allDomains.focal).toMatchObject({recordCount:5,totalExact:"30.0005"});
      expect(allDomains.focal?.spec.population).toBeUndefined();
    }finally{await sql`delete from marts.da_transactions where sicap_da_id between 897739010 and 897739012`;}
  });
  it("keeps explicitly chosen order, unknown population and zero-source members",async()=>{
    const chosen=await members(["897710010","897710011","897710001"]),result=await getPeers(input({method:"manual",members:chosen}),sql);
    expect(result.members.map(member=>member.entity.id)).toEqual(chosen.map(member=>member.id));
    expect(result.members[0]?.recordCount).toBe(0);expect(result.members[1]?.population).toBeUndefined();
    expect(result.cohort).toMatchObject({count:3,observedMemberCount:1,missingPopulationCount:1,medianTotalExact:"20.0001",enoughPeers:false});
    expect(result.methodology.method).toBe("manual");
    expect(result.members.every(member=>member.selectionReason==="manual")).toBe(true);
  });
  it("returns the complete editable manual roster beyond twenty and canonicalizes pagination",async()=>{
    const chosen=await members([...Array(25)].map((_,n)=>String(897710001+n))),result=await getPeers(input({method:"manual",members:chosen,page:3}),sql);
    expect(result.members.map(member=>member.entity.id)).toEqual(chosen.map(member=>member.id));
    expect(result.filters.page).toBe(1);expect(result.pagination).toEqual({page:1,pageSize:50,totalPages:1,hasNext:false});
    const empty=await getPeers(input({method:"manual",members:[]}),sql);expect(empty.cohort.status).toBe("no_selection");expect(empty.focal).not.toBeNull();
  });
  it("refuses stale catalog/member identities and wrong-role manual members",async()=>{
    await expect(getPeers(input({method:"population",populationVersion:"outdated-v0"}),sql)).rejects.toMatchObject({status:409});
    await expect(getPeers(input({method:"manual",members:[{id:"897710001",identity:"a".repeat(64)}]}),sql)).rejects.toMatchObject({status:409});
    const invalid=await members([supplier]);await expect(getPeers(input({method:"manual",members:invalid}),sql)).rejects.toMatchObject({status:409});
    await expect(getPeers(input({checkpointId:randomUUID(),method:"population"}),sql)).rejects.toMatchObject({status:409});
  });
  it("searches exact CUI and modern spelling aliases while binding role, checkpoint and population",async()=>{
    const query={entityId:focal,role:"authority"as const,checkpointId:checkpoint,populationVersion:POPULATION_VERSION};
    const cui=await getPeerCandidates({...query,search:"99001001"},sql);expect(cui.items.map(item=>item.entity.id)).toEqual(["897710001"]);
    expect(cui.items[0]?.population?.value).toBe(closest[0]?.population);
    const legacySpelling=await getPeerCandidates({...query,search:"Târgu Mureș"},sql);expect(legacySpelling.items[0]?.entity.id).toBe("897710036");expect(legacySpelling.items).toHaveLength(20);expect(legacySpelling.hasMore).toBe(true);
    expect((await getPeerCandidates({...query,search:"99001999"},sql)).items).toHaveLength(0);
    await expect(getPeerCandidates({...query,search:"Aiud",populationVersion:"old"},sql)).rejects.toMatchObject({status:409});
  });
  it("retains the legacy activity meaning of old pinned links and exact legacy receipt shape",async()=>{
    const result=await getPeers(input({checkpointId:checkpoint}),sql);expect(result.filters.method).toBe("activity");expect(result.methodology.defaultMethod).toBe("population");
    const legacy=await sql.begin("isolation level repeatable read read only",q=>getLegacyPeersInSnapshot(q as unknown as DbSql,input({checkpointId:checkpoint}),result.checkpoint));
    expect(legacy.methodology.version).toBe("peers-1");expect(legacy.methodology.method).toBeUndefined();expect(legacy.filters.method).toBeUndefined();expect(legacy.cohort.observedMemberCount).toBeUndefined();
    expect(legacy.focal?.population).toBeUndefined();
  });
});
