'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {DocumentCollectionStatus} from '@/lib/admin/document-collection';
import {stageLabel} from '@/lib/documents/shared';
import {Ghost,G} from '@/components/ghost/Ghost';
import {DocumentStorage} from './DocumentQueue';
import './fisiere.css';
const fmt=(n:unknown)=>Number(n??0).toLocaleString('ro-RO');
type Action='start'|'resume'|'pause'|'retry'|'downloads-on'|'downloads-off';
const DONE:Record<Action,string>={start:'Colectarea fișierelor e pornită.',resume:'Colectarea fișierelor e reluată.',pause:'Pauză salvată. Progresul rămâne păstrat.',retry:'Operațiunile eșuate sunt din nou în coadă.','downloads-on':'Descărcarea automată a caietelor e pornită.','downloads-off':'Descărcarea automată a caietelor e oprită.'};
// Labels and units are fixed text: the ghost shows them while the figures load.
const FIGURES=[{label:'Inventariere',unit:'anunțuri verificate'},{label:'Clasificare',unit:'fișiere analizate'},{label:'Descărcare caiete',unit:'caiete salvate'},{label:'Text și OCR caiete',unit:'caiete procesate'}] as const;
const AUTO_LABEL='Descarcă automat caietele de sarcini',AUTO_HINT='Doar caietele identificate; toate procedurile ar cere ≈1 TB.';
const MORE='Ce se colectează și cum se păstrează progresul';

export default function DocumentCollection(){
 const [data,setData]=useState<DocumentCollectionStatus|null>(null),[stale,setStale]=useState(false),[saving,setSaving]=useState<'main'|'auto'|'retry'|'stream'|null>(null);
 const [message,setMessage]=useState<{text:string;error:boolean}|null>(null),[autoDraft,setAutoDraft]=useState<boolean|null>(null);
 const [confirmAuto,setConfirmAuto]=useState(false);
 const pending=useRef(false),request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  if(pending.current)return;pending.current=true;const ac=new AbortController();request.current=ac;const timer=setTimeout(()=>ac.abort(),20000);
  try{const r=await fetch('/api/admin/documents',{cache:'no-store',signal:ac.signal});if(!r.ok)throw Error();const d=await r.json();if(request.current===ac){setData(d);setStale(false);}}
  catch{if(request.current===ac)setStale(true);}
  finally{clearTimeout(timer);if(request.current===ac)pending.current=false;}
 },[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},15000);return()=>{clearInterval(timer);request.current?.abort();request.current=null;pending.current=false;};},[refresh]);
 useEffect(()=>{if(!message||message.error)return;const t=setTimeout(()=>setMessage(null),6000);return()=>clearTimeout(t);},[message]);
 async function post(url:string,body:Record<string,unknown>,done:string,which:NonNullable<typeof saving>){
  setSaving(which);setMessage(null);
  // Only the server's own (Romanian) refusals are shown; a network failure or timeout gets one plain sentence.
  try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const result=await r.json().catch(()=>({}));setMessage(r.ok?{text:done,error:false}:{text:typeof result.error==='string'?result.error:'Comanda nu a fost salvată. Reîncearcă.',error:true});}
  catch{setMessage({text:'Comanda nu a ajuns la server. Reîncearcă.',error:true});}
  // A poll already in flight may predate the command: replace it, so the switch never flips back to the old value.
  finally{request.current?.abort();pending.current=false;await refresh();setAutoDraft(null);setSaving(null);}
 }
 const change=(action:Action)=>{if(!data)return;if(action==='downloads-on'||action==='downloads-off')setAutoDraft(action==='downloads-on');void post('/api/admin/documents',{action,revision:data.control.revision},DONE[action],action.startsWith('downloads')?'auto':action==='retry'?'retry':'main');};
 // The SEAP documents stream (paused by the stream circuit) lives on the collection control, not here.
 const resumeStream=()=>{if(data)void post('/api/admin/collection',{action:'stream',stream:'documents',paused:false,revision:data.source.revision},'Fluxul SEAP de fișiere e reluat.','stream');};

 const c=data?.control,busy=!!saving||stale;
 const waiting=data&&(data.source.maintenance?'Așteaptă procesarea nocturnă':data.source.blocked_reason?'Așteaptă verificarea erorii SEAP':data.source.paused||data.source.paused_streams.includes('documents')?'Colectarea SEAP e pe pauză':data.quiet?'Pauza SEAP 02:59–03:30':!data.source.proxy_enabled?'Așteaptă activarea proxy-urilor':null);
 const state=stale?'Status neactualizat':!c?'':!c.enabled?'Nepornită':c.paused?'Pe pauză':waiting??(!c.alive?'Așteaptă serviciul de documente':Number(data?.jobs.running)>0?'În lucru':Number(data?.jobs.failed)>0?'Erori de verificat':'Verifică și completează inventarul');
 const heading=(badge:React.ReactNode)=><div className="section-heading"><div><h2 id="document-collection-title">Colectarea fișierelor</h2><p className="section-description">Inventar, descărcare și text pentru procedurile atribuite.</p></div>{badge}</div>;

 if(!data||!c)return <section className="document-collection files-page" aria-labelledby="document-collection-title">
  {heading(stale?<span className="badge warning">Status indisponibil</span>:<Ghost as="span" className="badge neutral" name="document-state" wait="client"><G.Line inline w="7.5em"/></Ghost>)}
  {stale
   ?<p className="queue-notice files-error" role="alert">Progresul fișierelor nu poate fi citit acum. Reîncercăm automat. <button type="button" className="text-button" onClick={()=>void refresh()}>Reîncearcă</button></p>
   :<Ghost className="document-collection-body" name="document-collection" label="Se citește progresul fișierelor…" wait="client">
    <dl className="document-collection-progress">{FIGURES.map(f=><div key={f.label}><dt>{f.label}</dt><dd><strong><G.Line w="58%"/></strong><progress className="g-quiet" value={0} max={1} aria-hidden="true"/><span>{f.unit}</span></dd></div>)}</dl>
    <p className="document-collection-meta"><G.Line w="21em"/></p>
   </Ghost>}
  <div className="document-collection-panels">
   {!stale&&<Ghost className="document-collection-controls" name="document-controls" wait="client">
    <div className="document-collection-actions"><G.Block/></div>
    <div className="setting-row document-auto"><div><span className="document-auto-label">{AUTO_LABEL}</span><small>{AUTO_HINT}</small></div><G.Block className="document-auto-switch" h="19px" w="32px" r="20px"/></div>
   </Ghost>}
   <DocumentStorage/>
  </div>
  {!stale&&<div className="document-collection-more" aria-hidden="true"><p className="summary-ghost"><G.Line w="21em"/></p></div>}
 </section>;

 const failed=Number(data.jobs.failed),held=Number(data.jobs.held),retries=Number(data.jobs.retries),k=data.classification;
 const streamPaused=data.source.paused_streams.includes('documents'),auto=autoDraft??c.automatic_downloads;
 const bars=[
  {done:Number(data.inventory.checked),total:Number(data.coverage.eligible)},
  {done:Number(k.classified),total:Number(k.total)},
  {done:Number(k.specifications_downloaded),total:Number(k.specifications)},
  {done:Number(k.specifications_ready),total:Number(k.specifications)},
 ];
 return <section className="document-collection files-page" aria-labelledby="document-collection-title">
  {heading(<span className={`badge ${stale||data.source.blocked_reason||data.source.maintenance||failed>0?'warning':'neutral'}`}>{state}</span>)}
  {stale&&<p className="queue-notice" role="status">Progres neactualizat: afișăm ultima stare, comenzile așteaptă reconectarea.</p>}
  <div className={`document-collection-body${stale?' g-stale':''}`}>
   <dl className="document-collection-progress">{FIGURES.map((f,i)=>{const b=bars[i]!;return <div key={f.label}><dt>{f.label}</dt><dd><strong>{fmt(b.done)}<span> / {fmt(b.total)}</span></strong><progress value={Math.min(b.done,b.total)} max={Math.max(1,b.total)} aria-label={`${f.label}: ${fmt(b.done)} din ${fmt(b.total)}`}/><span>{f.unit}</span></dd></div>;})}</dl>
   <p className="document-collection-meta">{fmt(data.jobs.running)} în lucru · {fmt(data.jobs.queued)} în coadă · <span className={failed>0?'failed':undefined}>{fmt(failed)} eșuate</span> · {fmt(data.traffic.attempts)} cereri azi</p>
  </div>
  <div className="document-collection-panels">
   <div className="document-collection-controls">
    {streamPaused&&<div className="document-stream-paused"><p role="status">Fluxul SEAP de fișiere e oprit{data.source.stream_reason?`: ${data.source.stream_reason}`:'.'}</p><button type="button" className="button" disabled={busy} aria-busy={saving==='stream'||undefined} onClick={resumeStream}>{saving==='stream'?'Se salvează…':'Reia fluxul'}</button></div>}
    <div className={`document-collection-actions${stale?' g-stale':''}`}>
     <button type="button" className="button primary" disabled={busy} aria-busy={saving==='main'||undefined} onClick={()=>change(!c.enabled?'start':c.paused?'resume':'pause')}>{saving==='main'?'Se salvează…':!c.enabled?'Pornește colectarea fișierelor':c.paused?'Reia colectarea fișierelor':'Pune colectarea pe pauză'}</button>
     {failed>0&&<button type="button" className="button" disabled={busy} aria-busy={saving==='retry'||undefined} onClick={()=>change('retry')}>{saving==='retry'?'Se salvează…':`Reîncearcă ${fmt(failed)} eșuate`}</button>}
    </div>
    <div className={`setting-row document-auto${stale?' g-stale':''}`}>
     <div><label className="document-auto-label" htmlFor="document-auto-downloads">{AUTO_LABEL}</label><small id="document-auto-hint">{saving==='auto'?'Se salvează…':AUTO_HINT}</small></div>
     <input className="switch document-auto-switch" role="switch" id="document-auto-downloads" type="checkbox" checked={auto} disabled={busy} aria-busy={saving==='auto'||undefined} aria-describedby="document-auto-hint" onChange={e=>{if(e.target.checked)setConfirmAuto(true);else change('downloads-off');}} aria-controls={confirmAuto?'document-auto-confirm':undefined}/>
    </div>
    {confirmAuto&&!auto&&<div className="auto-confirm" id="document-auto-confirm" role="group" aria-label="Confirmă descărcarea automată"><p>Pornești descărcarea automată? Caietele identificate se descarcă în fundal, cele recente întâi; pentru toate procedurile ar fi ≈1 TB.</p><div><button type="button" className="button" autoFocus onClick={()=>setConfirmAuto(false)}>Lasă oprită</button><button type="button" className="button primary" disabled={busy} onClick={()=>{setConfirmAuto(false);change('downloads-on');}}>Pornește descărcarea</button></div></div>}
    {c.error&&<p className="queue-notice" role="status">{c.error}</p>}
    {message&&<p className={`admin-flash${message.error?' error':''}`} role={message.error?'alert':'status'}>{message.text}{message.error&&<> <button type="button" className="text-button" onClick={()=>setMessage(null)}>Închide</button></>}</p>}
   </div>
   <DocumentStorage/>
  </div>
  {!!data.active.length&&<ul className={`document-collection-active${stale?' g-stale':''}`} aria-label="Operațiuni active">{data.active.map(j=><li key={j.id}><div><strong>{j.filename??j.notice_no}</strong><span>{stageLabel[j.stage]??'În curs'} · {j.notice_no}</span></div>{j.pages_total>0?<label>{fmt(j.pages_done)} / {fmt(j.pages_total)} pagini<progress max={j.pages_total} value={j.pages_done}/></label>:<span>{j.downloaded?'Original salvat':'Preluare din SEAP'}</span>}</li>)}</ul>}
  <div className="document-collection-more">
   {!!data.errors.length&&<details><summary>Ultimele erori ({fmt(data.errors.length)} din {fmt(failed)})</summary><ul>{data.errors.map(e=><li key={e.id}><strong>{e.filename??e.notice_no}</strong> — {e.error}</li>)}</ul></details>}
   <details><summary>{MORE}</summary><dl>
    <dt>Ce inventariem</dt><dd>Fișierele anunțurilor de participare ale procedurilor atribuite, din familiile acoperite (licitații, simplificate, SAD, concesiuni, cereri de oferte, concursuri): documentația (caiet de sarcini, fișa de date, modele, DUAE) și lista de clarificări și decizii. Inventarierea parcurge tot istoricul, așa că totalurile cresc pe măsură ce avansează.</dd>
    <dt>Ce descărcăm</dt><dd>Descărcarea automată e {c.automatic_downloads?'pornită':'oprită'}. Pornită, salvează doar fișierele identificate drept caiete de sarcini, inclusiv arhivele care le conțin (PDF, Word, Excel, ZIP/RAR/7z, P7S/P7M), cele recente întâi. Toate procedurile ar cere circa 1 TB. Alte documente se cer din pagina contractului.</dd>
    <dt>Cifre</dt><dd>{fmt(k.specifications)} caiete identificate (fișiere sau arhive care le conțin): {fmt(k.specifications_downloaded)} descărcate, {fmt(k.specifications_ready)} cu text. Clasificarea numără și cele {fmt(k.uncertain)} fișiere cu categorii încă neidentificate; rulează din datele păstrate, fără cereri SEAP. În afara colectării: {fmt(data.coverage.unsupported)} anunțuri fără contract atribuit sau din alte familii și {fmt(Number(data.files.discovered)-Number(data.files.supported))} fișiere în alte formate. {fmt(data.inventory.empty)} anunțuri verificate nu au fișiere.{held>0&&` ${fmt(held)} operațiuni amânate de regula «doar caiete».`}{retries>0&&` ${fmt(retries)} operațiuni așteaptă reîncercarea.`}</dd>
    <dt>Pauză și erori</dt><dd>Pauza păstrează coada, originalele și paginile deja procesate; fișierele descărcate își pot termina procesarea. Erorile temporare se reiau după 5, apoi 10 minute; formatele nerecunoscute rămân semnalate. Simultan: cel mult {fmt(c.download_concurrency)} descărcări și {fmt(c.processing_concurrency)} procesări.</dd>
    <dt>Coada și bugetul</dt><dd>Coada de mai jos cuprinde toate cererile de documente: liste, descărcări și procesări. Cererile către SEAP folosesc proxy-urile și bugetul comun al colectării; cererile individuale păstrează 60 de secunde între descărcări, loturile prin proxy intervalul fiecărui IP.</dd>
    <dt>Disc</dt><dd>Arhiva păstrează originalele și PDF-urile extrase, fără copii identice. Discul cuprinde și baza de date, backup-urile și aplicația.</dd>
   </dl></details>
  </div>
 </section>;
}
