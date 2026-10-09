import Link from 'next/link';
import {awardUrl} from '@/lib/elicitatie';
import './contract-publications.css';

export default function ContractPublications({publications,currentId,countedOnce}:{
 publications:{natId:string;noticeId:string;noticeNo:string|null;canonical:boolean}[];
 currentId:string;countedOnce:boolean;
}) {
 if(publications.length<2)return null;
 return <aside className="contract-publications" aria-label="Publicațiile aceluiași contract">
   <p><strong>Același contract, {publications.length} publicații SEAP.</strong>{' '}
     {countedOnce?'Valoarea este numărată o singură dată în statistici.':'Acest contract nu contribuie la totalurile statistice curente.'}</p>
   <ul>{publications.map(p=><li key={p.natId}>
     <span>{p.noticeNo??'Anunț de atribuire'} <span className="note">· ID {p.noticeId}</span></span>
     <span className="contract-publication-links">
       {p.natId===currentId?<span aria-current="page">Publicația deschisă</span>:<Link href={`/contracte/${p.natId}`}>Vezi publicația</Link>}
       <a href={awardUrl(p.noticeId)} target="_blank" rel="noopener noreferrer" aria-label={`Verifică în SEAP anunțul ${p.noticeId} (filă nouă)`}>Verifică în SEAP ↗</a>
     </span>
   </li>)}</ul>
   <details><summary>De ce sunt grupate?</summary>
     <p>Sursele arhivate confirmă aceeași procedură, instituție, furnizori, număr de contract, dată, valoare și loturi. Păstrăm toate publicațiile pentru verificare; gruparea evită repetarea aceleiași valori în calcule.</p>
   </details>
 </aside>;
}
