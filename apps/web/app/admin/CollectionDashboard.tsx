'use client';
import {usePathname} from 'next/navigation';
import {useCallback, useEffect, useRef, useState} from 'react';
import type {CollectionStatus} from '@/lib/admin/collection';
import {Ghost, G} from '@/components/ghost/Ghost';
import AdminNavigation from './AdminNavigation';
import AcumView from './AcumView';
import FluxuriView, {CollectionRules} from './FluxuriView';
import ProxyControl from './ProxyControl';
import LimitsForm, {type Pace, paceOf} from './LimitsForm';
import Journal from './Journal';
import ProcessingOverview from './ProcessingOverview';
import ScheduleForm, {type Schedule, scheduleOf} from './ScheduleForm';
import DocumentCollection from './DocumentCollection';
import DocumentQueue from './DocumentQueue';
import {collectionState, viewOf} from './model';

/**
 * The administration's one client shell: it reads the collection status once for every page, keeps each page mounted
 * (hidden when another is shown) so drafts and filters survive a change of tab, and runs every command.
 */
export default function CollectionDashboard({children}: {children: React.ReactNode}) {
  const path = usePathname(), view = viewOf(path);
  const [data, setData] = useState<CollectionStatus | null>(null), [stale, setStale] = useState(false);
  const [pace, setPace] = useState<Pace | null>(null), [schedule, setSchedule] = useState<Schedule | null>(null);
  const [proxyDirty, setProxyDirty] = useState(false);
  const [saving, setSaving] = useState(false), [flash, setFlash] = useState<{text: string; error: boolean} | null>(null);
  const [now, setNow] = useState(Date.now());
  const dirty = useRef({pace: false, schedule: false}), refreshing = useRef(false), controller = useRef<AbortController | null>(null);
  const offset = useRef(0), mounted = useRef(true);

  const refresh = useCallback(async (force = false, reset: 'pace' | 'schedule' | 'all' | null = null) => {
    if (refreshing.current) { if (!force) return; controller.current?.abort(); }
    refreshing.current = true;
    const ac = new AbortController(); controller.current = ac;
    const timeout = setTimeout(() => ac.abort(), 30000);
    try {
      const res = await fetch('/api/admin/collection', {cache: 'no-store', signal: ac.signal});
      if (!res.ok) throw Error();
      const next: CollectionStatus = await res.json();
      if (!mounted.current || controller.current !== ac) return;
      offset.current = new Date(next.control!.server_now).getTime() - Date.now();
      setNow(Date.now() + offset.current);
      setData(next); setStale(false);
      if (!dirty.current.pace || reset === 'pace' || reset === 'all') { setPace(paceOf(next.control!)); dirty.current.pace = false; }
      if (!dirty.current.schedule || reset === 'schedule' || reset === 'all') { setSchedule(scheduleOf(next.control!)); dirty.current.schedule = false; }
    } catch {
      // A request aborted by an unmount or a newer read is no longer current; a failure or the 30 s timeout is.
      if (mounted.current && controller.current === ac) setStale(true);
    } finally {
      clearTimeout(timeout);
      if (controller.current === ac) refreshing.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
    const clock = setInterval(() => setNow(Date.now() + offset.current), 1000);
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => {
      mounted.current = false;
      // Leave the guard open for the next mount (React's development double mount runs this cleanup at once).
      controller.current?.abort(); controller.current = null; refreshing.current = false;
      clearInterval(id); clearInterval(clock); window.removeEventListener('focus', focus);
    };
  }, [refresh]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current.pace || dirty.current.schedule) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    if (!flash || flash.error) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  /** One command; `done` is what the admin reads when it was saved. */
  const change = useCallback(async (body: Record<string, unknown>, done = 'Modificarea a fost salvată.') => {
    if (!data || stale || saving) return false;
    setSaving(true); setFlash(null);
    try {
      const {part: which, ...command} = body;
      const res = await fetch('/api/admin/collection', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(command)});
      const r = await res.json();
      if (!res.ok) throw Error(r.error ?? 'Modificarea nu a fost salvată.');
      const part = which === 'pace' || which === 'schedule' ? which : null;
      if (part) dirty.current[part] = false;
      setFlash({text: done, error: false});
      await refresh(true, part);
      return true;
    } catch (e) {
      setFlash({text: e instanceof Error ? e.message : 'Modificarea nu a fost salvată.', error: true});
      void refresh();
      return false;
    } finally { setSaving(false); }
  }, [data, stale, saving, refresh]);

  const c = data?.control;
  const paceDirty = !!(pace && c && (Number(pace.min) !== c.min_seconds || Number(pace.max) !== c.max_seconds || pace.daily !== (c.daily_limit !== null) || pace.daily && Number(pace.limit) !== c.daily_limit));
  const scheduleDirty = !!(schedule && c && (schedule.at !== c.processing_time || schedule.enabled !== c.processing_enabled || schedule.riskDay !== c.risk_weekday));
  dirty.current = {pace: paceDirty, schedule: scheduleDirty};
  const drafts = {pace: paceDirty, schedule: scheduleDirty, proxy: proxyDirty};
  const status = flash && <p className={`admin-flash${flash.error ? ' error' : ''}`} role={flash.error ? 'alert' : 'status'}>
    {flash.text}{flash.error && <button type="button" className="text-button" onClick={() => setFlash(null)}>Închide</button>}
  </p>;

  if (!data || !pace || !schedule || !c) return <div className="collection-admin">
    <AdminNavigation data={data} stale={stale} drafts={drafts}/>
    <div id="admin-content">
      {view === 'oameni' ? children : stale
        ? <div className="admin-error" role="alert"><p>Statusul colectării nu poate fi citit acum.</p><button className="button" onClick={() => { setStale(false); void refresh(true); }}>Reîncearcă</button></div>
        : <Ghost name="admin" label="Se citește statusul…" wait="client" className="admin-ghost">
          {view === 'acum' ? <div className="live-band" data-state="offline"><div className="live-copy"><G.Line w="55%"/><G.Line w="80%"/></div></div> : <G.Lines w={['38%', '92%', '86%']}/>}
          <G.Block h="160px" r="10px"/>
          <G.Lines w={['70%', '64%', '58%']}/>
        </Ghost>}
    </div>
  </div>;

  const state = collectionState(data, stale, now);
  return <div className="collection-admin">
    <AdminNavigation data={data} stale={stale} drafts={drafts}/>
    {status}
    <div id="admin-content" className={stale ? 'g-stale' : undefined}>
      {stale && <p className="admin-notice warn" role="status">Conexiunea de raportare e întreruptă: valorile sunt ultima stare cunoscută, comenzile așteaptă. Reîncercăm automat.</p>}
      <div className="admin-view" hidden={view !== 'acum'}>
        <AcumView data={data} state={state} stale={stale} saving={saving} change={change} now={now} active={view === 'acum'}/>
      </div>
      <div className="admin-view" hidden={view !== 'trafic'}>
        <FluxuriView data={data} stale={stale} saving={saving} change={change}/>
      </div>
      <div className="admin-view" hidden={view !== 'conexiune'}>
        <ProxyControl data={data} now={now} stale={stale} saving={saving} change={change} onDirtyChange={setProxyDirty}/>
        <LimitsForm data={data} form={pace} setForm={next => { dirty.current.pace = true; setPace(next); }} dirty={paceDirty} stale={stale} saving={saving}
          reset={() => { dirty.current.pace = false; setPace(paceOf(c)); }}
          submit={() => change({action: 'settings', part: 'pace', revision: pace.revision, minSeconds: Number(pace.min), maxSeconds: Number(pace.max), dailyLimit: pace.daily ? Number(pace.limit) : null, processingTime: c.processing_time, processingEnabled: c.processing_enabled, riskWeekday: c.risk_weekday}, 'Limitele au fost salvate. Se aplică cererilor următoare.')}/>
        <CollectionRules/>
      </div>
      <div className="admin-view" hidden={view !== 'jurnal'}>
        <Journal data={data} stale={stale}/>
      </div>
      <div className="admin-view" hidden={view !== 'procesare'}>
        <div className="processing-layout">
          <ProcessingOverview data={data}/>
          <ScheduleForm data={data} form={schedule} setForm={next => { dirty.current.schedule = true; setSchedule(next); }} dirty={scheduleDirty} stale={stale} saving={saving}
            reset={() => { dirty.current.schedule = false; setSchedule(scheduleOf(c)); }}
            submit={() => change({action: 'settings', part: 'schedule', revision: schedule.revision, minSeconds: c.min_seconds, maxSeconds: c.max_seconds, dailyLimit: c.daily_limit, processingTime: schedule.at, processingEnabled: schedule.enabled, riskWeekday: schedule.riskDay}, 'Programul a fost salvat.')}/>
        </div>
      </div>
      <div className="admin-view" hidden={view !== 'fisiere'}>
        {view === 'fisiere' && <DocumentCollection/>}
        <DocumentQueue enabled={view === 'fisiere'} retryAt={state.retry?.retry_at ? String(state.retry.retry_at) : null} quiet={state.quiet} paused={state.paused} maintenance={state.maintenance} blocked={state.blocked}/>
      </div>
      <div className="admin-view" hidden={view !== 'oameni'}>{children}</div>
    </div>
  </div>;
}
