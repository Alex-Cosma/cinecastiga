import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb,type DbSql } from "@seap/db";
import { readConnectionEntity } from "./connections";
import { bindPeerEvidence,withPeerEvidence } from "./peers-evidence";
import type { CurrentPeerEvidenceSelection, PeerEvidenceSelection } from "./peers-evidence-shared";
import { POPULATION_VERSION } from "./peer-population";
import { queueCapture,processCapture,getCapturedRows,recaptureClip } from "./evidence-captures";
import { validateCaptureRequest } from "./evidence-capture-input";
import { investigationExport } from "./evidence-bundle";
import { POST as rowsRoute } from "../app/api/ask/rows/route";
import { POST as csvRoute } from "../app/api/ask/rows/csv/route";
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1)))throw new Error("Peer evidence fixtures require seap_test_* database");
describe.skipIf(!url)("peer sources and immutable captures (isolated PostgreSQL)",()=>{
  let sql:DbSql,selection:PeerEvidenceSelection;
  const uid=`peer-capture-${randomUUID()}`,inv=randomUUID(),checkpoint=randomUUID(),authority="887790000",focal="887791001",contract="887792001";
  beforeAll(async()=>{
    sql=createDb(url).sql;(globalThis as typeof globalThis & {__seapAskSql?:DbSql}).__seapAskSql=sql;
    await sql`insert into auth.users(id,name,email)values(${uid},'Peer capture fixture',${uid+'@example.invalid'})`;
    await sql`insert into app.investigations(id,owner_user_id,title)values(${inv},${uid},'Peer comparison fixture')`;
    await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at)values(${checkpoint},'baseline','ready',now())`;
    await sql`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid)values(${authority},'Comuna Test','comuna test','Buzau','88779000',true)`;
    await sql`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid)
      select 887791000+n,'Firma '||n,'firma '||n,'Cluj',(88779100+n)::text,true from generate_series(1,7)n`;
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date,cpv_code)
      select 887793000+n,'DA-peer-'||n,${authority}::bigint,'Comuna Test',887791000+n,'Firma '||n,'Buzau',n+0.0001,'2025-03-01','45000000-7' from generate_series(1,6)n`;
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,supplier_id,county,closing_value,finalization_date,cpv_code)
      values(887793099,'DA-other-year',${authority},887791007,'Buzau',777,'2024-03-01','45000000-7')`;
    await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_value,currency,title,contract_date)
      values(${contract},1,887792099,887792088,100.01,'RON','Contract comun','2025-03-02')`;
    await sql`insert into marts.contract_transactions(contract_id,supplier_id,authority_id,authority_name,supplier_name,county,closing_value,contract_value_full,n_winners,ca_notice_id,ted_pubnum,finalization_date,cpv_code)
      values(${contract},${focal},${authority},'Comuna Test','Firma 1','Buzau',50.005,100.01,2,887792088,'12345-2025','2025-03-02','45000000-7'),
      (${contract},887791002,${authority},'Comuna Test','Firma 2','Buzau',50.005,100.01,2,887792088,'12345-2025','2025-03-02','45000000-7')`;
    for (const [index,county] of ["Buzau","Braila","Botosani","Arad","Bacau","Alba","Bihor"].entries()) {
      const id=String(887794001+index),name=`Consiliul Judetean ${county}`;
      await sql`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid)
        values(${id},${name},${name.toLowerCase()},${county},${String(88779401+index)},true)`;
      await sql`insert into core.entity_sicap_ids(entity_id,namespace,sicap_id) values(${id},'authority',${887794001+index})`;
      if(index<6)await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,county,closing_value,finalization_date,cpv_code)
        values(${887795001+index},${'DA-county-'+index},${id},${name},${focal},${county},${String((index+1)*10)+'.0001'},'2025-04-01','48000000-8')`;
    }
    const entity=await readConnectionEntity(sql,focal,"supplier");
    selection={version:"peer-evidence-1",checkpointId:checkpoint,entityId:focal,identity:entity.identity,role:"supplier",dataset:"all",year:2025,cpv:"45",county:"Cluj",selection:{kind:"comparison"}};
  });
  afterAll(async()=>{
    if(!sql)return;
    await sql`delete from auth.users where id=${uid}`;
    await sql`delete from marts.da_transactions where authority_id=${authority}`;
    await sql`delete from marts.contract_transactions where authority_id=${authority}`;
    await sql`delete from marts.da_transactions where authority_id between 887794001 and 887794007`;
    await sql`delete from core.contracts where id=${contract}`;
    await sql`delete from core.entities where id=${authority} or id between 887791001 and 887791007`;
    await sql`delete from core.entity_sicap_ids where entity_id between 887794001 and 887794007`;
    await sql`delete from core.entities where id between 887794001 and 887794007`;
    await sql`delete from app.monitoring_refreshes where id=${checkpoint}`;
    delete(globalThis as typeof globalThis & {__seapAskSql?:DbSql}).__seapAskSql;await sql.end();
  });
  async function queued(marker=selection,evidenceOptions:Record<string,unknown>={}){
    const request=validateCaptureRequest("query",null,{block:"stat",measure:"value",filters:{}},{peer:marker,evidenceOptions,title:"Forged comparison",valueRon:999999});
    if("error"in request)throw new Error(request.error);const clipId=randomUUID();
    const capture=await sql.begin(async q=>{
      await q`insert into app.clips(id,investigation_id,kind,spec,snapshot,created_by)values(${clipId},${inv},'query',${JSON.stringify(request.spec)}::jsonb,${JSON.stringify({peer:request.peer})}::jsonb,${uid})`;
      return queueCapture(q as unknown as DbSql,uid,inv,clipId,request);
    });return{capture,clipId};
  }
  async function member(id:string):Promise<PeerEvidenceSelection>{const entity=await readConnectionEntity(sql,id,"supplier");return{...selection,selection:{kind:"member",entityId:id,identity:entity.identity}};}
  async function manual(ids:string[]):Promise<CurrentPeerEvidenceSelection>{
    const members=await Promise.all(ids.map(async id=>{const entity=await readConnectionEntity(sql,id,"supplier");return{id,identity:entity.identity};}));
    const {county:_,...base}=selection;
    return{...base,version:"peer-evidence-2",method:"manual",populationVersion:POPULATION_VERSION,members};
  }
  async function population():Promise<CurrentPeerEvidenceSelection>{
    const entity=await readConnectionEntity(sql,"887794001","authority");
    return{version:"peer-evidence-2",checkpointId:checkpoint,entityId:entity.id,identity:entity.identity,role:"authority",dataset:"da",year:2025,cpv:"48",method:"population",populationVersion:POPULATION_VERSION,selection:{kind:"comparison"}};
  }
  it("freezes every cohort member and all exact allocation sources with readable export context",async()=>{
    const legacy=await withPeerEvidence(sql,selection,async(_,bound)=>bound);
    expect(legacy.comparison.methodology.version).toBe("peers-1");
    expect(legacy.comparison.cohort).not.toHaveProperty("observedMemberCount");
    expect(legacy.comparison.filters).not.toHaveProperty("method");
    expect(legacy.comparison.focal).not.toHaveProperty("population");
    const {capture}=await queued();await processCapture(uid,inv,capture.id,sql);
    const [job]=await sql`select status,error from app.evidence_captures where id=${capture.id}`;expect(job?.status,job?.error).toBe("complete");
    const result=await getCapturedRows(uid,inv,capture.id,0,sql);
    expect(result?.capture.status,result?.capture.error??undefined).toBe("complete");expect(result?.rows).toHaveLength(8);
    expect(result?.capture.totalExact).toBe("121.0106");expect(new Set(result?.rows.map(row=>row.supplierId)).size).toBe(6);
    expect(result?.rows.every(row=>row.county==="Buzau")).toBe(true);
    const context=result?.capture.summary?.peerContext as Record<string,unknown>;
    expect(context.cohort).toMatchObject({count:5,medianTotalExact:"5.0001"});expect(context.members).toHaveLength(5);
    expect((result?.rows.find(row=>row.src==="contracts"))).toMatchObject({refId:"887792099",valueExact:"50.005",contractValueFull:"100.01",sourceUrl:"https://e-licitatie.ro/pub/notices/ca-notices/view-c/887792088",tedUrl:"https://ted.europa.eu/en/notice/-/detail/12345-2025"});
    expect(JSON.stringify(context)).not.toContain("Forged comparison");
    const exported=await investigationExport(uid,inv,"https://example.invalid","md",sql);const md=await exported?.text();
    expect(md).toContain("Mediana valorii totale");expect(md).toContain("Firma 6");expect(md).toContain("5.0001");
  });
  it("binds real rows and CSV handlers to cohort membership rather than a browser spec or buyer county",async()=>{
    const body={spec:{block:"stat",measure:"value",filters:{yearFrom:2024,county:"Buzau"}},peer:selection};
    const rows=await rowsRoute(new Request("http://localhost/api/ask/rows",{method:"POST",body:JSON.stringify(body)}));
    const data=await rows.json();expect(rows.status).toBe(200);expect(data.total).toBe(8);expect(data.value).toBe("121.0106");
    const csv=await csvRoute(new Request("http://localhost/api/ask/rows/csv",{method:"POST",body:JSON.stringify(body)}));
    expect(csv.headers.get("x-total-rows")).toBe("8");expect(await csv.text()).toContain("12345-2025");
    const scoped=await rowsRoute(new Request("http://localhost/api/ask/rows",{method:"POST",body:JSON.stringify({...body,scope:{entityIds:["887791007"],role:"supplier"}})}));expect(scoped.status).toBe(400);
  });
  it("allows an exact member and rejects a nonmember or reused member identity",async()=>{
    const marker=await member("887791006");const bound=await withPeerEvidence(sql,marker,async(_,b)=>b);expect(bound.sourceMembers).toHaveLength(1);
    await expect(withPeerEvidence(sql,await member("887791007"),async()=>true)).rejects.toThrow("nu aparține grupului");
    await sql`update core.entities set cui_canonical='99999999'where id=887791006`;
    try{await expect(withPeerEvidence(sql,marker,async()=>true)).rejects.toThrow("Identitatea");}
    finally{await sql`update core.entities set cui_canonical='88779106'where id=887791006`;}
  });
  it("rejects locally filtered whole-group capture and labels filtered member sources without claiming the full group",async()=>{
    await expect(queued(selection,{stream:"contracts"})).rejects.toThrow("Elimină filtrele");
    const {capture}=await queued(await member(focal),{stream:"contracts"});await processCapture(uid,inv,capture.id,sql);
    const [job]=await sql`select status,error from app.evidence_captures where id=${capture.id}`;expect(job?.status,job?.error).toBe("complete");
    const result=await getCapturedRows(uid,inv,capture.id,0,sql);expect(result?.capture.status,result?.capture.error??undefined).toBe("complete");
    expect(result?.rows).toHaveLength(1);expect(result?.capture.totalExact).toBe("50.005");
    expect(result?.capture.summary?.peerContext).toMatchObject({selectionKind:"member",filteredMemberSources:true});
  });
  it("fails delayed capture atomically if any full-group member identity changes",async()=>{
    const {capture,clipId}=await queued();await sql`update core.entities set cui_canonical='99999999'where id=887791006`;
    try{
      await processCapture(uid,inv,capture.id,sql);const [failed]=await sql`select status,error from app.evidence_captures where id=${capture.id}`;
      expect(failed?.status).toBe("failed");expect(failed?.error).toContain("Membrii sau datele");
      expect((await sql`select count(*)::int n from app.evidence_capture_rows where capture_id=${capture.id}`)[0]?.n).toBe(0);
      await expect(recaptureClip(uid,inv,clipId,sql)).rejects.toThrow("Membrii sau datele");
    }finally{await sql`update core.entities set cui_canonical='88779106'where id=887791006`;}
  });
  it("retains same-checkpoint recapture and fails closed after the checkpoint changes",async()=>{
    const {clipId}=await queued();expect((await recaptureClip(uid,inv,clipId,sql))?.scope.peer?.checkpointId).toBe(checkpoint);
    const newer=randomUUID();await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at)values(${newer},'baseline','ready',now())`;
    try{await expect(bindPeerEvidence(sql,selection)).rejects.toThrow("Datele comparației s-au schimbat");await expect(recaptureClip(uid,inv,clipId,sql)).rejects.toThrow("Datele comparației s-au schimbat");}
    finally{await sql`delete from app.monitoring_refreshes where id=${newer}`;}
  });
  it("freezes manual add/remove order, missing population and zero-source members without calling absence zero spending",async()=>{
    const marker=await manual(["887791007","887791006"]);
    const {capture,clipId}=await queued(marker);await processCapture(uid,inv,capture.id,sql);
    const result=await getCapturedRows(uid,inv,capture.id,0,sql);
    expect(result?.capture.status,result?.capture.error??undefined).toBe("complete");
    const context=result?.capture.summary?.peerContext as {members:{entity:{id:string};recordCount:number;population?:unknown}[];sourceMembers:unknown[]};
    expect(context.members.map(member=>member.entity.id)).toEqual(["887791007","887791006"]);
    expect(context.members[0]).toMatchObject({recordCount:0});expect(context.members[0]?.population).toBeUndefined();
    expect(context.sourceMembers).toContainEqual({entityId:"887791007",rowCount:0,totalExact:"0",hasRecordedData:false});
    expect(result?.capture.summary?.peerContext).toMatchObject({cohort:{count:2,observedMemberCount:1,enoughPeers:false}});
    expect(result?.rows).toHaveLength(3);expect(result?.capture.totalExact).toBe("57.0052");
    const reduced=await manual(["887791007"]);const bound=await withPeerEvidence(sql,reduced,async(_,bound)=>bound);
    expect(bound.sourceMembers.map(member=>member.entity.id)).toEqual([focal,"887791007"]);
    const newCapture=await recaptureClip(uid,inv,clipId,sql);expect(newCapture?.scope.peer).toEqual(marker);
    const md=await (await investigationExport(uid,inv,"https://example.invalid","md",sql))?.text();
    expect(md).toContain("Grup ales manual");expect(md).toContain("Fără date eligibile");expect(md).toContain("Lipsa datelor nu înseamnă cheltuieli zero");
    expect(md).toContain(POPULATION_VERSION);
  });
  it("preserves all-year sources, CSV, frozen capture and recapture without browser year narrowing",async()=>{
    const marker:CurrentPeerEvidenceSelection={...await manual(["887791007"]),year:"all"};
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,supplier_id,county,closing_value,finalization_date,cpv_code)
      values(887793098,'DA-undated',${authority},${focal},'Buzau',0.0002,null,'45000000-7')`;
    try{
      const body={peer:marker,spec:{block:"stat",measure:"value",filters:{yearFrom:2025,yearTo:2025}}};
      const response=await rowsRoute(new Request("http://localhost/api/ask/rows",{method:"POST",body:JSON.stringify(body)}));
      const data=await response.json();expect(response.status).toBe(200);expect(data.total).toBe(4);expect(data.value).toBe("828.0053");
      const csv=await csvRoute(new Request("http://localhost/api/ask/rows/csv",{method:"POST",body:JSON.stringify(body)}));
      expect(csv.headers.get("x-total-rows")).toBe("4");const text=await csv.text();expect(text).toContain("DA-other-year");expect(text).toContain("DA-undated");
      const {capture,clipId}=await queued(marker);await processCapture(uid,inv,capture.id,sql);
      const frozen=await getCapturedRows(uid,inv,capture.id,0,sql);
      expect(frozen?.capture.status,frozen?.capture.error??undefined).toBe("complete");expect(frozen?.capture.totalExact).toBe("828.0053");
      expect(frozen?.capture.summary?.peerContext).toMatchObject({filters:{year:"all"},cohort:{count:1,observedMemberCount:1},members:[{entity:{id:"887791007"},recordCount:1}]});
      expect((await recaptureClip(uid,inv,clipId,sql))?.scope.peer?.year).toBe("all");
      const md=await(await investigationExport(uid,inv,"https://example.invalid","md",sql))?.text();expect(md).toContain("Selecție: toți anii");
    }finally{await sql`delete from marts.da_transactions where sicap_da_id=887793098`;}
  });
  it("freezes all domains including unrelated CPV and missing-CPV records with exact source totals",async()=>{
    const marker:CurrentPeerEvidenceSelection={...await manual(["887791007"]),year:"all",cpv:"all"};
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,supplier_id,county,closing_value,finalization_date,cpv_code)
      values(887793097,'DA-missing-cpv',${authority},${focal},'Buzau',5.0001,'2024-03-01',null)`;
    try{
      const response=await rowsRoute(new Request("http://localhost/api/ask/rows",{method:"POST",body:JSON.stringify({peer:marker,spec:{block:"stat",measure:"value",filters:{cpvTerm:"45",yearFrom:2025}}})}));
      const data=await response.json();expect(response.status).toBe(200);expect(data.total).toBe(10);expect(data.value).toBe("1043.0058");
      const {capture,clipId}=await queued(marker);await processCapture(uid,inv,capture.id,sql);
      const frozen=await getCapturedRows(uid,inv,capture.id,0,sql);expect(frozen?.capture.status,frozen?.capture.error??undefined).toBe("complete");
      expect(frozen?.capture.totalExact).toBe("1043.0058");expect(frozen?.capture.summary?.peerContext).toMatchObject({filters:{year:"all",cpv:"all"}});
      expect((await recaptureClip(uid,inv,clipId,sql))?.scope.peer).toMatchObject({year:"all",cpv:"all"});
      const md=await(await investigationExport(uid,inv,"https://example.invalid","md",sql))?.text();expect(md).toContain("Selecție: toți anii, toate domeniile");
    }finally{await sql`delete from marts.da_transactions where sicap_da_id=887793097`;}
  });
  it("freezes population provenance and the full automatic roster while excluding unobserved members from medians",async()=>{
    const marker=await population(),{capture}=await queued(marker);await processCapture(uid,inv,capture.id,sql);
    const result=await getCapturedRows(uid,inv,capture.id,0,sql);
    expect(result?.capture.status,result?.capture.error??undefined).toBe("complete");
    const context=result?.capture.summary?.peerContext as {focal:{population:Record<string,unknown>};members:{entity:{id:string};population:Record<string,unknown>}[]};
    expect(context.focal.population).toMatchObject({level:"county",catalogVersion:POPULATION_VERSION,referenceDate:"2021-12-01"});
    expect(context.focal.population.sourceUrl).toMatch(/^https:\/\//);expect(context.focal.population.sourceRow).toBeGreaterThan(0);
    expect(context.focal.population.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(context.members).toHaveLength(6);expect(context.members.every(member=>typeof member.population.differencePercent==="number")).toBe(true);
    expect(result?.capture.summary?.peerContext).toMatchObject({cohort:{count:6,observedMemberCount:5,enoughPeers:true,medianTotalExact:"40.0001"}});
    expect(result?.rows).toHaveLength(6);expect(result?.capture.totalExact).toBe("210.0006");
    const md=await (await investigationExport(uid,inv,"https://example.invalid","md",sql))?.text();
    expect(md).toContain("Selecție după populația cea mai apropiată");expect(md).toContain(String(context.focal.population.sourceUrl));expect(md).toContain("2021-12-01");
    expect(md).toContain(String(context.focal.population.sourceSha256));
  });
  it("rejects changed population catalog, edited manual identity, removed members and forged broadening",async()=>{
    const marker=await manual(["887791006"]);
    await expect(withPeerEvidence(sql,{...marker,populationVersion:"ins-rpl-2021-table-1.22-old"},async()=>true)).rejects.toThrow(/populați/i);
    await expect(withPeerEvidence(sql,{...marker,members:[{id:"887791006",identity:"f".repeat(64)}]},async()=>true)).rejects.toThrow("Identitatea");
    const outsider=await readConnectionEntity(sql,"887791007","supplier");
    await expect(withPeerEvidence(sql,{...marker,selection:{kind:"member",entityId:outsider.id,identity:outsider.identity}},async()=>true)).rejects.toThrow("nu aparține grupului");
    await expect(queued(await manual([]))).rejects.toThrow("Adaugă cel puțin");
    const body={peer:marker,spec:{block:"stat",measure:"value",filters:{yearFrom:2024,supplierId:887791007}}};
    const response=await rowsRoute(new Request("http://localhost/api/ask/rows",{method:"POST",body:JSON.stringify(body)}));
    expect(response.status).toBe(200);expect((await response.json()).total).toBe(3);
    const scoped=await rowsRoute(new Request("http://localhost/api/ask/rows",{method:"POST",body:JSON.stringify({...body,scope:{entityIds:["887791007"],role:"supplier"}})}));
    expect(scoped.status).toBe(400);
  });
  it("keeps zero-source selected member inspectable and fails delayed manual capture after identity drift",async()=>{
    const marker=await manual(["887791007"]),entity=await readConnectionEntity(sql,"887791007","supplier");
    const zero={...marker,selection:{kind:"member" as const,entityId:entity.id,identity:entity.identity}};
    const {capture}=await queued(zero);await processCapture(uid,inv,capture.id,sql);
    const result=await getCapturedRows(uid,inv,capture.id,0,sql);
    expect(result?.capture.status,result?.capture.error??undefined).toBe("complete");expect(result?.rows).toHaveLength(0);
    expect(result?.capture.summary?.peerContext).toMatchObject({selectionKind:"member",sourceMembers:[{entityId:entity.id,rowCount:0,hasRecordedData:false}]});
    const delayed=await queued(marker);await sql`update core.entities set cui_canonical='99999998'where id=887791007`;
    try{await processCapture(uid,inv,delayed.capture.id,sql);const [job]=await sql`select status,error from app.evidence_captures where id=${delayed.capture.id}`;
      expect(job?.status).toBe("failed");expect(job?.error).toContain("Identitatea");
      expect((await sql`select count(*)::int n from app.evidence_capture_rows where capture_id=${delayed.capture.id}`)[0]?.n).toBe(0);
    }finally{await sql`update core.entities set cui_canonical='88779107'where id=887791007`;}
  });
});
