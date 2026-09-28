import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TOPIC_BASE_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local preview only');
const out='../../.impeccable/review/topic-search-live';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await ctx.newPage(),checks=[],errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(!['http:','https:'].includes(u.protocol)||['localhost','127.0.0.1'].includes(u.hostname))return route.continue();external.push(u.origin);return route.abort();});
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
page.setDefaultTimeout(30000);
const settle=async()=>{await page.waitForTimeout(100);await page.waitForLoadState('networkidle');await page.locator('.topic-results[aria-busy=false]').waitFor();check(!await page.locator('.topic-error[role=alert]').count(),'Search completed without API error');};
const shot=async name=>{await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${name}.png`,fullPage:true});};
const go=async params=>{await page.goto(`${base}/cauta?${params}`);await settle();};
try{
 await page.goto(base);await page.locator('[data-discovery-search]').fill('locuri de joaca');await page.locator('[data-discovery-search]').press('Enter');await page.waitForURL('**/cauta?**');await settle();check((await page.locator('#topic-query').inputValue())==='locuri de joaca','Homepage submits subject to /cauta');
 check(await page.locator('.topic-record').count()>0,'Public local archive supplies actual results');await shot('desktop');
 const api=await(await ctx.request.get(`${base}/api/topic-search?q=locuri%20de%20joaca`)).json();check(api.acquisitions.total>10,'Real title matches are paginated');check(api.acquisitions.hits.every(x=>typeof x.value==='string'||x.value===null),'Amounts stay decimal strings');
 await page.getByRole('button',{name:'Vezi toate achizițiile'}).click();await settle();check(await page.locator('.topic-record').count()===10,'Acquisition tab shows at most 10 records');const first=await page.locator('.topic-record h3').first().innerText();await page.getByRole('button',{name:'Înainte',exact:true}).click();await settle();check((await page.locator('.topic-record h3').first().innerText())!==first,'Next page changes records');check(new URL(page.url()).searchParams.get('page')==='2','Pagination persists in URL');
 await page.goBack();await settle();check(!new URL(page.url()).searchParams.has('page'),'Browser back restores first page');
 const place=page.getByRole('combobox',{name:'Unde cauți?'});await place.fill('buzau');await page.locator('.topic-options li button').filter({hasText:'MUNICIPIUL BUZAU'}).click();await settle();check(new URL(page.url()).searchParams.get('place')==='uat:44818','Locality selection uses exact identifier');
 await page.locator('.topic-period > button').click();await page.getByLabel('Din anul', {exact:true}).fill('2024');await page.getByLabel('Până în anul',{exact:true}).fill('2022');await page.getByRole('button',{name:'Aplică intervalul'}).click();check(await page.locator('.topic-period-panel [role=alert]').count()===1,'Reversed period is rejected without changing scope');await page.getByLabel('Din anul',{exact:true}).fill('2022');await page.getByLabel('Până în anul',{exact:true}).fill('2024');await page.getByRole('button',{name:'Aplică intervalul'}).click();await settle();check(new URL(page.url()).searchParams.get('from')==='2022'&&new URL(page.url()).searchParams.get('to')==='2024','Inclusive year range persists');
 await page.locator('.topic-period > button').click();await page.getByRole('button',{name:'Toți anii',exact:true}).click();await settle();check(!new URL(page.url()).searchParams.has('from'),'All years clears both boundaries');
 await page.getByRole('button',{name:'Șterge filtrul de localitate'}).click();await settle();
 await go('q=primaria+buzau&tab=entities');check((await page.locator('.topic-records').innerText()).replace(/\s+/g,' ').includes('MUNICIPIUL BUZAU'),'Colloquial city-hall lookup still finds municipality');
 await go('q=iluminat&tab=documents');check(await page.locator('.topic-document').count()>0,'Existing processed files are searchable across contracts');await shot('documents-desktop');
 const documentLink=page.locator('.topic-document-pages a').first(),href=await documentLink.getAttribute('href');check(await documentLink.getAttribute('target')==='_blank','Document results preserve search in a separate tab');
 const reader=await ctx.newPage();await reader.goto(base+href);await reader.locator('.df-page-text[aria-busy=false]').waitFor();check((await reader.locator('.df-page-text').innerText()).length>20,'Deep link opens actual page text in existing reader');const expected=new URL(base+href).searchParams.get('page');check((await reader.locator('.df-transcript h4').innerText()).trim()===`Textul paginii ${expected}`,'Reader page agrees with matched page');await reader.close();
 await go('q=locuri+de+joaca&place=county:buzau');await page.setViewportSize({width:390,height:844});await shot('mobile');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page has no horizontal overflow');await place.click();await place.fill('buzau');await page.locator('.topic-options li button').filter({hasText:'MUNICIPIUL BUZAU'}).waitFor();await shot('location-mobile');await page.keyboard.press('Escape');
 await page.locator('.topic-period > button').click();await shot('period-mobile');await page.keyboard.press('Escape');
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await shot('dark-mobile');await page.setViewportSize({width:1440,height:1000});await shot('dark-desktop');
 await page.evaluate(()=>document.documentElement.dataset.theme='light');await go('q=zzzxnevermatchtopiczzzx');check(await page.locator('.topic-record').count()===0,'Empty search is explicit');await shot('empty');
 await go('q=locuri+de+joaca');const height=await page.locator('.topic-results').evaluate(el=>el.getBoundingClientRect().height);
 await page.route('**/api/topic-search?**',async r=>{await new Promise(resolve=>setTimeout(resolve,800));await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Eroare simulată pentru verificare.'})});});await page.locator('#topic-query').fill('drumuri');await page.locator('.topic-query button').click();await page.locator('.topic-results[aria-busy=true]').waitFor();check(await page.locator('.topic-results').evaluate((el,h)=>el.getBoundingClientRect().height>=h,height),'Loading retains result area height');await page.locator('.topic-error[role=alert]').waitFor();check((await page.locator('.topic-results').innerText()).includes('ultima căutare încheiată'),'Failure labels retained results as preceding search');await shot('error');await page.unroute('**/api/topic-search?**');await page.getByRole('button',{name:'Reîncearcă',exact:true}).click();await settle();
 // Failed navigation must never relabel records with a scope that did not finish.
 for(const scenario of ['page','tab','place']){
  await go('q=locuri+de+joaca&tab=acquisitions');
  await page.route('**/api/topic-search?**',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Eroare simulată pentru verificare.'})}));
  if(scenario==='page')await page.getByRole('button',{name:'Înainte',exact:true}).click();
  else if(scenario==='tab')await page.locator('.topic-tabs button').filter({hasText:'Documente'}).click();
  else {await place.fill('buzau');await page.locator('.topic-options li button').filter({hasText:'MUNICIPIUL BUZAU'}).click();}
  await page.locator('.topic-error[role=alert]').waitFor();
  check((await page.locator('.topic-tabs [aria-current=page]').innerText()).includes('Achiziții'),`Failed ${scenario} keeps actual result tab`);
  check((await page.locator('.topic-pagination').innerText()).includes('Pagina 1 din'),`Failed ${scenario} keeps actual page`);
  const notice=await page.locator('.topic-results > .topic-help').innerText();
  check(notice.includes('toată țara')&&notice.includes('toți anii')&&notice.includes('pagina 1'),`Failed ${scenario} identifies actual geographic and period scope`);
  check(await page.getByRole('button',{name:'Înainte',exact:true}).isDisabled(),`Failed ${scenario} does not navigate stale results`);
  if(scenario==='place'){await shot('retained-error-desktop');await page.setViewportSize({width:390,height:844});await shot('retained-error-mobile');await page.setViewportSize({width:1440,height:1000});}
  await page.unroute('**/api/topic-search?**');
 }
 check(errors.length===0,'No browser runtime errors');check(external.length===0,'No external requests or SEAP acquisition from search');
 await writeFile(`${out}/verification.json`,JSON.stringify({base,checks,errors,external},null,2));console.log(JSON.stringify({checks:checks.length,errors,external,out}));
}finally{await browser.close();}
