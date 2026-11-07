'use client';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import type {CollectionStatus} from '@/lib/admin/collection';
import LiveBand, {type Change} from './LiveBand';
import {STREAM_LABELS, type CollectionState, fmt, recoveryLine, when} from './model';

interface Side {disk: number | null; files: number | null; messages: number | null}

/** Disk use and the feedback count: the two figures of the summary that live outside the collection status. */
function useSide(enabled: boolean): Side {
  const [side, setSide] = useState<Side>({disk: null, files: null, messages: null});
  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    const load = async () => {
      const [queue, feedback] = await Promise.allSettled([
        fetch('/api/admin/collection?documentQueue=1&filter=download&page=1', {cache: 'no-store', signal: ac.signal}).then(r => r.ok ? r.json() : null),
        fetch('/api/admin/feedback?page=1', {cache: 'no-store', signal: ac.signal}).then(r => r.ok ? r.json() : null),
      ]);
      if (ac.signal.aborted) return;
      const q = queue.status === 'fulfilled' ? queue.value : null, f = feedback.status === 'fulfilled' ? feedback.value : null;
      setSide({disk: q?.storage?.disk?.percent ?? null, files: q?.counts?.all ?? null, messages: f?.total ?? null});
    };
    void load();
    const focus = () => void load();
    window.addEventListener('focus', focus);
    return () => { ac.abort(); window.removeEventListener('focus', focus); };
  }, [enabled]);
  return side;
}

interface Item {text: string; href: string; link: string}

/** "Acum" (owner, 7 November 2026): the collector's state and action, today's figures, what needs a look, each area in one line. */
export default function AcumView({data, state, stale, saving, change, now, active}: {
  data: CollectionStatus; state: CollectionState; stale: boolean; saving: boolean; change: Change; now: number; active: boolean;
}) {
  const side = useSide(active);
  const c = data.control!, f = data.forecast, run = data.processing?.runs?.[0], schedule = data.processing?.schedule;
  const verified = data.lastVerified, money = data.moneyQuality;
  // Only what is broken or stopped by a fault; gaps of the recovery and streams paused on purpose are information.
  const check: Item[] = [];
  if (run?.status === 'failed') check.push({text: 'Procesarea s-a oprit la o eroare; mentenanța se păstrează.', href: '/admin/procesare', link: 'Procesare'});
  if (run?.status === 'running' && Date.now() - new Date(String(run.heartbeat_at)).getTime() > 120000) check.push({text: 'Procesarea nu mai trimite semnal.', href: '/admin/procesare', link: 'Procesare'});
  if (money && money.structuralErrors + (money.sourceErrors ?? 0) > 0) check.push({text: 'Publicarea e blocată de erori în valori și monede.', href: '/admin/procesare', link: 'Procesare'});
  const isolated = data.isolated.revokedIdentities.length + data.isolated.quarantinedRecords.length;
  if (isolated) check.push({text: `${fmt(isolated)} ${isolated === 1 ? 'problemă izolată' : 'probleme izolate'} de publicare.`, href: '/admin/procesare', link: 'Procesare'});
  if (data.publication?.status === 'failed' && run?.status !== 'failed') check.push({text: 'Ultima publicare n-a trecut verificările.', href: '/admin/procesare', link: 'Procesare'});
  const stopped = data.proxies.endpoints.filter(p => p.configured && !p.enabled && Number(p.consecutive_failures) >= 3).length;
  if (stopped) check.push({text: `${fmt(stopped)} ${stopped === 1 ? 'proxy oprit' : 'proxy-uri oprite'} după erori.`, href: '/admin/trafic/conexiune', link: 'Conexiune'});
  const ted = data.historical?.ted;
  if (ted?.failedAttempt && (c.paused_streams as string[]).includes('ted')) check.push({text: 'TED s-a oprit după o încercare eșuată.', href: '/admin/trafic/jurnal', link: 'Jurnal'});
  if (side.disk !== null && side.disk >= 85) check.push({text: `Discul e aproape plin: ${side.disk}% ocupat.`, href: '/admin/fisiere', link: 'Fișiere'});

  const paused = (c.paused_streams as string[]).filter(s => s !== 'documents').map(s => STREAM_LABELS[s] ?? s);
  const gaps = f ? [f.failed > 0 ? `${fmt(f.failed)} ${f.failed === 1 ? 'sarcină eșuată' : 'sarcini eșuate'}` : null, f.deferred > 0 ? `${fmt(f.deferred)} detalii nepreluate` : null].filter(Boolean) : [];
  const nextRun = c.processing_enabled ? (schedule?.next_at ? `următoarea ${when(schedule.next_at)}` : 'neprogramată') : 'program oprit';
  return <div className="acum">
    <LiveBand data={data} state={state} stale={stale} saving={saving} change={change} now={now}/>
    <dl className="today" aria-label="Azi">
      <div><dt>Cereri pentru date azi</dt><dd>{fmt(data.dataToday.attempts)}</dd><dd className="sub">{fmt(data.dataToday.succeeded)} reușite · {fmt(data.dataToday.failed)} eșuate</dd></div>
      <div><dt>Înregistrări primite azi</dt><dd>{fmt(data.dataToday.received)}</dd><dd className="sub">pot include versiuni repetate</dd></div>
      <div><dt>Noi în arhivă azi</dt><dd>{fmt(data.raw.archived)}</dd><dd className="sub">după deduplicare</dd></div>
    </dl>
    <section className="acum-section" aria-labelledby="check-title">
      <h2 id="check-title">De verificat</h2>
      {check.length ? <ul className="check-list">{check.map(i => <li key={i.text}><span>{i.text}</span><Link href={i.href}>{i.link}</Link></li>)}</ul>
        : <p className="all-clear"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>Nimic nu cere atenție acum.</p>}
    </section>
    <section className="acum-section" aria-labelledby="brief-title">
      <h2 id="brief-title">Pe scurt</h2>
      <ul className="brief">
        <li><Link href="/admin/trafic"><strong>Trafic SEAP</strong><span>Recuperare {recoveryLine(data)}{gaps.length ? ` · goluri: ${gaps.join(', ')}` : ''}{paused.length ? ` · pe pauză: ${paused.join(', ')}` : ''}</span></Link></li>
        <li><Link href="/admin/procesare"><strong>Procesare</strong><span>{verified ? `Publicare verificată ${when(verified.completed_at)}` : 'Nicio publicare verificată'} · {nextRun}</span></Link></li>
        <li><Link href="/admin/fisiere"><strong>Fișiere</strong><span>{fmt(data.documents.awaiting_download)} de descărcat{side.files !== null ? ` · ${fmt(side.files)} în coadă` : ''}{side.disk !== null ? ` · disc ${side.disk}%` : ''}</span></Link></li>
        <li><Link href="/admin/oameni"><strong>Oameni</strong><span>{side.messages === null ? 'Mesaje și conturi' : `${fmt(side.messages)} ${side.messages === 1 ? 'mesaj' : 'mesaje'} de la vizitatori`}</span></Link></li>
      </ul>
    </section>
  </div>;
}
