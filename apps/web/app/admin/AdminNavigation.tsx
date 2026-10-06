'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useRef} from 'react';
import type {CollectionStatus} from '@/lib/admin/collection';
export const adminSections=[['/admin','Colectare'],['/admin/conexiune','Conexiune SEAP'],['/admin/procesare','Procesare'],['/admin/fisiere','Fișiere'],['/admin/jurnal','Jurnal'],['/admin/feedback','Feedback'],['/admin/conturi','Conturi']] as const;
const sectionIcons:Record<(typeof adminSections)[number][0],string>={
 '/admin':'M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4',
 '/admin/conexiune':'M8 7h8M8 17h8M7 8v8m10-8v8M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
 '/admin/procesare':'m9 5 10 7-10 7V5ZM4 5v14',
 '/admin/fisiere':'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 13h8M8 17h6',
 '/admin/jurnal':'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
 '/admin/feedback':'M21 4H3v13h5v4l5-4h8V4ZM7 8h10M7 12h7',
 '/admin/conturi':'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm7 .13a4 4 0 0 1 0 7.75',
};
export default function AdminNavigation({data,stale,dirty,proxyDirty=false}:{data:CollectionStatus|null;stale:boolean;dirty:boolean;proxyDirty?:boolean}){
 const path=usePathname(),nav=useRef<HTMLElement>(null),previous=useRef(path),c=data?.control;
 useEffect(()=>{nav.current?.querySelector('[aria-current]')?.scrollIntoView({block:'nearest',inline:'nearest'});if(previous.current!==path){previous.current=path;document.getElementById('admin-content')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}},[path]);
 useEffect(()=>{const header=document.querySelector('.site-header'),root=nav.current?.closest<HTMLElement>('.collection-admin');if(!header||!root)return;const measure=()=>root.style.setProperty('--admin-header-offset',`${header.getBoundingClientRect().height}px`);measure();const observer=new ResizeObserver(measure);observer.observe(header);return()=>observer.disconnect();},[]);
 const active=data?.workers.some(w=>w.alive&&w.kind==='ingestion');
 const collection=stale?'status neactualizat':!c?'se încarcă':c.maintenance?'mentenanță':c.blocked_reason?'oprită la eroare':c.paused?'oprită manual':c.daily_limit!==null&&Number(data?.today.attempts)>=c.daily_limit?'limită zilnică':data?.quietWindow.active?'pauză programată':data?.timeoutRetry?'reîncercare programată':!active?'fără semnal recent':'activă';
 const forecast=data?.forecast,summary=stale?'status neactualizat':!forecast?'în evaluare':forecast.state==='complete'?'lot încheiat':forecast.state==='gaps'?`${forecast.percent===null?'':`≈ ${forecast.percent}% · `}goluri de recuperat`:forecast.percent===null?'în evaluare':`≈ ${forecast.percent}%${collection==='activă'&&forecast.daysLow!==null?` · ${forecast.daysLow}–${forecast.daysHigh} zile în lot`:''}`;
 const scheduled=data?.processing.schedule.next_at;
 return <><div className="page-heading"><div><h1>Totul, sub observație.</h1><p>Colectare, publicare și acces. Un singur loc pentru administrare.</p></div><span className={`connection ${stale?'stale':''}`}><i/>{stale?'Status neactualizat':c?`Actualizat la ${new Date(c.server_now).toLocaleTimeString('ro-RO',{timeZone:'Europe/Bucharest'})}`:'Se citește statusul…'}</span></div>
 <div className="admin-navigation"><div className="admin-system-strip" aria-label="Rezumatul sistemului"><Link href="/admin" scroll={false}>Colectare <b>{collection}</b></Link><Link href="/admin/procesare" scroll={false}>Procesare <b>{stale?'status neactualizat':c?.maintenance?'mentenanță':!c?'se încarcă':!c.processing_enabled?'program oprit':!data?.processing.schedulerAlive?'fără semnal recent':scheduled?new Date(scheduled).toLocaleString('ro-RO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'}):'neprogramată'}</b></Link><Link href="/admin/fisiere" scroll={false}>Fișiere <b>{stale?'status neactualizat':data?`${data.documents.awaiting_download} de descărcat`:'se încarcă'}</b></Link><Link className="admin-overall-link" href="/admin" scroll={false}>Recuperare <b>{summary}</b></Link></div>
 <nav ref={nav} className="section-nav" aria-label="Administrare">{adminSections.map(([href,label])=><Link key={href} href={href} scroll={false} aria-current={path===href?'page':undefined}><svg className="admin-tab-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={sectionIcons[href]}/></svg><span>{label}</span>{href==='/admin/fisiere'&&data&&Number(data.documents.awaiting_download)>0&&<span className="admin-nav-count">{data.documents.awaiting_download}</span>}</Link>)}</nav></div>
 {dirty&&path!=='/admin'&&path!=='/admin/procesare'&&<p className="policy-note">Ai setări nesalvate. Se păstrează când schimbi secțiunea. <Link href="/admin">Revino la setări</Link></p>}
 {proxyDirty&&path!=='/admin/conexiune'&&<p className="policy-note">Ai setări de conexiune nesalvate. <Link href="/admin/conexiune" scroll={false}>Revino la Conexiune SEAP</Link></p>}
 {data&&(c?.blocked_reason||data.timeoutRetry)&&path!=='/admin'&&<p className="status-notice" role="status">{c?.blocked_reason?'Colectarea s-a oprit la o eroare.':'O cerere a expirat. Colectarea așteaptă reîncercarea programată.'} <Link href="/admin">Vezi starea colectării</Link> · <Link href="/admin/jurnal">Deschide jurnalul</Link></p>}</>;
}
