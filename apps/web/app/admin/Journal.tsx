'use client';
import {Fragment, useState} from 'react';
import {proxyAuditText} from '@/lib/admin/proxy-audit';
import type {CollectionStatus} from '@/lib/admin/collection';
import {FAILURE_OUTCOMES, JOURNAL_COLUMNS, JOURNAL_READERS} from '@/lib/admin/table-columns';
import type {FilterState} from '@/lib/table-filters/types';
import ColumnFilter from '@/components/table-filters/ColumnFilter';
import FilterBand from '@/components/table-filters/FilterBand';
import {useMemoryFilters} from '@/components/table-filters/useMemoryFilters';
import {STREAM_LABELS, WEEKDAYS, date, fmt, seconds, when} from './model';

type Row = CollectionStatus['requests'][number];
const zone = 'Europe/Bucharest';
const dayKey = (s: unknown) => new Date(String(s)).toLocaleDateString('en-CA', {timeZone: zone});
const dayName = (s: unknown) => {
  const key = dayKey(s), today = new Date().toLocaleDateString('en-CA', {timeZone: zone});
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', {timeZone: zone});
  return key === today ? 'Azi' : key === yesterday ? 'Ieri' : date(s);
};

/** Trafic SEAP · Jurnal: every request with its day, and the latest changes of configuration and runs. */
export default function Journal({data, stale}: {data: CollectionStatus; stale: boolean}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1), [snapshot, setSnapshot] = useState<Row[] | null>(null);
  // The journal's column funnels (owner, 4 November 2026); failures alone read the separate list of the last 100 failures.
  const onlyFailures = (state: FilterState) => { const v = state['rezultat']; return v?.kind === 'options' && v.values.length > 0 && v.values.every(x => FAILURE_OUTCOMES.includes(x)); };
  const journal = useMemoryFilters(JOURNAL_COLUMNS, (state, funnel) => funnel === 'rezultat' ? [...new Map([...data.requests, ...data.failures].map(r => [r.id, r])).values()] : onlyFailures(state) ? data.failures : data.requests, JOURNAL_READERS);
  const filtered = Object.keys(journal.state).length > 0;
  const live = journal.rows as Row[];
  const rows = snapshot ?? live, pages = Math.max(1, Math.ceil(rows.length / 10)), current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * 10, current * 10);
  const restart = () => { setPage(1); setSnapshot(null); setExpanded(null); };
  const funnel = (key: string) => <ColumnFilter column={JOURNAL_COLUMNS.find(c => c.key === key)!} value={journal.state[key]} onChange={value => { journal.set(key, value); restart(); }} localFacet={term => journal.facet(key, term)}/>;
  const turn = (next: number) => { setPage(next); setSnapshot(next === 1 ? null : snapshot ?? live); setExpanded(null); };
  return <>
    <section id="journal" className="journal" aria-labelledby="journal-title">
      <div className="section-heading">
        <h2 id="journal-title">Cereri</h2>
        {stale ? <span className="button" aria-disabled="true">Exportă jurnalul</span>
          : <a className="button" href="/api/admin/collection?export=1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/></svg>Exportă jurnalul</a>}
      </div>
      <FilterBand columns={JOURNAL_COLUMNS} state={journal.state} labels={journal.labels} onChange={next => { journal.replace(next); restart(); }}/>
      {!rows.length ? <p className="empty-state">{filtered ? 'Nicio cerere pentru acest filtru.' : 'Nicio cerere în jurnalul nou. Datele istorice rămân în aplicație.'}</p>
        : <div className="log-scroll"><table className="log">
          <thead><tr>
            <th scope="col">Ora</th>
            <th scope="col"><span className="th-filter">Cererea{funnel('flux')}<span className="th-sep" aria-hidden="true">·</span>proxy{funnel('proxy')}</span></th>
            <th scope="col"><span className="th-filter">Rezultat{funnel('rezultat')}</span></th>
            <th scope="col">Durată</th>
            <th scope="col"><span className="sr-only">Detalii</span></th>
          </tr></thead>
          <tbody>{visible.map((r, i) => {
            const day = dayKey(r.started_at), first = i === 0 || dayKey(visible[i - 1]!.started_at) !== day;
            return <Fragment key={r.id}>
              {first && <tr className="log-day"><th colSpan={5} scope="rowgroup">{dayName(r.started_at)}</th></tr>}
              <RequestRows row={r} expanded={expanded === r.id} toggle={() => setExpanded(expanded === r.id ? null : r.id)}/>
            </Fragment>;
          })}</tbody>
        </table></div>}
      {rows.length > 0 && <nav className="queue-pagination" aria-label="Paginile jurnalului">
        <span aria-live="polite">{fmt((current - 1) * 10 + 1)}–{fmt(Math.min(current * 10, rows.length))} din {fmt(rows.length)}</span>
        <button className="button" disabled={current <= 1} onClick={() => turn(current - 1)}>Înapoi</button>
        <button className="button" disabled={current >= pages} onClick={() => turn(current + 1)}>Următoarele</button>
      </nav>}
      {snapshot && <p className="footnote">Lista stă pe loc cât navighezi. <button className="text-button" onClick={() => turn(1)}>Vezi cele mai noi</button></p>}
      <p className="footnote">Ultimele 100 de încercări; filtrul „eșuat” sau „întrerupt” citește ultimele 100 de eșecuri. Exportul: maximum 5.000. Fără cookie-uri, tokenuri sau linkuri temporare.</p>
    </section>
    <section className="changes" aria-labelledby="changes-title">
      <h2 id="changes-title">Schimbări și rulări</h2>
      {!data.audit.length ? <p className="empty-state">Nicio schimbare. Configurația inițială: 50–70 de secunde, coada pe pauză.</p>
        : <ul>{data.audit.slice(0, 10).map(a => <li key={a.id}>
          <time dateTime={String(a.created_at)}>{when(a.created_at)}</time>
          <span><b>{a.actor_name}</b> · {auditText(a)}</span>
        </li>)}</ul>}
    </section>
  </>;
}

const DOCUMENT_ACTIONS: Record<string, string> = {
  'documents-start': 'Colectarea automată a fișierelor pornită.', 'documents-pause': 'Fișierele puse pe pauză; progresul se păstrează.',
  'documents-resume': 'Colectarea automată a fișierelor reluată.', 'documents-retry': 'Operațiunile de fișiere eșuate, repuse în coadă.',
};
const PHASES: Record<string, string> = {start: 'pornită', complete: 'încheiată și verificată', failed: 'oprită la eroare'};

/** Every audited action in Romanian; an action without its own sentence still reads as a phase, never as a code. */
export function auditText(a: Record<string, any>): string {
  const b = a.before, n = a.after ?? {};
  if (DOCUMENT_ACTIONS[a.action]) return DOCUMENT_ACTIONS[a.action]!;
  switch (a.action) {
    case 'ted-enabled': return n.fromIssue ? `Colectarea TED pornită din pachetul OJ S ${Number(String(n.fromIssue).slice(4))}/${String(n.fromIssue).slice(0, 4)}.${n.superseded ? ` ${fmt(n.superseded)} sarcini vechi înlocuite.` : ''}` : `Colectarea TED pornită: ${fmt(n.days ?? 0)} zile, ${n.from} – ${n.to}.`;
    case 'award-detail-backfill': return `Detalii istorice de atribuire: ${fmt(n.queued ?? 0)} programate în fundal${n.pilot ? ' (pilot)' : ''}.`;
    case 'background-lanes': return n.backgroundLanes ? `Lucru în fundal: ${n.backgroundLanes} ${n.backgroundLanes === 1 ? 'bandă' : 'benzi'}, după colectarea obișnuită.` : 'Lucrul în fundal a fost oprit.';
    case 'recovery-scope': return `Colectare extinsă până la ${n.endDay}: ${fmt(n.added ?? 0)} cereri adăugate.`;
    case 'proxies': return proxyAuditText(n);
    case 'proxy-auto-disabled': return `${n.proxyId}: oprit după trei erori la rând. Celelalte continuă.`;
    case 'proxy-restricted': return `${n.proxyId}: SEAP i-a restricționat IP-ul (403). Oprit; celelalte continuă.`;
    case 'settings': return `Interval ${b?.minSeconds}–${b?.maxSeconds} → ${n.minSeconds}–${n.maxSeconds} s; procesare ${n.processingTime}; ${n.dailyLimit ? `limită ${fmt(n.dailyLimit)}/zi` : 'fără limită zilnică'}.${typeof n.processingEnabled === 'boolean' ? ` Program ${n.processingEnabled ? 'pornit' : 'oprit'}, riscul ${WEEKDAYS[n.riskWeekday]?.toLowerCase()}.` : ''}`;
    case 'pause': return n.paused ? 'Colectarea pusă pe pauză.' : 'Colectarea reluată.';
    case 'unblock': return 'Refuzul SEAP verificat; reluare confirmată.';
    case 'retry-task': return `Reîncercare explicită a sarcinii ${b?.taskId}; încercarea inițială rămâne în jurnal.`;
    case 'processing-start': return n.scope === 'full' ? 'Actualizare completă, cu semnalele de risc.' : 'Actualizare zilnică, fără recalcularea riscului.';
    case 'processing-complete': return 'Datele și căutarea verificate; site-ul redeschis.';
    case 'processing-failed': return `Procesare oprită la etapa ${n.stage}; mentenanța se păstrează.`;
    case 'ted-repair-start': return 'Mentenanță și backup pentru refacerea istoricului TED.';
    case 'ted-repair-complete': return 'Istoricul TED verificat; site-ul și colectarea reluate.';
    case 'recalculation-pause': return 'Colectare oprită pentru recalcularea cronometrată.';
    case 'stream': return `Fluxuri pe pauză: ${n.pausedStreams?.length ? n.pausedStreams.map((s: string) => STREAM_LABELS[s] ?? s).join(', ') : 'niciunul'}.`;
  }
  const phase = String(a.action).match(/-(start|complete|failed)$/)?.[1];
  return phase ? `Etapă ${PHASES[phase]}.` : 'Operațiune înregistrată.';
}

function RequestRows({row: r, expanded, toggle}: {row: Record<string, any>; expanded: boolean; toggle: () => void}) {
  const failed = ['failed', 'interrupted'].includes(r.outcome);
  const label = STREAM_LABELS[r.stream] ?? r.stream;
  return <>
    <tr className={failed ? 'is-failed' : undefined}>
      <td className="log-time">{seconds(r.started_at)}</td>
      <td className="log-request">{label}<small>{r.proxy_id ?? 'Direct / istoric'} · {r.method} · {r.endpoint.split('/').filter(Boolean).slice(-2).join('/')}</small></td>
      <td className="log-result"><span className={`result${failed ? ' error' : ''}`}>{r.outcome === 'running' ? 'În curs' : `${r.status ?? '—'} · ${r.outcome === 'success' ? 'reușit' : r.outcome === 'interrupted' ? 'întrerupt' : 'eșuat'}`}</span></td>
      <td className="log-duration">{r.duration_ms !== null ? `${(Number(r.duration_ms) / 1000).toFixed(1)} s` : '—'}</td>
      <td className="log-more"><button className="icon-button log-toggle" aria-expanded={expanded} aria-controls={expanded ? `request-${r.id}` : undefined} aria-label={`Detalii: ${label}, ${seconds(r.started_at)}`} onClick={toggle}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></td>
    </tr>
    {expanded && <tr className="log-detail" id={`request-${r.id}`}><td colSpan={5}>
      <p><b>{r.method}</b> <code>{r.endpoint}</code></p>
      <p>{date(r.started_at)} · {seconds(r.started_at)} · {r.bytes === null ? 'dimensiune necunoscută' : `${fmt(r.bytes)} octeți`}</p>
      <pre>{JSON.stringify(r.parameters, null, 2)}</pre>
      {r.error && <p className="warn-text">{r.error}</p>}
      <a className="button" href={`/api/admin/collection?request=${r.id}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/></svg>Descarcă detaliile cererii</a>
      {!r.has_diagnostics && r.outcome !== 'running' && <p>Încercare mai veche: fără diagnostic detaliat.</p>}
    </td></tr>}
  </>;
}
