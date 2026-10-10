import Link from 'next/link';
import {awardUrl} from '@/lib/elicitatie';
import {formatExactDecimal,formatCalendarDate,cleanName} from '@/lib/format';
import './contract-publications.css';

export interface ContractPublication {
 natId:string;noticeId:string;noticeNo:string|null;canonical:boolean;
 publishedOn?:string|null;valueRon?:string|null;title?:string|null;
 supplierIds?:string[];supplierNames?:string[];
}
export default function ContractPublications({publications,currentId,countedOnce}:{
 publications:ContractPublication[];currentId:string;countedOnce:boolean;
}) {
 if(publications.length<2)return null;
 const current=publications.find(p=>p.canonical);
 const signature=(p:ContractPublication)=>JSON.stringify([p.valueRon,p.title,p.supplierIds]);
 const revised=new Set(publications.map(signature)).size>1;
 const opened=publications.find(p=>p.natId===currentId);
 const older=!!(opened&&current&&signature(opened)!==signature(current));
 return <aside className="contract-publications" aria-label="Istoricul publicațiilor contractului">
   <p><strong>{revised?'Contract actualizat în SEAP.':`Același contract, ${publications.length} publicații SEAP.`}</strong>{' '}
     {countedOnce?'În statistici folosim o singură dată ultima versiune verificată.':'Ultima versiune verificată nu contribuie la totalurile statistice curente.'}
     {current?.valueRon!=null&&<> <strong>{formatExactDecimal(current.valueRon)} lei</strong>.</>}</p>
   {older&&current&&<p className="contract-publication-previous">Privești o versiune anterioară. <Link href={`/contracte/${current.natId}`}>Deschide versiunea folosită în statistici</Link>.</p>}
   <details open={older||undefined}>
    <summary>Vezi istoricul și sursele ({publications.length})</summary>
    <ol>{publications.map((p,index)=>{
     const previous=publications[index-1];
     const changes=previous?[
      p.valueRon!==previous.valueRon?'Valoare modificată':null,
      JSON.stringify(p.supplierIds)!==JSON.stringify(previous.supplierIds)?'Furnizori modificați':null,
      p.title!==previous.title?'Titlu modificat':null,
     ].filter(Boolean):[];
     return <li key={p.natId}>
      <div className="contract-publication-record">
       <div className="contract-publication-heading"><span>{p.publishedOn?<time dateTime={p.publishedOn}>{formatCalendarDate(p.publishedOn)}</time>:'Dată neprecizată'}</span>
        {p.canonical&&<strong className="contract-publication-current">Versiunea din statistici</strong>}</div>
       {p.valueRon!=null&&<strong className="contract-publication-value">{formatExactDecimal(p.valueRon)} lei</strong>}
       <span className="note">{index===0?'Prima publicație verificată':changes.length?changes.join(' · '):'Aceleași date contractuale'} · {p.noticeNo??'Anunț de atribuire'} · ID {p.noticeId}</span>
       {Boolean(p.supplierNames?.length)&&<span className="contract-publication-suppliers">{p.supplierNames!.map(cleanName).join(' · ')}</span>}
       {changes.includes('Titlu modificat')&&<span>{p.title}</span>}
      </div>
      <span className="contract-publication-links">
       {p.natId===currentId?<span aria-current="page">Publicația deschisă</span>:<Link href={`/contracte/${p.natId}`}>Vezi publicația</Link>}
       <a href={awardUrl(p.noticeId)} target="_blank" rel="noopener noreferrer" aria-label={`Verifică în SEAP anunțul ${p.noticeId} (filă nouă)`}>Verifică în SEAP ↗</a>
      </span>
     </li>;
    })}</ol>
    <p className="note">Datele de mai sus sunt datele publicării anunțurilor. Păstrăm fiecare sursă și valorile sale; versiunile anterioare nu se adună la cea curentă. Valoarea contractului nu este o plată.</p>
   </details>
 </aside>;
}
