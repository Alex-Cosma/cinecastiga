import Link from 'next/link';
import {notFound} from 'next/navigation';
import {documentDb} from '@/lib/documents/store';
import {daUrl} from '@/lib/elicitatie';
import {formatRonFull,cleanName} from '@/lib/format';
import ClipButton from '@/components/ClipButton';
export const dynamic='force-dynamic';
export default async function Acquisition({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[1-9]\d{0,17}$/.test(id))notFound();
 const [d]=await documentDb()`select d.*,r.payload->>'directAcquisitionName' title,a.name_display authority,s.name_display supplier from core.direct_acquisitions d left join raw.raw_documents r on r.id=d.raw_id left join core.entities a on a.id=d.authority_entity_id left join core.entities s on s.id=d.supplier_entity_id where d.sicap_da_id=${id}`;
 if(!d)notFound();
 return <><header className="profile-head"><h1>{d.title??d.da_code??'Achiziție directă'}</h1><p>{d.da_code} · {d.state}</p><ClipButton kind="da" refId={id} label={d.title??d.da_code}/></header><section className="section"><h2>Instituție și furnizor</h2><p>{d.authority_entity_id?<Link href={`/entitati/${d.authority_entity_id}`}>{cleanName(d.authority)}</Link>:d.authority??'Instituție neprecizată'} → {d.supplier_entity_id?<Link href={`/entitati/${d.supplier_entity_id}`}>{cleanName(d.supplier)}</Link>:d.supplier??'Furnizor neprecizat'}</p><p>Valoare înregistrată: <strong>{d.closing_value!=null?formatRonFull(d.closing_value):'necunoscută'}</strong>. Nu reprezintă o plată verificată.</p><a href={daUrl(id)} target="_blank" rel="noopener noreferrer">Verifică achiziția în SEAP ↗</a></section><section className="section"><h2>Fișiere</h2><p>Preluarea fișierelor pentru achiziții directe nu este încă disponibilă. Consultă înregistrarea oficială pentru documentele publicate.</p></section></>;
}
