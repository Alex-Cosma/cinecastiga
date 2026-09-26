import {chromium} from 'playwright-core';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
const fixture=JSON.parse(await readFile('/tmp/seap-documents-browser.json','utf8')),out=resolve('../../docs/implementation/previews/batch5-documents-live');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9237'),context=await browser.newContext({viewport:{width:1440,height:1000}});
try{
 await context.addCookies([{...fixture.cookie,url:'http://localhost:3113',httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage();
 await page.goto(`http://localhost:3113/contracte/107063311?document=${fixture.documentId}&page=1`,{waitUntil:'networkidle'});
 await page.locator('.df-search input').fill('ROMÂNIA');await page.locator('.df-search').getByRole('button',{name:'Caută',exact:true}).click();await page.locator('.df-hit').first().waitFor();
 await page.locator('.df-search').screenshot({path:resolve(out,'search-desktop.png')});
 await page.locator('.df-page-text').evaluate(el=>{const selection=window.getSelection()!,range=document.createRange();range.selectNodeContents(el);selection.removeAllRanges();selection.addRange(range);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await page.locator('.df-quote select').selectOption('new');await page.locator('.df-quote input').fill('EXEMPLU LOCAL · Verificare documente');await page.locator('.df-quote textarea').fill('Notă demonstrativă pentru verificarea funcționalității.');await page.locator('.df-quote').screenshot({path:resolve(out,'quote-desktop.png')});
 await page.getByRole('button',{name:'Închide documentul'}).click();await page.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');window.scrollTo(0,0);});await page.waitForTimeout(150);await page.screenshot({path:resolve(out,'files-dark.png'),fullPage:true});console.log('Three review-requested captures replaced; no source calls or saves.');
}finally{await context.close();await browser.close();}
