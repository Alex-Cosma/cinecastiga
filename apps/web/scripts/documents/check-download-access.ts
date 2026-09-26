import {chromium} from 'playwright-core';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const base='http://localhost:3113',doc='799aff30-8998-4c72-8e94-659cbd918f67',out=resolve('../../docs/implementation/previews/batch5-documents-live');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9237'),context=await browser.newContext({viewport:{width:1440,height:1000}});
try{
 await context.route('**/*',route=>!/^https?:/.test(route.request().url())||route.request().url().startsWith(base)?route.continue():route.abort());
 for(const suffix of ['', '?kind=pdf']){const response=await context.request.get(`${base}/api/documents/${doc}/file${suffix}`);if(response.status()!==200)throw Error('Archived original/PDF not publicly accessible');}
 const before=await (await context.request.get(`${base}/api/contracte/107063311/files`)).json();
 const pending=before.files.find((f:any)=>!f.originalHash);if(!pending)throw Error('Missing unprepared fixture');
 for(const documentId of [pending.id,null]){const response=await context.request.post(`${base}/api/contracte/107063311/files`,{data:{documentId}});if(response.status()!==401)throw Error('Anonymous source job not rejected');}
 const page=await context.newPage();await page.bringToFront();await page.goto(`${base}/contracte/107063311?document=${doc}&page=3`,{waitUntil:'networkidle'});
 if(!await page.getByRole('button',{name:'Descarcă și procesează',exact:true}).first().isDisabled())throw Error('Anonymous SEAP download action enabled');
 await page.waitForFunction(()=>document.querySelector('.df-pdf-viewport')?.getAttribute('aria-busy')==='false');
 await page.locator('.df-reader-toolbar').getByRole('link',{name:'Originalul'}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.locator('.df-file').first().screenshot({path:resolve(out,'download-disabled-mobile.png')});
 const fixture=JSON.parse(await readFile('/tmp/seap-documents-browser.json','utf8'));await context.addCookies([{...fixture.cookie,domain:'localhost',path:'/'}]);
 await page.reload({waitUntil:'networkidle'});
 if(await page.getByRole('button',{name:'Descarcă și procesează',exact:true}).first().isDisabled())throw Error('Authenticated source download disabled');
 const after=await (await context.request.get(`${base}/api/contracte/107063311/files`)).json();if(before.requestCount!==after.requestCount)throw Error('Verification issued source requests');
 await writeFile(resolve(out,'download-access-verification.json'),JSON.stringify({status:'passed',checks:['Archived original and derived PDF publicly return200','Anonymous source file/list queue POSTs return401','Anonymous source-download buttons disabled with sign-in link','Anonymous PDF viewer and original link remain available','Authenticated source-download controls enabled','Verification creates no source requests'],liveSeapRequests:0},null,2));console.log('Public archive/account-only SEAP acquisition checks passed.');
}finally{await context.close();await browser.close();}
