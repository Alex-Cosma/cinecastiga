'use client';
import {useCallback,useEffect,useState} from 'react';
import {heldValueReason} from '@/lib/contract-value-words';
import type {ContractValueReviewList,ReviewedContract,ValueDecision} from '@/lib/contract-value-admin';

const lei=(value:string)=>{const v=Number(value);return v>=1e9?`${(v/1e9).toLocaleString('ro-RO',{maximumFractionDigits:2})} mld. lei`:v>=1e6?`${(v/1e6).toLocaleString('ro-RO',{maximumFractionDigits:1})} mil. lei`:`${Math.round(v).toLocaleString('ro-RO')} lei`;};
const day=(s:string|null)=>s?s.split('-').reverse().join('.'):'dată necunoscută';
const FAILED='Lista contractelor nu poate fi citită acum.';

/**
 * Procesare → „Valori de contract verificate” (owner, 19 November 2026; migration 0113). Above 1 mld. lei a contract is
 * counted unless its own notice contradicts the value; here an administrator takes one out („Scoate din totaluri”),
 * lets in one the check holds („Include în totaluri”), or returns it to the automatic rule. Every decision needs its
 * reason and takes effect at the next processing run: until then the row says „se aplică la următoarea procesare”.
 *
 * Owner, 26 November 2026: a contract of any size can be taken out as a probable error of its value, by the number in
 * its address (/contracte/<număr>). On the site it stays listed, marked, and its page shows the reason written here.
 */
export default function ContractValueReview({enabled}:{enabled:boolean}){
 const [data,setData]=useState<ContractValueReviewList|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<{natId:string;decision:ValueDecision}|null>(null),[reason,setReason]=useState(''),[all,setAll]=useState(false);
 const [newId,setNewId]=useState(''),[newReason,setNewReason]=useState('');
 const load=useCallback(async()=>{
  try{
   const response=await fetch('/api/admin/contracts/value-review',{cache:'no-store'});const result=await response.json();
   if(!response.ok)throw new Error(result.error||FAILED);
   setData(result);setError('');
  }catch(e){setError(e instanceof Error&&e.message?e.message:FAILED);}
 },[]);
 useEffect(()=>{if(enabled)void load();},[enabled,load]);
 const decide=async(natId:string,decision:ValueDecision|'clear',why:string)=>{
  setBusy(true);
  try{
   const response=await fetch('/api/admin/contracts/value-review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({natId,decision,reason:why})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||'Decizia nu a fost salvată. Reîncearcă.');
   setEditing(null);setReason('');setNewId('');setNewReason('');await load();
  }catch(e){setError(e instanceof Error&&e.message?e.message:'Decizia nu a fost salvată. Reîncearcă.');}
  finally{setBusy(false);}
 };
 if(!enabled||(!error&&!data))return null;
 const rows=data?.rows??[];
 // What needs a look first: held without a decision, a decision the last run has not applied, a contract new since the first review.
 const attention=(r:ReviewedContract)=>(!r.admitted&&r.decision===null)||r.pending||r.firstSeenAt!==null;
 const shown=all?rows:rows.filter(attention);
 const state=(r:ReviewedContract)=>r.decision==='exclude'?`scos din totaluri${r.decidedBy?` de ${r.decidedBy}`:''}`
  :r.decision==='include'?`inclus în totaluri${r.decidedBy?` de ${r.decidedBy}`:''}`
  :r.admitted?'în totaluri, din oficiu':`ținut afară: ${heldValueReason(r)}`;
 // „Include” has a meaning only where the last review holds the contract; a contract taken out since can be returned.
 const canInclude=(r:ReviewedContract)=>r.reviewed&&Number(r.valueRon)>1e9&&r.decision!=='include'&&(!r.admitted||r.decision==='exclude');
 return <details className="processing-decisions" open={(data?.waiting??0)>0||!!error}>
  <summary>Valori de contract verificate · {data?`${data.counted} peste 1 mld. lei în totaluri, ${data.held} ținute afară${data.waiting?`, ${data.waiting} de văzut`:''}`:'…'}</summary>
  <p>Un contract de peste 1 mld. lei intră în totaluri dacă anunțul lui nu-i contrazice valoarea. Orice contract poate fi scos ca eroare probabilă: rămâne în liste, marcat, iar pagina lui arată motivul scris aici. O decizie se aplică la următoarea procesare.</p>
  <form className="value-review-add" onSubmit={e=>{e.preventDefault();void decide(newId.trim(),'exclude',newReason);}}>
   <label>Scoate un contract: numărul din adresa lui <input value={newId} onChange={e=>setNewId(e.target.value)} inputMode="numeric" pattern="\d{1,18}" placeholder="/contracte/…" required/></label>{' '}
   <label>Motivul, afișat pe pagina contractului <input value={newReason} onChange={e=>setNewReason(e.target.value)} maxLength={300} placeholder="Estimarea procedurii: … lei. Valoarea din SEAP e de … ori mai mare." required/></label>{' '}
   <button type="submit" className="text-button" disabled={busy||!/^\d{1,18}$/.test(newId.trim())||!newReason.trim()}>Scoate din totaluri</button>
  </form>
  {error&&<p role="alert">{error} <button type="button" className="text-button" onClick={()=>void load()}>Reîncearcă</button></p>}
  {data&&rows.length===0&&<p>Lista se completează la prima procesare de după actualizare.</p>}
  {shown.length>0&&<ol>{shown.map(r=><li key={r.natId}>
   <strong><a href={`/contracte/${r.natId}`} target="_blank" rel="noopener noreferrer">{r.title||`Contract ${r.natId}`}</a></strong>
   <p>{lei(r.valueRon)} · {r.authority||'autoritate necunoscută'} · semnat {day(r.contractDate)}{r.nWinners>1?` · ${r.nWinners} câștigători`:''}{r.firstSeenAt?' · nou':''}</p>
   <p>{state(r)}{r.reason?` („${r.reason}”)`:''}{r.pending?' · se aplică la următoarea procesare':''}{r.decision!==null&&r.guard?` · verificarea automată: ${heldValueReason({guard:r.guard,decision:null})}`:''}</p>
   {editing?.natId===r.natId
    ?<form onSubmit={e=>{e.preventDefault();void decide(r.natId,editing.decision,reason);}}>
      <label>De ce {editing.decision==='exclude'?'îl scoți':'îl incluzi'}? <input value={reason} onChange={e=>setReason(e.target.value)} maxLength={300} required autoFocus/></label>{' '}
      <button type="submit" className="text-button" disabled={busy||!reason.trim()}>Confirmă</button>{' '}
      <button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing(null);setReason('');}}>Renunță</button>
     </form>
    :<p>
      {r.decision!=='exclude'&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing({natId:r.natId,decision:'exclude'});setReason('');}}>Scoate din totaluri</button>}{' '}
      {canInclude(r)&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing({natId:r.natId,decision:'include'});setReason('');}}>Include în totaluri</button>}{' '}
      {r.decision!==null&&<button type="button" className="text-button" disabled={busy} onClick={()=>void decide(r.natId,'clear','')}>{Number(r.valueRon)>1e9?'Revino la regula automată':'Anulează decizia'}</button>}
     </p>}
  </li>)}</ol>}
  {rows.length>shown.length&&<p><button type="button" className="text-button" onClick={()=>setAll(true)}>Arată toate cele {rows.length}</button></p>}
  {all&&rows.some(r=>!attention(r))&&<p><button type="button" className="text-button" onClick={()=>setAll(false)}>Arată doar ce e de văzut</button></p>}
 </details>;
}
