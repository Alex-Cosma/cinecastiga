'use client';
import type {CollectionStatus} from '@/lib/admin/collection';
import type {Change} from './LiveBand';
import RecoveryOverview from './RecoveryOverview';
import HistoricalDownloads from './HistoricalDownloads';
import DaDetailCollection from './DaDetailCollection';
import {STREAM_LABELS, date, fmt} from './model';

const dot = '\u00a0· ';

const STREAMS = ['da', 'tenders', 'awards', 'ted'] as const;

/** The rules every SEAP request follows, said once for the whole administration. */
export function CollectionRules() {
  return <details className="rules">
    <summary>Reguli care rămân active</summary>
    <ul>
      <li>O singură cerere în curs pe IP; câte cereri simultane în total se alege în Conexiune.</li>
      <li>Minimum 60 de secunde între fișierele cerute individual; loturile prin proxy respectă ritmul fiecărui IP și plafonul comun.</li>
      <li>Pauză SEAP zilnică 02:59–03:30, ora României, pentru date și fișiere. Reluarea e automată și păstrează opririle manuale și erorile.</li>
      <li>Un răspuns 403, 429 sau o verificare suplimentară oprește colectarea.</li>
      <li>Timeout: reîncercare după 5 minute, apoi după încă 10. Prin proxy așteaptă doar cererea afectată, iar trei erori la rând opresc doar acel proxy; în modul direct, al treilea timeout oprește colectarea.</li>
      <li>Fiecare încercare rămâne în jurnal, cu datele de autentificare mascate.</li>
    </ul>
  </details>;
}

/** Trafic SEAP · Fluxuri: how far the recovery is, each stream with its own pause, the direct-award lines download
 * and the other background downloads. */
export default function FluxuriView({data, stale, saving, change}: {data: CollectionStatus; stale: boolean; saving: boolean; change: Change}) {
  const c = data.control!, pausedStreams = c.paused_streams as string[];
  return <>
    <RecoveryOverview data={data} stale={stale}/>
    <section className="streams" aria-labelledby="streams-title">
      <div className="section-heading"><h2 id="streams-title">Fluxuri</h2><span className="subtle">raportare activă din {date(c.created_at)}</span></div>
      {STREAMS.map(key => {
        const s = data.streams.find(x => x.stream === key), progress = data.recovery?.progress.find(x => x.stream === key);
        const stopped = pausedStreams.includes(key), run = data.runs.find(r => r.source === `elicitatie:${key === 'da' ? 'das' : key}`);
        const failed = Number(progress?.failed ?? 0), deferred = Number(progress?.deferred ?? 0), pending = Number(progress?.pending ?? 0), running = Number(progress?.running ?? 0);
        const badge = stopped ? ['neutral', 'Pe pauză'] : failed > 0 ? ['neutral', 'Sarcini eșuate'] : running > 0 || run?.status === 'running' ? ['', 'În curs'] : deferred > 0 ? ['neutral', 'Detalii nepreluate'] : Number(progress?.complete) > 0 ? ['neutral', 'Pași arhivați'] : s ? ['neutral', 'Cereri înregistrate'] : ['neutral', 'Neînceput'];
        const complete = progress ? Number(progress.complete) + Number(progress.split) : 0;
        const total = complete + pending + running + failed + deferred;
        const percent = total ? Math.min(pending + running + failed + deferred > 0 ? 99 : 100, Math.floor(complete / total * 100)) : 0;
        return <article className="stream" key={key} aria-labelledby={`stream-${key}`}>
          <div className="stream-heading">
            <h3 id={`stream-${key}`}>{STREAM_LABELS[key]}</h3>
            <span className={`badge ${badge[0]}`}>{badge[1]}</span>
            <button className="stream-toggle" disabled={stale || saving} aria-label={`${stopped ? 'Reia' : 'Pune pe pauză'}: ${STREAM_LABELS[key]}`}
              onClick={() => void change({action: 'stream', stream: key, paused: !stopped, revision: c.revision}, stopped ? `${STREAM_LABELS[key]}: reluat.` : `${STREAM_LABELS[key]}: pe pauză.`)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={stopped ? 'm8 5 11 7-11 7Z' : 'M8 5v14M16 5v14'}/></svg><span aria-hidden="true">{stopped ? 'Reia' : 'Pauză'}</span>
            </button>
          </div>
          <p className="stream-scope">{key === 'ted' ? 'Pachetul zilnic OJ S, verificat cu căutarea TED' : `De la ${key === 'da' ? '1 iulie' : '1 ianuarie'} 2026, după data ${key === 'da' ? 'finalizării' : 'publicării'}`}</p>
          <p className="progress-label"><strong>{fmt(s?.attempts)} <span>cereri</span></strong><span>{fmt(s?.received)} înregistrări primite</span></p>
          {progress && <div className="stream-meter">
            <progress max={100} value={percent} aria-label={`Pași încheiați, ${STREAM_LABELS[key]}`}/>
            <span>{percent}% din pașii cunoscuți · {fmt(complete)} / {fmt(total)}</span>
          </div>}
          {progress && <p className="stream-detail">
            {fmt(pending)} în așteptare{running > 0 ? `${dot}${fmt(running)} ${running === 1 ? 'cerere' : 'cereri'} în curs` : ''}
            {failed > 0 ? `${dot}${fmt(failed)} ${failed === 1 ? 'sarcină eșuată' : 'sarcini eșuate'}` : ''}
            {deferred > 0 ? `${dot}${fmt(deferred)} detalii eForms nepreluate` : ''}
            {run ? `${dot}ultima rulare ${date(run.window_start)} – ${date(run.window_end)}, ${run.status === 'completed' ? 'încheiată' : run.status === 'failed' ? 'întreruptă' : 'în lucru'}` : ''}
          </p>}
        </article>;
      })}
      <p className="footnote">{data.recovery ? `Lot până la ${date(data.recovery.batch.end_day)}; coada crește prin paginare.` : 'Progresul apare după inventarierea lotului.'} Reluarea unui flux nu pornește o recuperare nouă.</p>
    </section>
    <DaDetailCollection data={data} stale={stale}/>
    <HistoricalDownloads data={data} stale={stale}/>
  </>;
}
