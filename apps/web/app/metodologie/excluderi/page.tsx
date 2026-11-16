import Link from 'next/link';
import {notFound} from 'next/navigation';
import {EXCLUSION_REASONS,getContractExclusions,getExclusionInstitutions,type ExclusionGroup} from '@/lib/contract-exclusions';
import {coverageDate} from '@/lib/coverage';
import {formatExactDecimal,formatInt} from '@/lib/format';
import {countWords} from '@/lib/ask/answer-text';
import '@/components/record/pager.css';
import './excluderi.css';
export const dynamic='force-dynamic';
export const metadata={title:'Excluderi temporare din totaluri'};

type Params={pagina?:string;grup?:string;institutie?:string;nume?:string;din?:string};

/**
 * The publications kept out of the totals until their identity is settled. Gathered by institution (UX audit Z7-36,
 * owner 16 November 2026): the institutions first, with a name filter; one institution's groups, ten a page; one group
 * (?grup=) opened, with the way back to the contract it was reached from (?din=, Z7-37).
 */
export default async function ExcluderiPage({searchParams}:{searchParams:Promise<Params>}) {
 const params=await searchParams;
 if(params.grup&&!/^[a-f0-9]{64}$/.test(params.grup))notFound();
 const from=params.din&&/^\d{1,18}$/.test(params.din)?params.din:null;
 const institution=params.institutie&&/^(\d{1,18}|none)$/.test(params.institutie)?params.institutie:null;
 const back=from?<Link href={`/contracte/${from}`} className="back">← Înapoi la contract</Link>
  :institution?<Link href="/metodologie/excluderi" className="back">← Toate instituțiile</Link>
  :<Link href="/metodologie#acoperire" className="back">← Înapoi la acoperirea datelor</Link>;
 const head=<>
  {back}
  <h1 className="page-title">Excluderi temporare din totaluri</h1>
  <p className="page-sub">Aceste publicații ar putea descrie aceleași contracte. Până lămurim identitatea lor, valorile rămân în surse și sunt excluse din calcule.</p>
 </>;

 if(!params.grup&&!institution){
  const words=(params.nume??'').trim().slice(0,100);
  const data=await getExclusionInstitutions(words);
  return <>
   {head}
   <p id="grupuri" className="list-anchor excl-count">{countWords(data.total,'grup de verificat','grupuri de verificat')}, la {countWords(data.institutions,'instituție','instituții')}. <span>Lista nu este un semnal de neregulă.</span></p>
   <form className="excl-filter" action="/metodologie/excluderi" method="get" role="search">
    <label htmlFor="excl-nume">Instituția</label>
    <div><input id="excl-nume" type="search" name="nume" defaultValue={words} maxLength={100} placeholder="De exemplu: spitalul, primăria Cluj"/>
     <button type="submit" className="btn">Caută</button></div>
   </form>
   {words&&<p className="excl-shown">{data.shown.length?`${countWords(data.shown.length,'instituție','instituții')} cu „${words}” în nume`:`Nicio instituție cu „${words}” în nume.`} · <Link href="/metodologie/excluderi">Toate</Link></p>}
   {!data.total&&<p className="note">Nu există grupuri excluse temporar în această versiune a datelor. Aceasta nu confirmă completitudinea colectării.</p>}
   <ul className="excl-institutions">{data.shown.map(i=><li key={i.authorityId??'none'}>
    <p className="excl-name">{i.authorityId?<Link prefetch={false} href={`/entitati/${i.authorityId}`}>{i.authority??'Instituție'}</Link>:'Instituție neidentificată'}</p>
    <p className="excl-meta">{countWords(i.groups,'grup','grupuri')} · {countWords(i.reasons,'motiv','motive')}</p>
    <Link prefetch={false} className="excl-open" href={`/metodologie/excluderi?institutie=${i.authorityId??'none'}`}>Vezi grupurile <span aria-hidden="true">→</span></Link>
   </li>)}</ul>
  </>;
 }

 const data=await getContractExclusions(Number(params.pagina??1),params.grup,params.grup?undefined:institution??undefined);
 const first=data.groups[0];
 const pageHref=(p:number)=>`/metodologie/excluderi?institutie=${institution}&pagina=${p}#grupuri`;
 return <>
  {head}
  {institution&&!params.grup&&<h2 className="excl-title">{first?.authorityId?<Link prefetch={false} href={`/entitati/${first.authorityId}`}>{first.authority??'Instituție'}</Link>:first?'Instituție neidentificată':'Instituția'}</h2>}
  <p id="grupuri" className="list-anchor excl-count">{countWords(data.total,'grup de verificat','grupuri de verificat')}{data.pages>1&&` · pagina ${formatInt(data.page)} din ${formatInt(data.pages)}`}. <span>Lista nu este un semnal de neregulă.</span></p>
  {params.grup&&<p><Link href="/metodologie/excluderi">Vezi toate grupurile excluse</Link></p>}
  {!data.groups.length&&<p className="note">{params.grup?'Acest grup nu mai este exclus temporar. Consultă paginile contractelor pentru starea actuală.':'Această instituție nu mai are grupuri excluse temporar.'}</p>}
  {data.groups.map(g=><Group key={g.id} group={g} single={!!params.grup} titled={!institution||!!params.grup}/>)}
  {institution&&!params.grup&&data.pages>1&&<nav className="record-pager" aria-label="Paginarea grupurilor excluse">
    {data.page>1&&<Link href={pageHref(data.page-1)}>← Anterior</Link>}
    <span>Pagina {formatInt(data.page)} din {formatInt(data.pages)}</span>
    {data.page<data.pages&&<Link href={pageHref(data.page+1)}>Următor →</Link>}
  </nav>}
 </>;
}

/** One group: its notice, its reasons and, folded (open when it is the one asked for), its publications. */
function Group({group:g,single,titled}:{group:ExclusionGroup;single:boolean;titled:boolean}){
 const notice=g.members[0]?.noticeNo??'Anunț neidentificat';
 return <section className="section">
  {titled?<h2>{g.authorityId?<Link prefetch={false} href={`/entitati/${g.authorityId}`}>{g.authority??'Instituție'}</Link>:g.authority??'Instituție neidentificată'}</h2>
   :<h3 className="excl-notice">{notice}</h3>}
  <p>{titled&&<><b>{notice}</b> · </>}{countWords(g.members.length,'publicație comparată','publicații comparate')} · reverificat la {coverageDate(g.reviewedAt)}</p>
  <ul className="prose">{g.reasons.map(reason=><li key={reason}>{EXCLUSION_REASONS[reason]??'Diferență între surse care necesită verificare.'}</li>)}</ul>
  {/* Reached from a contract's „Motivul”, the publications are open at once (Z7-37). */}
  <details className="data-context" open={single||undefined}>
   <summary>Verifică publicațiile și valorile sursă ({g.members.length})</summary>
   {/* On a phone each publication is a card (rank-stack): nothing scrolls sideways. */}
   <div className="ask-tablewrap rank-stack excl-stack" role="region" aria-label={`Sursele pentru ${g.members[0]?.noticeNo??'acest grup'}`}>
    <table className="rank"><thead><tr><th scope="col">Contract / publicație</th><th scope="col">Data contractului</th><th scope="col" className="num">Valoarea sursă (lei)</th><th scope="col">Sursa oficială</th></tr></thead>
     <tbody>{g.members.map(m=><tr key={m.id}>
      <td><Link prefetch={false} href={`/contracte/${m.publicId}`}>{m.title??'Contract fără titlu'}</Link><div className="note">Nr. {m.number??'necunoscut'} · ID {m.publicId}</div></td>
      <td data-label="Data contractului">{coverageDate(m.date)}</td><td className="num" data-label="Valoarea sursă (lei)">{formatExactDecimal(m.value)}</td>
      <td data-label="Sursa oficială"><a href={`https://www.e-licitatie.ro/pub/notices/ca-notices/view-c/${m.noticeId}`} target="_blank" rel="noopener noreferrer">Vezi în SEAP <span aria-hidden="true">↗</span></a></td>
     </tr>)}</tbody>
    </table>
   </div>
   <p className="note">Valorile sunt reproduse pentru verificare; nu le însumăm ca achiziții distincte.</p>
  </details>
 </section>;
}
