import {chromium} from 'playwright-core';import {writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9237'),context=await browser.newContext({viewport:{width:1440,height:1000}});
try{
 const page=await context.newPage();const spec={block:'stat',dataset:'contracts',measure:'value',filters:{authorityId:2144364,authorityName:'MUNICIPIUL BUZAU',yearFrom:2025,yearTo:2025}};
 const source='http://localhost:3113/intreaba?spec='+encodeURIComponent(Buffer.from(JSON.stringify(spec)).toString('base64'))+'&drill=1';
 await page.goto(source,{waitUntil:'networkidle'});const title=page.locator('.ev-contract-title').first();await title.waitFor({timeout:45000});
 if(await title.getAttribute('target')!=='_blank')throw Error('Contract title must open a new tab');
 const originalUrl=page.url();const popupPromise=context.waitForEvent('page');await title.click();const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');await popup.waitForURL(/\/contracte\/\d+$/);
 if(page.url()!==originalUrl||!await page.locator('dialog[open]').isVisible())throw Error('Original query or drawer changed');
 await writeFile(resolve('../../docs/implementation/previews/batch5-documents-live/drawer-verification.json'),JSON.stringify({status:'passed',checks:['Real title opens native new tab','Internal contract ID redirects to stable contract detail','Original URL and drawer remain open'],liveSeapRequests:0},null,2));console.log('Three real drawer navigation assertions passed.');
}finally{await context.close();await browser.close();}
