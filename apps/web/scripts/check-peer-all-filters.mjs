/** Read-only local browser acceptance for the comparison's all-year/all-domain filters.
 * Uses the existing dedicated Chrome CDP tab. No accounts or server data are changed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
const origin='http://localhost:3110',entityId='2144364';
const dir='docs/implementation/previews/peer-all-filters';await mkdir(dir,{recursive:true});
const pages=await(await fetch('http://127.0.0.1:9237/json')).json();const page=pages.find(p=>p.type==='page');
if(!page)throw Error('A dedicated CDP page is required');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
let serial=0;const pending=new Map(),errors=[],checks=[];
ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(message.error):p.resolve(message.result)}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text)};
const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression){for(let n=0;n<160;n++){if(await ev(expression))return;await pause(200)}throw Error('Timed out: '+expression)}
function assert(condition,message){if(!condition)throw Error(message)}
const ready=()=>until("!!document.querySelector('.px-receipt')&&!document.querySelector('.px-loading')&&!document.querySelector('.px-updating')&&!document.querySelector('.px-filters fieldset').disabled");
async function go(url){assert(new URL(url).origin===origin,'Unexpected origin');await cmd('Page.navigate',{url});await ready()}
async function choose(index,value){await ev(`(()=>{const e=document.querySelectorAll('.px-filters select')[${index}];Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`)}
async function apply(year,cpv){await choose(0,year);await choose(1,cpv);await ev("document.querySelector('.px-primary').click()");await until(`new URLSearchParams(location.search).get('year')===${JSON.stringify(year)}&&new URLSearchParams(location.search).get('cpv')===${JSON.stringify(cpv)}&&!document.querySelector('.px-updating')`);await ready()}
const roster=()=>ev("[...document.querySelectorAll('.px-member-name')].map(e=>e.getAttribute('href'))");
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function current(){return ev(`(()=>{const q=new URLSearchParams(location.search);q.delete('rol');q.set('role','authority');q.set('entityId',${JSON.stringify(entityId)});return fetch('/api/peers?'+q).then(async r=>{if(!r.ok)throw Error('Peer API failed');return r.json()})})()`)}
async function shot(name,width){await cmd('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<700});await ev('window.scrollTo(0,0);document.fonts.ready');await pause(150);const overflow=await ev('document.documentElement.scrollWidth>innerWidth');assert(!overflow,'Horizontal overflow');const image=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`${dir}/${name}.png`,Buffer.from(image.data,'base64'));checks.push({screen:name,width,overflow:false})}
try{
  await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await go(`${origin}/entitati/${entityId}/comparatii?rol=autoritate&dataset=all&year=2025&cpv=45`);
  const original=await roster();assert(original.length===10,'Expected automatic ten');
  await apply('all','all');assert(same(original,await roster()),'All filters changed population roster');
  const all=await current();assert(all.filters.year==='all'&&all.filters.cpv==='all','All filters lost');
  assert(await ev("document.querySelector('.px-applied').textContent.includes('Toți anii')&&document.querySelector('.px-applied').textContent.includes('Toate domeniile')"),'Applied labels missing');
  checks.push({check:'all_years_and_domains_keep_population_roster',rows:all.focal.recordCount,totalExact:all.focal.totalExact});
  await ev("document.querySelector('.px-pair button').click()");await until(`document.querySelector('.ev-source-summary strong')?.textContent.replace(/[^0-9]/g,'')===${JSON.stringify(String(all.focal.recordCount))}`);
  assert(await ev("!document.querySelector('.evidence-drawer').innerText.includes('CPV all')&&document.querySelector('.evidence-drawer').innerText.includes('Toate domeniile')"),'Source period/domain labels wrong');await ev("document.querySelector('.ev-close').click()");
  const marker={version:'peer-evidence-2',checkpointId:all.checkpoint.id,entityId,identity:all.entity.identity,role:'authority',dataset:'all',year:'all',cpv:'all',method:all.filters.method,populationVersion:all.filters.populationVersion,selection:{kind:'member',entityId,identity:all.entity.identity}};
  const response=await fetch(origin+'/api/ask/rows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({peer:marker,spec:{block:'stat',measure:'value',filters:{yearFrom:2025,cpvTerm:'45'}}})});const source=await response.json();
  const decimal=v=>String(v).includes('.')?String(v).replace(/0+$/,'').replace(/\.$/,''):String(v);
  assert(response.ok&&source.total===all.focal.recordCount&&decimal(source.value)===decimal(all.focal.totalExact),'Exact all-filter source mismatch');checks.push({check:'all_filter_sources_reconcile',rows:source.total,totalExact:source.value});
  await ev("[...document.querySelectorAll('.px-editor-actions button')].find(b=>b.textContent==='Personalizează grupul').click()");await ev("document.querySelector('.px-selected-list button').click()");await until("new URLSearchParams(location.search).get('method')==='manual'&&document.querySelectorAll('.px-member').length===9");await ready();const manual=await roster();
  await apply('2025','45');assert(same(manual,await roster()),'Annual criteria lost manual roster');await apply('all','all');assert(same(manual,await roster()),'All criteria lost manual roster');
  const copied=await ev('location.href');await go(copied);await ready();assert(same(manual,await roster()),'Restored manual roster differs');assert(await ev("document.querySelectorAll('.px-filters select')[0].value==='all'&&document.querySelectorAll('.px-filters select')[1].value==='all'"),'Restored all controls wrong');checks.push({check:'manual_roster_and_all_filters_survive_apply_and_url_restore',members:9});
  await shot('all-filters-desktop',1440);await shot('all-filters-mobile',390);
  await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await go(`${origin}/entitati/${entityId}/comparatii?rol=autoritate&dataset=all&year=all&cpv=all`);
  assert(errors.length===0,'Browser runtime errors');await writeFile(`${dir}/verification.json`,JSON.stringify({status:'passed',checkedAt:new Date().toISOString(),readOnly:true,checks,errors},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,artifact:dir+'/verification.json'}));
}catch(error){await writeFile(`${dir}/verification.json`,JSON.stringify({status:'failed',error:String(error),checks,errors},null,2));console.error(String(error));process.exitCode=1}
finally{ws.close()}
