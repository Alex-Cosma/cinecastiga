'use client';
import {useEffect,useRef} from 'react';
/** Password drafts stay in DOM only; never store them in browser storage. */
export default function AccountDraftGuard({children}:{children:React.ReactNode}){
 const root=useRef<HTMLDivElement>(null),dirty=useRef(false);
 useEffect(()=>{
  const unload=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue='';}};
  const leave=(e:MouseEvent)=>{const a=(e.target as HTMLElement).closest('a');if(!dirty.current||!a||e.ctrlKey||e.metaKey||a.target==='_blank'||a.getAttribute('href')?.startsWith('#'))return;if(!confirm('Ai modificări nesalvate în formularul de cont. Vrei să părăsești pagina?')){e.preventDefault();e.stopPropagation();}else dirty.current=false;};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',leave,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',leave,true);};
 },[]);
 return <div ref={root} onInput={()=>{dirty.current=true;}} onSubmit={()=>{dirty.current=false;}}>{children}</div>;
}
