'use client';
import {useEffect,useRef} from 'react';
import {cancelNavPending} from '@/components/ghost/client';
/**
 * Leaving Oameni with something typed in an account form (a new account, a new password) asks first. The drafts stay
 * in the DOM only, never in browser storage; the check reads the forms' fields when the admin leaves, so a cancelled
 * or submitted form, or a funnel's search box (drawn outside, over the page), never counts.
 */
export default function AccountDraftGuard({children}:{children:React.ReactNode}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const dirty=()=>[...(root.current?.querySelectorAll<HTMLInputElement>('form input:not([type=hidden])')??[])].some(i=>i.value!==i.defaultValue);
  const unload=(e:BeforeUnloadEvent)=>{if(dirty()){e.preventDefault();e.returnValue='';}};
  const leave=(e:MouseEvent)=>{const a=(e.target as Element).closest('a');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||a.target==='_blank'||a.getAttribute('href')?.startsWith('#')||!dirty())return;if(!confirm('Ai date nesalvate într-un formular de cont. Părăsești pagina?')){e.preventDefault();e.stopPropagation();cancelNavPending();}};
  window.addEventListener('beforeunload',unload);document.addEventListener('click',leave,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',leave,true);};
 },[]);
 return <div ref={root}>{children}</div>;
}
