// Schema-only fixture DB, authenticated browser, no SEAP traffic.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import {chromium} from 'playwright-core';
import {createDb} from '@seap/db';
const base='http://localhost:3115',url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||new URL(url).pathname!='/seap_test_admin_navigation')throw Error('Dedicated local fixture DB only');
const {BETTER_AUTH_SECRET:secret}=parseEnv(await readFile('.env.local','utf8'));
const {sql:q}=createDb(url),browser=await chromium.launch({channel:'chrome',headless:true});
const id=randomUUID(),token=randomBytes(32).toString('hex'),errors=[],checks=[],external=[],users=[id],out='../../.impeccable/review/admin-navigation-live';let heartbeat;
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);console.log(label)};
await mkdir(out,{recursive:true});
try{
 await q`truncate app.collection_tasks,app.collection_batches,app.collection_requests,app.collection_workers,app.collection_audit cascade`;
 await q`insert into app.collection_control(id) values(1) on conflict do nothing`;
 await q`update app.collection_control set revision=1,paused=false,maintenance=false,blocked_reason=null,paused_streams='[]',processing_enabled=true,processing_enabled_at=now(),min_seconds=50,max_seconds=70,daily_limit=null`;
 await q`insert into app.collection_batches(id,end_day,created_at) values('nav-fixture','2026-09-25',now()-interval '2 days')`;
 await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,status,result,finished_at)
 select 'nav-fixture','da:'||i,'da:'||i,'da','da',jsonb_build_object('authorityId',i,'page',0),case when i<=120 then 'complete' else 'pending' end,'{"total":1}'::jsonb,case when i<=120 then now()-interval '1 hour' end from generate_series(1,200)i`;
 await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,status,result,finished_at)
 select 'nav-fixture',s||':'||i,s||':'||i,s,'list',jsonb_build_object('page',0,'from',('2026-01-01'::date+(i%3)*interval '1 month'+(i/3)*interval '1 day')::date::text),case when i<=24 then 'complete' else 'pending' end,'{"total":2}'::jsonb,case when i<=24 then now()-interval '1 hour' end from generate_series(1,30)i cross join unnest(array['tenders','awards'])s`;
 await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,status,result,finished_at) values('nav-fixture','cat','cat','catalogue','catalogue','{"page":0}','complete','{"total":200}',now())`;
 await q`insert into app.collection_workers(id,kind,state) values('nav-fixture','ingestion','idle'),('nightly-scheduler','scheduler','waiting')`;
 heartbeat=setInterval(()=>void q`update app.collection_workers set heartbeat_at=now()`,10000);
 await q`insert into app.collection_requests(stream,worker,method,endpoint,outcome,status,started_at,finished_at)
 select 'da','fixture','POST','/api-pub/fixture','success',200,now()-i*interval '1 minute',now()-i*interval '1 minute'+interval '1 second' from generate_series(1,25)i`;
 await q`insert into auth.users(id,name,email,email_verified,role) values(${id},'Administrator de test',${id+'@example.test'},true,'admin')`;
 for(let i=0;i<11;i++){const uid=randomUUID();users.push(uid);await q`insert into auth.users(id,name,email,email_verified,role) values(${uid},${'Reporter de test '+(i+1)},${uid+'@example.test'},true,'watchdog')`}
 await q`insert into auth.sessions(id,token,user_id,expires_at) values(${randomUUID()},${token},${id},now()+interval '1 hour')`;
 const ctx=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
 await ctx.addCookies([{name:'better-auth.session_token',value:encodeURIComponent(token+'.'+createHmac('sha256',secret).update(token).digest('base64')),url:base}]);
 await ctx.route('**/*',route=>{if(/^https?:/.test(route.request().url())&&!route.request().url().startsWith(base)){external.push(route.request().url());return route.abort()}return route.continue()});
 const page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const nav=async label=>{const link=page.locator('nav[aria-label="Administrare"]').getByRole('link',{name:label,exact:true});await link.click();await page.waitForFunction(label=>[...document.querySelectorAll('nav[aria-label="Administrare"] a')].some(a=>a.textContent===label&&a.getAttribute('aria-current')==='page'),label);};
 const shot=async name=>{await page.evaluate(()=>{window.scrollTo(0,0);document.activeElement?.blur()});await page.screenshot({path:out+'/'+name+'.png',fullPage:true})};
 await page.goto(base+'/admin',{waitUntil:'networkidle'});await page.locator('.recovery-overview progress').waitFor();
 const snapshot=await(await ctx.request.get(base+'/api/admin/collection')).json();check(snapshot.forecast.state==='estimated'&&snapshot.forecast.daysHigh>0,'Real metadata yields estimate with adequate sample');check(await page.locator('.stream-meter progress').count()===3,'Three stream progress bars');await shot('desktop');
 await page.evaluate(()=>window.__adminMarker='same-document');await page.locator('#delay-min').fill('55');await nav('Conturi');await page.getByRole('heading',{name:'Conturi și acces'}).waitFor();check(await page.evaluate(()=>window.__adminMarker==='same-document'),'Accounts navigation does not reload the document');check(await page.locator('.policy-note').isVisible(),'Unsaved settings reminder on accounts');check(await page.locator('.admin-accounts tbody tr').count()===10,'Accounts capped at ten rows');await shot('accounts');
 await page.goBack();await page.locator('#delay-min').waitFor();check(await page.locator('#delay-min').inputValue()==='55','Back preserves draft');
 await nav('Procesare');check(await page.locator('#risk-weekday').isVisible()&&!await page.locator('#delay-min').isVisible(),'Settings placed in their corresponding sections');await page.locator('#maintenance-time').fill('05:10');await page.locator('#apply').click();await page.getByText('Modificarea a fost salvată. Pauza deja începută se păstrează.').waitFor();const saved=(await q`select min_seconds,processing_time from app.collection_control`)[0];check(saved.min_seconds===55&&saved.processing_time==='05:10','Explicit apply saves retained collection and processing drafts together');await shot('processing');
 await nav('Fișiere');await page.getByText('Niciun fișier nu așteaptă descărcarea.').waitFor();check(await page.locator('#files').isVisible()&&!await page.locator('#publication').isVisible(),'File queue is its own view');
 await nav('Jurnal');check(await page.locator('#journal tbody>tr').count()===10,'Journal capped at ten rows');await page.locator('#journal').getByRole('button',{name:'Următoarele'}).click();const range=await page.locator('#journal .queue-pagination span').innerText();await nav('Conturi');await nav('Jurnal');check(await page.locator('#journal .queue-pagination span').innerText()===range,'Journal page preserved across routes');await shot('journal');
 await q`insert into app.collection_tasks(batch_id,key,partition,stream,kind,params,status) values('nav-fixture','deferred','deferred','awards','detail','{}','deferred')`;
 await nav('Colectare');await page.getByRole('heading',{name:'Există goluri care necesită rezolvare.'}).waitFor({timeout:16000});check(!(await page.locator('.recovery-estimate').innerText()).includes('zile pentru acest lot'),'Deferred details suppress completion ETA');
 await q`delete from app.collection_tasks where key='deferred'`;await q`update app.collection_control set paused=true`;await page.getByRole('heading',{name:'Termenul nu poate fi actualizat acum.'}).waitFor({timeout:16000});
 await page.setViewportSize({width:390,height:844});await shot('mobile');await page.evaluate(()=>window.scrollTo(0,800));check(await page.evaluate(()=>document.querySelector('.admin-navigation').getBoundingClientRect().top>=document.querySelector('.site-header').getBoundingClientRect().bottom-1),'Sticky admin navigation clears site header');await page.evaluate(()=>window.scrollTo(0,0));check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No collection overflow on mobile');
 await nav('Conturi');await shot('accounts-mobile');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No accounts page overflow on mobile');await page.evaluate(()=>document.documentElement.dataset.theme='dark');await shot('accounts-dark-mobile');
 const anon=await browser.newContext();for(const path of ['/admin','/admin/procesare','/admin/fisiere','/admin/jurnal','/admin/conturi']){const r=await anon.request.get(base+path,{maxRedirects:0});check(r.status()===307||r.status()===303,'Anonymous rejected '+path)}check((await anon.request.get(base+'/api/admin/collection')).status()===403,'Anonymous status API denied');await anon.close();
 check((await q`select count(*)::int n from app.collection_requests`)[0].n===25,'No source requests from admin use');check(errors.length===0,'No browser runtime errors');check(external.length===0,'No external network requests');await writeFile(out+'/verification.json',JSON.stringify({checks,errors,external,scope:'Authenticated production build, schema-only synthetic local database'},null,2));
}finally{clearInterval(heartbeat);await q`delete from auth.sessions where user_id=any(${users}::text[])`;await q`delete from auth.users where id=any(${users}::text[])`;await browser.close();await q.end()}
