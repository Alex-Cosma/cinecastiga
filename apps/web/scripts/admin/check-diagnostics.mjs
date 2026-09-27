import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import {chromium} from 'playwright-core';
import {createDb} from '@seap/db';
const base='http://localhost:3115',url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).pathname!='/seap_test_diagnostics')throw Error('Dedicated fixture DB only');
const env=parseEnv(await readFile('.env.local','utf8')),secret=env.BETTER_AUTH_SECRET;
const {sql:q}=createDb(url),browser=await chromium.launch({channel:'chrome',headless:true});
const users=[],errors=[];
async function context(role){const ctx=await browser.newContext(),id=randomUUID(),token=randomBytes(32).toString('hex');users.push(id);await q`insert into auth.users(id,name,email,email_verified,role) values(${id},'Diagnostics test',${id+'@example.test'},true,${role})`;await q`insert into auth.sessions(id,token,user_id,expires_at) values(${randomUUID()},${token},${id},now()+interval '1 hour')`;const signed=token+'.'+createHmac('sha256',secret).update(token).digest('base64');await ctx.addCookies([{name:'better-auth.session_token',value:encodeURIComponent(signed),url:base}]);return ctx;}
const check=(ok,message)=>{if(!ok)throw Error(message);console.log(message);};
try{
 await q`truncate app.collection_requests,app.collection_audit,app.collection_workers`;await q`update app.collection_control set paused=true,maintenance=false,blocked_reason=null where id=1`;
 const [failed]=await q`insert into app.collection_requests(stream,worker,method,endpoint,status,outcome,error,finished_at,diagnostics) values('tenders','fixture','POST','/api-pub/NoticeCommon/GetCNoticeList/',503,'failed','Maintenance fixture',now(),'{"response":{"body":"Synthetic complete diagnostic body","headers":{"set-cookie":"[redacted]"}}}'::jsonb) returning id`;
 await q`insert into app.collection_requests(stream,worker,method,endpoint,status,outcome,finished_at) select 'da','fixture','POST','/api-pub/test',200,'success',now() from generate_series(1,110)`;
 await q`insert into app.collection_audit(actor_id,actor_name,action,before,after) values('fixture','Administrator','retry-task','{"taskId":42}','{}')`;
 const admin=await context('admin'),member=await context('watchdog'),anon=await browser.newContext();
 const path='/api/admin/collection?request='+failed.id;
 check((await anon.request.get(base+path)).status()===403,'Anonymous diagnostic access denied');
 check((await member.request.get(base+path)).status()===403,'Non-admin diagnostic access denied');
 const response=await admin.request.get(base+path),detail=await response.json();
 check(response.status()===200&&detail.request.diagnostics.response.body==='Synthetic complete diagnostic body','Admin downloads complete diagnostic');
 check(response.headers()['content-disposition'].includes('attachment'),'Download has attachment filename');
 const status=await (await admin.request.get(base+'/api/admin/collection')).json();
 check(status.failures.length===1&&!JSON.stringify(status).includes('Synthetic complete diagnostic body'),'Polling retains old failure without downloading bodies');
 const page=await admin.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='localhost'?r.continue():r.abort());
 await page.goto(base+'/admin');await page.getByRole('button',{name:'Erori',exact:true}).click();
 await page.getByRole('button',{name:'Detalii cerere '+failed.id,exact:true}).click();
 await page.getByRole('link',{name:'Descarcă detaliile cererii'}).waitFor();
 check(await page.getByText('Maintenance fixture',{exact:true}).isVisible(),'Old failure remains visible after110successful requests');
 check(await page.getByText('Reîncercare explicită a sarcinii 42',{exact:false}).isVisible(),'Operator audit renders without crashing');
 await page.screenshot({path:'/tmp/seap-diagnostics-admin.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile has no horizontal overflow');
 check(errors.length===0,'No browser runtime errors');
}finally{for(const id of users)await q`delete from auth.users where id=${id}`;await browser.close();await q.end();}
