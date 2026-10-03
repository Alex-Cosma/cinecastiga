import {chromium} from '../../apps/web/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out=new URL('../../.impeccable/review/ce-bate-la-ochi/',import.meta.url).pathname;
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base='http://127.0.0.1:3112/ce-bate-la-ochi/';
const errors=[];const checks=[];
try{
for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('.romania a').count(),42);
 const shot=async state=>{await page.waitForTimeout(650);await page.screenshot({path:out+name+'-'+state+'.png',fullPage:state!=='sources'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}/${state} overflow`);};
 await shot('atlas');
 await page.locator('[data-county="cluj"]').hover();await page.locator('.map-tip').waitFor({state:'visible'});assert.match(await page.locator('.map-tip').innerText(),/3 povești/);
 await page.locator('[data-county="cluj"]').click();await page.getByRole('heading',{name:'Cluj.',exact:true}).waitFor();await shot('county');
 await page.getByRole('button',{name:'Sănătate',exact:true}).click();assert.equal(await page.locator('.featured-title').innerText(),'Ce se află în spatele unei comenzi de consumabile?');
 await page.getByRole('button',{name:/Toate/}).click();await page.locator('.featured-title').click();await page.getByRole('heading',{level:1,name:/Trei contracte/}).waitFor();await shot('article');
 await page.getByRole('button',{name:/Verifică cele 3 înregistrări/}).click();await page.locator('dialog[open]').waitFor();assert.equal(await page.locator('dialog .record').count(),3);assert.match(await page.locator('.drawer-total').innerText(),/320.000,00 lei/);await shot('sources');
 const pop=page.waitForEvent('popup');await page.locator('dialog .record a').first().click();const doc=await pop;await doc.waitForLoadState();assert.match(await doc.locator('main').innerText(),/95.000,00 lei/);await doc.close();await page.getByRole('button',{name:'Continuă lectura',exact:true}).click();assert.equal(await page.locator('dialog[open]').count(),0);
 await page.locator('.chapter-nav a[href="#surse"]').click();assert.match(page.url(),/#\/poveste\/acelasi-drum$/);
 await page.goBack();await page.getByRole('heading',{name:'Cluj.',exact:true}).waitFor();await page.waitForTimeout(650);await page.locator('.back-link').click();await page.getByRole('heading',{name:'Ce bate la ochi.'}).waitFor();await page.waitForTimeout(650);
 const search=page.getByRole('searchbox');await search.fill('buzau');assert.equal(await page.locator('#county-results a').count(),1);await search.press('ArrowDown');await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Buzău.',exact:true}).waitFor();await page.waitForTimeout(650);
 await page.goto(base+'#/judet/alba');await page.getByRole('heading',{name:'Aici povestea încă nu a început.'}).waitFor();await shot('empty');
 await page.goto(base+'#/poveste/acelasi-drum');await page.locator('#theme').click();await shot('dark');
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'#/');await page.locator('[data-county="cluj"]').focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Cluj.',exact:true}).waitFor();
 checks.push(`${name}: atlas 42 counties, hover, county navigation, topic filter, article, exact total, sources drawer, new-tab fixture, chapter permalink, history, diacritic search, empty county, dark theme, keyboard and reduced motion; no overflow.`);
 await page.close();
}
assert.deepEqual(errors,[]);await fs.writeFile(out+'checks.json',JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
}finally{await browser.close();}
