'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {AdminDocumentJob,AdminDocumentQueue,DocumentQueueFilter} from '@/lib/admin/document-queue';
import {stageLabel} from '@/lib/documents/shared';
import {Ghost,G} from '@/components/ghost/Ghost';
import {FloatStatus} from '@/components/ghost/client';
const labels:Record<DocumentQueueFilter,string>={download:'De descărcat',processing:'De procesat',list:'Liste de fișiere',all:'Toată coada'};
const size=(n:number)=>new Intl.NumberFormat('ro-RO',{maximumFractionDigits:1}).format(n/(n>=1024**3?1024**3:1024**2))+(n>=1024**3?' GiB':' MiB');
const number=(n:number)=>new Intl.NumberFormat('ro-RO').format(n);
const stamp=(s:string)=>new Date(s).toLocaleString('ro-RO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'});
function FileIcon({saved=false}:{saved?:boolean}){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H5v18h14V8Z M14 3v5h5"/><path d={saved?'m8 14 3 3 5-6':'M12 10v7m-3-3 3 3 3-3'}/></svg>;}
function Source({job}:{job:AdminDocumentJob}){const valid=/^https:\/\/www\.e-licitatie\.ro\/pub\/notices\//.test(job.noticeUrl);return <span className="file-source">{valid?<a href={job.noticeUrl} target="_blank" rel="noopener noreferrer">{job.noticeNo}<span className="sr-only"> — anunțul SEAP, în filă nouă</span></a>:job.noticeNo}<span title={job.noticeTitle}>{job.noticeTitle}</span></span>;}
function ArchivedLink({job}:{job:AdminDocumentJob}){if(!job.documentId||!job.downloaded)return null;return <a className="file-archive-link" href={`/api/documents/${job.documentId}/file${job.hasPdf?'?kind=pdf':''}`} target="_blank" rel="noopener noreferrer">{job.hasPdf?'Deschide PDF':'Originalul salvat'}<span className="sr-only"> pentru {job.filename}, în filă nouă</span></a>;}

/* The disk sample arrives with the queue's poll (one fetch). The collection section above shows it next to its
   controls, so the queue publishes it here and <DocumentStorage/> reads it. null: no answer yet. */
type Storage=AdminDocumentQueue['storage'];
type StorageSnapshot={storage:Storage|null;stale:boolean}|null;
let storageSnapshot:StorageSnapshot=null;
const storageListeners=new Set<()=>void>();
function publishStorage(next:NonNullable<StorageSnapshot>){
 const prev=storageSnapshot;
 if(prev&&prev.stale===next.stale&&prev.storage?.measuredAt===next.storage?.measuredAt)return;
 storageSnapshot=next;storageListeners.forEach(listener=>listener());
}
const subscribeStorage=(listener:()=>void)=>{storageListeners.add(listener);return()=>{storageListeners.delete(listener);};};
// The disk alarm (owner, 7 November 2026): from 90% occupied; below that the percentage is information.
const FULL=90;

/** "Spațiu pe disc": the measured disk and the document archive, from the queue's last answer. */
export function DocumentStorage(){
 const snapshot=useSyncExternalStore(subscribeStorage,()=>storageSnapshot,()=>null);
 if(!snapshot)return <Ghost className="document-storage" name="document-storage" label="Se măsoară spațiul pe disc…" wait="client">
  <div className="storage-heading"><h3>Spațiu pe disc</h3><span className="storage-time"><G.Line inline w="9.5em"/></span></div>
  <div className="storage-body">
   <p className="storage-verdict"><G.Line w="42%"/></p>
   <meter className="g-quiet" min={0} max={1} value={0} aria-hidden="true"/>
   <p className="storage-values"><G.Line w="78%" only="not-phone"/><G.Line w="68%" only="phone"/><G.Line w="40%" only="phone"/></p>
   <p className="storage-archive"><G.Line w="36%"/></p>
  </div>
 </Ghost>;
 const {storage,stale}=snapshot,disk=storage?.disk,full=!!disk&&disk.percent>=FULL;
 return <div className="document-storage">
  <div className="storage-heading"><h3>Spațiu pe disc</h3>{storage&&<time className={`storage-time${stale?' stale':''}`} dateTime={storage.measuredAt}>{stale?'Neactualizat · ':''}Măsurat {stamp(storage.measuredAt)}</time>}</div>
  <div className={`storage-body${stale&&storage?' g-stale':''}`}>
   {disk?<>
    <p className={`storage-verdict${full?' full':''}`}>{full?`Discul e aproape plin: ${disk.percent}% ocupat.`:`${disk.percent}% ocupat.`}</p>
    {/* The meter turns orange where the verdict does: a displayed 90% (used/total ≥ 89,5%). */}
    <meter min={0} max={disk.total} value={disk.used} high={disk.total*(FULL-.5)/100} optimum={0} aria-label={`Spațiu ocupat pe disc: ${disk.percent}%`}/>
    <p className="storage-values"><span><strong>{size(disk.used)}</strong> ocupați din {size(disk.total)}</span><span><strong>{size(disk.available)}</strong> disponibili</span></p>
   </>:<p className="storage-verdict" role="status">{storage?'Discul nu poate fi măsurat acum. Reîncercăm automat.':'Spațiul pe disc nu poate fi citit acum. Reîncercăm automat.'}</p>}
   {storage&&<p className="storage-archive">Arhiva de documente: <strong>{storage.archive?size(storage.archive.bytes):'nemăsurată'}</strong></p>}
  </div>
 </div>;
}

const emptyTitle:Record<DocumentQueueFilter,string>={download:'Niciun fișier nu așteaptă descărcarea.',processing:'Niciun fișier salvat nu așteaptă procesarea.',list:'Nicio listă de fișiere în așteptare.',all:'Coada este goală.'};
const emptyHint:Record<DocumentQueueFilter,string>={download:'Aici apar fișierele cerute din pagina unui contract sau dintr-un lot.',processing:'Aici apar originalele salvate pentru care s-a cerut procesarea.',list:'Aici apar verificările listelor de fișiere, în ordinea cererii.',all:'Cererile noi apar automat, în ordinea înregistrării.'};

export default function DocumentQueue({paused,maintenance,blocked,quiet=false,retryAt=null,enabled=true}:{enabled?:boolean;paused:boolean;maintenance:boolean;blocked:boolean;quiet?:boolean;retryAt?:string|null}){
 const [data,setData]=useState<AdminDocumentQueue|null>(null),[filter,setFilter]=useState<DocumentQueueFilter>('download'),[page,setPage]=useState(1),[stale,setStale]=useState(false),[loading,setLoading]=useState(true);
 const request=useRef<AbortController|null>(null),busy=useRef(false);
 const load=useCallback(async()=>{
  if(busy.current)return;busy.current=true;const ac=new AbortController();request.current=ac;const timer=setTimeout(()=>ac.abort(),8000);
  try{const response=await fetch(`/api/admin/collection?documentQueue=1&filter=${filter}&page=${page}`,{cache:'no-store',signal:ac.signal});if(!response.ok)throw Error();const next:AdminDocumentQueue=await response.json();if(request.current===ac){setData(next);setStale(false);setLoading(false);publishStorage({storage:next.storage,stale:false});}}
  catch{if(request.current===ac){setStale(true);setLoading(false);publishStorage({storage:storageSnapshot?.storage??null,stale:true});}}
  finally{clearTimeout(timer);if(request.current===ac)busy.current=false;}
 },[filter,page]);
 useEffect(()=>{if(!enabled)return;busy.current=false;setLoading(true);void load();const timer=setInterval(()=>{if(!document.hidden)void load();},5000);const focus=()=>void load();window.addEventListener('focus',focus);return()=>{request.current?.abort();request.current=null;busy.current=false;clearInterval(timer);window.removeEventListener('focus',focus);};},[load,enabled]);
 const select=(next:DocumentQueueFilter)=>{setFilter(next);setPage(1);};
 // Another filter or page keeps the last answer in place, dimmed, until the new one arrives (DESIGN.md, ghosts case 2).
 const switching=!!data&&loading&&enabled,active=data?.active,shownFilter=data?.filter??filter;
 const progress=active?.pagesTotal?Math.min(100,Math.max(0,active.pagesDone/active.pagesTotal*100)):null;
 const reason=maintenance?'Mentenanță: cererile noi către SEAP așteaptă finalul procesării.':blocked?'Preluările din SEAP așteaptă verificarea erorii din jurnal.':paused?'Coada SEAP e pe pauză. Fișierele cerute își păstrează locul.':quiet?'Pauza SEAP 02:59–03:30: fișierele își păstrează locul și se reiau automat.':retryAt?`Reîncercare SEAP după timeout, cel mai devreme la ${stamp(retryAt)}. Fișierele își păstrează locul.`:null;
 return <section className="document-queue files-page" id="files" aria-labelledby="document-queue-title">
  <div className="section-heading"><div><h2 id="document-queue-title">Fișiere în așteptare</h2><p className="section-description">Cererile din paginile contractelor și loturile automate, în ordine.</p></div><Link className="text-button" href="/admin/trafic/conexiune">Ritmul SEAP</Link></div>
  {data&&data.counts.running>1&&<p className="queue-notice">{number(data.counts.running)} operațiuni în lucru; mai jos, cea cu pagini de procesat. Toate cererile apar în <Link href="/admin/trafic/jurnal">jurnal</Link>.</p>}
  {reason&&<p className="queue-notice">{reason}</p>}
  {stale&&<p className="queue-notice" role="status">{data?'Coada nu se poate actualiza. Afișăm ultima stare cunoscută.':'Coada nu poate fi citită acum.'} <button type="button" className="text-button" onClick={()=>void load()}>Reîncearcă</button></p>}
  {active&&<div className={`active-document${stale?' g-stale':''}`}><div className={`file-mark ${active.downloaded?'saved':''}`}><FileIcon saved={active.downloaded}/></div><div className="active-document-copy"><div className="active-document-heading"><strong>{active.filename??'Lista de fișiere a anunțului'}</strong><span className="task-state">În lucru</span></div><Source job={active}/><p>{stageLabel[active.stage]??'Operațiune în curs'}{active.downloaded&&active.kind==='file'&&<span> · Originalul este deja salvat</span>}</p>{progress!==null&&<div className="document-progress"><progress max="100" value={progress} aria-label="Progresul procesării paginilor"/><span>{number(active.pagesDone)} / {number(active.pagesTotal!)} pagini</span></div>}<ArchivedLink job={active}/></div></div>}
  <div className="queue-filters" role="group" aria-label="Filtrează coada de documente">{(Object.keys(labels) as DocumentQueueFilter[]).map(key=><button type="button" key={key} className={`filter ${filter===key?'active':''}`} aria-pressed={filter===key} onClick={()=>select(key)}>{labels[key]}<span>{data?number(data.counts[key]):stale?'—':<G.Line inline w=".7em"/>}</span></button>)}</div>
  {!data?(stale
   ?null /* the notice above says it: one line */
   :<Ghost className="queue-content" name="document-queue" label="Se citește coada de documente…" wait="client">
    <div className="queue-empty"><FileIcon/><div><p className="queue-empty-title"><G.Line w="17em"/></p><p><G.Line w="72%" only="not-phone"/><G.Line w="92%" only="phone"/><G.Line w="40%" only="phone"/></p></div></div>
   </Ghost>)
  :<div className={`queue-content${stale||switching?' g-stale':''}`} aria-busy={switching||undefined}>
   {!data.jobs.length?<div className="queue-empty"><FileIcon saved={shownFilter==='processing'}/><div><p className="queue-empty-title">{emptyTitle[shownFilter]}</p><p>{emptyHint[shownFilter]}{active&&' Operațiunea în lucru e afișată mai sus.'}</p></div></div>
   :<ol className="document-queue-list">{data.jobs.map(job=><li key={job.id}>
    <span className="queue-position" aria-label={`Poziția ${job.position} în coada de documente`}>{number(job.position)}</span><div className={`file-mark ${job.downloaded?'saved':''}`}><FileIcon saved={job.downloaded}/></div><div className="queued-file-copy"><strong>{job.filename??'Verificarea listei de fișiere'}</strong><Source job={job}/><div className="queued-file-meta"><span className={`task-state ${job.downloaded?'saved':''}`}>{job.kind==='list'?'Doar lista, fără descărcare':job.downloaded?'Descărcat · așteaptă procesarea':'Încă nedescărcat'}</span><time dateTime={job.createdAt}>Solicitat {stamp(job.createdAt)}</time><ArchivedLink job={job}/></div></div>
   </li>)}</ol>}
  </div>}
  {data&&data.total>data.pageSize&&<nav className="queue-pagination" aria-label="Paginile cozii de documente"><span>{number((data.page-1)*data.pageSize+1)}–{number(Math.min(data.page*data.pageSize,data.total))} din {number(data.total)}</span><button className="button" disabled={loading||data.page<=1} onClick={()=>setPage(data.page-1)}>Înapoi</button><button className="button" disabled={loading||data.page*data.pageSize>=data.total} onClick={()=>setPage(data.page+1)}>Următoarele</button></nav>}
  {switching&&<FloatStatus>Se încarcă coada…</FloatStatus>}
 </section>;
}
