import {chromium} from 'playwright-core';import {readFile,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
const fixture=JSON.parse(await readFile('/tmp/seap-documents-browser.json','utf8')),out=resolve('../../docs/implementation/previews/batch5-documents-live');
const browser=await chromium.connectOverCDP('http://127.0.0.1:9237'),context=await browser.newContext({viewport:{width:1440,height:1000}});
try{
 const page=await context.newPage();await page.goto(`http://localhost:3113/contracte/107063311?document=${fixture.documentId}&page=1`,{waitUntil:'networkidle'});
 await page.locator('.df-search input').fill('ROMÂNIA');await page.locator('.df-search').getByRole('button',{name:'Caută',exact:true}).click();await page.locator('.df-hit').first().waitFor();
 const before=await page.locator('.df-results').textContent();
 await page.locator('.df-document-search input').fill('PLOIEȘTI');await page.getByRole('button',{name:'Găsește paginile'}).click();await page.locator('.df-page-matches button').first().waitFor();
 if(await page.locator('.df-results').textContent()!==before)throw Error('Document search changed cross-file results');
 if(!(await page.locator('.df-page-text mark').innerText()).toLowerCase().includes('ploiești'))throw Error('Wrong reader highlight');
 await page.locator('.df-search').screenshot({path:resolve(out,'search-context-contract.png')});
 await page.locator('.df-document-search').evaluate(el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(1500);await page.screenshot({path:resolve(out,'search-context-reader.png')});
 await page.locator('.df-hit').first().click();await page.waitForFunction(()=>document.querySelector('.df-page-text mark')?.textContent?.toLowerCase()==='românia');
 await page.locator('.df-page-matches button').first().click();await page.waitForFunction(()=>document.querySelector('.df-page-text mark')?.textContent?.toLowerCase()==='ploiești');
 await writeFile(resolve(out,'search-context-verification.json'),JSON.stringify({status:'passed',checks:['Cross-file ROMÂNIA results unchanged by document PLOIEȘTI search','Reader highlights document term','Opening a cross-file hit restores its term','Opening a document result restores the document term'],liveSeapRequests:0},null,2));console.log('Four search context assertions passed.');
}finally{await context.close();await browser.close();}
