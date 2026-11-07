'use client';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import type {CollectionStatus} from '@/lib/admin/collection';
import {STREAM_LABELS, type CollectionState, fmt, time, wait, when} from './model';

export type Change = (body: Record<string, unknown>, done?: string) => Promise<boolean>;

const SERVICES: Record<string, string> = {documents: 'Documente', processor: 'Procesare', scheduler: 'Programare', ingestion: 'Colectare'};

/** The collector's state, its next request and the one action that stops or resumes it (DESIGN.md, admin). */
export default function LiveBand({data, state, stale, saving, change, now}: {
  data: CollectionStatus; state: CollectionState; stale: boolean; saving: boolean; change: Change; now: number;
}) {
  const c = data.control!, s = state;
  const [open, setOpen] = useState(false), [ack, setAck] = useState(false);
  const panel = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (open) panel.current?.focus(); }, [open]);
  useEffect(() => { if (!s.blocked) { setOpen(false); setAck(false); } }, [s.blocked]);
  const running = data.requests.filter(r => r.outcome === 'running');
  const services = [...new Set(data.workers.filter(w => w.alive).map(w => SERVICES[w.kind] ?? w.kind))];
  const proxies = data.proxies.settings;
  const retrySpan = s.retry ? (Number(s.retry.timeouts) === 1 ? 300 : 600) : c.max_seconds;
  const until = c.blocked_until ? new Date(String(c.blocked_until)).getTime() : 0;
  const left = Math.max(0, Math.ceil((until - now) / 60000));
  const failure = data.failures[0];
  const label = s.blocked ? 'Verifică și reia' : s.paused ? 'Reia colectarea' : 'Pune pe pauză';
  return <>
    <section className="live-band" id="collection" data-state={s.tone} aria-labelledby="state-title">
      <div className="live-copy">
        <div className="state-line"><span className="live-dot" aria-hidden="true"/><h2 id="state-title">{s.title}</h2></div>
        <span className="sr-only" role="status">{`Colectare: ${s.short}`}</span>
        {s.description && <p>{s.description}</p>}
        <p className="current-task">
          <span>{running.length ? 'În curs' : 'Servicii active'}</span>
          <strong>{running.length ? running.map(r => `${STREAM_LABELS[r.stream] ?? r.stream} · ${r.proxy_id ?? 'direct'}`).join(' / ') : services.length ? services.join(', ') : 'niciunul în ultimele 30 de secunde'}</strong>
        </p>
      </div>
      <div className="next-request">
        <span>{stale ? 'Stare necunoscută' : s.running ? (s.retry ? 'Reîncercarea, cel mai devreme în' : 'Următoarea cerere în') : 'Cereri noi'}</span>
        <strong>{s.running ? (s.active ? 'În curs' : s.next > 0 ? wait(s.next) : s.retry ? 'Se pregătește' : 'Acum') : stale ? '—' : 'Oprite'}</strong>
        <div className="countdown-track" aria-hidden="true"><div style={{transform: `scaleX(${s.running ? Math.min(1, s.next / retrySpan) : 0})`}}/></div>
        {s.running && <small>{s.retry ? `Pauză după timeout: ${Number(s.retry.timeouts) === 1 ? 5 : 10} min` : proxies.enabled ? `${data.proxies.endpoints.filter(p => p.enabled).length} proxy-uri · plafon ${proxies.requests_per_minute}/min` : `Interval ${c.min_seconds}–${c.max_seconds} s`}</small>}
      </div>
      <div className="live-actions">
        <button id="pause" className="button band-button" disabled={stale || saving || (s.maintenance && !s.rawOnly)}
          aria-expanded={s.blocked ? open : undefined} aria-controls={s.blocked ? 'unblock' : undefined}
          onClick={() => s.blocked ? setOpen(!open) : void change({action: 'pause', paused: !s.paused, revision: c.revision}, s.paused ? 'Colectarea a fost reluată.' : 'Colectarea e pe pauză. Cererile deja pornite se încheie.')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={s.paused || s.blocked ? 'm8 5 11 7-11 7Z' : 'M8 5v14M16 5v14'}/></svg><span>{label}</span>
        </button>
        {!s.paused && !s.blocked && <small>Oprește date și fișiere; progresul rămâne.</small>}
      </div>
    </section>
    {s.blocked && open && <section className="unblock" id="unblock" aria-labelledby="unblock-title">
      <h3 id="unblock-title" ref={panel} tabIndex={-1}>Înainte de reluare</h3>
      <ol>
        <li><strong>Verifică răspunsul SEAP.</strong> {failure
          ? <><a href={`/api/admin/collection?request=${failure.id}`}>Descarcă diagnosticul cererii de la {when(failure.started_at)}</a> · <Link href="/admin/trafic/jurnal">Deschide jurnalul</Link></>
          : <Link href="/admin/trafic/jurnal">Deschide jurnalul</Link>}</li>
        <li><strong>Așteaptă termenul.</strong> {until > now ? `Poți relua după ${time(c.blocked_until)} (încă ${left} min).` : 'Termenul a trecut.'}</li>
        <li><label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}/>Am verificat cauza opririi. Pot relua cererile.</label></li>
      </ol>
      <button className="button primary" disabled={!ack || saving || stale || until > now}
        onClick={() => void change({action: 'unblock', acknowledged: true, revision: c.revision}, 'Reluare confirmată. Cererile pornesc pe rând.')}>Reia colectarea</button>
      {until > now && <p className="hint">Butonul se activează după {time(c.blocked_until)}.</p>}
      {until <= now && !ack && <p className="hint">Bifează verificarea ca să activezi butonul.</p>}
    </section>}
    {!!data.proxyRetries?.length && <p className="admin-notice">{fmt(data.proxyRetries.length)} {data.proxyRetries.length === 1 ? 'cerere așteaptă' : 'cereri așteaptă'} reîncercarea, de la {time(data.proxyRetries[0]!.retry_at)}; celelalte proxy-uri continuă. <Link href="/admin/trafic/conexiune">Vezi conexiunea</Link></p>}
  </>;
}
