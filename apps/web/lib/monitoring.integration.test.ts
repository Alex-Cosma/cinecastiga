import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb,type DbSql } from "@seap/db";
import { createMonitoringWatch,getMonitoringWatch,getMonitoringRun,listMonitoringRuns,monitoringDeltaRows,monitoringSourceRows,reviewMonitoringRun,updateMonitoringWatch,monitoringHealth } from "./monitoring";
import { evaluateMonitoringWatch } from "./monitoring-engine";
import { addMonitoringRunToCase } from "./monitoring-case";
import { getCapturedRows } from "./evidence-captures";
import { NEWER_VERSION_QUESTION, type AskSpec } from "./ask/spec";
import { ANSWER_VERSIONS, KEY_VERSIONS } from "./ask/answer-core";

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
  // F0a: a watch a newer release stored (a key or a fixed group this code does not apply) is never run without it.
  it("keeps the last good result of a watch stored by a newer release and says why",async()=>{
    const watch=await createMonitoringWatch(uid,{spec:base,title:"Newer release fixture"},sql);
    const good=(await evaluateMonitoringWatch(watch.id,checkpointId,sql))!;
    await sql`update app.monitoring_watches set spec=jsonb_set(spec,'{filters,purchaseKind}','"lucrari"') where id=${watch.id}`;
    await checkpoint();
    await expect(evaluateMonitoringWatch(watch.id,checkpointId,sql)).rejects.toThrow(NEWER_VERSION_QUESTION);
    expect(await getMonitoringWatch(uid,watch.id,sql)).toMatchObject({lastSuccessRunId:good,lastError:NEWER_VERSION_QUESTION});
    const members={kind:"trend-group",role:"supplier",group:"new",ids:[supplier],frozenAt:"2026-10-24T10:00:00Z"};
    await sql`update app.monitoring_watches set spec=spec #- '{filters,purchaseKind}',options=options||${JSON.stringify({members})}::jsonb where id=${watch.id}`;
    await expect(evaluateMonitoringWatch(watch.id,checkpointId,sql)).rejects.toThrow(NEWER_VERSION_QUESTION);
    expect(await getMonitoringWatch(uid,watch.id,sql)).toMatchObject({lastSuccessRunId:good,lastError:NEWER_VERSION_QUESTION});
    expect((await sql`select count(*)::int n from app.monitoring_runs where watch_id=${watch.id} and checkpoint_id=${checkpointId}`)[0]?.n).toBe(0);
    await expect(createMonitoringWatch(uid,{spec:{...base,filters:{...base.filters,purchaseKind:"lucrari"}}},sql)).rejects.toThrow(NEWER_VERSION_QUESTION);
  });
  // F0 (plan §2.8, §6.2): answer versions per block and per key, compared in TypeScript.
  const run=async(watchId:string)=>{const id=(await evaluateMonitoringWatch(watchId,checkpointId,sql))!;return (await getMonitoringRun(uid,watchId,id,sql))!;};
  it("stores only a bumped answer version, and reads a run without one (or with the first) as the first one: no alert",async()=>{
    const watch=await createMonitoringWatch(uid,{spec:base,title:"Before answer versions"},sql);
    const first=await run(watch.id);
    // Nothing bumped: the methodology is stored as before F0, so code from before F0 (jsonb equality) sees no change after a revert.
    expect(first.methodology).not.toHaveProperty("answer");
    await checkpoint();
    const second=await run(watch.id);
    expect(second.run).toMatchObject({kind:"unchanged",methodologyChanged:false,resultChanged:false,hasAlert:false});
    expect((await sql`select a.methodology=b.methodology same from app.monitoring_runs a,app.monitoring_runs b where a.id=${first.run.id} and b.id=${second.run.id}`)[0]?.same).toBe(true);
    // A run written while F0 stored the first version explicitly reads the same.
    await sql`update app.monitoring_runs set methodology=methodology||'{"answer":{"question":"stat-1","conditions":{}}}'::jsonb where id=${second.run.id}`;
    await checkpoint();
    expect((await run(watch.id)).run).toMatchObject({kind:"unchanged",methodologyChanged:false,resultChanged:false,hasAlert:false});
  });
  it("alerts once on a new answer version, only the watches of that block; a watch without methodology alerts hears the new result",async()=>{
    const trend:AskSpec={...base,block:"trend",dim:"supplier",filters:{...base.filters,yearFrom:2024,yearTo:2025}};
    // The watches start as before F2 (trend-1); the release of trend-2 then reaches them.
    const released=ANSWER_VERSIONS.trend!;expect(released).toBe("trend-2");delete ANSWER_VERSIONS.trend;
    try{
    const watches=[];
    for(const spec of [trend,base,{...base,block:"map"} as AskSpec]){const watch=await createMonitoringWatch(uid,{spec,title:"Answer version "+spec.block},sql);await run(watch.id);watches.push(watch);}
    // Alerts on "recalculated" only. Its last result is the one the old version gave: different, on the same sources.
    const quiet=await createMonitoringWatch(uid,{spec:trend,title:"Recalculated only",preferences:{types:["recalculated"],minimumValueExact:"0",digest:false}},sql);
    const old=await run(quiet.id);
    await sql`update app.monitoring_runs set result=result||'{"fixture":"computed by trend-1"}'::jsonb where id=${old.run.id}`;
    ANSWER_VERSIONS.trend=released;
      await checkpoint();
      const [trendRun,statRun,mapRun]=[await run(watches[0]!.id),await run(watches[1]!.id),await run(watches[2]!.id)];
      expect(trendRun.run).toMatchObject({kind:"update",methodologyChanged:true,resultChanged:false,hasAlert:true,counts:{added:0,removed:0,changed:0}});
      expect(trendRun.methodology.answer).toEqual({question:"trend-2",conditions:{}});
      for(const other of [statRun,mapRun])expect(other.run).toMatchObject({kind:"unchanged",methodologyChanged:false,hasAlert:false});
      // No methodology alert reaches it, so the changed result is not silenced: it alerts as recalculated.
      expect((await run(quiet.id)).run).toMatchObject({resultChanged:true,methodologyChanged:true,hasAlert:true});
      await checkpoint();
      expect((await run(watches[0]!.id)).run).toMatchObject({kind:"unchanged",methodologyChanged:false,hasAlert:false});
    }finally{ANSWER_VERSIONS.trend=released;}
  });
  it("alerts on a key's new version only the watches whose question carries the key",async()=>{
    const kind:AskSpec={...base,filters:{...base.filters,authorityKind:"comuna"}};
    const [withKind,without]=[await createMonitoringWatch(uid,{spec:kind,title:"With a kind"},sql),await createMonitoringWatch(uid,{spec:base,title:"Without a kind"},sql)];
    await run(withKind.id);await run(without.id);
    KEY_VERSIONS.kind={version:"kind-2",label:"Tipul instituției",paths:["filters.authorityKind"]};
    try{
      await checkpoint();
      const changed=await run(withKind.id);
      expect(changed.run).toMatchObject({methodologyChanged:true,hasAlert:true});
      expect(changed.methodology.answer).toEqual({question:"stat-1",conditions:{kind:"kind-2"}});
      expect((await run(without.id)).run).toMatchObject({methodologyChanged:false,hasAlert:false});
    }finally{delete KEY_VERSIONS.kind;}
  });
  it("freezes the answer version with a captured answer and with both sides of an update copied to a case",async()=>{
    const watch=await createMonitoringWatch(uid,{spec:base,title:"Case versions"},sql);
    await run(watch.id);
    await sql`update marts.da_transactions set closing_value=12 where sicap_da_id=889771003`;
    await checkpoint();const update=await run(watch.id);
    await sql`update marts.da_transactions set closing_value=10 where sicap_da_id=889771003`;
    expect(update.run.kind).toBe("update");
    const saved=(await addMonitoringRunToCase(uid,watch.id,update.run.id,inv,false,sql))!;
    const [after]=await sql`select result from app.evidence_captures where id=${saved.afterCaptureId}`;
    const version={question:"stat-1",conditions:{}};
    expect(after!.result.answerVersions).toEqual({original:version,previous:version,current:version});
  });
  it("watches a recipe saved with another block's options: the recipe is compared as parseSpec reads it",async()=>{
    const [recipe]=await sql`insert into app.query_recipes(owner_user_id,title) values(${uid},'Rețetă cu opțiunile altei întrebări') returning id`;
    const recipeId=String(recipe!.id);
    const homePopulation={operator:"and",groups:[{operator:"and",conditions:[{field:"value",op:"lte",value:"2000000"}]}]};
    const stored={...base,population:homePopulation,trend:{change:"up"}};
    await sql`insert into app.query_recipe_versions(recipe_id,version,title,note,spec) values(${recipeId},1,'v1',null,${JSON.stringify(stored)}::jsonb),
      (${recipeId},2,'v2',null,${JSON.stringify({...base,filters:{...base.filters,yearFrom:2025}})}::jsonb)`;
    try{
      const watch=await createMonitoringWatch(uid,{spec:{...base,population:homePopulation},recipeId,recipeVersion:1},sql);
      expect(watch).toMatchObject({recipeId,recipeVersion:1});
      expect(watch.spec.population).toEqual(homePopulation);
      await expect(createMonitoringWatch(uid,{spec:base,recipeId,recipeVersion:2},sql)).rejects.toThrow("diferă de versiunea rețetei");
      // The recipe itself is not rewritten.
      expect((await sql`select spec from app.query_recipe_versions where recipe_id=${recipeId} and version=1`)[0]?.spec).toEqual(stored);
    }finally{await sql`delete from app.query_recipes where id=${recipeId}`;}
  });
});
