'use client';
import { createContext,useCallback,useContext,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
type Content={kicker:string;title:string;meta?:string;text?:string;hint?:string};
type Peek=Content&{anchor:HTMLElement};
type Api={show:(anchor:HTMLElement,content:Content)=>void;hide:()=>void;toggle:(anchor:HTMLElement,content:Content)=>void;open:(anchor:HTMLElement)=>boolean;id:string};
const PeekContext=createContext<Api|null>(null);
export const usePeek=()=>useContext(PeekContext);
/** One floating card for source previews and glossary terms. Hover and keyboard focus show it; touch toggles terms. */
export function PeekProvider({children}:{children:ReactNode}){
 const [peek,setPeek]=useState<Peek|null>(null),[pos,setPos]=useState<{left:number;top:number}|null>(null),card=useRef<HTMLDivElement>(null),timer=useRef<number|undefined>(undefined),current=useRef<Peek|null>(null),id=useId();
 current.current=peek;
 const show=useCallback((anchor:HTMLElement,content:Content)=>{clearTimeout(timer.current);setPos(null);setPeek({anchor,...content});},[]);
 const hide=useCallback(()=>{clearTimeout(timer.current);timer.current=window.setTimeout(()=>setPeek(null),90);},[]);
 const open=useCallback((anchor:HTMLElement)=>current.current?.anchor===anchor,[]);
 const toggle=useCallback((anchor:HTMLElement,content:Content)=>{if(current.current?.anchor===anchor)setPeek(null);else show(anchor,content);},[show]);
 useLayoutEffect(()=>{if(!peek||!card.current)return;const r=peek.anchor.getBoundingClientRect(),c=card.current.getBoundingClientRect();
  const left=Math.max(16,Math.min(r.left+r.width/2-c.width/2,innerWidth-16-c.width)),below=r.bottom+8+c.height<=innerHeight-8||r.top<c.height+16;
  setPos({left,top:below?r.bottom+8:r.top-8-c.height});},[peek]);
 useEffect(()=>{if(!peek)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setPeek(null);},down=(e:PointerEvent)=>{if(!peek.anchor.contains(e.target as Node))setPeek(null);},scroll=()=>setPeek(null);
  addEventListener('keydown',key);addEventListener('pointerdown',down);addEventListener('scroll',scroll,{passive:true});
  return()=>{removeEventListener('keydown',key);removeEventListener('pointerdown',down);removeEventListener('scroll',scroll);};},[peek]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 return <PeekContext.Provider value={{show,hide,toggle,open,id}}>{children}
  {peek&&<div ref={card} id={id} role="tooltip" className="peek" style={pos??{left:0,top:0,visibility:'hidden'}} onPointerEnter={()=>clearTimeout(timer.current)} onPointerLeave={hide}>
   <span className="peek-kicker">{peek.kicker}</span><b>{peek.title}</b>{peek.meta&&<span className="peek-meta">{peek.meta}</span>}{peek.text&&<p>{peek.text}</p>}{peek.hint&&<span className="peek-hint">{peek.hint}</span>}
  </div>}
 </PeekContext.Provider>;
}
