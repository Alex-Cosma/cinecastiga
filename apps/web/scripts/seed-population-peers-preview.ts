/** Isolated acceptance fixture: real INS locality names/populations, entirely fictional
 * procurement and accounts. Requires a fresh schema-only seap_test_* database.
 * Its private JSON contains an ephemeral session/secret; delete after review.
 */
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { createDb } from "@seap/db";
import { getPeers } from "../lib/peers";
import { POPULATION_VERSION, populationFold } from "../lib/peer-population";
import catalog from "../lib/reference/population-rpl2021.json";

const url=process.env.TEST_DATABASE_URL;
if(!url||!/^seap_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1)))throw new Error("An explicit isolated TEST_DATABASE_URL named seap_test_* is required");
const connection=createDb(url),sql=connection.sql;
const authority="887850000",supplier="887851000",zeroAuthority="887850010",manualLocality="887850011",unknownPopulation="887850012";
const userId=`preview-population-${randomUUID()}`,investigationId=randomUUID(),checkpointId=randomUUID();
const names=new Map<string,string>(),counties=new Map<string,string>();
// Synthetic checksum-valid CUIs. They identify only records in this isolated fixture.
function fictionalCui(index:number){const base=String(88785000+index).padStart(9,"0"),weights="753217532";let check=(Array.from(base).reduce((sum,digit,n)=>sum+Number(digit)*Number(weights[n]),0)*10)%11;if(check===10)check=0;return String(Number(base))+check;}
const sirutas=[44818,106318,167473,136483,114319,35731,146263,109773,120726,32394,77812,57706];
try{
  const [existing]=await sql`select (select count(*) from auth.users)+(select count(*) from core.entities)+(select count(*) from app.monitoring_refreshes) n`;
  if(Number(existing!.n)!==0)throw new Error("Population preview requires a fresh, empty schema-only test database");
  await sql.begin(async q=>{
    await q`insert into auth.users(id,name,email,email_verified,role,two_factor_enabled)values(${userId},'Reporter — populație, test izolat',${userId+'@example.invalid'},true,'user',true)`;
    await q`insert into app.investigations(id,owner_user_id,title,description)values(${investigationId},${userId},'Comparații după populație — achiziții fictive','Localități și populații INS reale; achiziții, firme, identificatori și utilizator integral fictivi. Nicio concluzie despre administrațiile reale.')`;
    for(let n=0;n<13;n++){
      const id=String(Number(authority)+n),unit=n<12?catalog.units.find(unit=>unit.siruta===sirutas[n]):null;
      if(n<12&&!unit)throw new Error('Missing fixture INS locality');
      const name=unit?(unit.kind==='commune'?'COMUNA ':'')+unit.name:'Laborator de test — instituție fictivă',county=unit?.county??'CLUJ';
      names.set(id,name);counties.set(id,county);
      await q`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid,country_code)values(${id},${name},${populationFold(name)},${county},${fictionalCui(n)},true,'RO')`;
      await q`insert into core.entity_sicap_ids(entity_id,namespace,sicap_id)values(${id},'authority',${Number(id)})`;
      await q`insert into marts.entity_profile(entity_id,role,name_display,county,n_das,total_ron_full)values(${id},'authority',${name},${county},0,0)`;
    }
    for(let n=0;n<3;n++){
      const id=String(Number(supplier)+n),name=`Firma fictivă ${n+1} — date de test`;
      names.set(id,name);
      await q`insert into core.entities(id,name_display,name_normalized,county,cui_canonical,cui_valid,country_code)values(${id},${name},${populationFold(name)},'CLUJ',${fictionalCui(100+n)},true,'RO')`;
      await q`insert into core.entity_sicap_ids(entity_id,namespace,sicap_id)values(${id},'supplier',${Number(id)})`;
    }
    await q`insert into core.cpv_codes(code,name_ro,revision,division)values('45000000-7','Lucrări de construcții','2008','45'),('71000000-8','Servicii de arhitectură și inginerie','2008','71')`;
    for(const year of [2024,2025])for(let n=0;n<13;n++){
      if(n===10)continue;
      for(let row=0;row<4;row++){
        const a=String(Number(authority)+n),s=String(Number(supplier)+row%3),id=String(887860000+(year-2024)*1000+n*4+row),code=`FICTIV ${year}-${n}-${row}`;
        const value=`${(n===0?31250:19000+n*1000)+(year===2024?-1000:0)}.0001`,date=`${year}-0${row+2}-12`;
        await q`insert into core.direct_acquisitions(sicap_da_id,da_code,authority_entity_id,supplier_entity_id,closing_value,finalization_date,state,cpv_code)values(${id},${code},${a},${s},${value},${date}::timestamptz,'Oferta acceptata','45000000-7')`;
        await q`insert into marts.da_transactions(sicap_da_id,da_code,authority_id,authority_name,supplier_id,supplier_name,county,closing_value,finalization_date,cpv_code,cpv_name)values(${id},${code},${a},${names.get(a)!},${s},${names.get(s)!},${counties.get(a)!},${value},${date},'45000000-7','Lucrări de construcții')`;
      }
    }
    await q`insert into core.contracts(id,raw_id,ca_notice_contract_id,ca_notice_id,contract_value,currency,title,contract_date)values(887870001,1,887870099,887870088,0.01,'RON','FICTIV · cote fracționare într-un consorțiu','2025-06-03')`;
    for(let n=0;n<3;n++){
      const s=String(Number(supplier)+n),value=n===2?'0.0034':'0.0033';
      await q`insert into marts.contract_transactions(contract_id,supplier_id,authority_id,authority_name,supplier_name,county,closing_value,contract_value_full,n_winners,ca_notice_id,finalization_date,ted_pubnum,cpv_code,cpv_name)values(887870001,${s},${authority},${names.get(authority)!},${names.get(s)!},'BUZĂU',${value},0.01,3,887870088,'2025-06-03','000002-2025','45000000-7','Lucrări de construcții')`;
    }
    for(const year of [2024,2025])for(const kind of ['da','award'])await q`insert into marts.national_stats(kind,year,n,total_ron)values(${kind},${year},1,1)`;
    await q`insert into app.monitoring_refreshes(id,kind,status,completed_at,methodology,source_coverage,validation)values(${checkpointId},'baseline','ready',now(),'{"version":"population-browser-fixture-1"}','{"fixture":true,"note":"Achiziții fictive, populații INS reale; test izolat."}','{"fixture":true}')`;
  });
  const focal=await getPeers({entityId:authority,role:'authority',dataset:'all',year:2025,cpv:'45',page:1},sql);
  if(focal.filters.method!=='population'||focal.cohort.count!==10||focal.cohort.observedMemberCount!==9||focal.focal?.totalExact!=='125000.0104'||!focal.members.some(member=>member.entity.id===zeroAuthority&&member.recordCount===0))throw new Error('Population fixture did not reconcile');
  const secret=randomBytes(40).toString('hex');process.env.BETTER_AUTH_SECRET=secret;process.env.BETTER_AUTH_URL='http://localhost:3111';
  (globalThis as typeof globalThis & {__seapAuthDb:typeof connection.db}).__seapAuthDb=connection.db;
  const {auth}=await import('../lib/auth'),context=await auth.$context,session=await context.internalAdapter.createSession(userId);
  const signed=`${session!.token}.${createHmac('sha256',context.secret).update(session!.token).digest('base64')}`;
  const artifact=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)??'/private/tmp/seap-population-peers-preview.json';
  await writeFile(artifact,JSON.stringify({fixture:true,kind:'population-peers',databaseUrl:url,userId,investigationId,checkpointId,authority,supplier,zeroAuthority,manualLocality,unknownPopulation,secret,
    cookie:{name:context.authCookies.sessionToken.name,value:encodeURIComponent(signed)},baseUrl:'http://localhost:3111',populationVersion:POPULATION_VERSION,
    expected:{focalRows:7,focalTotal:'125000.0104',peerCount:10,observedPeers:9,population:focal.focal.population!.value,peerIds:focal.members.map(member=>member.entity.id),peerMedian:focal.cohort.medianTotalExact}},null,2),{mode:0o600});await chmod(artifact,0o600);
  console.log(JSON.stringify({artifact,fixture:true,authority,peerCount:10,observedPeers:9,zeroAuthority,manualLocality,unknownPopulation}));
}finally{await sql.end();}
