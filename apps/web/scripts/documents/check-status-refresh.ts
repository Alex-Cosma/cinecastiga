import {chromium} from 'playwright-core';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const base='http://localhost:3113',out=resolve('../../docs/implementation/previews/batch5-documents-live');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9237'),context=await browser.newContext({viewport:{width:1440,height:1000}});
try{
 const page=await context.newPage();await page.bringToFront();let mode='idle',requests=0;
 const response=await context.request.get(`${base}/api/contracte/107063311/files`),real=await response.json();
 const target=real.files.find((f:any)=>f.filename==='decizie CNSN_semnat.pdf.p7s');
 if(!target?.processedAt||target.pageCount!==18)throw Error('Real document is not ready');
 await context.route('**/*',async route=>{
  if(!route.request().url().startsWith(base)){await route.abort();return;}
  if(route.request().url()===`${base}/api/contracte/107063311/files`){
   requests++;const data=structuredClone(real),file=data.files.find((f:any)=>f.id===target.id);
   if(mode==='idle'){file.originalHash=null;file.pdfHash=null;file.downloadedAt=null;file.processedAt=null;file.job=null;}
   if(mode==='running'){file.pdfHash=null;file.processedAt=null;file.job={id:'browser-status-fixture',status:'running',stage:'ocr',pagesDone:6,pagesTotal:18,error:null,position:0};}
   await route.fulfill({json:data});return;
  }await route.continue();
 });
 await page.goto(`${base}/contracte/107063311#fisiere`,{waitUntil:'domcontentloaded'});
 const card=page.locator('.df-file').filter({has:page.getByRole('heading',{name:target.filename,exact:true})});
 await card.getByText('Disponibil în SEAP · încă nedescărcat',{exact:true}).waitFor();
 mode='running';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await card.getByText('Descărcat · Se citesc paginile scanate',{exact:true}).waitFor();
 await card.getByText('6 din 18 pagini citite',{exact:true}).waitFor();
 await card.screenshot({path:resolve(out,'downloaded-processing-status.png')});
 mode='complete';await card.getByText('Descărcat · 18 pagini · text căutabil',{exact:true}).waitFor({timeout:10000});
 await card.getByRole('button',{name:'Deschide documentul',exact:true}).waitFor();
 await card.screenshot({path:resolve(out,'downloaded-complete-status.png')});
 await page.setViewportSize({width:390,height:844});await card.screenshot({path:resolve(out,'downloaded-complete-mobile.png')});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('Mobile overflow');
 await writeFile(resolve(out,'status-refresh-verification.json'),JSON.stringify({status:'passed',checks:['Real signed source downloaded and processed:18 pages','Idle tab discovers running job on focus','Saved original is explicitly marked downloaded during OCR','Active polling discovers completion','Open-document action available','No mobile overflow'],browserOnlySimulatedTransitions:true,liveSeapRequests:0,localStatusReads:requests},null,2));
 console.log('Status refresh checks passed; no SEAP requests.');
}finally{await context.close();await browser.close();}
