'use client';
import Link from 'next/link';
import CollectionPace from './CollectionPace';
import {useEffect, useState} from 'react';
import type {CollectionStatus} from '@/lib/admin/collection';
import {GATE_MAX_IN_FLIGHT, GATE_MAX_PER_MINUTE} from '@/lib/admin/gate-limits';
import {PROXY_COLUMNS, PROXY_READERS} from '@/lib/admin/table-columns';
import type {FilterState} from '@/lib/table-filters/types';
import ColumnFilter from '@/components/table-filters/ColumnFilter';
import FilterBand from '@/components/table-filters/FilterBand';
import {useMemoryFilters} from '@/components/table-filters/useMemoryFilters';

type Draft = {enabled: boolean; min: string; max: string; cap: string; concurrency: string; ids: string[]; revision: number};
const initial = (data: CollectionStatus): Draft => ({enabled: !!data.proxies.settings.enabled, min: String(data.proxies.settings.min_seconds), max: String(data.proxies.settings.max_seconds), cap: String(data.proxies.settings.requests_per_minute), concurrency: String(data.proxies.settings.max_in_flight ?? 1), ids: data.proxies.endpoints.filter(p => p.enabled).map(p => String(p.id)), revision: Number(data.control.revision)});
const number = (v: unknown) => new Intl.NumberFormat('ro-RO', {maximumFractionDigits: 1}).format(Number(v ?? 0));

/** Trafic SEAP · Conexiune: the observed pace, each proxy, and the route of the requests (changed only while paused). */
export default function ProxyControl({data, now, stale, saving, change, onDirtyChange}: {data: CollectionStatus; now: number; stale: boolean; saving: boolean; change: (body: Record<string, unknown>, done?: string) => Promise<boolean | undefined>; onDirtyChange: (dirty: boolean) => void}) {
  const [draft, setDraft] = useState<Draft | null>(null), [page, setPage] = useState(1);
  const [pickSearch, setPickSearch] = useState(''), [pickPage, setPickPage] = useState(1);
  useEffect(() => { onDirtyChange(!!draft); }, [!!draft, onDirtyChange]);
  const saved = initial(data), form = draft ?? saved, conflict = !!draft && draft.revision !== Number(data.control.revision);
  const endpoints = data.proxies.endpoints, policy = data.proxies.settings;
  const current = endpoints.filter(p => p.configured);
  const matches = (p: typeof endpoints[number], term: string) => `${p.id} ${p.exit_ip}`.toLowerCase().includes(term.trim().toLowerCase());
  // The inventory's column funnels (owner, 4 November 2026): the retired proxies only when the state funnel asks for them.
  const retiredAsked = (state: FilterState) => { const v = state['stare']; return v?.kind === 'options' && v.values.includes('retras'); };
  const proxyFilters = useMemoryFilters(PROXY_COLUMNS, (state, funnel) => funnel === 'stare' || retiredAsked(state) ? endpoints : current, PROXY_READERS, (key, value) => { if (key !== 'proxy') return undefined; const p = endpoints.find(e => e.id === value); return p ? `${p.id} · ${p.exit_ip}` : undefined; });
  const inventory = proxyFilters.rows;
  const funnel = (key: string, align: 'start' | 'end' = 'start') => <ColumnFilter column={PROXY_COLUMNS.find(c => c.key === key)!} value={proxyFilters.state[key]} onChange={value => { proxyFilters.set(key, value); setPage(1); }} localFacet={term => proxyFilters.facet(key, term)} align={align}/>;
  const picks = current.filter(p => matches(p, pickSearch));
  const inventoryPage = Math.min(page, Math.max(1, Math.ceil(inventory.length / 10))), selectionPage = Math.min(pickPage, Math.max(1, Math.ceil(picks.length / 10)));
  const active = endpoints.filter(p => p.enabled).length;
  const editable = !!data.control.paused && !data.control.maintenance && !Number(data.documents.running) && !data.requests.some(r => r.outcome === 'running') && !stale && !saving;
  const [startOpen] = useState(editable);
  const edit = (patch: Partial<Draft>) => setDraft({...form, ...patch});
  const valid = Number.isInteger(Number(form.concurrency)) && Number(form.concurrency) >= 1 && Number(form.concurrency) <= GATE_MAX_IN_FLIGHT && Number.isInteger(Number(form.min)) && Number.isInteger(Number(form.max)) && Number(form.min) >= 1 && Number(form.max) >= Number(form.min) && Number(form.max) <= 3600 && Number.isInteger(Number(form.cap)) && Number(form.cap) >= 1 && Number(form.cap) <= GATE_MAX_PER_MINUTE && (!form.enabled || form.ids.length > 0);
  const capacity = Math.min(Number(form.cap), form.ids.length * 120 / (Number(form.min) + Number(form.max)));
  const added = form.ids.filter(id => !saved.ids.includes(id)).length, removed = saved.ids.filter(id => !form.ids.includes(id)).length;
  const changes = draft ? [
    form.enabled !== saved.enabled && (form.enabled ? 'traseu direct → prin proxy-uri' : 'traseu prin proxy-uri → direct'),
    form.enabled && (form.min !== saved.min || form.max !== saved.max) && `pauză pe IP ${saved.min}–${saved.max} → ${form.min}–${form.max} s`,
    form.enabled && form.cap !== saved.cap && `plafon ${saved.cap} → ${form.cap} cereri/min`,
    form.enabled && form.concurrency !== saved.concurrency && `simultan ${saved.concurrency} → ${form.concurrency}`,
    form.enabled && (added || removed) && `proxy-uri: ${added ? `+${added}` : ''}${added && removed ? ', ' : ''}${removed ? `−${removed}` : ''} (${form.ids.length} selectate)`,
  ].filter(Boolean) : [];
  useEffect(() => { if (!draft) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [draft]);
  return <section className="proxy-control" aria-labelledby="proxy-title">
    <div className="section-heading"><div><h2 id="proxy-title">Conexiune</h2><p className="section-description">{policy.enabled ? `Prin ${active} din ${current.length} proxy-uri; IP-ul serverului nu e folosit.` : data.proxies.directAllowed ? 'Direct, de pe IP-ul serverului.' : 'Proxy-uri oprite și conexiunea directă blocată.'}</p></div><span className={`badge ${stale || !policy.enabled && !data.proxies.directAllowed ? 'warning' : 'neutral'}`}>{stale ? 'Status neactualizat' : policy.enabled ? 'Prin proxy' : data.proxies.directAllowed ? 'Direct' : 'Fără conexiune'}</span></div>
    <CollectionPace data={data} stale={stale}/>
    {endpoints.length > 0 && <ProxyList collapsed={!policy.enabled} count={current.length}>
      <FilterBand columns={PROXY_COLUMNS} state={proxyFilters.state} labels={proxyFilters.labels} onChange={next => { proxyFilters.replace(next); setPage(1); }}/>
      <div className="proxy-table-scroll"><table className="proxy-table"><caption>Pe fiecare proxy · ritmul ultimelor 10 minute, totaluri de azi</caption>
        <thead><tr><th scope="col"><span className="th-filter">Proxy / IP{funnel('proxy')}</span></th><th scope="col"><span className="th-filter">Stare{funnel('stare')}</span></th><th scope="col" className="proxy-num">Ritm / min</th><th scope="col" className="proxy-num">Cereri azi</th><th scope="col" className="proxy-num"><span className="th-filter">Erori azi{funnel('erori', 'end')}</span></th><th scope="col" className="proxy-num">Trafic azi</th></tr></thead>
        <tbody>{inventory.slice((inventoryPage - 1) * 10, inventoryPage * 10).map(p => {
          const seconds = Math.max(0, Math.ceil((new Date(p.next_allowed_at ?? 0).getTime() - now) / 1000));
          return <tr key={p.id}>
            <th scope="row">{p.id}<small>{p.exit_ip}</small></th>
            <td>{stale ? 'Necunoscută' : !p.configured ? 'Retras din listă' : !p.enabled ? (Number(p.consecutive_failures) >= 3 ? <span className="warn-text">Oprit după erori</span> : 'Neutilizat') : !policy.enabled ? 'Neutilizat în modul direct' : data.requests.some(r => r.outcome === 'running' && r.proxy_id === p.id) ? <span className="proxy-reserved">Cerere în curs</span> : p.job_status === 'running' ? <span className="proxy-reserved">Rezervat unui document</span> : p.last_error ? <span className="form-error">{seconds ? `Pauză după eroare · ${seconds} s` : 'De verificat'}</span> : seconds ? `Liber în ${seconds} s` : 'Liber'}{p.last_error && <small>{p.last_error}</small>}</td>
            <td className="proxy-num proxy-rate"><span className="proxy-mobile-label" aria-hidden="true">Ritm / min</span>{stale ? '—' : number(p.observed_per_minute)}<small>{stale ? '' : `${number(p.recent_attempts)} în 10 min`}</small></td>
            <td className="proxy-num"><span className="proxy-mobile-label" aria-hidden="true">Cereri azi</span>{number(p.attempts)}</td>
            <td className="proxy-num"><span className="proxy-mobile-label" aria-hidden="true">Erori azi</span>{number(p.failed)}</td>
            <td className="proxy-num"><span className="proxy-mobile-label" aria-hidden="true">Trafic azi</span>{number(Number(p.bytes) / 1048576)} MB</td>
          </tr>;
        })}</tbody></table></div>
      {inventory.length === 0 && <p className="empty-state">Niciun proxy pentru acest filtru.</p>}
      <ProxyPages page={inventoryPage} count={inventory.length} setPage={setPage} label="Paginile proxy-urilor"/>
      <p className="footnote">Ritmul include eșecurile și pauzele. Totalurile se resetează la miezul nopții; traficul e măsurat de aplicație, nu facturat.</p>
    </ProxyList>}
    <details className="proxy-settings" open={startOpen || !!draft || undefined}><summary>Traseu și proxy-uri</summary>
      {!editable && <p className="policy-note">{stale ? 'Modificările așteaptă reconectarea la server.' : 'Se schimbă doar cu colectarea pe pauză și fără cereri sau documente în curs.'} {!stale && <Link href="/admin" scroll={false}>Pune pe pauză din Acum</Link>}</p>}
      {!current.length && <p className="policy-note">Niciun proxy înregistrat. Lista se instalează pe server; parolele nu se introduc aici.</p>}
      <form onSubmit={async e => { e.preventDefault(); if (valid && editable && !conflict && await change({action: 'proxies', revision: form.revision, enabled: form.enabled, minSeconds: Number(form.min), maxSeconds: Number(form.max), requestsPerMinute: Number(form.cap), maxInFlight: Number(form.concurrency), activeIds: form.ids}, 'Traseul a fost salvat. Colectarea rămâne pe pauză.')) setDraft(null); }}>
        <fieldset disabled={!editable}><legend>Traseul cererilor</legend>
          <div className="proxy-modes">
            <label><input type="radio" name="proxy-mode" disabled={!data.proxies.directAllowed} checked={!form.enabled} onChange={() => edit({enabled: false})}/>Direct</label>
            <label><input type="radio" name="proxy-mode" checked={form.enabled} disabled={!current.length} onChange={() => edit({enabled: true})}/>Prin proxy-uri</label>
          </div>
          {form.enabled && <>
            <div className="proxy-fields">
              <label>Pauză minimă / IP <span>secunde</span><input type="number" min="1" max="3600" step="1" required value={form.min} onChange={e => edit({min: e.target.value})}/></label>
              <label>Pauză maximă / IP <span>secunde</span><input type="number" min={form.min || 1} max="3600" step="1" required value={form.max} onChange={e => edit({max: e.target.value})}/></label>
              <label>Plafon total <span>1–{GATE_MAX_PER_MINUTE.toLocaleString('ro-RO')} cereri / minut</span><input type="number" min="1" max={GATE_MAX_PER_MINUTE} step="1" required value={form.cap} onChange={e => edit({cap: e.target.value})}/></label>
              <label>Cereri simultane <span>în total</span><select value={form.concurrency} onChange={e => edit({concurrency: e.target.value})}>{Array.from({length: GATE_MAX_IN_FLIGHT}, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}{i === 0 ? ' · pe rând' : ' · pe IP-uri diferite'}</option>)}</select></label>
            </div>
            {current.length > 0 && <fieldset className="proxy-selection"><legend>Proxy-uri folosite · {form.ids.length} din {current.length}</legend>
              <div className="proxy-toolbar">
                <label>Caută<input type="search" placeholder="Nume sau IP" value={pickSearch} onChange={e => { setPickSearch(e.target.value); setPickPage(1); }}/></label>
                <div className="proxy-bulk">
                  <button className="button" type="button" onClick={() => edit({ids: current.map(p => p.id)})}>Toate cele {current.length}</button>
                  <button className="text-button" type="button" onClick={() => edit({ids: []})}>Niciunul</button>
                  {pickSearch && <button className="text-button" type="button" disabled={!picks.length} onClick={() => edit({ids: [...new Set([...form.ids, ...picks.map(p => p.id)])]})}>Adaugă cele {picks.length} găsite</button>}
                </div>
              </div>
              <div className="proxy-picks">{picks.slice((selectionPage - 1) * 10, selectionPage * 10).map(p => <label key={p.id}><input type="checkbox" checked={form.ids.includes(p.id)} onChange={e => edit({ids: e.target.checked ? [...form.ids, p.id] : form.ids.filter(id => id !== p.id)})}/>{p.id}<small>{p.exit_ip}</small></label>)}</div>
              {!picks.length && <p className="policy-note">Niciun proxy pentru această căutare.</p>}
              <ProxyPages page={selectionPage} count={picks.length} setPage={setPickPage} label="Paginile selecției de proxy-uri"/>
            </fieldset>}
          </>}
        </fieldset>
        {form.enabled && valid && <p className="proxy-estimate">Capacitate teoretică: până la <strong>{number(capacity)} cereri/min</strong>; răspunsurile, documentele și pauzele o reduc.</p>}
        {form.enabled && !form.ids.length && <p className="form-error" role="alert">Alege cel puțin un proxy.</p>}
        {changes.length > 0 && <p className="settings-diff">Se schimbă: {changes.join('; ')}.</p>}
        {conflict && <p role="alert" className="form-error">Configurația s-a schimbat între timp. Renunță și reia modificarea.</p>}
        <div className="form-actions"><button className="button primary" disabled={!draft || !valid || conflict || !editable}>{saving ? 'Se salvează…' : 'Aplică traseul'}</button>{draft && <button className="text-button" type="button" onClick={() => setDraft(null)}>Renunță</button>}</div>
      </form>
    </details>
  </section>;
}

/** In direct mode the proxies are idle: their list folds to one line, so the limits that apply come first on a phone. */
function ProxyList({collapsed, count, children}: {collapsed: boolean; count: number; children: React.ReactNode}) {
  if (!collapsed) return <>{children}</>;
  return <details className="proxy-list"><summary>{count} {count === 1 ? 'proxy înregistrat, neutilizat' : 'proxy-uri înregistrate, neutilizate'} în modul direct</summary>{children}</details>;
}

function ProxyPages({page, count, setPage, label}: {page: number; count: number; setPage: (page: number) => void; label: string}) {
  if (count <= 10) return null;
  return <nav className="queue-pagination" aria-label={label}><span>{(page - 1) * 10 + 1}–{Math.min(page * 10, count)} din {count}</span><button type="button" className="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Înapoi</button><button type="button" className="button" disabled={page * 10 >= count} onClick={() => setPage(page + 1)}>Următoarele</button></nav>;
}
