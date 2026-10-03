import { chromium } from '../../apps/web/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.STORIES_TEST_ORIGIN||'http://localhost:3000';
const path='/ce-bate-la-ochi/poveste/aquapark-buzau-banii-si-vara-ratata';
const output=new URL('../../.impeccable/review/aquapark-buzau/',import.meta.url).pathname;
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[],errors=[];
try{
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:900}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/ce-bate-la-ochi');
  await page.locator('[data-county="buzau"]').click();
  await page.getByRole('heading',{level:1,name:'Buzău.'}).waitFor();
  await page.locator('.featured-title').click();
  await page.getByRole('heading',{level:1,name:/Aquapark-ul din Buzău:/}).waitFor();
  assert.equal(new URL(page.url()).pathname,path);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(800);
  assert(await page.locator('meta[name=robots][content*=noindex]').count());
  assert.equal(await page.locator('.timeline li').count(),8);
  assert.match(await page.locator('.finding h3').innerText(),/1 înregistrare\. 882[. ]174,93/);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:output+width+'-hero.png'});
  await page.screenshot({path:output+width+'-article.png',fullPage:true});
  await page.getByRole('button',{name:'Verifică înregistrarea',exact:true}).click();
  const dialog=page.locator('dialog[open]');
  assert.equal(await dialog.locator('.record').count(),2);
  assert.match(await dialog.locator('.drawer-total').innerText(),/882[. ]174,93/);
  assert.match(await dialog.locator('.record').nth(1).innerText(),/Sursă de context — nu este inclusă/);
  assert.equal(await dialog.locator('a[href="/achizitii/122972715"]').count(),2);
  assert.equal(await dialog.locator('a[href="/contracte/106187822"]').count(),2);
  assert.equal(await dialog.locator('a[href="/contracte/106187822"]').first().getAttribute('target'),'_blank');
  // Inspect official URLs only; never request SEAP during local checks.
  assert.equal(await dialog.locator('a[href="https://e-licitatie.ro/pub/notices/ca-notices/view-c/100539297"]').count(),1);
  await page.screenshot({path:output+width+'-sources.png'});
  await page.keyboard.press('Escape');
  await page.goto(origin+path+'/surse/audit-conformitate');
  await page.locator('.document-page').waitFor();
  assert.equal(await page.getByRole('link',{name:'Citește la sursă'}).getAttribute('href'),'https://opiniabuzau.ro/wp-content/uploads/2026/03/Audit-Primarie.pdf#page=9');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  results.push({width,mapToCountyToStory:true,exactAmount:true,contextExcluded:true,sourcePage:true,noOverflow:true});
  await context.close();
 }
 const page=await browser.newPage();
 for(const [url,expected] of [['/achizitii/122972715','DA41151373'],['/contracte/106187822','AQUA']]){
  await page.goto(origin+url,{timeout:60000});await page.waitForFunction(text=>document.body.innerText.includes(text),expected,{timeout:60000});
  results.push({detail:url,expectedVisible:true});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(output+'checks.json',JSON.stringify({results,errors,seapRequests:0},null,2));
 console.log(JSON.stringify({results,errors,seapRequests:0},null,2));
}finally{await browser.close()}
