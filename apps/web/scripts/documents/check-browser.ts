import {chromium} from 'playwright-core';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const repo=resolve('../..'),out=resolve(repo,'docs/implementation/previews/batch5-documents-live');await mkdir(out,{recursive:true});
const fixture=JSON.parse(await readFile('/tmp/seap-documents-browser.json','utf8'));
const browser=await chromium.connectOverCDP('http://127.0.0.1:9237');const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies([{...fixture.cookie,url:'http://localhost:3113',httpOnly:true,sameSite:'Lax'}]);
const errors:string[]=[],external:string[]=[],checks:string[]=[];
await context.route('**/*',r=>{const u=new URL(r.request().url());if(!['http:','https:'].includes(u.protocol)||['localhost','127.0.0.1'].includes(u.hostname))return r.continue();external.push(u.origin);console.log('Blocked external origin:',u.origin);return r.abort();});
const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label);};
const shot=async(name:string)=>{const readerView=/^(reader|quote)-/.test(name);if(readerView){await page.locator('.df-reader').evaluate(el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(1800);}else{await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(150);}await page.screenshot({path:resolve(out,name+'.png'),fullPage:!readerView});};
const base='http://localhost:3113';
try{
 await page.goto(base+'/contracte/107063311',{waitUntil:'networkidle'});
 check((await context.request.get(base+'/api/auth/get-session')).status()===200,'Session endpoint responds');
 const user=await (await context.request.get(base+'/api/auth/get-session')).json();check(user?.user?.id===fixture.user,'Temporary local authenticated session');
 await page.locator('#fisiere').scrollIntoViewIfNeeded();await shot('files-desktop');
 const row=page.locator('.df-file').filter({hasText:'HC-127-2025.pdf'});
 const before=await(await context.request.get(base+'/api/contracte/107063311/files')).json();const existing=before.files.find((f:any)=>f.id===fixture.documentId);
 if(!existing.processedAt){
  await row.getByRole('button',{name:/proces/}).click();await page.waitForFunction(()=>document.querySelector('.df-file')?.parentElement?.textContent?.includes('În coadă'));
  await shot('queue-desktop');
  const worker=spawn('docker',['run','--rm','--name','seap-documents-pilot-worker','--network','container:seap-postgres-1','-e','DATABASE_URL=postgres://seap:seap_dev@127.0.0.1:5432/seap','-e','DOCUMENTS_ENABLED=true','-e','DOCUMENTS_OFFLINE=true','-v',`${repo}/apps/web/lib:/app/apps/web/lib:ro`,'-v',`${repo}/apps/web/scripts:/app/apps/web/scripts:ro`,'seap-documents-local','node','apps/web/node_modules/tsx/dist/cli.mjs','apps/web/scripts/documents/worker.ts','--once'],{stdio:['ignore','pipe','pipe']});
  let log='';worker.stdout.on('data',d=>log+=d);worker.stderr.on('data',d=>log+=d);
  const finished=new Promise<number|null>(r=>worker.once('exit',r));
  await page.waitForFunction(()=>!!document.querySelector('.df-progress'),{},{timeout:40000});await shot('processing-desktop');
  await page.setViewportSize({width:390,height:844});await shot('processing-mobile');
  await page.reload();await page.locator('.df-progress').waitFor();checks.push('Real processing survives browser reload');
  check(await finished===0,'Linux worker completed');await writeFile('/tmp/seap-documents-pilot-worker.log',log);
 }
 await row.getByRole('button',{name:'Deschide documentul'}).waitFor({timeout:180000});
 await page.setViewportSize({width:1440,height:1000});await row.getByRole('button',{name:'Deschide documentul'}).click();await page.waitForFunction(()=>!!document.querySelector('.df-page-text')?.textContent?.trim()&&!document.querySelector('.df-page-text')?.textContent?.includes('Se încarcă'));
 const fulltext=await page.locator('.df-page-text').innerText();check(fulltext.length>30,'Actual court PDF has OCR text');
 await shot('reader-desktop');
 const phrase=fulltext.split(/\s+/).find(t=>t.length>5&&/^[a-zăîâșț]+$/i.test(t))!;check(phrase,'Searchable word from actual source');
 await page.locator('.df-search input').fill(phrase);await page.locator('.df-search').getByRole('button',{name:'Caută',exact:true}).click();await page.locator('.df-hit').first().waitFor();checks.push('Cross-document search returns filename and page');await shot('search-desktop');
 await page.locator('.df-document-search input').fill(phrase);await page.getByRole('button',{name:'Găsește paginile'}).click();await page.locator('.df-page-matches button').first().waitFor();checks.push('Document-specific search links directly to pages');
 await page.locator('.df-page-text').evaluate(el=>{const selection=window.getSelection()!,range=document.createRange();range.selectNodeContents(el);selection.removeAllRanges();selection.addRange(range);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await page.locator('.df-quote').waitFor();await page.locator('.df-quote select').selectOption('new');await page.locator('.df-quote input').fill('EXEMPLU LOCAL · Verificare documente');await page.locator('.df-quote textarea').fill('Notă demonstrativă pentru verificarea funcționalității, fără concluzii despre procedură.');
 await shot('quote-desktop');await page.getByRole('button',{name:'Salvează pasajul în anchetă'}).click();await page.getByRole('link',{name:'Deschide ancheta →'}).waitFor();
 const target=await page.getByRole('link',{name:'Deschide ancheta →'}).getAttribute('href');await page.goto(base+target);await page.locator('.iw-evidence blockquote').waitFor();checks.push('UI saved a server-validated passage in a private investigation');await shot('investigation-desktop');
 check(await page.getByRole('link',{name:'Verifică pagina originală ↗'}).count()===1,'Investigation retains original page link');
 const inv=target!.split('/')[2]!.split('?')[0];const md=await(await context.request.get(`${base}/api/anchete/${inv}/export?format=md`)).text();check(md.includes('SHA-256 original:')&&md.includes('Pagina originală'),'Export preserves quote source and original hash');
 await page.goto(base+`/contracte/107063311?document=${fixture.documentId}&page=1`);await page.locator('.df-reader').waitFor();
 await page.setViewportSize({width:390,height:844});await shot('reader-mobile');
 for(const width of [320,390,800,1440]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No horizontal overflow at ${width}`);}
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await shot('files-dark');
 const after=await(await context.request.get(base+'/api/contracte/107063311/files')).json();check(after.requestCount===before.requestCount,'Existing original processed with zero new SEAP requests');
 check(!external.length,'No external browser requests');check(!errors.length,'No browser runtime errors');
 await writeFile(resolve(out,'verification.json'),JSON.stringify({status:'passed',checks,errors,external,liveSeapRequests:0},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length}));
}finally{await context.close();await browser.close();}
