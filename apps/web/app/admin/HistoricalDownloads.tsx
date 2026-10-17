import type {CollectionStatus} from '@/lib/admin/collection';
import {backfillForecast} from '../../lib/admin/historical-forecast';
import {duration,finish} from './RecoveryOverview';
const fmt=(v:number)=>new Intl.NumberFormat('ro-RO').format(v);
const day=(value:string)=>new Intl.DateTimeFormat('ro-RO',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Bucharest'}).format(new Date(`${value}T12:00:00Z`));
const time=(value:string)=>new Intl.DateTimeFormat('ro-RO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'}).format(new Date(value));
const ojs=(v:string)=>`OJ S ${Number(v.slice(4))}/${v.slice(0,4)}`;
const REFILL_BELOW=20000;
/** The two historical downloads that run beside the daily collection: SEAP award details (background
 * lanes) and the TED daily-package catch-up. Neither enters the recovery progress or ETA above. */
export default function HistoricalDownloads({data,stale}:{data:CollectionStatus;stale:boolean}){
 const h=data.historical,c=data.control!,now=new Date(String(c.server_now)).toISOString();
 if(!h)return null;
 const paused=c.paused_streams as string[],a=h.awards,t=h.ted,f=backfillForecast(a);
 const root=a.parts.find(p=>p.part==='root'),children=a.parts.filter(p=>p.part!=='root');
 const sum=(ps:typeof a.parts,k:'pending'|'running'|'complete'|'failed')=>ps.reduce((s,p)=>s+p[k],0);
 const total=(ps:typeof a.parts)=>sum(ps,'pending')+sum(ps,'running')+sum(ps,'complete')+sum(ps,'failed');
 const awardsHalted=stale||c.paused||!!c.blocked_reason||(c.maintenance&&!c.collection_during_maintenance)||paused.includes('awards')||a.lanes===0;
 const awardsDone=f.left===0&&f.unscheduled===0;
 const awardsState=!a.lastEnqueue?'Neînceput':awardsDone?'Încheiată':a.lanes===0?'Oprită':awardsHalted?'Pe pauză':'În curs';
 const tedPaused=stale||c.paused||!!c.blocked_reason||(c.maintenance&&!c.collection_during_maintenance)||paused.includes('ted');
 const tedState=!t.latest?'Neînceput':tedPaused?'Pe pauză':t.behind===0?'La zi':'Recuperare';
 const nextAt=t.lastFinishedAt?new Date(new Date(t.lastFinishedAt).getTime()+t.spacingMinutes*60000).toISOString():null;
 const tedMinutes=t.behind?t.behind*t.spacingMinutes:0;
 return <section className="historical-downloads" aria-labelledby="historical-title">
  <div className="recovery-heading"><h2 id="historical-title">Descărcări istorice</h2><span>În fundal, după colectarea zilnică · nu intră în progresul de mai sus</span></div>
  <div className="historical-grid">
   <article className="historical-card" aria-labelledby="historical-awards">
    <div className="historical-card-heading"><h3 id="historical-awards">Atribuiri SEAP · detalii și loturi</h3><span className={`badge ${awardsHalted&&!awardsDone?'warning':'neutral'}`}>{awardsState}</span></div>
    {!a.lastEnqueue?<p className="historical-note">Nicio descărcare istorică programată.</p>:<>
     <div className="historical-figure"><strong>{f.percent===null?'—':`≈ ${f.percent}%`}</strong><span>din cererile estimate · {fmt(f.done)} încheiate</span></div>
     {f.percent!==null&&<progress max={100} value={f.percent} aria-label="Progresul descărcării istorice SEAP"/>}
     <p className="historical-eta">{awardsDone?'Toate anunțurile programate au fost preluate.':awardsHalted?'Termen suspendat cât timp lucrul în fundal e oprit.':f.hours===null?'Măsurăm ritmul…':<>≈ {duration(f.hours*60)} rămase · încheiere estimată {finish(now,f.hours*60)}</>}</p>
     <dl>
      <div><dt>Detaliu principal</dt><dd>{fmt(root?.complete??0)} / {fmt(root?total([root]):0)}{root&&root.failed>0?` · ${fmt(root.failed)} nepreluate`:''}</dd></div>
      <div><dt>Loturi și formulare eForms</dt><dd>{fmt(sum(children,'complete'))} / {fmt(total(children))}{sum(children,'failed')>0?` · ${fmt(sum(children,'failed'))} nepreluate`:''}</dd></div>
      <div><dt>Anunțuri încă neprogramate</dt><dd>{f.unscheduled===null?'se numără la următoarea reîncărcare':fmt(f.unscheduled)}</dd></div>
      <div><dt>Ritm în ultima oră</dt><dd>{fmt(f.rate)} cereri · {a.lanes} {a.lanes===1?'bandă':'benzi'}</dd></div>
      <div><dt>Ultima programare</dt><dd>{time(a.lastEnqueue.at)} · {fmt(a.lastEnqueue.queued)} {a.lastEnqueue.auto?'automat':'de operator'}{a.lastEnqueue.pilot?' (pilot)':''}</dd></div>
     </dl>
     {!awardsDone&&<p className="historical-note">Colectorul programează automat următoarele 100.000 de anunțuri când rămân sub {fmt(REFILL_BELOW)} de cereri în așteptare.</p>}
     {!!a.errors.length&&<div className="historical-errors"><h4>Nepreluate, pe cauze</h4><ul>{a.errors.map(e=><li key={e.error}><b>{fmt(e.n)}</b> {e.error}</li>)}</ul></div>}
    </>}
   </article>
   <article className="historical-card" aria-labelledby="historical-ted">
    <div className="historical-card-heading"><h3 id="historical-ted">TED · pachete zilnice OJ S</h3><span className={`badge ${tedPaused?'warning':'neutral'}`}>{tedState}</span></div>
    {!t.latest?<p className="historical-note">Niciun pachet TED arhivat încă.</p>:<>
     <div className="historical-figure"><strong>{ojs(t.latest.ojs)}</strong><span>ultimul număr arhivat · {day(t.latest.day)}</span></div>
     <p className="historical-eta">{t.behind===0?'La zi cu numerele publicate.':tedPaused?'Termen suspendat cât timp fluxul TED e pe pauză.':<>≈ {fmt(t.behind!)} {t.behind===1?'număr rămas':'numere rămase'} · ≈ {duration(tedMinutes)} · încheiere estimată {finish(now,tedMinutes)}</>}</p>
     <dl>
      <div><dt>Ritm</dt><dd>un pachet la {t.spacingMinutes} min</dd></div>
      <div><dt>Următorul pachet</dt><dd>{tedPaused?'după reluarea fluxului':t.inFlight?'în curs':nextAt&&nextAt>now?time(nextAt):'la următoarea verificare a colectorului'}</dd></div>
      <div><dt>Pachete arhivate</dt><dd>{fmt(t.packages)} · {fmt(t.notices)} atribuiri românești</dd></div>
      <div><dt>Verificări cu căutarea TED</dt><dd>{fmt(t.matched)} identice{t.gaps>0?` · ${fmt(t.gaps)} cu diferențe`:''}</dd></div>
     </dl>
     {tedPaused&&paused.includes('ted')&&<p className="historical-note">TED e pus pe pauză{t.failedAttempt?` după ultima încercare eșuată (${ojs(t.failedAttempt)})`:''}. Motivul e în jurnal; reia fluxul „Atribuiri TED (UE)” după termen.</p>}
     <p className="historical-note">Numerele rămase sunt estimate din zilele lucrătoare de la ultimul număr arhivat.</p>
    </>}
   </article>
  </div>
 </section>;
}
