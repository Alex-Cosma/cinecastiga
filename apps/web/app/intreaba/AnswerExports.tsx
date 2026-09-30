'use client';
import {useEffect,useRef,useState} from 'react';
import type {AskSpec} from '@/lib/ask/spec';
import type {BlockData} from '@/lib/ask/compile';
import {requestSourceCsv,downloadSourceCsv} from '@/lib/ask/source-csv';
import DiscoveryIcon from '../DiscoveryIcon';

export default function AnswerExports({spec,data,disabled,onResult}:{spec:AskSpec;data:BlockData;disabled:boolean;onResult:()=>void}){
 const controller=useRef<AbortController|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(disabled){controller.current?.abort();setBusy(false);setMessage('');}},[disabled]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function sources(){
  controller.current?.abort();const request=new AbortController();controller.current=request;setBusy(true);setMessage('');
  try{const file=await requestSourceCsv({spec},request.signal);if(request.signal.aborted)return;downloadSourceCsv(file);setMessage(file.message);}
  catch(e){if(!request.signal.aborted)setMessage(e instanceof Error?e.message:'Exportul nu a putut fi generat.');}
  finally{if(!request.signal.aborted)setBusy(false);}
 }
 return <details className="cq-export">
  <summary><DiscoveryIcon name="download"/>Exportă<DiscoveryIcon name="chevronDown"/></summary>
  <div className="cq-export-options">
   <div><button type="button" disabled={disabled||busy} onClick={onResult}>Rezultatul afișat · CSV</button><p>{data.block==='fact_check'?'Doar exemplele afișate în rezultat.':data.block==='table'?'Doar rândurile clasamentului afișate acum.':'Valorile din vizualizarea afișată.'} Pentru datele individuale, alege înregistrările sursă.</p></div>
   <div><button type="button" disabled={disabled||busy} onClick={()=>void sources()}>{busy?'Se pregătește exportul…':'Înregistrările sursă · CSV'}</button><p>Selecția completă din spatele răspunsului, cu sume exacte și linkuri oficiale. Maximum 100.000 de rânduri într-un fișier; un export parțial este indicat explicit.</p></div>
  </div>
  {message&&<p className="cq-export-status" role="status">{message}</p>}
 </details>;
}
