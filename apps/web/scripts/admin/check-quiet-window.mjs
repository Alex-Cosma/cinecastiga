// Synthetic admin status only. No collector, scheduler or SEAP requests.
import {readFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import {chromium} from 'playwright-core';
import {createDb} from '@seap/db';
const base='http://localhost:3115',url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||new URL(url).pathname!='/seap_test_admin_queue')throw Error('Dedicated local fixture DB only');
const env=parseEnv(await readFile('.env.local','utf8')),secret=env.BETTER_AUTH_SECRET;
const {sql:q}=createDb(url),browser=await chromium.launch({channel:'chrome',headless:true});
const id=randomUUID(),token=randomBytes(32).toString('hex'),errors=[],out='../../.impeccable/review/quiet-window';
const check=(ok,message)=>{if(!ok)throw Error(message);console.log(message);};
await mkdir(out,{recursive:true});
try{
 await q`insert into app.collection_control(id) values(1) on conflict do nothing`;
 await q`update app.collection_control set revision=1,processing_enabled=true,processing_enabled_at=now(),processing_time='05:00',risk_weekday=0,maintenance=false,paused=false,blocked_reason=null`;
 await q`insert into app.collection_workers(id,kind,state) values('quiet-fixture','ingestion','idle') on conflict(id) do update set heartbeat_at=now()`;
 await q`insert into auth.users(id,name,email,email_verified,role) values(${id},'Fixture administrator',${id+'@example.test'},true,'admin')`;
 await q`insert into auth.sessions(id,token,user_id,expires_at) values(${randomUUID()},${token},${id},now()+interval '1 hour')`;
 const ctx=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
 await ctx.addCookies([{name:'better-auth.session_token',value:encodeURIComponent(token+'.'+createHmac('sha256',secret).update(token).digest('base64')),url:base}]);
 let quiet=true;
 await ctx.route('**/api/admin/collection',async route=>{
  const res=await route.fetch(),data=await res.json();
  data.quietWindow={active:quiet,starts_at:'2026-09-27T23:59:00.000Z',resumes_at:'2026-09-28T00:30:00.000Z'};
  await route.fulfill({response:res,json:data});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/admin',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Pauză SEAP programată până la 03:30:00.'}).waitFor();
 check(await page.locator('.live-band').getAttribute('data-state')==='paused','Scheduled pause uses paused presentation');
 check(await page.locator('#countdown').innerText()==='Oprite','No misleading next-request countdown during quiet window');
 check((await page.locator('#files').innerText()).includes('Pauză SEAP programată'),'Document queue explains scheduled wait');
 await page.screenshot({path:out+'/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile page overflow');
 await page.screenshot({path:out+'/mobile.png',fullPage:true});
 await q`update app.collection_control set blocked_reason='Eroare de transport existentă.'`;
 await page.reload({waitUntil:'networkidle'});
 check((await page.locator('#state-title').innerText()).includes('verificarea sursei'),'Source error takes precedence over scheduled pause');
 await q`update app.collection_control set blocked_reason=null,paused=true`;
 quiet=false;await page.reload({waitUntil:'networkidle'});
 check((await page.locator('#state-title').innerText()).includes('pe pauză'),'Manual pause remains visible after scheduled resume');
 await q`update app.collection_control set paused=false`;
 await page.reload({waitUntil:'networkidle'});
 check(!(await page.locator('#state-title').innerText()).includes('programată'),'Normal state returns after quiet window');
 check((await q`select count(*)::int n from app.collection_requests`)[0].n===0,'No source requests or ledger entries');
 check(errors.length===0,'No browser runtime errors');
}finally{await q`delete from auth.sessions where user_id=${id}`;await q`delete from auth.users where id=${id}`;await browser.close();await q.end();}
