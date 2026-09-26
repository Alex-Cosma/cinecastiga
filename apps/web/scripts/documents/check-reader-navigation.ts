import {chromium} from 'playwright-core';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const base=process.env.DOCUMENT_PREVIEW_URL??'http://localhost:3113',doc='799aff30-8998-4c72-8e94-659cbd918f67',out=resolve('../../docs/implementation/previews/batch5-documents-live');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9237'),context=await browser.newContext({viewport:{width:1440,height:1100}});
try{
 const page=await context.newPage();await page.bringToFront();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',route=>{const url=route.request().url();return !/^https?:/.test(url)||url.startsWith(base)?route.continue():route.abort();});
 await page.goto(`${base}/contracte/107063311?document=${doc}&page=1`,{waitUntil:'networkidle'});
 async function verify(n:number){
  await page.getByRole('heading',{name:`Textul paginii ${n}`,exact:true}).waitFor();
  await page.getByRole('heading',{name:`Original · pagina ${n}`,exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.df-page-text')?.getAttribute('aria-busy')==='false'&&document.querySelector('.df-pdf-viewport')?.getAttribute('aria-busy')==='false'&&(document.querySelector('.df-pdf canvas') as HTMLCanvasElement)?.width>0);
  if(await page.locator('.df-pdf [role=alert]').count())throw Error(await page.locator('.df-pdf [role=alert]').innerText());
  const expected=await (await context.request.get(`${base}/api/documents/${doc}?page=${n}`)).json();
  const displayed=await page.locator('.df-page-text').textContent();if(expected.page.text?displayed!==expected.page.text:!displayed?.includes('Nu s-a extras text din această pagină.'))throw Error(`Wrong OCR text for page ${n}`);
  if(new URL(page.url()).searchParams.get('page')!==String(n))throw Error('Deep link does not match page');
  return page.locator('.df-pdf canvas').evaluate((c:HTMLCanvasElement)=>c.toDataURL());
 }
 const first=await verify(1);await page.locator('.df-reader-toolbar select').selectOption('2');const second=await verify(2);
 if(first===second)throw Error('PDF canvas did not change');
 await page.locator('.df-reader-toolbar').getByRole('button',{name:'Înainte'}).click();await verify(3);
 await page.locator('.df-reader-toolbar').getByRole('button',{name:'Înapoi'}).click();await verify(2);
 await page.locator('.df-reader-toolbar select').selectOption('4');await page.locator('.df-reader-toolbar select').selectOption('5');await page.locator('.df-reader-toolbar select').selectOption('6');await verify(6);
 await page.locator('.df-pdf-heading select').selectOption('1.5');await verify(6);await page.locator('.df-pdf-heading select').selectOption('1');await verify(6);
 await page.reload({waitUntil:'networkidle'});await verify(6);
 await page.locator('.df-reader-body').screenshot({path:resolve(out,'synchronized-reader-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.locator('.df-reader-toolbar select').selectOption('7');await verify(7);
 await page.locator('.df-reader-body').screenshot({path:resolve(out,'synchronized-reader-mobile.png'),style:'.site-header,.d-skip-link,nextjs-portal{visibility:hidden!important}'});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('Mobile overflow');
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.locator('.df-reader-body').screenshot({path:resolve(out,'synchronized-reader-dark.png'),style:'.site-header,.d-skip-link,nextjs-portal{visibility:hidden!important}'});
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile(resolve(out,'reader-navigation-verification.json'),JSON.stringify({status:'passed',base,checks:['PDF canvas and exact OCR page content agree','Selector changes both panes','Next and Previous change both panes','Rapid navigation settles on requested page','Zoom preserves page selection','Reload restores page6','Mobile page7 stays synchronized without overflow','Light and dark renders','No runtime errors or SEAP requests'],liveSeapRequests:0},null,2));console.log('Synchronized PDF/OCR navigation checks passed.');
}finally{await context.close();await browser.close();}
