'use client';
import {useCallback,useEffect,useState} from 'react';
import {heldValueReason} from '@/lib/contract-value-words';
import type {ContractValueReviewList,ReviewedContract,ValueDecision} from '@/lib/contract-value-admin';

const lei=(value:string)=>{const v=Number(value);return v>=1e9?`${(v/1e9).toLocaleString('ro-RO',{maximumFractionDigits:2})} mld. lei`:`${Math.round(v/1e6).toLocaleString('ro-RO')} mil. lei`;};
const day=(s:string|null)=>s?s.split('-').reverse().join('.'):'dată necunoscută';
const FAILED='Lista contractelor nu poate fi citită acum.';

/**
 * Procesare → „Contracte peste 1 mld. lei” (owner, 19 November 2026; migration 0113). Above 1 mld. lei a contract is
 * counted unless its own notice contradicts the value; here an administrator takes one out („Scoate din totaluri”),
 * lets in one the check holds („Include în totaluri”), or returns it to the automatic rule. Every decision needs its
 * reason and takes effect at the next processing run: until then the row says „se aplică la următoarea procesare”.
 */
export default function ContractValueReview({enabled}:{enabled:boolean}){
 const [data,setData]=useState<ContractValueReviewList|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<{natId:string;decision:ValueDecision}|null>(null),[reason,setReason]=useState(''),[all,setAll]=useState(false);
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
   setEditing(null);setReason('');await load();
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
 return <details className="processing-decisions" open={(data?.waiting??0)>0||!!error}>
  <summary>Contracte peste 1 mld. lei · {data?`${data.counted} în totaluri, ${data.held} ținute afară${data.waiting?`, ${data.waiting} de văzut`:''}`:'…'}</summary>
  <p>Un contract de peste 1 mld. lei intră în totaluri dacă anunțul lui nu-i contrazice valoarea. O decizie de aici se aplică la următoarea procesare.</p>
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
      {r.decision!=='include'&&(!r.admitted||r.decision==='exclude')&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing({natId:r.natId,decision:'include'});setReason('');}}>Include în totaluri</button>}{' '}
      {r.decision!==null&&<button type="button" className="text-button" disabled={busy} onClick={()=>void decide(r.natId,'clear','')}>Revino la regula automată</button>}
     </p>}
  </li>)}</ol>}
  {rows.length>shown.length&&<p><button type="button" className="text-button" onClick={()=>setAll(true)}>Arată toate cele {rows.length}</button></p>}
  {all&&rows.some(r=>!attention(r))&&<p><button type="button" className="text-button" onClick={()=>setAll(false)}>Arată doar ce e de văzut</button></p>}
 </details>;
}
