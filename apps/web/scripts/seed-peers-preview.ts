/** Fictional peer-comparison acceptance data. Refuses non-test or populated databases.
 * Supply TEST_DATABASE_URL explicitly; this never reads the application's default DB.
 * The private output contains an ephemeral auth secret/session: remove it after review.
 */
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { createDb } from "@seap/db";
import { getPeers } from "../lib/peers";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) throw new Error("An explicit isolated TEST_DATABASE_URL named seap_test_* is required");
const connection = createDb(url), sql = connection.sql;
const authority = "887810000", supplier = "887811000", userId = `preview-peers-${randomUUID()}`;
const investigationId = randomUUID(), checkpointId = randomUUID();
const names = new Map<string, string>();
try {
  const [existing] = await sql`select (select count(*) from auth.users)+(select count(*) from core.entities)+(select count(*) from app.monitoring_refreshes) n`;
  if (Number(existing!.n) !== 0) throw new Error("The peer preview requires a fresh, empty schema-only test database");
  await sql.begin(async q => {
    await q`insert into auth.users(id,name,email,email_verified,role,two_factor_enabled) values(${userId},'Reporter — test izolat',${userId + "@example.invalid"},true,'user',true)`;
    await q`insert into app.investigations(id,owner_user_id,title,description) values(${investigationId},${userId},'Comparații documentate — exercițiu fictiv','Date fictive pentru verificarea interfeței. Nicio concluzie despre instituții sau firme reale.')`;
    for (let n = 0; n < 25; n++) {
      const id = String(Number(authority) + n), name = n === 0 ? "Comuna Valea Exemplului — date fictive" : `Comuna Exemplu ${String(n).padStart(2, "0")} — date fictive`;
      const county = n >= 1 && n <= 4 ? "Buzău" : "Cluj";
      names.set(id, name);
      await q`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid,country_code) values(${id},${name},${name.toLowerCase()},${county},${id},true,'RO')`;
      await q`insert into marts.entity_profile(entity_id,role,name_display,county,n_das,total_ron_full) values(${id},'authority',${name},${county},0,0)`;
    }
    for (let n = 0; n < 8; n++) {
      const id = String(Number(supplier) + n), name = `Firma Exemplu ${String(n + 1).padStart(2, "0")} — date fictive`;
      names.set(id, name);
      await q`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid,country_code) values(${id},${name},${name.toLowerCase()},'Cluj',${id},true,'RO')`;
      await q`insert into marts.entity_profile(entity_id,role,name_display,county,n_das,total_ron_full) values(${id},'supplier',${name},'Cluj',0,0)`;
    }
    await q`insert into core.cpv_codes(code,name_ro,revision,division) values('45000000-7','Lucrări de construcții','2008','45'),('71000000-8','Servicii de arhitectură și inginerie','2008','71')`;
    for (const year of [2024, 2025]) for (let n = 0; n < 25; n++) for (let r = 0; r < 4; r++) {
      const a = String(Number(authority) + n), s = String(Number(supplier) + ((n * 4 + r) % 8));
      const id = String(887820000 + (year - 2024) * 1000 + n * 4 + r), code = `EXEMPLU ${year}-${n}-${r}`;
      const value = `${(n === 0 ? 31250 : 19000 + n * 1000) + (year === 2024 ? -1000 : 0)}.0001`, date = `${year}-0${r + 2}-12`, county = n >= 1 && n <= 4 ? "Buzău" : "Cluj";
      await q`insert into core.direct_acquisitions(sicap_da_id,da_code,authority_entity_id,supplier_entity_id,closing_value,finalization_date,state,cpv_code) values(${id},${code},${a},${s},${value},${date}::timestamptz,'Oferta acceptata','45000000-7')`;
      await q`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date,cpv_code,cpv_name) values(${id},${code},${a},${names.get(a)!},${s},${names.get(s)!},${county},${value},${date},'45000000-7','Lucrări de construcții')`;
    }
    await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_value,currency,title,contract_date) values(887830001,1,887830099,887830088,0.01,'RON','EXEMPLU · alocări fracționare într-un consorțiu','2025-06-03')`;
    for (let n = 0; n < 3; n++) {
      const s = String(Number(supplier) + n), value = n === 2 ? "0.0034" : "0.0033";
      await q`insert into marts.contract_transactions(contract_id,supplier_id,authority_id,authority_name,supplier_name,county,closing_value,contract_value_full,n_winners,ca_notice_id,finalization_date,ted_pubnum,cpv_code,cpv_name) values(887830001,${s},${authority},${names.get(authority)!},${names.get(s)!},'Cluj',${value},0.01,3,887830088,'2025-06-03','000001-2025','45000000-7','Lucrări de construcții')`;
    }
    for (const year of [2024, 2025]) for (const kind of ["da", "award"]) await q`insert into marts.national_stats(kind,year,n,total_ron) values(${kind},${year},1,1)`;
    await q`insert into app.monitoring_refreshes(id,kind,status,completed_at,methodology,source_coverage,validation) values(${checkpointId},'baseline','ready',now(),'{"version":"peer-browser-fixture-1"}', '{"fixture":true,"note":"Date fictive izolate; nu reflectă colectări reale."}','{"fixture":true}')`;
  });
  const focal = await getPeers({entityId:authority,role:"authority",dataset:"all",year:2025,cpv:"45",page:1},sql);
  const firms = await getPeers({entityId:supplier,role:"supplier",dataset:"all",year:2025,cpv:"45",page:1},sql);
  const small = await getPeers({entityId:authority,role:"authority",dataset:"all",year:2025,cpv:"45",county:"Buzău",page:1},sql);
  if (focal.cohort.count !== 24 || focal.focal?.totalExact !== "125000.0104" || small.cohort.count !== 4 || !firms.cohort.enoughPeers) throw new Error("Peer fixture verification did not reconcile");
  const secret = randomBytes(40).toString("hex");
  process.env.BETTER_AUTH_SECRET = secret; process.env.BETTER_AUTH_URL = "http://localhost:3111";
  (globalThis as typeof globalThis & {__seapAuthDb:typeof connection.db}).__seapAuthDb = connection.db;
  const {auth} = await import("../lib/auth"); const context = await auth.$context, session = await context.internalAdapter.createSession(userId);
  const signed = `${session!.token}.${createHmac("sha256",context.secret).update(session!.token).digest("base64")}`;
  const artifact = process.argv.find(a=>a.startsWith("--output="))?.slice(9) ?? "/private/tmp/seap-peers-preview.json";
  await writeFile(artifact,JSON.stringify({fixture:true,databaseUrl:url,userId,investigationId,checkpointId,authority,supplier,secret,
    cookie:{name:context.authCookies.sessionToken.name,value:encodeURIComponent(signed)},baseUrl:"http://localhost:3111",
    expected:{authorityCount:7,authorityTotal:"125000.0104",peerCount:24,peerMedian:focal.cohort.medianTotalExact,supplierPeerCount:firms.cohort.count,smallPeerCount:4}},null,2),{mode:0o600});
  await chmod(artifact,0o600);
  console.log(JSON.stringify({artifact,fixture:true,authority,supplier,peerCount:24,supplierPeerCount:firms.cohort.count,smallPeerCount:4}));
} finally { await sql.end(); }
