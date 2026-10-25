'use client';
import {useEffect,useRef,useState} from 'react';
import type {AskSpec} from '@/lib/ask/spec';
import {answerOutdated,requestSourceCsv,downloadSourceCsv} from '@/lib/ask/source-csv';
import DiscoveryIcon from '../DiscoveryIcon';

/** `months`: a trend's executed months, sent with its sources' CSV; `onStale`: the data moved them since (409), the caller reloads the answer. */
export default function AnswerExports({spec,disabled,onResult,months,onStale}:{spec:AskSpec;disabled:boolean;onResult:()=>void;months?:readonly [number,number]|undefined;onStale?:(()=>void)|undefined}){
 const controller=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(disabled){controller.current?.abort();setBusy(false);setMessage('');}},[disabled]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function sources(){
  controller.current?.abort();const request=new AbortController();controller.current=request;setBusy(true);setMessage('');
  try{const file=await requestSourceCsv({spec,...(months?{months}:{})},request.signal);if(request.signal.aborted)return;downloadSourceCsv(file);setMessage(file.message);}
  catch(e){if(request.signal.aborted)return;if(answerOutdated(e)&&onStale){onStale();return;}setMessage(e instanceof Error?e.message:'Exportul nu a putut fi generat.');}
  finally{if(!request.signal.aborted)setBusy(false);}
 }
 return <details className="cq-export">
  <summary><DiscoveryIcon name="download"/>Exportă<DiscoveryIcon name="chevronDown"/></summary>
  <div className="cq-export-options">
   <div><button type="button" disabled={disabled||busy} onClick={onResult}>Rezultatul afișat · CSV</button><p>Doar ce vezi acum.</p></div>
   <div><button type="button" disabled={disabled||busy} onClick={()=>void sources()}>{busy?'Se pregătește exportul…':'Înregistrările sursă · CSV'}</button><p>Toată selecția, cu sume exacte și linkuri oficiale. Max. 100.000 de rânduri.</p></div>
  </div>
  {message&&<p className="cq-export-status" role="status">{message}</p>}
 </details>;
}
