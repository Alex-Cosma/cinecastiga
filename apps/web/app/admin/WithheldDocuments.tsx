'use client';
import {useCallback,useEffect,useState} from 'react';
import {PRIVACY_REASONS} from '@/lib/documents/privacy-hold';
import type {WithheldDocument,WithheldDocuments as Withheld} from '@/lib/documents/privacy-hold-admin';

const stamp=(s:string)=>new Date(s).toLocaleString('ro-RO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'});
const seap=(url:string)=>/^https:\/\/www\.e-licitatie\.ro\/pub\/notices\//.test(url);

/**
 * Fișiere → „Documente oprite” (owner, 18 November 2026, legal audit): documents whose text holds a CNP or an identity
 * card are not served to readers until decided here. „Publică” is for a false alarm (the check never catches that
 * document again); „Ține ascuns” keeps it out. Nothing is drawn while no document was ever caught.
 */
export default function WithheldDocuments({enabled}:{enabled:boolean}){
 const [data,setData]=useState<Withheld|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState<string|null>(null);
 const load=useCallback(async()=>{
  try{
   const response=await fetch('/api/admin/documents/holds',{cache:'no-store'});const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Documentele oprite nu pot fi citite acum.');
   setData(result);setError('');
  }catch(e){setError(e instanceof Error&&e.message?e.message:'Documentele oprite nu pot fi citite acum.');}
 },[]);
 useEffect(()=>{if(enabled)void load();},[enabled,load]);
 const decide=async(d:WithheldDocument,decision:'release'|'keep')=>{
  setBusy(d.id);
  try{
   const response=await fetch('/api/admin/documents/holds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id,decision})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||'Decizia nu a fost salvată. Reîncearcă.');
   await load();
  }catch(e){setError(e instanceof Error&&e.message?e.message:'Decizia nu a fost salvată. Reîncearcă.');}
  finally{setBusy(null);}
 };
 if(!enabled||(!error&&!data?.documents.length))return null;
 return <section className="document-queue files-page" aria-labelledby="withheld-title">
  <div className="section-heading"><div><h2 id="withheld-title">Documente oprite</h2>
   <p className="section-description">{data?`${data.waiting} de văzut · ${data.kept} ținute ascunse. `:''}Textul lor conține date personale; cititorii văd o notă și linkul spre SEAP.</p></div></div>
  {error&&<p className="queue-notice" role="alert">{error} <button type="button" className="text-button" onClick={()=>void load()}>Reîncearcă</button></p>}
  {!!data?.documents.length&&<ol className="document-queue-list">{data.documents.map((d,i)=><li key={d.id}>
   <span className="queue-position" aria-hidden="true">{i+1}</span>
   <div className="file-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H5v18h14V8Z M14 3v5h5"/><path d="M9 13h6m-6 4h6"/></svg></div>
   <div className="queued-file-copy"><strong>{d.filename}</strong>
    <span className="file-source">{seap(d.noticeUrl)?<a href={d.noticeUrl} target="_blank" rel="noopener noreferrer">{d.noticeNo||'anunț'}<span className="sr-only"> — anunțul SEAP, în filă nouă</span></a>:d.noticeNo}<span title={d.noticeTitle}>{d.noticeTitle}</span></span>
    <div className="queued-file-meta">
     <span className="task-state">{PRIVACY_REASONS[d.reason??'']??'date personale'}{d.page?` · pagina ${d.page}`:''}{d.hold==='kept'?` · ținut ascuns${d.decidedBy?` de ${d.decidedBy}`:''}`:''}</span>
     {d.at&&<time dateTime={d.at}>Oprit {stamp(d.at)}</time>}
     {d.hasPdf&&<a className="file-archive-link" href={`/api/documents/${d.id}/file?kind=pdf${d.page?`#page=${d.page}`:''}`} target="_blank" rel="noopener noreferrer">Deschide PDF<span className="sr-only"> pentru {d.filename}, în filă nouă</span></a>}
     <button type="button" className="text-button" disabled={busy!==null} onClick={()=>void decide(d,'release')}>Publică</button>
     {d.hold==='held'&&<button type="button" className="text-button" disabled={busy!==null} onClick={()=>void decide(d,'keep')}>Ține ascuns</button>}
    </div></div>
  </li>)}</ol>}
 </section>;
}
