import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='docs/implementation/previews/batch5-contract-files';await mkdir(out,{recursive:true});
const base='http://127.0.0.1:3112/contract-files/';
const target=await(await fetch('http://127.0.0.1:9237/json/new?'+base,{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let serial=0;const pending=new Map(),checks=[],errors=[],external=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);else if(m.method==='Network.requestWillBeSent'&&/^https?:/.test(m.params.request.url)&&!/^http:\/\/(127\.0\.0\.1|localhost):/.test(m.params.request.url))external.push(m.params.request.url)};
const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(x,label)=>{if(!x)throw Error(label);checks.push(label)};
const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function width(w){await cmd('Emulation.setDeviceMetricsOverride',{width:w,height:1000,deviceScaleFactor:1,mobile:false});await pause(160);assert(await ev('document.documentElement.scrollWidth<=innerWidth'),'No horizontal overflow at'+w)}
async function shot(name,full=true){await ev('document.fonts.ready');if(full)await ev('scrollTo(0,0)');await pause(200);const metrics=await cmd('Page.getLayoutMetrics');const size=metrics.cssContentSize;const r=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:full,...(full?{clip:{x:0,y:0,width:size.width,height:size.height,scale:1}}:{})});await writeFile(`${out}/${name}.png`,Buffer.from(r.data,'base64'))}
try{
 await cmd('Runtime.enable');await cmd('Network.enable');await cmd('Page.enable');await pause(350);await click('#reset');await ev("document.documentElement.dataset.theme='light'");await width(1440);
 assert(await ev("document.querySelectorAll('[data-state=ready]').length===1&&document.querySelectorAll('[data-state=new]').length===1&&document.querySelectorAll('[data-state=error]').length===1"),'Three clear initial states');await shot('contract-desktop');
 await click('[data-enqueue=cs]');await pause(180);await click('[data-enqueue=clarification]');await pause(180);
 assert(await ev("document.querySelectorAll('[data-state=active]').length===1&&document.querySelectorAll('[data-state=queued]').length===1"),'One active file and one queued');
 assert(await ev("document.querySelector('[data-file=clarification]').textContent.includes('Poziția 1')"),'Queued position is explained');
 await ev("window.__samples=[];window.__sampler=setInterval(()=>window.__samples.push(document.querySelectorAll('[data-state=active]').length),100)");
 await pause(2200);await shot('processing-desktop');await width(390);await shot('processing-mobile');await width(320);await width(800);
 await cmd('Page.reload');await pause(550);
 assert(await ev("JSON.parse(localStorage.getItem('cinecastiga:contract-files-mock:v1')).jobs.length===2&&document.querySelectorAll('[data-state=active]').length===1"),'Reload preserves one active job and queued file');
 await width(1440);await ev("document.querySelector('#show-drawer').scrollIntoView()");await click('#show-drawer');await ev("document.querySelector('#drawer-search').value='buzau';document.querySelector('#drawer-search').dispatchEvent(new Event('input'))");
 assert(await ev("!document.querySelector('#drawer-result').hidden"),'Drawer search ignores Romanian diacritics');
 const before=(await(await fetch('http://127.0.0.1:9237/json/list')).json()).map(t=>t.id);
 await click('#drawer-result a');await pause(350);
 const tabs=await(await fetch('http://127.0.0.1:9237/json/list')).json();const opened=tabs.find(t=>!before.includes(t.id)&&t.url===base+'?din=lista');
 assert(!!opened,'Contract title actually opens a new tab');
 assert(await ev("document.querySelector('#evidence-drawer').open&&document.querySelector('#drawer-search').value==='buzau'"),'Original drawer and filter remain unchanged');
 if(opened)await fetch('http://127.0.0.1:9237/json/close/'+opened.id);
 await shot('drawer-desktop',false);await click('#close-drawer');
 await click('#save-contract');assert(await ev("!document.querySelector('#save-feedback').hidden"),'Saving has clear local demo feedback');await click('#undo-save');
 const end=await ev("Math.max(...JSON.parse(localStorage.getItem('cinecastiga:contract-files-mock:v1')).jobs.map(j=>j.end))");if(end>Date.now())await pause(end-Date.now()+600);
 assert(await ev("document.querySelectorAll('[data-state=ready]').length===3&&document.querySelectorAll('[data-state=active]').length===0"),'Queued retry completes after first file');
 assert(await ev("document.querySelectorAll('[data-enqueue]').length===0"),'Prepared files cannot be acquired again');
 await click('[data-open=cs]');await pause(1200);
 assert(await ev("!document.querySelector('#reader').hidden&&document.querySelector('#ocr-text').textContent.includes('CAIET DE SARCINI')"),'Reader shows real PDF and real OCR text');
 await shot('reader-desktop',false);
 await ev("document.querySelector('#reader-page').value='2';document.querySelector('#reader-page').dispatchEvent(new Event('change'))");
 assert(await ev("document.querySelector('#pdf-frame').src.includes('#page=2')&&document.querySelector('#ocr-text').textContent.includes('nu conține text')"),'Page navigation respects original empty page');
 assert(await ev("document.querySelector('#reader-original').getAttribute('href').endsWith('.p7s')"),'Signed original stays separate from extracted PDF');
 await click('#close-reader');await click('#theme');await shot('contract-dark');await click('#theme');await width(390);await shot('contract-mobile');
 await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert(await ev("getComputedStyle(document.querySelector('.button')).transitionDuration==='0s'"),'Reduced motion is respected');
 assert(!errors.length,'No browser runtime exceptions');assert(!external.length,'No external network requests during mock interactions');
 for(const [asset,hash] of [['HC-127-2025.pdf','9b305927ede6acf7a831ecde2a111df668bac20e046d61fefdf33f879b3cb4da'],['CS ILUMINAT.pdf','002f500d6bc4905bc5f9be1c155784c1aded187e0e72cb6d17cc5a07f80789c7'],['CS ILUMINAT_semnat.pdf.p7s','82549efe9ccbb7fd08edaf8504b5f1038435d4e094b3c5e06ea3a6150311ab43']])assert(createHash('sha256').update(await readFile('mockups/contract-files/fixtures/'+asset)).digest('hex')===hash,'Source bytes preserved:'+asset);
 await click('#reset');await width(1440);
 await writeFile(out+'/verification.json',JSON.stringify({status:'passed',checks,errors,externalRequests:external,screens:['contract-desktop','processing-desktop','processing-mobile','drawer-desktop','reader-desktop','contract-dark','contract-mobile'],liveSeapRequests:0},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length}));
}catch(error){await writeFile(out+'/verification.json',JSON.stringify({status:'failed',error:String(error),checks,errors,external},null,2));console.error(error);process.exitCode=1}finally{ws.close()}
