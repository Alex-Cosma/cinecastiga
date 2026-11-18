'use client';
import {useEffect,useRef,useState} from 'react';
import type {AskSpec} from '@/lib/ask/spec';
import {requestSourceCsv,downloadSourceCsv,sourceRefusal} from '@/lib/ask/source-csv';
import DiscoveryIcon from '../DiscoveryIcon';

/** `months`: a trend's executed months, sent with its sources' CSV; `onStale`: the data moved them since (409), the caller reloads the answer (false: it is already that reload, the line says so). */
export default function AnswerExports({spec,disabled,onResult,months,onStale}:{spec:AskSpec;disabled:boolean;onResult:()=>void;months?:readonly [number,number]|undefined;onStale?:(()=>boolean)|undefined}){
 const controller=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 // In the answer's head (UX audit Z3-15) the menu floats over the answer: a press outside or Escape closes it.
 const box=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const outside=(event:PointerEvent)=>{const node=box.current;if(node?.open&&!node.contains(event.target as Node))node.open=false;};
  const escape=(event:KeyboardEvent)=>{const node=box.current;if(event.key==='Escape'&&node?.open&&node.contains(document.activeElement)){node.open=false;node.querySelector('summary')?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[]);
 useEffect(()=>{if(disabled){controller.current?.abort();setBusy(false);setMessage('');}},[disabled]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function sources(){
  controller.current?.abort();const request=new AbortController();controller.current=request;setBusy(true);setMessage('');
  try{const file=await requestSourceCsv({spec,...(months?{months}:{})},request.signal);if(request.signal.aborted)return;downloadSourceCsv(file);setMessage(file.message);}
  catch(e){if(request.signal.aborted)return;const refusal=sourceRefusal(e,onStale,'Exportul nu a putut fi generat.');if(refusal!==null)setMessage(refusal);}
  finally{if(!request.signal.aborted)setBusy(false);}
 }
 // Esențial (lib/view-mode.ts): export is Complet's (owner, 18 November 2026).
 return <details ref={box} className="cq-export" data-only="complet">
  <summary><DiscoveryIcon name="download"/>Exportă<DiscoveryIcon name="chevronDown"/></summary>
  <div className="cq-export-options">
   <div><button type="button" disabled={disabled||busy} onClick={onResult}>Rezultatul afișat · CSV</button><p>Doar ce vezi acum.</p></div>
   <div><button type="button" disabled={disabled||busy} onClick={()=>void sources()}>{busy?'Se pregătește exportul…':'Înregistrările sursă · CSV'}</button><p>Toată selecția, cu sume exacte și linkuri oficiale. Max. 100.000 de rânduri.</p></div>
  </div>
  {message&&<p className="cq-export-status" role="status">{message}</p>}
 </details>;
}
