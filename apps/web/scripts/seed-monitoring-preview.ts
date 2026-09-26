/** Fictional BROWSER ACCEPTANCE DATA ONLY. Never uses DATABASE_URL or a default.
 * TEST_DATABASE_URL must name a dedicated seap_test_* database. This script
 * leaves its isolated fixtures for browser acceptance; drop that database later.
 * It creates no passwords, sessions or emails. Private invite token is written
 * only to a mode-600 artifact; the console reports its path and nonsecret IDs.
 */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createDb } from "@seap/db";
import { createMonitoringWatch } from "../lib/monitoring";
import { evaluateMonitoringWatch } from "../lib/monitoring-engine";
import { createWorkspaceInvite } from "../lib/investigation-workspace";

const url=process.env.TEST_DATABASE_URL;
if(!url||!/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1)))throw new Error("An explicit dedicated TEST_DATABASE_URL named seap_test_* is required");
const sql=createDb(url).sql,suffix=randomUUID().slice(0,8),prefix=`preview-monitoring-${suffix}`;
const base=700_000_000_000+Number(Date.now()%10_000_000)*10;
const authority=String(base+1),supplier=String(base+2),failureAuthority=String(base+3),investigationId=randomUUID();
const users=Object.fromEntries(["owner","editor","viewer","unverified"].map(role=>[role,{id:`${prefix}-${role}`,email:`${prefix}-${role}@example.invalid`,role}])) as Record<string,{id:string;email:string;role:string}>;
const checkpoints:string[]=[];
async function ready(){const id=randomUUID();checkpoints.push(id);await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at,methodology,source_coverage,validation)
  values(${id},'baseline','ready',now(),${JSON.stringify({version:"preview-fictional-v1",fixture:prefix})}::jsonb,${JSON.stringify({fixture:true,note:"Date fictive izolate pentru verificarea interfeței; nu reprezintă achiziții reale."})}::jsonb,'{"fixture":true}')`;return id;}
async function da(offset:number,title:string,value:string,date:string|null){
  const id=String(base+100+offset);
  await sql`insert into core.direct_acquisitions(sicap_da_id,da_code,authority_entity_id,supplier_entity_id,closing_value,finalization_date,state)
    values(${id},${title},${authority},${supplier},${value},${date}::timestamptz,'Oferta acceptata')`;
  await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date)
    values(${id},${title},${authority},'Primăria Exemplu — date fictive',${supplier},'Firma Exemplu — date fictive','Cluj',${value},${date})`;
  return id;
}
try{
  for(const user of Object.values(users))await sql`insert into auth.users(id,name,email,email_verified) values(${user.id},${"Preview · "+user.role},${user.email},${user.role!=="unverified"})`;
  await sql`insert into app.investigations(id,owner_user_id,title,description) values(${investigationId},${users.owner!.id},'Verificarea lucrărilor locale — exercițiu','Date fictive pentru verificarea fluxului de anchetă. Nu reprezintă constatări despre instituții reale.')`;
  for(const role of ["editor","viewer"])await sql`insert into app.investigation_members(investigation_id,user_id,role) values(${investigationId},${users[role]!.id},${role})`;
  await sql`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid) values
    (${authority},'Primăria Exemplu — date fictive',${prefix+" authority"},'Cluj',${prefix+"-authority"},true),
    (${supplier},'Firma Exemplu — date fictive',${prefix+" supplier"},'Cluj',${prefix+"-supplier"},true),
    (${failureAuthority},'Instituție de verificat — date fictive',${prefix+" failed"},'Cluj',${prefix+"-failed"},true)`;
  await sql`insert into marts.entity_profile(entity_id,role,name_display,county,n_das,total_ron_full) values
    (${authority},'authority','Primăria Exemplu — date fictive','Cluj',3,127000),(${supplier},'supplier','Firma Exemplu — date fictive','Cluj',3,127000),
    (${failureAuthority},'authority','Instituție de verificat — date fictive','Cluj',0,0)`;
  const correctedId=await da(1,'EXEMPLU · Valoare corectată','125000.0001','2025-03-04'),removedId=await da(2,'EXEMPLU · Ieșită din selecție','1500','2025-02-02');await da(3,'EXEMPLU · Neschimbată','500','2025-01-01');
  const first=await ready();
  const watch=await createMonitoringWatch(users.owner!.id,{title:'Lucrări locale · exemplu fictiv',spec:{block:'stat',measure:'value',filters:{authorityId:Number(authority)}}},sql);
  const failedWatch=await createMonitoringWatch(users.owner!.id,{title:'Urmărire cu verificare nereușită · exemplu',spec:{block:'stat',measure:'value',filters:{authorityId:Number(failureAuthority)}}},sql);
  const baselineId=(await evaluateMonitoringWatch(watch.id,first,sql))!;await evaluateMonitoringWatch(failedWatch.id,first,sql);
  // This is a wholly synthetic observation, dated yesterday to exercise labels.
  await sql`update app.monitoring_runs set checked_at=now()-interval '1 day' where id=${baselineId}`;
  await sql`update core.direct_acquisitions set closing_value=132500.0002 where sicap_da_id=${correctedId}`;
  await sql`update marts.da_transactions set closing_value=132500.0002 where sicap_da_id=${correctedId}`;
  await sql`delete from marts.da_transactions where sicap_da_id=${removedId}`;
  await sql`update core.direct_acquisitions set state='Oferta refuzata' where sicap_da_id=${removedId}`;
  const [today]=await sql`select to_char(now() at time zone 'Europe/Bucharest','YYYY-MM-DD') date`;
  await da(4,'EXEMPLU · Achiziție cu dată recentă','180000',today!.date);await da(5,'EXEMPLU · Istoric observat acum','90000','2020-05-01');await da(6,'EXEMPLU · Dată necunoscută','3000',null);
  await sql`update core.entities set cui_canonical=${prefix+"-identity-changed"} where id=${failureAuthority}`;
  const second=await ready(),runId=(await evaluateMonitoringWatch(watch.id,second,sql))!;
  try{await evaluateMonitoringWatch(failedWatch.id,second,sql);}catch{/* Expected visible identity failure, last good baseline retained. */}
  const invite=await createWorkspaceInvite(users.owner!.id,investigationId,users.unverified!.email,"editor",sql);
  const artifact=process.argv.find(a=>a.startsWith("--output="))?.slice(9)??"/private/tmp/seap-batch3-preview.json";
  await writeFile(artifact,JSON.stringify({fixture:true,prefix,users,investigationId,watchId:watch.id,failedWatchId:failedWatch.id,baselineId,runId,checkpoints,authority,supplier,failureAuthority,invite},null,2),{mode:0o600});
  console.log(JSON.stringify({artifact,ownerId:users.owner!.id,watchId:watch.id,runId,investigationId,fixture:true}));
}finally{await sql.end();}
