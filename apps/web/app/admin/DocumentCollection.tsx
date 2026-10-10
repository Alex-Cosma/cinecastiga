'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {DocumentCollectionStatus} from '@/lib/admin/document-collection';
import {stageLabel} from '@/lib/documents/shared';
const fmt=(n:unknown)=>Number(n??0).toLocaleString('ro-RO');
export default function DocumentCollection({compact=false}:{compact?:boolean}){
 const [data,setData]=useState<DocumentCollectionStatus|null>(null),[stale,setStale]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const pending=useRef(false),request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  if(pending.current)return;pending.current=true;const ac=new AbortController();request.current=ac;const timer=setTimeout(()=>ac.abort(),20000);
  try{const r=await fetch('/api/admin/documents',{cache:'no-store',signal:ac.signal});if(!r.ok)throw Error();const d=await r.json();if(request.current===ac){setData(d);setStale(false);}}
  catch{if(request.current===ac)setStale(true);}
  finally{clearTimeout(timer);if(request.current===ac)pending.current=false;}
 },[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},15000);return()=>{clearInterval(timer);request.current?.abort();request.current=null;pending.current=false;};},[refresh]);
 async function change(action:string){
  if(!data)return;setSaving(true);setMessage('');
  try{const r=await fetch('/api/admin/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision:data.control.revision}),signal:AbortSignal.timeout(20000)});const result=await r.json();if(!r.ok)throw Error(result.error);setMessage(action==='pause'?'Pauză salvată. Operațiunile active se încheie; progresul rămâne păstrat.':action==='retry'?'Operațiunile eșuate au fost puse din nou în coadă.':'Colectarea automată este activată. Workerul preia coada.');await refresh();}
  catch(e){setMessage(e instanceof Error?e.message:'Comanda nu a putut fi salvată.');await refresh();}finally{setSaving(false);}
 }
 const c=data?.control;
 const waiting=data&&(data.source.maintenance?'Așteaptă procesarea nocturnă':data.source.blocked_reason?'Așteaptă verificarea erorii SEAP':data.source.paused||data.source.paused_streams.includes('documents')?'Descărcări în pauză SEAP':data.quiet?'Pauza SEAP 02:59–03:30':!data.source.proxy_enabled?'Așteaptă activarea proxy-urilor':null);
 const state=stale?'Status neactualizat':!c?'Se încarcă…':!c.enabled?'Nepornită':c.paused?'Pe pauză':waiting??(!c.alive?'Așteaptă workerul':Number(data?.jobs.running)>0?'În lucru':Number(data?.jobs.failed)>0?'Erori de verificat':'Verifică și completează inventarul');
 const bars=data?[
  {label:'Inventariere',done:Number(data.inventory.checked),total:Number(data.coverage.eligible),unit:'anunțuri verificate'},
  {label:'Descărcare',done:Number(data.files.downloaded),total:Number(data.files.supported),unit:'fișiere salvate'},
  {label:'Text și OCR',done:Number(data.files.processed),total:Number(data.files.supported),unit:'fișiere procesate'},
 ]:[];
 return <section className={`document-collection ${compact?'compact':''}`} aria-label="Colectarea fișierelor">
  <div className="section-heading"><div><h2>Colectarea fișierelor</h2><p className="section-description">Întregul istoric compatibil, de la cele mai recente anunțuri.</p></div><span className={`badge ${waiting||stale||c?.paused?'warning':'neutral'}`}>{state}</span></div>
  {!data?<p role="status">{stale?'Status indisponibil. Reîncercăm automat.':'Se citește progresul fișierelor…'}</p>:<>
   <div className="document-collection-progress">{bars.map(b=><div key={b.label}><h3>{b.label}</h3><strong>{fmt(b.done)} <span>/ {fmt(b.total)}</span></strong><progress value={Math.min(b.done,b.total)} max={Math.max(1,b.total)} aria-label={b.label}/><p>{b.unit}</p></div>)}</div>
   <p className="document-collection-meta">{fmt(data.jobs.running)} operațiuni active · {fmt(data.jobs.queued)} în coadă · {fmt(data.jobs.failed)} eșuate{Number(data.jobs.retries)>0&&<> · {fmt(data.jobs.retries)} așteaptă reîncercarea</>}. {fmt(data.traffic.attempts)} cereri pentru documente astăzi.</p>
   {compact?<Link className="text-button" href="/admin/fisiere">Gestionează descărcările și procesarea →</Link>:<>
    <div className="document-collection-actions"><button className="button primary" disabled={stale||saving} onClick={()=>void change(!c!.enabled?'start':c!.paused?'resume':'pause')}>{saving?'Se salvează…':!c!.enabled?'Pornește colectarea fișierelor':c!.paused?'Reia colectarea fișierelor':'Pune fișierele pe pauză'}</button>{Number(data.jobs.failed)>0&&<button className="button" disabled={stale||saving} onClick={()=>void change('retry')}>Reîncearcă {fmt(data.jobs.failed)} operațiuni eșuate</button>}<span>Maximum {fmt(c!.download_concurrency)} descărcări și {fmt(c!.processing_concurrency)} procesări simultane.</span></div>
    <details><summary>Ce se colectează și cum se păstrează progresul</summary><p>Inventariem documentele anunțurilor simplificate compatibile cu adaptorul verificat. Descărcăm și procesăm PDF și P7S. Alte familii de anunțuri ({fmt(data.coverage.unsupported)}) și alte formate ({fmt(Number(data.files.discovered)-Number(data.files.supported))}) nu sunt acoperite încă. {fmt(data.inventory.empty)} anunțuri verificate nu au fișiere.</p><p>Totalul fișierelor crește pe măsură ce avansează inventarierea. Pauza păstrează coada și originalele; cererile individuale din contracte rămân separate. Cererile SEAP folosesc aceleași proxy-uri și același buget ca datele contractelor. Erorile sunt reîncercate după 5, apoi 10 minute.</p></details>
    {!!data.active.length&&<ul className="document-collection-active" aria-label="Operațiuni active">{data.active.map(j=><li key={j.id}><div><strong>{j.filename??j.notice_no}</strong><span>{stageLabel[j.stage]??'În curs'} · {j.notice_no}</span></div>{j.pages_total>0?<label>{fmt(j.pages_done)} / {fmt(j.pages_total)} pagini<progress max={j.pages_total} value={j.pages_done}/></label>:<span>{j.downloaded?'Original salvat':'Preluare din SEAP'}</span>}</li>)}</ul>}
    {!!data.errors.length&&<details><summary>Ultimele erori ({Math.min(10,Number(data.jobs.failed))} afișate)</summary><ul>{data.errors.map(e=><li key={e.id}><strong>{e.filename??e.notice_no}</strong> — {e.error}</li>)}</ul></details>}
   </>}
   {c!.error&&<p role="status" className="queue-notice">{c!.error}</p>}
  </>}
  {stale&&data&&<p role="status">Afișăm ultima stare cunoscută. Comenzile așteaptă reconectarea.</p>}
  {message&&<p role="status" className="queue-notice">{message}</p>}
 </section>;
}
