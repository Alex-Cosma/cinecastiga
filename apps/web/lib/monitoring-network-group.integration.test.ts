import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb,type DbSql } from "@seap/db";
import { createMonitoringWatch,getMonitoringRun,monitoringSourceRows } from "./monitoring";
import { evaluateMonitoringWatch } from "./monitoring-engine";
import { MEMBERS_CHANGED } from "./monitoring-input";
import type { AskSpec } from "./ask/spec";

/*
 * A watch on a network's group (options.members network-group, F4n-members-watch;
 * plan §2.8 as the trend's): the partners of the group are fixed at activation;
 * the answer and the sources are those partners' at every check; a partner
 * entering or leaving the live group is only a note.
 */
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1)))throw new Error("Monitoring fixtures require a dedicated seap_test_* database");
describe.skipIf(!url)("a watch on a network's group (isolated PostgreSQL)",()=>{
  let sql:DbSql,checkpointId:string;
  const uid=`network-group-${randomUUID()}`,checkpoints:string[]=[];
  // One institution; its firms against 2024: S1 since 2022 and in 2025 (continuing), S2 in 2025 and S4 in 2024 (new), S3 in 2023 (gone).
  const A="889780001",S=(n:number)=>String(889780010+n);
  const spec=(partners?:"new"|"continuing"|"gone"):AskSpec=>({block:"network",measure:"value",filters:{authorityId:Number(A),authorityName:"Network Group Authority"},network:{since:2024,...(partners?{partners}:{})}});
  async function checkpoint(){
    const id=randomUUID();checkpoints.push(id);
    await sql`insert into app.monitoring_refreshes(id,kind,status,methodology,source_coverage,validation,completed_at)
      values(${id},'baseline','ready',${JSON.stringify({version:"fixture-v1",fixture:uid})}::jsonb,'{}','{}',now())`;
    checkpointId=id;return id;
  }
  const da=(id:number,supplier:string,value:number,date:string)=>sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date,cpv_code)
    values(${id},${"DA network "+id},${A},'Network Group Authority',${supplier},${"Supplier "+supplier},'Cluj',${value},${date},'45000000-7')`;
  const entity=async(id:string,name:string,role="supplier")=>{
    await sql`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid) values(${id},${name},${name.toLowerCase()},'Cluj',${"8896"+id.slice(-5)},true)`;
    await sql`insert into marts.entity_profile(entity_id,role,name_display,county) values(${id},${role},${name},'Cluj')`;
  };
  const run=async(watchId:string)=>{const id=(await evaluateMonitoringWatch(watchId,checkpointId,sql))!;return (await getMonitoringRun(uid,watchId,id,sql))!;};
  const listed=(result:unknown,list:string)=>(result as {lists:Record<string,{rows:{entityId:string}[]}>}).lists[list]!.rows.map(r=>r.entityId).sort();
  beforeAll(async()=>{
    sql=createDb(url).sql;
    await sql`insert into auth.users(id,name,email,email_verified) values(${uid},'Network group owner',${uid+"@example.invalid"},true)`;
    await entity(A,"Network Group Authority","authority");
    for(const n of [1,2,3,4,5])await entity(S(n),`Network Supplier ${n}`);
    await da(889781001,S(1),100,"2022-03-01");await da(889781002,S(1),300,"2025-03-01");
    await da(889781003,S(2),50,"2025-04-01");await da(889781004,S(3),70,"2023-05-01");
    await da(889781005,S(4),20,"2024-06-01");
    await checkpoint();
  });
  afterAll(async()=>{
    if(!sql)return;
    await sql`delete from auth.users where id=${uid}`;
    await sql`delete from app.monitoring_refreshes where id=any(${checkpoints}::uuid[])`;
    await sql`delete from marts.da_transactions where authority_id=${A}`;
    await sql`delete from marts.entity_profile where entity_id between 889780000 and 889789999`;
    await sql`delete from core.entities where id between 889780000 and 889789999`;
    await sql.end();
  });

  let newWatch:string;
  it("fixes the group's partners at activation, and answers and lists sources on them",async()=>{
    const watch=await createMonitoringWatch(uid,{spec:spec("new"),title:"New firms"},sql);newWatch=watch.id;
    expect(watch.options.members).toMatchObject({kind:"network-group",role:"supplier",group:"new",ids:[S(2),S(4)]});
    expect(watch.scopeNotes.some(note=>note.startsWith("Grupa „Noi din 2024”: 2 firme fixate la activare"))).toBe(true);
    const baseline=await run(newWatch);
    expect(baseline.run).toMatchObject({kind:"baseline",hasAlert:false,rowCount:2,totalExact:"70"});
    expect(baseline.result).toMatchObject({list:"new",members:{list:"new",frozen:2}});
    expect(listed(baseline.result,"new")).toEqual([S(2),S(4)]);
    expect((await monitoringSourceRows(uid,newWatch,baseline.run.id,0,sql))?.items.map(r=>r.record.supplierId).sort()).toEqual([S(2),S(4)]);
  });
  it("does not let a firm entering the live group change the result or the sources: the movement is a note",async()=>{
    await da(889781006,S(5),40,"2025-08-01");await checkpoint();
    const next=await run(newWatch);
    expect(next.run).toMatchObject({kind:"unchanged",hasAlert:false,resultChanged:false,rowCount:2,counts:{added:0,removed:0,changed:0}});
    expect(next.run.notes.find(n=>n.startsWith("1 firmă a intrat"))).toMatch(/^1 firmă a intrat în grupă\. Urmărim în continuare cele 2 firme fixate la \d\d\.\d\d\.\d{4}; mișcarea grupei nu produce alerte\.$/);
  });
  it("still alerts on a partner's own records, which also move it out of the live group",async()=>{
    // S2 gets a 2023 record: an added record, changed figures, and it now continues the relation.
    await da(889781007,S(2),10,"2023-09-01");await checkpoint();
    const next=await run(newWatch);
    expect(next.run).toMatchObject({kind:"update",hasAlert:true,resultChanged:true,rowCount:3,counts:{added:1,removed:0,changed:0}});
    expect(listed(next.result,"new")).toEqual([S(2),S(4)]);
    expect(next.run.notes.some(n=>n.startsWith("1 firmă a intrat în grupă, 1 a ieșit."))).toBe(true);
  });
  it("refuses ids that are no longer the group's, and keeps „Toți” a live answer",async()=>{
    const sent={kind:"network-group",role:"supplier",group:"gone",ids:[S(1)],frozenAt:new Date().toISOString()};
    await expect(createMonitoringWatch(uid,{spec:spec("gone"),options:{members:sent}},sql)).rejects.toMatchObject({message:MEMBERS_CHANGED,status:409});
    const gone=await createMonitoringWatch(uid,{spec:spec("gone"),options:{members:{...sent,ids:[S(3)]}}},sql);
    expect(gone.options.members?.ids).toEqual([S(3)]);
    const all=await createMonitoringWatch(uid,{spec:spec()},sql);
    expect(all.options).not.toHaveProperty("members");
    expect((await run(all.id)).result).not.toHaveProperty("members");
  });
});
