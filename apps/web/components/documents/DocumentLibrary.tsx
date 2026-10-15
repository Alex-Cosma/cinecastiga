'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import DiscoveryIcon from '@/app/DiscoveryIcon';
import {foldText,SIGNATURE_UNVERIFIED,stageLabel,isActiveFileJob,type ContractFile} from '@/lib/documents/shared';
import {DOCUMENT_CATEGORIES,categoryLabel,classifyDocumentContents,classifyDocumentName,classificationDescription,hasSpecifications,type DocumentCategory,type Classification} from '@/lib/documents/classification';
import './library.css';
const perPage=6;
const date=(s:string)=>new Date(s).toLocaleDateString('ro-RO',{timeZone:'Europe/Bucharest'});
const classification=(f:ContractFile)=>f.classification??classifyDocumentContents(f.filename,f.contents);
const friendlyName=(s:string)=>s.replace(/(?:\.p7[sm])+$/i,'').replace(/\.(pdf|docx?|xlsx?|zip|rar|7z)$/i,'').replace(/_/g,' ');
type Props={files:ContractFile[];nid:string;enabled:boolean;authenticated:boolean;busy:string|null;onOpen:(f:ContractFile,page?:number)=>void;onEnqueue:(id:string)=>void};
export default function DocumentLibrary({files,nid,enabled,authenticated,busy,onOpen,onEnqueue}:Props){
 const [category,setCategory]=useState<DocumentCategory|'all'>('all'),[query,setQuery]=useState(''),[onlyReady,setOnlyReady]=useState(false),[page,setPage]=useState(1);
 const entries=useMemo(()=>files.map(file=>({file,classification:classification(file)})).sort((a,b)=>{
  const ac=a.classification.categories,bc=b.classification.categories;
  const rank=(c:DocumentCategory[])=>Math.min(...c.map(id=>DOCUMENT_CATEGORIES.findIndex(x=>x.id===id)));
  return rank(ac)-rank(bc)||(Date.parse(b.file.publishedAt??'')||0)-(Date.parse(a.file.publishedAt??'')||0)||a.file.filename.localeCompare(b.file.filename,'ro')||a.file.id.localeCompare(b.file.id);
 }),[files]);
 const counts=Object.fromEntries(DOCUMENT_CATEGORIES.map(c=>[c.id,entries.filter(e=>e.classification.categories.includes(c.id)).length]));
 const filtered=entries.filter(e=>(category==='all'||e.classification.categories.includes(category))&&(!onlyReady||!!e.file.processedAt)&&(!query.trim()||foldText([e.file.filename,...(e.file.contents??[]).map(p=>p.name)].join(' ')).includes(foldText(query.trim()))));
 const pages=Math.max(1,Math.ceil(filtered.length/perPage)),current=Math.min(page,pages),start=(current-1)*perPage,shown=filtered.slice(start,start+perPage);
 function choose(id:DocumentCategory|'all'){setCategory(id);setPage(1);}
 function reset(){setCategory('all');setQuery('');setOnlyReady(false);setPage(1);}
 if(!files.length)return null;
 return <div className="df-library">
  <aside className="df-categories" aria-label="Categorii de documente"><h3>Alege ce verifici</h3><button type="button" className="df-category" aria-pressed={category==='all'} onClick={()=>choose('all')}><DiscoveryIcon name="layers"/><span>Toate documentele</span><b>{files.length}</b></button>
   {DOCUMENT_CATEGORIES.map(c=><button type="button" className="df-category" key={c.id} aria-pressed={category===c.id} onClick={()=>choose(c.id)}><DiscoveryIcon name={c.icon}/><span>{c.label}</span><b>{counts[c.id]}</b></button>)}
   <p className="df-priority-note"><DiscoveryIcon name="arrow"/><span>Descărcăm automat doar caietele de sarcini identificate.<small>Din tot istoricul, cele recente întâi.</small></span></p>
  </aside>
  <div className="df-library-main">
   <label className="df-mobile-category">Categorie<select value={category} onChange={e=>choose(e.target.value as DocumentCategory|'all')}><option value="all">Toate documentele ({files.length})</option>{DOCUMENT_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label} ({counts[c.id]})</option>)}</select></label>
   <div className="df-library-tools"><label className="df-name-search"><DiscoveryIcon name="search"/><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} aria-label="Caută în numele documentelor" placeholder="Caută în numele documentelor" maxLength={150}/></label><label className="df-ready-filter"><input type="checkbox" checked={onlyReady} onChange={e=>{setOnlyReady(e.target.checked);setPage(1);}}/>Doar de citit acum</label></div>
   <div className="df-library-results"><h3>{category==='all'?'Toate documentele':categoryLabel(category)}</h3><span role="status" aria-live="polite">{filtered.length} {filtered.length===1?'document':'documente'}</span></div>
   <div className="df-library-list">{shown.map(({file:f,classification:c})=><FileRow key={f.id} file={f} classification={c} nid={nid} enabled={enabled} authenticated={authenticated} busy={busy} onOpen={onOpen} onEnqueue={onEnqueue}/>)}
    {!shown.length&&<div className="df-library-empty"><h4>{query.trim()?'Nu am găsit acest nume':onlyReady?'Niciun document pregătit în această selecție':'Niciun document identificat în această categorie'}</h4><p>{query.trim()?'Încearcă un alt cuvânt sau caută în toate categoriile.':onlyReady?'Poți vedea și documentele care așteaptă descărcarea sau procesarea.':'Poate exista în fișierele neclasificate sau în arhive încă neprocesate.'}</p><button type="button" className="df-button" onClick={reset}>Resetează filtrele</button></div>}
   </div>
   {!!filtered.length&&<nav className="df-library-pagination" aria-label="Paginarea documentelor"><span>{start+1}–{Math.min(start+perPage,filtered.length)} din {filtered.length} documente</span><div><button type="button" className="df-button" disabled={current===1} onClick={()=>setPage(current-1)} aria-label="Pagina anterioară de documente">←</button><span>{current} / {pages}</span><button type="button" className="df-button" disabled={current===pages} onClick={()=>setPage(current+1)} aria-label="Pagina următoare de documente">→</button></div></nav>}
   {entries.some(e=>e.classification.categories.length>1)&&<p className="df-library-footnote">Arhivele mixte pot apărea în mai multe categorii.</p>}
  </div>
 </div>;
}
function FileRow({file:f,classification:c,nid,enabled,authenticated,busy,onOpen,onEnqueue}:Omit<Props,'files'>&{file:ContractFile;classification:Classification}){
 const j=f.job,active=!!j&&isActiveFileJob(j),ready=!!f.processedAt&&!!f.pdfHash,spec=hasSpecifications(c);
 const archive=!!f.contents?.length&&(f.contents.length>1||f.contents.some(p=>p.name.includes(' / ')));
 return <article className={`df-file df-library-file${f.originalHash?' df-file-downloaded':''}${spec?' df-specification':''}`} data-document-id={f.id}>
  <span className="df-library-icon"><DiscoveryIcon name={archive?'folder':spec?'document':'bookOpen'}/></span>
  <div className="df-file-body"><h3>{ready?<button type="button" className="df-title" onClick={()=>onOpen(f)}>{friendlyName(f.filename)}</button>:friendlyName(f.filename)}</h3><p className="df-source-filename">{f.filename}</p>
   <div className="df-classification-tags">{c.categories.map(cat=><span className="df-category-tag" key={cat}>{categoryLabel(cat)}</span>)}{c.method==='filename'&&<span className="df-classification-preliminary">din numele fișierului</span>}</div>
   <p className="df-status">{f.originalHash&&<><span className="df-downloaded"><DiscoveryIcon name="checkCircle" className="df-icon"/>Descărcat</span>{' · '}</>}{ready?`${f.pageCount} pagini · ${f.contents?.some(p=>p.error)?'text disponibil parțial':'de citit acum'}`:active?j.status==='queued'&&spec&&j.automatic?'În coadă · prioritate caiet de sarcini':stageLabel[j.stage]??'În coadă':j?.stage==='specifications_only'?stageLabel.specifications_only:j?.status==='failed'?j.error:f.originalHash?'Text încă nepregătit':'Disponibil în SEAP'}</p>
   {f.signature===SIGNATURE_UNVERIFIED&&<p className="df-signature-warning">{SIGNATURE_UNVERIFIED}</p>}
   {j?.status==='running'&&<div className="df-progress"><progress aria-label={stageLabel[j.stage]??'Procesarea documentului'} {...(j.pagesTotal?{value:j.pagesDone,max:j.pagesTotal}:{})}/>{j.pagesTotal&&<small>{j.pagesDone} din {j.pagesTotal} pagini citite</small>}</div>}
   {archive&&<details className="df-library-archive"><summary>{f.contents!.length} fișiere în arhivă · vezi conținutul</summary><ul>{f.contents!.map((part,index)=>{const pc=c.parts?.find(p=>p.name===part.name&&p.firstPage===part.firstPage)??classifyDocumentName(part.name);return <li key={`${index}:${part.name}`}><div><span>{part.name.split(' / ').at(-1)}</span><small>{pc.categories.map(categoryLabel).join(' · ')}{part.pages?` · ${part.pages} pagini`:''}</small>{part.error&&<p className="df-error">{part.error}</p>}{part.rendition==='text'&&<small>Text rearanjat; verifică formatarea în original.</small>}</div>{ready&&part.firstPage&&<button type="button" className="df-button" onClick={()=>onOpen(f,part.firstPage)}>Citește</button>}</li>;})}</ul></details>}
   <details className="df-provenance"><summary>Surse și clasificare</summary><dl><dt>Cod SEAP</dt><dd>{f.code}</dd>{f.publishedAt&&<><dt>Publicat</dt><dd>{date(f.publishedAt)}</dd></>}{f.downloadedAt&&<><dt>Original păstrat</dt><dd>{date(f.downloadedAt)}</dd><dt>Amprentă SHA-256</dt><dd className="df-hash">{f.originalHash}</dd></>}{f.signature&&<><dt>Semnătură</dt><dd>{f.signature}</dd></>}<dt>Încadrare</dt><dd>{classificationDescription(c)}{c.categories.includes('templates')&&' Modelul nu dovedește încheierea unui contract.'}{c.categories.includes('contracts')&&' Încadrarea nu verifică semnarea sau valabilitatea contractului.'}</dd></dl>
    {!!c.evidence.length&&<ul className="df-classification-evidence">{c.evidence.map((e,i)=><li key={i}>{e.page&&ready?<button type="button" className="df-title" onClick={()=>onOpen(f,e.page)}>Pagina {e.page}: „{e.value}”</button>:e.source==='filename'?`Nume: ${e.value}`:e.value}</li>)}</ul>}
    {f.originalHash&&<a href={`/api/documents/${f.id}/file`}>Descarcă originalul{/\.p7[sm]$/i.test(f.filename)?` semnat (${f.filename.slice(-4).toLowerCase()})`:''}</a>}
   </details>
  </div>
  <div className="df-file-action">{ready?<button type="button" className="df-button df-primary" onClick={()=>onOpen(f)}><DiscoveryIcon name="bookOpen" className="df-icon"/><span>{spec&&!archive?'Citește caietul':'Citește'}</span></button>:active?<span className="df-status-queued">{j.status==='queued'?'În coadă':'În lucru'}</span>:enabled?<><button type="button" className={`df-button${f.originalHash?' df-resume':''}`} disabled={!authenticated||busy!==null} onClick={()=>onEnqueue(f.id)}><DiscoveryIcon name={f.originalHash?'retry':'download'} className="df-icon"/><span>{busy===f.id?'Se trimite…':f.originalHash?'Reia procesarea':j?.status==='failed'?'Reîncearcă descărcarea':'Descarcă'}</span></button>{!authenticated&&<Link href={`/login?next=${encodeURIComponent(`/contracte/${nid}#fisiere`)}`}>Autentificare pentru preluare</Link>}</>:null}{f.originalHash&&<a className="df-original-link" href={`/api/documents/${f.id}/file`}><DiscoveryIcon name="download" className="df-icon"/>Original</a>}</div>
 </article>;
}
