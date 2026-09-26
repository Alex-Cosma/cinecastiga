/** Run against the isolated preview after the final build. Node 22, Chrome CDP 9237.
 * node apps/web/scripts/check-population-peers-preview.mjs
 * Never logs the private fixture configuration, cookies or signing secret.
 */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
const fixture = JSON.parse(await readFile(process.env.POPULATION_PEER_PREVIEW_CONFIG ?? "/private/tmp/seap-population-peers-preview.json", "utf8"));
if (!fixture.fixture || fixture.kind !== "population-peers" || fixture.baseUrl !== "http://localhost:3111" || !/^seap_test_[a-z0-9_]+$/i.test(new URL(fixture.databaseUrl).pathname.slice(1))) throw new Error("Isolated peer preview configuration required");
const dir = resolve("docs/implementation/previews/population-peers"), canonical = resolve(".impeccable/review");
await mkdir(dir,{recursive:true}); await mkdir(canonical,{recursive:true});
const pages = await (await fetch(process.env.CDP_URL ?? "http://127.0.0.1:9237/json")).json();
const page = pages.find(p=>p.type === "page"); if (!page) throw new Error("Open a dedicated Chrome test tab with CDP enabled");
const ws = new WebSocket(page.webSocketDebuggerUrl), pending = new Map(), errors = [], checks = [];
await new Promise((yes,no)=>{ws.onopen=yes;ws.onerror=no});
let serial=0;
ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(message.error):p.resolve(message.result)}else if(message.method==="Runtime.exceptionThrown")errors.push(message.params.exceptionDetails.text)};
const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await cmd("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression){for(let i=0;i<240;i++){if(await ev(expression))return;await pause(150)}throw new Error(`Timed out: ${expression}`)}
async function record(check){checks.push(check);await writeFile(`${dir}/browser-checks.json`,JSON.stringify({fixture:true,checkedAt:new Date().toISOString(),status:"in_progress",checks,errors},null,2));}
const exact=value=>String(value).includes(".")?String(value).replace(/0+$/, "").replace(/\.$/, ""):String(value);
function csvRows(text){const rows=[];let row=[],field="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(field);field=""}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v!==""))rows.push(row);row=[];field=""}else field+=c}if(field||row.length){row.push(field);rows.push(row)}return rows}
function exactSum(values){const scale=Math.max(0,...values.map(v=>(v.split('.')[1]??'').length));const total=values.reduce((sum,v)=>{const negative=v.startsWith('-'),parts=v.replace(/^[-+]/,'').split('.');return sum+BigInt(parts[0]+(parts[1]??'').padEnd(scale,'0'))*(negative?-1n:1n)},0n);const digits=(total<0n?-total:total).toString().padStart(scale+1,'0');return exact((total<0n?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits))}
function assert(condition,message){if(!condition)throw new Error(message)}
async function size(width,height=900){await cmd("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<700})}
async function go(path){const url=path.startsWith("http")?path:fixture.baseUrl+path;assert(new URL(url).origin===fixture.baseUrl,"Unexpected preview origin");await cmd("Page.navigate",{url});await until(`location.origin+location.pathname===${JSON.stringify(new URL(url).origin+new URL(url).pathname)} && document.readyState==='complete' && !!document.querySelector('h1')`);await pause(100)}
const ready=()=>until("!!document.querySelector('.px-receipt') && !document.querySelector('.px-loading') && !document.querySelector('.px-updating')");
async function click(selector){assert(await ev(`!!document.querySelector(${JSON.stringify(selector)})`),`Missing ${selector}`);await ev(`document.querySelector(${JSON.stringify(selector)}).click()`)}
async function choose(index,value){await ev(`(()=>{const element=document.querySelectorAll('.px-filters select')[${index}];Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('change',{bubbles:true}));})()`)}
async function screenshot(name,viewport=false,scrollTarget){await ev(scrollTarget ? `document.querySelector(${JSON.stringify(scrollTarget)}).scrollIntoView({block:"start"})` : "window.scrollTo(0,0)");await ev("document.fonts.ready.then(()=>true)");await pause(150);const dimensions=await ev("({width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})");const m=await cmd("Page.getLayoutMetrics");const shot=await cmd("Page.captureScreenshot",{format:"png",captureBeyondViewport:!viewport,...(viewport?{}:{clip:{x:0,y:0,width:m.cssContentSize.width,height:m.cssContentSize.height,scale:1}})});const bytes=Buffer.from(shot.data,"base64");await writeFile(`${dir}/${name}.png`,bytes);await record({screen:name,...dimensions,viewportOnly:viewport,screenshotWidth:bytes.readUInt32BE(16),screenshotHeight:bytes.readUInt32BE(20),overflow:dimensions.scroll>dimensions.width});assert(dimensions.scroll<=dimensions.width,`${name} has page overflow`)}
async function api(path,body){return ev(`fetch(${JSON.stringify(path)},${body===undefined?'{}':JSON.stringify({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})}).then(async response=>({status:response.status,body:await response.json()}))`)}
const authorityPath=`/entitati/${fixture.authority}/comparatii?rol=autoritate&dataset=all&year=2025&cpv=45`;
const params=()=>ev("Object.fromEntries(new URLSearchParams(location.search))");
async function current(){const p=await params();delete p.rol;const response=await api('/api/peers?'+new URLSearchParams({...p,entityId:fixture.authority,role:'authority'}));assert(response.status===200,'Current applied cohort API failed');return response.body}
async function waitGroup(count,method,year){await until(`document.querySelectorAll('.px-member').length===${count} && new URLSearchParams(location.search).get('method')===${JSON.stringify(method)} && new URLSearchParams(location.search).get('year')===${JSON.stringify(String(year))} && !document.querySelector('.px-updating') && !document.querySelector('.px-loading') && !document.querySelector('.px-filters fieldset').disabled`)}
async function search(text){await ev(`(()=>{const input=document.querySelector('#peer-candidate-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await until("!!document.querySelector('.px-candidate') && document.querySelector('.px-candidates').getAttribute('aria-busy')==='false'")}
async function clickButtonText(text,selector='button'){await ev(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})].find(button=>button.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Missing named button');button.click()})()`)}
const receipt=data=>({version:'peer-evidence-2',method:data.filters.method,populationVersion:data.filters.populationVersion,...(data.filters.members?{members:data.filters.members}:{}),checkpointId:data.checkpoint.id,entityId:data.entity.id,identity:data.entity.identity,role:'authority',dataset:data.filters.dataset,year:data.filters.year,cpv:data.filters.cpv,selection:{kind:'comparison'}});
try{
  await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Network.enable');
  await cmd('Network.setCookie',{name:fixture.cookie.name,value:fixture.cookie.value,url:fixture.baseUrl,httpOnly:true,sameSite:'Lax'});
  await size(1440,960);await go(authorityPath);await ready();await ev("localStorage.setItem('theme','light');document.documentElement.setAttribute('data-theme','light')");
  const session=await api('/api/auth/get-session');assert(session.body.user?.id===fixture.userId,'Ordinary fixture session failed');
  const previous=await api(`/api/anchete/${fixture.investigationId}`);assert(previous.status===200&&Array.isArray(previous.body.clips),'Fixture private case unavailable');
  for(const clip of previous.body.clips){const status=await ev(`fetch(${JSON.stringify(`/api/anchete/${fixture.investigationId}/clips/`+clip.id)},{method:'DELETE'}).then(r=>r.status)`);assert(status===200,'Could not reset isolated fixture case')}
  const automatic=await current();assert(automatic.cohort.count===10&&automatic.cohort.observedMemberCount===9,'Automatic 10-member roster mismatch');
  assert(automatic.focal.population.value===fixture.expected.population&&automatic.focal.totalExact===fixture.expected.focalTotal,'Focal population/value mismatch');
  assert(JSON.stringify(automatic.members.map(member=>member.entity.id))===JSON.stringify(fixture.expected.peerIds),'Nearest-population membership/order mismatch');
  assert(await ev("document.querySelectorAll('.px-member .px-difference').length")===10,'Population differences not displayed for every member');
  assert(automatic.members.every(member=>member.population.sourceUrl.startsWith('https://')&&member.population.catalogVersion===fixture.populationVersion),'Population provenance absent');
  await record({check:'automatic_population_roster',members:10,observed:9,population:automatic.focal.population.value,passed:true});
  await screenshot('population-desktop');await copyFile(`${dir}/population-desktop.png`,`${canonical}/population-desktop.png`);
  await ev(`document.querySelector('a[href="/entitati/${fixture.zeroAuthority}?rol=autoritate"]').closest('.px-member').querySelector('button').click()`);
  await until("!!document.querySelector('.ev-empty')");assert(await ev("document.querySelector('.ev-source-summary strong').textContent")==='0','No-record member invented rows');await click('.ev-close');
  await click('.px-pair button');await until("document.querySelector('.ev-source-summary strong')?.textContent==='7'");
  const links=await ev("[...document.querySelectorAll('.evidence-drawer a[href]')].map(a=>a.href).filter(h=>h.includes('e-licitatie')||h.includes('ted.europa'))");assert(links.some(h=>h.includes('ted.europa'))&&links.some(h=>h.includes('e-licitatie')),'Original focal sources missing');await click('.ev-close');
  await record({check:'individual_sources_and_empty_member',focalRows:7,emptyMember:fixture.zeroAuthority,originalLinks:true,passed:true});
  await choose(0,'2024');await clickButtonText('Personalizează grupul');await search('laborator');
  assert(await ev("document.querySelector('.px-candidate').textContent.includes('Populație neidentificată')"),'Missing population hidden in candidate');assert(await ev("document.querySelector('.px-applied').textContent.includes('2025')"),'Applied year hidden while filters are drafted');await screenshot('population-editor-desktop');
  await click('.px-candidate button');await waitGroup(11,'manual',2025);
  assert(await ev("document.querySelector('.px-filters select').value")==='2024','Editing group discarded dirty year');
  assert(await ev("document.body.innerText.includes('Ai criterii neaplicate')"),'Dirty scope explanation missing');
  await search('floresti');await click('.px-candidate button');await waitGroup(12,'manual',2025);
  const remove=automatic.members.find(member=>member.entity.id!==fixture.zeroAuthority).entity.id;
  const beforeRemove=await current(),removedName=beforeRemove.members.find(member=>member.entity.id===remove).entity.name;
  await ev(`(()=>{const buttons=[...document.querySelectorAll('.px-selected-list button')];const target=buttons.find(button=>button.textContent.toLocaleUpperCase('ro-RO').includes(${JSON.stringify(removedName.toLocaleUpperCase('ro-RO'))}));if(!target)throw Error('Removal target missing');target.click()})()`);
  await waitGroup(11,'manual',2025);await click('.px-primary');await waitGroup(11,'manual',2024);
  let manual=await current();assert(manual.filters.members.some(member=>member.id===fixture.unknownPopulation)&&manual.filters.members.some(member=>member.id===fixture.manualLocality)&&!manual.filters.members.some(member=>member.id===remove),'Manual add/remove roster changed during apply');
  await record({check:'manual_add_remove_and_dirty_year',members:11,appliedYear:2024,missingPopulation:fixture.unknownPopulation,commune:fixture.manualLocality,removed:remove,passed:true});
  await choose(0,'2025');await click('.px-primary');await waitGroup(11,'manual',2025);manual=await current();
  await clickButtonText('Copiază linkul');const copied=await ev('location.href');assert(copied.includes('checkpointId=')&&copied.includes('members=')&&copied.includes('populationVersion='),'Copied URL lost manual binding');
  await go(copied);await waitGroup(11,'manual',2025);const restored=await current();assert(JSON.stringify(restored.filters.members)===JSON.stringify(manual.filters.members),'Copied URL did not restore exact manual roster');
  await screenshot('population-manual-desktop');await record({check:'copied_manual_url_restore',members:11,checkpoint:true,catalog:true,passed:true});
  await clickButtonText('Revino la sugestii');await waitGroup(10,'population',2025);assert(JSON.stringify((await current()).members.map(member=>member.entity.id))===JSON.stringify(fixture.expected.peerIds),'Reset suggestions changed original automatic membership');
  await record({check:'reset_suggestions',members:10,passed:true});await go(copied);await waitGroup(11,'manual',2025);
  const marker=receipt(manual),sources=await api('/api/ask/rows',{peer:marker,spec:{block:'stat',measure:'value',filters:{}}});
  const expectedRows=manual.focal.recordCount+manual.members.reduce((sum,member)=>sum+member.recordCount,0),expectedTotal=exactSum([manual.focal.totalExact,...manual.members.map(member=>member.totalExact)]);
  assert(sources.status===200&&sources.body.total===expectedRows&&exact(sources.body.value)===expectedTotal,'Full manual sources do not reconcile');
  await clickButtonText('Verifică toate sursele');await until(`document.querySelector('.ev-source-summary strong')?.textContent===${JSON.stringify(String(expectedRows))}`);await screenshot('population-sources-desktop',true);await click('.ev-close');
  const csv=await ev(`fetch('/api/ask/rows/csv',{method:'POST',headers:{'Content-Type':'application/json'},body:${JSON.stringify(JSON.stringify({peer:marker,spec:{block:'stat',measure:'value',filters:{}}}))}}).then(async response=>({status:response.status,total:response.headers.get('x-total-rows'),exported:response.headers.get('x-exported-rows'),text:await response.text()}))`);
  const lines=csvRows(csv.text),header=lines.shift(),valueIndex=header.indexOf('valoare_ron'),seapIndex=header.indexOf('link_seap'),tedIndex=header.indexOf('link_ted');
  assert(csv.status===200&&Number(csv.total)===expectedRows&&Number(csv.exported)===expectedRows&&lines.length===expectedRows&&exactSum(lines.map(row=>row[valueIndex]))===expectedTotal,'Complete CSV exact sum/count mismatch');
  assert(lines.every(row=>row[seapIndex]?.startsWith('https://e-licitatie.ro/'))&&lines.some(row=>row[tedIndex]?.includes('ted.europa.eu')),'CSV source links missing');
  await record({check:'full_manual_sources_and_csv',rows:expectedRows,totalExact:expectedTotal,originalLinks:true,passed:true});
  await click('.px-actions .clipbtn-t');await until("!!document.querySelector('.clipbtn-save')");await click('.clipbtn-save');await until("document.querySelector('.clipbtn-done strong')?.textContent==='Versiune păstrată în anchetă.'");
  const dossier=await api(`/api/anchete/${fixture.investigationId}`),capture=dossier.body.clips.find(clip=>clip.capture?.status==='complete')?.capture;
  assert(capture?.rowCount===expectedRows&&exact(capture.totalExact)===expectedTotal,'Frozen manual comparison incomplete');
  const captured=await api(`/api/anchete/${fixture.investigationId}/captures/${capture.id}`),saved=captured.body.capture??captured.body;
  assert(saved.scope.peer.version==='peer-evidence-2'&&saved.scope.peer.method==='manual'&&JSON.stringify(saved.scope.peer.members)===JSON.stringify(marker.members),'Frozen v2 receipt differs from manual selection');
  const context=saved.summary.peerContext;assert(context.members.length===11&&context.members.some(member=>member.entity.id===fixture.zeroAuthority&&member.recordCount===0)&&context.members.some(member=>member.entity.id===fixture.unknownPopulation&&!member.population),'Frozen roster lost unknown/empty members');
  assert(context.focal.population.sourceSha256&&context.filters.populationVersion===fixture.populationVersion,'Frozen population source version/hash missing');
  await record({check:'private_v2_capture_full_roster',members:11,rows:expectedRows,totalExact:expectedTotal,zeroAndUnknownPreserved:true,passed:true});
  await go(`/anchete/${fixture.investigationId}?sectiune=evidence`);await until("document.body.innerText.includes('Comparație documentată')");await screenshot('population-case-desktop');
  const frozen=await ev("[...document.querySelectorAll('a')].find(a=>a.textContent.toLowerCase().includes('sursele păstrate'))?.href");assert(frozen,'Frozen source link missing');await go(frozen);await until("document.body.innerText.includes('FICTIV')");
  assert(await ev("!!document.querySelector('a[href*=\"e-licitatie\"]') && document.body.innerText.includes('Lipsa datelor')"),'Frozen source/context display missing');
  await size(390,844);await go(copied);await waitGroup(11,'manual',2025);await screenshot('population-mobile');await copyFile(`${dir}/population-mobile.png`,`${canonical}/population-mobile.png`);
  await clickButtonText('Personalizează grupul');await search('laborator');await screenshot('population-editor-mobile',true,'.px-editor');await clickButtonText('Închide editarea');
  await ev("document.documentElement.setAttribute('data-theme','dark');localStorage.setItem('theme','dark')");await screenshot('population-mobile-dark');
  await ev("document.documentElement.setAttribute('data-theme','light');localStorage.setItem('theme','light')");await click('.px-pair button');await until("document.querySelector('.ev-source-summary strong')?.textContent==='7'");await screenshot('population-sources-mobile',true);await click('.ev-close');
  await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await record({check:'reduced_motion',enabled:await ev("matchMedia('(prefers-reduced-motion: reduce)').matches")});
  assert(errors.length===0,'Browser runtime errors');await writeFile(`${dir}/browser-checks.json`,JSON.stringify({fixture:true,procurement:'fictional',population:'official INS RPL2021',checkedAt:new Date().toISOString(),status:'passed',checks,errors},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,artifact:`${dir}/browser-checks.json`}));
}catch(error){await writeFile(`${dir}/browser-checks.json`,JSON.stringify({fixture:true,checkedAt:new Date().toISOString(),status:'failed',error:String(error),checks,errors},null,2));console.error(String(error));process.exitCode=1}
finally{ws.close()}
