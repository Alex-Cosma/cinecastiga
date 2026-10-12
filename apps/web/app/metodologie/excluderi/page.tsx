import Link from 'next/link';
import {notFound} from 'next/navigation';
import {EXCLUSION_REASONS,getContractExclusions} from '@/lib/contract-exclusions';
import {coverageDate} from '@/lib/coverage';
import {formatExactDecimal,formatInt} from '@/lib/format';
export const dynamic='force-dynamic';
export const metadata={title:'Excluderi temporare din totaluri'};

export default async function ExcluderiPage({searchParams}:{searchParams:Promise<{pagina?:string;grup?:string}>}) {
 const params=await searchParams;
 if(params.grup&&!/^[a-f0-9]{64}$/.test(params.grup))notFound();
 const data=await getContractExclusions(Number(params.pagina??1),params.grup);
 return <>
  <Link href="/metodologie#acoperire">Înapoi la acoperirea datelor</Link>
  <h1 className="page-title">Excluderi temporare din totaluri</h1>
  <p className="page-sub">Aceste publicații ar putea descrie aceleași contracte. Până lămurim identitatea lor, valorile rămân în surse și sunt excluse din calcule.</p>
  <p>{formatInt(data.total)} {data.total===1?'grup de verificat':'grupuri de verificat'}{data.total>0&&` · pagina ${data.page} din ${data.pages}`}.
   {' '}Lista nu este un semnal de neregulă.</p>
  {params.grup&&<p><Link href="/metodologie/excluderi">Vezi toate grupurile excluse</Link></p>}
  {!data.groups.length&&<p className="note">{params.grup?'Acest grup nu mai este exclus temporar. Consultă paginile contractelor pentru starea actuală.':'Nu există grupuri excluse temporar în această versiune a datelor. Aceasta nu confirmă completitudinea colectării.'}</p>}
  {data.groups.map(g=><section className="section" key={g.id}>
   <h2>{g.authorityId?<Link href={`/entitati/${g.authorityId}`}>{g.authority??'Instituție'}</Link>:g.authority??'Instituție neidentificată'}</h2>
   <p><b>{g.members[0]?.noticeNo??'Anunț neidentificat'}</b> · {formatInt(g.members.length)} publicații comparate · reverificat la {coverageDate(g.reviewedAt)}</p>
   <ul className="prose">{g.reasons.map(reason=><li key={reason}>{EXCLUSION_REASONS[reason]??'Diferență între surse care necesită verificare.'}</li>)}</ul>
   <details className="data-context">
    <summary>Verifică publicațiile și valorile sursă ({g.members.length})</summary>
    <div className="ask-tablewrap" role="region" aria-label={`Sursele pentru ${g.members[0]?.noticeNo??'acest grup'}`} tabIndex={0}>
     <table className="rank"><thead><tr><th scope="col">Contract / publicație</th><th scope="col">Data contractului</th><th scope="col" className="num">Valoarea sursă (lei)</th><th scope="col">Sursa oficială</th></tr></thead>
      <tbody>{g.members.map(m=><tr key={m.id}>
       <td><Link href={`/contracte/${m.publicId}`} target="_blank" rel="noopener noreferrer">{m.title??'Contract fără titlu'}</Link><div className="note">Nr. {m.number??'necunoscut'} · ID {m.publicId}</div></td>
       <td>{coverageDate(m.date)}</td><td className="num">{formatExactDecimal(m.value)}</td>
       <td><a href={`https://www.e-licitatie.ro/pub/notices/ca-notices/view-c/${m.noticeId}`} target="_blank" rel="noopener noreferrer">Vezi în SEAP</a></td>
      </tr>)}</tbody>
     </table>
    </div>
    <p className="note">Valorile sunt reproduse pentru verificare; nu le însumăm ca achiziții distincte.</p>
   </details>
  </section>)}
  {data.pages>1&&<nav className="pagination" aria-label="Paginarea grupurilor excluse">
    {data.page>1&&<Link href={`/metodologie/excluderi?pagina=${data.page-1}`}>Pagina precedentă</Link>}
    <span> {data.page} / {data.pages} </span>
    {data.page<data.pages&&<Link href={`/metodologie/excluderi?pagina=${data.page+1}`}>Pagina următoare</Link>}
  </nav>}
 </>;
}
