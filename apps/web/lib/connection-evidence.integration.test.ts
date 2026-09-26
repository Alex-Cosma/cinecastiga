import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDb, type DbSql } from "@seap/db";
import { readConnectionEntity } from "./connections";
import { bindConnectionEvidence, withConnectionEvidence } from "./connection-evidence";
import { connectionEvidenceSpec, type ConnectionEvidenceSelection } from "./connection-evidence-shared";
import { queueCapture, processCapture, getCapturedRows, recaptureClip } from "./evidence-captures";
import { validateCaptureRequest } from "./evidence-capture-input";
import { investigationExport } from "./evidence-bundle";
import { POST as rowsRoute } from "../app/api/ask/rows/route";
import { POST as csvRoute } from "../app/api/ask/rows/csv/route";

const url = process.env.TEST_DATABASE_URL;
if (url && !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("Connection evidence tests require a dedicated seap_test_* database");
describe.skipIf(!url)("relationship source and capture identity (dedicated PostgreSQL database)", () => {
  let sql: DbSql, selection: ConnectionEvidenceSelection;
  const uid = `connection-capture-${randomUUID()}`, inv = randomUUID(), checkpoint = randomUUID();
  const a = "887780001", b = "887780002", s = "887780003", t = "887780004", contract = "887780021", natural = "887780099";
  beforeAll(async () => {
    sql = createDb(url).sql;
    (globalThis as typeof globalThis & { __seapAskSql?: DbSql }).__seapAskSql = sql;
    await sql`insert into auth.users(id,name,email) values(${uid},'Connections capture fixture',${uid + "@example.invalid"})`;
    await sql`insert into app.investigations(id,owner_user_id,title) values(${inv},${uid},'Connection capture fixture')`;
    await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at) values(${checkpoint},'baseline','ready',now())`;
    await sql`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid) values
      (${a},'Instituția A','institutia a','Buzău','111111',true),(${b},'Instituția B','institutia b','Buzău','222222',true),
      (${s},'Firma S','firma s','Buzău','333333',true),(${t},'Firma T','firma t','Buzău','444444',true)`;
    for (const [i, authority, supplier, value] of [[1,a,s,"12.3400001"],[2,b,s,"20.0000002"],[3,a,t,"7.0000003"],[4,b,t,"999"]] as const) {
      const id = String(887780010 + i);
      await sql`insert into core.direct_acquisitions(sicap_da_id,da_code,authority_entity_id,supplier_entity_id,closing_value,finalization_date,state)
        values(${id},${"DA-connection-"+i},${authority},${supplier},${value},'2025-01-02','Oferta acceptata')`;
      await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date)
        values(${id},${"DA-connection-"+i},${authority},${authority===a?"Instituția A":"Instituția B"},${supplier},${supplier===s?"Firma S":"Firma T"},'Buzău',${value},'2025-01-02')`;
    }
    await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_value,currency,title,contract_date)
      values(${contract},1,${natural},887780088,100.01,'RON','Contract comun','2025-01-02')`;
    await sql`insert into marts.contract_transactions(contract_id,supplier_id,authority_id,authority_name,supplier_name,county,closing_value,contract_value_full,n_winners,ca_notice_id,finalization_date)
      values(${contract},${s},${a},'Instituția A','Firma S','Buzău',50.005,100.01,2,887780088,'2025-01-02'),
      (${contract},${t},${a},'Instituția A','Firma T','Buzău',50.005,100.01,2,887780088,'2025-01-02')`;
    const entities = await Promise.all([readConnectionEntity(sql,a,"authority"),readConnectionEntity(sql,b,"authority"),readConnectionEntity(sql,s,"supplier"),readConnectionEntity(sql,t,"supplier")]);
    const [ea,eb,es] = entities;
    selection = {version:"connection-evidence-1",checkpointId:checkpoint,dataset:"all",yearFrom:2025,yearTo:2025,pairs:[{authority:ea!,supplier:es!},{authority:eb!,supplier:es!}]};
  });
  afterAll(async () => {
    if(!sql)return;
    await sql`delete from auth.users where id=${uid}`;
    await sql`delete from marts.da_transactions where authority_id in (${a},${b})`;
    await sql`delete from marts.contract_transactions where authority_id in (${a},${b})`;
    await sql`delete from core.direct_acquisitions where authority_entity_id in (${a},${b})`;
    await sql`delete from core.contracts where id=${contract}`;
    await sql`delete from core.entities where id in (${a},${b},${s},${t})`;
    await sql`delete from app.monitoring_refreshes where id=${checkpoint}`;
    delete (globalThis as typeof globalThis & { __seapAskSql?: DbSql }).__seapAskSql;
    await sql.end();
  });
  async function queued(marker=selection,evidenceOptions:Record<string,unknown>={}) {
    const request=validateCaptureRequest("query",null,{block:"stat",measure:"value",filters:{}},{connection:marker,evidenceOptions,title:"False browser title",valueRon:999999});
    if("error" in request)throw new Error(request.error);
    const clipId=randomUUID();
    const capture=await sql.begin(async q=>{
      await q`insert into app.clips(id,investigation_id,kind,spec,snapshot,created_by) values(${clipId},${inv},'query',${JSON.stringify(request.spec)}::jsonb,${JSON.stringify({connection:request.connection})}::jsonb,${uid})`;
      return queueCapture(q as unknown as DbSql,uid,inv,clipId,request);
    });
    return {capture,clipId};
  }
  it("freezes precisely the two source pairs with server names, natural IDs and exact decimals",async()=>{
    const {capture}=await queued();await processCapture(uid,inv,capture.id,sql);
    const result=await getCapturedRows(uid,inv,capture.id,0,sql);
    expect(result?.capture.status,result?.capture.error??undefined).toBe("complete");
    expect(result?.capture.totalExact).toBe("82.3450003");expect(result?.rows).toHaveLength(3);
    expect(result?.rows.every(row=>row.supplierId===s)).toBe(true);
    expect(result?.rows.find(row=>row.src==="contracts")).toMatchObject({refId:natural,valueExact:"50.005",contractValueFull:"100.01",sourceUrl:"https://e-licitatie.ro/pub/notices/ca-notices/view-c/887780088"});
    expect(result?.capture.summary?.title).toBe("Legătură · Instituția A → Firma S ← Instituția B");
    expect(JSON.stringify(result?.capture.summary)).not.toContain("False browser title");
    const exported=await investigationExport(uid,inv,"https://example.invalid","md",sql);
    expect(await exported?.text()).toContain("Traseul ales leagă două instituții prin aceeași firmă furnizoare");
  });
  it("counts each consortium allocation once for two suppliers sharing a buyer",async()=>{
    const es=await readConnectionEntity(sql,s,"supplier"),et=await readConnectionEntity(sql,t,"supplier"),ea=await readConnectionEntity(sql,a,"authority");
    const {capture}=await queued({...selection,pairs:[{authority:ea,supplier:es},{authority:ea,supplier:et}]});
    await processCapture(uid,inv,capture.id,sql);const result=await getCapturedRows(uid,inv,capture.id,0,sql);
    expect(result?.capture.status,result?.capture.error??undefined).toBe("complete");expect(result?.rows).toHaveLength(4);
    expect(result?.capture.totalExact).toBe("119.3500004");
    expect(new Set(result?.rows.filter(row=>row.src==="contracts").map(row=>row.refId)).size).toBe(1);
  });
  it("protects the actual rows/CSV routes and rebuilds source scope even with a forged spec",async()=>{
    const body={spec:{block:"stat",measure:"value",filters:{}},connection:selection};
    const rows=await rowsRoute(new Request("http://localhost/api/ask/rows",{method:"POST",body:JSON.stringify(body)}));
    const result=await rows.json();expect(rows.status).toBe(200);expect(result.ok).toBe(true);expect(result.total).toBe(3);expect(result.value).toBe("82.3450003");
    const csv=await csvRoute(new Request("http://localhost/api/ask/rows/csv",{method:"POST",body:JSON.stringify(body)}));
    expect(csv.status).toBe(200);expect(csv.headers.get("x-total-rows")).toBe("3");expect(await csv.text()).toContain("https://e-licitatie.ro/pub/notices/ca-notices/view-c/887780088");
    const stale={...selection,pairs:selection.pairs.map(pair=>({...pair,supplier:{...pair.supplier,identity:"f".repeat(64)}}))};
    for(const route of [rowsRoute,csvRoute])expect((await route(new Request("http://localhost/api/ask/rows",{method:"POST",body:JSON.stringify({...body,connection:stale})}))).status).toBe(409);
  });
  it("rejects a reused entity ID at queue time and during the worker without publishing partial evidence",async()=>{
    const {capture,clipId}=await queued();
    await sql`update core.entities set cui_canonical='555555' where id=${s}`;
    try{
      await expect(queued()).rejects.toThrow("Identitatea");
      await expect(withConnectionEvidence(sql,selection,async()=>true)).rejects.toThrow("Identitatea");
      await processCapture(uid,inv,capture.id,sql);
      const [failed]=await sql`select status,error from app.evidence_captures where id=${capture.id}`;
      expect(failed?.status).toBe("failed");expect(failed?.error).toContain("Identitatea");
      expect((await sql`select count(*)::int n from app.evidence_capture_rows where capture_id=${capture.id}`)[0]?.n).toBe(0);
      await expect(recaptureClip(uid,inv,clipId,sql)).rejects.toThrow("Identitatea");
    }finally{await sql`update core.entities set cui_canonical='333333' where id=${s}`;}
  });
  it("requires the displayed validated checkpoint and preserves same-version recapture context",async()=>{
    const {clipId}=await queued();const fresh=await recaptureClip(uid,inv,clipId,sql);
    expect(fresh?.scope.connection?.checkpointId).toBe(checkpoint);
    const newer=randomUUID();await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at) values(${newer},'baseline','ready',now())`;
    try{await expect(bindConnectionEvidence(sql,selection)).rejects.toThrow("Datele acestei legături s-au schimbat");
      await expect(withConnectionEvidence(sql,selection,async()=>true)).rejects.toThrow("Versiunea datelor s-a schimbat");
      await expect(recaptureClip(uid,inv,clipId,sql)).rejects.toThrow("Datele acestei legături s-au schimbat");
    }finally{await sql`delete from app.monitoring_refreshes where id=${newer}`;}
  });
  it("refuses to publish an empty relationship or a path whose filters remove one leg",async()=>{
    for(const {marker,options} of [
      {marker:selection,options:{stream:"contracts"}},
      {marker:{...selection,dataset:"contracts" as const,pairs:[selection.pairs[1]!]},options:{}},
    ]){
      const {capture}=await queued(marker,options);await processCapture(uid,inv,capture.id,sql);
      const [failed]=await sql`select status,error from app.evidence_captures where id=${capture.id}`;
      expect(failed?.status).toBe("failed");expect(failed?.error).toContain("fiecare legătură");
      expect((await sql`select count(*)::int n from app.evidence_capture_rows where capture_id=${capture.id}`)[0]?.n).toBe(0);
    }
  });
});
