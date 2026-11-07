'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect, useRef} from 'react';
import type {CollectionStatus} from '@/lib/admin/collection';
import {ADMIN_TABS, TITLES, TRAFFIC_VIEWS, seconds, tabOf, viewOf} from './model';

export interface Drafts {pace: boolean; schedule: boolean; proxy: boolean}

/**
 * The administration's tabs (sticky), the page's own title and the notices that follow the admin across pages:
 * unsaved drafts of another page and a collection stopped by an error.
 */
export default function AdminNavigation({data, stale, drafts}: {data: CollectionStatus | null; stale: boolean; drafts: Drafts}) {
  const path = usePathname(), view = viewOf(path), tab = tabOf(view);
  const nav = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), previous = useRef(path);
  const c = data?.control;
  useEffect(() => {
    nav.current?.querySelector('[aria-current]')?.scrollIntoView({block: 'nearest', inline: 'nearest'});
    if (previous.current !== path) {
      previous.current = path;
      heading.current?.focus({preventScroll: true});
      window.scrollTo({top: 0, behavior: 'instant'});
    }
  }, [path]);
  useEffect(() => {
    const header = document.querySelector('.site-header'), root = nav.current?.closest<HTMLElement>('.collection-admin');
    if (!header || !root) return;
    const measure = () => {
      const offset = `${header.getBoundingClientRect().height}px`;
      root.style.setProperty('--admin-header-offset', offset);
      // Focus moved by Tab never lands under the sticky header and tabs.
      document.documentElement.style.scrollPaddingTop = `calc(${offset} + 64px)`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => { observer.disconnect(); document.documentElement.style.scrollPaddingTop = ''; };
  }, []);
  const waiting = Number(data?.documents.awaiting_download ?? 0);
  const traffic = view === 'trafic' || view === 'conexiune' || view === 'jurnal';
  return <>
    <nav ref={nav} className="admin-tabs" aria-label="Administrare">
      {ADMIN_TABS.map(t => <Link key={t.href} href={t.href} scroll={false} aria-current={tab === t.href ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={t.icon}/></svg>
        <span>{t.label}</span>
        {t.href === '/admin/fisiere' && waiting > 0 && <span className="admin-tab-count"><span className="sr-only">, </span>{waiting}<span className="sr-only"> de descărcat</span></span>}
      </Link>)}
    </nav>
    <div className="admin-head">
      <h1 ref={heading} tabIndex={-1}>{TITLES[view]}{traffic && <span className="sr-only"> · {TRAFFIC_VIEWS.find(v => v.href === path)?.label}</span>}</h1>
      {view !== 'fisiere' && view !== 'oameni' && <span className={`connection${stale ? ' stale' : ''}`}><i aria-hidden="true"/>{stale ? 'Status neactualizat' : c ? `Actualizat la ${seconds(c.server_now)}` : 'Se citește statusul…'}</span>}
    </div>
    {traffic && <nav className="admin-subnav" aria-label="Trafic SEAP">
      {TRAFFIC_VIEWS.map(v => <Link key={v.href} href={v.href} scroll={false} aria-current={path === v.href ? 'page' : undefined}>{v.label}</Link>)}
    </nav>}
    {drafts.pace && view !== 'conexiune' && <p className="admin-notice">Limitele de ritm au modificări nesalvate. <Link href="/admin/trafic/conexiune" scroll={false}>Revino la Conexiune</Link></p>}
    {drafts.proxy && view !== 'conexiune' && <p className="admin-notice">Setările proxy-urilor au modificări nesalvate. <Link href="/admin/trafic/conexiune" scroll={false}>Revino la Conexiune</Link></p>}
    {drafts.schedule && view !== 'procesare' && <p className="admin-notice">Programul procesării are modificări nesalvate. <Link href="/admin/procesare" scroll={false}>Revino la Procesare</Link></p>}
    {data && view !== 'acum' && (c?.blocked_reason || data.timeoutRetry) && <p className="admin-notice warn" role="status">
      {c?.blocked_reason ? 'Colectarea s-a oprit la un refuz SEAP.' : 'O cerere a expirat; colectarea așteaptă reîncercarea.'} <Link href="/admin">Vezi starea</Link> · <Link href="/admin/trafic/jurnal">Deschide jurnalul</Link>
    </p>}
  </>;
}
