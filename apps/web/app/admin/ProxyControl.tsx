'use client';
import Link from 'next/link';
import CollectionPace from './CollectionPace';
import {useEffect,useState} from 'react';
import type {CollectionStatus} from '@/lib/admin/collection';

type Draft={enabled:boolean;min:string;max:string;cap:string;concurrency:string;ids:string[];revision:number};
const initial=(data:CollectionStatus):Draft=>({enabled:!!data.proxies.settings.enabled,min:String(data.proxies.settings.min_seconds),max:String(data.proxies.settings.max_seconds),cap:String(data.proxies.settings.requests_per_minute),concurrency:String(data.proxies.settings.max_in_flight??1),ids:data.proxies.endpoints.filter(p=>p.enabled).map(p=>String(p.id)),revision:Number(data.control.revision)});
const number=(v:unknown)=>new Intl.NumberFormat('ro-RO',{maximumFractionDigits:1}).format(Number(v??0));
export default function ProxyControl({data,now,stale,saving,change,onDirtyChange}:{data:CollectionStatus;now:number;stale:boolean;saving:boolean;change:(body:Record<string,unknown>)=>Promise<boolean|undefined>;onDirtyChange:(dirty:boolean)=>void}){
 const [draft,setDraft]=useState<Draft|null>(null),[page,setPage]=useState(1);
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('current'),[pickSearch,setPickSearch]=useState(''),[pickPage,setPickPage]=useState(1);
 useEffect(()=>{onDirtyChange(!!draft);},[!!draft,onDirtyChange]);
 const saved=initial(data),form=draft??saved,conflict=!!draft&&draft.revision!==Number(data.control.revision);
 const endpoints=data.proxies.endpoints,policy=data.proxies.settings;
 const current=endpoints.filter(p=>p.configured),retired=endpoints.length-current.length;
 const matches=(p:typeof endpoints[number],term:string)=>`${p.id} ${p.exit_ip}`.toLowerCase().includes(term.trim().toLowerCase());
 const inventory=endpoints.filter(p=>(filter==='retired'?!p.configured:p.configured&&(filter==='active'?p.enabled:filter==='issues'?!!p.last_error:true))&&matches(p,search));
 const picks=current.filter(p=>matches(p,pickSearch));
 const inventoryPage=Math.min(page,Math.max(1,Math.ceil(inventory.length/10))),selectionPage=Math.min(pickPage,Math.max(1,Math.ceil(picks.length/10)));
 const active=endpoints.filter(p=>p.enabled).length;
 const editable=!!data.control.paused&&!data.control.maintenance&&!Number(data.documents.running)&&!data.requests.some(r=>r.outcome==='running')&&!stale&&!saving;
 const edit=(patch:Partial<Draft>)=>setDraft({...form,...patch});
 const valid=Number.isInteger(Number(form.concurrency))&&Number(form.concurrency)>=1&&Number(form.concurrency)<=10&&Number.isInteger(Number(form.min))&&Number.isInteger(Number(form.max))&&Number(form.min)>=1&&Number(form.max)>=Number(form.min)&&Number(form.max)<=3600&&Number.isInteger(Number(form.cap))&&Number(form.cap)>=1&&Number(form.cap)<=200&&(!form.enabled||form.ids.length>0);
 const capacity=Math.min(Number(form.cap),form.ids.length*120/(Number(form.min)+Number(form.max)));
 useEffect(()=>{if(!draft)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[draft]);
 return <section className="proxy-control" aria-labelledby="proxy-title">
  <div className="section-heading"><div><h2 id="proxy-title">Conexiunea cu SEAP</h2><p className="section-description">{policy.enabled?`${active} din ${current.length} proxy-uri activate · IP-ul serverului nu este folosit de colector.`:data.proxies.directAllowed?'Conexiune directă · proxy-urile nu sunt activate.':'Proxy-uri neactivate · conexiunea directă este blocată.'}</p></div><span className={`badge ${stale?'warning':policy.enabled?'neutral':'warning'}`}>{stale?'Status neactualizat':policy.enabled?'Prin proxy':data.proxies.directAllowed?'Direct':'Fără conexiune'}</span></div>
  <CollectionPace data={data} stale={stale}/>
  {endpoints.length>0&&<>
   <div className="proxy-toolbar"><label>Caută proxy / IP<input type="search" placeholder="proxy-12 sau adresa IP" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label><label>Afișează<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="current">Lista curentă ({current.length})</option><option value="active">Activate ({active})</option><option value="issues">Cu erori</option>{retired>0&&<option value="retired">Retrase ({retired})</option>}</select></label></div>
   <div className="proxy-table-scroll"><table className="proxy-table"><caption>Ritm pe fiecare proxy · media ultimelor 10 minute</caption><thead><tr><th>Proxy / IP</th><th>Stare</th><th>Ritm / min</th><th>Cereri azi</th><th>Erori azi</th><th>Trafic azi</th></tr></thead><tbody>{inventory.slice((inventoryPage-1)*10,inventoryPage*10).map(p=>{const seconds=Math.max(0,Math.ceil((new Date(p.next_allowed_at??0).getTime()-now)/1000));return <tr key={p.id}><th scope="row">{p.id}<small>{p.exit_ip}</small></th><td>{stale?'Necunoscută':!p.configured?'Retras din listă':!p.enabled?(Number(p.consecutive_failures)>=3?'Oprit după erori':'Neutilizat'):!policy.enabled?'Pool oprit':data.requests.some(r=>r.outcome==='running'&&r.proxy_id===p.id)?<span className="proxy-reserved">Cerere în curs</span>:p.job_status==='running'?<span className="proxy-reserved">Rezervat unui document</span>:p.last_error?<span className="form-error">{seconds?`Pauză după eroare · ${seconds} sec`:'De verificat'}</span>:seconds?`Disponibil în ${seconds} sec`:'Disponibil'}{p.last_error&&<small>{p.last_error}</small>}</td><td className="proxy-rate"><span className="proxy-mobile-label" aria-hidden="true">Ritm / min</span>{stale?'—':number(p.observed_per_minute)}<small>{stale?'Status neactualizat':`${number(p.recent_attempts)} cereri / 10 min`}</small></td><td><span className="proxy-mobile-label" aria-hidden="true">Cereri azi</span>{number(p.attempts)}</td><td><span className="proxy-mobile-label" aria-hidden="true">Erori azi</span>{number(p.failed)}</td><td><span className="proxy-mobile-label" aria-hidden="true">Trafic azi</span>{number(Number(p.bytes)/1048576)} MB</td></tr>;})}</tbody></table></div>{inventory.length===0&&<p className="empty-state">Niciun proxy pentru această căutare.</p>}<ProxyPages page={inventoryPage} count={inventory.length} setPage={setPage} label="Paginile proxy-urilor"/><p className="footnote">Ritmul include cererile eșuate și pauzele, inclusiv pentru proxy-urile dezactivate recent. Totalurile zilnice se resetează la miezul nopții, ora României. Traficul reprezintă răspunsurile măsurate de aplicație, nu consumul facturat de furnizor.</p></>}
  <details className="proxy-settings" open><summary>Configurează conexiunea și ritmul</summary>
   {!editable&&<p className="policy-note">{stale?'Reconectarea la server este necesară pentru modificări.':'Pune colectarea pe pauză și așteaptă încheierea cererilor și a documentului activ pentru a modifica setările.'} {!stale&&<Link href="/admin" scroll={false}>Vezi colectarea</Link>}</p>}
   {!current.length&&<p className="policy-note">Niciun proxy înregistrat. Lista se instalează pe server; parolele nu se introduc în această pagină.</p>}
   <form onSubmit={async e=>{e.preventDefault();if(valid&&editable&&!conflict&&await change({action:'proxies',revision:form.revision,enabled:form.enabled,minSeconds:Number(form.min),maxSeconds:Number(form.max),requestsPerMinute:Number(form.cap),maxInFlight:Number(form.concurrency),activeIds:form.ids}))setDraft(null);}}>
    <fieldset disabled={!editable}><legend>Traseul cererilor</legend><div className="proxy-modes"><label><input type="radio" name="proxy-mode" disabled={!data.proxies.directAllowed} checked={!form.enabled} onChange={()=>edit({enabled:false})}/>Direct</label><label><input type="radio" name="proxy-mode" checked={form.enabled} disabled={!current.length} onChange={()=>edit({enabled:true})}/>Prin proxy-uri</label></div>
    <div className="proxy-fields"><label>Pauză minimă / IP <span>secunde</span><input type="number" min="1" max="3600" step="1" required value={form.min} onChange={e=>edit({min:e.target.value})}/></label><label>Pauză maximă / IP <span>secunde</span><input type="number" min={form.min||1} max="3600" step="1" required value={form.max} onChange={e=>edit({max:e.target.value})}/></label><label>Plafon total <span>1–200 cereri / minut</span><input type="number" min="1" max="200" step="1" required value={form.cap} onChange={e=>edit({cap:e.target.value})}/></label><label>Cereri simultane <span>maximum în total</span><select value={form.concurrency} disabled={!form.enabled} onChange={e=>edit({concurrency:e.target.value})}>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}{i===0?' · pe rând':' · pe IP-uri diferite'}</option>)}</select></label></div>
    {current.length>0&&<fieldset className="proxy-selection"><legend>Proxy-uri folosite · {form.ids.length} selectate din {current.length}</legend>
     <div className="proxy-toolbar"><label>Caută în selecție<input type="search" placeholder="Nume sau IP" value={pickSearch} onChange={e=>{setPickSearch(e.target.value);setPickPage(1);}}/></label><div className="proxy-bulk"><button className="button" type="button" onClick={()=>edit({ids:current.map(p=>p.id)})}>Selectează toate cele {current.length}</button><button className="text-button" type="button" onClick={()=>edit({ids:[]})}>Deselectează tot</button></div></div>
     {pickSearch&&<button className="text-button" type="button" disabled={!picks.length} onClick={()=>edit({ids:[...new Set([...form.ids,...picks.map(p=>p.id)])]})}>Selectează cele {picks.length} rezultate</button>}
     <div className="proxy-picks">{picks.slice((selectionPage-1)*10,selectionPage*10).map(p=><label key={p.id}><input type="checkbox" checked={form.ids.includes(p.id)} onChange={e=>edit({ids:e.target.checked?[...form.ids,p.id]:form.ids.filter(id=>id!==p.id)})}/>{p.id}<small>{p.exit_ip}</small></label>)}</div>
     {!picks.length&&<p className="policy-note">Niciun proxy pentru această căutare.</p>}
     <ProxyPages page={selectionPage} count={picks.length} setPage={setPickPage} label="Paginile selecției de proxy-uri"/>
    </fieldset>}
    </fieldset>
    {form.enabled&&valid&&<p className="proxy-estimate">Capacitate teoretică: până la <strong>{number(capacity)} cereri/min</strong>. Pauzele, documentele și timpul de răspuns pot reduce ritmul.</p>}
    {conflict&&<p role="alert" className="form-error">Configurația s-a schimbat între timp. Reîncarcă setările înainte de aplicare.</p>}
    <div className="proxy-form-actions"><button className="button primary" disabled={!draft||!valid||conflict||!editable}>{saving?'Se salvează…':'Aplică setările conexiunii'}</button>{draft&&<button className="text-button" type="button" onClick={()=>setDraft(null)}>Renunță la modificări</button>}</div>
    <p className="footnote">Salvarea păstrează colectarea pe pauză și nu scurtează așteptarea deja începută.</p>
   </form>
  </details>
  <p className="proxy-rule">O singură cerere în curs pe IP; maximum {policy.enabled?policy.max_in_flight??1:1} în total. Documentele păstrează același IP până la finalul descărcării; minimum un minut între fișiere. Un refuz SEAP oprește întreaga colectare.</p>
 </section>;
}

function ProxyPages({page,count,setPage,label}:{page:number;count:number;setPage:(page:number)=>void;label:string}){
 if(!count)return null;
 return <nav className="queue-pagination" aria-label={label}><span>{(page-1)*10+1}–{Math.min(page*10,count)} din {count}</span>{count>10&&<><button type="button" className="button" disabled={page===1} onClick={()=>setPage(page-1)}>Înapoi</button><button type="button" className="button" disabled={page*10>=count} onClick={()=>setPage(page+1)}>Următoarele</button></>}</nav>;
}
