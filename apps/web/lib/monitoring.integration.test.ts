import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb,type DbSql } from "@seap/db";
import { createMonitoringWatch,getMonitoringWatch,getMonitoringRun,listMonitoringRuns,monitoringDeltaRows,monitoringSourceRows,reviewMonitoringRun,updateMonitoringWatch,monitoringHealth } from "./monitoring";
import { evaluateMonitoringWatch } from "./monitoring-engine";
import { addMonitoringRunToCase } from "./monitoring-case";
import { getCapturedRows } from "./evidence-captures";
import type { AskSpec } from "./ask/spec";

const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1)))throw new Error("Monitoring fixtures require a dedicated seap_test_* database");
describe.skipIf(!url)("immutable monitoring (isolated PostgreSQL)",()=>{
  let sql:DbSql,checkpointId:string,watchId:string,baselineId:string,updateId:string;
  let createdCpv=false;
  const uid=`monitoring-${randomUUID()}`,other=uid+"-other",inv=randomUUID();
  const authority="889770001",authority2="889770002",supplier="889770003",supplier2="889770004",supplier3="889770005",contract="889770050",natural="889770099";
  const checkpoints:string[]=[];
  const base:AskSpec={block:"stat",measure:"value",filters:{authorityId:Number(authority)}};
  async function checkpoint(status="ready",method="fixture-v1"){
    const id=randomUUID();checkpoints.push(id);
    await sql`insert into app.monitoring_refreshes(id,kind,status,methodology,source_coverage,validation,completed_at)
      values(${id},'baseline',${status},${JSON.stringify({version:method,fixture:uid})}::jsonb,'{}','{}',case when ${status}='running' then null else now() end)`;
    checkpointId=id;return id;
  }
  beforeAll(async()=>{
    sql=createDb(url).sql;
    createdCpv=(await sql`insert into core.cpv_codes(code,name_ro,revision,division) values('45000000-7','Lucrări de construcții (fixture)','Rev.2','45') on conflict(code) do nothing returning code`).length>0;
    await sql`insert into auth.users(id,name,email,email_verified) values(${uid},'Monitoring owner',${uid+"@example.invalid"},true),(${other},'Other owner',${other+"@example.invalid"},false)`;
    await sql`insert into app.investigations(id,owner_user_id,title) values(${inv},${uid},'Monitoring copy fixture')`;
    await sql`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid) values
      (${authority},'Monitoring Authority','monitoring authority','Cluj','88977101',true),(${authority2},'Monitoring Authority B','monitoring authority b','Cluj','88977102',true),
      (${supplier},'Monitoring Supplier','monitoring supplier','Cluj','88977103',true),(${supplier2},'Consortium B','consortium b','Cluj','88977104',true),(${supplier3},'Consortium C','consortium c','Cluj','88977105',true)`;
    await sql`insert into core.direct_acquisitions(sicap_da_id,da_code,authority_entity_id,supplier_entity_id,closing_value,finalization_date,state,cpv_code)
      select 889771000+n,'DA fixture '||n,case when n<=20 then ${authority}::bigint else ${authority2}::bigint end,${supplier}::bigint,10,'2025-01-02'::date,'Oferta acceptata','45000000-7' from generate_series(1,40) n`;
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date,cpv_code)
      select sicap_da_id,da_code,authority_entity_id,case when authority_entity_id=${authority} then 'Monitoring Authority' else 'Monitoring Authority B' end,${supplier},'Monitoring Supplier','Cluj',closing_value,'2025-01-02',cpv_code
      from core.direct_acquisitions where sicap_da_id between 889771001 and 889771040`;
    await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_value,currency,title,contract_date) values(${contract},1,${natural},889770088,0.01,'RON','Tiny consortium','2025-01-02')`;
    await sql`insert into marts.contract_transactions(contract_id,supplier_id,authority_id,authority_name,supplier_name,county,closing_value,contract_value_full,n_winners,ca_notice_id,finalization_date,cpv_code)
      values(${contract},${supplier},${authority},'Monitoring Authority','Monitoring Supplier','Cluj',0.0033,0.01,3,889770088,'2025-01-02','45000000-7'),
      (${contract},${supplier2},${authority},'Monitoring Authority','Consortium B','Cluj',0.0033,0.01,3,889770088,'2025-01-02','45000000-7'),
      (${contract},${supplier3},${authority},'Monitoring Authority','Consortium C','Cluj',0.0034,0.01,3,889770088,'2025-01-02','45000000-7')`;
    await sql`insert into marts.entity_flags(entity_id,role,name_display,county,n_das,total_ron,cri,n_flags,flags)
      values(${authority},'authority','Monitoring Authority','Cluj',20,200,0.2,1,'["da_split"]'),(${authority2},'authority','Monitoring Authority B','Cluj',20,200,0,0,'[]'),(${supplier},'supplier','Monitoring Supplier','Cluj',40,400,0,0,'[]')`;
    await sql`insert into marts.entity_profile(entity_id,role,name_display,county,n_das,total_ron_full)
      values(${authority},'authority','Monitoring Authority','Cluj',20,200.01),(${authority2},'authority','Monitoring Authority B','Cluj',20,200),(${supplier},'supplier','Monitoring Supplier','Cluj',40,400.0033)`;
    await checkpoint();
  });
  afterAll(async()=>{
    if(!sql)return;
    await sql`delete from auth.users where id in (${uid},${other})`;
    await sql`delete from app.monitoring_refreshes where id=any(${checkpoints}::uuid[])`;
    await sql`delete from marts.da_transactions where authority_id in (${authority},${authority2})`;
    await sql`delete from marts.contract_transactions where authority_id=${authority}`;
    await sql`delete from marts.entity_flags where entity_id in (${authority},${authority2},${supplier})`;
    await sql`delete from marts.entity_profile where entity_id in (${authority},${authority2},${supplier})`;
    await sql`delete from core.direct_acquisitions where authority_entity_id in (${authority},${authority2})`;
    await sql`delete from core.contracts where id=${contract}`;
    await sql`delete from core.entities where id in (${authority},${authority2},${supplier},${supplier2},${supplier3})`;
    if(createdCpv)await sql`delete from core.cpv_codes where code='45000000-7'`;
    await sql.end();
  });
  it("counts pending checks on the current ready checkpoint, including post-baseline backlog",async()=>{
    // This owner is distinct from all other scenarios and browser fixtures.
    const watch=await createMonitoringWatch(other,{spec:base,title:"Pending checkpoint fixture"},sql);
    expect(await monitoringHealth(other,sql)).toMatchObject({pending:1,failed:0,paused:0});
    await evaluateMonitoringWatch(watch.id,checkpointId,sql);
    expect((await monitoringHealth(other,sql)).pending).toBe(0);
    await checkpoint();
    expect((await monitoringHealth(other,sql)).pending).toBe(1);
    await evaluateMonitoringWatch(watch.id,checkpointId,sql);
    expect((await monitoringHealth(other,sql)).pending).toBe(0);
    await checkpoint("failed");
    expect((await monitoringHealth(other,sql)).pending).toBe(0);
    await checkpoint("running");
    expect((await monitoringHealth(other,sql)).pending).toBe(0);
    await checkpoint();
    await sql`update app.monitoring_watches set last_error='Previous attempt failed' where id=${watch.id}`;
    expect(await monitoringHealth(other,sql)).toMatchObject({pending:1,failed:1});
    await updateMonitoringWatch(other,watch.id,{paused:true},sql);
    expect(await monitoringHealth(other,sql)).toMatchObject({pending:0,paused:1});
    await sql`delete from app.monitoring_watches where id=${watch.id} and owner_user_id=${other}`;
  });
  it("pins a private exact scope and creates one silent baseline per checkpoint",async()=>{
    const watch=await createMonitoringWatch(uid,{spec:base,title:"Exact amounts"},sql);watchId=watch.id;
    expect(watch.spec.filters.authorityName).toBe("Monitoring Authority");expect(await getMonitoringWatch(other,watchId,sql)).toBeNull();
    baselineId=(await evaluateMonitoringWatch(watchId,checkpointId,sql))!;
    const baseline=await getMonitoringRun(uid,watchId,baselineId,sql);
    expect(baseline?.run).toMatchObject({kind:"baseline",hasAlert:false,rowCount:23,totalExact:"200.01",counts:{added:0,removed:0,changed:0}});
    expect(await evaluateMonitoringWatch(watchId,checkpointId,sql)).toBe(baselineId);
    expect((await listMonitoringRuns(uid,{watchId},sql)).items).toHaveLength(1);
    expect((await monitoringSourceRows(uid,watchId,baselineId,0,sql))?.items.filter(r=>r.record.src==="contracts").map(r=>r.record.valueExact)).toEqual(["0.0033","0.0033","0.0034"]);
  });
  it("supports all 13 views including historical profiles without generating initial alerts",async()=>{
    const specs:AskSpec[]=[base,{...base,block:"table",dim:"supplier",topN:5},{...base,block:"timeseries"},{...base,block:"map"},{...base,block:"breakdown"},{...base,block:"network"},{...base,block:"sankey"},
      {...base,block:"fact_check",filters:{...base.filters,supplierId:Number(supplier)}},{...base,block:"trend",dim:"supplier",filters:{...base.filters,yearFrom:2024,yearTo:2025}},
      {...base,block:"compare",comparisonMode:"transactions",filters:{...base.filters,compareWithId:Number(authority2)}},
      {...base,block:"distribution",dataset:"da"},{block:"scatter",measure:"value",dataset:"da",dim:"authority",filters:{}},{block:"entity_card",measure:"value",dataset:"da",dim:"authority",rankBy:"risk",filters:{}},
      {...base,block:"compare",comparisonMode:"profiles",dataset:"da",filters:{...base.filters,compareWithId:Number(authority2)}}];
    expect(new Set(specs.map(s=>s.block)).size).toBe(13);
    for(const spec of specs){
      const watch=await createMonitoringWatch(uid,{spec,title:"View "+spec.block},sql);
      const id=await evaluateMonitoringWatch(watch.id,checkpointId,sql);
      expect(id,spec.block).toBeTruthy();expect((await getMonitoringRun(uid,watch.id,id!,sql))?.run.hasAlert,spec.block).toBe(false);
    }
  },60000);
  it("does not alert on parent-result changes outside the exact watched drawer selection",async()=>{
    const watch=await createMonitoringWatch(uid,{spec:base,options:{scope:{role:"supplier",entityIds:[supplier2]}},title:"One selected consortium supplier"},sql);
    expect(watch.scopeNotes.some(note=>note.includes("nu declanșează alerte"))).toBe(true);
    const first=(await evaluateMonitoringWatch(watch.id,checkpointId,sql))!;
    await sql`update marts.da_transactions set closing_value=11 where sicap_da_id=889771001`;
    await checkpoint();const second=(await evaluateMonitoringWatch(watch.id,checkpointId,sql))!;
    const detail=await getMonitoringRun(uid,watch.id,second,sql);
    expect(detail?.result).not.toEqual(detail?.previousResult);
    expect(detail?.run).toMatchObject({previousRunId:first,kind:"unchanged",hasAlert:false,resultChanged:false,rowCount:1,totalExact:"0.0033",counts:{added:0,removed:0,changed:0}});
    await sql`update marts.da_transactions set closing_value=10 where sicap_da_id=889771001`;
  });
  it("freezes exact before/after deltas with truthful observation-date classes",async()=>{
    // Controlled historical observation time on this synthetic baseline only.
    await sql`update app.monitoring_runs set checked_at=now()-interval '1 day' where id=${baselineId}`;
    await sql`update marts.da_transactions set closing_value=10.000000000001 where sicap_da_id=889771001`;
    await sql`delete from marts.da_transactions where sicap_da_id=889771002`;
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date,cpv_code)
      values(889771101,'Historical first observed',${authority},'Monitoring Authority',${supplier},'Monitoring Supplier','Cluj',50,'2020-01-01','45000000-7'),
      (889771102,'Recent date',${authority},'Monitoring Authority',${supplier},'Monitoring Supplier','Cluj',60,to_char(now() at time zone 'Europe/Bucharest','YYYY-MM-DD'),'45000000-7'),
      (889771103,'Unknown date',${authority},'Monitoring Authority',${supplier},'Monitoring Supplier','Cluj',70,null,'45000000-7')`;
    await checkpoint();updateId=(await evaluateMonitoringWatch(watchId,checkpointId,sql))!;
    const detail=await getMonitoringRun(uid,watchId,updateId,sql),rows=await monitoringDeltaRows(uid,watchId,updateId,{},sql);
    expect(detail?.run).toMatchObject({kind:"update",hasAlert:true,counts:{added:3,removed:1,changed:1},totalExact:"370.010000000001",totalDifferenceExact:"170.000000000001"});
    expect(rows?.items.map(r=>r.classification).sort()).toEqual(["historical_first_observed","new_dated_record","date_unknown","left_selection","source_changed"].sort());
    const changed=rows?.items.find(r=>r.type==="changed");expect(changed?.before?.valueExact).toBe("10");expect(changed?.after?.valueExact).toBe("10.000000000001");expect(changed?.amountDifferenceExact).toBe("0.000000000001");expect(changed?.changedFields).toEqual(["valueExact"]);
    expect((await getMonitoringRun(uid,watchId,baselineId,sql))?.run.totalExact).toBe("200.01");
    expect(await monitoringDeltaRows(other,watchId,updateId,{},sql)).toBeNull();
    await reviewMonitoringRun(uid,watchId,updateId,true,sql);expect((await getMonitoringRun(uid,watchId,updateId,sql))?.run.reviewedAt).toBeTruthy();
    await reviewMonitoringRun(uid,watchId,updateId,false,sql);expect((await getMonitoringRun(uid,watchId,updateId,sql))?.run.reviewedAt).toBeNull();
  });
  it("copies both original sides and a verification task to a case exactly once",async()=>{
    expect(await addMonitoringRunToCase(other,watchId,updateId,inv,true,sql)).toBeNull();
    await sql`update marts.da_transactions set closing_value=999 where sicap_da_id=889771001`;
    const saved=await addMonitoringRunToCase(uid,watchId,updateId,inv,true,sql);expect(saved?.taskId).toBeTruthy();
    expect(await addMonitoringRunToCase(uid,watchId,updateId,inv,true,sql)).toEqual(saved);
    const before=await getCapturedRows(uid,inv,saved!.beforeCaptureId,0,sql),after=await getCapturedRows(uid,inv,saved!.afterCaptureId,0,sql);
    expect(before?.capture.summary?.monitoringSide).toBe("before");expect(after?.capture.summary?.monitoringSide).toBe("after");
    expect(before?.rows.find(r=>r.refId==="889771001")?.valueExact).toBe("10");expect(after?.rows.find(r=>r.refId==="889771001")?.valueExact).toBe("10.000000000001");
    expect((after?.rows.find(r=>r.refId==="889771001") as unknown as {monitoringChange:{changedFields:string[]}})?.monitoringChange.changedFields).toEqual(["valueExact"]);
    await sql`update marts.da_transactions set closing_value=10.000000000001 where sicap_da_id=889771001`;
  });
  it("keeps last good evidence on refresh failure and honors pause and exact preferences",async()=>{
    await checkpoint("failed");await expect(evaluateMonitoringWatch(watchId,checkpointId,sql)).rejects.toThrow("actualizare completă");
    expect(await getMonitoringWatch(uid,watchId,sql)).toMatchObject({lastSuccessRunId:updateId});expect((await getMonitoringWatch(uid,watchId,sql))?.lastError).toBeTruthy();
    await updateMonitoringWatch(uid,watchId,{paused:true},sql);await checkpoint();expect(await evaluateMonitoringWatch(watchId,checkpointId,sql)).toBeNull();
    await updateMonitoringWatch(uid,watchId,{paused:false,preferences:{types:["added"],minimumValueExact:"1000",digest:false}},sql);
    const next=(await evaluateMonitoringWatch(watchId,checkpointId,sql))!;expect((await getMonitoringRun(uid,watchId,next,sql))?.run).toMatchObject({kind:"unchanged",hasAlert:false});
    expect((await getMonitoringWatch(uid,watchId,sql))?.lastError).toBeNull();
    await expect(updateMonitoringWatch(uid,watchId,{spec:{...base,filters:{}}},sql)).rejects.toThrow("fixe");
    await expect(createMonitoringWatch(other,{spec:base,preferences:{digest:true}},sql)).rejects.toThrow("Confirmă adresa");
  });
  it("fails closed on reused entity IDs instead of following a different organization",async()=>{
    const before=(await getMonitoringWatch(uid,watchId,sql))!.lastSuccessRunId;
    await sql`update core.entities set cui_canonical='88977999' where id=${authority}`;await checkpoint();
    await expect(evaluateMonitoringWatch(watchId,checkpointId,sql)).rejects.toThrow("Identitatea");
    expect((await getMonitoringWatch(uid,watchId,sql))?.lastSuccessRunId).toBe(before);
    await sql`update core.entities set cui_canonical='88977101' where id=${authority}`;
  });
  it("separates profile-only recalculations and methodology changes from source changes",async()=>{
    const spec:AskSpec={...base,block:"compare",comparisonMode:"profiles",dataset:"da",filters:{...base.filters,compareWithId:Number(authority2)}};
    const watch=await createMonitoringWatch(uid,{spec},sql);await evaluateMonitoringWatch(watch.id,checkpointId,sql);
    await sql`update marts.entity_flags set cri=0.4 where entity_id=${authority} and role='authority'`;await checkpoint();
    const recalculated=(await evaluateMonitoringWatch(watch.id,checkpointId,sql))!;
    expect((await getMonitoringRun(uid,watch.id,recalculated,sql))?.run).toMatchObject({resultChanged:true,methodologyChanged:false,hasAlert:true,counts:{added:0,removed:0,changed:0}});
    await checkpoint("ready","fixture-v2");const method=(await evaluateMonitoringWatch(watch.id,checkpointId,sql))!;
    expect((await getMonitoringRun(uid,watch.id,method,sql))?.run).toMatchObject({resultChanged:false,methodologyChanged:true,hasAlert:true,counts:{added:0,removed:0,changed:0}});
  });
  it("rejects oversized populations before copying, with no partial run",async()=>{
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,closing_value,finalization_date)
      select 889800000+n,'Overflow fixture',${authority},'Monitoring Authority',${supplier},'Monitoring Supplier',1,'2025-01-02' from generate_series(1,200001) n`;
    await checkpoint();const previous=(await getMonitoringWatch(uid,watchId,sql))!.lastSuccessRunId;
    await expect(evaluateMonitoringWatch(watchId,checkpointId,sql)).rejects.toThrow("200.000");
    expect((await getMonitoringWatch(uid,watchId,sql))?.lastSuccessRunId).toBe(previous);
    expect((await sql`select count(*)::int n from app.monitoring_runs where watch_id=${watchId} and checkpoint_id=${checkpointId}`)[0]?.n).toBe(0);
    await sql`delete from marts.da_transactions where sicap_da_id between 889800001 and 890000001`;
  },60000);
});
