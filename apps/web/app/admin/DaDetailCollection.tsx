import type {CollectionStatus} from '@/lib/admin/collection';
import {daDetailForecast} from '../../lib/admin/historical-forecast';
import {duration,finish} from './RecoveryOverview';
const fmt=(v:number)=>new Intl.NumberFormat('ro-RO').format(Math.round(v));
const day=(value:string,year=true)=>new Intl.DateTimeFormat('ro-RO',{day:'numeric',month:year?'long':'short',...(year?{year:'numeric'}:{}),timeZone:'Europe/Bucharest'}).format(new Date(`${value}T12:00:00Z`));
const time=(value:string)=>new Intl.DateTimeFormat('ro-RO',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'}).format(new Date(value));
/** Trafic SEAP · Fluxuri: the item lines of direct awards (owner, 11 November 2026). One detail per accepted
 * award, fetched in the background all day, after the daily collection and through the same request limits.
 * The numbers are requests and awards, not lines: lines appear after the nightly processing. */
export default function DaDetailCollection({data,stale}:{data:CollectionStatus;stale:boolean}){
 const h=data.historical?.daDetails,c=data.control!;
 if(!h)return null;
 const now=new Date(String(c.server_now)).toISOString(),paused=c.paused_streams as string[],f=daDetailForecast(h),w=h.walk;
 const halted=stale||c.paused||!!c.blocked_reason||(c.maintenance&&!c.collection_during_maintenance)||paused.includes('da')||h.lanes===0;
 const started=!!w,caughtUp=started&&f.left===0;
 const state=!started?(h.lastEnqueue?'Probă':'Neînceput'):h.lanes===0?'Oprită':halted?'Pe pauză':caughtUp?'La zi':'În curs';
 const why=c.paused?'Colectarea e pe pauză.':c.blocked_reason?'Colectarea e blocată; vezi motivul sus.':c.maintenance&&!c.collection_during_maintenance?'Mentenanță în curs.':paused.includes('da')?'Fluxul „Achiziții directe” e pe pauză.':h.lanes===0?'Benzile de fundal sunt oprite.':stale?'Starea nu se mai actualizează.':null;
 const peak=Math.max(1,...h.days.map(d=>d.complete));
 const where=!w?null:!w.cursor?`Toate zilele, până la ${day(w.floor)}`:`${w.cursor.tier===1?'Grupele de produse':'Celelalte achiziții'} · ${day(w.cursor.day)}`;
 return <section className="historical-downloads da-details" aria-labelledby="da-details-title">
  <div className="recovery-heading"><h2 id="da-details-title">Liniile achizițiilor directe</h2><span>Un detaliu pe achiziție acceptată · în fundal, toată ziua</span></div>
  <div className="historical-grid">
   <article className="historical-card" aria-labelledby="da-details-progress">
    <div className="historical-card-heading"><h3 id="da-details-progress">Progres</h3><span className={`badge ${halted&&started&&!caughtUp?'warning':'neutral'}`}>{state}</span></div>
    {!started?<p className="historical-note">{h.lastEnqueue?`Probă programată pe ${time(h.lastEnqueue.at)}: ${fmt(h.lastEnqueue.queued)} achiziții. Descărcarea completă nu e pornită.`:'Descărcarea nu e pornită.'}</p>:<>
     <div className="historical-figure"><strong>{f.percent===null?'—':`≈ ${f.percent}%`}</strong><span>din {fmt(f.total??0)} achiziții acceptate, din {day(w!.floor)} până pe {day(w!.forwardTo)}</span></div>
     {f.percent!==null&&<progress max={100} value={f.percent} aria-label="Progresul descărcării liniilor achizițiilor directe"/>}
     <p className="historical-eta">{caughtUp?'La zi. Achizițiile noi se preiau a doua zi.':halted?`Termen suspendat. ${why??''}`:f.hours===null?'Măsurăm ritmul…':<>≈ {duration(f.hours*60)} rămase · încheiere estimată {finish(now,f.hours*60)}</>}</p>
     <dl>
      <div><dt>Preluate</dt><dd>{fmt(h.complete)}{h.failed>0?` · ${fmt(h.failed)} nepreluate`:''}</dd></div>
      <div><dt>În așteptare</dt><dd>{fmt(h.pending)}{h.running>0?` · ${fmt(h.running)} în curs`:''}</dd></div>
      <div><dt>Încă neprogramate</dt><dd>{fmt(f.unscheduled??0)}</dd></div>
      <div><dt>Unde a ajuns</dt><dd>{where}</dd></div>
      <div><dt>Ritm</dt><dd>{fmt(h.lastHour)} în ultima oră · {fmt(h.lastDay)} în 24 h</dd></div>
      <div><dt>Benzi de fundal</dt><dd>{h.lanes}</dd></div>
      {h.lastEnqueue&&<div><dt>Ultima programare</dt><dd>{time(h.lastEnqueue.at)} · {fmt(h.lastEnqueue.queued)} {h.lastEnqueue.auto?'automat':'de operator'}</dd></div>}
     </dl>
     <p className="historical-note">Ordinea: ultimele 7 zile, apoi grupele de produse (alimente, lemne, hârtie, curățenie), apoi restul, de la cele mai noi. Liniile apar pe site după procesarea de noapte.</p>
    </>}
   </article>
   <article className="historical-card" aria-labelledby="da-details-days">
    <div className="historical-card-heading"><h3 id="da-details-days">Preluate pe zile</h3><span className="subtle">ultimele 14 zile</span></div>
    {h.complete===0?<p className="historical-note">Nicio achiziție preluată încă.</p>:
     <ol className="da-days">{[...h.days].reverse().map(d=><li key={d.day}><span>{day(d.day,false)}</span><i aria-hidden="true">{d.complete>0&&<b style={{width:`${d.complete/peak*100}%`}}/>}</i><strong>{fmt(d.complete)}</strong></li>)}</ol>}
    {!!h.errors.length&&<div className="historical-errors"><h4>Nepreluate, pe cauze</h4><ul>{h.errors.map(e=><li key={e.error}><b>{fmt(e.n)}</b> {e.error}</li>)}</ul></div>}
   </article>
  </div>
 </section>;
}
