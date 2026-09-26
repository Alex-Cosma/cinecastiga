import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb,type DbSql } from "@seap/db";
import { getPeers,getPeersInSnapshot,parsePeerInput } from "./peers";
import { readConnectionEntity } from "./connections";
import { runRows } from "./ask/compile";
import { sumDecimalStrings } from "./ask/evidence";
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1)))throw new Error("Peer fixtures require seap_test_* database");
describe.skipIf(!url)("peer comparisons (isolated PostgreSQL)",()=>{
  let sql:DbSql;const checkpoint=randomUUID(), a="887750000",shared="887751000";
  const input=(extra="")=>parsePeerInput(new URLSearchParams(`entityId=${a}&role=authority&method=activity&dataset=da&year=2024&cpv=45${extra}`));
  beforeAll(async()=>{
    sql=createDb(url).sql;
    await sql`insert into core.entities(id,name_display,name_normalized,cui_canonical,cui_valid,county,country_code)
      select 887750000+n,case when n=25 then 'Spitalul 25' when n=26 then 'Instituția necunoscută' else 'Comuna '||n end,'entity '||n,(88775000+n)::text,true,case when n between 1 and 4 then 'Buzau' when n=24 then null else 'Cluj' end,'RO' from generate_series(0,30)n`;
    await sql`insert into core.entities(id,name_display,name_normalized,cui_canonical,cui_valid,county,country_code)
      select 887751000+n,'Furnizor '||n,'supplier '||n,(88775100+n)::text,true,'Cluj','RO' from generate_series(0,7)n`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date,cpv_code)
      select 887752000+n*10+r,887750000+n,${shared}::bigint,case when n=0 then 100.0001 else n+0.0001 end,'2024-06-01','45000000-7'
      from generate_series(0,26)n cross join generate_series(1,4)r`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date,cpv_code)
      select 887753000+n*10+r,887750000+n,${shared}::bigint,1,'2024-06-01','45000000-7'
      from generate_series(27,28)n cross join lateral generate_series(1,case when n=27 then 1 else 9 end)r`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date,cpv_code) values
      (887754001,${a},${shared},2,null,'45000000-7'),(887754002,${a},${shared},3,'2024-06-01',null),
      (887754003,${a},${shared},999,'2023-06-01','45000000-7'),(887754004,${a},${shared},2000001,'2024-06-01','45000000-7'),
      (887754005,${a},${shared},0,'2024-06-01','45000000-7'),(887754006,${a},${shared},-1,'2024-06-01','45000000-7'),
      (887754007,887750029,${shared},100,'2024-06-01','79000000-4'),(887754008,887750030,${shared},100,'2023-06-01','45000000-7'),
      (887754009,null,${shared},5,'2024-06-01','45000000-7')`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date,cpv_code)
      select 887755000+n*10+r,887750025,887751000+n,n+0.0001,'2024-06-01','71000000-8' from generate_series(1,7)n cross join generate_series(1,4)r`;
    await sql`insert into marts.contract_transactions(contract_id,supplier_id,authority_id,closing_value,contract_value_full,n_winners,finalization_date,cpv_code)
      values(887756001,887751001,${a},0.0033,0.0067,2,'2024-07-01','45000000-7'),(887756001,887751002,${a},0.0034,0.0067,2,'2024-07-01','45000000-7')`;
    await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at,source_coverage,validation)values(${checkpoint},'baseline','ready',now(),'{}','{"fixture":true}')`;
  });
  afterAll(async()=>{
    if(!sql)return;
    await sql`delete from app.monitoring_refreshes where id=${checkpoint}`;
    await sql`delete from marts.contract_transactions where contract_id=887756001`;
    await sql`delete from marts.da_transactions where sicap_da_id between 887752000 and 887755999`;
    await sql`delete from core.entities where id between 887750000 and 887751007`;await sql.end();
  });
  it("uses every other matching member for exact median; excludes focal,wrong type,year,CPV and activity band",async()=>{
    const result=await getPeers(input(),sql);
    expect(result.focal).toMatchObject({recordCount:4,totalExact:"400.0004",meanRounded:"100.00"});
    expect(result.cohort).toMatchObject({count:24,minimumRecords:2,maximumRecords:8,medianTotalExact:"50.0004",medianMeanRounded:"12.50",enoughPeers:true,authorityKind:"comuna",excludedUnknownType:1});
    expect(result.coverage).toEqual({focalUndatedRows:1,focalYearMissingCpvRows:1,unresolvedEntityRows:1});
    expect(result.members.some(m=>m.entity.id===a)).toBe(false);
  });
  it("aggregates all available years including undated records and reconciles exact source scope",async()=>{
    const result=await getPeers({...input(),year:"all"},sql);
    expect(result.filters.year).toBe("all");expect(result.suggested.year).toBe(false);
    expect(result.focal).toMatchObject({recordCount:6,totalExact:"1401.0004"});
    expect(result.cohort).toMatchObject({minimumRecords:3,maximumRecords:12,count:25});
    expect(result.methodology.descriptions.join(" ")).toContain("Înregistrările fără dată sunt incluse");
    const item=result.focal!;
    const rows=await runRows(sql,item.spec,{authority:{query:item.entity.name,entityId:item.entity.id,nameDisplay:item.entity.name,county:item.entity.county,alternatives:[]}},0);
    if("error"in rows)throw new Error(rows.error);
    expect(rows.total).toBe(6);expect(sumDecimalStrings([rows.value,`-${item.totalExact}`])).toMatch(/^0\.0+$/);
  });
  it("includes descendant CPV contracts and all-domain rows without usable CPV in exact sources",async()=>{
    await sql`update marts.contract_transactions set cpv_code='45453000-7' where contract_id=887756001`;
    try{
      const division=await getPeers({...input(),dataset:"all"},sql);
      expect(division.focal).toMatchObject({recordCount:6,totalExact:"400.0071",contractRows:2});
      const all=await getPeers({...input(),dataset:"all",year:"all",cpv:"all"},sql);
      expect(all.filters).toMatchObject({year:"all",cpv:"all"});expect(all.focal).toMatchObject({recordCount:9,totalExact:"1404.0071"});
      expect(all.focal?.spec.population).toBeUndefined();
      const item=all.focal!,rows=await runRows(sql,item.spec,{authority:{query:item.entity.name,entityId:item.entity.id,nameDisplay:item.entity.name,county:item.entity.county,alternatives:[]}},0);
      if("error"in rows)throw new Error(rows.error);expect(rows.total).toBe(9);expect(sumDecimalStrings([rows.value,`-${item.totalExact}`])).toMatch(/^0\.0+$/);
    }finally{await sql`update marts.contract_transactions set cpv_code='45000000-7' where contract_id=887756001`;}
  });
  it("keeps median independent from deterministic pagination and exact-member lookup",async()=>{
    const first=await getPeers(input(),sql),second=await getPeers(input("&page=2"),sql);
    expect(first.members).toHaveLength(20);expect(second.members).toHaveLength(4);
    expect(new Set([...first.members,...second.members].map(m=>m.entity.id)).size).toBe(24);expect(second.cohort).toEqual(first.cohort);
    const selected=await sql.begin("isolation level repeatable read read only",q=>getPeersInSnapshot(q as unknown as DbSql,input(),first.checkpoint,{memberId:"887750001"}));
    expect(selected.members).toHaveLength(1);expect(selected.members[0]?.entity.id).toBe("887750001");
  });
  it("uses registered county for group membership and labels fewer than five others",async()=>{
    const result=await getPeers(input("&county=Buzău"),sql);
    expect(result.cohort).toMatchObject({count:4,medianTotalExact:"10.0004",enoughPeers:false,status:"small_sample",excludedUnknownCounty:1});
    expect(result.focal?.entity.county).toBe("Cluj");expect(result.members.every(m=>m.entity.county==="Buzau")).toBe(true);
    expect(result.members[0]?.spec.filters.county).toBeUndefined();
  });
  it("allows suppliers without claiming institutional type or budget equivalence",async()=>{
    const result=await getPeers({...input(),entityId:"887751001",role:"supplier",cpv:"71"},sql);
    expect(result.cohort).toMatchObject({count:6,authorityKind:null,medianTotalExact:"18.0004",enoughPeers:true});
    expect(result.focal?.totalExact).toBe("4.0004");
  });
  it("refuses unknown institution classes and empty focal selections without broadening scope",async()=>{
    expect((await getPeers({...input(),entityId:"887750026"},sql)).cohort.status).toBe("unknown_authority_type");
    const empty=await getPeers({...input(),year:2022},sql);expect(empty.cohort.status).toBe("no_focal_records");expect(empty.filters.year).toBe(2022);expect(empty.members).toHaveLength(0);
  });
  it("suggests a closed focal year and dominant CPV transparently",async()=>{
    const result=await getPeers(parsePeerInput(new URLSearchParams(`entityId=${a}&role=authority&method=activity&dataset=da`)),sql);
    expect(result.filters).toMatchObject({year:2024,cpv:"45"});expect(result.suggested).toEqual({year:true,cpv:true});expect(result.options.years).toEqual([2024,2023]);
  });
  it("keeps contract allocations distinct from distinct contracts and preserves numeric precision",async()=>{
    const result=await getPeers({...input(),dataset:"contracts"},sql);
    expect(result.focal).toMatchObject({recordCount:2,contractRows:2,distinctContracts:1,totalExact:"0.0067",daRows:0});
  });
  it("reconciles every source spec to the existing exact evidence compiler",async()=>{
    const result=await getPeers(input(),sql);
    for(const item of [result.focal!,...result.members]){
      const rows=await runRows(sql,item.spec,{authority:{query:item.entity.name,entityId:item.entity.id,nameDisplay:item.entity.name,county:item.entity.county,alternatives:[]}},0);
      if("error"in rows)throw new Error(rows.error);
      expect(rows.total).toBe(item.recordCount);expect(sumDecimalStrings([rows.value,`-${item.totalExact}`])).toMatch(/^0\.0+$/);
    }
  });
  it("refuses a truncated full-group capture while keeping exact members available in larger cohorts",async()=>{
    await sql`insert into core.entities(id,name_display,name_normalized,cui_canonical,cui_valid,county,country_code)
      select 887750000+n,'Comuna extra '||n,'extra '||n,(88776000+n)::text,true,'Cluj','RO' from generate_series(31,530)n`;
    await sql`insert into marts.da_transactions(sicap_da_id,authority_id,supplier_id,closing_value,finalization_date,cpv_code)
      select 887760000+n*10+r,887750000+n,${shared}::bigint,n,'2024-06-01','45000000-7' from generate_series(31,530)n cross join generate_series(1,4)r`;
    try{
      const result=await getPeers(input(),sql);expect(result.cohort.count).toBe(524);
      await expect(sql.begin("isolation level repeatable read read only",q=>getPeersInSnapshot(q as unknown as DbSql,input(),result.checkpoint,{allMembers:true}))).rejects.toMatchObject({status:413});
      const exact=await sql.begin("isolation level repeatable read read only",q=>getPeersInSnapshot(q as unknown as DbSql,input(),result.checkpoint,{memberId:"887750031"}));
      expect(exact.members).toHaveLength(1);expect(exact.members[0]?.entity.id).toBe("887750031");expect(exact.cohort).toEqual(result.cohort);
    }finally{
      await sql`delete from marts.da_transactions where authority_id between 887750031 and 887750530`;
      await sql`delete from core.entities where id between 887750031 and 887750530`;
    }
  });
  it("fails closed for reused identities and checkpoints",async()=>{
    const identity=(await readConnectionEntity(sql,a,"authority")).identity;
    await sql`update core.entities set cui_canonical='88775999'where id=${a}`;
    await expect(getPeers({...input(),identity},sql)).rejects.toMatchObject({status:409});
    await sql`update core.entities set cui_canonical='88775000'where id=${a}`;
    await expect(getPeers({...input(),checkpointId:randomUUID()},sql)).rejects.toMatchObject({status:409});
  });
});
