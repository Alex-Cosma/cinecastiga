import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createDb,type DbSql } from "@seap/db";
import { queueCapture,processCapture,getCapture,getCapturedRows,recaptureClip } from "./evidence-captures";
import { validateCaptureRequest } from "./evidence-capture-input";
import { withInvestigationAccess } from "./investigation-access";
import { readRadiografieEvidence } from "./radiografie-evidence";
import { investigationExport } from "./evidence-bundle";
import type { CaptureRequest } from "./evidence-captures-shared";

const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1)))throw new Error("Capture integration tests require a dedicated seap_test_* database");
describe.skipIf(!url)("server evidence captures (dedicated PostgreSQL database)",()=>{
  let sql:DbSql;
  const uid=`capture-test-${randomUUID()}`,editor=uid+"-editor",viewer=uid+"-viewer",outsider=uid+"-outsider";
  const inv=randomUUID(),other=randomUUID(),checkpoint=randomUUID();
  const authority="887770001",supplier="887770002",supplier2="887770003",da="887770011",daNull="887770012",contract="887770021",natural="887770099";
  beforeAll(async()=>{
    sql=createDb(url).sql;
    await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at,methodology) values(${checkpoint},'baseline','ready',now(),' {"flags":"fixture-risk-version"}'::jsonb)`;
    for(const id of [uid,editor,viewer,outsider])await sql`insert into auth.users(id,name,email) values(${id},'Evidence fixture',${id+"@example.invalid"})`;
    await sql`insert into app.investigations(id,owner_user_id,title) values(${inv},${uid},'Frozen evidence fixture'),(${other},${uid},'Other fixture')`;
    await sql`insert into app.investigation_members(investigation_id,user_id,role) values(${inv},${editor},'editor'),(${inv},${viewer},'viewer')`;
    await sql`insert into core.entities(id,name_display,name_normalized,county) values(${authority},'Fixture authority','fixture authority','Buzău'),(${supplier},'Fixture supplier','fixture supplier','Buzău'),(${supplier2},'Fixture consortium','fixture consortium','Buzău')`;
    await sql`insert into core.direct_acquisitions(sicap_da_id,da_code,authority_entity_id,supplier_entity_id,closing_value,finalization_date,state)
      values(${da},'DA frozen fixture',${authority},${supplier},12.340000000000000001,'2025-01-02','Oferta acceptata'),(${daNull},'DA missing value',${authority},${supplier},null,'2025-01-03','Oferta acceptata')`;
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date)
      values(${da},'DA frozen fixture',${authority},'Fixture authority',${supplier},'Fixture supplier','Buzău',12.340000000000000001,'2025-01-02')`;
    await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_value,currency,title,contract_date)
      values(${contract},1,${natural},887770088,100.01,'RON','Consortium fixture','2025-01-02')`;
    await sql`insert into marts.contract_transactions(contract_id,supplier_id,authority_id,authority_name,supplier_name,county,closing_value,contract_value_full,n_winners,ca_notice_id,finalization_date)
      values(${contract},${supplier},${authority},'Fixture authority','Fixture supplier','Buzău',50.005,100.01,2,887770088,'2025-01-02'),
      (${contract},${supplier2},${authority},'Fixture authority','Fixture consortium','Buzău',50.005,100.01,2,887770088,'2025-01-02')`;
  });
  afterAll(async()=>{
    if(!sql)return;
    await sql`delete from auth.users where id in (${uid},${editor},${viewer},${outsider})`;
    await sql`delete from marts.da_transactions where authority_id=${authority}`;
    await sql`delete from marts.contract_transactions where authority_id=${authority}`;
    await sql`delete from core.direct_acquisitions where authority_entity_id=${authority}`;
    await sql`delete from marts.lot_patterns where authority_id=${authority}`;
    await sql`delete from core.contracts where id=${contract}`;
    await sql`delete from core.entities where id in (${authority},${supplier},${supplier2})`;
    await sql`delete from app.monitoring_refreshes where id=${checkpoint}`;
    await sql.end();
  });
  async function queued(kind:string,refId:string|null,spec:unknown=null,snapshot:unknown=null,user=uid){
    const request=validateCaptureRequest(kind,refId,spec,snapshot);if("error"in request)throw new Error(request.error);
    const result=await withInvestigationAccess(user,inv,"edit",async q=>{
      const [clip]=await q`insert into app.clips(investigation_id,kind,ref_id,spec,snapshot,created_by) values(${inv},${kind},${refId},${JSON.stringify(spec)}::jsonb,${JSON.stringify(snapshot)}::jsonb,${user}) returning id`;
      return{clip:String(clip!.id),capture:await queueCapture(q,user,inv,String(clip!.id),request as CaptureRequest)};
    },sql);if(!result)throw new Error("Denied");return result;
  }
  it("freezes server values, re-captures a new immutable version, and preserves NULL",async()=>{
    const {clip,capture}=await queued("da",da,null,{valueRon:999999});
    await processCapture(uid,inv,capture.id,sql);
    const first=await getCapturedRows(uid,inv,capture.id,0,sql);
    expect(first?.capture.status).toBe("complete");expect(first?.capture.totalExact).toBe("12.340000000000000001");
    expect(first?.capture.methodology).toMatchObject({checkpointId:checkpoint,riskVersion:'fixture-risk-version'});
    expect(first?.rows[0]?.sourceUrl).toContain(`/view/${da}`);
    await sql`update core.direct_acquisitions set closing_value=98.76 where sicap_da_id=${da}`;
    const second=await recaptureClip(uid,inv,clip,sql);expect(second?.version).toBe(2);
    await processCapture(uid,inv,second!.id,sql);
    expect((await getCapture(uid,inv,second!.id,sql))?.totalExact).toBe("98.76");
    expect(await getCapturedRows(uid,inv,capture.id,0,sql)).toEqual(first);
    const missing=await queued("da",daNull);await processCapture(uid,inv,missing.capture.id,sql);
    const saved=await getCapturedRows(uid,inv,missing.capture.id,0,sql);expect(saved?.capture.status).toBe("complete");expect(saved?.capture.totalExact).toBeNull();expect(saved?.rows[0]?.valueExact).toBeNull();
  });
  it("separates full contract and consortium shares with natural source identifiers",async()=>{
    const {capture}=await queued("contract",natural);await processCapture(uid,inv,capture.id,sql);
    const saved=await getCapturedRows(uid,inv,capture.id,0,sql);
    expect(saved?.capture.totalExact).toBe("100.010");expect(saved?.capture.summary?.valueRon).toBe("100.01");
    expect(saved?.rows.map(r=>r.valueExact)).toEqual(["50.005","50.005"]);expect(saved?.rows.map(r=>r.refId)).toEqual([natural,natural]);
  });
  it("freezes the exact selected query subgroup and local list filters",async()=>{
    const spec={block:"stat",measure:"value",dataset:"all",filters:{yearFrom:2025,yearTo:2025},population:{operator:"and",groups:[{operator:"and",conditions:[{field:"authority",op:"in",values:[authority]}]}]}};
    const {capture}=await queued("query",null,spec,{valueRon:999,evidenceScope:{role:"supplier",entityIds:[supplier2]},evidenceOptions:{stream:"contracts",search:"consortium"}});
    await processCapture(uid,inv,capture.id,sql);const saved=await getCapturedRows(uid,inv,capture.id,0,sql);
    expect(saved?.capture.status,saved?.capture.error??undefined).toBe("complete");expect(saved?.capture.totalExact).toBe("50.005");expect(saved?.rows).toHaveLength(1);expect(saved?.rows[0]?.supplierId).toBe(supplier2);expect(saved?.rows[0]?.refId).toBe(natural);
    const {dataset:_defaultDataset,...normalized}=spec;expect(saved?.capture.scope.spec).toEqual(normalized);
  });
  it("enforces roles and case boundaries and rolls back a capture when the editor is revoked before publication",async()=>{
    expect(await withInvestigationAccess(viewer,inv,"edit",async()=>true,sql)).toBeNull();
    const {capture}=await queued("da",da,null,null,editor);
    await processCapture(editor,inv,capture.id,sql,{beforePublish:async()=>{
      await withInvestigationAccess(uid,inv,"manage",async q=>{await q`delete from app.investigation_members where investigation_id=${inv} and user_id=${editor}`;await q`update app.investigations set updated_at=now() where id=${inv}`;},sql);
    }});
    expect((await getCapture(uid,inv,capture.id,sql))?.status).toBe("failed");
    expect((await sql`select count(*)::int n from app.evidence_capture_rows where capture_id=${capture.id}`)[0]?.n).toBe(0);
    expect(await getCapture(editor,inv,capture.id,sql)).toBeNull();expect(await getCapture(outsider,inv,capture.id,sql)).toBeNull();expect(await getCapture(uid,other,capture.id,sql)).toBeNull();
    await processCapture(uid,inv,capture.id,sql);expect((await getCapture(viewer,inv,capture.id,sql))?.status).toBe("complete");
  });
  it("exports readable frozen rows with verifiable checksums and truthful legacy status",async()=>{
    await sql`insert into app.clips(investigation_id,kind,ref_id,snapshot,created_by) values(${inv},'query',null,'{"valueRon":999999}'::jsonb,${uid})`;
    const response=await investigationExport(viewer,inv,"https://example.invalid","zip",sql);expect(response?.status).toBe(200);
    const directory=await mkdtemp(join(tmpdir(),"seap-bundle-test-"));
    try{const path=join(directory,"bundle.zip");await writeFile(path,Buffer.from(await response!.arrayBuffer()));
      const output=execFileSync("python3",["-c","import zipfile,json,hashlib,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;m=json.loads(z.read('manifest.json'));assert all(hashlib.sha256(z.read(e['path'])).hexdigest()==e['sha256'] and len(z.read(e['path']))==int(e['bytes']) for e in m['files']);print(json.dumps({'readme':z.read('README.md').decode(),'files':z.namelist(),'captures':m['captures']}))",path],{encoding:"utf8",maxBuffer:5_000_000});
      const data=JSON.parse(output);expect(data.readme).toContain("Fără captură verificată completă");expect(data.files).toContain("workspace.json");expect(data.files.some((name:string)=>name.endsWith("rows.ndjson"))).toBe(true);expect(data.captures.some((c:{totalExact:string})=>c.totalExact==="12.340000000000000001")).toBe(true);
    }finally{await rm(directory,{recursive:true,force:true});}
    expect(await investigationExport(outsider,inv,"https://example.invalid","zip",sql)).toBeNull();
  },30000);
  it("binds a pattern before queueing, rejects reused IDs and stale pages, and preserves the binding on recapture",async()=>{
    const patternId="887770055",selection={type:"pattern",patternId};
    await sql`insert into marts.lot_patterns(id,authority_id,cpv_class,kind,set_key,member_ids,member_names,reps,n_lot_tenders,value,single,known,strength,notices)
      values(${patternId},${authority},'4500','consortiu','fixture',array[${supplier}::bigint,${supplier2}::bigint],array['Fixture supplier','Fixture consortium'],2,2,100.01,0,0,'slab',array['CAN-frozen-test'])`;
    await sql`update marts.contract_transactions set cpv_code='45000000-7',notice_no='CAN-frozen-test' where contract_id=${contract}`;
    const displayed=await readRadiografieEvidence(sql,authority,selection);
    const guard=displayed!.context.sourceBinding as {fingerprint:string};
    const boundSelection={...selection,expectedFingerprint:guard.fingerprint};
    await expect(queued("radiografie",authority,selection)).rejects.toThrow("Reîncarcă pagina");
    const saved=await queued("radiografie",authority,boundSelection,{sourceBinding:{fingerprint:"forged"}});
    expect(saved.capture.scope.sourceBinding?.fingerprint).toBe(guard.fingerprint);
    await sql`update marts.lot_patterns set kind='rotatie' where id=${patternId}`;
    // A page left open before a rebuild cannot save the new occupant of its ID.
    expect(await readRadiografieEvidence(sql,authority,boundSelection)).toBeNull();
    await expect(queued("radiografie",authority,boundSelection)).rejects.toThrow("s-a schimbat");
    // The job which was already queued also fails without publishing any rows.
    await processCapture(uid,inv,saved.capture.id,sql);
    expect((await getCapture(uid,inv,saved.capture.id,sql))?.status).toBe("failed");
    expect((await sql`select count(*)::int n from app.evidence_capture_rows where capture_id=${saved.capture.id}`)[0]?.n).toBe(0);
    await expect(recaptureClip(uid,inv,saved.clip,sql)).rejects.toThrow("s-a schimbat");
    // Harmless array reordering is the same identity, so retry is safe.
    await sql`update marts.lot_patterns set kind='consortiu',member_ids=array[${supplier2}::bigint,${supplier}::bigint] where id=${patternId}`;
    await processCapture(uid,inv,saved.capture.id,sql);
    const original=await getCapturedRows(uid,inv,saved.capture.id,0,sql);
    expect(original?.capture.status).toBe("complete");expect(original?.rows).toHaveLength(2);
    const next=await recaptureClip(uid,inv,saved.clip,sql);
    expect(next?.scope.sourceBinding).toEqual(saved.capture.scope.sourceBinding);
    await sql`delete from marts.lot_patterns where id=${patternId}`;
    await processCapture(uid,inv,next!.id,sql);
    expect((await getCapture(uid,inv,next!.id,sql))?.status).toBe("failed");
    expect(await getCapturedRows(uid,inv,saved.capture.id,0,sql)).toEqual(original);
  });
  it("recaptures a historical entity ID with canonical context while preserving the previous capture",async()=>{
    const alias="887770004";
    await sql`insert into core.entities(id,name_display,name_normalized) values(${alias},'Historical fixture profile','historical fixture profile')`;
    await sql`update core.entities set cui_canonical='4305857',cui_valid=true where id=${authority}`;
    await sql`insert into marts.entity_profile(entity_id,role,name_display,n_das,n_contracts,total_ron_full)
      values(${authority},'authority','Fixture authority',1,1,112.35)`;
    try{
      const first=await queued('entity',alias);
      await processCapture(uid,inv,first.capture.id,sql);
      const frozen=await getCapturedRows(uid,inv,first.capture.id,0,sql);
      expect(frozen?.capture.status,frozen?.capture.error??undefined).toBe('complete');
      expect(frozen?.capture.summary?.title).toBe('Historical fixture profile');
      await sql`insert into core.entity_redirects(old_id,canonical_id,reason,evidence) values(${alias},${authority},'fixture','{}')`;
      const next=await recaptureClip(uid,inv,first.clip,sql);
      await processCapture(uid,inv,next!.id,sql);
      const current=await getCapturedRows(uid,inv,next!.id,0,sql);
      expect(current?.capture.status,current?.capture.error??undefined).toBe('complete');
      expect(current?.capture.summary).toMatchObject({entityId:authority,requestedEntityId:alias,title:'Fixture authority',cui:'4305857',roles:{authority:{nDas:1,nContracts:1}}});
      expect(current?.capture.scope.refId).toBe(alias);
      expect(current?.rows).toHaveLength(3);
      expect(current?.rows.every(row=>row.authorityId===authority)).toBe(true);
      expect(await getCapturedRows(uid,inv,first.capture.id,0,sql)).toEqual(frozen);
    }finally{
      await sql`delete from core.entity_redirects where old_id=${alias}`;
      await sql`delete from marts.entity_profile where entity_id=${authority}`;
      await sql`delete from core.entities where id=${alias}`;
    }
  });
  it("does not freeze ordinary source rows while publication is unvalidated",async()=>{
    const {capture}=await queued('da',da);
    try{
      await sql`update app.monitoring_refreshes set status='failed',error='fixture publication incomplete' where id=${checkpoint}`;
      await processCapture(uid,inv,capture.id,sql);
      expect((await getCapture(uid,inv,capture.id,sql))?.status).toBe('failed');
      expect((await sql`select count(*)::int n from app.evidence_capture_rows where capture_id=${capture.id}`)[0]?.n).toBe(0);
    }finally{await sql`update app.monitoring_refreshes set status='ready',error=null where id=${checkpoint}`;}
    await processCapture(uid,inv,capture.id,sql);
    expect((await getCapture(uid,inv,capture.id,sql))?.status).toBe('complete');
  });
  it("captures beyond the ordinary 100,000-row CSV cap without truncation",async()=>{
    const base=887780000;
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date)
      select ${base}+n,'BULK frozen fixture',${authority},'Fixture authority',${supplier},'Fixture supplier','Buzău',0.01,'2025-02-01' from generate_series(1,100001) n`;
    const spec={block:"stat",measure:"value",dataset:"da",filters:{yearFrom:2025,yearTo:2025},population:{operator:"and",groups:[{operator:"and",conditions:[{field:"authority",op:"in",values:[authority]},{field:"date",op:"gte",value:"2025-02-01"}]}]}};
    const {capture}=await queued("query",null,spec);await processCapture(uid,inv,capture.id,sql);
    const saved=await getCapture(uid,inv,capture.id,sql);expect(saved?.status,saved?.error??undefined).toBe("complete");expect(saved?.rowCount).toBe(100001);expect(saved?.totalExact).toBe("1000.01");
    expect((await getCapturedRows(viewer,inv,capture.id,100000,sql))?.rows).toHaveLength(1);
  },90000);
});
