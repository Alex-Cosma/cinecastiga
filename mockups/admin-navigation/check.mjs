import { chromium } from '../../apps/web/node_modules/playwright-core/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],checks=[],external=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://localhost:3112/'))external.push(r.url())});
const check=(v,s)=>{if(!v)throw Error(s);checks.push(s)};
await page.goto('http://localhost:3112/admin-navigation/');await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:'.impeccable/review/admin-navigation/desktop.png',fullPage:true});
await page.locator('#min').fill('55');await page.locator('nav [data-view="conturi"]').click();check(await page.locator('#draft-note').isVisible(),'Draft retained while switching');check(await page.locator('[data-panel="conturi"]').isVisible(),'Accounts shown inside same shell');
await page.screenshot({path:'.impeccable/review/admin-navigation/accounts.png',fullPage:true});
await page.goBack();check(await page.locator('#min').inputValue()==='55','Back restores collection draft');await page.locator('#save').click();
for(const view of ['procesare','fisiere','jurnal','conturi']){await page.locator(`nav [data-view="${view}"]`).click();check(await page.locator('[data-panel]:visible').count()===1,'Only one panel for '+view)}
await page.locator('#add-account').click();await page.locator('[name="name"]').fill('Test demo');await page.locator('[name="email"]').fill('test@example.org');await page.locator('#account-form button').click();check(await page.locator('#users tr').count()===3,'Simulated account creation');
await page.locator('nav [data-view="jurnal"]').click();check(await page.locator('#rows tr').count()===10,'10 journal rows maximum');await page.locator('#next').click();await page.locator('nav [data-view="conturi"]').click();await page.locator('nav [data-view="jurnal"]').click();check((await page.locator('#range').textContent()).startsWith('11–14'),'Journal page retained');
await page.locator('#scenario').selectOption('retry');check(await page.locator('#global-alert').isVisible(),'Global timeout visible on journal');
await page.locator('nav [data-view="procesare"]').click();await page.locator('#scenario').selectOption('processing');await page.locator('#toast').evaluate(e=>e.hidden=true);await page.screenshot({path:'.impeccable/review/admin-navigation/processing.png',fullPage:true});
await page.locator('#scenario').selectOption('live');await page.locator('nav [data-view="colectare"]').click();await page.locator('#toast').evaluate(e=>e.hidden=true);await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.impeccable/review/admin-navigation/mobile.png',fullPage:true});
for(const view of ['colectare','procesare','fisiere','jurnal','conturi']){await page.locator(`nav [data-view="${view}"]`).click();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile page overflow '+view)}
await page.screenshot({path:'.impeccable/review/admin-navigation/accounts-mobile.png',fullPage:true});
await page.locator('#theme').click();await page.screenshot({path:'.impeccable/review/admin-navigation/dark-mobile.png',fullPage:true});
check(!errors.length,'No JS errors');check(!external.length,'No external requests');await writeFile('.impeccable/review/admin-navigation/verification.json',JSON.stringify({checks,errors,external},null,2));console.log(checks);await browser.close();
