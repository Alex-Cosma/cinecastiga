import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildAskRollups,createDb,type DbSql } from "@seap/db";
import { createMonitoringWatch,getMonitoringRun,getMonitoringWatch,monitoringDeltaRows,monitoringSourceRows } from "./monitoring";
import { evaluateMonitoringWatch } from "./monitoring-engine";
import { MEMBERS_CHANGED } from "./monitoring-input";
import { forgetRollupsReady } from "./ask/rollups";
import { forgetTrendGroups } from "./ask/group-ids";
import type { AskSpec } from "./ask/spec";

/*
 * A watch on a trend's group (plan §2.8, §4.7; F2): the members are fixed at
 * activation in options.members, outside the strict bindings; the answer and
 * the sources are those members' at every check; the live group is only a note.
 * The rollups are rebuilt after each change of the marts, as the nightly build
 * does before it publishes a checkpoint, so the live partition reads them.
 */
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1)))throw new Error("Monitoring fixtures require a dedicated seap_test_* database");
describe.skipIf(!url)("a watch on a trend's group (isolated PostgreSQL)",()=>{
  let sql:DbSql,checkpointId:string;
  const uid=`trend-group-${randomUUID()}`,checkpoints:string[]=[];
  // One buyer; its suppliers 2024 → 2025: S1 grows, S2 is new (first record in 2025), S3 is new (active since 2023), S4 falls, S5 is gone.
  const A="889790001",B="889790002",S=(n:number)=>String(889790010+n);
  const spec=(trend:AskSpec["trend"],authority=A):AskSpec=>({block:"trend",measure:"value",dim:"supplier",topN:10,filters:{authorityId:Number(authority),yearFrom:2024,yearTo:2025},...(trend?{trend}:{})});
  async function rebuild(){await sql.begin(async tx=>{await buildAskRollups(tx as unknown as DbSql);});forgetRollupsReady();forgetTrendGroups();}
  async function checkpoint(){
    const id=randomUUID();checkpoints.push(id);
    await sql`insert into app.monitoring_refreshes(id,kind,status,methodology,source_coverage,validation,completed_at)
      values(${id},'baseline','ready',${JSON.stringify({version:"fixture-v1",fixture:uid})}::jsonb,'{}','{}',now())`;
    checkpointId=id;return id;
  }
  const da=(id:number,supplier:string,value:number,date:string,authority=A)=>sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date,cpv_code)
    values(${id},${"DA trend "+id},${authority},'Trend Group Authority',${supplier},${"Supplier "+supplier},'Cluj',${value},${date},'45000000-7')`;
  const entity=async(id:string,name:string,first:string|null,role="supplier")=>{
    await sql`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid) values(${id},${name},${name.toLowerCase()},'Cluj',${"8897"+id.slice(-5)},true)`;
    await sql`insert into marts.entity_profile(entity_id,role,name_display,county,first_activity,last_activity) values(${id},${role},${name},'Cluj',${first},'2025-12-01')`;
  };
  const run=async(watchId:string)=>{const id=(await evaluateMonitoringWatch(watchId,checkpointId,sql))!;return (await getMonitoringRun(uid,watchId,id,sql))!;};
  beforeAll(async()=>{
    sql=createDb(url).sql;
    await sql`insert into auth.users(id,name,email,email_verified) values(${uid},'Trend group owner',${uid+"@example.invalid"},true)`;
    await entity(A,"Trend Group Authority",null,"authority");await entity(B,"Trend Group Authority B",null,"authority");
    for(const [n,first] of [[1,"2021-03-01"],[2,"2025-02-01"],[3,"2023-04-01"],[4,"2020-01-01"],[5,"2019-01-01"]] as const)await entity(S(n),`Trend Supplier ${n}`,first);
    await da(889791001,S(1),100,"2024-03-01");await da(889791002,S(1),300,"2025-03-01");
    await da(889791003,S(2),50,"2025-04-01");await da(889791004,S(3),70,"2025-05-01");
    await da(889791005,S(4),200,"2024-06-01");await da(889791006,S(4),80,"2025-06-01");
    await da(889791007,S(5),60,"2024-07-01");
    await rebuild();await checkpoint();
  });
  afterAll(async()=>{
    if(!sql)return;
    await sql`delete from auth.users where id=${uid}`;
    await sql`delete from app.monitoring_refreshes where id=any(${checkpoints}::uuid[])`;
    await sql`delete from marts.da_transactions where authority_id in (${A},${B})`;
    await sql`delete from core.entity_redirects where old_id between 889790000 and 889799999`;
    await sql`delete from marts.entity_profile where entity_id between 889790000 and 889799999`;
    await sql`delete from core.entities where id between 889790000 and 889799999`;
    await rebuild();
    await sql.end();
  });

  let newWatch:string,firstWatch:string;
  it("fixes the group's members at activation, and answers and lists sources on them",async()=>{
    const watch=await createMonitoringWatch(uid,{spec:spec({change:"new"}),title:"New suppliers"},sql);newWatch=watch.id;
    expect(watch.options.members).toMatchObject({kind:"trend-group",role:"supplier",group:"new",ids:[S(2),S(3)]});
    expect(watch.scopeNotes.some(note=>note.startsWith("Grupa „Noi față de 2024”: 2 firme fixate la activare"))).toBe(true);
    const baseline=await run(newWatch);
    expect(baseline.run).toMatchObject({kind:"baseline",hasAlert:false,rowCount:2,totalExact:"120"});
    expect(baseline.result).toMatchObject({list:"new",composition:{new:{count:2,valueA:0,valueB:120}},members:{list:"new",frozen:2}});
    expect((baseline.result as {rowsTrend:{entityId:string}[]}).rowsTrend.map(r=>r.entityId)).toEqual([S(3),S(2)]);
    expect((await monitoringSourceRows(uid,newWatch,baseline.run.id,0,sql))?.items.map(r=>r.record.supplierId).sort()).toEqual([S(2),S(3)]);
    expect(baseline.run.notes.some(note=>note.includes("grupei fixate „Noi”"))).toBe(true);
  });
  it("does not let a firm entering the live group change the result or the sources: the movement is a note",async()=>{
    await entity(S(6),"Trend Supplier 6","2025-08-01");await da(889791008,S(6),40,"2025-08-01");
    await rebuild();await checkpoint();
    const next=await run(newWatch);
    expect(next.run).toMatchObject({kind:"unchanged",hasAlert:false,resultChanged:false,rowCount:2,counts:{added:0,removed:0,changed:0}});
    expect(next.run.notes.find(n=>n.startsWith("1 firmă a intrat"))).toMatch(/^1 firmă a intrat în grupă\. Urmărim în continuare cele 2 firme fixate la \d\d\.\d\d\.\d{4}; mișcarea grupei nu produce alerte\.$/);
  });
  it("does not let a member leaving the live group produce result_changed or left_selection: it is a note",async()=>{
    const watch=await createMonitoringWatch(uid,{spec:spec({change:"new",firstOnly:true}),title:"First-time suppliers"},sql);firstWatch=watch.id;
    expect(watch.options.members?.ids).toEqual([S(2),S(6)]);
    await run(firstWatch);
    // An earlier record of S2 is found outside the two years: S2 is no longer "prima dată în 2025".
    await sql`update marts.entity_profile set first_activity='2022-09-01' where entity_id=${S(2)} and role='supplier'`;
    await rebuild();await checkpoint();
    const next=await run(firstWatch);
    expect(next.run).toMatchObject({kind:"unchanged",hasAlert:false,resultChanged:false,counts:{added:0,removed:0,changed:0}});
    expect(next.run.notes.some(n=>n.startsWith("1 firmă a ieșit din grupă."))).toBe(true);
    expect((await monitoringDeltaRows(uid,firstWatch,next.run.id,{},sql))?.items).toEqual([]);
    await sql`update marts.entity_profile set first_activity='2025-02-01' where entity_id=${S(2)} and role='supplier'`;
  });
  it("still alerts on a member's own records, which also move it in the live group",async()=>{
    // S3 gets a 2024 record: its records changed (added), its figures changed, and it is now a growth.
    await da(889791009,S(3),10,"2024-09-01");
    await rebuild();await checkpoint();
    const next=await run(newWatch);
    expect(next.run).toMatchObject({kind:"update",hasAlert:true,resultChanged:true,rowCount:3,counts:{added:1,removed:0,changed:0}});
    expect(next.result).toMatchObject({composition:{new:{count:2,valueA:10,valueB:120}}});
    expect(next.run.notes.some(n=>n.startsWith("1 firmă a intrat în grupă, 1 a ieșit."))).toBe(true);
    await sql`delete from marts.da_transactions where sicap_da_id=889791009`;
  });
  it("follows a merged member to its canonical id and drops a vanished one, with notes, never an error",async()=>{
    // S2 is merged into S7 (its records move with it); S3 no longer exists.
    await entity(S(7),"Trend Supplier 7 (canonical)","2025-02-01");
    const identity=(id:string)=>({id,cui:"8897"+id.slice(-5),foreign:null,sicap:[],fallback:""});
    await sql`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${S(2)},${S(7)},'fixture merge',${JSON.stringify({previousIdentity:identity(S(2)),canonicalIdentity:identity(S(7))})}::jsonb)`;
    await sql`update marts.da_transactions set supplier_id=${S(7)} where supplier_id=${S(2)}`;
    await sql`delete from marts.da_transactions where supplier_id=${S(3)}`;
    await sql`delete from marts.entity_profile where entity_id=${S(3)}`;await sql`delete from core.entities where id=${S(3)}`;
    await rebuild();await checkpoint();
    const next=await run(newWatch);
    expect(next.run.kind).toBe("update");
    expect(next.result).toMatchObject({composition:{new:{count:1,valueA:0,valueB:50}},members:{frozen:2}});
    expect((next.result as {rowsTrend:{entityId:string}[]}).rowsTrend.map(r=>r.entityId)).toEqual([S(7)]);
    expect(next.run.notes).toEqual(expect.arrayContaining([
      `1 firmă din grupă nu mai poate fi identificată în date; iese din calcul (ID ${S(3)}).`,
      `1 firmă din grupă a fost unită cu altă înregistrare a aceleiași entități; o urmărim sub identificatorul nou (${S(2)} → ${S(7)}).`,
    ]));
    expect((await getMonitoringWatch(uid,newWatch,sql))?.lastError).toBeNull();
  });
  it("refuses a group above 5,000 members and ids that are no longer the group's",async()=>{
    // 5,001 new suppliers of buyer B in 2025.
    await sql`insert into core.entities(id,name_display,name_normalized,county,cui_valid) select 889792000+n,'Bulk '||n,'bulk '||n,'Cluj',false from generate_series(1,5001) n`;
    await sql`insert into marts.entity_profile(entity_id,role,name_display,county,first_activity) select 889792000+n,'supplier','Bulk '||n,'Cluj','2025-01-01' from generate_series(1,5001) n`;
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date)
      select 889793000+n,'Bulk '||n,${B},'Trend Group Authority B',889792000+n,'Bulk '||n,'Cluj',1,'2025-01-02' from generate_series(1,5001) n`;
    await rebuild();await checkpoint();
    await expect(createMonitoringWatch(uid,{spec:spec({change:"new"},B)},sql)).rejects.toMatchObject({message:"Grupa are 5.001 firme; restrânge perioada sau locul.",status:422});
    const sent={kind:"trend-group",role:"supplier",group:"down",ids:[S(1)],frozenAt:new Date().toISOString()};
    await expect(createMonitoringWatch(uid,{spec:spec({change:"down"}),options:{members:sent}},sql)).rejects.toMatchObject({message:MEMBERS_CHANGED,status:409});
    const down=await createMonitoringWatch(uid,{spec:spec({change:"down"}),options:{members:{...sent,ids:[S(4)]}}},sql);
    expect(down.options.members?.ids).toEqual([S(4)]);
  },60000);
  it("keeps every change a live answer, without fixed members",async()=>{
    const watch=await createMonitoringWatch(uid,{spec:spec(undefined)},sql);
    expect(watch.options).not.toHaveProperty("members");
    expect((await run(watch.id)).result).not.toHaveProperty("members");
  });
});
