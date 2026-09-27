// Isolated browser fixture; never starts the host scheduler or a source request.
import {readFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import {chromium} from 'playwright-core';
import {createDb} from '@seap/db';
const base='http://localhost:3115',url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||new URL(url).pathname!='/seap_test_admin_queue')throw Error('Dedicated local fixture DB only');
const env=parseEnv(await readFile('.env.local','utf8')),secret=env.BETTER_AUTH_SECRET;
const {sql:q}=createDb(url),browser=await chromium.launch({channel:'chrome',headless:true});
const id=randomUUID(),token=randomBytes(32).toString('hex'),errors=[],out='../../.impeccable/review/processing-schedule';
const check=(ok,message)=>{if(!ok)throw Error(message);console.log(message);};
await mkdir(out,{recursive:true});
try{
 await q`truncate app.processing_runs,app.collection_workers,app.collection_audit,app.monitoring_refreshes cascade`;
 await q`insert into app.collection_control(id) values(1) on conflict do nothing`;
 await q`update app.collection_control set revision=1,processing_enabled=false,processing_enabled_at=null,processing_time='05:00',risk_weekday=0,maintenance=false,paused=true,blocked_reason=null`;
 await q`insert into app.monitoring_refreshes(kind,status,completed_at,validation) values('coordinated','ready',now(),'{"risk":{"calculatedAt":"2026-09-20T03:00:00Z","recalculated":false},"refreshScope":"daily","checks":[{"check":"ted_normalization","passed":true,"details":{"total":"161633","pending":"0"}}]}')`;
 await q`insert into auth.users(id,name,email,email_verified,role) values(${id},'Fixture administrator',${id+'@example.test'},true,'admin')`;
 await q`insert into auth.sessions(id,token,user_id,expires_at) values(${randomUUID()},${token},${id},now()+interval '1 hour')`;
 const ctx=await browser.newContext({viewport:{width:1440,height:1050}});
 await ctx.addCookies([{name:'better-auth.session_token',value:encodeURIComponent(token+'.'+createHmac('sha256',secret).update(token).digest('base64')),url:base}]);
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/admin',{waitUntil:'domcontentloaded'});
 await page.getByText('Program automat oprit',{exact:true}).waitFor();
 check(await page.locator('#risk-weekday').inputValue()==='0','Sunday is selected');
 await page.locator('#processing-enabled').check();console.log('Activation control changed');
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/admin/collection')&&r.request().method()==='POST');await page.locator('#apply').click();const response=await saved;console.log('Settings response',response.status(),await response.text());
 await page.getByText('Program activ · serviciu fără semnal recent',{exact:true}).waitFor();
 const control=(await q`select * from app.collection_control`)[0];
 check(control.processing_enabled&&!!control.processing_enabled_at&&control.risk_weekday===0,'Settings persist activation date and weekly day');
 check((await q`select count(*)::int n from app.processing_runs`)[0].n===0,'Saving settings never starts a processing job');
 const [beforeRequests]=await q`select count(*)::int n from app.collection_requests`;
 check((await page.request.post(base+'/api/admin/collection',{headers:{Origin:base},data:{action:'settings',revision:control.revision,minSeconds:50,maxSeconds:70,dailyLimit:null,processingTime:'05:00',processingEnabled:true,riskWeekday:7}})).status()===400,'Invalid weekday is rejected');
 await q`insert into app.collection_workers(id,kind,state) values('nightly-scheduler','scheduler','waiting')`;
 await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Program automat activ',{exact:true}).waitFor();
 check((await page.locator('.processing-freshness').innerText()).includes('20 sept.'),'Weekly risk date is distinct from latest daily publication');
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:out+'/desktop.png',fullPage:true});
 await page.locator('#publication').screenshot({style:'header, .d-skip-link { visibility: hidden !important; }',path:out+'/processing-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.scrollTo(0,0));
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile has no horizontal overflow');
 await page.screenshot({path:out+'/mobile.png',fullPage:true});
 await page.locator('#publication').screenshot({style:'header, .d-skip-link { visibility: hidden !important; }',path:out+'/processing-mobile.png'});
 await q`insert into app.processing_runs(scheduled_day,scope,control_revision,before_control,stage,started_at,stages)
   values((now() at time zone 'Europe/Bucharest')::date,'daily',${control.revision},'{"paused":true}','radiografie',now()-interval '15 minutes',
     '{"backup":{"startedAt":"2026-09-28T02:00:00Z","completedAt":"2026-09-28T02:07:00Z","durationMs":420000},"normalize":{"startedAt":"2026-09-28T02:07:00Z","completedAt":"2026-09-28T02:08:00Z","durationMs":60000}}')`;
 await q`update app.collection_control set maintenance=true`;
 await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Rulare programată în curs',{exact:true}).waitFor();
 check(await page.locator('#processing-enabled').isDisabled(),'Schedule controls are disabled during maintenance');
 check((await page.request.post(base+'/api/admin/collection',{headers:{Origin:base},data:{action:'settings',revision:control.revision,minSeconds:50,maxSeconds:70,dailyLimit:null,processingTime:'05:00'}})).status()===409,'Backend preserves running publication settings');
 await page.locator('.processing-decisions').first().locator('summary').click();
 await page.locator('#publication').screenshot({style:'header, .d-skip-link { visibility: hidden !important; }',path:out+'/processing-running-mobile.png'});
 await q`update app.processing_runs set status='failed',completed_at=now(),error='Synthetic failure fixture'`;
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#publication [role="alert"]').waitFor();
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
 await page.locator('#publication').screenshot({style:'header, .d-skip-link { visibility: hidden !important; }',path:out+'/processing-failed-dark.png'});
 check((await q`select count(*)::int n from app.collection_requests`)[0].n===beforeRequests.n,'Admin inspection triggers no SEAP requests');
 check(errors.length===0,'No browser runtime errors');
}finally{
 await q`update app.collection_control set maintenance=false,processing_enabled=false`;
 await q`delete from auth.users where id=${id}`;
 await browser.close();await q.end({timeout:5});
}
