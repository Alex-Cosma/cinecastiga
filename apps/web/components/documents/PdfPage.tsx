'use client';
import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';

/** One controlled PDF page: the PDF and OCR share the parent's page number. */
export default function PdfPage({url,page,filename}:{url:string;page:number;filename:string}){
 const viewport=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[width,setWidth]=useState(0),[zoom,setZoom]=useState(1);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const element=viewport.current;if(!element)return;
  const observer=new ResizeObserver(([entry])=>{if(entry)setWidth(Math.floor(entry.contentRect.width));});
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{let disposed=false;let task:ReturnType<typeof import('pdfjs-dist').getDocument>|undefined;
  setPdf(null);setError('');setLoading(true);
  void import('pdfjs-dist').then(async lib=>{
   if(disposed)return;const assets=`/pdfjs/${lib.version}/`;
   lib.GlobalWorkerOptions.workerSrc=assets+'pdf.worker.min.mjs';
   task=lib.getDocument({url,cMapUrl:assets+'cmaps/',cMapPacked:true,standardFontDataUrl:assets+'standard_fonts/',wasmUrl:assets+'wasm/',iccUrl:assets+'iccs/'});
   const loaded=await task.promise;if(!disposed)setPdf(loaded);
  }).catch(()=>{if(!disposed){setError('Nu am putut încărca PDF-ul. Reîncearcă sau deschide originalul în alt tab.');setLoading(false);}});
  return()=>{disposed=true;if(task)void task.destroy().catch(()=>{});};
 },[url,retry]);
 useEffect(()=>{if(!pdf||!width||!canvas.current)return;
  let disposed=false;let rendering:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
  const element=canvas.current;setLoading(true);setError('');
  void pdf.getPage(page).then(async source=>{
   if(disposed)return;
   const natural=source.getViewport({scale:1}),scale=(width-2)/natural.width*zoom,view=source.getViewport({scale});
   const density=Math.min(window.devicePixelRatio||1,2);
   element.width=Math.ceil(view.width*density);element.height=Math.ceil(view.height*density);
   element.style.width=`${view.width}px`;element.style.height=`${view.height}px`;
   rendering=source.render({canvas:element,viewport:view,transform:density===1?undefined:[density,0,0,density,0,0]});
   await rendering.promise;if(!disposed)setLoading(false);
  }).catch(()=>{if(!disposed){setError('Pagina nu a putut fi afișată. Reîncearcă sau consultă PDF-ul în alt tab.');setLoading(false);}});
  return()=>{disposed=true;rendering?.cancel();};
 },[pdf,page,width,zoom]);
 return <div className="df-pdf">
  <div className="df-pdf-heading"><h4>Original · pagina {page}</h4><label>Mărire<select value={zoom} onChange={event=>setZoom(Number(event.target.value))}><option value={1}>Încadrează</option><option value={1.25}>125%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label></div>
  <div className="df-pdf-viewport" ref={viewport} aria-busy={loading} tabIndex={0} aria-label={`Originalul ${filename}, pagina ${page}`}>
   {loading&&<p className="df-pdf-message" role="status">Se încarcă pagina {page}…</p>}
   {error&&<div className="df-pdf-message" role="alert"><p>{error}</p><button className="df-button" onClick={()=>setRetry(n=>n+1)}>Reîncearcă afișarea</button></div>}
   <canvas key={`${page}:${zoom}:${retry}`} ref={canvas} role="img" aria-label={`Pagina ${page} din ${filename}; textul extras este alături.`} style={{visibility:loading||error?'hidden':'visible'}}/>
  </div>
 </div>;
}
