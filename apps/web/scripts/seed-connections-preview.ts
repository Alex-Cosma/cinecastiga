/** Fictional browser acceptance fixture, exclusively in an explicit seap_test_* database.
 * Creates an ordinary verified fixture user/session; sends no email. The session
 * and ephemeral signing secret are written only to a mode-600 temporary file.
 * Start the isolated preview using that secret, then drop the database and file.
 */
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createDb } from "@seap/db";
import { readConnectionEntity } from "../lib/connections";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("An explicit isolated TEST_DATABASE_URL named seap_test_* is required");
const connection = createDb(url), sql = connection.sql, userId = `preview-connections-${randomUUID()}`;
const investigationId = randomUUID(), checkpointId = randomUUID();
const authority = "887790001", authority2 = "887790002", supplier = "887790003", supplier2 = "887790004";
const names: Record<string,string> = { [authority]:"Primăria Exemplu — date fictive", [authority2]:"Spitalul Exemplu — date fictive", [supplier]:"Firma Exemplu Nord — date fictive", [supplier2]:"Firma Exemplu Sud — date fictive" };
try {
  await sql`insert into auth.users(id,name,email,email_verified,role,two_factor_enabled) values(${userId},'Reporter — test izolat',${userId+"@example.invalid"},true,'user',true)`;
  await sql`insert into app.investigations(id,owner_user_id,title,description) values(${investigationId},${userId},'Legături documentate — exercițiu fictiv','Date fictive izolate. Nu reprezintă fapte despre instituții sau firme reale.')`;
  for (const id of Object.keys(names)) await sql`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid)
    values(${id},${names[id]!},${names[id]!.toLowerCase()},'Cluj',${id},true)`;
  for (const [i,a,s,value,date] of [[1,authority,supplier,"125000.0001","2025-03-04"],[2,authority2,supplier,"180000.0002","2025-05-02"],[3,authority,supplier2,"42000.0003","2025-01-02"],[4,authority,supplier,"3000",null]] as const) {
    const id=String(887790010+i);
    await sql`insert into core.direct_acquisitions(sicap_da_id,da_code,authority_entity_id,supplier_entity_id,closing_value,finalization_date,state)
      values(${id},${"EXEMPLU DA "+i},${a},${s},${value},${date}::timestamptz,'Oferta acceptata')`;
    await sql`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date)
      values(${id},${"EXEMPLU DA "+i},${a},${names[a]!},${s},${names[s]!},'Cluj',${value},${date})`;
  }
  await sql`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_value,currency,title,contract_date)
    values(887790021,1,887790099,887790088,100000.01,'RON','EXEMPLU · lucrări atribuite unui consorțiu','2025-04-02')`;
  for(const s of [supplier,supplier2]) await sql`insert into marts.contract_transactions(contract_id,supplier_id,authority_id,authority_name,supplier_name,county,closing_value,contract_value_full,n_winners,ca_notice_id,finalization_date,ted_pubnum)
    values(887790021,${s},${authority},${names[authority]!},${names[s]!},'Cluj',50000.005,100000.01,2,887790088,'2025-04-02','000001-2025')`;
  for(const [id,role] of [[authority,"authority"],[authority2,"authority"],[supplier,"supplier"],[supplier2,"supplier"]] as const)
    await sql`insert into marts.entity_profile(entity_id,role,name_display,county,n_das,total_ron_full) values(${id},${role},${names[id]!},'Cluj',0,0)`;
  await sql`insert into app.monitoring_refreshes(id,kind,status,completed_at,methodology,source_coverage,validation)
    values(${checkpointId},'baseline','ready',now(),'{"version":"connection-browser-fixture-1"}'::jsonb,
      '{"fixture":true,"note":"Date fictive izolate pentru verificarea interfeței."}'::jsonb,'{"fixture":true}'::jsonb)`;
  const secret = randomBytes(40).toString("hex");
  process.env.BETTER_AUTH_SECRET=secret; process.env.BETTER_AUTH_URL="http://localhost:3111";
  (globalThis as typeof globalThis & {__seapAuthDb:typeof connection.db}).__seapAuthDb=connection.db;
  const {auth}=await import("../lib/auth"); const context=await auth.$context;
  const session=await context.internalAdapter.createSession(userId);
  const signed=`${session!.token}.${createHmac("sha256",context.secret).update(session!.token).digest("base64")}`;
  const entities=await Promise.all([readConnectionEntity(sql,authority,"authority"),readConnectionEntity(sql,authority2,"authority"),readConnectionEntity(sql,supplier,"supplier"),readConnectionEntity(sql,supplier2,"supplier")]);
  const artifact=process.argv.find(a=>a.startsWith("--output="))?.slice(9)??"/private/tmp/seap-batch4-preview.json";
  await writeFile(artifact,JSON.stringify({fixture:true,databaseUrl:url,userId,investigationId,checkpointId,entities,
    secret,cookie:{name:context.authCookies.sessionToken.name,value:encodeURIComponent(signed)},baseUrl:"http://localhost:3111"},null,2),{mode:0o600});
  console.log(JSON.stringify({artifact,fixture:true,investigationId,authority,supplier}));
}finally{await sql.end();}
